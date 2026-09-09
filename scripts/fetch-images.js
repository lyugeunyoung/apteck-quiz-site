/*
 * Image asset pipeline (PROMPT.md Phase 2). Google Drive is not an image
 * CDN — hotlinked Drive URLs can go dark under load or if the file is ever
 * moved/re-permissioned, silently breaking every past page that used them.
 *
 * This script keeps the admin workflow unchanged (paste a Drive link, done)
 * but promotes the *serving* path to the repo itself: it scans
 * data/quizzes.json for any today.imageUrl / round.imageUrl that is still
 * an external http(s) URL, downloads it, re-encodes it as WebP (max width
 * 1200px, only ever downscaled) via sharp, writes it to
 * assets/img/quiz/{app-id}/{date}.webp (or {date}-{HHMM}.webp per round),
 * and rewrites the JSON field to that repo-relative path — along with the
 * real width/height so template.js can set exact <img> dimensions (CLS).
 *
 * Run order in the workflow: sync-sheet.js → fetch-images.js → build.js.
 * It also picks up images saved via admin.html directly (that path can't
 * run sharp client-side), since it just scans whatever is currently in
 * data/quizzes.json regardless of how it got there.
 *
 * Failure handling: a failed download/convert for one image is logged as a
 * GitHub Actions warning and that image's URL is left untouched (falls back
 * to serving the original Drive link) — one bad image never blocks the
 * whole run.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const templates = require(path.join(root, "assets/js/template.js"));
const dataPath = path.join(root, "data/quizzes.json");
const MAX_WIDTH = 1200;

let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  console.log("sharp 모듈이 없습니다 (package.json 미설치?) — 이미지 자산화를 건너뜁니다.");
  process.exit(0);
}

async function convertOne(rawUrl, destRelPath) {
  const res = await fetch(rawUrl);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const img = sharp(buf).rotate(); // rotate(): normalize EXIF orientation
  const meta = await img.metadata();
  const resize = meta.width && meta.width > MAX_WIDTH ? { width: MAX_WIDTH } : null;
  const pipeline = resize ? img.resize(resize) : img;
  const outBuf = await pipeline.webp({ quality: 82 }).toBuffer();
  const outMeta = await sharp(outBuf).metadata();

  const destPath = path.join(root, destRelPath);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, outBuf);
  return { width: outMeta.width, height: outMeta.height };
}

async function processImage(app, rawUrl, fileSuffix) {
  if (!rawUrl || !templates.isExternalUrl(rawUrl)) return null; // empty, or already localized
  const normalized = templates.convertDriveLink(rawUrl);
  const destRel = "assets/img/quiz/" + app.id + "/" + fileSuffix + ".webp";
  try {
    const dims = await convertOne(normalized, destRel);
    console.log("  이미지 자산화: " + app.id + "/" + fileSuffix + ".webp (" + dims.width + "x" + dims.height + ")");
    return { path: destRel, width: dims.width, height: dims.height };
  } catch (e) {
    console.log("::warning::" + app.id + " (" + fileSuffix + ") 이미지 다운로드/변환 실패 — 원본 링크를 그대로 사용합니다: " + e.message);
    return null;
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  let touched = 0;

  for (const app of data.apps) {
    if (app.roundSchedule && app.roundSchedule.length) {
      if (!app.today || !app.today.rounds) continue;
      for (const round of app.today.rounds) {
        const suffix = app.today.date + "-" + round.time.replace(":", "");
        const result = await processImage(app, round.imageUrl, suffix);
        if (result) {
          round.imageUrl = result.path;
          round.imageWidth = result.width;
          round.imageHeight = result.height;
          touched++;
        }
      }
    } else {
      if (!app.today) continue;
      const result = await processImage(app, app.today.imageUrl, app.today.date);
      if (result) {
        app.today.imageUrl = result.path;
        app.today.imageWidth = result.width;
        app.today.imageHeight = result.height;
        touched++;
      }
    }
  }

  if (touched > 0) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");
  }
  console.log("이미지 자산화 완료: " + touched + "개 처리됨.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
