/**
 * schema.ts — typed model for `card.yaml` and `render.json`.
 *
 * The KineCard primitive is an editable, diff-able project directory. Two files
 * carry all state:
 *   - card.yaml   : the content (title / lines / palette / platform)
 *   - render.json : the render manifest (preset / fps / size / timing / safe zone)
 *
 * Everything is validated with zod so a malformed card fails loudly with a
 * human-readable message instead of producing a broken MP4.
 */
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";

/** Platforms KineCard knows the vertical rules for. */
export const PLATFORMS = ["douyin", "shipinhao", "bilibili"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** A hex colour like `#RRGGBB` or `#RGB`. */
const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "expected a hex colour like #1D1D1F");

/** One body line. `accent` optionally overrides the palette accent for this line. */
export const LineSchema = z.object({
  text: z.string().min(1, "line text must not be empty"),
  accent: hex.optional(),
});
export type Line = z.infer<typeof LineSchema>;

/** Colour system for a card. All optional — the template supplies defaults. */
export const PaletteSchema = z
  .object({
    bg: hex,
    fg: hex,
    accent: hex,
    muted: hex,
  })
  .partial();
export type Palette = z.infer<typeof PaletteSchema>;

/** card.yaml */
export const CardSchema = z.object({
  title: z.string().min(1, "title is required"),
  subtitle: z.string().optional(),
  lines: z.array(LineSchema).min(1, "a card needs at least one line").max(12, "keep a card under 12 lines"),
  palette: PaletteSchema.optional(),
  platform: z.enum(PLATFORMS).default("douyin"),
});
export type Card = z.infer<typeof CardSchema>;

/** Timing model (milliseconds). The whole animation is a pure function of these. */
export const TimingSchema = z.object({
  titleMs: z.number().int().positive().default(1400),
  perLineMs: z.number().int().positive().default(1300),
  lineInMs: z.number().int().positive().default(600),
  outroMs: z.number().int().positive().default(1200),
});
export type Timing = z.infer<typeof TimingSchema>;

/** Subtitle-safe-zone as fractions of width/height (0..1). */
export const SafeZoneSchema = z.object({
  top: z.number().min(0).max(0.5).default(0.08),
  bottom: z.number().min(0).max(0.5).default(0.18),
  left: z.number().min(0).max(0.5).default(0.06),
  right: z.number().min(0).max(0.5).default(0.06),
});
export type SafeZone = z.infer<typeof SafeZoneSchema>;

/** render.json — the full, resolved render manifest that lives in a project. */
export const RenderConfigSchema = z.object({
  preset: z.enum(PLATFORMS).default("douyin"),
  fps: z.number().int().min(1).max(60).default(30),
  size: z
    .tuple([z.number().int().positive(), z.number().int().positive()])
    .default([1080, 1920]),
  timing: TimingSchema.default({}),
  safeZone: SafeZoneSchema.default({}),
});
export type RenderConfig = z.infer<typeof RenderConfigSchema>;

/** Per-platform vertical rules: canvas size, fps, max duration, subtitle safe zone. */
export interface PlatformPreset {
  size: [number, number];
  fps: number;
  maxDurationSec: number;
  safeZone: SafeZone;
}

export const PLATFORM_PRESETS: Record<Platform, PlatformPreset> = {
  // 抖音 — 1080×1920, ≤60s for the standard feed slot.
  douyin: {
    size: [1080, 1920],
    fps: 30,
    maxDurationSec: 60,
    safeZone: { top: 0.08, bottom: 0.18, left: 0.06, right: 0.06 },
  },
  // 视频号 — same canvas; the bottom nav/like rail eats more, so a taller bottom band.
  shipinhao: {
    size: [1080, 1920],
    fps: 30,
    maxDurationSec: 60,
    safeZone: { top: 0.09, bottom: 0.2, left: 0.06, right: 0.08 },
  },
  // B站 竖屏 — allows longer knowledge shorts; roomier zones.
  bilibili: {
    size: [1080, 1920],
    fps: 30,
    maxDurationSec: 180,
    safeZone: { top: 0.07, bottom: 0.14, left: 0.05, right: 0.05 },
  },
};

/**
 * Total video duration is a pure function of the timing model + line count.
 * The browser template mirrors this exact formula so frame count and animation
 * stay in lock-step (see templates/<name>/template.js).
 */
export function computeDurationMs(timing: Timing, lineCount: number): number {
  return timing.titleMs + lineCount * timing.perLineMs + timing.outroMs;
}

/**
 * Resolve a full RenderConfig from a card + optional overrides, using the
 * card's platform preset as the base. Overrides win over the preset.
 */
export function resolveRenderConfig(
  card: Card,
  overrides: Partial<{ preset: Platform; fps: number; timing: Partial<Timing> }> = {},
): RenderConfig {
  const preset = overrides.preset ?? card.platform;
  const p = PLATFORM_PRESETS[preset];
  return RenderConfigSchema.parse({
    preset,
    fps: overrides.fps ?? p.fps,
    size: p.size,
    timing: overrides.timing ?? {},
    safeZone: p.safeZone,
  });
}

function formatZodError(err: z.ZodError, source: string): Error {
  const lines = err.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
  return new Error(`invalid ${source}:\n${lines.join("\n")}`);
}

/** Parse + validate a card.yaml file. Throws a readable error on failure. */
export function loadCard(path: string): Card {
  const raw = readFileSync(path, "utf8");
  const data = parseYaml(raw);
  const parsed = CardSchema.safeParse(data);
  if (!parsed.success) throw formatZodError(parsed.error, `card ${path}`);
  return parsed.data;
}

/** Parse + validate a render.json file. Throws a readable error on failure. */
export function loadRenderConfig(path: string): RenderConfig {
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw);
  const parsed = RenderConfigSchema.safeParse(data);
  if (!parsed.success) throw formatZodError(parsed.error, `render manifest ${path}`);
  return parsed.data;
}
