/*
 * Isomorphic HTML renderers — the single source of truth for every page's
 * markup. Runs in Node (scripts/build.js, initial seed) and in the browser
 * (assets/js/admin.js, live re-publish on save) so generated pages never
 * drift from what the CMS writes.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.QuizTemplates = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var HISTORY_LIMIT = 14;

  // Minimal RFC 4180 CSV parser — handles quoted fields, embedded commas/
  // newlines, and "" escaped quotes, which a naive split(",") would break on
  // (해설 text routinely contains commas). Shared by admin.js (browser, the
  // manual "시트 불러오기" button) and scripts/sync-sheet.js (Node, the
  // scheduled GitHub Actions auto-sync) so both read a sheet identically.
  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i], next = text[i + 1];
      if (inQuotes) {
        if (c === '"' && next === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\r") {
        // skip
      } else if (c === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
      } else {
        field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function csvToObjects(text) {
    var rows = parseCsv(text).filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });
    if (!rows.length) return [];
    var headers = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    return rows.slice(1).map(function (r) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = (r[i] || "").trim(); });
      return obj;
    });
  }

  function sheetAppId(row) { return row.app_id || row.id || row.appid || ""; }

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function nl2p(str) {
    var lines = String(str == null ? "" : str).split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    return lines.map(function (l) { return escapeHtml(l); }).join("<br>");
  }

  function todayKST() {
    var fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
    return fmt.format(new Date()); // YYYY-MM-DD
  }

  function formatDateKo(dateStr) {
    if (!dateStr) return "미등록";
    var parts = String(dateStr).split("-");
    if (parts.length !== 3) return dateStr;
    return parts[0] + "년 " + parseInt(parts[1], 10) + "월 " + parseInt(parts[2], 10) + "일";
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return "";
    var parts = String(dateStr).split("-");
    if (parts.length !== 3) return dateStr;
    return parseInt(parts[1], 10) + "." + parseInt(parts[2], 10);
  }

  // "9월 4일" — no year. Matches how real top-ranking pages (위키트리,
  // 게임톡 등) title these "오늘의 정답" articles; a search for "정답 9월4일"
  // or "정답 오늘" never includes the year, so keeping it out saves title
  // characters without losing any match value.
  function formatDateMD(dateStr) {
    if (!dateStr) return "";
    var parts = String(dateStr).split("-");
    if (parts.length !== 3) return dateStr;
    return parseInt(parts[1], 10) + "월 " + parseInt(parts[2], 10) + "일";
  }

  function isFresh(app) {
    return !!(app.today && app.today.date === todayKST());
  }

  function categories(apps) {
    var seen = [];
    apps.forEach(function (a) { if (a.category && seen.indexOf(a.category) === -1) seen.push(a.category); });
    return seen;
  }

  function pickRelated(app, allApps, n) {
    var others = allApps.filter(function (a) { return a.id !== app.id; });
    var sameCat = others.filter(function (a) { return a.category === app.category; });
    var rest = others.filter(function (a) { return a.category !== app.category; });
    return sameCat.concat(rest).slice(0, n || 3);
  }

  /*
   * Google Drive share links (…/file/d/ID/view?usp=sharing, …open?id=ID)
   * are not directly loadable as <img src>. Rewrite them to the
   * lh3.googleusercontent.com thumbnail form, which Google serves as a
   * plain image response and is the most hotlink-reliable of the known
   * public forms. Anything that isn't a recognizable Drive URL is
   * returned unchanged (already a direct image URL).
   */
  function convertDriveLink(url) {
    var u = String(url == null ? "" : url).trim();
    if (!u) return "";
    if (/lh3\.googleusercontent\.com\/d\//.test(u)) return u;
    var m = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
      u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m && m[1] && /drive\.google\.com/.test(u)) {
      return "https://lh3.googleusercontent.com/d/" + m[1] + "=w1200";
    }
    return u;
  }

  function isDriveLink(url) {
    return /drive\.google\.com|lh3\.googleusercontent\.com/.test(String(url || ""));
  }

  function isExternalUrl(url) {
    return /^https?:\/\//i.test(String(url || ""));
  }

  /*
   * Phase 2 image pipeline: scripts/fetch-images.js downloads external
   * (Drive) image URLs and commits them as local WebP files under
   * assets/img/quiz/, rewriting the stored value to that repo-relative
   * path (e.g. "assets/img/quiz/toss-luck/2026-09-04.webp" — no leading
   * "../", same convention as CSS/JS asset paths elsewhere). This resolves
   * it for an <img src> on an actual page, which always lives one level
   * deep under pages/: an external URL passes through convertDriveLink()
   * unchanged; a local path gets the page's basePrefix ("../") prepended.
   * If the pipeline ever fails to download an image, the stored value
   * stays an external URL and this function keeps serving that directly —
   * the fallback PROMPT.md Phase 2 asks for, with no special-casing needed
   * here.
   */
  function resolveImagePath(url, basePrefix) {
    var u = String(url == null ? "" : url).trim();
    if (!u) return "";
    if (isExternalUrl(u)) return convertDriveLink(u);
    return (basePrefix || "") + u;
  }

  // Same idea but always returns an absolute URL — for og:image, which
  // social crawlers require to be absolute regardless of which page it's on.
  function absoluteImageUrl(url, siteBaseUrl) {
    var u = String(url == null ? "" : url).trim();
    if (!u) return "";
    if (isExternalUrl(u)) return convertDriveLink(u);
    return siteBaseUrl + "/" + u;
  }

  // width/height come from scripts/fetch-images.js's sharp metadata once an
  // image has been localized to WebP (exact, prevents CLS precisely). Until
  // then — a still-external Drive link — we don't know the real dimensions,
  // so fall back to a portrait phone-screenshot ratio (most of these quiz
  // screenshots are portrait mobile captures), which reserves roughly the
  // right amount of space instead of a wrong landscape guess.
  function renderImageFigure(rawUrl, width, height, altText, basePrefix) {
    var resolved = resolveImagePath(rawUrl, basePrefix);
    if (!resolved) return "";
    var w = width || 720;
    var h = height || 1280;
    var hint = isDriveLink(rawUrl)
      ? '<p class="q-image__hint">※ 이미지가 보이지 않으면 구글드라이브 공유 설정이 "링크가 있는 모든 사용자"인지 확인해 주세요.</p>'
      : "";
    return (
      '<figure class="q-image"><img src="' + escapeHtml(resolved) + '" alt="' + escapeHtml(altText) +
      '" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="' + w + '" height="' + h + '"></figure>' +
      hint
    );
  }

  function adSlot(label) {
    return (
      '<div class="ad-slot" aria-hidden="true">' +
      "<!-- AdSense ad unit: replace this div's contents with your <ins class=\"adsbygoogle\"> tag once approved. See README \"광고 붙이기\". -->" +
      escapeHtml(label) +
      "</div>"
    );
  }

  // opts: { title, description, keywords, canonical, siteName, adsensePubId,
  //         cssPath, basePrefix, ogImage, ogType, themeColor,
  //         googleSiteVerification, naverSiteVerification }
  function headBlock(opts) {
    var adsenseTag = opts.adsensePubId
      ? '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
        escapeHtml(opts.adsensePubId) +
        '" crossorigin="anonymous"></script>'
      : "<!-- 애드센스 승인 후 data/quizzes.json 의 site.adsensePubId 값을 채우면 이 위치에 로더 스크립트가 자동 삽입됩니다. -->";
    var verifyTags = "";
    if (opts.googleSiteVerification) {
      verifyTags += '<meta name="google-site-verification" content="' + escapeHtml(opts.googleSiteVerification) + '">\n';
    }
    if (opts.naverSiteVerification) {
      verifyTags += '<meta name="naver-site-verification" content="' + escapeHtml(opts.naverSiteVerification) + '">\n';
    }
    var bp = opts.basePrefix;
    return (
      "<meta charset=\"UTF-8\">\n" +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
      "<title>" + escapeHtml(opts.title) + "</title>\n" +
      '<meta name="description" content="' + escapeHtml(opts.description) + '">\n' +
      (opts.keywords ? '<meta name="keywords" content="' + escapeHtml(opts.keywords) + '">\n' : "") +
      '<meta name="robots" content="index, follow, max-image-preview:large">\n' +
      '<link rel="canonical" href="' + escapeHtml(opts.canonical) + '">\n' +
      verifyTags +
      '<meta property="og:type" content="' + (opts.ogType || "website") + '">\n' +
      '<meta property="og:site_name" content="' + escapeHtml(opts.siteName) + '">\n' +
      '<meta property="og:title" content="' + escapeHtml(opts.title) + '">\n' +
      '<meta property="og:description" content="' + escapeHtml(opts.description) + '">\n' +
      '<meta property="og:url" content="' + escapeHtml(opts.canonical) + '">\n' +
      '<meta property="og:image" content="' + escapeHtml(opts.ogImage) + '">\n' +
      '<meta property="og:locale" content="ko_KR">\n' +
      '<meta name="twitter:card" content="summary_large_image">\n' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
      '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@500;700;900&family=Noto+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">\n' +
      '<link rel="stylesheet" href="' + opts.cssPath + '">\n' +
      '<link rel="manifest" href="' + bp + 'manifest.json">\n' +
      '<meta name="theme-color" content="' + escapeHtml(opts.themeColor || "#2F5CFF") + '">\n' +
      '<link rel="apple-touch-icon" href="' + bp + 'assets/img/icon-180.png">\n' +
      '<link rel="icon" type="image/png" sizes="192x192" href="' + bp + 'assets/img/icon-192.png">\n' +
      '<meta name="apple-mobile-web-app-capable" content="yes">\n' +
      '<meta name="apple-mobile-web-app-title" content="' + escapeHtml(opts.siteName) + '">\n' +
      adsenseTag
    );
  }

  function footerBlock(site) {
    var contactLine = site.contactEmail
      ? '<p>문의: <a href="mailto:' + escapeHtml(site.contactEmail) + '">' + escapeHtml(site.contactEmail) + "</a></p>"
      : "";
    return (
      '<footer class="site-footer">' +
      "<p>" + escapeHtml(site.name) + " · 본 사이트는 각 앱의 이벤트/퀴즈 정보를 정리해 안내하는 개인 정보 제공 사이트이며, 카카오·토스·신한·KB·NH·하나·케이뱅크 등 각 브랜드와 무관합니다.</p>" +
      "<p>실제 참여 가능 여부, 지급 조건, 회차 시간은 각 앱 화면을 최종 기준으로 확인해 주세요. 문제·정답은 변경될 수 있습니다.</p>" +
      contactLine +
      '<p><a href="' + (site.privacyPath || "/privacy.html") + '">개인정보처리방침</a></p>' +
      "</footer>"
    );
  }

  function headerBlock(site, basePrefix) {
    return (
      '<header class="site-header">' +
      '<div class="site-header__row">' +
      '<a class="brand" href="' + basePrefix + 'index.html"><span class="brand__mark">🪙</span>' + escapeHtml(site.name) + "</a>" +
      '<time class="header-date" id="header-date" datetime="">' + formatDateKo(todayKST()) + "</time>" +
      "</div></header>" +
      installBannerBlock()
    );
  }

  function installBannerBlock() {
    return (
      '<div class="install-banner" id="install-banner" hidden>' +
      '<span>📲 홈 화면에 추가하고 매일 아침 바로 접속하세요</span>' +
      '<span class="install-banner__actions">' +
      '<button type="button" id="install-btn" class="btn btn--small install-banner__go">추가하기</button>' +
      '<button type="button" id="install-dismiss" class="icon-btn install-banner__close" aria-label="닫기">✕</button>' +
      "</span></div>"
    );
  }

  function favoriteButtonHTML(appId) {
    return (
      '<button type="button" class="fav-star" data-fav-id="' + escapeHtml(appId) + '" aria-pressed="false" aria-label="즐겨찾기 추가">' +
      '<span class="fav-star__icon">☆</span></button>'
    );
  }

  function shareBarHTML(shareTitle) {
    return (
      '<div class="share-row" data-share-title="' + escapeHtml(shareTitle) + '">' +
      '<button type="button" class="btn btn--ghost btn--small" id="share-native">🔗 공유하기</button>' +
      '<a class="btn btn--ghost btn--small" id="share-band" target="_blank" rel="noopener">밴드로 공유</a>' +
      '<button type="button" class="btn btn--ghost btn--small" id="share-copy">링크 복사</button>' +
      "</div>"
    );
  }

  function quizCardHTML(app, pagePrefix) {
    var fresh = isFresh(app);
    var statusClass = fresh ? "status-pill--fresh" : "status-pill--stale";
    var statusText = fresh ? "오늘 업데이트" : "업데이트 대기";
    var metaText = app.today && app.today.date
      ? formatDateKo(app.today.date) + " 문제 · " + (app.rewardHint || "")
      : "문제 준비 중";
    return (
      '<div class="quiz-card">' +
      favoriteButtonHTML(app.id) +
      '<a class="quiz-card__link" href="' + pagePrefix + escapeHtml(app.page) + '">' +
      '<span class="quiz-card__badge" aria-hidden="true">' + escapeHtml(app.emoji || "🎯") + "</span>" +
      '<span class="quiz-card__body">' +
      '<span class="quiz-card__top"><span class="quiz-card__name">' + escapeHtml(app.name) + "</span></span>" +
      '<span class="quiz-card__meta">' + escapeHtml(metaText) + "</span>" +
      "</span>" +
      '<span class="status-pill ' + statusClass + '" data-fresh-date="' + escapeHtml((app.today && app.today.date) || "") + '"><span class="status-pill__dot"></span><span class="status-pill__text">' + statusText + "</span></span>" +
      "</a></div>"
    );
  }

  function renderIndexPage(data) {
    var site = data.site;
    var apps = data.apps || [];
    var cats = categories(apps);
    var chips = ['<button class="chip" type="button" data-cat="__all" aria-pressed="true">전체</button>',
      '<button class="chip" type="button" data-cat="__fav" aria-pressed="false">⭐ 즐겨찾기</button>']
      .concat(cats.map(function (c) {
        return '<button class="chip" type="button" data-cat="' + escapeHtml(c) + '" aria-pressed="false">' + escapeHtml(c) + "</button>";
      }))
      .join("");

    var cards = apps.map(function (app) {
      return '<div class="card-wrap" data-cat="' + escapeHtml(app.category || "") + '" data-id="' + escapeHtml(app.id) + '" data-name="' + escapeHtml(app.name) + '">' + quizCardHTML(app, "pages/") + "</div>";
    }).join("");

    var ogImage = site.ogImage && site.ogImage.indexOf("http") === 0 ? site.ogImage : site.baseUrl + "/" + (site.ogImage || "assets/img/og-default.png");

    var jsonLd = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": site.name,
      "url": site.baseUrl + "/",
      "potentialAction": {
        "@type": "SearchAction",
        "target": site.baseUrl + "/?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    };

    return (
      "<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n" +
      headBlock({
        title: site.name + " | " + site.tagline,
        description: apps.length + "개 앱테크 퀴즈의 오늘의 문제·정답·해설을 한 곳에서 확인하세요. " + site.tagline,
        keywords: apps.slice(0, 12).map(function (a) { return a.name + " 정답"; }).join(", "),
        canonical: site.baseUrl + "/",
        siteName: site.name,
        adsensePubId: site.adsensePubId,
        cssPath: "assets/css/style.css",
        basePrefix: "",
        ogImage: ogImage,
        googleSiteVerification: site.googleSiteVerification,
        naverSiteVerification: site.naverSiteVerification
      }) +
      "\n</head>\n<body>\n" +
      headerBlock(site, "") +
      '<main class="shell" style="padding:0;max-width:none;">' +
      '<div class="hero shell">' +
      '<span class="hero__eyebrow">🪙 오늘 확인된 회차만 모았어요</span>' +
      "<h1>" + escapeHtml(apps.length + "개 앱") + " 퀴즈 정답을<br>매일 아침 한 번에 확인하세요</h1>" +
      '<p class="lede">' + escapeHtml(site.tagline) + "</p>" +
      '<div class="search-box"><input type="search" id="search-input" placeholder="앱 이름으로 검색 (예: 토스, 카카오뱅크)" aria-label="퀴즈 앱 검색"></div>' +
      "</div>" +
      '<nav class="chip-row shell" aria-label="카테고리 필터">' + chips + "</nav>" +
      adSlot("광고 영역 (상단)") +
      '<div class="card-list shell" id="card-list" style="padding-left:0;padding-right:0;">' +
      (cards || '<p class="empty-state">아직 등록된 퀴즈가 없습니다. 관리자 페이지에서 첫 퀴즈를 추가해 주세요.</p>') +
      '<p class="empty-state" id="no-results" hidden>검색 결과가 없습니다.</p>' +
      "</div>" +
      adSlot("광고 영역 (하단)") +
      "</main>" +
      footerBlock(site) +
      '<script type="application/ld+json">' + JSON.stringify(jsonLd) + "</script>\n" +
      '<script src="assets/js/favorites.js"></script>\n' +
      '<script src="assets/js/freshness.js"></script>\n' +
      '<script src="assets/js/site.js"></script>\n' +
      '<script src="assets/js/pwa.js"></script>\n' +
      "</body>\n</html>\n"
    );
  }

  // 최근 회차 아카이브 — 항상 섹션을 렌더링해(빈 상태 포함) TOC 앵커가 항상
  // 유효하게 만든다. <details>는 네이티브 요소라 JS 없이도 펼치기가 동작한다.
  function archiveSectionHTML(app) {
    var hist = (app.history || []).slice(0, HISTORY_LIMIT);
    var body;
    if (!hist.length) {
      body = '<p class="empty-state" style="padding:16px;">아직 지난 회차 기록이 없습니다. 매일 갱신되면 이곳에 자동으로 쌓입니다.</p>';
    } else {
      body = hist.map(function (h) {
        if (h.rounds && h.rounds.length) {
          var roundSummary = h.rounds.map(function (r) {
            return escapeHtml(r.label || "") + " " + escapeHtml(r.answer || "미등록");
          }).join(" · ");
          return (
            '<div class="archive-row">' +
            '<span class="archive-row__date">' + escapeHtml(formatDateShort(h.date)) + "</span>" +
            '<span class="archive-row__q">' + roundSummary + "</span>" +
            '<span class="archive-row__a"></span>' +
            "</div>"
          );
        }
        return (
          '<div class="archive-row">' +
          '<span class="archive-row__date">' + escapeHtml(formatDateShort(h.date)) + "</span>" +
          '<span class="archive-row__q">' + escapeHtml(h.question || "") + "</span>" +
          '<span class="archive-row__a">' + escapeHtml(h.answer || "") + "</span>" +
          "</div>"
        );
      }).join("");
    }
    return (
      '<details class="archive">' +
      "<summary>📚 지난 정답 모음 (최근 " + hist.length + "개 회차)</summary>" +
      '<div class="archive__body">' + body + "</div>" +
      "</details>"
    );
  }

  // 오늘의 정답을 스크롤 없이 바로 보여주는 결론 우선 카드. 회차 앱은 회차별
  // 정답을 나란히 나열한다. site.exposeAnswerInMeta 와는 무관하게(그 플래그는
  // <meta>/JSON-LD 전용) 본문에는 항상 정답을 보여준다 — 그래야 "3초 안에
  // 정답 확인"이 성립한다.
  function renderSummaryCard(app, isMultiRound, roundsMerged, today) {
    if (isMultiRound) {
      var rows = roundsMerged.map(function (r) {
        var known = !!(r.answer && r.answer.trim());
        return (
          '<div class="answer-summary__round">' +
          '<span class="answer-summary__round-time">' + escapeHtml(r.label || "") + "</span>" +
          '<span class="answer-summary__round-value' + (known ? "" : " is-empty") + '">' +
          (known ? escapeHtml(r.answer) : "아직 등록 전") +
          "</span></div>"
        );
      }).join("");
      return (
        '<section class="answer-summary answer-summary--rounds shell" id="summary" aria-label="오늘의 회차별 정답">' +
        '<div class="answer-summary__label">🏆 오늘의 회차별 정답</div>' +
        '<div class="answer-summary__rounds">' + rows + "</div>" +
        "</section>"
      );
    }
    var hasAnswer = !!(today.answer && today.answer.trim());
    var qPreview = (today.question || "").slice(0, 70);
    return (
      '<section class="answer-summary shell" id="summary" aria-label="오늘의 정답">' +
      '<div class="answer-summary__label">🏆 오늘의 정답</div>' +
      '<div class="answer-summary__value">' + (hasAnswer ? escapeHtml(today.answer) : "아직 등록 전") + "</div>" +
      (qPreview ? '<p class="answer-summary__q">Q. ' + escapeHtml(qPreview) + (today.question && today.question.length > 70 ? "…" : "") + "</p>" : "") +
      "</section>"
    );
  }

  // 참여 시간 · 리워드 · 소요 시간을 한눈에 보여주는 표.
  function renderHowtoTable(app) {
    return (
      '<table class="howto-table">' +
      "<tr><th>참여 시간</th><td>" + escapeHtml(app.schedule || "매일") + "</td></tr>" +
      "<tr><th>리워드</th><td>" + escapeHtml(app.rewardHint || "앱 화면 참고") + "</td></tr>" +
      "<tr><th>소요 시간</th><td>약 10초 (문제 확인 + 정답 입력)</td></tr>" +
      "</table>"
    );
  }

  // FAQ 문항을 앱의 실제 필드(schedule/rewardHint/participatePath/history)로
  // 구성 — 앱마다 입력값이 달라 문구도 자연히 달라진다("문구가 다른 4~6문항").
  // 오늘의 정답 자체는 여기 넣지 않는다(상시 재사용 가능한 FAQPage 스키마를
  // 매일 바뀌는 정답과 분리하기 위함 — DECISIONS.md #2 참고).
  function buildFaqItems(app, isMultiRound, roundLabels) {
    var items = [];
    items.push({
      q: app.name + "은(는) 언제 참여할 수 있나요?",
      a: (app.schedule || "매일") + " 참여할 수 있습니다."
    });
    items.push({
      q: app.name + " 정답을 맞히면 어떤 보상을 받나요?",
      a: (app.rewardHint ? app.rewardHint + "가 지급됩니다." : "앱 화면에 안내된 리워드가 지급됩니다.") + " 실제 지급 조건은 앱 내 안내를 최종 기준으로 확인해 주세요."
    });
    items.push({
      q: app.name + "은(는) 어디서 참여하나요?",
      a: (app.participatePath ? app.participatePath + "에서 참여할 수 있습니다." : "앱 내 이벤트/혜택 메뉴에서 참여할 수 있습니다.")
    });
    items.push({
      q: app.name + " 참여에는 시간이 얼마나 걸리나요?",
      a: "문제를 확인하고 정답을 입력하는 데 약 10초 정도면 충분합니다."
    });
    if (isMultiRound) {
      items.push({
        q: app.name + "은(는) 하루에 몇 번 참여할 수 있나요?",
        a: "하루 " + roundLabels.length + "회(" + roundLabels.join(", ") + ") 참여할 수 있으며, 회차마다 문제와 정답이 다릅니다."
      });
    }
    if ((app.history || []).length > 0) {
      items.push({
        q: "지난 " + app.name + " 정답도 확인할 수 있나요?",
        a: "이 페이지의 '지난 정답 모음' 섹션에서 최근 회차 정답을 함께 확인할 수 있습니다."
      });
    } else {
      items.push({
        q: app.name + " 문제는 매일 바뀌나요?",
        a: "네, " + (app.schedule || "매일") + " 기준으로 새 문제가 출제되며 이 페이지도 그에 맞춰 갱신됩니다."
      });
    }
    return items;
  }

  function renderFaqSection(items) {
    var rows = items.map(function (it) {
      return (
        "<details class=\"faq-item\">" +
        "<summary>" + escapeHtml(it.q) + "</summary>" +
        "<p>" + escapeHtml(it.a) + "</p>" +
        "</details>"
      );
    }).join("");
    return '<div class="faq-list">' + rows + "</div>";
  }

  // 전체 앱 상호링크 그리드 — 사이트 전 페이지가 서로 링크되도록 해 크롤
  // 깊이와 회유율을 함께 개선한다(PROMPT.md Phase1 블록11).
  function renderAllAppsGrid(apps, currentId, pagePrefix) {
    var items = apps.filter(function (a) { return a.id !== currentId; }).map(function (a) {
      return (
        '<a class="app-link-pill" href="' + pagePrefix + escapeHtml(a.page) + '">' +
        '<span aria-hidden="true">' + escapeHtml(a.emoji || "🎯") + "</span>" + escapeHtml(a.name) +
        "</a>"
      );
    }).join("");
    return '<div class="app-link-grid">' + items + "</div>";
  }

  // 정답을 <meta>/JSON-LD에 노출할지는 site.exposeAnswerInMeta로 전환 가능
  // (DECISIONS.md #2). 본문(요약 카드 등)에는 이 플래그와 무관하게 항상
  // 정답이 보인다 — 검색엔진 메타 노출만 별도로 통제한다.
  function buildMetaDescription(app, isMultiRound, roundsMerged, today, dateLabel, exposeAnswer) {
    if (isMultiRound) {
      if (exposeAnswer) {
        var answerSummary = roundsMerged.map(function (r) { return r.label + " " + (r.answer || "미등록"); }).join(" · ");
        return (app.name + " 정답 (" + dateLabel + ") — " + answerSummary + ". 회차별 문제와 해설을 확인하세요.").slice(0, 155);
      }
      var roundLabels = roundsMerged.map(function (r) { return r.label; }).join("·");
      return (app.name + " 정답 (" + dateLabel + ") " + roundLabels + " 회차 — 회차별 문제와 정답, 해설을 한 곳에서 확인하세요.").slice(0, 155);
    }
    if (exposeAnswer) {
      var answerPart = today.answer ? "정답은 '" + today.answer + "'. " : "";
      return (app.name + " 정답 (" + dateLabel + "): " + answerPart + (today.question || "")).slice(0, 155);
    }
    return (app.name + " 정답 (" + dateLabel + "): 오늘 출제된 문제와 정답, 자세한 해설을 확인하세요. " +
      (app.participatePath ? app.participatePath + "에서 참여할 수 있습니다." : "")).slice(0, 155);
  }

  // 한 회차(오전/오후/저녁 등)의 문제 → 정답/해설 카드. <details>는 네이티브
  // 요소라 JS를 꺼도 펼치기가 동작하고, 본문 텍스트는 접혀 있어도 DOM에 그대로
  // 존재해 검색엔진이 읽는다.
  function renderRoundBlock(app, round) {
    var choices = (round.choices || []).filter(Boolean);
    var choicesHTML = choices.length
      ? '<ul class="choice-list">' + choices.map(function (c) { return "<li>" + escapeHtml(c) + "</li>"; }).join("") + "</ul>"
      : "";
    var imageHTML = renderImageFigure(round.imageUrl, round.imageWidth, round.imageHeight, app.name + " " + round.label + " 문제 이미지", "../");
    return (
      '<div class="round-block">' +
      '<span class="round-block__time">🕐 ' + escapeHtml(round.label || "") + " 회차</span>" +
      '<div class="panel">' + imageHTML + '<p class="q-text">' + nl2p(round.question || "아직 등록된 문제가 없습니다. 관리자 페이지에서 이 회차의 문제를 입력해 주세요.") + "</p>" + choicesHTML + "</div>" +
      "<details class=\"reveal\">" +
      "<summary class=\"reveal__button\">" + escapeHtml(round.label || "") + " 정답과 해설 자세히 보기</summary>" +
      '<div class="reveal__content">' +
      '<span class="answer-badge">✅ 정답 · ' + escapeHtml(round.answer || "미등록") + "</span>" +
      '<p class="explain-text">' + nl2p(round.explanation || "해설이 아직 등록되지 않았습니다.") + "</p>" +
      "</div>" +
      "</details>" +
      "</div>"
    );
  }

  function renderAppPage(app, data) {
    var site = data.site;
    var apps = data.apps || [];
    var fresh = isFresh(app);
    var today = app.today || {};
    var related = pickRelated(app, apps, 3);
    var canonical = site.baseUrl + "/pages/" + app.page;
    var dateLabel = formatDateMD(today.date);
    var exposeAnswer = !!site.exposeAnswerInMeta;
    var brand = app.brandColor || "";

    var isMultiRound = !!(app.roundSchedule && app.roundSchedule.length);
    var roundsMerged = isMultiRound
      ? app.roundSchedule.map(function (sched) {
          var match = (today.rounds || []).filter(function (r) { return r.time === sched.time; })[0];
          return Object.assign({ time: sched.time, label: sched.label }, match || {});
        })
      : [];
    var roundLabels = isMultiRound ? app.roundSchedule.map(function (s) { return s.label; }) : [];

    var title = isMultiRound
      ? app.name + " 정답 (" + dateLabel + ") " + roundLabels.join("·") + " 회차 | " + site.name
      : app.name + " 정답 (" + dateLabel + ") | " + site.name;
    var description = buildMetaDescription(app, isMultiRound, roundsMerged, today, dateLabel, exposeAnswer);
    var keywords = isMultiRound
      ? [app.name + " 정답", app.name + " 정답 오늘", app.name + " 회차", app.name + " " + dateLabel, site.name].join(", ")
      : [app.name + " 정답", app.name + " 정답 오늘", app.name + " 문제", app.name + " " + dateLabel, site.name].join(", ");

    var defaultOgImage = site.ogImage && site.ogImage.indexOf("http") === 0 ? site.ogImage : site.baseUrl + "/" + (site.ogImage || "assets/img/og-default.png");
    var ogImage;
    if (isMultiRound) {
      var firstRoundImageRaw = roundsMerged.map(function (r) { return r.imageUrl; }).filter(Boolean)[0];
      ogImage = firstRoundImageRaw ? absoluteImageUrl(firstRoundImageRaw, site.baseUrl) : defaultOgImage;
    } else {
      ogImage = today.imageUrl ? absoluteImageUrl(today.imageUrl, site.baseUrl) : defaultOgImage;
    }

    var choices = (today.choices || []).filter(Boolean);
    var choicesHTML = choices.length
      ? '<ul class="choice-list">' + choices.map(function (c) { return "<li>" + escapeHtml(c) + "</li>"; }).join("") + "</ul>"
      : "";
    var imageHTML = renderImageFigure(today.imageUrl, today.imageWidth, today.imageHeight, app.name + " 문제 이미지", "../");

    var faqItems = buildFaqItems(app, isMultiRound, roundLabels);
    var faqEntities = faqItems.map(function (it) {
      return { "@type": "Question", "name": it.q, "acceptedAnswer": { "@type": "Answer", "text": it.a } };
    });

    var jsonLd = [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqEntities
      },
      {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": title,
        "description": description,
        "datePublished": app.createdAt || today.date,
        "dateModified": app.updatedAt || today.date,
        "image": [ogImage],
        "publisher": { "@type": "Organization", "name": site.name }
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "홈", "item": site.baseUrl + "/" },
          { "@type": "ListItem", "position": 2, "name": app.category || "퀴즈", "item": site.baseUrl + "/?cat=" + encodeURIComponent(app.category || "") },
          { "@type": "ListItem", "position": 3, "name": app.name, "item": canonical }
        ]
      }
    ];

    var relatedHTML = related.map(function (r) {
      return (
        '<a class="related-card" href="' + escapeHtml(r.page) + '">' +
        '<span class="related-card__badge" aria-hidden="true">' + escapeHtml(r.emoji || "🎯") + "</span>" +
        '<span><span class="related-card__name">' + escapeHtml(r.name) + '</span><br>' +
        '<span class="related-card__hint">' + escapeHtml(r.rewardHint || "오늘의 정답 보기") + "</span></span>" +
        "</a>"
      );
    }).join("");

    // ---- 블록 1: 상단 상태 바 + H1 (히어로) ----
    var freshDatetime = today.date || "";
    var statusPillHTML = '<span class="status-pill ' + (fresh ? "status-pill--fresh" : "status-pill--stale") + '" data-fresh-date="' + escapeHtml(freshDatetime) + '">' +
      '<span class="status-pill__dot"></span><span class="status-pill__text">' + (fresh ? "오늘 갱신됨" : "갱신 대기") + "</span></span>";
    var heroHTML =
      '<div class="quiz-hero shell"' + (brand ? ' style="--brand:' + escapeHtml(brand) + ';"' : "") + '>' +
      '<div class="quiz-hero__row"><span class="quiz-hero__badge" aria-hidden="true">' + escapeHtml(app.emoji || "🎯") + "</span>" + favoriteButtonHTML(app.id) + "</div>" +
      '<div class="quiz-hero__statusbar">' + statusPillHTML +
      '<time datetime="' + escapeHtml(freshDatetime) + '">' + formatDateKo(today.date) + " 기준</time></div>" +
      '<span class="quiz-hero__cat">' + escapeHtml(app.category || "") + " · " + escapeHtml(app.schedule || "매일") + "</span>" +
      "<h1>" + escapeHtml(app.name) + " 정답 (" + dateLabel + ")</h1>" +
      shareBarHTML(app.name + " 정답 (" + dateLabel + ")") +
      "</div>";

    // ---- 블록 3: 정답 요약 카드 (스크롤 없이 바로 결론) ----
    var summaryHTML = renderSummaryCard(app, isMultiRound, roundsMerged, today);

    var bodyHTML;
    if (isMultiRound) {
      bodyHTML =
        '<nav class="toc shell" aria-label="목차">' +
        '<a href="#rounds">1.문제/정답</a><a href="#howto">2.참여방법</a><a href="#archive">3.지난정답</a><a href="#faq">4.FAQ</a><a href="#related">5.관련퀴즈</a>' +
        "</nav>" +
        adSlot("광고 영역 A (정답 요약 아래)") +
        '<section class="section shell" id="rounds">' +
        '<div class="section__label"><span class="n">01</span>' + escapeHtml(app.name) + " 회차별 문제와 정답</div>" +
        roundsMerged.map(function (r) { return renderRoundBlock(app, r); }).join('<div style="height:14px;"></div>') +
        "</section>" +
        adSlot("광고 영역 B (본문 중간)") +
        '<section class="section shell" id="howto" style="padding-top:0;">' +
        '<div class="section__label"><span class="n">02</span>참여 방법</div>' +
        '<div class="panel" style="text-align:center;">' +
        '<a class="cta-button" href="' + escapeHtml(app.appDeeplink || "#") + '">' + escapeHtml(app.name) + " 참여하러 가기 →</a>" +
        '<p class="path-steps">' + escapeHtml(app.participatePath || "") + "</p>" +
        renderHowtoTable(app) +
        "</div></section>" +
        '<section class="section shell" id="archive" style="padding-top:0;">' +
        '<div class="section__label"><span class="n">03</span>지난 정답 모음</div>' +
        archiveSectionHTML(app) +
        "</section>" +
        '<section class="section shell" id="faq" style="padding-top:0;">' +
        '<div class="section__label"><span class="n">04</span>자주 묻는 질문</div>' +
        renderFaqSection(faqItems) +
        "</section>" +
        '<section class="section shell" id="related" style="padding-top:0;">' +
        '<div class="section__label"><span class="n">05</span>함께 보면 좋은 앱테크</div>' +
        '<div class="related-list">' + relatedHTML + "</div>" +
        renderAllAppsGrid(apps, app.id, "") +
        "</section>";
    } else {
      bodyHTML =
        '<nav class="toc shell" aria-label="목차">' +
        '<a href="#question">1.문제</a><a href="#answer">2.해설</a><a href="#howto">3.참여방법</a><a href="#archive">4.지난정답</a><a href="#faq">5.FAQ</a><a href="#related">6.관련퀴즈</a>' +
        "</nav>" +
        adSlot("광고 영역 A (정답 요약 아래)") +
        '<section class="section shell" id="question">' +
        '<div class="section__label"><span class="n">01</span>' + escapeHtml(app.name) + " 문제</div>" +
        '<div class="panel">' + imageHTML + '<p class="q-text">' + nl2p(today.question || "아직 등록된 문제가 없습니다. 관리자 페이지에서 오늘의 문제를 입력해 주세요.") + "</p>" + choicesHTML + "</div>" +
        "</section>" +
        '<section class="section shell" id="answer" style="padding-top:0;">' +
        '<div class="section__label"><span class="n">02</span>정답 해설</div>' +
        "<details class=\"reveal\">" +
        "<summary class=\"reveal__button\">정답과 자세한 해설 보기</summary>" +
        '<div class="reveal__content">' +
        '<span class="answer-badge">✅ 정답 · ' + escapeHtml(today.answer || "미등록") + "</span>" +
        '<p class="explain-text">' + nl2p(today.explanation || "해설이 아직 등록되지 않았습니다.") + "</p>" +
        "</div></details>" +
        "</section>" +
        adSlot("광고 영역 B (본문 중간)") +
        '<section class="section shell" id="howto" style="padding-top:0;">' +
        '<div class="section__label"><span class="n">03</span>참여 방법</div>' +
        '<div class="panel" style="text-align:center;">' +
        '<a class="cta-button" href="' + escapeHtml(app.appDeeplink || "#") + '">' + escapeHtml(app.name) + " 참여하러 가기 →</a>" +
        '<p class="path-steps">' + escapeHtml(app.participatePath || "") + "</p>" +
        renderHowtoTable(app) +
        "</div></section>" +
        '<section class="section shell" id="archive" style="padding-top:0;">' +
        '<div class="section__label"><span class="n">04</span>지난 정답 모음</div>' +
        archiveSectionHTML(app) +
        "</section>" +
        '<section class="section shell" id="faq" style="padding-top:0;">' +
        '<div class="section__label"><span class="n">05</span>자주 묻는 질문</div>' +
        renderFaqSection(faqItems) +
        "</section>" +
        '<section class="section shell" id="related" style="padding-top:0;">' +
        '<div class="section__label"><span class="n">06</span>함께 보면 좋은 앱테크</div>' +
        '<div class="related-list">' + relatedHTML + "</div>" +
        renderAllAppsGrid(apps, app.id, "") +
        "</section>";
    }

    return (
      "<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n" +
      headBlock({
        title: title,
        description: description,
        keywords: keywords,
        canonical: canonical,
        siteName: site.name,
        adsensePubId: site.adsensePubId,
        cssPath: "../assets/css/style.css",
        basePrefix: "../",
        ogImage: ogImage,
        ogType: "article",
        themeColor: brand || "#2F5CFF",
        googleSiteVerification: site.googleSiteVerification,
        naverSiteVerification: site.naverSiteVerification
      }) +
      "\n</head>\n<body>\n" +
      headerBlock(site, "../") +
      "<main>" +
      heroHTML +
      summaryHTML +
      bodyHTML +
      adSlot("광고 영역 C (하단 Multiplex)") +
      "</main>" +
      footerBlock(site) +
      jsonLd.map(function (obj) { return '<script type="application/ld+json">' + JSON.stringify(obj) + "</script>\n"; }).join("") +
      '<script src="../assets/js/favorites.js"></script>\n' +
      '<script src="../assets/js/freshness.js"></script>\n' +
      '<script src="../assets/js/quiz.js"></script>\n' +
      '<script src="../assets/js/pwa.js"></script>\n' +
      "</body>\n</html>\n"
    );
  }

  function renderSitemap(data) {
    var site = data.site;
    var apps = data.apps || [];
    var urls = [site.baseUrl + "/"].concat(apps.map(function (a) { return site.baseUrl + "/pages/" + a.page; }));
    var body = urls.map(function (u) { return "  <url><loc>" + escapeHtml(u) + "</loc></url>"; }).join("\n");
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + "\n</urlset>\n";
  }

  // Naver 서치어드바이저 / RSS readers pick up recently-updated content fast
  // via a plain RSS feed — much faster than waiting for crawl-based indexing.
  function renderFeed(data) {
    var site = data.site;
    var apps = (data.apps || []).slice().sort(function (a, b) {
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
    var items = apps.map(function (a) {
      var link = site.baseUrl + "/pages/" + a.page;
      var desc = escapeHtml((a.today && a.today.question) || "");
      return (
        "  <item>\n" +
        "    <title>" + escapeHtml("[" + a.name + " 정답] " + formatDateKo(a.today && a.today.date)) + "</title>\n" +
        "    <link>" + escapeHtml(link) + "</link>\n" +
        "    <guid>" + escapeHtml(link) + "</guid>\n" +
        "    <pubDate>" + new Date((a.updatedAt || todayKST()) + "T00:00:00+09:00").toUTCString() + "</pubDate>\n" +
        "    <description>" + desc + "</description>\n" +
        "  </item>"
      );
    }).join("\n");
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n' +
      "  <title>" + escapeHtml(site.name) + "</title>\n" +
      "  <link>" + escapeHtml(site.baseUrl) + "/</link>\n" +
      "  <description>" + escapeHtml(site.tagline) + "</description>\n" +
      "  <language>ko</language>\n" +
      items + "\n" +
      "</channel></rss>\n"
    );
  }

  return {
    parseCsv: parseCsv,
    csvToObjects: csvToObjects,
    sheetAppId: sheetAppId,
    escapeHtml: escapeHtml,
    nl2p: nl2p,
    todayKST: todayKST,
    formatDateKo: formatDateKo,
    formatDateShort: formatDateShort,
    formatDateMD: formatDateMD,
    isFresh: isFresh,
    categories: categories,
    convertDriveLink: convertDriveLink,
    isDriveLink: isDriveLink,
    isExternalUrl: isExternalUrl,
    resolveImagePath: resolveImagePath,
    absoluteImageUrl: absoluteImageUrl,
    HISTORY_LIMIT: HISTORY_LIMIT,
    renderIndexPage: renderIndexPage,
    renderAppPage: renderAppPage,
    renderSitemap: renderSitemap,
    renderFeed: renderFeed
  };
});
