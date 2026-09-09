/*
 * Minimal service worker: caches the static app shell (CSS/JS/icons) so
 * repeat visits render instantly and the site stays installable as a PWA.
 * Quiz pages themselves are always fetched fresh from the network — daily
 * content must never be served stale from cache.
 */
// Bump this whenever a shell asset (CSS/JS) changes meaningfully — the
// activate handler below deletes any cache key that isn't the current one,
// so a version bump is what actually forces stale cached JS/CSS out for
// returning visitors (the fetch handler serves cached-then-updates, so
// without a bump they'd see last version's code on their first load back).
const CACHE = "apteck-shell-v2";
const SHELL = [
  "assets/css/style.css",
  "assets/js/template.js",
  "assets/js/site.js",
  "assets/js/quiz.js",
  "assets/js/favorites.js",
  "assets/js/freshness.js",
  "assets/js/pwa.js",
  "assets/img/icon-192.png",
  "assets/img/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;

  const isShellAsset = SHELL.some((p) => url.pathname.endsWith(p));
  if (!isShellAsset) return; // let HTML (quiz content) always hit the network

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((res) => {
        caches.open(CACHE).then((c) => c.put(event.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
