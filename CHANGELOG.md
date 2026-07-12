# Changelog

All notable changes to KineCard are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/).

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
