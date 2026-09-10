/*
 * Phase 7 주간 헬스체크 — 참여 딥링크(app.appDeeplink)와 아직 WebP로
 * 자산화되지 않은 외부 이미지 URL(today.imageUrl / round.imageUrl)의 응답
 * 상태를 확인한다. 저장소에 이미 커밋된 로컬 WebP(assets/img/quiz/...)는
 * 네트워크 확인 대상이 아니다 — 이미 저장소에 있으므로 링크가 죽을 일이
 * 없다. 여전히 외부 URL로 남아있는 것(자산화가 실패했거나 아직 한 번도
 * fetch-images.js를 못 거친 것)만 확인한다.
 *
 * .github/workflows/check-links.yml에서 주 1회 실행. 결과는
 * scripts/gh-issue.js의 find-or-create 패턴으로 이슈에 남긴다.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const templates = require(path.join(root, "assets/js/template.js"));
const { upsertIssue } = require(path.join(root, "scripts/gh-issue.js"));

const LABEL = "automated-link-health";
const TITLE = "🔗 주간 링크/이미지 헬스체크 — 응답 이상 발견";

async function checkUrl(url) {
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      // 일부 서버가 HEAD를 막아두는 경우 GET으로 재시도.
      res = await fetch(url, { method: "GET", redirect: "follow" });
    }
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function collectTargets(data) {
  const targets = [];
  data.apps.forEach((app) => {
    if (app.appDeeplink && /^https?:\/\//.test(app.appDeeplink)) {
      targets.push({ label: app.id + " 참여 링크", url: app.appDeeplink });
    }
    const imageEntries = [];
    if (app.roundSchedule && app.roundSchedule.length) {
      ((app.today && app.today.rounds) || []).forEach((r) => imageEntries.push({ label: app.id + " " + r.label + " 이미지", url: r.imageUrl }));
    } else if (app.today) {
      imageEntries.push({ label: app.id + " 이미지", url: app.today.imageUrl });
    }
    imageEntries.forEach((entry) => {
      if (entry.url && templates.isExternalUrl(entry.url)) targets.push(entry);
    });
  });
  return targets;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(root, "data/quizzes.json"), "utf8"));
  const targets = collectTargets(data);
  console.log("점검 대상: " + targets.length + "건");

  const broken = [];
  for (const t of targets) {
    const result = await checkUrl(t.url);
    console.log((result.ok ? "OK   " : "FAIL ") + t.label + " (" + result.status + (result.error ? " " + result.error : "") + ") " + t.url);
    if (!result.ok) broken.push(Object.assign({}, t, result));
  }

  await upsertIssue({
    label: LABEL,
    title: TITLE,
    bodyFn: () => {
      if (!broken.length) return null;
      return (
        "총 " + targets.length + "건 중 " + broken.length + "건이 정상 응답을 받지 못했습니다.\n\n" +
        broken.map((b) => "- [ ] " + b.label + " — HTTP " + b.status + (b.error ? " (" + b.error + ")" : "") + "\n  " + b.url).join("\n") +
        "\n\n참여 링크는 앱 URL이 바뀌었는지, 이미지는 구글드라이브 공유 설정이 풀렸는지 확인해 주세요.\n" +
        "이 이슈는 다음 주간 점검에서 모두 정상으로 확인되면 자동으로 닫힙니다."
      );
    },
    closedComment: "✅ 재점검 결과 모두 정상 응답으로 확인되어 자동으로 닫습니다."
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
