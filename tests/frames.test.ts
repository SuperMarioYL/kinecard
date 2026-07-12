import { test } from "node:test";
import assert from "node:assert/strict";
import { frameTimeline, frameName } from "../src/frames";

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
