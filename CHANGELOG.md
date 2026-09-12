# Changelog

All notable changes to KineCard are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/).

## [0.5.0] - 2026-09-13

Minor release — four fixes from shipped-source review, plus the m3 remainder
shipped as two new commands: the multi-card style-lock check and the auto
sample gallery.

### Fixed
- The safe-zone linter now subtracts each template's body-line chrome (mono's
  line number + caret ≈ 11.8vw, minimal/spotlight's accent bar ≈ 2.9vw,
  declared via a new `kinecard:line-chrome` template pragma) from the usable
  body width. Before the fix the linter lent that width to text, so
  boundary-length lines passed lint silently and then wrapped to two rows in
  the real render (measured on the actual templates: mono with the exact
  16-CJK text the old tests called "fits" wrapped, with the row overflowing
  its 950px client width) — a false negative, the mirror of the v0.3.0
  false-positive calibration fix. The lint boundary now matches the measured
  wrap boundary for all three templates. (`src/render.ts`, `src/templates.ts`,
  `templates/*/template.js`)
- `kinecard render <project>/ --fps N` / `--preset P` are now honored on
  project re-render instead of being silently swallowed (reproduced: a
  fps-30 project rendered with `--fps 5` produced 126 frames instead of 21,
  with no warning). Like `-o`, the flags override the project's `render.json`
  for that render only — the file on disk is untouched, so editing
  `render.json` remains the way to change the project permanently.
  (`src/render.ts`)
- The npm package now ships `VERSION`, so an installed package reports the
  real version instead of the silent `kinecard --version` → 0.0.0 fallback
  (verified via `npm pack --dry-run`: the v0.4.0 tarball had no VERSION
  entry, and the release workflow packs that tarball on every tag). A guard
  test keeps the packaged surface in sync with the CLI's runtime reads.
  (`package.json`, `tests/packaging.test.ts`)
- The READMEs now name the actual license — Apache-2.0, matching the LICENSE
  instrument, package.json and the site footer — instead of an unlabeled
  link. No re-licensing: the Apache-2.0 LICENSE file is unchanged.
  (`README.md`, `README.en.md`)

### Added
- `kinecard check <input>...` — the multi-card style-lock check: lints every
  card with the same safe-zone/duration linter the renderer uses (threading
  each project template's calibration), then compares platform, palette, and
  — between projects — timing and byte-identical template sources, naming
  exactly which input deviates. Exits non-zero when the set is inconsistent,
  so it can gate a CI or pre-publish step. Inputs may be card.yaml files,
  project directories, or a set directory (expanded to its project children).
  (`src/check.ts`)
- `kinecard gallery <card.yaml> [-o dir]` — renders the same card with every
  built-in template into `<dir>/<template>.mp4` plus a `gallery.html` index
  embedding each clip: one command turns a piece of copy into the full
  side-by-side template showcase. Reuses the normal render pipeline per
  template. (`src/gallery.ts`)

[0.5.0]: https://github.com/SuperMarioYL/kinecard/releases/tag/v0.5.0

## [0.4.0] - 2026-08-31

Fix-driven minor release — two WYSIWYG / render-determinism defects that the
v0.3.0 fix-driven minor closed for the card-mode path but missed in its two
sibling paths. No new features; the deterministic HTML/CSS → 9:16 render
pipeline is unchanged.

### Fixed
- `kinecard init <dir> -t <name>` now threads the template's designed timing
  into the scaffolded project's `render.json`, so a scaffolded mono project
  carries mono's 1300/1600/900/1300 pacing instead of the `TimingSchema`
  defaults (1400/1300/600/1200). Before the fix the scaffolded
  `template/template.js` ran at mono's pacing in the standalone browser preview
  while a `kinecard render <project>/` re-render read the default-timed
  `render.json` and ran at a different pace — a WYSIWYG break, the same defect
  class the v0.3.0 card-mode `render()` fix closed. `--preset` and an explicit
  `render.json` timing still override. (`src/cli.ts`)
- The project re-render path now threads the project's own template font-size
  ratios into the safe-zone linter. Before the fix a mono project re-render
  (`kinecard render my-mono/`) left the linter on the minimal/spotlight ratios
  (8.6/5.8/4.2) and emitted false-positive `overflows the safe zone` warnings
  for boundary-length CJK text that mono's 7.6/5.2/3.8 ratios actually fit —
  the same defect class the v0.3.0 card-mode linter fix closed. A custom
  template without the `kinecard:font-ratios` pragma still falls back to the
  baked defaults. (`src/render.ts`)

[0.4.0]: https://github.com/SuperMarioYL/kinecard/releases/tag/v0.4.0

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
