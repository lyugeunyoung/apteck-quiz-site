/*
 * Local build script — regenerates index.html and every pages/*.html from
 * data/quizzes.json using the shared template engine. Run this any time you
 * hand-edit data/quizzes.json directly instead of going through admin.html.
 *
 *   node scripts/build.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const templates = require(path.join(root, "assets/js/template.js"));

const data = JSON.parse(fs.readFileSync(path.join(root, "data/quizzes.json"), "utf8"));

fs.writeFileSync(path.join(root, "index.html"), templates.renderIndexPage(data));
console.log("wrote index.html");

for (const app of data.apps) {
  const html = templates.renderAppPage(app, data);
  fs.writeFileSync(path.join(root, "pages", app.page), html);
  console.log("wrote pages/" + app.page);
}

fs.writeFileSync(path.join(root, "sitemap.xml"), templates.renderSitemap(data));
console.log("wrote sitemap.xml");

fs.writeFileSync(path.join(root, "feed.xml"), templates.renderFeed(data));
console.log("wrote feed.xml");

console.log("\n빌드 완료: " + (data.apps.length + 1) + "개 페이지 생성됨.");
