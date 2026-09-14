/*
 * Automatic Google Sheet → data/quizzes.json sync. Run by
 * .github/workflows/sync-sheet.yml on a schedule (and on-demand via
 * "Run workflow"), never by a human directly — this is what makes editing
 * the sheet alone enough to update the site, with no visit to admin.html.
 *
 * Reads data.site.sheetUrl (set once from admin.html's "🔁 자동 동기화 켜기",
 * or by hand). If it's empty, this is a no-op — the workflow's later
 * `git diff` step will then see no changes and skip the commit.
 *
 * 두 가지 시트 형식을 모두 지원한다:
 *   1) 단순 헤더: date, app_id, question, choice1..4, answer, explanation,
 *      q_image, round_time — app_id로 앱을 찾고, date로 "오늘 행"만 반영.
 *   2) 실사용 형식(괄호 라벨 헤더, app_id 없이 이름으로 구분):
 *      "A (구분/ID)"=앱 표시 이름, "B (question)", "C (answer)",
 *      "D (link)"=참여 링크, "E (explanation)", "F (q_image)",
 *      "G (day)"=회차 메모(선택), "H (custom_title)"=페이지 제목 재정의,
 *      라벨 없는 I/J/K열=대기 문구/홍보 문구/힌트. 이 형식은 date 열이
 *      아예 없어도 되고(행 하나 = "지금 이 순간의 상태"로 취급), app.name
 *      (또는 app.sheetName)으로 앱을 찾는다. templates.resolveSheetApp이
 *      두 형식을 동시에 처리한다.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const templates = require(path.join(root, "assets/js/template.js"));
const dataPath = path.join(root, "data/quizzes.json");

async function main() {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const rawSheetUrl = data.site && data.site.sheetUrl;

  if (!rawSheetUrl) {
    console.log("site.sheetUrl is empty — nothing to sync.");
    return;
  }

  // 편집 주소(.../edit?usp=sharing)가 등록돼 있었던 적이 실제로 있었다 —
  // CSV 내보내기 주소로 정규화해서 사용한다(admin.js와 동일한 로직).
  const sheetUrl = templates.normalizeSheetCsvUrl(rawSheetUrl);
  console.log("Fetching sheet: " + sheetUrl);
  const res = await fetch(sheetUrl);
  if (!res.ok) {
    throw new Error("Failed to fetch sheet (" + res.status + "). Check sharing settings and the URL.");
  }
  const text = await res.text();
  const rows = templates.csvToObjects(text);
  console.log("Parsed " + rows.length + " sheet row(s).");

  const today = templates.todayKST();

  const errors = validateRows(rows, data.apps, today, templates);
  if (errors.length) {
    console.log("::error::시트 데이터에 문제가 있어 이번 동기화를 건너뜁니다 (아무것도 반영되지 않음):");
    errors.forEach((e) => console.log("  - " + e));
    process.exit(1);
  }

  let touched = 0;

  data.apps.forEach((app) => {
    const changed = (app.roundSchedule && app.roundSchedule.length)
      ? syncMultiRoundApp(app, rows, today, templates)
      : syncSingleRoundApp(app, rows, today, templates);
    if (changed) touched++;
  });

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");
  console.log("Synced. " + touched + " app(s) had a matching sheet row for " + today + ".");
}

/*
 * Rejects the whole run (no partial write) if the sheet has data that would
 * silently corrupt the site: an app_id typo, a malformed date, a today's-row
 * with a question but no answer, or a round_time that doesn't match the
 * app's actual schedule. One bad row must not be allowed to write the other
 * 20 apps' good rows either — so this checks everything up front and only
 * proceeds if the whole sheet is clean.
 */
// "2026-13-99" passes a digit-shape regex like /^\d{4}-\d{2}-\d{2}$/ but
// isn't a real date (month 13, day 99) — round-trip through Date to catch
// out-of-range month/day, not just wrong digit counts.
function isValidCalendarDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return false;
  const year = parseInt(m[1], 10), month = parseInt(m[2], 10), day = parseInt(m[3], 10);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function validateRows(rows, apps, today, templates) {
  const errors = [];
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // +1 for header row, +1 for 1-based
    const norm = templates.normalizeSheetRow(row);
    const shownId = templates.sheetAppId(norm) || norm["구분/id"] || norm.name || "";
    const label = "행 " + rowNum + " (\"" + shownId + "\")";

    const app = templates.resolveSheetApp(norm, apps);
    if (!app) {
      // 앱을 못 찾는 건 20여 개 앱이 함께 있는 실사용 시트에서 흔히,
      // 계속 벌어지는 정상 상황이다 — 안내/예시용 빈 행이거나, 아직
      // data/quizzes.json에 등록 안 된 앱일 수 있다. 이 한 행 때문에
      // 나머지 모든 앱의 정상 반영을 막지 않는다(경고만 남기고 건너뜀).
      if (shownId) console.log("  (참고) " + label + ": 일치하는 앱 없음 — 이 행은 건너뜀(아직 등록 안 된 앱이거나 이름 철자 차이일 수 있음).");
      return;
    }
    if (norm.date && !isValidCalendarDate(norm.date)) {
      errors.push(label + ": date가 YYYY-MM-DD 형식의 실제 날짜가 아닙니다 (\"" + norm.date + "\").");
    }
    if (norm.round_time && !timeRe.test(norm.round_time)) {
      errors.push(label + ": round_time 형식이 HH:MM이 아닙니다 (\"" + norm.round_time + "\").");
    }

    var isMultiRound = !!(app.roundSchedule && app.roundSchedule.length);
    if (isMultiRound && norm.round_time && timeRe.test(norm.round_time)) {
      var validTimes = app.roundSchedule.map((s) => s.time);
      if (validTimes.indexOf(norm.round_time) === -1) {
        errors.push(label + ": round_time \"" + norm.round_time + "\"은(는) 이 앱의 회차(" + validTimes.join(", ") + ")에 없습니다.");
      }
    }

    // date 열이 있는(예전 방식) 시트에서 "오늘 행"인데 문제는 있고 정답이
    // 비어 있으면 실수로 본다. date 열 자체가 없는(실사용) 시트는 한 앱당
    // 행 하나가 "지금 상태"를 나타내므로, 정답이 아직 공개 전인 게 정상
    // 상태라 여기서 막지 않는다(row.date가 없으면 이 조건 자체가 성립 안 함).
    if (norm.date === today && norm.question && norm.question.trim() && !(norm.answer && norm.answer.trim())) {
      errors.push(label + ": 문제는 있는데 정답이 비어 있습니다.");
    }
  });

  return errors;
}

// date 열이 있는 행은 그 날짜가 오늘과 같을 때만, date 열이 아예 없는
// 행(실사용 시트)은 항상 "지금 상태"로 취급한다.
function rowIsCurrentlyRelevant(row, today) {
  return !row.date || row.date === today;
}

function syncSingleRoundApp(app, rows, today, templates) {
  const row = rows
    .map((r) => templates.normalizeSheetRow(r))
    .find((r) => templates.resolveSheetApp(r, [app]) === app && rowIsCurrentlyRelevant(r, today));
  if (!row) return false;

  const nextToday = templates.computeSingleRoundToday(row, today);
  const prev = app.today;
  const deeplinkChanged = row.link && row.link.trim() && row.link.trim() !== app.appDeeplink;
  if (templates.isSameSingleRoundToday(prev, nextToday) && !deeplinkChanged) return false;

  // Archive the previous day's Q&A the same way admin.js does on save.
  if (prev && prev.date && prev.date !== today && prev.question) {
    app.history = app.history || [];
    app.history.unshift({ date: prev.date, question: prev.question, answer: prev.answer, explanation: prev.explanation });
    app.history = app.history.slice(0, templates.HISTORY_LIMIT);
  }

  app.today = nextToday;
  app.updatedAt = today;
  if (deeplinkChanged) app.appDeeplink = row.link.trim();
  console.log("  updated (single-round): " + app.id);
  return true;
}

function syncMultiRoundApp(app, rows, today, templates) {
  const normalized = rows.map((r) => templates.normalizeSheetRow(r));
  const matches = normalized.filter((r) => templates.resolveSheetApp(r, [app]) === app && rowIsCurrentlyRelevant(r, today) && r.round_time);
  if (!matches.length) return false;

  const isToday = app.today && app.today.date === today;
  const prevRounds = isToday ? (app.today.rounds || []) : [];
  const nextRounds = templates.computeMultiRoundToday(app, matches, today, prevRounds);
  if (isToday && templates.isSameMultiRoundToday(prevRounds, nextRounds)) return false;

  if (app.today && app.today.date && app.today.date !== today && app.today.rounds && app.today.rounds.length) {
    app.history = app.history || [];
    app.history.unshift({ date: app.today.date, rounds: app.today.rounds });
    app.history = app.history.slice(0, templates.HISTORY_LIMIT);
  }

  app.today = { date: today, rounds: nextRounds };
  app.updatedAt = today;
  console.log("  updated (multi-round, " + matches.length + " round row(s)): " + app.id);
  return true;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
