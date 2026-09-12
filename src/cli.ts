#!/usr/bin/env node
/**
 * cli.ts — `kinecard` command line.
 *
 *   kinecard render <card.yaml|project> [-t minimal] [-o out.mp4] [--project dir]
 *   kinecard list                       list built-in templates
 *   kinecard init  <dir> [-t minimal]   scaffold an editable project
 *   kinecard check <input...>           multi-card style-lock check + lint
 *   kinecard gallery <card.yaml>        render one card with every template
 */
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "./render";
import { listBuiltinTemplates, resolveBuiltin, TEMPLATE_META } from "./templates";
import { writeProject } from "./project";
import { checkSet } from "./check";
import { renderGallery } from "./gallery";
import { PLATFORMS, resolveRenderConfig, type Card, type Platform } from "./schema";

function version(): string {
  try {
    return readFileSync(join(__dirname, "..", "VERSION"), "utf8").trim();
  } catch {
    return "0.0.0";
  }
}

const STARTER_CARD: Card = {
  title: "你的知识卡片标题",
  subtitle: "一句话副标题（可删）",
  lines: [
    { text: "第一条要点：把一个概念讲清楚" },
    { text: "第二条要点：给一个具体例子", accent: "#FF375F" },
    { text: "第三条要点：留一个可执行结论" },
  ],
  platform: "douyin",
};

function fail(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\nkinecard: ${msg}\n`);
  process.exit(1);
}

function assertPlatform(v: string | undefined): Platform | undefined {
  if (v === undefined) return undefined;
  if (!(PLATFORMS as readonly string[]).includes(v)) {
    throw new Error(`unknown preset "${v}". choose one of: ${PLATFORMS.join(", ")}`);
  }
  return v as Platform;
}

const program = new Command();
program
  .name("kinecard")
  .description("把结构化文案渲染成 9:16 竖屏知识动效卡片短视频（HTML → video 的可编辑模板项目）")
  .version(version(), "-v, --version");

program
  .command("render")
  .description("把一张卡片渲染成 9:16 竖屏动效 MP4")
  .argument("<input>", "card.yaml 文件，或一个 KineCard 项目目录")
  .option("-t, --template <name>", "内置模板名（card 模式）", "minimal")
  .option("-o, --out <file>", "输出 .mp4 路径")
  .option("--project <dir>", "同时把可编辑的源项目写入 <dir>")
  .option("--preset <platform>", `平台预设：${PLATFORMS.join("|")}`)
  .option("--fps <n>", "帧率", (v) => parseInt(v, 10))
  .option("--keep-frames", "保留中间 PNG 帧（调试）")
  .action(async (input: string, options) => {
    try {
      const preset = assertPlatform(options.preset);
      const t0 = Date.now();
      const result = await render({
        input,
        template: options.template,
        out: options.out,
        project: options.project,
        preset,
        fps: options.fps,
        keepFrames: options.keepFrames,
        logger: (m) => process.stderr.write(m + "\n"),
      });
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(
        `\n✓ ${result.outFile}\n` +
          `  ${(result.durationMs / 1000).toFixed(1)}s · ${result.frameCount} frames · ${result.warnings.length} warning(s) · ${secs}s\n` +
          (result.projectDir ? `  editable project: ${result.projectDir}\n` : ""),
      );
    } catch (err) {
      fail(err);
    }
  });

program
  .command("list")
  .description("列出内置模板")
  .action(() => {
    const names = listBuiltinTemplates();
    if (names.length === 0) {
      process.stdout.write("no built-in templates found\n");
      return;
    }
    process.stdout.write("内置模板：\n");
    for (const name of names) {
      const meta = TEMPLATE_META[name] ?? "";
      process.stdout.write(`  ${name.padEnd(10)} ${meta}\n`);
    }
    process.stdout.write(`\n用法： kinecard render examples/card.yaml -t <name> -o out.mp4\n`);
  });

program
  .command("init")
  .description("在 <dir> 生成一个可编辑的 KineCard 起始项目")
  .argument("<dir>", "目标项目目录")
  .option("-t, --template <name>", "内置模板名", "minimal")
  .option("--preset <platform>", `平台预设：${PLATFORMS.join("|")}`, "douyin")
  .action((dir: string, options) => {
    try {
      const preset = assertPlatform(options.preset) ?? "douyin";
      const template = resolveBuiltin(options.template);
      const card: Card = { ...STARTER_CARD, platform: preset };
      // Thread the template's designed timing as the render default so the
      // scaffolded render.json carries the template's pacing (e.g. mono
      // 1300/1600/900/1300) instead of TimingSchema defaults — parity with the
      // card-mode render() fix. --preset still overrides.
      const renderCfg = resolveRenderConfig(card, { preset }, template.timing);
      writeProject({ dir, card, render: renderCfg, template });
      process.stdout.write(
        `✓ 已生成项目： ${dir}\n` +
          `  编辑 ${dir}/card.yaml，然后渲染：\n` +
          `    kinecard render ${dir}\n`,
      );
    } catch (err) {
      fail(err);
    }
  });

program
  .command("check")
  .description("检查一组卡片/项目是否共享一个风格锁，并对每张卡片做安全区/时长 lint")
  .argument("<input...>", "card.yaml 文件、项目目录，或一个包含多个项目的集合目录")
  .action((inputs: string[]) => {
    try {
      const result = checkSet(inputs);
      const ref = result.cards[0];
      process.stdout.write(`检查 ${result.cards.length} 张卡片（风格锁基准： ${ref.name}）\n\n`);
      for (const c of result.cards) {
        if (c.warnings.length === 0) {
          process.stdout.write(`  ✓ ${c.name}\n`);
        } else {
          process.stdout.write(`  ⚠ ${c.name}\n`);
          for (const w of c.warnings) process.stdout.write(`      ${w.message}\n`);
        }
      }
      const lockIssues = result.issues.filter((i) => i.kind === "style-lock");
      if (lockIssues.length > 0) {
        process.stdout.write(`\n风格锁（不一致）：\n`);
        for (const i of lockIssues) {
          process.stdout.write(`  ✗ ${i.input}: ${i.message}\n`);
        }
      }
      process.stdout.write(
        result.consistent
          ? `\n一致性： PASS（安全区/时长警告不破坏风格锁）\n`
          : `\n一致性： FAIL — 以上输入与基准不一致，先对齐再批量出片\n`,
      );
      if (!result.consistent) process.exitCode = 1;
    } catch (err) {
      fail(err);
    }
  });

program
  .command("gallery")
  .description("用全部内置模板渲染同一张卡片，生成可对比的样例画廊")
  .argument("<card>", "card.yaml 文件")
  .option("-o, --out <dir>", "输出目录", "gallery")
  .option("--fps <n>", "帧率", (v) => parseInt(v, 10))
  .action(async (card: string, options) => {
    try {
      const t0 = Date.now();
      const result = await renderGallery({
        input: card,
        outDir: options.out,
        fps: options.fps,
        logger: (m) => process.stderr.write(m + "\n"),
      });
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(
        `\n✓ ${result.htmlPath}\n` +
          `  ${result.entries.length} 个模板 · ${result.warnings.length} warning(s) · ${secs}s\n`,
      );
    } catch (err) {
      fail(err);
    }
  });

program.parseAsync(process.argv).catch(fail);
