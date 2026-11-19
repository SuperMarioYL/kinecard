/**
 * project.ts — the KineCard *project* is the primitive: an editable, diff-able
 * directory, not a throwaway MP4.
 *
 *   my-card/
 *     card.yaml     content (title / lines / palette / platform)
 *     template/     copied HTML + CSS + template.js — the editable source
 *     render.json   {preset, fps, size, timing, safeZone}
 *     out.mp4       deterministic render output
 *
 * `writeProject` materializes it; `loadProject` reads it back for a single-card
 * re-render. Re-rendering an edited project is what makes a card a reusable
 * style-pack instead of a one-off export.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import { stringify as stringifyYaml } from "yaml";
import {
  loadCard,
  loadRenderConfig,
  type Card,
  type RenderConfig,
} from "./schema";
import { type Template } from "./templates";

export const CARD_FILE = "card.yaml";
export const RENDER_FILE = "render.json";
export const TEMPLATE_DIR = "template";
export const OUTPUT_FILE = "out.mp4";

/** A project has a card.yaml at its root. */
export function isProjectDir(dir: string): boolean {
  return existsSync(join(dir, CARD_FILE));
}

export interface WriteProjectOptions {
  dir: string;
  card: Card;
  render: RenderConfig;
  template: Template;
  /** Optional human-readable source path recorded as a header comment. */
  sourceNote?: string;
}

const CARD_HEADER = [
  "# KineCard project — edit this file, then re-render with:",
  "#   kinecard render <this-dir>",
  "# lines[].accent and palette.* accept hex colours like #FF375F.",
  "",
].join("\n");

/**
 * Rewrite relative `url(...)` references in template CSS to absolute `file://`
 * URLs resolved against the template's source directory. The bundled
 * `@font-face` declares `url("../../assets/fonts/...")`, which resolves in the
 * built-in template folder but 404s once style.css is copied into a project
 * (`<project>/template/`). Rewriting it to the same absolute `file://` woff2 the
 * renderer injects (src/frames.ts `bundledFontFaceCss`) keeps the editable
 * project preview loading KineCJK, so its CJK glyphs match the rendered MP4.
 * Absolute / data: / http(s) / file: URLs and missing files are left untouched.
 */
export function rewriteRelativeUrlsToAbsolute(css: string, baseDir: string): string {
  return css.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (full, ref: string) => {
    if (/^(https?:|file:|data:|#)/.test(ref) || isAbsolute(ref)) return full;
    const abs = normalize(join(baseDir, ref));
    if (existsSync(abs)) return `url('${pathToFileURL(abs).href}')`;
    return full;
  });
}

/**
 * Canonicalize the bundled-font URLs a project's style.css may carry, so callers
 * that compare template sources compare *style* rather than the machine the
 * project was scaffolded on.
 *
 * writeProject rewrites the @font-face src to an ABSOLUTE `file://` path (the
 * one rewriteRelativeUrlsToAbsolute produces), which points at wherever kinecard
 * is installed: `/Users/a/kinecard/assets/fonts/X.woff2` vs `/home/b/...`. Two
 * projects built from the same template on different machines are visually
 * identical and must not read as "two different templates". Relative
 * (`../../assets/fonts/X`) and absolute forms collapse to the same token. The
 * file name is kept, so a genuinely different font still compares as a
 * difference; every other rule compares byte-exact.
 */
export function canonicalizeBundledFontUrls(css: string): string {
  return css.replace(
    /url\(\s*['"]?(?:file:\/\/)?[^'")]*\/assets\/fonts\/([^'")/]+)['"]?\s*\)/g,
    (_match, file: string) => `url("<bundled-font:${file}>")`,
  );
}

/**
 * Materialize an editable project directory. Refuses to write over an existing
 * project: its card.yaml and template/ are the editable source this primitive
 * exists to preserve, so replacing them silently would destroy the user's edits.
 */
export function writeProject(opts: WriteProjectOptions): string {
  const { dir, card, render, template } = opts;
  if (isProjectDir(dir)) {
    throw new Error(
      `refusing to overwrite the existing KineCard project at ${dir} — it already has a ${CARD_FILE} ` +
        `(and possibly your edits). Re-render it with \`kinecard render ${dir}\`, or choose a new directory.`,
    );
  }
  mkdirSync(dir, { recursive: true });
  const templateDir = join(dir, TEMPLATE_DIR);
  mkdirSync(templateDir, { recursive: true });

  writeFileSync(join(dir, CARD_FILE), CARD_HEADER + stringifyYaml(card), "utf8");
  writeFileSync(join(dir, RENDER_FILE), JSON.stringify(render, null, 2) + "\n", "utf8");

  // The editable source: the three template files. style.css has its relative
  // bundled-font URL rewritten to an absolute file:// path so the project
  // preview loads KineCJK instead of 404-ing (see rewriteRelativeUrlsToAbsolute).
  writeFileSync(join(templateDir, "template.html"), template.html, "utf8");
  writeFileSync(join(templateDir, "style.css"), rewriteRelativeUrlsToAbsolute(template.css, template.dir), "utf8");
  writeFileSync(join(templateDir, "template.js"), template.js, "utf8");

  return dir;
}

export interface LoadedProject {
  dir: string;
  name: string;
  card: Card;
  render: RenderConfig;
  templateHtmlPath: string;
  outFile: string;
}

/** Read an editable project back for re-render. */
export function loadProject(dir: string): LoadedProject {
  if (!isProjectDir(dir)) {
    throw new Error(`not a KineCard project (no ${CARD_FILE}): ${dir}`);
  }
  const card = loadCard(join(dir, CARD_FILE));
  const renderPath = join(dir, RENDER_FILE);
  const render = existsSync(renderPath)
    ? loadRenderConfig(renderPath)
    : (() => {
        throw new Error(`project is missing ${RENDER_FILE}: ${dir}`);
      })();
  const templateHtmlPath = join(dir, TEMPLATE_DIR, "template.html");
  if (!existsSync(templateHtmlPath)) {
    throw new Error(`project is missing ${TEMPLATE_DIR}/template.html: ${dir}`);
  }
  return {
    dir,
    name: basename(dir),
    card,
    render,
    templateHtmlPath,
    outFile: join(dir, OUTPUT_FILE),
  };
}

/** Read a raw file from a project (used by tests / tooling). */
export function readProjectFile(dir: string, rel: string): string {
  return readFileSync(join(dir, rel), "utf8");
}
