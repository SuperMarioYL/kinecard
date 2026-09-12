import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, applyProjectRenderOverrides } from "../src/render";
import { RenderConfigSchema } from "../src/schema";

test("applyProjectRenderOverrides: --fps overrides fps only, preserving a customized size/timing", () => {
  // A project may carry a customized render.json (here a 720x1280 canvas);
  // --fps must touch fps and nothing else.
  const cfg = RenderConfigSchema.parse({
    preset: "douyin",
    fps: 30,
    size: [720, 1280],
    timing: { titleMs: 2000, perLineMs: 1500, lineInMs: 600, outroMs: 900 },
    safeZone: { top: 0.08, bottom: 0.18, left: 0.06, right: 0.06 },
  });
  const out = applyProjectRenderOverrides(cfg, { fps: 5 });
  assert.equal(out.fps, 5);
  assert.deepEqual(out.size, [720, 1280], "a non-overridden field must be preserved");
  assert.equal(out.preset, "douyin");
  assert.deepEqual(out.timing, cfg.timing);
  assert.deepEqual(out.safeZone, cfg.safeZone);
});

test("applyProjectRenderOverrides: --preset swaps the platform canvas + safe zone", () => {
  const cfg = RenderConfigSchema.parse({
    preset: "douyin",
    fps: 24,
    timing: { titleMs: 1400, perLineMs: 1300, lineInMs: 600, outroMs: 1200 },
  });
  const out = applyProjectRenderOverrides(cfg, { preset: "shipinhao" });
  assert.equal(out.preset, "shipinhao");
  assert.deepEqual(out.size, [1080, 1920]);
  assert.deepEqual(out.safeZone, { top: 0.09, bottom: 0.2, left: 0.06, right: 0.08 });
  assert.equal(out.fps, 24, "--preset alone must not touch fps");
  assert.deepEqual(out.timing, cfg.timing, "--preset alone must not touch timing");
});

test("applyProjectRenderOverrides: no flags → the project's render.json is fully honored", () => {
  const cfg = RenderConfigSchema.parse({
    preset: "bilibili",
    fps: 12,
    timing: { titleMs: 900, perLineMs: 800, lineInMs: 400, outroMs: 700 },
  });
  assert.deepEqual(applyProjectRenderOverrides(cfg, {}), cfg);
  assert.deepEqual(applyProjectRenderOverrides(cfg, { preset: undefined, fps: undefined }), cfg);
});

test("render({input: <non-project dir>}) throws a clear not-a-project error, not an opaque EISDIR", async () => {
  // A directory that exists but has no card.yaml. Before the fix this fell
  // through to loadCard(dir) -> readFileSync on a directory -> Node EISDIR.
  // The guard sits before any browser launch, so this is CI-safe (no Playwright).
  const dir = mkdtempSync(join(tmpdir(), "kc-dir-"));
  await assert.rejects(
    () => render({ input: dir }),
    /not a card\.yaml or a KineCard project/,
  );
});

test("render({input: <project dir>}) does not trip the not-a-project guard (it has card.yaml)", async () => {
  // A real project dir has card.yaml, so isProjectDir is true and render takes
  // the project-re-render branch — it never hits the not-a-project guard. It
  // will throw a downstream project error (missing template/), but NOT the
  // not-a-project message, proving the guard does not misfire on real projects.
  const dir = mkdtempSync(join(tmpdir(), "kc-proj-"));
  writeFileSync(join(dir, "card.yaml"), "title: t\nlines:\n  - text: a\n");
  writeFileSync(join(dir, "render.json"), JSON.stringify({
    preset: "douyin", fps: 30, size: [1080, 1920],
    timing: { titleMs: 1400, perLineMs: 1300, lineInMs: 600, outroMs: 1200 },
    safeZone: { top: 0.08, bottom: 0.18, left: 0.06, right: 0.06 },
  }));
  await assert.rejects(
    () => render({ input: dir }),
    (err: Error) => !/not a card\.yaml or a KineCard project/.test(err.message),
  );
});
