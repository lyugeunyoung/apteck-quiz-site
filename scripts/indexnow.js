/*
 * IndexNow ping — tells Bing/Yandex (the engines that actually support the
 * IndexNow protocol) that sitemap.xml's URLs changed, so they can recrawl
 * sooner instead of waiting for their own schedule. Google and Naver do NOT
 * support IndexNow (docs/DECISIONS.md #7) — they still rely on sitemap.xml
 * crawling and, for Naver, the separate Search Advisor process in Phase 5.
 *
 * Run by .github/workflows/sync-sheet.yml right after a real commit lands.
 * If data.site.indexNowKey is empty, this is a no-op (same safe-default
 * pattern as sync-sheet.js's site.sheetUrl check) — nothing breaks for a
 * fork/clone that hasn't set up its own key.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(root, "data/quizzes.json"), "utf8"));
  const key = data.site && data.site.indexNowKey;
  const baseUrl = data.site && data.site.baseUrl;

  if (!key) {
    console.log("site.indexNowKey is empty — skipping IndexNow ping.");
    return;
  }

  const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  const urls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
  if (!urls.length) {
    console.log("No URLs found in sitemap.xml — skipping IndexNow ping.");
    return;
  }

  const host = new URL(baseUrl).host;
  const body = {
    host,
    key,
    keyLocation: baseUrl + "/" + key + ".txt",
    urlList: urls
  };

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body)
    });
    console.log("IndexNow ping: " + urls.length + " URL(s) submitted, status " + res.status);
    if (!res.ok) {
      console.log("::warning::IndexNow가 " + res.status + "을 반환했습니다(치명적이지 않음, 다음 실행에 재시도됨).");
    }
  } catch (err) {
    // Never fail the workflow over an indexing nudge — the site itself is
    // already correct and published; this is a best-effort bonus signal.
    console.log("::warning::IndexNow 요청 실패(무시하고 계속): " + err.message);
  }
}

main();
