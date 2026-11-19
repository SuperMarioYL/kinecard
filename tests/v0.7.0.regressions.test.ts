import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CardSchema, loadCard, loadRenderConfig, resolveRenderConfig } from "../src/schema";
import { resolveBuiltin } from "../src/templates";
import { writeProject, RENDER_FILE, TEMPLATE_DIR, CARD_FILE } from "../src/project";
import { checkSet } from "../src/check";

// v0.7.0 regressions — four defects found by reading the shipped v0.6.0 source and
// reproduced before the fix. Each test fails on v0.6.0 and passes after.

function makeProject(root: string, name: string, template: "minimal" | "mono" = "mono"): string {
  const dir = join(root, name);
  const card = CardSchema.parse({ title: "标题", lines: [{ text: "一行" }], platform: "douyin" });
  const tpl = resolveBuiltin(template);
  writeProject({ dir, card, render: resolveRenderConfig(card, {}, tpl.timing), template: tpl });
  return dir;
}

function writeBareCard(root: string, name: string): string {
  const p = join(root, name);
  writeFileSync(p, "title: 序章\nlines:\n  - text: 一行\nplatform: douyin\n");
  return p;
}

test("fix-check-stylelock-install-path: the same template scaffolded from two install locations stays style-locked", () => {
  // writeProject rewrites the bundled-font URL to an absolute file:// path at the
  // CLI's install location (the v0.3.0 WYSIWYG fix). On v0.6.0 the style lock
  // compared style.css byte-for-byte, so a teammate's card (or a moved checkout)
  // reported "the set does not share one template" and check exited 1.
  const root = mkdtempSync(join(tmpdir(), "kc-v070-m1-"));
  const a = makeProject(root, "card-a");
  const b = makeProject(root, "card-b");
  const cssPath = join(b, TEMPLATE_DIR, "style.css");
  const css = readFileSync(cssPath, "utf8");
  assert.match(css, /url\('file:\/\//, "precondition: writeProject injects an absolute font URL");
  writeFileSync(
    cssPath,
    css.replace(/file:\/\/[^')]*\/assets\/fonts\//g, "file:///home/teammate/kinecard/assets/fonts/"),
  );

  const result = checkSet([a, b]);
  assert.equal(
    result.issues.filter((i) => i.kind === "style-lock").length,
    0,
    "a different install path is not a different style",
  );
  assert.equal(result.consistent, true);

  // Negative assertion: the normalization must not decay into "ignore style.css".
  writeFileSync(cssPath, readFileSync(cssPath, "utf8") + "\n.kc-line { color: #ff0000; }\n");
  const edited = checkSet([a, b]);
  assert.equal(edited.consistent, false, "a real style edit must still break the lock");
  assert.ok(
    edited.issues.some((i) => i.kind === "style-lock" && /style\.css/.test(i.message)),
    "the deviating file must be named",
  );
});

test("fix-check-stylelock-bare-reference: a leading card.yaml cannot disable the project-vs-project style lock", () => {
  // checkSet gated timing/template comparison on `ref.projectDir && c.projectDir`
  // with ref = cards[0]. With a bare card first, two projects were never compared:
  // v0.6.0 returned consistent=true (exit 0) for a set with different templates.
  const root = mkdtempSync(join(tmpdir(), "kc-v070-m2-"));
  const bare = writeBareCard(root, "intro.yaml");
  const mono = makeProject(root, "card-a", "mono");
  const minimal = makeProject(root, "card-b", "minimal");

  const mixed = checkSet([bare, mono, minimal]);
  assert.equal(mixed.consistent, false, "different templates must fail the lock even with a card.yaml first");
  const lockMessages = mixed.issues.filter((i) => i.kind === "style-lock").map((i) => i.message);
  assert.ok(lockMessages.some((m) => /template/.test(m)), "the template difference must be reported");
  assert.ok(lockMessages.some((m) => /timing/.test(m)), "the pacing difference must be reported");

  // No over-correction: the same projects without the bare card still fail.
  assert.equal(checkSet([mono, minimal]).consistent, false);
});

test("fix-schema-strict-user-config: a typo'd key in card.yaml / render.json fails loudly instead of using a default", () => {
  // zod objects are non-strict by default: v0.6.0 stripped `platfrom:`/`accentt:`
  // and `perlineMs:` silently and rendered the default preset / palette / pacing.
  const dir = mkdtempSync(join(tmpdir(), "kc-v070-m3-"));

  const typoPlatform = join(dir, "typo-platform.yaml");
  writeFileSync(typoPlatform, "title: 标题\nlines:\n  - text: 一行\nplatfrom: bilibili\n");
  assert.throws(() => loadCard(typoPlatform), /invalid card.*platfrom/s);

  const typoAccent = join(dir, "typo-accent.yaml");
  writeFileSync(typoAccent, 'title: 标题\nlines:\n  - text: 一行\n    accentt: "#FF375F"\n');
  assert.throws(() => loadCard(typoAccent), /invalid card.*accentt/s);

  const typoRender = join(dir, "typo-render.json");
  writeFileSync(typoRender, JSON.stringify({ preset: "douyin", perlineMs: 9000 }));
  assert.throws(() => loadRenderConfig(typoRender), /invalid render manifest.*perlineMs/s);

  // No over-correction: well-formed files still load, with defaults applied.
  const good = join(dir, "good.yaml");
  writeFileSync(good, "title: 标题\nlines:\n  - text: 一行\nplatform: bilibili\n");
  assert.equal(loadCard(good).platform, "bilibili");
});

test("fix-project-overwrite-data-loss: writing a project over an existing project is refused and preserves the edits", () => {
  // writeProject unconditionally rewrote card.yaml/render.json/template/, so
  // re-running the README's `render card.yaml --project my-card/` destroyed the
  // edits the card.yaml header invites (reproduced through the CLI on v0.6.0).
  const root = mkdtempSync(join(tmpdir(), "kc-v070-m4-"));
  const dir = makeProject(root, "my-card");
  const cardPath = join(dir, CARD_FILE);
  const edited = readFileSync(cardPath, "utf8").replace("标题", "我的课程第一章");
  writeFileSync(cardPath, edited);

  const card = CardSchema.parse({ title: "别的标题", lines: [{ text: "一行" }], platform: "douyin" });
  const tpl = resolveBuiltin("mono");
  assert.throws(
    () => writeProject({ dir, card, render: resolveRenderConfig(card, {}, tpl.timing), template: tpl }),
    /refusing to overwrite/,
  );
  assert.equal(readFileSync(cardPath, "utf8"), edited, "the edited card.yaml must be untouched");

  // No over-correction: a fresh directory (and an empty non-project dir) still scaffolds.
  const fresh = join(root, "fresh-card");
  assert.equal(
    writeProject({ dir: fresh, card, render: resolveRenderConfig(card, {}, tpl.timing), template: tpl }),
    fresh,
  );
  assert.ok(readFileSync(join(fresh, RENDER_FILE), "utf8").includes("timing"));
});
