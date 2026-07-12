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
