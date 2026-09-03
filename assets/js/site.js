(function () {
  "use strict";

  var chips = document.querySelectorAll(".chip");
  var cards = document.querySelectorAll(".card-wrap");
  var searchInput = document.getElementById("search-input");
  var noResults = document.getElementById("no-results");
  var activeCat = "__all";

  function applyFilter() {
    var q = (searchInput && searchInput.value || "").trim().toLowerCase();
    var visibleCount = 0;
    cards.forEach(function (card) {
      var matchesCat = activeCat === "__all" ||
        (activeCat === "__fav" && window.AppFavorites && window.AppFavorites.isFav(card.getAttribute("data-id"))) ||
        card.getAttribute("data-cat") === activeCat;
      var matchesSearch = !q || (card.getAttribute("data-name") || "").toLowerCase().indexOf(q) !== -1;
      var show = matchesCat && matchesSearch;
      card.style.display = show ? "" : "none";
      if (show) visibleCount++;
    });
    if (noResults) noResults.hidden = visibleCount !== 0;
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chips.forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
      chip.setAttribute("aria-pressed", "true");
      activeCat = chip.getAttribute("data-cat");
      applyFilter();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", applyFilter);
    var params = new URLSearchParams(location.search);
    var initialQuery = params.get("q");
    if (initialQuery) { searchInput.value = initialQuery; applyFilter(); }
  }

  document.addEventListener("favorites:changed", function () {
    if (activeCat === "__fav") applyFilter();
  });
})();
