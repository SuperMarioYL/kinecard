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
import { basename, join } from "node:path";
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

/** Materialize an editable project directory. Overwrites card/render/template. */
export function writeProject(opts: WriteProjectOptions): string {
  const { dir, card, render, template } = opts;
  mkdirSync(dir, { recursive: true });
  const templateDir = join(dir, TEMPLATE_DIR);
  mkdirSync(templateDir, { recursive: true });

  writeFileSync(join(dir, CARD_FILE), CARD_HEADER + stringifyYaml(card), "utf8");
  writeFileSync(join(dir, RENDER_FILE), JSON.stringify(render, null, 2) + "\n", "utf8");

  // The editable source: the three template files, verbatim.
  writeFileSync(join(templateDir, "template.html"), template.html, "utf8");
  writeFileSync(join(templateDir, "style.css"), template.css, "utf8");
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
