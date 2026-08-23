/**
 * templates.ts — resolve a template (built-in name OR a project's `template/`)
 * to the three source files that make up a KineCard template:
 *
 *   template.html  — the DOM skeleton (references style.css + template.js)
 *   style.css      — the look
 *   template.js    — defines `window.KineCard.seek(tMs)` (the time-driven contract)
 *
 * Built-in templates live in `<repo>/templates/<name>/`. A project overrides
 * them with its own editable copy in `<project>/template/`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Timing } from "./schema";

/** The three files every template must expose. */
export interface Template {
  /** Resolved name (built-in id, or "project" for a project-local template). */
  name: string;
  /** Absolute directory the files were read from. */
  dir: string;
  html: string;
  css: string;
  js: string;
  /**
   * The template's designed timing defaults, parsed from its template.js
   * (`t.<field> || <ms>`). Used as the render default in card mode so a template
   * ships its intended pacing instead of TimingSchema defaults.
   */
  timing: Partial<Timing>;
  /**
   * Linter font-size ratios (fraction of canvas width), parsed from the
   * `kinecard:font-ratios` pragma in template.js. `undefined` falls back to the
   * minimal/spotlight ratios baked into lintCard.
   */
  fontRatios?: FontRatios;
}

/** Font-size ratios a template uses for title / body / subtitle, as a fraction of width. */
export interface FontRatios {
  title: number;
  body: number;
  subtitle: number;
}

const TEMPLATE_FILES = ["template.html", "style.css", "template.js"] as const;

/** Absolute path to the bundled built-in templates directory. */
export function builtinTemplatesDir(): string {
  // dist/templates.js  → ../templates ; src/templates.ts → ../templates (tsx dev)
  return join(__dirname, "..", "templates");
}

/** Names of the built-in templates (directories that contain a template.html). */
export function listBuiltinTemplates(): string[] {
  const root = builtinTemplatesDir();
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((entry) => {
      const p = join(root, entry);
      return statSync(p).isDirectory() && existsSync(join(p, "template.html"));
    })
    .sort();
}

/**
 * Extract a template's designed timing defaults from its template.js. Each
 * template declares a field's fallback as `t.<field> || <ms>` (the value the
 * standalone browser preview uses when `__RENDER__` is absent), so template.js
 * is the single source of the designed pacing — the renderer reads it here
 * instead of silently applying TimingSchema defaults. A non-conforming
 * template yields an empty partial (zod then fills TimingSchema defaults).
 */
export function parseTemplateTiming(js: string): Partial<Timing> {
  const out: Partial<Timing> = {};
  const re = /(titleMs|perLineMs|lineInMs|outroMs):\s*t\.\1\s*\|\|\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js)) !== null) {
    (out as Record<string, number>)[m[1]] = Number(m[2]);
  }
  return out;
}

/**
 * Extract a template's linter font-size ratios (vw ÷ 100) from its
 * `// kinecard:font-ratios title=X body=Y subtitle=Z` pragma, so lintCard
 * estimates text width with the template's actual font sizes. mono declares
 * 7.6/5.2/3.8 (matching templates/mono/style.css); the others 8.6/5.8/4.2.
 * `undefined` when the pragma is absent (lintCard then uses its baked defaults).
 */
export function parseTemplateFontRatios(js: string): FontRatios | undefined {
  const m = js.match(
    /kinecard:font-ratios\s+title=([\d.]+)\s+body=([\d.]+)\s+subtitle=([\d.]+)/,
  );
  if (!m) return undefined;
  // Round to 4 decimals so 5.2/100 → 0.052, not 0.052000000000000005 (the linter
  // rounds to integer px anyway, so this only cleans up the stored value).
  const ratio = (s: string) => Math.round((Number(s) / 100) * 10000) / 10000;
  return {
    title: ratio(m[1]),
    body: ratio(m[2]),
    subtitle: ratio(m[3]),
  };
}

function readTemplateDir(name: string, dir: string): Template {
  for (const f of TEMPLATE_FILES) {
    if (!existsSync(join(dir, f))) {
      throw new Error(`template "${name}" is missing ${f} (looked in ${dir})`);
    }
  }
  const js = readFileSync(join(dir, "template.js"), "utf8");
  return {
    name,
    dir,
    html: readFileSync(join(dir, "template.html"), "utf8"),
    css: readFileSync(join(dir, "style.css"), "utf8"),
    js,
    timing: parseTemplateTiming(js),
    fontRatios: parseTemplateFontRatios(js),
  };
}

/** Resolve a built-in template by name. Throws with the available list on miss. */
export function resolveBuiltin(name: string): Template {
  const dir = join(builtinTemplatesDir(), name);
  if (!existsSync(join(dir, "template.html"))) {
    const avail = listBuiltinTemplates().join(", ") || "(none)";
    throw new Error(`unknown template "${name}". available: ${avail}`);
  }
  return readTemplateDir(name, dir);
}

/** Resolve a project-local template from `<projectDir>/template/`. */
export function resolveProjectTemplate(projectDir: string): Template {
  const dir = join(projectDir, "template");
  if (!existsSync(dir)) {
    throw new Error(`project has no template/ directory: ${dir}`);
  }
  return readTemplateDir("project", dir);
}
