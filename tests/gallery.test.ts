import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { galleryHtml, renderGallery } from "../src/gallery";
import { listBuiltinTemplates, TEMPLATE_META } from "../src/templates";

// The browser-backed gallery render follows the same self-skip pattern as
// tests/render.e2e.test.ts (software-GL CI screenshots hang; no Chromium → skip).
function chromiumAvailable(): boolean {
  try {
    const p = chromium.executablePath();
    return !!p && existsSync(p);
  } catch {
    return false;
  }
}
const ON_CI = !!process.env.CI && process.env.KINECARD_E2E !== "1";
const SKIP = !chromiumAvailable() || ON_CI;
const skipReason = ON_CI
  ? "e2e render skipped on CI (headless software-GL screenshot hangs; set KINECARD_E2E=1 to force)"
  : "Chromium not installed (run: npx playwright install chromium)";
const opts = { skip: SKIP ? skipReason : false };

const TINY = "title: 单元测试\nlines:\n  - text: 一条要点\nplatform: douyin\n";

test("galleryHtml embeds one relative video per template with name and blurb", () => {
  const entries = listBuiltinTemplates().map((t) => ({ template: t, outFile: `${t}.mp4` }));
  const html = galleryHtml(entries, "标题<注入>");
  for (const e of entries) {
    // Relative reference — the MP4s always sit next to gallery.html; an
    // absolute path would leak the local filesystem and break when moved.
    assert.ok(html.includes(`src="./${e.template}.mp4"`), `must embed ./${e.template}.mp4`);
    assert.ok(html.includes(`<strong>${e.template}</strong>`), `must name ${e.template}`);
    const blurb = TEMPLATE_META[e.template] ?? "";
    if (blurb) assert.ok(html.includes(blurb), `must carry ${e.template}'s blurb`);
  }
  // The card title is HTML-escaped.
  assert.ok(html.includes("标题&lt;注入&gt;"));
  assert.ok(!html.includes("标题<注入>"));
});

test("galleryHtml never embeds an absolute local path, even for absolute outDir entries", () => {
  // v0.6.0 regression: entries carried the resolved-absolute outDir join, so a
  // gallery.html generated under the invoking user's home embedded absolute
  // home-directory video srcs — leaking the local layout and 404-ing the
  // moment the directory moved.
  const abs = join(mkdtempSync(join(tmpdir(), "kc-gal-")), "minimal.mp4");
  const html = galleryHtml([{ template: "minimal", outFile: abs }], "标题");
  assert.ok(html.includes('src="./minimal.mp4"'), "must embed the relative reference");
  assert.ok(!html.includes(`src="${abs}"`), "must not embed the absolute path");
  assert.ok(!/src="\//.test(html), "no absolute-path video srcs");
});

test("renderGallery renders the card with every built-in template + writes the index", opts, async () => {
  const dir = mkdtempSync(join(tmpdir(), "kc-gallery-"));
  const cardPath = join(dir, "card.yaml");
  writeFileSync(cardPath, TINY);
  const outDir = join(dir, "my-gallery");

  const result = await renderGallery({ input: cardPath, outDir, fps: 5 });
  assert.deepEqual(
    result.entries.map((e) => e.template).sort(),
    [...listBuiltinTemplates()].sort(),
    "one render per built-in template",
  );
  for (const e of result.entries) {
    assert.ok(existsSync(e.outFile), `${e.outFile} should exist`);
    assert.ok(e.outFile.endsWith(`${e.template}.mp4`));
  }
  assert.ok(existsSync(result.htmlPath), "gallery.html should exist");
  const html = readFileSync(result.htmlPath, "utf8");
  assert.ok(html.includes("单元测试"), "the index names the card title");
});
