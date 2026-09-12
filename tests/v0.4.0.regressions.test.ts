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

test("fix-project-rerender-lint-font-ratios: a mono project's template carries mono calibration (no false warn for text that fits)", () => {
  // The project re-render fix (src/render.ts) calls resolveProjectTemplate(input)
  // and threads its calibration into lintCard. This guards the contract that
  // path relies on: a written project's own template carries the right ratios
  // AND line chrome (the pragmas are copied verbatim into
  // <project>/template/template.js by writeProject), so lintCard with that
  // calibration does NOT false-warn for boundary text that fits — and DOES warn
  // for text that physically wraps. Boundaries are measured on the real template:
  // mono's row chrome (num + caret ≈ 11.8vw) leaves ~823px of the 950.4px safe
  // width; 14 CJK chars (786px) fit, 16 (898px) wrap to two rows. v0.4.0
  // asserted the opposite for the 16-char case — the chrome-blind false
  // negative closed in v0.5.0.
  const dir = join(mkdtempSync(join(tmpdir(), "kc-rerend-reg-")), "mono-proj");
  const text = "一二三四五六七八九十一二三四";
  const card = CardSchema.parse({ title: "标题", lines: [{ text }], platform: "douyin" });
  const template = resolveBuiltin("mono");
  const renderCfg = resolveRenderConfig(card, { preset: "douyin" }, template.timing);
  writeProject({ dir, card, render: renderCfg, template });

  // The project's own template must expose mono's calibration (the pragmas are
  // copied verbatim into <project>/template/template.js by writeProject).
  const projTemplate = resolveProjectTemplate(dir);
  assert.deepEqual(projTemplate.fontRatios, { title: 0.076, body: 0.052, subtitle: 0.038 });
  assert.equal(projTemplate.lineChromeVw, 11.8);

  // lintCard with the project template's calibration → no false safe-zone warning.
  const withMetrics = lintCard(card, renderCfg, projTemplate);
  assert.equal(
    withMetrics.filter((w) => w.kind === "safe-zone").length,
    0,
    "mono project calibration must not false-warn for 14 CJK chars that fit",
  );
  // Prove the chrome is genuinely threaded: the same 16-CJK text that v0.4.0
  // let pass silently (mono ratios alone: 898 ≤ 950) must now warn, because the
  // chrome-adjusted width (~823px) is what the template actually renders into.
  const longCard = CardSchema.parse({
    title: "标题",
    lines: [{ text: "一二三四五六七八九十一二三四五六" }],
    platform: "douyin",
  });
  assert.ok(
    lintCard(longCard, renderCfg, projTemplate).filter((w) => w.kind === "safe-zone").length >= 1,
    "16 CJK chars physically wrap in mono (measured) — the project calibration must warn",
  );
});
