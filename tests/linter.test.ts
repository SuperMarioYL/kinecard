import { test } from "node:test";
import assert from "node:assert/strict";
import { CardSchema, resolveRenderConfig, RenderConfigSchema } from "../src/schema";
import { estimateTextWidthPx, lintCard } from "../src/render";
import { resolveBuiltin } from "../src/templates";

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

test("mono boundary-length text does NOT false-warn (template-aware 7.6/5.2/3.8 ratios)", () => {
  // 16 CJK ideographs. At mono's 5.2vw body (≈56px) → 16*56=896 ≤ 950 safeWidth
  // (fits, no warning). At the OLD fixed 5.8vw (≈63px) → 16*63=1008 > 950, a
  // false-positive "overflows the safe zone" warning for text that actually fits.
  // (safeWidth = 1080 * (1 - 0.06 - 0.06) = 950.4)
  const text = "一二三四五六七八九十一二三四五六";
  const card = CardSchema.parse({
    title: "标题",
    lines: [{ text }],
    platform: "douyin",
  });
  const template = resolveBuiltin("mono");
  const cfg = resolveRenderConfig(card, {}, template.timing);
  const warnings = lintCard(card, cfg, template.fontRatios);
  assert.equal(
    warnings.filter((w) => w.kind === "safe-zone").length,
    0,
    "mono's 7.6/5.2/3.8 ratios should fit 16 CJK chars; the old 8.6/5.8/4.2 ratios false-warned",
  );
});

test("the same boundary text DOES warn under the default minimal/spotlight ratios", () => {
  // Proves the text is genuinely at the boundary — the mono ratios are what fix it.
  const text = "一二三四五六七八九十一二三四五六";
  const card = CardSchema.parse({
    title: "标题",
    lines: [{ text }],
    platform: "douyin",
  });
  // No template timing / fontRatios → minimal/spotlight defaults (8.6/5.8/4.2).
  const cfg = resolveRenderConfig(card);
  const warnings = lintCard(card, cfg);
  assert.ok(
    warnings.filter((w) => w.kind === "safe-zone").length >= 1,
    "the default 5.8vw body ratio should warn for 16 CJK chars (boundary text)",
  );
});
