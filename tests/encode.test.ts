import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFfmpegArgs } from "../src/encode";

test("buildFfmpegArgs pins the broadly-compatible H.264 profile", () => {
  const args = buildFfmpegArgs({
    frameDir: "/tmp/frames",
    fps: 30,
    size: [1080, 1920],
    outFile: "/tmp/out.mp4",
  });
  const s = args.join(" ");
  assert.match(s, /-framerate 30/);
  assert.match(s, /libx264/);
  assert.match(s, /yuv420p/);
  assert.match(s, /\+faststart/);
  assert.equal(args[args.length - 1], "/tmp/out.mp4");
});

test("buildFfmpegArgs uses the zero-padded frame glob and target size", () => {
  const args = buildFfmpegArgs({
    frameDir: "/frames",
    fps: 24,
    size: [1080, 1920],
    outFile: "out.mp4",
  });
  const s = args.join(" ");
  assert.match(s, /\/frames\/frame-%06d\.png/);
  assert.match(s, /scale=1080:1920/);
  assert.match(s, /-framerate 24/);
});
