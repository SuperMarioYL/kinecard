import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CardSchema, resolveRenderConfig } from "../src/schema";
import { resolveBuiltin } from "../src/templates";
import { writeProject, RENDER_FILE, TEMPLATE_DIR } from "../src/project";
import { checkSet, expandCheckInputs } from "../src/check";

function writeMonoProject(root: string, name: string, palette?: { accent: string }) {
  const dir = join(root, name);
  const card = CardSchema.parse({
    title: "标题",
    lines: [{ text: "一行" }],
    platform: "douyin",
    ...(palette ? { palette } : {}),
  });
  const template = resolveBuiltin("mono");
  const render = resolveRenderConfig(card, { preset: "douyin" }, template.timing);
  writeProject({ dir, card, render, template });
  return dir;
}

test("a set of projects sharing one style is consistent", () => {
  const root = mkdtempSync(join(tmpdir(), "kc-check-"));
  const a = writeMonoProject(root, "card-a");
  const b = writeMonoProject(root, "card-b");
  const result = checkSet([a, b]);
  assert.equal(result.cards.length, 2);
  assert.ok(result.consistent, "same template/palette/preset/timing → one style lock");
  assert.equal(result.issues.filter((i) => i.kind === "style-lock").length, 0);
});

test("a palette deviation breaks the lock and names the deviating input", () => {
  const root = mkdtempSync(join(tmpdir(), "kc-check-"));
  const a = writeMonoProject(root, "card-a");
  const b = writeMonoProject(root, "card-b", { accent: "#FF375F" });
  const result = checkSet([a, b]);
  assert.equal(result.consistent, false);
  const lock = result.issues.filter((i) => i.kind === "style-lock");
  assert.equal(lock.length, 1);
  assert.equal(lock[0].input, b);
  assert.match(lock[0].message, /palette/);
});

test("a preset deviation breaks the lock (render.json preset is what renders)", () => {
  const root = mkdtempSync(join(tmpdir(), "kc-check-"));
  const a = writeMonoProject(root, "card-a");
  const b = writeMonoProject(root, "card-b");
  const rj = JSON.parse(readFileSync(join(b, RENDER_FILE), "utf8"));
  rj.preset = "shipinhao";
  writeFileSync(join(b, RENDER_FILE), JSON.stringify(rj, null, 2));
  const result = checkSet([a, b]);
  assert.equal(result.consistent, false);
  assert.match(
    result.issues.find((i) => i.kind === "style-lock")!.message,
    /shipinhao.*douyin|douyin.*shipinhao/,
  );
});

test("a timing deviation breaks the lock", () => {
  const root = mkdtempSync(join(tmpdir(), "kc-check-"));
  const a = writeMonoProject(root, "card-a");
  const b = writeMonoProject(root, "card-b");
  const rj = JSON.parse(readFileSync(join(b, RENDER_FILE), "utf8"));
  rj.timing.perLineMs = 2200;
  writeFileSync(join(b, RENDER_FILE), JSON.stringify(rj, null, 2));
  const result = checkSet([a, b]);
  assert.equal(result.consistent, false);
  assert.match(result.issues.find((i) => i.kind === "style-lock")!.message, /timing/);
});

test("a template-source deviation breaks the lock and names the file", () => {
  const root = mkdtempSync(join(tmpdir(), "kc-check-"));
  const a = writeMonoProject(root, "card-a");
  const b = writeMonoProject(root, "card-b");
  const jsPath = join(b, TEMPLATE_DIR, "template.js");
  writeFileSync(jsPath, readFileSync(jsPath, "utf8") + "\n// a local style edit\n");
  const result = checkSet([a, b]);
  assert.equal(result.consistent, false);
  assert.match(
    result.issues.find((i) => i.kind === "style-lock")!.message,
    /template\.js/,
  );
});

test("a set directory expands to its project children", () => {
  const root = mkdtempSync(join(tmpdir(), "kc-check-set-"));
  writeMonoProject(root, "card-a");
  writeMonoProject(root, "card-b");
  const expanded = expandCheckInputs([root]);
  assert.deepEqual(
    expanded.map((p) => p.split("/").pop()).sort(),
    ["card-a", "card-b"],
    "a non-project dir stands for its project children",
  );
  // And the expanded set checks fine end to end.
  assert.ok(checkSet([root]).consistent);
});

test("per-card lint warnings surface but do not break the lock", () => {
  const root = mkdtempSync(join(tmpdir(), "kc-check-lint-"));
  const a = writeMonoProject(root, "card-a");
  const b = writeMonoProject(root, "card-b");
  // An over-long line in card-b: safe-zone warning, style lock intact.
  const cardPath = join(b, "card.yaml");
  const cardText = readFileSync(cardPath, "utf8").replace("一行", "一二三四五六七八九十一二三四五六七八");
  writeFileSync(cardPath, cardText);
  const result = checkSet([a, b]);
  assert.equal(result.consistent, true, "lint warnings are informational, like render");
  assert.ok(
    result.issues.some((i) => i.kind === "safe-zone" && i.input === b),
    "the over-long line must be reported",
  );
  const warned = result.cards.find((c) => c.input === b)!;
  assert.ok(warned.warnings.length >= 1);
});
