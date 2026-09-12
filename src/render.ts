/**
 * render.ts — the orchestrator. Ties loader → linter → frame engine → encoder
 * together and handles both flows:
 *
 *   card mode     : `kinecard render examples/card.yaml -t minimal -o out.mp4`
 *   project mode  : `kinecard render my-card/`  (re-render an edited project)
 *
 * `--project my-card/` additionally materializes the editable source project.
 */
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { statSync, existsSync } from "node:fs";
import {
  computeDurationMs,
  resolveRenderConfig,
  loadCard,
  PLATFORM_PRESETS,
  type Card,
  type Platform,
  type RenderConfig,
} from "./schema";
import { resolveBuiltin, resolveProjectTemplate, type TemplateMetrics } from "./templates";
import { captureFrames } from "./frames";
import { encode } from "./encode";
import { isProjectDir, loadProject, writeProject, OUTPUT_FILE } from "./project";

// ---------------------------------------------------------------------------
// Linter — 字幕安全区 (horizontal overflow) + platform duration.
// ---------------------------------------------------------------------------

export interface Warning {
  kind: "safe-zone" | "duration";
  message: string;
}

/** Font size (px) the templates use for body lines, as a fraction of width. */
export const BODY_FONT_RATIO = 0.058;
/** Font size (px) the templates use for the title, as a fraction of width. */
export const TITLE_FONT_RATIO = 0.086;
/** Font size (px) the templates use for the optional subtitle, as a fraction of width. */
export const SUBTITLE_FONT_RATIO = 0.042;

// CJK ideographs + CJK/fullwidth punctuation + Hangul — each ~1 em wide.
const CJK_RE =
  /[　-〿㐀-䶿一-鿿豈-﫿＀-￯가-힯]/;
const THIN_RE = /[iIl.,:;'!|()\[\]{}]/;

/** Estimate the rendered pixel width of a text run. Deterministic + tested. */
export function estimateTextWidthPx(text: string, fontPx: number): number {
  let w = 0;
  for (const ch of text) {
    if (ch === " ") w += fontPx * 0.3;
    else if (CJK_RE.test(ch)) w += fontPx * 1.0;
    else if (THIN_RE.test(ch)) w += fontPx * 0.32;
    else w += fontPx * 0.56;
  }
  return w;
}

/**
 * Produce warnings for a card under a render config: any line whose estimated
 * width exceeds the horizontal 字幕安全区, and whether the total duration blows
 * the platform's max. Pure — unit tested.
 *
 * `metrics` lets the caller pass the active template's calibration — its
 * title/body/subtitle font-size ratios (vw ÷ 100) AND its body-line chrome
 * width (`lineChromeVw`, vw) — so the estimate matches what the template
 * actually renders. Body lines carry chrome inside the safe zone (mono's line
 * number + caret, minimal/spotlight's accent bar); without subtracting it the
 * linter lends that width to text and boundary-length lines wrap in the real
 * render while passing lint (a false negative). Omit `metrics` to use the
 * minimal/spotlight ratios baked in below with no chrome subtraction.
 */
export function lintCard(
  card: Card,
  render: RenderConfig,
  metrics?: TemplateMetrics,
): Warning[] {
  const warnings: Warning[] = [];
  const [width] = render.size;
  const safeWidth = width * (1 - render.safeZone.left - render.safeZone.right);
  const ratios = {
    title: TITLE_FONT_RATIO,
    body: BODY_FONT_RATIO,
    subtitle: SUBTITLE_FONT_RATIO,
    ...metrics?.fontRatios,
  };
  const bodyPx = Math.round(width * ratios.body);
  const titlePx = Math.round(width * ratios.title);
  const subtitlePx = Math.round(width * ratios.subtitle);
  // Body lines render inside the template's line chrome; the linter must not
  // lend that width to text. Title/subtitle carry no chrome.
  const lineSafeWidth = Math.max(
    1,
    safeWidth - (metrics?.lineChromeVw !== undefined ? Math.round((width * metrics.lineChromeVw) / 100) : 0),
  );

  const titleW = estimateTextWidthPx(card.title, titlePx);
  if (titleW > safeWidth) {
    const over = Math.round(((titleW - safeWidth) / safeWidth) * 100);
    warnings.push({
      kind: "safe-zone",
      message: `title overflows the safe zone by ~${over}% — shorten it or it may clip: "${card.title}"`,
    });
  }
  if (card.subtitle) {
    const subW = estimateTextWidthPx(card.subtitle, subtitlePx);
    if (subW > safeWidth) {
      const over = Math.round(((subW - safeWidth) / safeWidth) * 100);
      warnings.push({
        kind: "safe-zone",
        message: `subtitle overflows the safe zone by ~${over}% — shorten it or it may clip: "${card.subtitle}"`,
      });
    }
  }
  card.lines.forEach((line, i) => {
    const w = estimateTextWidthPx(line.text, bodyPx);
    if (w > lineSafeWidth) {
      const over = Math.round(((w - lineSafeWidth) / lineSafeWidth) * 100);
      warnings.push({
        kind: "safe-zone",
        message: `line ${i + 1} overflows the safe zone by ~${over}% — split it: "${line.text}"`,
      });
    }
  });

  const totalMs = computeDurationMs(render.timing, card.lines.length);
  const maxMs = PLATFORM_PRESETS[render.preset].maxDurationSec * 1000;
  if (totalMs > maxMs) {
    warnings.push({
      kind: "duration",
      message: `total ${(totalMs / 1000).toFixed(1)}s exceeds the ${render.preset} max of ${maxMs / 1000}s — trim lines or shorten timing`,
    });
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** card.yaml path OR a project directory. */
  input: string;
  /** built-in template name (card mode only). Default "minimal". */
  template?: string;
  /** output .mp4 path (overrides the default). */
  out?: string;
  /** write an editable project into this dir (card mode). */
  project?: string;
  /** platform preset override. */
  preset?: Platform;
  /** fps override. */
  fps?: number;
  /** keep the intermediate PNG frames (debug). */
  keepFrames?: boolean;
  logger?: (msg: string) => void;
}

export interface RenderResult {
  outFile: string;
  durationMs: number;
  frameCount: number;
  warnings: Warning[];
  projectDir?: string;
}

function looksLikeDir(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

/**
 * Apply the per-render CLI flag overrides (`--fps`, `--preset`) to a loaded
 * project's render.json config. Both flags are documented for project-dir
 * inputs (README 用法 / `kinecard render --help`), so swallowing them silently
 * is a contract break; like `-o`, they override for THIS render only — the
 * project's render.json on disk is untouched. `--preset` swaps in the
 * platform preset's canvas + safe zone (the same fields a fresh resolve would
 * produce); everything else (timing, a customized fps/size) is preserved
 * unless explicitly overridden.
 */
export function applyProjectRenderOverrides(
  cfg: RenderConfig,
  opts: { preset?: Platform; fps?: number },
): RenderConfig {
  let out = cfg;
  if (opts.preset) {
    const p = PLATFORM_PRESETS[opts.preset];
    out = { ...out, preset: opts.preset, size: p.size, safeZone: p.safeZone };
  }
  if (opts.fps) out = { ...out, fps: opts.fps };
  return out;
}

function abs(p: string): string {
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

export async function render(opts: RenderOptions): Promise<RenderResult> {
  const log = opts.logger ?? (() => {});
  const input = abs(opts.input);

  let card: Card;
  let renderCfg: RenderConfig;
  let templateHtmlPath: string;
  let outFile: string;
  let projectDir: string | undefined;
  /** Active template's linter calibration; undefined → baked-in defaults. */
  let lintMetrics: TemplateMetrics | undefined;

  if (looksLikeDir(input) && isProjectDir(input)) {
    // --- project re-render mode -------------------------------------------
    const proj = loadProject(input);
    card = proj.card;
    // --fps / --preset are documented for project-dir inputs too (README 用法);
    // like -o they override the project's render.json for THIS render only —
    // the file on disk is untouched (edit render.json to change it permanently).
    renderCfg = applyProjectRenderOverrides(proj.render, {
      preset: opts.preset,
      fps: opts.fps,
    });
    if (opts.preset || opts.fps) {
      const parts = [
        opts.preset ? `preset=${opts.preset}` : null,
        opts.fps ? `fps=${opts.fps}` : null,
      ].filter((s): s is string => s !== null);
      log(`render override for this render only (${parts.join(", ")}) — edit ${join(input, "render.json")} to persist`);
    }
    templateHtmlPath = proj.templateHtmlPath;
    outFile = opts.out ? abs(opts.out) : proj.outFile;
    projectDir = input;
    // Thread the project's own template calibration into the safe-zone linter,
    // parity with the card-mode branch below — without this a mono project
    // re-render falls back to the minimal/spotlight ratios (8.6/5.8/4.2) with
    // no chrome subtraction and false-warns for boundary text that mono's
    // 7.6/5.2/3.8 + 11.8vw chrome actually fits. A custom template without the
    // pragmas yields undefined values → the linter still falls back to its
    // baked defaults.
    const projTemplate = resolveProjectTemplate(input);
    lintMetrics = {
      fontRatios: projTemplate.fontRatios,
      lineChromeVw: projTemplate.lineChromeVw,
    };
    log(`re-rendering project ${proj.name} (${card.lines.length} lines, template/)`);
  } else {
    // --- card mode ---------------------------------------------------------
    if (looksLikeDir(input)) {
      // A directory that is not a KineCard project (no card.yaml). Without this
      // guard we'd fall through to loadCard(dir) -> readFileSync on a directory,
      // which throws an opaque Node EISDIR error instead of a human message.
      throw new Error(`not a card.yaml or a KineCard project: ${input} (directory has no ${"card.yaml"})`);
    }
    card = loadCard(input);
    const template = resolveBuiltin(opts.template ?? "minimal");
    // Thread the template's designed timing as the render default so the MP4
    // and render.json carry the template's pacing (mono 1300/1600/900/1300,
    // spotlight 1400/1500/640/1200) rather than TimingSchema defaults.
    renderCfg = resolveRenderConfig(card, { preset: opts.preset, fps: opts.fps }, template.timing);
    lintMetrics = {
      fontRatios: template.fontRatios,
      lineChromeVw: template.lineChromeVw,
    };
    if (opts.project) {
      // Materialize the editable project, then render FROM the written source.
      projectDir = abs(opts.project);
      writeProject({ dir: projectDir, card, render: renderCfg, template });
      const projTemplate = resolveProjectTemplate(projectDir);
      templateHtmlPath = join(projTemplate.dir, "template.html");
      outFile = opts.out ? abs(opts.out) : join(projectDir, OUTPUT_FILE);
      log(`wrote editable project → ${projectDir}`);
    } else {
      templateHtmlPath = join(template.dir, "template.html");
      outFile = abs(opts.out ?? "out.mp4");
    }
    log(`template: ${template.name}   preset: ${renderCfg.preset}   ${renderCfg.size[0]}×${renderCfg.size[1]} @ ${renderCfg.fps}fps`);
  }

  const durationMs = computeDurationMs(renderCfg.timing, card.lines.length);

  // Linter — always surface warnings; they are the whole point of platform-fit.
  const warnings = lintCard(card, renderCfg, lintMetrics);
  for (const w of warnings) log(`⚠ ${w.message}`);

  // Ensure the output directory exists.
  mkdirSync(dirname(outFile), { recursive: true });

  const frameDir = mkdtempSync(join(tmpdir(), "kinecard-"));
  try {
    let lastPct = -1;
    const frames = await captureFrames({
      templateHtmlPath,
      card,
      render: renderCfg,
      durationMs,
      outDir: frameDir,
      onProgress: (done, total) => {
        const pct = Math.floor((done / total) * 100);
        if (pct !== lastPct && pct % 10 === 0) {
          lastPct = pct;
          log(`  capturing frames… ${pct}% (${done}/${total})`);
        }
      },
      onWarning: (m) => log(`⚠ ${m}`),
    });
    log(`encoding ${frames.length} frames → ${outFile}`);
    await encode({
      frameDir,
      fps: renderCfg.fps,
      size: renderCfg.size,
      outFile,
    });
    return { outFile, durationMs, frameCount: frames.length, warnings, projectDir };
  } finally {
    if (!opts.keepFrames) rmSync(frameDir, { recursive: true, force: true });
  }
}
