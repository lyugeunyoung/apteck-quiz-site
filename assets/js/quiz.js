(function () {
  "use strict";

  // Class-based (not id-based) so a multi-round page — several .reveal
  // blocks, one per time slot — works the same as a single-round page.
  document.querySelectorAll(".reveal").forEach(function (reveal) {
    var revealBtn = reveal.querySelector(".reveal__button");
    if (!revealBtn) return;
    revealBtn.addEventListener("click", function () {
      reveal.classList.add("is-open");
      var content = reveal.querySelector(".reveal__content");
      if (content) content.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  var shareRow = document.querySelector(".share-row");
  if (shareRow) {
    var shareTitle = shareRow.getAttribute("data-share-title") || document.title;
    var shareUrl = location.href;

    var nativeBtn = document.getElementById("share-native");
    if (nativeBtn) {
      if (navigator.share) {
        nativeBtn.addEventListener("click", function () {
          navigator.share({ title: shareTitle, url: shareUrl }).catch(function () {});
        });
      } else {
        nativeBtn.hidden = true;
      }
    }

    var bandBtn = document.getElementById("share-band");
    if (bandBtn) {
      bandBtn.href = "https://band.us/plugin/share?body=" + encodeURIComponent(shareTitle + " " + shareUrl) + "&route=" + encodeURIComponent(shareUrl);
    }

    var copyBtn = document.getElementById("share-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var done = function () {
          var original = copyBtn.textContent;
          copyBtn.textContent = "✅ 복사됨";
          setTimeout(function () { copyBtn.textContent = original; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareUrl).then(done).catch(done);
        } else {
          var ta = document.createElement("textarea");
          ta.value = shareUrl;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); } catch (e) {}
          document.body.removeChild(ta);
          done();
        }
      });
    }
  }

  var toc = document.querySelectorAll(".toc a");
  var sections = Array.prototype.map.call(toc, function (a) {
    return document.querySelector(a.getAttribute("href"));
  });
  if (toc.length && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var idx = sections.indexOf(entry.target);
        if (idx === -1) return;
        toc.forEach(function (a, i) {
          a.style.background = i === idx ? "var(--ink)" : "";
          a.style.color = i === idx ? "var(--bg)" : "";
          a.style.borderColor = i === idx ? "var(--ink)" : "";
        });
      });
    }, { rootMargin: "-40% 0px -50% 0px" });
    sections.forEach(function (s) { if (s) io.observe(s); });
  }
})();
