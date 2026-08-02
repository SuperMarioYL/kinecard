import { test } from "node:test";
import assert from "node:assert/strict";
import { CardSchema, resolveRenderConfig, RenderConfigSchema } from "../src/schema";
import { estimateTextWidthPx, lintCard } from "../src/render";

test("estimateTextWidthPx grows with length and CJK is ~2x a latin char", () => {
  const px = 60;
  assert.ok(estimateTextWidthPx("你好世界", px) > estimateTextWidthPx("你好", px));
  // 4 CJK ≈ 4*px ; 4 latin lowercase ≈ 4*0.56*px → CJK noticeably wider
  assert.ok(estimateTextWidthPx("汉字汉字", px) > estimateTextWidthPx("abcd", px));
});

test("a short card triggers no safe-zone warnings", () => {
  const card = CardSchema.parse({
    title: "三步做卡片",
    lines: [{ text: "写文案" }, { text: "渲染成视频" }],
    platform: "douyin",
  });
  const cfg = resolveRenderConfig(card);
  const warnings = lintCard(card, cfg);
  assert.equal(warnings.filter((w) => w.kind === "safe-zone").length, 0);
});

test("an over-long line raises a safe-zone warning naming the line", () => {
  const longText = "这是一句非常非常长的字幕会明显超出竖屏字幕安全区的水平范围放不下";
  const card = CardSchema.parse({
    title: "标题",
    lines: [{ text: longText }],
    platform: "douyin",
  });
  const cfg = resolveRenderConfig(card);
  const warnings = lintCard(card, cfg);
  const sz = warnings.filter((w) => w.kind === "safe-zone");
  assert.ok(sz.length >= 1);
  assert.match(sz[0].message, /line 1/);
});

test("exceeding the platform duration raises a duration warning", () => {
  const card = CardSchema.parse({
    title: "t",
    lines: Array.from({ length: 8 }, (_, i) => ({ text: `line ${i}` })),
    platform: "douyin",
  });
  // 8 lines * 10s each blows the 60s douyin cap.
  const cfg = RenderConfigSchema.parse({
    preset: "douyin",
    timing: { titleMs: 1400, perLineMs: 10000, lineInMs: 600, outroMs: 1200 },
  });
  const warnings = lintCard(card, cfg);
  assert.equal(warnings.filter((w) => w.kind === "duration").length, 1);
  assert.match(warnings.find((w) => w.kind === "duration")!.message, /exceeds/);
});

test("bilibili's longer cap tolerates a duration that douyin would reject", () => {
  const card = CardSchema.parse({
    title: "t",
    lines: Array.from({ length: 6 }, (_, i) => ({ text: `line ${i}` })),
  });
  const timing = { titleMs: 1400, perLineMs: 12000, lineInMs: 600, outroMs: 1200 };
  const douyin = RenderConfigSchema.parse({ preset: "douyin", timing });
  const bili = RenderConfigSchema.parse({ preset: "bilibili", timing });
  assert.equal(lintCard(card, douyin).filter((w) => w.kind === "duration").length, 1);
  assert.equal(lintCard(card, bili).filter((w) => w.kind === "duration").length, 0);
});

test("an over-long subtitle raises a safe-zone warning naming the subtitle", () => {
  const longSub = "这是一句非常非常长的副标题会明显超出竖屏字幕安全区的水平范围放不下";
  const card = CardSchema.parse({
    title: "标题",
    subtitle: longSub,
    lines: [{ text: "短行" }],
    platform: "douyin",
  });
  const cfg = resolveRenderConfig(card);
  const warnings = lintCard(card, cfg);
  const sz = warnings.filter((w) => w.kind === "safe-zone" && w.message.includes("subtitle"));
  assert.ok(sz.length >= 1, "expected a subtitle safe-zone warning");
  assert.match(sz[0].message, /subtitle/);
});

test("a short subtitle triggers no safe-zone warnings", () => {
  const card = CardSchema.parse({
    title: "标题",
    subtitle: "短副标题",
    lines: [{ text: "写文案" }],
    platform: "douyin",
  });
  const cfg = resolveRenderConfig(card);
  const warnings = lintCard(card, cfg);
  assert.equal(warnings.filter((w) => w.kind === "safe-zone").length, 0);
});
