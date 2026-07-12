/**
 * encode.ts — PNG frame sequence → 9:16 H.264 MP4 via a bundled static ffmpeg.
 *
 * `@ffmpeg-installer/ffmpeg` ships a platform binary so users never install
 * ffmpeg themselves. Encoder settings are pinned (crf/preset/pix_fmt) so the
 * output is reproducible on a given machine.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { frameName } from "./frames";

/** Resolve the ffmpeg binary: bundled installer first, then system PATH. */
export function ffmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const installer = require("@ffmpeg-installer/ffmpeg") as { path?: string };
    if (installer?.path && existsSync(installer.path)) return installer.path;
  } catch {
    /* fall through to system ffmpeg */
  }
  return "ffmpeg";
}

export interface EncodeArgsOptions {
  frameDir: string;
  fps: number;
  size: [number, number];
  outFile: string;
}

/**
 * Build the ffmpeg argument list. Pure + unit tested. libx264 + yuv420p is the
 * broadest-compatible profile for 抖音/视频号/B站 upload.
 */
export function buildFfmpegArgs(opts: EncodeArgsOptions): string[] {
  const { frameDir, fps, size, outFile } = opts;
  // frameName(0) → "frame-000000.png"; derive the printf pattern from its width.
  const pattern = frameName(0).replace(/0+(?=\.png$)/, (m) => `%0${m.length}d`);
  return [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    `${frameDir}/${pattern}`,
    "-vf",
    `scale=${size[0]}:${size[1]}:flags=lanczos`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-profile:v",
    "high",
    "-movflags",
    "+faststart",
    "-r",
    String(fps),
    outFile,
  ];
}

/** Encode the PNG sequence in `frameDir` to `outFile`. */
export function encode(opts: EncodeArgsOptions): Promise<void> {
  const args = buildFfmpegArgs(opts);
  const bin = ffmpegPath();
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on("error", (err) => reject(new Error(`failed to launch ffmpeg (${bin}): ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`));
    });
  });
}
