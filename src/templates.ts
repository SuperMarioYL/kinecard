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

/** The three files every template must expose. */
export interface Template {
  /** Resolved name (built-in id, or "project" for a project-local template). */
  name: string;
  /** Absolute directory the files were read from. */
  dir: string;
  html: string;
  css: string;
  js: string;
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

function readTemplateDir(name: string, dir: string): Template {
  for (const f of TEMPLATE_FILES) {
    if (!existsSync(join(dir, f))) {
      throw new Error(`template "${name}" is missing ${f} (looked in ${dir})`);
    }
  }
  return {
    name,
    dir,
    html: readFileSync(join(dir, "template.html"), "utf8"),
    css: readFileSync(join(dir, "style.css"), "utf8"),
    js: readFileSync(join(dir, "template.js"), "utf8"),
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
