[English](./README.en.md) · [Website](https://kinecard.lei6393.com) · [GitHub](https://github.com/SuperMarioYL/kinecard)

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="./assets/presentation/hero-mobile-dark.svg">
  <source media="(max-width: 600px)" srcset="./assets/presentation/hero-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="./assets/presentation/hero-dark.svg">
  <img src="./assets/presentation/hero-light.svg" width="960" alt="Hero diagram">
</picture>

# kinecard

**为每张动效卡片保留可编辑项目。**

KineCard 将标题与文字要点转成定时卡片动画，并保留 card.yaml、render.json 与 HTML/CSS/JS 模板，供后续修改。

## 为什么需要它

没有源文件的视频很难修订。小型项目目录保留内容、时序和模板，单张卡片便可修改后再次渲染。

- **保留可编辑内容** — 导出后仍可使用 YAML 与模板源。
- **按时间定位动画** — 模板暴露确定性 seek 函数。
- **检查布局警告** — 检查器在截图前报告估计溢出。

## 架构

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="./assets/presentation/architecture-mobile-dark.svg">
  <source media="(max-width: 600px)" srcset="./assets/presentation/architecture-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="./assets/presentation/architecture-dark.svg">
  <img src="./assets/presentation/architecture-light.svg" width="960" alt="Architecture diagram">
</picture>

schema 加载器校验内容和渲染设置；检查器根据随仓预设估计水平文字溢出与时长。Playwright 调用 window.KineCard.seek(tMs) 并截图，ffmpeg 将 PNG 编码为 H.264；项目导出保留可编辑源。

| 组件 | 职责 |
| --- | --- |
| `Card + render config` | src/schema.ts |
| `Editable template` | src/project.ts; templates |
| `Timed frame capture` | src/frames.ts |
| `H.264 encoder` | src/encode.ts |

## 安装与快速上手

使用仓库清单指定的运行时版本构建，并在仓库根目录运行示例。

```bash
git clone https://github.com/SuperMarioYL/kinecard.git
cd kinecard
npm ci
npm run build
npx playwright install chromium
```

随仓脚本创建完整单卡项目，渲染六帧小型预览并保存 docs/demo-preview.mp4。配置动画时间线为 1400ms；六帧按 4fps 编码得到 1500ms 视频。

```bash
node examples/presentation-demo.cjs
```

## 实际运行示例

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="./assets/presentation/process-mobile-dark.svg">
  <source media="(max-width: 600px)" srcset="./assets/presentation/process-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="./assets/presentation/process-dark.svg">
  <img src="./assets/presentation/process-light.svg" width="960" alt="Process diagram">
</picture>

Chromium and ffmpeg produce a six-frame MP4 with no linter warning for this card.

```text
{
  "template": "minimal",
  "size": [
    360,
    640
  ],
  "fps": 4,
  "duration_ms": 1400,
  "frames": 6,
  "warnings": 0,
  "video_bytes": 7323
}
```

完整命令与输出保存在 [docs/demo-results.json](./docs/demo-results.json). 输入和复现代码均随仓提供。

![已有终端录制](./assets/demo.gif)

保留已有录制供参考；上方文字示例给出当前可复现的操作。

[Rendered MP4 preview](./docs/demo-preview.mp4)

## 用法

CLI 提供以下操作。示例之外的命令需要替换成你的文件路径或标识。

```bash
node dist/cli.js render examples/card.yaml -t minimal -o out.mp4
node dist/cli.js init my-card -t spotlight
node dist/cli.js render my-card
node dist/cli.js render examples/card.yaml --project editable-card
```

## 配置

card.yaml 定义 title、可选 subtitle、lines、palette 与 platform。render.json 定义 fps、size、标题/逐行/结尾时序及比例安全区。模板暴露 seek(tMs)。内置模板为 minimal、spotlight 与 mono；字体保留独立 OFL 许可。

## 集成与职责分工

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="./assets/presentation/integrations-mobile-dark.svg">
  <source media="(max-width: 600px)" srcset="./assets/presentation/integrations-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="./assets/presentation/integrations-dark.svg">
  <img src="./assets/presentation/integrations-light.svg" width="960" alt="Integrations diagram">
</picture>

以下路径已有源码实现。按任务选择输入，并把生成的结果与项目一起保存。

| 路径 | 已实现职责 |
| --- | --- |
| card.yaml | Title, lines, palette and platform |
| HTML / CSS / JS | Editable template source |
| Playwright Chromium | Time-addressed screenshots |
| ffmpeg | PNG sequence to MP4 |
| Noto Sans SC subset | Bundled CJK font assets |

## 限制与后续方向

- 渲染需要兼容的 Playwright Chromium 与 ffmpeg；安装依赖或浏览器可能需要联网。
- 确定性 seek 时间戳不保证跨操作系统、浏览器或编码器生成逐字节相同视频。
- 安全区和时长检查使用仓库预设与估计文字宽度，不是实时平台规范或完整布局验证。
- 短示例使用 360x640、4fps 以降低复现成本；常规预设可使用 1080x1920 与更高帧率。

批量渲染与跨卡片一致性是后续方向；发布前应检查目标构图中的实际帧。

## 许可与贡献

许可见 [LICENSE](./LICENSE). 反馈问题时请提供最小输入、执行命令和实际输出。
