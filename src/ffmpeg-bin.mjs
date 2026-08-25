/**
 * PATH ffmpeg only. Do not assume ffmpeg-static.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FF_OPTS = { maxBuffer: 32 * 1024 * 1024, encoding: "utf8" };

/** @type {string | null} */
let filterCache = null;

export function ffmpegBin() {
  return process.env.FFMPEG || "ffmpeg";
}

export function ffprobeBin() {
  return process.env.FFPROBE || "ffprobe";
}

/**
 * @param {string[]} args
 */
export function formatFfmpegCommand(args) {
  return [ffmpegBin(), ...args]
    .map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))
    .join(" ");
}

/**
 * @returns {Promise<string>}
 */
export async function ffmpegFilterList() {
  if (filterCache) return filterCache;
  try {
    const { stdout } = await execFileAsync(ffmpegBin(), ["-hide_banner", "-filters"], FF_OPTS);
    filterCache = stdout;
    return filterCache;
  } catch (err) {
    throw new Error(`ffmpeg is missing or broken: ${/** @type {Error} */ (err).message}`);
  }
}

/**
 * @param {string[]} names
 * @param {string} basename
 */
export async function requireFfmpegFilters(names, basename) {
  const list = await ffmpegFilterList();
  for (const name of names) {
    const re = new RegExp(`\\s${name}\\s`);
    if (!re.test(list)) {
      throw new Error(
        `ffmpeg missing filter "${name}" (needed for "${basename}"). Homebrew bottles often lack drawtext/libass; locked presets use PNG overlays instead.`
      );
    }
  }
}

/**
 * @param {string[]} args
 * @param {{ basename: string, label: string }} ctx
 */
export async function runFfmpeg(args, ctx) {
  try {
    await execFileAsync(ffmpegBin(), args, FF_OPTS);
  } catch (err) {
    const e = /** @type {Error & { stderr?: string }} */ (err);
    const tail = String(e.stderr || e.message).slice(-3000);
    throw new Error(`ffmpeg failed for "${ctx.basename}" (${ctx.label}): ${tail}`);
  }
}

/**
 * @param {string} mediaPath
 */
export async function probeDuration(mediaPath) {
  const { stdout } = await execFileAsync(
    ffprobeBin(),
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", mediaPath],
    FF_OPTS
  );
  const n = Number(stdout.trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`ffprobe missing duration for "${mediaPath}"`);
  }
  return n;
}
