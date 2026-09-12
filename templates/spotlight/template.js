/*
 * spotlight template — same KineCard.seek(tMs) contract as every template.
 * Distinct look: dark stage, the active line is bright while past/future lines
 * are dimmed, each line slides in from the left with an accent bar.
 */
// kinecard:font-ratios title=8.6 body=5.8 subtitle=4.2  (vw; read by src/templates.ts for the safe-zone linter)
// kinecard:line-chrome 2.9  (vw; the .kc-line::before accent bar 0.5vw + 2.4vw margin — read by src/templates.ts for the safe-zone linter)
(function () {
  "use strict";

  var card = window.__CARD__ || { title: "", lines: [] };
  var cfg = window.__RENDER__ || {};
  var t = cfg.timing || {};
  var timing = {
    titleMs: t.titleMs || 1400,
    perLineMs: t.perLineMs || 1500,
    lineInMs: t.lineInMs || 640,
    outroMs: t.outroMs || 1200
  };
  var size = cfg.size || [1080, 1920];
  var safe = cfg.safeZone || { top: 0.08, bottom: 0.18, left: 0.06, right: 0.06 };

  var root = document.documentElement;
  var pal = card.palette || {};
  if (pal.bg) root.style.setProperty("--bg", pal.bg);
  if (pal.fg) root.style.setProperty("--fg", pal.fg);
  if (pal.accent) root.style.setProperty("--accent", pal.accent);
  if (pal.muted) root.style.setProperty("--muted", pal.muted);

  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

  var stage = document.getElementById("stage");
  stage.innerHTML = "";
  stage.style.paddingTop = size[1] * safe.top + "px";
  stage.style.paddingBottom = size[1] * safe.bottom + "px";
  stage.style.paddingLeft = size[0] * safe.left + "px";
  stage.style.paddingRight = size[0] * safe.right + "px";

  var titleEl = document.createElement("h1");
  titleEl.className = "kc-title";
  titleEl.textContent = card.title || "";
  var dot = document.createElement("span");
  dot.className = "dot";
  dot.textContent = ".";
  titleEl.appendChild(dot);
  stage.appendChild(titleEl);

  var subEl = null;
  if (card.subtitle) {
    subEl = document.createElement("p");
    subEl.className = "kc-sub";
    subEl.textContent = card.subtitle;
    stage.appendChild(subEl);
  }

  var linesWrap = document.createElement("div");
  linesWrap.className = "kc-lines";
  var lineEls = (card.lines || []).map(function (line) {
    var el = document.createElement("p");
    el.className = "kc-line";
    el.textContent = line.text;
    if (line.accent) el.style.setProperty("--accent", line.accent);
    linesWrap.appendChild(el);
    return el;
  });
  stage.appendChild(linesWrap);

  var n = lineEls.length;
  var duration = timing.titleMs + n * timing.perLineMs + timing.outroMs;

  function seek(tt) {
    if (tt == null || tt < 0) tt = 0;

    var titleIn = Math.min(800, timing.titleMs);
    var tp = easeOut(clamp(tt / titleIn));
    titleEl.style.opacity = tp;
    titleEl.style.transform = "translateY(" + (1 - tp) * 26 + "px)";

    if (subEl) {
      var sp = easeOut(clamp((tt - 250) / 650));
      subEl.style.opacity = sp * 0.9;
      subEl.style.transform = "translateY(" + (1 - sp) * 18 + "px)";
    }

    for (var i = 0; i < lineEls.length; i++) {
      var start = timing.titleMs + i * timing.perLineMs;
      var p = easeOut(clamp((tt - start) / timing.lineInMs)); // entrance
      var el = lineEls[i];
      // active window: from its entrance until the next line takes over
      var active = tt >= start && tt < start + timing.perLineMs;
      var appeared = p > 0;
      var dim = appeared && !active ? 0.34 : 1;

      el.style.opacity = (p * dim).toFixed(4);
      el.style.transform = "translateX(" + (1 - p) * -46 + "px)";
      el.style.setProperty("--bar", (active ? 1 : p).toFixed(4));
    }
  }

  seek(0);
  window.KineCard = { seek: seek, duration: duration };
})();
