import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "../src/render";

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
