/**
 * gallery.ts — the auto sample gallery (the m3 remainder).
 *
 * `kinecard gallery <card.yaml>` renders the SAME card with EVERY built-in
 * template into one directory — <dir>/<template>.mp4 plus a gallery.html index
 * embedding each clip. One command turns a piece of copy into the full
 * side-by-side template showcase (and is how a sample gallery is generated on
 * demand). Reuses render() per template; nothing here renders differently
 * from the normal pipeline.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { render, type Warning } from "./render";
import { listBuiltinTemplates, TEMPLATE_META } from "./templates";
import { loadCard } from "./schema";

export interface GalleryEntry {
  template: string;
  outFile: string;
}

export interface GalleryResult {
  entries: GalleryEntry[];
  htmlPath: string;
  /** Per-template render warnings, prefixed with the template name. */
  warnings: Warning[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The standalone gallery index: one 9:16 video per built-in template with its
 * name and blurb. Pure — unit tested.
 */
export function galleryHtml(entries: GalleryEntry[], cardTitle: string): string {
  const figures = entries
    .map((e) => {
      const blurb = TEMPLATE_META[e.template] ?? "";
      return (
        `    <figure>\n` +
        `      <video src="${escapeHtml(e.outFile)}" controls loop muted playsinline></video>\n` +
        `      <figcaption><strong>${escapeHtml(e.template)}</strong>${blurb ? " — " + escapeHtml(blurb) : ""}</figcaption>\n` +
        `    </figure>`
      );
    })
    .join("\n");
  return `<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KineCard · 模板画廊</title>
  <style>
    body { margin: 0; padding: 32px 24px; font-family: system-ui, -apple-system, "PingFang SC", sans-serif; background: #f5f5f7; color: #1d1d1f; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    p.card { color: #6e6e73; margin: 0 0 24px; }
    .grid { display: flex; flex-wrap: wrap; gap: 24px; }
    figure { margin: 0; width: 270px; }
    video { width: 270px; height: 480px; background: #000; border-radius: 12px; display: block; }
    figcaption { margin-top: 8px; font-size: 13px; color: #6e6e73; }
  </style>
</head>
<body>
  <h1>KineCard · 模板画廊</h1>
  <p class="card">同一张卡片（${escapeHtml(cardTitle)}）用全部内置模板渲染 — 换模板即换风格。</p>
  <div class="grid">
${figures}
  </div>
</body>
</html>
`;
}

export interface GalleryOptions {
  /** card.yaml path. */
  input: string;
  /** Output directory (default "gallery"). */
  outDir?: string;
  /** Optional fps override, passed through to each render. */
  fps?: number;
  logger?: (msg: string) => void;
}

/** Render one card with every built-in template + write the gallery index. */
export async function renderGallery(opts: GalleryOptions): Promise<GalleryResult> {
  const log = opts.logger ?? (() => {});
  const input = isAbsolute(opts.input) ? opts.input : resolve(process.cwd(), opts.input);
  const outDir = isAbsolute(opts.outDir ?? "gallery")
    ? (opts.outDir as string)
    : resolve(process.cwd(), opts.outDir ?? "gallery");
  mkdirSync(outDir, { recursive: true });

  // Load once for the index title; render() loads it again per template (same
  // deterministic pipeline, no special-cased code path).
  const card = loadCard(input);
  const names = listBuiltinTemplates();
  if (names.length === 0) {
    throw new Error("gallery: no built-in templates found");
  }

  const entries: GalleryEntry[] = [];
  const warnings: Warning[] = [];
  for (const name of names) {
    const outFile = join(outDir, `${name}.mp4`);
    log(`rendering template: ${name}`);
    const r = await render({ input, template: name, out: outFile, fps: opts.fps, logger: log });
    entries.push({ template: name, outFile });
    for (const w of r.warnings) warnings.push({ ...w, message: `[${name}] ${w.message}` });
  }

  const htmlPath = join(outDir, "gallery.html");
  writeFileSync(htmlPath, galleryHtml(entries, card.title), "utf8");
  log(`gallery: ${entries.length} templates → ${htmlPath}`);
  return { entries, htmlPath, warnings };
}
