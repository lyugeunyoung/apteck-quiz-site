/*
 * Phase 6 자동 검증 — PROMPT.md §4.1의 10개 항목을 빌드 산출물(index.html,
 * pages/*.html, sitemap.xml, feed.xml)에 대해 프로그램으로 확인한다.
 * `npm test`로 실행. 실패(FAIL) 항목이 하나라도 있으면 exit 1.
 *
 * 일부 항목(#2의 네이버/구글 인증 메타)은 실제 소유확인 코드가 아직 발급되지
 * 않아(site.naverSiteVerification/googleSiteVerification이 빈 값) 지금은
 * "확인할 대상 자체가 없는" 상태다. 이런 경우 거짓으로 PASS 처리하지 않고
 * SKIP으로 표시해 리포트에 남긴다 — 실제로 값이 채워진 뒤 재실행하면 그때
 * 정말로 검증된다.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const templates = require(path.join(root, "assets/js/template.js"));
const data = JSON.parse(fs.readFileSync(path.join(root, "data/quizzes.json"), "utf8"));

const pageFiles = ["index.html"].concat(data.apps.map((a) => "pages/" + a.page));
const pages = pageFiles.map((f) => ({ file: f, html: fs.readFileSync(path.join(root, f), "utf8") }));

const results = [];
function report(id, title, status, detail) {
  results.push({ id, title, status, detail });
}

function stripScripts(html) {
  return html.replace(/<script[\s\S]*?<\/script>/g, "");
}

// ---- 1. 정답 문자열이 정적 텍스트로 존재 (JS 없이) ----
(function check1() {
  const fails = [];
  data.apps.forEach((app) => {
    const pageHtml = pages.find((p) => p.file === "pages/" + app.page).html;
    const bodyNoScript = stripScripts(pageHtml);
    const isMultiRound = !!(app.roundSchedule && app.roundSchedule.length);
    const answers = isMultiRound
      ? (app.today && app.today.rounds ? app.today.rounds.map((r) => r.answer).filter(Boolean) : [])
      : (app.today && app.today.answer ? [app.today.answer] : []);
    answers.forEach((a) => {
      const escaped = templates.escapeHtml(a);
      if (!bodyNoScript.includes(escaped)) fails.push(app.id + ": \"" + a + "\" 미발견");
    });
  });
  report(1, "정답이 정적 텍스트로 존재(JS 불필요)", fails.length ? "fail" : "pass", fails.join("; "));
})();

// ---- 2. title/description/canonical/OG 6종/네이버·구글 인증 메타 존재+고유 ----
(function check2() {
  const fails = [];
  const titles = new Set(), descs = new Set(), canonicals = new Set();
  pages.forEach((p) => {
    const title = (p.html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const desc = (p.html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
    const canonical = (p.html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    if (!title) fails.push(p.file + ": title 없음");
    if (!desc) fails.push(p.file + ": description 없음");
    if (!canonical) fails.push(p.file + ": canonical 없음");
    ["og:type", "og:site_name", "og:title", "og:description", "og:url", "og:image"].forEach((prop) => {
      if (!new RegExp('<meta property="' + prop + '"').test(p.html)) fails.push(p.file + ": " + prop + " 없음");
    });
    if (title) { if (titles.has(title)) fails.push(p.file + ": title 중복(\"" + title + "\")"); titles.add(title); }
    if (desc) { if (descs.has(desc)) fails.push(p.file + ": description 중복"); descs.add(desc); }
    if (canonical) { if (canonicals.has(canonical)) fails.push(p.file + ": canonical 중복"); canonicals.add(canonical); }
  });

  const verifyNotes = [];
  ["naverSiteVerification", "googleSiteVerification"].forEach((key) => {
    if (!data.site[key]) { verifyNotes.push(key + " 미설정(스킵 — 값이 생기면 재검증됨)"); return; }
    const metaName = key === "naverSiteVerification" ? "naver-site-verification" : "google-site-verification";
    pages.forEach((p) => {
      if (!p.html.includes('<meta name="' + metaName + '" content="' + data.site[key] + '">')) {
        fails.push(p.file + ": " + metaName + " 메타 누락/불일치");
      }
    });
  });

  var status = fails.length ? "fail" : (verifyNotes.length ? "skip" : "pass");
  var detail = fails.join("; ") + (verifyNotes.length ? (fails.length ? " | " : "") + verifyNotes.join("; ") : "");
  report(2, "title/description/canonical/OG 6종/소유확인 메타", status, detail);
})();

// ---- 3. JSON-LD 유효성 + 필수 필드 + 본문 텍스트 일치 ----
(function check3() {
  const fails = [];
  pages.forEach((p) => {
    const blocks = Array.from(p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)).map((m) => m[1]);
    if (!blocks.length) { fails.push(p.file + ": JSON-LD 없음"); return; }
    blocks.forEach((raw, i) => {
      let obj;
      try { obj = JSON.parse(raw); } catch (e) { fails.push(p.file + " [" + i + "]: JSON 파싱 실패(" + e.message + ")"); return; }
      const type = obj["@type"];
      if (!type) { fails.push(p.file + " [" + i + "]: @type 없음"); return; }
      const required = {
        WebSite: ["name", "url"],
        Organization: ["name", "url"],
        ItemList: ["itemListElement"],
        FAQPage: ["mainEntity"],
        Article: ["headline", "description", "datePublished", "dateModified"],
        BreadcrumbList: ["itemListElement"]
      }[type] || [];
      required.forEach((field) => { if (obj[field] === undefined || obj[field] === null) fails.push(p.file + " " + type + ": 필드 \"" + field + "\" 누락"); });

      if (type === "FAQPage") {
        const bodyNoScript = stripScripts(p.html);
        (obj.mainEntity || []).forEach((q) => {
          if (!q.name || !q.acceptedAnswer || !q.acceptedAnswer.text) { fails.push(p.file + " FAQPage: 항목 필드 누락"); return; }
          if (!bodyNoScript.includes(templates.escapeHtml(q.name))) fails.push(p.file + " FAQPage: 질문 \"" + q.name + "\"이 본문에 없음");
        });
      }
    });
  });
  report(3, "JSON-LD 유효성·필수필드·본문 일치", fails.length ? "fail" : "pass", fails.join("; "));
})();

// ---- 4. h1 정확히 1개, heading 위계에 건너뜀 없음 ----
(function check4() {
  const fails = [];
  pages.forEach((p) => {
    const noScript = stripScripts(p.html);
    const headings = Array.from(noScript.matchAll(/<h([1-6])[ >]/g)).map((m) => parseInt(m[1], 10));
    const h1Count = headings.filter((h) => h === 1).length;
    if (h1Count !== 1) fails.push(p.file + ": h1 " + h1Count + "개(1개여야 함)");
    for (let i = 1; i < headings.length; i++) {
      if (headings[i] > headings[i - 1] + 1) {
        fails.push(p.file + ": h" + headings[i - 1] + " 다음 h" + headings[i] + "로 건너뜀");
      }
    }
  });
  report(4, "h1 1개 + heading 위계 건너뜀 없음", fails.length ? "fail" : "pass", fails.join("; "));
})();

// ---- 5. 모든 img에 alt/width/height ----
(function check5() {
  const fails = [];
  pages.forEach((p) => {
    Array.from(stripScripts(p.html).matchAll(/<img\b[^>]*>/g)).forEach((m) => {
      const tag = m[0];
      ["alt", "width", "height"].forEach((attr) => {
        if (!new RegExp(attr + '="').test(tag)) fails.push(p.file + ": img 태그에 " + attr + " 없음 (" + tag.slice(0, 60) + "...)");
      });
    });
  });
  report(5, "모든 img에 alt·width·height", fails.length ? "fail" : "pass", fails.join("; "));
})();

// ---- 6. sitemap.xml/feed.xml URL 실재 + lastmod/pubDate 유효 ----
(function check6() {
  const fails = [];
  const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  const feed = fs.readFileSync(path.join(root, "feed.xml"), "utf8");
  const knownFiles = new Set(pageFiles.map((f) => f === "index.html" ? "" : f.replace(/^pages\//, "pages/")));

  Array.from(sitemap.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]*)<\/lastmod>)?<\/url>/g)).forEach((m) => {
    const loc = m[1], lastmod = m[2];
    const rel = loc.replace(data.site.baseUrl + "/", "");
    if (rel !== "" && !knownFiles.has(rel)) fails.push("sitemap: " + loc + " 이 실제 페이지 파일과 매칭 안 됨");
    if (!lastmod || !/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) fails.push("sitemap: " + loc + " lastmod 형식 오류(\"" + lastmod + "\")");
  });

  Array.from(feed.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)).forEach((m) => {
    if (isNaN(Date.parse(m[1]))) fails.push("feed: pubDate 파싱 불가(\"" + m[1] + "\")");
  });
  Array.from(feed.matchAll(/<link>([^<]+)<\/link>/g)).forEach((m) => {
    const rel = m[1].replace(data.site.baseUrl + "/", "");
    if (rel !== "" && !knownFiles.has(rel)) fails.push("feed: " + m[1] + " 이 실제 페이지 파일과 매칭 안 됨");
  });

  report(6, "sitemap/feed URL 실재 + lastmod/pubDate 유효", fails.length ? "fail" : "pass", fails.join("; "));
})();

// ---- 7. 내부 링크 깨짐 0건, baseUrl 하드코딩 잔재 0건 ----
(function check7() {
  const fails = [];
  const validHrefs = new Set(["index.html", "privacy.html", "terms.html", "about.html"]
    .concat(data.apps.map((a) => a.page))
    .concat(data.apps.map((a) => "pages/" + a.page)));

  pages.forEach((p) => {
    const isTopLevel = p.file === "index.html";
    // <a href> 만 확인한다 — <link href="...css/manifest/icon">는 내비게이션
    // 링크가 아니라 자산 참조라 같은 검사 대상이 아니다(자산 경로는 존재
    // 여부가 아니라 baseUrl 하드코딩 여부만 아래에서 별도로 본다).
    Array.from(stripScripts(p.html).matchAll(/<a\b[^>]*\bhref="([^"#][^"]*)"/g)).forEach((m) => {
      let href = m[1];
      if (href.indexOf(data.site.baseUrl + "/") === 0) {
        href = href.slice((data.site.baseUrl + "/").length); // 절대경로 자체 사이트 링크는 상대경로처럼 검사
      } else if (/^https?:\/\/|^mailto:/.test(href)) {
        return; // 그 외 외부/메일 링크는 대상 아님
      }
      const normalized = href.replace(/^\.\.\//, "");
      if (!validHrefs.has(normalized) && !(isTopLevel && validHrefs.has(href)) && !fs.existsSync(path.join(root, normalized))) {
        fails.push(p.file + ": 내부 링크 대상 불명 (" + m[1] + ")");
      }
    });
    // baseUrl을 "../" 상대경로 대신 그대로 하드코딩한 자산 참조(css/js)가
    // 남아있으면 페이지 깊이가 바뀔 때 깨진다 — 페이지 자체 URL(og:url,
    // canonical, JSON-LD @id 등 의도된 절대경로)은 제외하고 자산 경로만 확인.
    Array.from(p.html.matchAll(/(?:href|src)="([^"]*assets\/[^"]*)"/g)).forEach((m) => {
      if (m[1].indexOf(data.site.baseUrl) === 0) fails.push(p.file + ": 자산 경로에 baseUrl 하드코딩 (" + m[1] + ")");
    });
  });
  report(7, "내부 링크 깨짐 0건 + baseUrl 하드코딩 잔재 0건", fails.length ? "fail" : "pass", fails.join("; "));
})();

// ---- 8. 광고 슬롯 개수 ≤4, 각 슬롯 min-height 지정 ----
(function check8() {
  const fails = [];
  const css = fs.readFileSync(path.join(root, "assets/css/style.css"), "utf8");
  const hasMinHeight = /\.ad-slot\s*\{[^}]*min-height\s*:\s*\d/.test(css);
  if (!hasMinHeight) fails.push("assets/css/style.css의 .ad-slot에 min-height 없음");

  pages.forEach((p) => {
    const count = (stripScripts(p.html).match(/class="ad-slot/g) || []).length;
    if (count > 4) fails.push(p.file + ": 광고 슬롯 " + count + "개(상한 4 초과)");
  });
  report(8, "광고 슬롯 ≤4개 + min-height 지정", fails.length ? "fail" : "pass", fails.join("; "));
})();

// ---- 9. 페이지별 고정 서술 콘텐츠 800자 이상 ----
(function check9() {
  const fails = [];
  pages.forEach((p) => {
    const text = stripScripts(p.html).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 800) fails.push(p.file + ": " + text.length + "자(800자 미만)");
  });
  report(9, "고정 서술 콘텐츠 800자 이상", fails.length ? "fail" : "pass", fails.join("; "));
})();

// ---- 10. admin.html이 robots.txt와 메타 양쪽에서 차단 ----
(function check10() {
  const fails = [];
  const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
  const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  if (!/Disallow:\s*\/admin\.html/.test(robots)) fails.push("robots.txt에 admin.html Disallow 없음");
  if (!/<meta name="robots" content="[^"]*noindex[^"]*nofollow/.test(admin)) fails.push("admin.html에 noindex,nofollow 메타 없음");
  report(10, "admin.html이 robots.txt+메타 양쪽에서 차단", fails.length ? "fail" : "pass", fails.join("; "));
})();

// ---- 출력 ----
console.log("\n=== scripts/verify.js — Phase 6 자동 검증 (10개 항목) ===\n");
let failCount = 0, skipCount = 0, passCount = 0;
results.forEach((r) => {
  const icon = r.status === "pass" ? "✅" : r.status === "skip" ? "⏭️ " : "❌";
  console.log(icon + " #" + r.id + " " + r.title + (r.status !== "pass" && r.detail ? "\n     → " + r.detail : ""));
  if (r.status === "fail") failCount++;
  else if (r.status === "skip") skipCount++;
  else passCount++;
});
console.log("\n" + passCount + "/" + results.length + " PASS, " + failCount + " FAIL, " + skipCount + " SKIP(설정값 미등록으로 검증 대상 없음)");

if (failCount > 0) {
  console.log("::error::verify.js 실패 항목 " + failCount + "건 — 통과할 때까지 수정 필요");
  process.exit(1);
}
console.log("모든 항목 통과.");
