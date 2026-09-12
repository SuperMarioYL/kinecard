import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The npm package must ship every file the installed CLI reads at runtime.
// v0.4.0 omitted VERSION from `files`, so an installed package fell back to
// `kinecard --version` → 0.0.0 (verified via npm pack --dry-run); the release
// workflow packs this tarball on every tag. This guard keeps the packaged
// surface in sync with the code's runtime reads.

function pkg(): { files?: string[] } {
  return JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
}

test("the npm tarball ships VERSION (cli.ts version() reads <root>/VERSION)", () => {
  assert.ok(
    (pkg().files ?? []).includes("VERSION"),
    "package.json files must include VERSION — otherwise --version prints the 0.0.0 fallback",
  );
});

test("the npm tarball ships the runtime-read asset directories", () => {
  const files = pkg().files ?? [];
  assert.ok(files.includes("templates"), "builtinTemplatesDir() reads <root>/templates");
  assert.ok(files.includes("assets/fonts"), "bundledFontsDir() reads <root>/assets/fonts");
});
