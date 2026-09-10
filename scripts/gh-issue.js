/*
 * Minimal GitHub Issues REST helper shared by scripts/check-freshness.js and
 * scripts/check-links.js — both want the same "find-or-create, auto-close
 * when clear" behavior so a stale/broken-link report doesn't spam a brand
 * new issue every single scheduled run, and cleans itself up once the
 * underlying problem is gone (no one has to remember to close it by hand).
 *
 * Uses the Actions-provided GITHUB_TOKEN (workflow needs `issues: write`)
 * and GITHUB_REPOSITORY ("owner/repo"), both set automatically in
 * GitHub Actions. Running locally without GITHUB_TOKEN just logs and skips
 * the GitHub calls — never throws, so `node scripts/check-*.js` still works
 * for a manual local check.
 */
async function ghApi(pathSuffix, opts) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const res = await fetch("https://api.github.com/repos/" + repo + pathSuffix, Object.assign({
    headers: Object.assign({
      Authorization: "token " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }, (opts && opts.headers) || {})
  }, opts));
  if (!res.ok) throw new Error("GitHub API " + pathSuffix + " -> " + res.status + " " + (await res.text()));
  return res.status === 204 ? null : res.json();
}

async function findOpenIssue(label, title) {
  const issues = await ghApi("/issues?state=open&labels=" + encodeURIComponent(label) + "&per_page=20", { method: "GET" });
  return issues.find((i) => i.title === title) || null;
}

/*
 * bodyFn() should return the issue body string when there's a problem to
 * report, or null when everything is clean. label/title identify "the one
 * standing issue for this check" so re-runs update it in place instead of
 * piling up duplicates.
 */
async function upsertIssue({ label, title, bodyFn, closedComment }) {
  if (!process.env.GITHUB_TOKEN) {
    console.log("GITHUB_TOKEN 없음 — 로컬 실행으로 간주, 이슈 생성/갱신은 생략합니다.");
    return;
  }
  const existing = await findOpenIssue(label, title);
  const body = bodyFn();

  if (body === null) {
    if (existing) {
      await ghApi("/issues/" + existing.number + "/comments", { method: "POST", body: JSON.stringify({ body: closedComment }) });
      await ghApi("/issues/" + existing.number, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
      console.log("문제가 해소되어 이슈(#" + existing.number + ")를 자동으로 닫았습니다.");
    } else {
      console.log("문제 없음 — 만들 이슈가 없습니다.");
    }
    return;
  }

  if (existing) {
    await ghApi("/issues/" + existing.number, { method: "PATCH", body: JSON.stringify({ body: body }) });
    console.log("기존 이슈(#" + existing.number + ") 내용을 최신 상태로 갱신했습니다.");
  } else {
    const created = await ghApi("/issues", { method: "POST", body: JSON.stringify({ title: title, body: body, labels: [label] }) });
    console.log("새 이슈(#" + created.number + ")를 생성했습니다.");
  }
}

module.exports = { ghApi, findOpenIssue, upsertIssue };
