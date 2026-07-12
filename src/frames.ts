/**
 * frames.ts — the frame engine (Playwright headless Chromium).
 *
 * A template exposes a single pure contract: `window.KineCard.seek(tMs)` sets
 * every DOM/animation state as a function of time ONLY (no wall-clock CSS
 * transitions). That is what makes the render deterministic: we open the
 * template page once, then for each frame we `seek(t)` and screenshot. Same
 * input → same pixels.
 */
import { chromium, type Browser } from "playwright";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Card, RenderConfig } from "./schema";

/** Absolute path to the bundled CJK webfont directory (Noto Sans SC subset, OFL). */
export function bundledFontsDir(): string {
  // dist/frames.js → ../assets/fonts ; src/frames.ts (tsx dev) → ../assets/fonts
  return join(__dirname, "..", "assets", "fonts");
}

/**
 * `@font-face` rules for the bundled CJK font, injected into every template at
 * render time. This is what makes 中文 render byte-identically **offline, with
 * zero network** regardless of the host OS's installed fonts — and regardless
 * of whether the template is a built-in or a copied project (a relative
 * `url(...)` in the template CSS would break once the template is copied into a
 * project, so we inject an absolute `file://` URL here instead). Templates lead
 * their font stack with `'KineCJK'`, so this face wins whenever it loads.
 */
export function bundledFontFaceCss(): string {
  const dir = bundledFontsDir();
  const faces: string[] = [];
  const add = (weight: number, file: string) => {
    const p = join(dir, file);
    if (!existsSync(p)) return;
    const href = pathToFileURL(p).href;
    faces.push(
      `@font-face{font-family:'KineCJK';font-weight:${weight};font-style:normal;` +
        `font-display:block;src:url('${href}') format('woff2');}`,
    );
  };
  add(400, "NotoSansSC-KineCard-Regular.woff2");
  add(700, "NotoSansSC-KineCard-Bold.woff2");
  return faces.join("");
}

/**
 * The exact timestamps (ms) sampled for a clip. Pure — unit tested without a
 * browser. Frame `i` is shown at `t = i * 1000 / fps`; the count is rounded so
 * the last frame lands on (or just past) the final state.
 */
export function frameTimeline(fps: number, durationMs: number): number[] {
  const count = Math.max(1, Math.round((durationMs / 1000) * fps));
  const step = 1000 / fps;
  return Array.from({ length: count }, (_, i) => Math.round(i * step * 1000) / 1000);
}

export interface CaptureOptions {
  /** Absolute path to the template's `template.html`. */
  templateHtmlPath: string;
  card: Card;
  render: RenderConfig;
  durationMs: number;
  /** Directory to write `frame-000000.png …` into (must exist). */
  outDir: string;
  onProgress?: (done: number, total: number) => void;
}

/** Zero-padded frame filename, e.g. `frame-000042.png`. */
export function frameName(i: number): string {
  return `frame-${String(i).padStart(6, "0")}.png`;
}

// Chromium flags that shave off common sources of cross-run pixel drift.
const DETERMINISM_ARGS = [
  // CI runners (GitHub Actions ubuntu, most Docker images) run as root, where
  // Chromium's sandbox cannot initialize and the launch hangs until timeout.
  // These flags are safe for a headless, local-only render of trusted templates.
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--force-color-profile=srgb",
  "--disable-lcd-text",
  "--font-render-hinting=none",
  "--disable-partial-raster",
  "--disable-skia-runtime-opts",
  "--deterministic-mode",
  // NOTE: --run-all-compositor-stages-before-draw was removed — on a headless CI
  // runner (SwiftShader software GL) it makes page.screenshot() block until the
  // 30s timeout, because a compositor stage never signals completion. We instead
  // freeze animations at capture time (screenshot { animations: "disabled" }),
  // which is both deterministic and CI-safe.
  "--hide-scrollbars",
];

/**
 * Capture every frame of a clip to PNGs and return their absolute paths in
 * order. Requires a Playwright Chromium (auto-fetched by `playwright install`).
 */
export async function captureFrames(opts: CaptureOptions): Promise<string[]> {
  const { templateHtmlPath, card, render, durationMs, outDir, onProgress } = opts;
  const [width, height] = render.size;
  const times = frameTimeline(render.fps, durationMs);

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ args: DETERMINISM_ARGS });
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();

    // Inject the content + manifest BEFORE any page script runs, so the
    // template renders the real card rather than its built-in preview sample.
    await page.addInitScript(
      (data: { card: Card; render: RenderConfig }) => {
        const w = window as unknown as Record<string, unknown>;
        w.__CARD__ = data.card;
        w.__RENDER__ = data.render;
        // Tell the template we drive seek() ourselves — suppress its preview loop.
        w.__KINECARD_RENDERING__ = true;
      },
      { card, render },
    );

    await page.goto(pathToFileURL(templateHtmlPath).href, { waitUntil: "load" });

    // Inject the bundled CJK webfont and block until both weights are loaded,
    // so the very first frame is rendered with the final font (no FOUT / no
    // reliance on host fonts). This is the determinism + offline guarantee.
    const fontCss = bundledFontFaceCss();
    if (fontCss) {
      await page.addStyleTag({ content: fontCss });
      await page.evaluate(async () => {
        const fonts = (document as unknown as { fonts: FontFaceSet }).fonts;
        try {
          await Promise.all([
            fonts.load("400 60px KineCJK"),
            fonts.load("700 60px KineCJK"),
          ]);
        } catch {
          /* fall back to the template's system font stack */
        }
        await fonts.ready;
      });
    }

    await page.waitForFunction(
      () => {
        const kc = (window as unknown as { KineCard?: { seek?: unknown } }).KineCard;
        return !!kc && typeof kc.seek === "function";
      },
      { timeout: 15_000 },
    );

    const paths: string[] = [];
    for (let i = 0; i < times.length; i++) {
      await page.evaluate((t) => {
        (window as unknown as { KineCard: { seek: (t: number) => void } }).KineCard.seek(t);
      }, times[i]);
      const p = join(outDir, frameName(i));
      await page.screenshot({
        path: p,
        type: "png",
        clip: { x: 0, y: 0, width, height },
        animations: "disabled",
        timeout: 60_000,
      });
      paths.push(p);
      onProgress?.(i + 1, times.length);
    }
    await context.close();
    return paths;
  } finally {
    await browser?.close();
  }
}
