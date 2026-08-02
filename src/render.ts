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
import { resolveBuiltin, resolveProjectTemplate } from "./templates";
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
 */
export function lintCard(card: Card, render: RenderConfig): Warning[] {
  const warnings: Warning[] = [];
  const [width] = render.size;
  const safeWidth = width * (1 - render.safeZone.left - render.safeZone.right);
  const bodyPx = Math.round(width * BODY_FONT_RATIO);
  const titlePx = Math.round(width * TITLE_FONT_RATIO);
  const subtitlePx = Math.round(width * SUBTITLE_FONT_RATIO);

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
    if (w > safeWidth) {
      const over = Math.round(((w - safeWidth) / safeWidth) * 100);
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

  if (looksLikeDir(input) && isProjectDir(input)) {
    // --- project re-render mode -------------------------------------------
    const proj = loadProject(input);
    card = proj.card;
    renderCfg = proj.render;
    templateHtmlPath = proj.templateHtmlPath;
    outFile = opts.out ? abs(opts.out) : proj.outFile;
    projectDir = input;
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
    renderCfg = resolveRenderConfig(card, { preset: opts.preset, fps: opts.fps });

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
  const warnings = lintCard(card, renderCfg);
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
