/*
 * Phase 7 미갱신 감시 — 매일 KST 밤 늦게(.github/workflows/check-freshness.yml)
 * "오늘 데이터가 없는 앱"을 찾아 GitHub Issue로 알린다. 관리자가 그날 깜빡
 * 잊고 입력하지 않은 앱을 사람이 매번 수동으로 확인하지 않아도 되게 한다.
 *
 * 회차 앱은 그날의 회차 스케줄 전부에 정답이 채워졌을 때만 "갱신됨"으로
 * 본다 — 워크플로가 하루의 마지막 회차(20시) 이후에 도는 것을 전제로 하므로
 * 이 시점엔 모든 회차가 끝나 있어야 정상이다.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const templates = require(path.join(root, "assets/js/template.js"));
const { upsertIssue } = require(path.join(root, "scripts/gh-issue.js"));

const LABEL = "automated-freshness";
const TITLE = "⚠️ 오늘 갱신되지 않은 퀴즈 앱";

function appIsFreshToday(app, today) {
  if (app.roundSchedule && app.roundSchedule.length) {
    if (!app.today || app.today.date !== today || !app.today.rounds) return false;
    return app.roundSchedule.every((sched) => {
      const r = app.today.rounds.find((x) => x.time === sched.time);
      return !!(r && r.answer && r.answer.trim());
    });
  }
  return !!(app.today && app.today.date === today && app.today.answer && app.today.answer.trim());
}

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(root, "data/quizzes.json"), "utf8"));
  const today = templates.todayKST();
  const stale = data.apps.filter((a) => !appIsFreshToday(a, today));

  console.log("오늘(" + today + ") 기준 미갱신 앱: " + stale.length + "개 / 전체 " + data.apps.length + "개");
  stale.forEach((a) => console.log("  - " + a.id + " (" + a.name + ")"));

  await upsertIssue({
    label: LABEL,
    title: TITLE,
    bodyFn: () => {
      if (!stale.length) return null;
      return (
        "**" + today + "** 기준, 아래 " + stale.length + "개 앱이 아직 오늘 데이터로 갱신되지 않았습니다.\n\n" +
        stale.map((a) => "- [ ] `" + a.id + "` — " + a.name).join("\n") +
        "\n\n[관리자 페이지](../../admin.html)에서 직접 입력하거나, 구글 시트 자동 동기화가 정상 동작 중인지 확인해 주세요.\n" +
        "이 이슈는 모든 앱이 갱신되면 다음 실행 때 자동으로 닫힙니다."
      );
    },
    closedComment: "✅ " + today + " 기준 전체 앱이 갱신되어 자동으로 닫습니다."
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
