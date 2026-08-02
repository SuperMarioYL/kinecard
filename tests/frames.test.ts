import { test } from "node:test";
import assert from "node:assert/strict";
import { bundledFontFaceCss, frameTimeline, frameName } from "../src/frames";

test("frameTimeline yields fps*seconds frames starting at t=0", () => {
  const times = frameTimeline(30, 2000); // 2s @ 30fps
  assert.equal(times.length, 60);
  assert.equal(times[0], 0);
  // last frame just under the 2s mark
  assert.ok(times[times.length - 1] < 2000);
});

test("frameTimeline step is 1000/fps", () => {
  const times = frameTimeline(10, 1000);
  assert.equal(times.length, 10);
  assert.equal(times[1] - times[0], 100);
});

test("frameTimeline never returns zero frames", () => {
  assert.equal(frameTimeline(30, 0).length, 1);
  assert.equal(frameTimeline(1, 10).length, 1);
});

test("frameName is zero-padded to 6 digits", () => {
  assert.equal(frameName(0), "frame-000000.png");
  assert.equal(frameName(42), "frame-000042.png");
  assert.equal(frameName(123456), "frame-123456.png");
});

test("bundledFontFaceCss returns a non-empty KineCJK @font-face when the woff2 files are present", () => {
  // Happy path: the bundled Noto Sans SC woff2 files ship with the repo, so the
  // font-injection block is non-empty and captureFrames never hits its
  // missing-font warning branch. (The warning branch is the missing-font edge
  // case and needs a browser to exercise end-to-end.)
  const css = bundledFontFaceCss();
  assert.ok(css.length > 0, "expected a non-empty @font-face block when the bundled woff2 files exist");
  assert.match(css, /KineCJK/);
});
