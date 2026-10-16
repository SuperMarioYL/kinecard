import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CardSchema, resolveRenderConfig } from "../src/schema";
import { listBuiltinTemplates, parseTemplateFontRatios, parseTemplateLineChrome, resolveBuiltin, type Template } from "../src/templates";
import { estimateTextWidthPx, lintCard } from "../src/render";

// The `kinecard:*` pragmas in each template.js are the safe-zone linter's
// calibration source (src/templates.ts parses them). v0.6.0 found spotlight's
// pragmas were copied from minimal instead of measured: subtitle declared 4.2
// while style.css renders 4vw, and line-chrome declared 2.9 while .kc-line
// actually reserves padding-left 4.5vw — the exact false-negative class the
// v0.5.0 line-chrome fix claimed to close for all three templates. These tests
// pin the pragmas to the CSS so the two surfaces cannot drift apart again.

function cssBlock(css: string, selector: string): string {
  const m = css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}"));
  assert.ok(m, `selector ${selector} not found in style.css`);
  return m[1];
}

function vwProp(block: string, prop: string): number {
  const m = block.match(new RegExp(prop + ":\\s*([\\d.]+)vw"));
  assert.ok(m, `no ${prop} vw value in block: ${block}`);
  return Number(m[1]);
}

test("every template's font-ratios pragma matches its style.css font sizes", () => {
  for (const name of listBuiltinTemplates()) {
    const t: Template = resolveBuiltin(name);
    const css = readFileSync(join(t.dir, "style.css"), "utf8");
    const declared = parseTemplateFontRatios(t.js);
    assert.ok(declared, `${name} must declare a kinecard:font-ratios pragma`);
    // Round like the pragma parser does (vw/100 to 4 decimals) so 5.8/100
    // compares equal to 0.058 rather than 0.057999999999999996.
    const ratio = (vw: number) => Math.round((vw / 100) * 10000) / 10000;
    const expected = {
      title: ratio(vwProp(cssBlock(css, ".kc-title"), "font-size")),
      body: ratio(vwProp(cssBlock(css, ".kc-line"), "font-size")),
      subtitle: ratio(vwProp(cssBlock(css, ".kc-sub"), "font-size")),
    };
    assert.deepEqual(declared, expected, `${name}: font-ratios pragma must equal style.css`);
  }
});

test("minimal's line-chrome pragma equals its in-flow accent bar (width + margin)", () => {
  const t = resolveBuiltin("minimal");
  const css = readFileSync(join(t.dir, "style.css"), "utf8");
  const before = cssBlock(css, ".kc-line::before");
  // The chrome model only holds while the bar is in the text flow; if it ever
  // becomes position:absolute (like spotlight's) the number must be re-derived.
  assert.match(before, /display:\s*inline-block/, "minimal's bar must stay in flow");
  const chrome = vwProp(before, "width") + vwProp(before, "margin-right");
  assert.equal(parseTemplateLineChrome(t.js), chrome);
});

test("spotlight's line-chrome pragma equals its padding-left (the absolute bar consumes no flow width)", () => {
  const t = resolveBuiltin("spotlight");
  const css = readFileSync(join(t.dir, "style.css"), "utf8");
  const line = cssBlock(css, ".kc-line");
  const before = cssBlock(css, ".kc-line::before");
  assert.match(before, /position:\s*absolute/, "spotlight's bar must stay out of flow for the padding-left chrome model");
  assert.equal(parseTemplateLineChrome(t.js), vwProp(line, "padding-left"));
});

test("mono's line-chrome pragma stays at its measured value (num + gap + caret, not CSS-derivable)", () => {
  // mono's chrome depends on font metrics (two monospace digits + the caret's
  // em width), so it cannot be parsed from CSS; the measured 11.8vw boundary is
  // pinned by the mono wrap-boundary test in tests/linter.test.ts.
  assert.equal(parseTemplateLineChrome(resolveBuiltin("mono").js), 11.8);
});

test("spotlight calibration threads through lintCard: boundary text neither false-warns nor passes silently", () => {
  const t = resolveBuiltin("spotlight");
  const card = CardSchema.parse({ title: "标题", lines: [{ text: "一二三四五六七八九十一二三四" }] });
  const cfg = resolveRenderConfig(card, { preset: "douyin" }, t.timing);
  assert.equal(
    lintCard(card, cfg, t).filter((w) => w.kind === "safe-zone").length,
    0,
    "14 CJK chars (882px) fit spotlight's chrome-adjusted width (950.4 − 48.6px) — no warning",
  );

  // The chrome correction must be load-bearing: a latin line estimated at
  // 902.16px sits between the OLD 2.9vw boundary (919.4px, lint silent) and the
  // corrected 4.5vw boundary (901.8px of text box, physically wraps).
  const latin = `${"n ".repeat(16)}n`;
  assert.ok(Math.abs(estimateTextWidthPx(latin, 63) - 902.16) < 1e-6);
  const latinCard = CardSchema.parse({ title: "标题", lines: [{ text: latin }] });
  const latinCfg = resolveRenderConfig(latinCard, { preset: "douyin" }, t.timing);
  assert.equal(
    lintCard(latinCard, latinCfg, { fontRatios: t.fontRatios, lineChromeVw: 2.9 }).filter((w) => w.kind === "safe-zone").length,
    0,
    "the old 2.9vw chrome stayed silent for this line (the defect)",
  );
  assert.ok(
    lintCard(latinCard, latinCfg, t).some((w) => w.kind === "safe-zone"),
    "the corrected 4.5vw chrome warns for a line that physically wraps",
  );
});

test("spotlight subtitle no longer false-warns at the corrected 4vw ratio", () => {
  const t = resolveBuiltin("spotlight");
  const card = CardSchema.parse({
    title: "标题",
    subtitle: "一".repeat(22),
    lines: [{ text: "ok" }],
  });
  const cfg = resolveRenderConfig(card, { preset: "douyin" }, t.timing);
  assert.equal(
    lintCard(card, cfg, t).filter((w) => w.message.startsWith("subtitle")).length,
    0,
    "22 CJK chars (22 × 43px = 946px) fit the 950.4px safe width at 4vw",
  );
  assert.ok(
    lintCard(card, cfg, { fontRatios: { ...t.fontRatios, subtitle: 0.042 }, lineChromeVw: t.lineChromeVw })
      .some((w) => w.message.startsWith("subtitle")),
    "the old 4.2 ratio (22 × 45px = 990px) false-warned (the defect)",
  );
});
