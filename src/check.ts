/**
 * check.ts — the multi-card style-lock check (the m3 remainder).
 *
 * `kinecard check <input>...` answers one question: does a SET of cards share
 * one style lock? A creator rendering a course chapter wants every card to
 * carry the same platform, palette, pacing and template — this command lints
 * each card with the same safe-zone/duration linter the renderer uses, then
 * compares the style-defining fields across the set and names exactly which
 * input deviates.
 *
 * Inputs may be:
 *   - a card.yaml file          (linted with the linter's baked defaults)
 *   - a project directory       (linted with the project template's calibration)
 *   - a set directory           (a directory without card.yaml whose direct
 *                                children are project directories — expanded)
 *
 * Per-card lint warnings are informational (parity with `render`); a style-lock
 * mismatch makes the set inconsistent and exits non-zero, so the check can
 * gate a CI or a pre-publish step.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import {
  loadCard,
  resolveRenderConfig,
  type Card,
  type RenderConfig,
} from "./schema";
import { resolveProjectTemplate, type TemplateMetrics } from "./templates";
import { lintCard, type Warning } from "./render";
import { isProjectDir, loadProject, TEMPLATE_DIR } from "./project";

/** One checked input, normalized: a card plus the config it would render with. */
export interface CheckedCard {
  input: string;
  /** Display name (card file or project dir basename). */
  name: string;
  card: Card;
  render: RenderConfig;
  /** Linter calibration from the project's own template (projects only). */
  metrics: TemplateMetrics | undefined;
  /** Project directory (projects only) — the template-source comparison base. */
  projectDir?: string;
  warnings: Warning[];
}

export interface CheckIssue {
  input: string;
  kind: "safe-zone" | "duration" | "style-lock";
  message: string;
}

export interface CheckResult {
  cards: CheckedCard[];
  issues: CheckIssue[];
  /** False when any style-lock issue exists (the exit-code signal). */
  consistent: boolean;
}

function abs(p: string): string {
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

/**
 * Expand set directories: an input that is a directory but NOT a KineCard
 * project stands for its direct children that ARE project directories. Card
 * files and project dirs pass through unchanged.
 */
export function expandCheckInputs(inputs: string[]): string[] {
  const out: string[] = [];
  for (const raw of inputs) {
    const p = abs(raw);
    let isDir = false;
    try {
      isDir = statSync(p).isDirectory();
    } catch {
      isDir = false; // a missing path surfaces later as a load error
    }
    if (isDir && !isProjectDir(p)) {
      for (const child of readdirSync(p).sort()) {
        const cp = join(p, child);
        if (statSync(cp).isDirectory() && isProjectDir(cp)) out.push(cp);
      }
      continue;
    }
    out.push(p);
  }
  return out;
}

/** Load one input into the normalized CheckedCard shape. */
function loadCheckedCard(input: string): CheckedCard {
  let isDir = false;
  try {
    isDir = statSync(input).isDirectory();
  } catch {
    /* fall through — loadCard/loadProject will give the readable error */
  }
  if (isDir) {
    const proj = loadProject(input);
    const template = resolveProjectTemplate(input);
    const metrics: TemplateMetrics = {
      fontRatios: template.fontRatios,
      lineChromeVw: template.lineChromeVw,
    };
    return {
      input,
      name: basename(input),
      card: proj.card,
      render: proj.render,
      metrics,
      projectDir: input,
      warnings: [],
    };
  }
  const card = loadCard(input);
  // A bare card lints the way a plain `render` would: preset from card.platform,
  // the linter's baked calibration (a template is only known at render time).
  return {
    input,
    name: basename(input),
    card,
    render: resolveRenderConfig(card),
    metrics: undefined,
    warnings: [],
  };
}

/** Order-insensitive JSON so {bg, accent} === {accent, bg} for comparisons. */
function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return (
      "{" +
      Object.keys(o)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonicalJson(o[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(v);
}

const TEMPLATE_FILES = ["template.html", "style.css", "template.js"] as const;

/** The three template source files of a project, as raw strings. */
function readTemplateSources(projectDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of TEMPLATE_FILES) {
    out[f] = readFileSync(join(projectDir, TEMPLATE_DIR, f), "utf8");
  }
  return out;
}

/**
 * Lint every input, then compare the style-defining fields across the set
 * against the first input (the reference). Style lock = same platform preset,
 * same palette, and — between project inputs — same timing and byte-identical
 * template source.
 */
export function checkSet(inputs: string[]): CheckResult {
  const expanded = expandCheckInputs(inputs);
  if (expanded.length === 0) {
    throw new Error("check: no card.yaml files or KineCard projects found in the given inputs");
  }
  const cards = expanded.map(loadCheckedCard);
  const issues: CheckIssue[] = [];

  // Per-card lint — informational, same linter + calibration as render.
  for (const c of cards) {
    c.warnings = lintCard(c.card, c.render, c.metrics);
    for (const w of c.warnings) {
      issues.push({ input: c.input, kind: w.kind, message: w.message });
    }
  }

  // Cross-card style lock, against the first input as the reference.
  const ref = cards[0];
  const refPalette = canonicalJson(ref.card.palette ?? null);
  const refTemplate = ref.projectDir ? readTemplateSources(ref.projectDir) : undefined;
  for (const c of cards.slice(1)) {
    if (c.render.preset !== ref.render.preset) {
      issues.push({
        input: c.input,
        kind: "style-lock",
        message: `platform ${c.render.preset} differs from ${ref.name}'s ${ref.render.preset}`,
      });
    }
    if (canonicalJson(c.card.palette ?? null) !== refPalette) {
      issues.push({
        input: c.input,
        kind: "style-lock",
        message: `palette differs from ${ref.name} (one sets it, the other doesn't, or the colours differ)`,
      });
    }
    if (ref.projectDir && c.projectDir) {
      if (canonicalJson(c.render.timing) !== canonicalJson(ref.render.timing)) {
        issues.push({
          input: c.input,
          kind: "style-lock",
          message: `timing differs from ${ref.name} (render.json pacing is part of the style lock)`,
        });
      }
      const cTemplate = readTemplateSources(c.projectDir);
      for (const f of TEMPLATE_FILES) {
        if (cTemplate[f] !== refTemplate![f]) {
          issues.push({
            input: c.input,
            kind: "style-lock",
            message: `template/${f} differs from ${ref.name}'s — the set does not share one template`,
          });
        }
      }
    }
  }

  return {
    cards,
    issues,
    consistent: !issues.some((i) => i.kind === "style-lock"),
  };
}
