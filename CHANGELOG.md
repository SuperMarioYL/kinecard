# Changelog

All notable changes to KineCard are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/).

## [0.3.0] - 2026-08-23

Fix-driven minor release — three WYSIWYG / render-determinism defects grounded
in the shipped v0.2.0 source. No new features; the deterministic HTML/CSS → 9:16
render pipeline is unchanged.

### Fixed
- The renderer now honors each template's designed timing (mono
  1300/1600/900/1300, spotlight 1400/1500/640/1200) instead of silently
  applying `TimingSchema` defaults to every template, so card-mode `render.json`
  and the rendered MP4 carry the template's intended pacing and match the
  `template.html` preview. `--fps`/`--preset` and an explicit `render.json`
  timing still override. (`src/render.ts`, `src/schema.ts`, `src/templates.ts`)
- The safe-zone linter's font-size ratios are now template-aware: `-t mono`
  uses 7.6/5.2/3.8vw (matching `templates/mono/style.css`) instead of the
  minimal/spotlight 8.6/5.8/4.2vw, so boundary-length mono text no longer raises
  false-positive "overflows the safe zone" warnings for text that actually fits;
  minimal/spotlight ratios and lint behavior are unchanged. (`src/render.ts`,
  `src/templates.ts`)
- `writeProject` rewrites the bundled-font `url(...)` in the copied `style.css`
  to an absolute `file://` path to the bundled woff2 (the same face the renderer
  injects), so opening a project's `template.html` loads KineCJK instead of
  404-ing on the relative `../../assets/fonts` path and falling back to host
  system CJK fonts — the editable project preview now matches the rendered MP4.
  (`src/project.ts`)

[0.3.0]: https://github.com/SuperMarioYL/kinecard/releases/tag/v0.3.0

## [0.2.0] - 2026-08-03

Fix-driven minor release — four correctness defects found by reviewing the
shipped v0.1.0 source. No new features; the deterministic HTML/CSS → 9:16
render pipeline is unchanged.

### Fixed
- `lintCard` now also lints the optional `subtitle` line for 字幕安全区
  overflow (it previously only checked `title` and `lines[]`), so a long
  subtitle no longer clips silently. (`src/render.ts`)
- `render({input: <dir>})` for a non-project directory now throws a clear
  `not a card.yaml or a KineCard project` error instead of an opaque Node
  EISDIR. (`src/render.ts`)
- `loadCard` / `loadRenderConfig` wrap YAML / JSON parse failures with the
  same `invalid <source> <path>: <msg>` context as zod errors, instead of a
  bare parser traceback. (`src/schema.ts`)
- When the bundled CJK webfont is missing, `captureFrames` now emits a
  warning (`bundled CJK webfont not found — renders may differ across
  machines`) instead of silently degrading to host system fonts and breaking
  the byte-identical offline determinism guarantee. (`src/frames.ts`)

[0.2.0]: https://github.com/SuperMarioYL/kinecard/releases/tag/v0.2.0

## [0.1.0] - 2026-07-13

First public release — a deterministic HTML/CSS → 9:16 vertical kinetic
knowledge-card renderer, faceless, no voiceover.

### Added
- `kinecard render <card.yaml|project>` — render a card to a 1080×1920 H.264 MP4
  (`-t <template>`, `-o <out.mp4>`, `--project <dir>`, `--preset`, `--fps`).
- Deterministic frame engine: each template exposes a pure
  `window.KineCard.seek(tMs)`; the same input renders **byte-identical** output.
- Bundled static ffmpeg (`@ffmpeg-installer/ffmpeg`) — no system install needed.
- Bundled CJK webfont (Noto Sans SC subset, OFL) — 中文 renders offline with zero
  network, independent of host fonts.
- `--project` writes an editable HTML/CSS source project (`card.yaml` +
  `render.json` + `template/`); `kinecard render <dir>` re-renders a single card.
- Platform presets (`douyin` / `shipinhao` / `bilibili`) with 9:16 canvas, fps,
  max-duration, and 字幕安全区; a linter that **warns** (never blocks) on
  safe-zone overflow or over-length duration.
- Three built-in templates: `minimal` (centered fade-up), `spotlight` (dark
  spotlight highlight), `mono` (monospace typewriter with a time-driven caret).
- `kinecard init <dir>` scaffolds a starter project; `kinecard list` prints the
  template gallery.
- Test suite (schema / linter / frame timeline / encode args / project I/O /
  templates / end-to-end render + determinism).

[0.1.0]: https://github.com/SuperMarioYL/kinecard/releases/tag/v0.1.0
