(function () {
  "use strict";

  var LS_KEY = "apteck-admin-connection";

  var state = {
    owner: "",
    repo: "",
    branch: "main",
    token: "",
    data: null,        // parsed quizzes.json
    dataSha: null,      // current sha of data/quizzes.json
    selectedId: null,   // app id currently loaded in the form, or null = new app
    sheetUrl: "",
    sheetRows: [],       // parsed rows from the Google Sheet CSV, if loaded
    multiRoundApp: null, // the selected app object when it has a roundSchedule, else null
  };

  var el = {};
  [
    "f-owner", "f-repo", "f-branch", "f-token", "f-remember", "btn-connect", "connect-status",
    "card-sheet", "f-sheet-url", "btn-sheet-load", "sheet-status",
    "card-apps", "app-table", "app-search", "btn-new-app",
    "card-form", "form-title", "sheet-match", "new-app-fields", "f-selected-id", "category-options",
    "f-id", "f-emoji", "f-category", "f-schedule", "f-name", "f-reward", "f-deeplink", "f-path",
    "f-date", "single-round-fields", "multi-round-fields",
    "f-question", "f-image", "btn-convert-drive", "image-preview",
    "choices-editor", "btn-add-choice", "f-answer", "f-explanation",
    "btn-save", "save-status", "card-preview", "preview-frame"
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  // ---------------------------------------------------------------- utils

  function b64EncodeUtf8(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64DecodeUtf8(b64) {
    return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
  }
  function todayISO() {
    return QuizTemplates.todayKST();
  }
  function setStatus(node, text, kind) {
    node.textContent = text;
    node.className = "status-line show status-line--" + kind;
  }
  function clearStatus(node) {
    node.className = "status-line";
  }

  // ---------------------------------------------------------- GitHub calls

  function apiBase() {
    return "https://api.github.com/repos/" + state.owner + "/" + state.repo + "/contents/";
  }

  function ghHeaders() {
    return {
      "Authorization": "token " + state.token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  // Returns { sha, text } or null if the file does not exist yet.
  async function ghGetFile(path) {
    var res = await fetch(apiBase() + encodeURI(path) + "?ref=" + encodeURIComponent(state.branch), {
      headers: ghHeaders()
    });
    if (res.status === 404) return null;
    if (!res.ok) throw await ghError(res);
    var json = await res.json();
    return { sha: json.sha, text: b64DecodeUtf8(json.content) };
  }

  async function ghPutFile(path, content, sha, message) {
    var body = {
      message: message,
      content: b64EncodeUtf8(content),
      branch: state.branch
    };
    if (sha) body.sha = sha;
    var res = await fetch(apiBase() + encodeURI(path), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw await ghError(res);
    var json = await res.json();
    return json.content.sha;
  }

  async function ghError(res) {
    var msg = "GitHub API 오류 (" + res.status + ")";
    try {
      var j = await res.json();
      if (j && j.message) msg += ": " + j.message;
    } catch (e) {}
    if (res.status === 401) msg = "토큰이 올바르지 않거나 만료되었습니다. Personal Access Token을 다시 확인해 주세요.";
    if (res.status === 404) msg = "저장소 또는 파일을 찾을 수 없습니다. 사용자명/저장소명/브랜치를 확인해 주세요.";
    if (res.status === 403) msg += " (권한 부족 — 토큰에 Contents: Read and write 권한이 있는지 확인하세요)";
    if (res.status === 409) msg = "저장 충돌이 발생했습니다. 다른 곳에서 방금 수정되었을 수 있습니다. 다시 '불러오기'를 눌러 최신 상태를 가져온 뒤 재시도하세요.";
    return new Error(msg);
  }

  // ------------------------------------------------------------- connect

  function loadSavedConnection() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      el["f-owner"].value = saved.owner || "";
      el["f-repo"].value = saved.repo || "";
      el["f-branch"].value = saved.branch || "main";
      el["f-token"].value = saved.token || "";
      el["f-remember"].checked = !!saved.token;
    } catch (e) {}
  }

  function persistConnectionIfRequested() {
    if (el["f-remember"].checked) {
      localStorage.setItem(LS_KEY, JSON.stringify({
        owner: state.owner, repo: state.repo, branch: state.branch, token: state.token
      }));
    } else {
      localStorage.removeItem(LS_KEY);
    }
  }

  el["btn-connect"].addEventListener("click", async function () {
    state.owner = el["f-owner"].value.trim();
    state.repo = el["f-repo"].value.trim();
    state.branch = el["f-branch"].value.trim() || "main";
    state.token = el["f-token"].value.trim();

    if (!state.owner || !state.repo || !state.token) {
      setStatus(el["connect-status"], "사용자명, 저장소, 토큰을 모두 입력해 주세요.", "err");
      return;
    }

    setStatus(el["connect-status"], "data/quizzes.json 불러오는 중...", "busy");
    try {
      var file = await ghGetFile("data/quizzes.json");
      if (!file) throw new Error("data/quizzes.json 파일을 찾지 못했습니다. 저장소에 초기 데이터가 커밋되어 있는지 확인하세요.");
      state.data = JSON.parse(file.text);
      state.dataSha = file.sha;
      persistConnectionIfRequested();
      setStatus(el["connect-status"], "연결됨 · 앱 " + state.data.apps.length + "개 불러옴", "ok");
      renderAppTable();
      el["card-sheet"].style.display = "";
      el["card-apps"].style.display = "";
    } catch (e) {
      setStatus(el["connect-status"], e.message || String(e), "err");
    }
  });

  // ------------------------------------------------------ google sheets

  var SHEET_LS_KEY = "apteck-admin-sheet-url";

  // Minimal RFC 4180 CSV parser — handles quoted fields, embedded commas/
  // newlines, and "" escaped quotes, which a naive split(",") would break on
  // (해설 text routinely contains commas).
  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i], next = text[i + 1];
      if (inQuotes) {
        if (c === '"' && next === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\r") {
        // skip
      } else if (c === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
      } else {
        field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function csvToObjects(text) {
    var rows = parseCsv(text).filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });
    if (!rows.length) return [];
    var headers = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    return rows.slice(1).map(function (r) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = (r[i] || "").trim(); });
      return obj;
    });
  }

  function sheetAppId(row) { return row.app_id || row.id || row.appid || ""; }

  function findSheetRow(appId, date) {
    return state.sheetRows.filter(function (r) { return sheetAppId(r) === appId && r.date === date; })[0] || null;
  }
  function findLatestSheetRow(appId) {
    var rows = state.sheetRows.filter(function (r) { return sheetAppId(r) === appId; });
    rows.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    return rows[0] || null;
  }

  (function loadSavedSheetUrl() {
    try { el["f-sheet-url"].value = localStorage.getItem(SHEET_LS_KEY) || ""; } catch (e) {}
  })();

  el["btn-sheet-load"].addEventListener("click", async function () {
    var url = el["f-sheet-url"].value.trim();
    if (!url) {
      setStatus(el["sheet-status"], "시트 CSV 주소를 입력해 주세요.", "err");
      return;
    }
    setStatus(el["sheet-status"], "시트 불러오는 중...", "busy");
    try {
      var res = await fetch(url);
      if (!res.ok) throw new Error("시트를 불러오지 못했습니다 (" + res.status + "). 공유 설정과 주소를 확인해 주세요.");
      var text = await res.text();
      var rows = csvToObjects(text);
      if (!rows.length) throw new Error("시트에서 데이터를 찾지 못했습니다. 첫 줄이 헤더(date, app_id, question...)인지 확인해 주세요.");
      state.sheetRows = rows;
      try { localStorage.setItem(SHEET_LS_KEY, url); } catch (e) {}
      var todayCount = rows.filter(function (r) { return r.date === todayISO(); }).length;
      setStatus(el["sheet-status"], "✅ " + rows.length + "개 행 불러옴 (오늘 날짜 행 " + todayCount + "개). 이제 아래에서 앱을 선택하면 자동으로 매칭됩니다.", "ok");
      updateSheetMatchBanner();
    } catch (e) {
      setStatus(el["sheet-status"], e.message || String(e), "err");
    }
  });

  function updateSheetMatchBanner() {
    if (!el["sheet-match"]) return;
    if (state.multiRoundApp) {
      // The CSV format is one question/answer per row — it doesn't model
      // the 3-round shape, so sheet import only applies to single-round apps.
      el["sheet-match"].style.display = "none";
      return;
    }
    if (!state.sheetRows.length || state.selectedId === null) {
      el["sheet-match"].style.display = "none";
      return;
    }
    var todayRow = findSheetRow(state.selectedId, todayISO());
    var latestRow = todayRow || findLatestSheetRow(state.selectedId);
    if (!latestRow) {
      el["sheet-match"].style.display = "none";
      return;
    }
    var label = todayRow
      ? "📄 시트에서 오늘(" + latestRow.date + ") 행을 찾았습니다."
      : "📄 시트에 오늘 날짜 행은 없지만, 가장 최근(" + latestRow.date + ") 행을 찾았습니다.";
    el["sheet-match"].style.display = "flex";
    el["sheet-match"].innerHTML =
      "<span>" + escapeText(label) + "</span>" +
      '<button type="button" class="btn btn--primary btn--small" id="sheet-apply-btn" style="width:auto;">이 값으로 채우기</button>';
    document.getElementById("sheet-apply-btn").addEventListener("click", function () {
      applySheetRow(latestRow);
    });
  }

  function applySheetRow(row) {
    el["f-question"].value = row.question || "";
    var choices = [row.choice1, row.choice2, row.choice3, row.choice4].filter(function (c) { return c && c.trim(); });
    renderChoicesEditor(choices);
    el["f-answer"].value = row.answer || "";
    el["f-explanation"].value = row.explanation || "";
    if (row.image_url || row.image || row.imageurl) {
      el["f-image"].value = row.image_url || row.image || row.imageurl;
      updateImagePreview();
    }
    // The row's own "date" column is only used to pick which row matches —
    // the saved date is always today's date regardless (see f-date).
    updatePreview();
    el["sheet-match"].style.display = "none";
  }

  // ---------------------------------------------------------- app table

  function renderAppTable() {
    var today = todayISO();
    var q = (el["app-search"].value || "").trim().toLowerCase();
    el["app-table"].innerHTML = "";
    state.data.apps
      .filter(function (app) { return !q || app.name.toLowerCase().indexOf(q) !== -1; })
      .forEach(function (app) {
        var fresh = app.today && app.today.date === today;
        var row = document.createElement("button");
        row.type = "button";
        row.className = "app-row";
        row.innerHTML =
          '<span class="app-row__badge">' + (app.emoji || "🎯") + "</span>" +
          '<span class="app-row__name">' + escapeText(app.name) + "</span>" +
          '<span class="app-row__date">' + (fresh ? "🟢 " : "⚪️ ") + (app.today ? app.today.date : "미등록") + "</span>";
        row.addEventListener("click", function () { loadAppIntoForm(app.id); });
        el["app-table"].appendChild(row);
      });

    var cats = Array.from(new Set(state.data.apps.map(function (a) { return a.category; }).filter(Boolean)));
    el["category-options"].innerHTML = cats.map(function (c) { return '<option value="' + escapeText(c) + '">'; }).join("");
  }

  el["app-search"].addEventListener("input", function () { if (state.data) renderAppTable(); });

  function escapeText(s) { return QuizTemplates.escapeHtml(s); }

  // -------------------------------------------------------------- form

  el["btn-new-app"].addEventListener("click", function () { loadAppIntoForm(null); });

  function loadAppIntoForm(id) {
    state.selectedId = id;
    var isNew = id === null;
    var app = isNew ? {} : appById(id);
    var isMultiRound = !isNew && !!(app.roundSchedule && app.roundSchedule.length);
    state.multiRoundApp = isMultiRound ? app : null;

    el["new-app-fields"].style.display = isNew ? "" : "none";
    el["form-title"].textContent = isNew ? "4. 새 퀴즈 앱 추가" : "4. 오늘의 퀴즈 입력 — " + app.name;

    var today = (app && app.today) || {};

    el["f-selected-id"].value = id || "";
    el["f-id"].value = "";
    el["f-emoji"].value = app.emoji || "";
    el["f-category"].value = app.category || "";
    el["f-schedule"].value = app.schedule || "매일 진행";
    el["f-name"].value = app.name || "";
    el["f-reward"].value = app.rewardHint || "";
    el["f-deeplink"].value = app.appDeeplink || "";
    el["f-path"].value = app.participatePath || "";

    el["f-date"].value = todayISO();

    if (isMultiRound) {
      el["single-round-fields"].style.display = "none";
      el["multi-round-fields"].style.display = "";
      el["multi-round-fields"].innerHTML = renderMultiRoundFieldsHTML(app);
      wireMultiRoundFields(app);
      fillMultiRoundFields(app);
    } else {
      el["single-round-fields"].style.display = "";
      el["multi-round-fields"].style.display = "none";
      el["multi-round-fields"].innerHTML = "";
      el["f-question"].value = isNew ? "" : (today.question || "");
      el["f-answer"].value = isNew ? "" : (today.answer || "");
      el["f-explanation"].value = isNew ? "" : (today.explanation || "");
      el["f-image"].value = isNew ? "" : (today.imageUrl || "");
      updateImagePreview();
      renderChoicesEditor((today.choices || []).slice());
    }

    el["card-form"].style.display = "";
    el["card-preview"].style.display = "";
    clearStatus(el["save-status"]);
    el["card-form"].scrollIntoView({ behavior: "smooth", block: "start" });
    updatePreview();
    updateSheetMatchBanner();
  }

  // -------------------------------------------------------- multi-round
  // (앱마다 오전/오후/저녁처럼 하루 여러 회차를 갖는 경우, 예: 카카오뱅크 AI
  // 이모지 퀴즈. app.roundSchedule 이 있으면 자동으로 이 UI가 뜬다.)

  function roundFieldId(idx, name) { return "f-round-" + idx + "-" + name; }

  function renderMultiRoundFieldsHTML(app) {
    return app.roundSchedule.map(function (sched, idx) {
      return (
        '<div class="admin-card" style="margin:0 0 14px;box-shadow:none;">' +
        '<h2 style="font-size:14px;color:var(--accent-strong);">🕐 ' + escapeText(sched.label) + " 회차</h2>" +
        '<div class="field"><label for="' + roundFieldId(idx, "question") + '">문제</label>' +
        '<textarea id="' + roundFieldId(idx, "question") + '" placeholder="' + escapeText(sched.label) + ' 문제를 입력하세요"></textarea></div>' +
        '<div class="field"><label for="' + roundFieldId(idx, "image") + '">문제 이미지 URL (선택)</label>' +
        '<div class="choices-editor__row">' +
        '<input id="' + roundFieldId(idx, "image") + '" type="text" placeholder="https://drive.google.com/...">' +
        '<button class="btn btn--ghost btn--small" type="button" data-round-convert="' + idx + '" style="flex:none;width:auto;padding:0 12px;">변환</button>' +
        "</div>" +
        '<img id="' + roundFieldId(idx, "image-preview") + '" alt="이미지 미리보기" style="display:none;max-width:180px;margin-top:8px;border-radius:8px;border:1px solid var(--border);">' +
        "</div>" +
        '<div class="field"><label for="' + roundFieldId(idx, "choices") + '">보기 (쉼표로 구분 — 객관식이 아니면 비워두세요)</label>' +
        '<input id="' + roundFieldId(idx, "choices") + '" type="text" placeholder="① 서울, ② 부산"></div>' +
        '<div class="field"><label for="' + roundFieldId(idx, "answer") + '">정답</label>' +
        '<input id="' + roundFieldId(idx, "answer") + '" type="text" placeholder="예: ② 부산"></div>' +
        '<div class="field" style="margin-bottom:0;"><label for="' + roundFieldId(idx, "explanation") + '">정답 해설</label>' +
        '<textarea id="' + roundFieldId(idx, "explanation") + '" placeholder="왜 이 답이 맞는지 설명해 주세요"></textarea></div>' +
        "</div>"
      );
    }).join("");
  }

  function wireMultiRoundFields(app) {
    app.roundSchedule.forEach(function (sched, idx) {
      var img = document.getElementById(roundFieldId(idx, "image"));
      var preview = document.getElementById(roundFieldId(idx, "image-preview"));
      var convertBtn = document.querySelector('[data-round-convert="' + idx + '"]');

      function refreshPreview() {
        var url = img.value.trim() ? QuizTemplates.convertDriveLink(img.value.trim()) : "";
        if (url) { preview.src = url; preview.style.display = ""; } else { preview.style.display = "none"; }
      }
      img.addEventListener("input", function () { refreshPreview(); updatePreview(); });
      convertBtn.addEventListener("click", function () {
        img.value = QuizTemplates.convertDriveLink(img.value.trim());
        refreshPreview();
        updatePreview();
      });
      ["question", "choices", "answer", "explanation"].forEach(function (name) {
        document.getElementById(roundFieldId(idx, name)).addEventListener("input", updatePreview);
      });
    });
  }

  function fillMultiRoundFields(app) {
    // Only prefill from rounds already saved TODAY. If the app's stored
    // "today" is actually yesterday (or older) — i.e. nobody has saved
    // anything for this new day yet — every round starts blank instead of
    // silently carrying forward an answer that hasn't been asked yet today.
    var isToday = !!(app.today && app.today.date === todayISO());
    var todayRounds = isToday ? (app.today.rounds || []) : [];
    app.roundSchedule.forEach(function (sched, idx) {
      var match = todayRounds.filter(function (r) { return r.time === sched.time; })[0] || {};
      document.getElementById(roundFieldId(idx, "question")).value = match.question || "";
      document.getElementById(roundFieldId(idx, "image")).value = match.imageUrl || "";
      document.getElementById(roundFieldId(idx, "choices")).value = (match.choices || []).join(", ");
      document.getElementById(roundFieldId(idx, "answer")).value = match.answer || "";
      document.getElementById(roundFieldId(idx, "explanation")).value = match.explanation || "";
      document.getElementById(roundFieldId(idx, "image")).dispatchEvent(new Event("input"));
    });
  }

  function buildRoundsFromForm(roundSchedule) {
    return roundSchedule.map(function (sched, idx) {
      return {
        time: sched.time,
        label: sched.label,
        question: document.getElementById(roundFieldId(idx, "question")).value.trim(),
        imageUrl: QuizTemplates.convertDriveLink(document.getElementById(roundFieldId(idx, "image")).value.trim()),
        choices: document.getElementById(roundFieldId(idx, "choices")).value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
        answer: document.getElementById(roundFieldId(idx, "answer")).value.trim(),
        explanation: document.getElementById(roundFieldId(idx, "explanation")).value.trim()
      };
    });
  }

  function appById(id) {
    return state.data.apps.filter(function (a) { return a.id === id; })[0];
  }

  function renderChoicesEditor(choices) {
    el["choices-editor"].innerHTML = "";
    choices.forEach(addChoiceRow);
  }

  function addChoiceRow(value) {
    var row = document.createElement("div");
    row.className = "choices-editor__row";
    var input = document.createElement("input");
    input.type = "text";
    input.value = value || "";
    input.placeholder = "예: ① 서울";
    input.addEventListener("input", updatePreview);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn";
    btn.textContent = "✕";
    btn.addEventListener("click", function () { row.remove(); updatePreview(); });
    row.appendChild(input);
    row.appendChild(btn);
    el["choices-editor"].appendChild(row);
  }

  el["btn-add-choice"].addEventListener("click", function () { addChoiceRow(""); });

  function currentChoices() {
    return Array.prototype.map.call(el["choices-editor"].querySelectorAll("input"), function (i) { return i.value.trim(); })
      .filter(Boolean);
  }

  function updateImagePreview() {
    var raw = el["f-image"].value.trim();
    var url = raw ? QuizTemplates.convertDriveLink(raw) : "";
    if (url) {
      el["image-preview"].src = url;
      el["image-preview"].style.display = "";
    } else {
      el["image-preview"].style.display = "none";
    }
  }
  el["f-image"].addEventListener("input", function () { updateImagePreview(); updatePreview(); });
  el["btn-convert-drive"].addEventListener("click", function () {
    el["f-image"].value = QuizTemplates.convertDriveLink(el["f-image"].value.trim());
    updateImagePreview();
    updatePreview();
  });

  function buildAppFromForm() {
    var isNew = state.selectedId === null;
    var previousApp = isNew ? null : appById(state.selectedId);
    var base = isNew ? {} : Object.assign({}, previousApp);

    if (isNew) {
      base.id = el["f-id"].value.trim();
      base.page = base.id + ".html";
      base.history = [];
      base.createdAt = todayISO();
    } else {
      base.history = (previousApp.history || []).slice();
    }
    base.emoji = el["f-emoji"].value.trim() || "🎯";
    base.category = el["f-category"].value.trim() || "기타";
    base.schedule = el["f-schedule"].value.trim() || "매일 진행";
    base.name = el["f-name"].value.trim();
    base.rewardHint = el["f-reward"].value.trim();
    base.appDeeplink = el["f-deeplink"].value.trim() || "#";
    base.participatePath = el["f-path"].value.trim();

    // Always the day this is actually saved on — never editable, never a
    // stale value from a form left open across midnight.
    var date = todayISO();
    base.updatedAt = date;

    if (state.multiRoundApp) {
      // Archive yesterday's full round set (오전/오후/저녁) before overwriting.
      if (previousApp && previousApp.today && previousApp.today.date && previousApp.today.date !== date && previousApp.today.rounds && previousApp.today.rounds.length) {
        base.history.unshift({ date: previousApp.today.date, rounds: previousApp.today.rounds });
        base.history = base.history.slice(0, QuizTemplates.HISTORY_LIMIT);
      }
      base.today = { date: date, rounds: buildRoundsFromForm(base.roundSchedule) };
    } else {
      // Archive the previous day's Q&A before overwriting "today" so the
      // page's "지난 정답 모음" section (and long-tail date searches) keep
      // building up instead of losing yesterday's answer on every save.
      if (previousApp && previousApp.today && previousApp.today.date && previousApp.today.date !== date && previousApp.today.question) {
        base.history.unshift({
          date: previousApp.today.date,
          question: previousApp.today.question,
          answer: previousApp.today.answer,
          explanation: previousApp.today.explanation
        });
        base.history = base.history.slice(0, QuizTemplates.HISTORY_LIMIT);
      }
      base.today = {
        date: date,
        imageUrl: QuizTemplates.convertDriveLink(el["f-image"].value.trim()),
        question: el["f-question"].value.trim(),
        choices: currentChoices(),
        answer: el["f-answer"].value.trim(),
        explanation: el["f-explanation"].value.trim()
      };
    }
    return base;
  }

  function updatePreview() {
    if (!state.data) return;
    try {
      var app = buildAppFromForm();
      var tempData = Object.assign({}, state.data, {
        apps: state.selectedId === null ? state.data.apps.concat([app]) : state.data.apps.map(function (a) { return a.id === app.id ? app : a; })
      });
      // admin.html sits at the project root, one level above pages/*.html —
      // strip the "../" prefixes renderAppPage uses for that deeper path so
      // the preview iframe (served from the same root) resolves assets.
      var html = QuizTemplates.renderAppPage(app, tempData).replace(/(href|src)="\.\.\//g, '$1="');
      el["preview-frame"].srcdoc = html;
    } catch (e) { /* form incomplete — ignore until save */ }
  }

  ["f-emoji", "f-category", "f-schedule", "f-name", "f-reward", "f-deeplink", "f-path",
   "f-question", "f-answer", "f-explanation"].forEach(function (id) {
    el[id].addEventListener("input", updatePreview);
  });

  // -------------------------------------------------------------- save

  el["btn-save"].addEventListener("click", async function () {
    var isNew = state.selectedId === null;

    if (isNew) {
      var newId = el["f-id"].value.trim();
      if (!/^[a-z0-9-]+$/.test(newId)) {
        setStatus(el["save-status"], "앱 ID는 영문 소문자, 숫자, 하이픈(-)만 사용해 주세요.", "err");
        return;
      }
      if (appById(newId)) {
        setStatus(el["save-status"], "이미 존재하는 앱 ID입니다.", "err");
        return;
      }
    }
    if (!el["f-name"].value.trim()) {
      setStatus(el["save-status"], "앱 이름은 필수입니다.", "err");
      return;
    }
    if (!state.multiRoundApp && (!el["f-question"].value.trim() || !el["f-answer"].value.trim())) {
      setStatus(el["save-status"], "문제와 정답은 필수입니다.", "err");
      return;
    }

    el["btn-save"].disabled = true;
    var app = buildAppFromForm();

    try {
      setStatus(el["save-status"], "data/quizzes.json 최신 상태 다시 확인 중...", "busy");
      var latest = await ghGetFile("data/quizzes.json");
      state.data = JSON.parse(latest.text);
      state.dataSha = latest.sha;

      if (isNew) {
        state.data.apps.push(app);
      } else {
        state.data.apps = state.data.apps.map(function (a) { return a.id === app.id ? app : a; });
      }

      var dateStr = app.today.date;
      var commitMsg = (isNew ? "앱테크: " : "퀴즈 갱신: ") + app.name + " (" + dateStr + ")";

      setStatus(el["save-status"], "data/quizzes.json 저장 중...", "busy");
      state.dataSha = await ghPutFile("data/quizzes.json", JSON.stringify(state.data, null, 2), state.dataSha, commitMsg);

      setStatus(el["save-status"], "퀴즈 상세 페이지(pages/" + app.page + ") 저장 중...", "busy");
      var pagePath = "pages/" + app.page;
      var existingPage = await ghGetFile(pagePath);
      var pageHtml = QuizTemplates.renderAppPage(app, state.data);
      await ghPutFile(pagePath, pageHtml, existingPage ? existingPage.sha : null, commitMsg);

      setStatus(el["save-status"], "홈 화면(index.html) 저장 중...", "busy");
      var existingIndex = await ghGetFile("index.html");
      var indexHtml = QuizTemplates.renderIndexPage(state.data);
      await ghPutFile("index.html", indexHtml, existingIndex ? existingIndex.sha : null, commitMsg);

      setStatus(el["save-status"], "sitemap.xml 저장 중...", "busy");
      var existingSitemap = await ghGetFile("sitemap.xml");
      var sitemapXml = QuizTemplates.renderSitemap(state.data);
      await ghPutFile("sitemap.xml", sitemapXml, existingSitemap ? existingSitemap.sha : null, commitMsg);

      setStatus(el["save-status"], "feed.xml 저장 중...", "busy");
      var existingFeed = await ghGetFile("feed.xml");
      var feedXml = QuizTemplates.renderFeed(state.data);
      await ghPutFile("feed.xml", feedXml, existingFeed ? existingFeed.sha : null, commitMsg);

      setStatus(el["save-status"], "✅ 저장 완료! GitHub Pages 반영까지 보통 1분 이내 걸립니다.", "ok");
      renderAppTable();
      if (isNew) loadAppIntoForm(app.id);
    } catch (e) {
      setStatus(el["save-status"], "❌ " + (e.message || String(e)), "err");
    } finally {
      el["btn-save"].disabled = false;
    }
  });

  // -------------------------------------------------------------- boot

  loadSavedConnection();
})();
