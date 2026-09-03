/*
 * "즐겨찾기" (in-site bookmark) — since JS can no longer add a real browser
 * bookmark, we keep a per-visitor starred-apps list in localStorage and use
 * it to pin/filter cards. Shared by index.html and every pages/*.html.
 */
(function () {
  "use strict";

  var KEY = "apteck-favorites";

  function readAll() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function writeAll(ids) {
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) {}
  }

  function isFav(id) { return readAll().indexOf(id) !== -1; }

  function toggle(id) {
    var ids = readAll();
    var idx = ids.indexOf(id);
    if (idx === -1) { ids.push(id); } else { ids.splice(idx, 1); }
    writeAll(ids);
    return idx === -1; // true = now favorited
  }

  function paintButton(btn) {
    var id = btn.getAttribute("data-fav-id");
    var on = isFav(id);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "즐겨찾기 해제" : "즐겨찾기 추가");
    var icon = btn.querySelector(".fav-star__icon");
    if (icon) icon.textContent = on ? "★" : "☆";
  }

  function init() {
    var buttons = document.querySelectorAll(".fav-star");
    buttons.forEach(function (btn) {
      paintButton(btn);
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggle(btn.getAttribute("data-fav-id"));
        paintButton(btn);
        document.dispatchEvent(new CustomEvent("favorites:changed"));
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.AppFavorites = { isFav: isFav, toggle: toggle, all: readAll };
})();
