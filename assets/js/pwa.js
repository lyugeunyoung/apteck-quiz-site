/*
 * "홈 화면에 추가" — captures Chrome/Edge/Samsung Internet's
 * beforeinstallprompt so we can offer our own install button instead of
 * relying on the browser's own (easy-to-miss) address-bar icon. iOS Safari
 * never fires that event, so there we just show the manual steps.
 */
(function () {
  "use strict";

  var DISMISS_KEY = "apteck-install-dismissed";
  var banner = document.getElementById("install-banner");
  var installBtn = document.getElementById("install-btn");
  var dismissBtn = document.getElementById("install-dismiss");
  var deferredPrompt = null;

  function alreadyDismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch (e) { return false; }
  }
  function isStandalone() {
    return window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  if (banner && !alreadyDismissed() && !isStandalone()) {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      banner.hidden = false;
      banner.querySelector("span").textContent = "📲 홈 화면에 추가하고 매일 아침 바로 접속하세요";
    });

    if (isIOS()) {
      banner.hidden = false;
      banner.querySelector("span").textContent = "📲 Safari 공유 버튼 → \"홈 화면에 추가\"로 앱처럼 사용하세요";
      if (installBtn) installBtn.hidden = true;
    }
  }

  if (installBtn) {
    installBtn.addEventListener("click", function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () {
        deferredPrompt = null;
        banner.hidden = true;
      });
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener("click", function () {
      banner.hidden = true;
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch (e) {}
    });
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      var swPath = location.pathname.indexOf("/pages/") !== -1 ? "../sw.js" : "sw.js";
      navigator.serviceWorker.register(swPath).catch(function () {});
    });
  }
})();
