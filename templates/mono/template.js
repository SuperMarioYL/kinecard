/*
 * mono template — same KineCard.seek(tMs) contract.
 * Distinct look: monospace, each line numbered and revealed with a typewriter,
 * plus a caret whose blink is a deterministic function of t (no wall clock).
 */
(function () {
  "use strict";

  var card = window.__CARD__ || { title: "", lines: [] };
  var cfg = window.__RENDER__ || {};
  var t = cfg.timing || {};
  var timing = {
    titleMs: t.titleMs || 1300,
    perLineMs: t.perLineMs || 1600,
    lineInMs: t.lineInMs || 900,
    outroMs: t.outroMs || 1300
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
  var lines = card.lines || [];
  var lineRefs = lines.map(function (line, idx) {
    var row = document.createElement("p");
    row.className = "kc-line";

    var num = document.createElement("span");
    num.className = "kc-num";
    num.textContent = (idx + 1 < 10 ? "0" : "") + (idx + 1);

    var text = document.createElement("span");
    text.className = "kc-text";
    if (line.accent) text.style.color = line.accent;

    var caret = document.createElement("span");
    caret.className = "kc-caret";
    caret.textContent = "▋";

    row.appendChild(num);
    row.appendChild(text);
    row.appendChild(caret);
    linesWrap.appendChild(row);
    return { row: row, num: num, text: text, caret: caret, full: line.text };
  });
  stage.appendChild(linesWrap);

  var n = lineRefs.length;
  var duration = timing.titleMs + n * timing.perLineMs + timing.outroMs;

  function seek(tt) {
    if (tt == null || tt < 0) tt = 0;

    var titleIn = Math.min(700, timing.titleMs);
    var tp = easeOut(clamp(tt / titleIn));
    titleEl.style.opacity = tp;
    titleEl.style.transform = "translateY(" + (1 - tp) * 22 + "px)";

    if (subEl) {
      var sp = easeOut(clamp((tt - 200) / 600));
      subEl.style.opacity = sp * 0.9;
    }

    // caret blink is a pure function of t (2.2 blinks/sec)
    var caretOn = Math.floor(tt / 450) % 2 === 0;

    for (var i = 0; i < lineRefs.length; i++) {
      var ref = lineRefs[i];
      var start = timing.titleMs + i * timing.perLineMs;
      var typeMs = Math.min(timing.lineInMs, timing.perLineMs);
      var rp = clamp((tt - start) / typeMs);
      var chars = Math.floor(rp * ref.full.length);

      ref.row.style.opacity = tt >= start ? 1 : 0;
      ref.text.textContent = ref.full.slice(0, chars);

      // caret shown on the line that is currently typing (or the last one done)
      var typing = tt >= start && rp < 1;
      var showCaret = typing || (i === lineRefs.length - 1 && rp >= 1);
      ref.caret.style.opacity = showCaret && caretOn ? 1 : 0;
    }
  }

  seek(0);
  window.KineCard = { seek: seek, duration: duration };
})();
