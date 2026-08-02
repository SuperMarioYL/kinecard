import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CardSchema,
  computeDurationMs,
  loadCard,
  loadRenderConfig,
  PLATFORM_PRESETS,
  PLATFORMS,
  resolveRenderConfig,
  TimingSchema,
} from "../src/schema";

test("a well-formed card parses", () => {
  const card = CardSchema.parse({
    title: "标题",
    lines: [{ text: "第一行" }, { text: "第二行", accent: "#FF375F" }],
    platform: "douyin",
  });
  assert.equal(card.title, "标题");
  assert.equal(card.lines.length, 2);
  assert.equal(card.lines[1].accent, "#FF375F");
  assert.equal(card.platform, "douyin");
});

test("platform defaults to douyin when omitted", () => {
  const card = CardSchema.parse({ title: "t", lines: [{ text: "a" }] });
  assert.equal(card.platform, "douyin");
});

test("a card with no lines is rejected", () => {
  assert.throws(() => CardSchema.parse({ title: "t", lines: [] }));
});

test("a non-hex accent is rejected", () => {
  assert.throws(() =>
    CardSchema.parse({ title: "t", lines: [{ text: "a", accent: "red" }] }),
  );
});

test("loadCard reads + validates a yaml file, throwing readably on bad input", () => {
  const dir = mkdtempSync(join(tmpdir(), "kc-schema-"));
  const good = join(dir, "good.yaml");
  writeFileSync(good, "title: 标题\nlines:\n  - text: 一\n  - text: 二\n");
  const card = loadCard(good);
  assert.equal(card.lines.length, 2);

  const bad = join(dir, "bad.yaml");
  writeFileSync(bad, "lines: []\n"); // missing title
  assert.throws(() => loadCard(bad), /invalid card/);
});

test("every platform has a preset with a 1080x1920 canvas", () => {
  for (const p of PLATFORMS) {
    const preset = PLATFORM_PRESETS[p];
    assert.deepEqual(preset.size, [1080, 1920]);
    assert.ok(preset.maxDurationSec > 0);
    assert.ok(preset.fps >= 1);
  }
});

test("resolveRenderConfig uses the platform preset as the base", () => {
  const card = CardSchema.parse({ title: "t", lines: [{ text: "a" }], platform: "bilibili" });
  const cfg = resolveRenderConfig(card);
  assert.equal(cfg.preset, "bilibili");
  assert.deepEqual(cfg.size, [1080, 1920]);
  assert.equal(cfg.fps, 30);
});

test("resolveRenderConfig honours preset + fps overrides", () => {
  const card = CardSchema.parse({ title: "t", lines: [{ text: "a" }] });
  const cfg = resolveRenderConfig(card, { preset: "shipinhao", fps: 24 });
  assert.equal(cfg.preset, "shipinhao");
  assert.equal(cfg.fps, 24);
});

test("computeDurationMs = title + n*perLine + outro", () => {
  const timing = TimingSchema.parse({
    titleMs: 1000,
    perLineMs: 1000,
    lineInMs: 500,
    outroMs: 1000,
  });
  assert.equal(computeDurationMs(timing, 3), 1000 + 3 * 1000 + 1000);
  assert.equal(computeDurationMs(timing, 0), 2000);
});

test("loadCard wraps a malformed-YAML syntax error with file context", () => {
  const dir = mkdtempSync(join(tmpdir(), "kc-yaml-"));
  const broken = join(dir, "broken.yaml");
  // Unterminated quoted scalar → a YAML scanner error, not a zod error.
  writeFileSync(broken, 'title: "unterminated string\nlines: []\n');
  assert.throws(() => loadCard(broken), /invalid card .*broken\.yaml/);
});

test("loadRenderConfig wraps a malformed-JSON syntax error with file context", () => {
  const dir = mkdtempSync(join(tmpdir(), "kc-json-"));
  const broken = join(dir, "broken.json");
  writeFileSync(broken, "{ not valid json ]");
  assert.throws(() => loadRenderConfig(broken), /invalid render manifest .*broken\.json/);
});
