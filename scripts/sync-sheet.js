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
 * Sheet columns (header row, any order):
 *   date, app_id, question, choice1, choice2, choice3, choice4,
 *   answer, explanation, image_url, round_time
 * round_time (08:00 / 12:00 / 20:00 form) only matters for apps that have
 * a roundSchedule (multi-round apps, e.g. 카카오뱅크 AI 이모지 퀴즈) — a row
 * for such an app without a matching round_time is ignored.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const templates = require(path.join(root, "assets/js/template.js"));
const dataPath = path.join(root, "data/quizzes.json");

async function main() {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const sheetUrl = data.site && data.site.sheetUrl;

  if (!sheetUrl) {
    console.log("site.sheetUrl is empty — nothing to sync.");
    return;
  }

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
  const appIds = new Set(apps.map((a) => a.id));
  const appById = Object.fromEntries(apps.map((a) => [a.id, a]));
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // +1 for header row, +1 for 1-based
    const appId = templates.sheetAppId(row);
    const label = "행 " + rowNum + " (app_id=\"" + appId + "\")";

    if (!appId) {
      errors.push(label + ": app_id가 비어 있습니다.");
      return;
    }
    if (!appIds.has(appId)) {
      errors.push(label + ": data/quizzes.json에 없는 app_id입니다 (오타 확인).");
      return;
    }
    if (row.date && !isValidCalendarDate(row.date)) {
      errors.push(label + ": date가 YYYY-MM-DD 형식의 실제 날짜가 아닙니다 (\"" + row.date + "\").");
    }
    if (row.round_time && !timeRe.test(row.round_time)) {
      errors.push(label + ": round_time 형식이 HH:MM이 아닙니다 (\"" + row.round_time + "\").");
    }

    var app = appById[appId];
    var isMultiRound = !!(app.roundSchedule && app.roundSchedule.length);
    if (isMultiRound && row.round_time && timeRe.test(row.round_time)) {
      var validTimes = app.roundSchedule.map((s) => s.time);
      if (validTimes.indexOf(row.round_time) === -1) {
        errors.push(label + ": round_time \"" + row.round_time + "\"은(는) 이 앱의 회차(" + validTimes.join(", ") + ")에 없습니다.");
      }
    }

    // Only rows for today actually get applied this run, so only those are
    // held to "정답 공백" — a blank answer on a past/future-dated row isn't
    // acted on yet and shouldn't block an otherwise-clean sync.
    if (row.date === today && row.question && row.question.trim() && !(row.answer && row.answer.trim())) {
      errors.push(label + ": 문제는 있는데 정답이 비어 있습니다.");
    }
  });

  return errors;
}

function syncSingleRoundApp(app, rows, today, templates) {
  const row = rows.find((r) => templates.sheetAppId(r) === app.id && r.date === today);
  if (!row) return false;

  const nextToday = templates.computeSingleRoundToday(row, today);
  const prev = app.today;
  if (templates.isSameSingleRoundToday(prev, nextToday)) return false;

  // Archive the previous day's Q&A the same way admin.js does on save.
  if (prev && prev.date && prev.date !== today && prev.question) {
    app.history = app.history || [];
    app.history.unshift({ date: prev.date, question: prev.question, answer: prev.answer, explanation: prev.explanation });
    app.history = app.history.slice(0, templates.HISTORY_LIMIT);
  }

  app.today = nextToday;
  app.updatedAt = today;
  console.log("  updated (single-round): " + app.id);
  return true;
}

function syncMultiRoundApp(app, rows, today, templates) {
  const matches = rows.filter((r) => templates.sheetAppId(r) === app.id && r.date === today && r.round_time);
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
