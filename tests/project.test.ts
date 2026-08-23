import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CardSchema, resolveRenderConfig } from "../src/schema";
import { resolveBuiltin } from "../src/templates";
import {
  isProjectDir,
  loadProject,
  writeProject,
  CARD_FILE,
  RENDER_FILE,
  TEMPLATE_DIR,
} from "../src/project";

function fixture() {
  const card = CardSchema.parse({
    title: "项目标题",
    lines: [{ text: "第一行" }, { text: "第二行", accent: "#2DC79A" }],
    platform: "shipinhao",
  });
  const render = resolveRenderConfig(card, { preset: "shipinhao" });
  const template = resolveBuiltin("spotlight");
  return { card, render, template };
}

test("writeProject materializes card.yaml + render.json + template/", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "kc-proj-")), "my-card");
  const { card, render, template } = fixture();
  writeProject({ dir, card, render, template });

  assert.ok(existsSync(join(dir, CARD_FILE)));
  assert.ok(existsSync(join(dir, RENDER_FILE)));
  assert.ok(existsSync(join(dir, TEMPLATE_DIR, "template.html")));
  assert.ok(existsSync(join(dir, TEMPLATE_DIR, "style.css")));
  assert.ok(existsSync(join(dir, TEMPLATE_DIR, "template.js")));
  assert.ok(isProjectDir(dir));
});

test("loadProject round-trips a written project", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "kc-proj-")), "my-card");
  const { card, render, template } = fixture();
  writeProject({ dir, card, render, template });

  const loaded = loadProject(dir);
  assert.equal(loaded.card.title, card.title);
  assert.equal(loaded.card.lines.length, 2);
  assert.equal(loaded.render.preset, "shipinhao");
  assert.ok(loaded.templateHtmlPath.endsWith("template.html"));
  assert.ok(loaded.outFile.endsWith("out.mp4"));
});

test("an edit to card.yaml is visible on the next load (single-card re-render source)", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "kc-proj-")), "my-card");
  const { card, render, template } = fixture();
  writeProject({ dir, card, render, template });

  const cardPath = join(dir, CARD_FILE);
  const edited = readFileSync(cardPath, "utf8").replace("第一行", "改过的第一行");
  writeFileSync(cardPath, edited);

  const loaded = loadProject(dir);
  assert.equal(loaded.card.lines[0].text, "改过的第一行");
});

test("loadProject rejects a directory that is not a project", () => {
  const dir = mkdtempSync(join(tmpdir(), "kc-empty-"));
  assert.equal(isProjectDir(dir), false);
  assert.throws(() => loadProject(dir), /not a KineCard project/);
});

test("card-mode render.json carries mono's designed timing, not the schema default", () => {
  // Before the fix, resolveRenderConfig passed no timing, so TimingSchema defaults
  // (1400/1300/600/1200) were persisted to render.json for every template,
  // discarding mono's 1300/1600/900/1300. The re-render then never recovered the
  // template's pacing and the MP4 stopped matching the template.html preview.
  const dir = join(mkdtempSync(join(tmpdir(), "kc-proj-")), "mono-card");
  const card = CardSchema.parse({
    title: "标题",
    lines: [{ text: "一行" }],
    platform: "douyin",
  });
  const template = resolveBuiltin("mono");
  const render = resolveRenderConfig(card, {}, template.timing);
  writeProject({ dir, card, render, template });
  const rj = JSON.parse(readFileSync(join(dir, RENDER_FILE), "utf8"));
  assert.deepEqual(rj.timing, {
    titleMs: 1300,
    perLineMs: 1600,
    lineInMs: 900,
    outroMs: 1300,
  });
});

test("spotlight render.json carries spotlight's designed timing", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "kc-proj-")), "spot-card");
  const card = CardSchema.parse({
    title: "标题",
    lines: [{ text: "一行" }],
    platform: "douyin",
  });
  const template = resolveBuiltin("spotlight");
  const render = resolveRenderConfig(card, {}, template.timing);
  writeProject({ dir, card, render, template });
  const rj = JSON.parse(readFileSync(join(dir, RENDER_FILE), "utf8"));
  assert.deepEqual(rj.timing, {
    titleMs: 1400,
    perLineMs: 1500,
    lineInMs: 640,
    outroMs: 1200,
  });
});

test("an explicit timing override still wins over the template's designed default", () => {
  const card = CardSchema.parse({
    title: "t",
    lines: [{ text: "a" }],
    platform: "douyin",
  });
  const template = resolveBuiltin("mono");
  const render = resolveRenderConfig(card, { timing: { titleMs: 2000 } }, template.timing);
  assert.equal(render.timing.titleMs, 2000); // explicit override wins
  assert.equal(render.timing.perLineMs, 1600); // template default fills the rest
});

test("writeProject rewrites the bundled-font URL to an absolute file:// path", () => {
  // Before the fix, writeProject copied style.css verbatim, preserving the
  // relative `url("../../assets/fonts/...")`, which 404s from <project>/template/
  // and makes the project preview fall back to host system CJK fonts (a WYSIWYG
  // break vs. the rendered MP4, which uses the renderer's absolute file:// face).
  const dir = join(mkdtempSync(join(tmpdir(), "kc-proj-")), "font-card");
  const card = CardSchema.parse({
    title: "标题",
    lines: [{ text: "一行" }],
    platform: "douyin",
  });
  const template = resolveBuiltin("minimal");
  const render = resolveRenderConfig(card, {}, template.timing);
  writeProject({ dir, card, render, template });
  const css = readFileSync(join(dir, TEMPLATE_DIR, "style.css"), "utf8");
  assert.match(css, /url\('file:\/\//, "font URL should be an absolute file:// URL");
  assert.doesNotMatch(
    css,
    /\.\.\/\.\.\/assets\/fonts/,
    "the relative ../../assets/fonts URL should be rewritten on copy",
  );
  // The rewritten face must point at the same woff2 the renderer injects.
  assert.match(css, /NotoSansSC-KineCard-Regular\.woff2/);
});
