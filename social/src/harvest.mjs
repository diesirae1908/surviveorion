/**
 * Harvest clip+json pairs: ffprobe + sidecar parse -> RunRecord.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parseFilename, basenameWithoutExt, videoExt } from "./filename.mjs";
import { parseSidecarFile } from "./sidecar.mjs";
import { buildCutPlans } from "./plan.mjs";

const execFileAsync = promisify(execFile);
const FFPROBE_OPTS = { maxBuffer: 16 * 1024 * 1024, encoding: "utf8" };

/**
 * @typedef {object} ProbeResult
 * @property {number} width
 * @property {number} height
 * @property {number} duration
 * @property {number} fps
 * @property {boolean} hasAudio
 */

/**
 * @typedef {object} RunRecord
 * @property {string} basename
 * @property {string} videoPath
 * @property {string} sidecarPath
 * @property {ReturnType<typeof parseFilename>} filename
 * @property {import('./sidecar.mjs').ClipSidecar} sidecar
 * @property {ProbeResult} probe
 */

/**
 * Parse ffprobe r_frame_rate like "30000/1001".
 * @param {string} rate
 */
function parseFrameRate(rate) {
  if (!rate || rate === "0/0") return 30;
  const [num, den] = rate.split("/").map(Number);
  if (!den) return num || 30;
  return num / den;
}

/**
 * @param {string} videoPath
 * @returns {Promise<ProbeResult>}
 */
export async function ffprobeVideo(videoPath) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=width,height,r_frame_rate,codec_type,duration",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        videoPath,
      ],
      FFPROBE_OPTS
    ));
  } catch (err) {
    const msg = /** @type {NodeJS.ErrnoException} */ (err).message ?? String(err);
    throw new Error(`ffprobe failed for "${videoPath}": ${msg}`);
  }

  const data = JSON.parse(stdout);
  const streams = data.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === "video") ?? streams[0];
  if (!videoStream?.width || !videoStream?.height) {
    throw new Error(`ffprobe missing video dimensions for "${videoPath}"`);
  }

  const fps = parseFrameRate(videoStream.r_frame_rate);
  const hasAudio = streams.some((s) => s.codec_type === "audio");

  // Chrome MediaRecorder WebM often has format duration=N/A and a bogus
  // one-frame stream duration. Only trust container duration; else packets.
  const formatDur = Number(data.format?.duration);
  let duration = Number.isFinite(formatDur) && formatDur > 0 ? formatDur : 0;
  if (!duration) {
    duration = await probeDurationFromPackets(videoPath, fps);
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe missing duration for "${videoPath}"`);
  }

  return {
    width: videoStream.width,
    height: videoStream.height,
    duration,
    fps,
    hasAudio,
  };
}

/**
 * Chrome MediaRecorder WebM often has duration=N/A. Count packets / fps.
 * Dumping every pts via execFile can return only the first line.
 * @param {string} videoPath
 * @param {number} fps
 */
export async function probeDurationFromPackets(videoPath, fps) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-count_packets",
        "-show_entries",
        "stream=nb_read_packets",
        "-of",
        "json",
        videoPath,
      ],
      FFPROBE_OPTS
    ));
  } catch (err) {
    const msg = /** @type {NodeJS.ErrnoException} */ (err).message ?? String(err);
    throw new Error(`ffprobe packet scan failed for "${videoPath}": ${msg}`);
  }

  const data = JSON.parse(stdout);
  const n = Number(data.streams?.[0]?.nb_read_packets);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`ffprobe found no packets for "${videoPath}"`);
  }
  const rate = fps > 0 ? fps : 30;
  return n / rate;
}

/**
 * @param {string} sidecarPath
 * @returns {Promise<{ filename: ReturnType<typeof parseFilename>, sidecar: import('./sidecar.mjs').ClipSidecar }>}
 */
export async function readSidecarPair(sidecarPath) {
  const jsonBasename = path.basename(sidecarPath);
  const text = await readFile(sidecarPath, "utf8");
  return parseSidecarFile(text, jsonBasename);
}

/**
 * Harvest one paired clip directory entry.
 * @param {string} videoPath
 * @param {string} sidecarPath
 * @returns {Promise<RunRecord>}
 */
export async function harvestPair(videoPath, sidecarPath) {
  const videoBasename = path.basename(videoPath);
  const sidecarBasename = path.basename(sidecarPath);

  const videoBase = basenameWithoutExt(videoBasename);
  const sidecarBase = basenameWithoutExt(sidecarBasename);

  if (videoBase !== sidecarBase) {
    throw new Error(
      `Unpaired clip pair: video "${videoBasename}" vs sidecar "${sidecarBasename}" (basename mismatch)`
    );
  }

  if (!videoExt(videoBasename)) {
    throw new Error(`Not a video file: "${videoBasename}"`);
  }

  const [{ filename, sidecar }, probe] = await Promise.all([
    readSidecarPair(sidecarPath),
    ffprobeVideo(videoPath),
  ]);

  if (filename.basename !== videoBasename) {
    throw new Error(
      `Filename contract mismatch for "${videoBasename}": parsed basename "${filename.basename}"`
    );
  }

  return {
    basename: videoBase,
    videoPath,
    sidecarPath,
    filename,
    sidecar,
    probe,
  };
}

/**
 * @param {string} dir
 * @returns {Promise<Map<string, { video?: string, sidecar?: string }>>}
 */
async function indexDir(dir) {
  /** @type {Map<string, { video?: string, sidecar?: string }>} */
  const pairs = new Map();

  let entries;
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") {
      return pairs;
    }
    throw err;
  }

  for (const name of entries) {
    const full = path.join(dir, name);
    const st = await stat(full);
    if (!st.isFile()) continue;

    if (name.endsWith(".json")) {
      const base = basenameWithoutExt(name);
      const slot = pairs.get(base) ?? {};
      slot.sidecar = full;
      pairs.set(base, slot);
      continue;
    }

    if (/\.(webm|mp4)$/i.test(name)) {
      const base = basenameWithoutExt(name);
      const slot = pairs.get(base) ?? {};
      slot.video = full;
      pairs.set(base, slot);
    }
  }

  return pairs;
}

/**
 * Harvest all complete pairs in a directory. Warn and skip unpaired; never crash batch.
 * @param {string} dir
 * @param {{ isFirstOfUtcDay?: (date: string) => boolean }} [options]
 * @returns {Promise<{ records: RunRecord[], warnings: string[], plansByBasename: Record<string, import('./plan.mjs').CutPlan[]> }>}
 */
export async function harvestDirectory(dir, options = {}) {
  const pairs = await indexDir(dir);
  /** @type {RunRecord[]} */
  const records = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {Record<string, import('./plan.mjs').CutPlan[]>} */
  const plansByBasename = {};
  /** @type {Set<string>} */
  const patrolClaimedDays = new Set();

  for (const [base, slot] of pairs.entries()) {
    if (slot.video && slot.sidecar) {
      try {
        const record = await harvestPair(slot.video, slot.sidecar);
        records.push(record);

        const date = record.filename.date;
        const defaultFirst =
          record.sidecar.mutatorIds.length > 0 && !patrolClaimedDays.has(date);
        if (defaultFirst) {
          patrolClaimedDays.add(date);
        }
        const isFirstOfUtcDay = options.isFirstOfUtcDay?.(date) ?? defaultFirst;
        record.isFirstOfUtcDay = isFirstOfUtcDay;

        plansByBasename[record.basename] = buildCutPlans({
          sourceBasename: record.basename,
          sidecar: record.sidecar,
          duration: record.probe.duration,
          isFirstOfUtcDay,
        });
      } catch (err) {
        warnings.push(`${base}: ${/** @type {Error} */ (err).message}`);
      }
      continue;
    }

    if (slot.video && !slot.sidecar) {
      warnings.push(
        `Unpaired file skipped: "${path.basename(slot.video)}" (missing matching .json sidecar)`
      );
    } else if (slot.sidecar && !slot.video) {
      warnings.push(
        `Unpaired file skipped: "${path.basename(slot.sidecar)}" (missing matching .webm or .mp4)`
      );
    }
  }

  return { records, warnings, plansByBasename };
}

/**
 * Try to harvest the day43 fixture pair; returns error message if JSON missing.
 * @param {string} fixturesDir
 */
export async function tryHarvestDay43(fixturesDir) {
  const base = "orion_2026-08-25_day43_arsenal_3490380";
  const videoPath = path.join(fixturesDir, `${base}.webm`);
  const sidecarPath = path.join(fixturesDir, `${base}.json`);

  try {
    await stat(sidecarPath);
  } catch {
    return {
      ok: false,
      error: `Unpaired file skipped: "${base}.webm" (missing matching .json sidecar at "${sidecarPath}")`,
    };
  }

  try {
    await stat(videoPath);
  } catch {
    return {
      ok: false,
      error: `Missing video fixture: "${videoPath}"`,
    };
  }

  const record = await harvestPair(videoPath, sidecarPath);
  const plans = buildCutPlans({
    sourceBasename: record.basename,
    sidecar: record.sidecar,
    duration: record.probe.duration,
    isFirstOfUtcDay: true,
  });

  return { ok: true, record, plans };
}
