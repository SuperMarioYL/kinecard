import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listBuiltinTemplates,
  resolveBuiltin,
  resolveProjectTemplate,
} from "../src/templates";

test("the three built-in templates are present", () => {
  const names = listBuiltinTemplates();
  for (const expected of ["minimal", "spotlight", "mono"]) {
    assert.ok(names.includes(expected), `missing template: ${expected}`);
  }
});

test("resolveBuiltin returns the three source files", () => {
  const t = resolveBuiltin("minimal");
  assert.equal(t.name, "minimal");
  assert.ok(t.html.includes("<html"));
  assert.ok(t.css.length > 0);
  assert.ok(t.js.length > 0);
});

test("every built-in template exposes the KineCard.seek contract", () => {
  for (const name of listBuiltinTemplates()) {
    const t = resolveBuiltin(name);
    assert.match(t.js, /window\.KineCard/, `${name} must define window.KineCard`);
    assert.match(t.js, /seek/, `${name} must define seek()`);
    assert.match(t.js, /duration/, `${name} must expose duration`);
  }
});

test("an unknown template name throws with the available list", () => {
  assert.throws(() => resolveBuiltin("does-not-exist"), /unknown template/);
});

test("resolveProjectTemplate errors when there is no template/ dir", () => {
  assert.throws(() => resolveProjectTemplate("/nonexistent/path"), /no template/);
});
