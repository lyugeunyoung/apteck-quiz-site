/*
 * Corrects date-relative UI (header date, "오늘 갱신됨"/"갱신 대기" badges)
 * to the viewer's real current moment, client-side.
 *
 * Why this exists: these badges used to be computed at *build* time and
 * baked into the static HTML. That meant every page had to be rebuilt just
 * to keep "오늘" accurate — and the scheduled GitHub Actions sync did
 * exactly that on a timer, producing a commit purely from the date rolling
 * over even when nobody had changed any quiz content
 * (docs/AS-IS.md #5 / PROMPT.md Phase 2 "콘텐츠 변화가 없으면 커밋하지
 * 않는다"). Moving the *presentational* freshness badge here — while the
 * quiz question/answer/explanation text itself stays 100% static — removes
 * that whole class of no-op commits without making any real content
 * JS-dependent.
 *
 * No JS: the server-rendered badge (computed at the last real build) is
 * shown as-is. It's a reasonable fallback, just not self-correcting.
 */
(function () {
  "use strict";

  function todayKST() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  function formatDateKo(dateStr) {
    var parts = String(dateStr || "").split("-");
    if (parts.length !== 3) return dateStr || "";
    return parts[0] + "년 " + parseInt(parts[1], 10) + "월 " + parseInt(parts[2], 10) + "일";
  }

  var today = todayKST();

  var headerDate = document.getElementById("header-date");
  if (headerDate) {
    headerDate.textContent = formatDateKo(today);
    headerDate.setAttribute("datetime", today);
  }

  document.querySelectorAll(".status-pill[data-fresh-date]").forEach(function (pill) {
    var date = pill.getAttribute("data-fresh-date");
    if (!date) return; // 아직 한 번도 등록되지 않은 앱 — 서버 렌더 상태(갱신 대기) 그대로 둔다
    var fresh = date === today;
    pill.classList.toggle("status-pill--fresh", fresh);
    pill.classList.toggle("status-pill--stale", !fresh);
    var textEl = pill.querySelector(".status-pill__text");
    var label = pill.closest(".quiz-hero__statusbar") ? (fresh ? "오늘 갱신됨" : "갱신 대기") : (fresh ? "오늘 업데이트" : "업데이트 대기");
    if (textEl) textEl.textContent = label;
  });
})();
