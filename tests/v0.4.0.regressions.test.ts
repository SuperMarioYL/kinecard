import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CardSchema, resolveRenderConfig } from "../src/schema";
import { resolveBuiltin, resolveProjectTemplate } from "../src/templates";
import { lintCard } from "../src/render";
import { writeProject, RENDER_FILE } from "../src/project";

// v0.4.0 regressions — two sibling-path defects the v0.3.0 fix-driven minor
// closed for card mode but missed: (1) `kinecard init` didn't thread the
// template's designed timing into the scaffolded render.json; (2) the project
// re-render path didn't thread the project template's font ratios into the
// safe-zone linter. Each test reproduces the bug, then asserts the fix.

test("fix-init-ignores-template-timing: `kinecard init -t mono` writes mono's designed timing to render.json", () => {
  // Exercises the real init command (src/cli.ts) via tsx so a future regression
  // that drops `template.timing` from the init action is caught. Before the fix
  // init called resolveRenderConfig(card, { preset }) with no template timing,
  // so render.json carried TimingSchema defaults (1400/1300/600/1200) instead
  // of mono's (1300/1600/900/1300) — the template.html preview ran at mono's
  // pacing while a re-render read the default-timed render.json and ran at a
  // different pace (WYSIWYG break, same class as the v0.3.0 card-mode fix).
  const dir = join(mkdtempSync(join(tmpdir(), "kc-init-reg-")), "mono-init");
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "init", dir, "-t", "mono"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(r.status, 0, `init -t mono failed (status ${r.status}): ${r.stderr}`);
  const rj = JSON.parse(readFileSync(join(dir, RENDER_FILE), "utf8"));
  assert.deepEqual(rj.timing, {
    titleMs: 1300,
    perLineMs: 1600,
    lineInMs: 900,
    outroMs: 1300,
  });
});

test("fix-init-ignores-template-timing: `kinecard init -t spotlight` writes spotlight's designed timing", () => {
  // Spotlight's designed pacing (1400/1500/640/1200) differs from the schema
  // default on perLineMs/lineInMs, so this catches a default-leak for a second
  // template (mono alone could in theory coincide, spotlight cannot).
  const dir = join(mkdtempSync(join(tmpdir(), "kc-init-reg-")), "spot-init");
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "init", dir, "-t", "spotlight"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(r.status, 0, `init -t spotlight failed (status ${r.status}): ${r.stderr}`);
  const rj = JSON.parse(readFileSync(join(dir, RENDER_FILE), "utf8"));
  assert.deepEqual(rj.timing, {
    titleMs: 1400,
    perLineMs: 1500,
    lineInMs: 640,
    outroMs: 1200,
  });
});

test("fix-project-rerender-lint-font-ratios: a mono project's template carries mono ratios (no false safe-zone warn)", () => {
  // The project re-render fix (src/render.ts) calls resolveProjectTemplate(input)
  // and threads .fontRatios into lintCard. This guards the contract that path
  // relies on: a written project's own template carries the right ratios, so
  // lintCard with those ratios does NOT false-warn for boundary text that fits.
  // Before the fix the project branch left lintFontRatios undefined → lintCard
  // used the minimal/spotlight defaults (8.6/5.8/4.2) → false-positive warnings
  // for mono text that actually fits (same class as the v0.3.0 card-mode fix).
  const dir = join(mkdtempSync(join(tmpdir(), "kc-rerend-reg-")), "mono-proj");
  // 16 CJK ideographs — fits mono's 5.2vw body (≈56px → 896 ≤ 950 safeWidth)
  // but overflows the default 5.8vw (≈63px → 1008 > 950).
  const text = "一二三四五六七八九十一二三四五六";
  const card = CardSchema.parse({ title: "标题", lines: [{ text }], platform: "douyin" });
  const template = resolveBuiltin("mono");
  const renderCfg = resolveRenderConfig(card, { preset: "douyin" }, template.timing);
  writeProject({ dir, card, render: renderCfg, template });

  // The project's own template must expose mono's ratios (the pragma is copied
  // verbatim into <project>/template/template.js by writeProject).
  const projTemplate = resolveProjectTemplate(dir);
  assert.deepEqual(projTemplate.fontRatios, { title: 0.076, body: 0.052, subtitle: 0.038 });

  // lintCard with the project template's ratios → no false safe-zone warning.
  const withRatios = lintCard(card, renderCfg, projTemplate.fontRatios);
  assert.equal(
    withRatios.filter((w) => w.kind === "safe-zone").length,
    0,
    "mono project ratios must not false-warn for 16 CJK chars that fit",
  );
  // Prove the text is genuinely at the boundary: the default ratios DO warn
  // (the bug) — so the project ratios are what silence it, not a short text.
  const withDefaults = lintCard(card, renderCfg);
  assert.ok(
    withDefaults.filter((w) => w.kind === "safe-zone").length >= 1,
    "the default ratios must warn for the same boundary text",
  );
});
