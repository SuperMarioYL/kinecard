import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFps } from "../src/cli";

// v0.6.0 regression — the `--fps` option parser was a bare parseInt, so
// `--fps abc` reached card mode as NaN and surfaced a raw ZodError dump, while
// project mode silently swallowed it (reproduced: a full render at the
// project's own fps, exit 0, no warning) and `--fps -5` ran unvalidated into
// the frame engine and died in a cryptic ffmpeg error. The CLI now rejects
// non-integer / out-of-range values at parse time, before any render work.

test("parseFps accepts integers within the schema's 1..60 bounds", () => {
  for (const v of ["1", "5", "30", "60"]) {
    assert.equal(parseFps(v), Number(v));
  }
});

test("parseFps rejects garbage, zero, negative, fractional and out-of-range values", () => {
  for (const v of ["abc", "", "0", "-5", "0.5", "61", "1e3"]) {
    assert.throws(() => parseFps(v), /between 1 and 60/, `must reject "${v}"`);
  }
});

test("CLI rejects `--fps abc` with a readable error and renders nothing (card input)", () => {
  const out = join(mkdtempSync(join(tmpdir(), "kc-fps-")), "out.mp4");
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "render", join(out, "..", "card.yaml"), "-o", out, "--fps", "abc"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.notEqual(r.status, 0, "must exit non-zero");
  assert.match(r.stderr, /--fps/, "the error must name the flag");
  assert.match(r.stderr, /fps must be an integer between 1 and 60/, "the error must be readable");
  assert.ok(!existsSync(out), "no output MP4 may be written");
});

test("CLI rejects `--fps abc` before touching a project input (the formerly silent path)", () => {
  // The rejection happens at option-parse time, before the render action runs,
  // so a directory input must fail the same way instead of silently rendering
  // at the project's own fps (the v0.5.0-and-earlier behavior).
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "render", "/tmp/kc-fps-no-such-project/", "--fps", "abc"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.notEqual(r.status, 0, "must exit non-zero");
  assert.match(r.stderr, /fps must be an integer between 1 and 60/);
});
