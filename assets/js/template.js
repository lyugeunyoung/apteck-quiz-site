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

  function adSlot(label) {
    return (
      '<div class="ad-slot" aria-hidden="true">' +
      "<!-- AdSense ad unit: replace this div's contents with your <ins class=\"adsbygoogle\"> tag once approved. See README \"광고 붙이기\". -->" +
      escapeHtml(label) +
      "</div>"
    );
  }

  // opts: { title, description, canonical, siteName, adsensePubId, cssPath,
  //         basePrefix, ogImage, ogType, googleSiteVerification, naverSiteVerification }
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
      '<link href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@500;700;800;900&family=Noto+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">\n' +
      '<link rel="stylesheet" href="' + opts.cssPath + '">\n' +
      '<link rel="manifest" href="' + bp + 'manifest.json">\n' +
      '<meta name="theme-color" content="#0E7C55">\n' +
      '<link rel="apple-touch-icon" href="' + bp + 'assets/img/icon-180.png">\n' +
      '<link rel="icon" type="image/png" sizes="192x192" href="' + bp + 'assets/img/icon-192.png">\n' +
      '<meta name="apple-mobile-web-app-capable" content="yes">\n' +
      '<meta name="apple-mobile-web-app-title" content="' + escapeHtml(opts.siteName) + '">\n' +
      adsenseTag
    );
  }

  function footerBlock(site) {
    return (
      '<footer class="site-footer">' +
      "<p>" + escapeHtml(site.name) + " · 본 사이트는 각 앱의 이벤트/퀴즈 정보를 정리해 안내하는 개인 정보 제공 사이트이며, 카카오·토스·신한·KB·NH·하나·케이뱅크 등 각 브랜드와 무관합니다.</p>" +
      "<p>실제 참여 가능 여부, 지급 조건, 회차 시간은 각 앱 화면을 최종 기준으로 확인해 주세요. 문제·정답은 변경될 수 있습니다.</p>" +
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
      '<span class="status-pill ' + statusClass + '"><span class="status-pill__dot"></span>' + statusText + "</span>" +
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
      '<script src="assets/js/site.js"></script>\n' +
      '<script src="assets/js/pwa.js"></script>\n' +
      "</body>\n</html>\n"
    );
  }

  function archiveSectionHTML(app) {
    var hist = (app.history || []).slice(0, HISTORY_LIMIT);
    if (!hist.length) return "";
    var rows = hist.map(function (h) {
      return (
        '<div class="archive-row">' +
        '<span class="archive-row__date">' + escapeHtml(formatDateShort(h.date)) + "</span>" +
        '<span class="archive-row__q">' + escapeHtml(h.question || "") + "</span>" +
        '<span class="archive-row__a">' + escapeHtml(h.answer || "") + "</span>" +
        "</div>"
      );
    }).join("");
    return (
      '<details class="archive">' +
      "<summary>📚 지난 정답 모음 보기 (최근 " + hist.length + "개 회차)</summary>" +
      '<div class="archive__body">' + rows + "</div>" +
      "</details>"
    );
  }

  function renderAppPage(app, data) {
    var site = data.site;
    var apps = data.apps || [];
    var fresh = isFresh(app);
    var today = app.today || {};
    var choices = (today.choices || []).filter(Boolean);
    var related = pickRelated(app, apps, 3);
    var canonical = site.baseUrl + "/pages/" + app.page;
    var title = "[" + app.name + " 정답] " + formatDateKo(today.date) + " 오늘의 문제와 정답";
    var description = (app.name + " 오늘의 퀴즈 문제, 정답, 해설을 확인하세요. " + (today.question || "")).slice(0, 150);
    var imageUrl = convertDriveLink(today.imageUrl);
    var ogImage = imageUrl || (site.ogImage && site.ogImage.indexOf("http") === 0 ? site.ogImage : site.baseUrl + "/" + (site.ogImage || "assets/img/og-default.png"));

    var choicesHTML = choices.length
      ? '<ul class="choice-list">' + choices.map(function (c) { return "<li>" + escapeHtml(c) + "</li>"; }).join("") + "</ul>"
      : "";

    var imageHTML = imageUrl
      ? '<figure class="q-image"><img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(app.name + " 문제 이미지") + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"></figure>' +
        (isDriveLink(today.imageUrl) ? '<p class="q-image__hint">※ 이미지가 보이지 않으면 구글드라이브 공유 설정이 "링크가 있는 모든 사용자"인지 확인해 주세요.</p>' : "")
      : "";

    var jsonLd = [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [{
          "@type": "Question",
          "name": today.question || app.name + " 오늘의 퀴즈",
          "acceptedAnswer": { "@type": "Answer", "text": (today.answer || "") + " " + (today.explanation || "") }
        }]
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

    return (
      "<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n" +
      headBlock({
        title: title,
        description: description,
        canonical: canonical,
        siteName: site.name,
        adsensePubId: site.adsensePubId,
        cssPath: "../assets/css/style.css",
        basePrefix: "../",
        ogImage: ogImage,
        ogType: "article",
        googleSiteVerification: site.googleSiteVerification,
        naverSiteVerification: site.naverSiteVerification
      }) +
      "\n</head>\n<body>\n" +
      headerBlock(site, "../") +
      '<main>' +
      '<div class="quiz-hero shell">' +
      '<div class="quiz-hero__row"><span class="quiz-hero__badge" aria-hidden="true">' + escapeHtml(app.emoji || "🎯") + "</span>" + favoriteButtonHTML(app.id) + "</div>" +
      '<span class="quiz-hero__cat">' + escapeHtml(app.category || "") + " · " + escapeHtml(app.schedule || "매일") + "</span>" +
      "<h1>" + escapeHtml(app.name) + " 오늘의 정답</h1>" +
      '<p class="quiz-hero__updated">' + (fresh ? "✅ " : "🕓 ") + formatDateKo(today.date) + " 기준 · " + (fresh ? "오늘 확인된 정보" : "최근 확인된 정보 (오늘자 미등록)") + "</p>" +
      shareBarHTML(app.name + " 오늘의 정답") +
      "</div>" +
      '<nav class="toc shell" aria-label="목차">' +
      '<a href="#question">1. 문제</a><a href="#answer">2. 정답</a><a href="#explain">3. 해설</a><a href="#howto">4. 참여 방법</a><a href="#related">5. 관련 퀴즈</a>' +
      "</nav>" +
      adSlot("광고 영역 (본문 상단)") +
      '<section class="section shell" id="question">' +
      '<div class="section__label"><span class="n">01</span>' + escapeHtml(app.name) + " 문제</div>" +
      '<div class="panel">' + imageHTML + '<p class="q-text">' + nl2p(today.question || "아직 등록된 문제가 없습니다. 관리자 페이지에서 오늘의 문제를 입력해 주세요.") + "</p>" + choicesHTML + "</div>" +
      "</section>" +
      '<section class="section shell" id="answer" style="padding-top:0;">' +
      '<div class="section__label"><span class="n">02</span>' + escapeHtml(app.name) + " 정답</div>" +
      '<div class="reveal" id="reveal">' +
      '<button class="reveal__button" type="button" id="reveal-btn">🔒 탭해서 정답 확인하기</button>' +
      '<div class="reveal__content">' +
      '<span class="answer-badge">✅ 정답 · ' + escapeHtml(today.answer || "미등록") + "</span>" +
      '<div id="explain" class="section__label" style="margin-top:18px;"><span class="n">03</span>오늘의 퀴즈 해설</div>' +
      '<p class="explain-text">' + nl2p(today.explanation || "해설이 아직 등록되지 않았습니다.") + "</p>" +
      "</div></div>" +
      "</section>" +
      adSlot("광고 영역 (본문 중간)") +
      '<section class="section shell" id="howto" style="padding-top:0;">' +
      '<div class="section__label"><span class="n">04</span>참여 방법</div>' +
      '<div class="panel" style="text-align:center;">' +
      '<a class="cta-button" href="' + escapeHtml(app.appDeeplink || "#") + '">' + escapeHtml(app.name) + " 참여하러 가기 →</a>" +
      '<p class="path-steps">' + escapeHtml(app.participatePath || "") + "</p>" +
      "</div></section>" +
      '<section class="section shell" id="related" style="padding-top:0;">' +
      '<div class="section__label"><span class="n">05</span>함께 보면 좋은 앱테크</div>' +
      '<div class="related-list">' + relatedHTML + "</div>" +
      (archiveSectionHTML(app) ? '<div style="margin-top:14px;">' + archiveSectionHTML(app) + "</div>" : "") +
      "</section>" +
      adSlot("광고 영역 (본문 하단)") +
      '<div class="disclaimer shell">본 페이지의 문제·정답·해설은 정보 제공 목적이며, 실제 정답 및 리워드 지급 여부는 해당 앱 화면을 기준으로 최종 확인해 주세요. 최근 확인 시각: ' + escapeHtml(app.updatedAt || today.date || "") + "</div>" +
      "</main>" +
      footerBlock(site) +
      jsonLd.map(function (obj) { return '<script type="application/ld+json">' + JSON.stringify(obj) + "</script>\n"; }).join("") +
      '<script src="../assets/js/favorites.js"></script>\n' +
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
    escapeHtml: escapeHtml,
    nl2p: nl2p,
    todayKST: todayKST,
    formatDateKo: formatDateKo,
    formatDateShort: formatDateShort,
    isFresh: isFresh,
    categories: categories,
    convertDriveLink: convertDriveLink,
    isDriveLink: isDriveLink,
    HISTORY_LIMIT: HISTORY_LIMIT,
    renderIndexPage: renderIndexPage,
    renderAppPage: renderAppPage,
    renderSitemap: renderSitemap,
    renderFeed: renderFeed
  };
});
