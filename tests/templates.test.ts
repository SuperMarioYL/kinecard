import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listBuiltinTemplates,
  resolveBuiltin,
  resolveProjectTemplate,
  parseTemplateTiming,
  parseTemplateFontRatios,
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

test("parseTemplateTiming extracts the t.<field> || <ms> fallbacks (single source)", () => {
  const js =
    "var timing = { titleMs: t.titleMs || 1300, perLineMs: t.perLineMs || 1600," +
    " lineInMs: t.lineInMs || 900, outroMs: t.outroMs || 1300 };";
  assert.deepEqual(parseTemplateTiming(js), {
    titleMs: 1300,
    perLineMs: 1600,
    lineInMs: 900,
    outroMs: 1300,
  });
  assert.deepEqual(parseTemplateTiming("no timing here"), {});
});

test("parseTemplateFontRatios extracts the kinecard:font-ratios pragma (vw→ratio)", () => {
  const js = "// kinecard:font-ratios title=7.6 body=5.2 subtitle=3.8";
  assert.deepEqual(parseTemplateFontRatios(js), {
    title: 0.076,
    body: 0.052,
    subtitle: 0.038,
  });
  assert.equal(parseTemplateFontRatios("no pragma"), undefined);
});

test("each built-in template exposes its designed timing (not the schema default)", () => {
  // Before the fix, card mode applied TimingSchema defaults (1400/1300/600/1200)
  // to every template, discarding mono/spotlight's designed pacing.
  assert.deepEqual(resolveBuiltin("mono").timing, {
    titleMs: 1300,
    perLineMs: 1600,
    lineInMs: 900,
    outroMs: 1300,
  });
  assert.deepEqual(resolveBuiltin("spotlight").timing, {
    titleMs: 1400,
    perLineMs: 1500,
    lineInMs: 640,
    outroMs: 1200,
  });
  // minimal's designed timing == TimingSchema defaults (unchanged).
  assert.deepEqual(resolveBuiltin("minimal").timing, {
    titleMs: 1400,
    perLineMs: 1300,
    lineInMs: 600,
    outroMs: 1200,
  });
});

test("each built-in template exposes its linter font-ratios", () => {
  assert.deepEqual(resolveBuiltin("mono").fontRatios, {
    title: 0.076,
    body: 0.052,
    subtitle: 0.038,
  });
  assert.deepEqual(resolveBuiltin("minimal").fontRatios, {
    title: 0.086,
    body: 0.058,
    subtitle: 0.042,
  });
  assert.deepEqual(resolveBuiltin("spotlight").fontRatios, {
    title: 0.086,
    body: 0.058,
    subtitle: 0.042,
  });
});
