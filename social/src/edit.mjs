/**
 * CutPlan + beat sheet -> ffmpeg. Full playfield letterbox, freeze CTA, no fade-out.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildAss } from "./ass.mjs";
import { gameplayBeats, textEvents, FREEZE_S } from "./beats.mjs";
import {
  precomputeCropPath,
  sendcmdFromPath,
  CROP_FPS,
} from "./crop.mjs";
import {
  ASSETS,
  FIXTURES_DIR,
  GOLDEN_DIR,
  MEME,
  OUT_DIR,
  REPO_ROOT,
  defaultBoardMusic,
} from "./paths.mjs";
import { tryHarvestDay43 } from "./harvest.mjs";
import {
  ensureBeatOverlayPngs,
  ffmpegHasLibass,
} from "./overlay-text.mjs";
import { buildBeatSheet } from "./beats.mjs";
import { LETTERBOX_VF } from "./presets.mjs";

export const CANON = {
  width: 1080,
  height: 1920,
  fps: 30,
  crf: 19,
  wmW: 64,
  wmX: 1080 - 64 - 36,
  wmY: 1920 - 64 - 250,
  wmOpacity: 0.6,
};

const SFX_FILES = {
  riser: ASSETS.sfxRiser,
  boom: ASSETS.sfxBoom,
  rewind: ASSETS.sfxRewind,
  whoosh: ASSETS.sfxWhoosh,
  wah: ASSETS.sfxWah,
  braam: ASSETS.sfxBraam,
};

/**
 * @param {import('./beats.mjs').Beat[]} beats
 */
export function sheetGameplayDuration(beats) {
  const last = beats[beats.length - 1];
  if (!last) return 0;
  return last.kind === "freeze" ? last.outStart : last.outEnd;
}

/**
 * Map output time to source time via gameplay beats (v2.1 track).
 * @param {import('./beats.mjs').Beat[]} beats
 * @param {number} outT
 */
export function sourceTimeAt(beats, outT) {
  for (const b of gameplayBeats(beats)) {
    if (outT >= b.outStart && outT <= b.outEnd && b.srcStart != null) {
      const span = b.outEnd - b.outStart || 1;
      const u = (outT - b.outStart) / span;
      return b.srcStart + u * ((b.srcEnd ?? b.srcStart) - b.srcStart);
    }
  }
  return 0;
}

/**
 * @param {number} rate
 */
export function atempoFor(rate) {
  if (rate >= 0.5 && rate <= 2) return rate;
  if (rate < 0.5) return 0.5;
  return 2;
}

function escapeFilterPath(p) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''");
}

/**
 * @param {string[]} args
 */
export function formatCommand(args) {
  return args
    .map((a) =>
      /[^A-Za-z0-9_./:=+-]/.test(a) ? `'${String(a).replace(/'/g, `'\\''`)}'` : a
    )
    .join(" ");
}

/**
 * @deprecated v1 helper kept for the dry-test migration window
 */
export function slowMoSegments(cut, slowMo) {
  const s = Math.max(cut.start, slowMo.start);
  const e = Math.min(cut.end, slowMo.end);
  /** @type {{ start: number, end: number, rate: number }[]} */
  const segs = [];
  if (s > cut.start + 1e-4) segs.push({ start: cut.start, end: s, rate: 1 });
  if (e > s + 1e-4) segs.push({ start: s, end: e, rate: slowMo.rate ?? 0.5 });
  if (cut.end > e + 1e-4) segs.push({ start: e, end: cut.end, rate: 1 });
  return segs;
}

export function gameplayDuration(plan) {
  if (plan.sheetDuration) return plan.sheetDuration;
  if (plan.beats) return sheetGameplayDuration(plan.beats) + FREEZE_S;
  return plan.cut.end - plan.cut.start;
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import('./plan.mjs').CutPlan} plan
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @param {number} duration
 */
export function sheetForPlan(plan, sidecar, duration) {
  if (plan.beats?.length) {
    return {
      format: plan.format,
      beats: plan.beats,
      duration: plan.sheetDuration ?? sheetGameplayDuration(plan.beats) + FREEZE_S,
      punches: plan.punches ?? [],
      shakes: plan.shakes ?? [],
    };
  }
  return buildBeatSheet(plan.format, sidecar, duration, { graze: plan.graze });
}

/**
 * @param {{
 *   plan: import('./plan.mjs').CutPlan,
 *   record: { videoPath: string, sidecar: object, probe?: { width?: number, height?: number, hasAudio?: boolean, duration?: number } },
 *   outputPath: string,
 *   musicPath?: string | null,
 *   cropCmdPath: string,
 *   assPath: string,
 *   useLibass: boolean,
 *   overlays: { captions: { dest: string, start: number, end: number }[], scoreCard?: string, scoreCorner?: string, scoreCardAt?: number, scoreCornerRange?: [number, number] },
 *   sourceW: number,
 *   sourceH: number,
 *   initialCrop: { x: number, y: number, w: number, h: number },
 *   sfxHits: { file: string, at: number }[],
 *   sheet: ReturnType<typeof sheetForPlan>,
 * }} ctx
 */
export function buildFilterComplex(ctx) {
  const {
    plan,
    record,
    assPath,
    useLibass,
    overlays,
    sourceW,
    sourceH,
    sfxHits,
    musicPath,
    sheet,
  } = ctx;
  const parts = [];
  const hasAudio = Boolean(record.probe?.hasAudio);
  const beats = sheet.beats;
  const gp = gameplayBeats(beats);
  const playDur = sheetGameplayDuration(beats);
  const freeze = FREEZE_S;

  gp.forEach((b, i) => {
    const rate = b.rate ?? 1;
    const pts = rate === 1 ? "setpts=PTS-STARTPTS" : `setpts=PTS-STARTPTS,setpts=PTS/${rate}`;
    parts.push(
      `[0:v]trim=start=${b.srcStart}:end=${b.srcEnd},${pts},fps=${CANON.fps}[g${i}]`
    );
  });

  parts.push(
    `color=c=white:s=${sourceW}x${sourceH}:d=0.2:r=${CROP_FPS}[flash]`
  );

  const vLabels = [];
  let gi = 0;
  for (const b of beats) {
    if (b.kind === "flash") {
      parts.push(`[flash]trim=start=0:end=${(b.outEnd - b.outStart).toFixed(3)},setpts=PTS-STARTPTS[fl${vLabels.length}]`);
      vLabels.push(`[fl${vLabels.length}]`);
    } else if (b.kind === "gameplay" && !b.overlayOnly) {
      vLabels.push(`[g${gi++}]`);
    }
  }
  parts.push(
    `${vLabels.join("")}concat=n=${vLabels.length}:v=1:a=0[played]`
  );

  parts.push(
    `[played]fps=${CANON.fps},${LETTERBOX_VF},format=yuv420p[bleed]`
  );
  parts.push(
    `[bleed]tpad=stop_mode=clone:stop_duration=${freeze}[frozen]`
  );

  let vLast = "frozen";
  let n = 0;
  const overlayInput = (label) => {
    const src = `[${label}]`;
    return src;
  };

  parts.push(`[1:v]scale=${CANON.wmW}:-1,format=rgba,colorchannelmixer=aa=${CANON.wmOpacity}[wm]`);
  parts.push(`[2:v]format=rgba[vig]`);

  if (useLibass) {
    parts.push(
      `[${vLast}]subtitles='${escapeFilterPath(assPath)}'[vsub]`
    );
    vLast = "vsub";
  } else {
    for (const cap of overlays.captions) {
      const tag = `c${n++}`;
      parts.push(
        `[${vLast}][${cap.input}:v]overlay=0:0:enable='between(t,${cap.start.toFixed(3)},${cap.end.toFixed(3)})'[${tag}]`
      );
      vLast = tag;
    }
  }

  if (overlays.scoreCorner && overlays.scoreCornerInput != null) {
    const tag = `sc${n++}`;
    const [a, b] = overlays.scoreCornerRange ?? [1.2, 8.0];
    parts.push(
      `[${vLast}][${overlays.scoreCornerInput}:v]overlay=0:0:enable='between(t,${a},${b})'[${tag}]`
    );
    vLast = tag;
  }
  if (overlays.scoreCard && overlays.scoreCardInput != null) {
    const tag = `sd${n++}`;
    const at = overlays.scoreCardAt ?? 8.0;
    parts.push(
      `[${vLast}][${overlays.scoreCardInput}:v]overlay=0:0:enable='gte(t,${at})'[${tag}]`
    );
    vLast = tag;
  }

  for (const meme of overlays.memes ?? []) {
    const tag = `m${n++}`;
    const x = meme.x ?? "(W-w)/2";
    const y = meme.y ?? "(H-h)/2-120";
    parts.push(
      `[${meme.input}:v]scale=${meme.w ?? 720}:-1,format=rgba[ms${tag}]`
    );
    parts.push(
      `[${vLast}][ms${tag}]overlay=${x}:${y}:enable='between(t,${meme.start.toFixed(3)},${meme.end.toFixed(3)})'[${tag}]`
    );
    vLast = tag;
  }

  parts.push(`[${vLast}][vig]overlay=0:0[vvig]`);
  parts.push(`[vvig][wm]overlay=${CANON.wmX}:${CANON.wmY}[vout]`);

  const gain = 0.5;
  const aSegs = [];
  gp.forEach((b, i) => {
    if (hasAudio) {
      const tempo = b.rate && b.rate !== 1 ? `,atempo=${atempoFor(b.rate)}` : "";
      parts.push(
        `[0:a]atrim=start=${b.srcStart}:end=${b.srcEnd},asetpts=PTS-STARTPTS${tempo}[as${i}]`
      );
    } else {
      const dur = b.outEnd - b.outStart;
      parts.push(
        `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS[as${i}]`
      );
    }
    aSegs.push(`[as${i}]`);
  });

  const flashBeats = beats.filter((b) => b.kind === "flash");
  flashBeats.forEach((b, i) => {
    parts.push(
      `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${(b.outEnd - b.outStart).toFixed(3)},asetpts=PTS-STARTPTS[af${i}]`
    );
  });

  const aConcat = [];
  let ai = 0;
  let fi = 0;
  for (const b of beats) {
    if (b.kind === "flash") aConcat.push(`[af${fi++}]`);
    else if (b.kind === "gameplay" && !b.overlayOnly) aConcat.push(aSegs[ai++]);
  }
  parts.push(
    `${aConcat.join("")}concat=n=${aConcat.length}:v=0:a=1,volume=${gain},apad=pad_dur=${freeze}[agame]`
  );

  let aLast = "agame";
  sfxHits.forEach((hit, i) => {
    const ms = Math.max(0, Math.round(hit.at * 1000));
    parts.push(
      `[${hit.input}:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000,adelay=${ms}|${ms}[sfx${i}]`
    );
  });
  if (sfxHits.length) {
    const inputs = [`[${aLast}]`, ...sfxHits.map((_, i) => `[sfx${i}]`)].join("");
    parts.push(
      `${inputs}amix=inputs=${sfxHits.length + 1}:duration=first:dropout_transition=0:normalize=0[amixs]`
    );
    aLast = "amixs";
  }

  if (musicPath && ctx.musicInput != null) {
    parts.push(
      `[${ctx.musicInput}:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000,volume=0.35[amusic]`
    );
    parts.push(
      `[${aLast}][amusic]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amixm]`
    );
    aLast = "amixm";
  }

  parts.push(`[${aLast}]atrim=0:${(playDur + freeze).toFixed(3)},asetpts=PTS-STARTPTS[aout]`);

  void overlayInput;
  void plan;
  return parts.join(";");
}

/**
 * @param {{
 *   plan: import('./plan.mjs').CutPlan,
 *   record: object,
 *   outputPath: string,
 *   musicPath?: string | null,
 *   cropCmdPath: string,
 *   assPath: string,
 *   useLibass?: boolean,
 *   overlayFiles?: object,
 *   sourceW: number,
 *   sourceH: number,
 *   cropPath: ReturnType<typeof precomputeCropPath>,
 *   sheet: ReturnType<typeof sheetForPlan>,
 * }} opts
 */
export function buildFfmpegCommand(opts) {
  const {
    plan,
    record,
    outputPath,
    musicPath = null,
    cropCmdPath,
    assPath,
    useLibass = false,
    overlayFiles = { captions: [] },
    sourceW,
    sourceH,
    cropPath,
    sheet,
  } = opts;

  const args = ["ffmpeg", "-hide_banner", "-y", "-i", record.videoPath, "-i", ASSETS.mark, "-i", MEME.vignette];
  const inputMap = { video: 0, mark: 1, vig: 2 };
  let n = 3;

  const captions = [];
  if (!useLibass) {
    for (const cap of overlayFiles.captions ?? []) {
      args.push("-i", cap.dest);
      captions.push({ ...cap, input: n++ });
    }
  }

  let scoreCornerInput;
  let scoreCardInput;
  if (overlayFiles.scoreCorner) {
    args.push("-i", overlayFiles.scoreCorner);
    scoreCornerInput = n++;
  }
  if (overlayFiles.scoreCard) {
    args.push("-i", overlayFiles.scoreCard);
    scoreCardInput = n++;
  }

  const memes = [];
  for (const meme of overlayFiles.memes ?? []) {
    args.push("-i", meme.path);
    memes.push({ ...meme, input: n++ });
  }

  const sfxHits = [];
  for (const hit of overlayFiles.sfxHits ?? []) {
    args.push("-i", hit.file);
    sfxHits.push({ ...hit, input: n++ });
  }

  let musicInput;
  if (musicPath) {
    args.push("-stream_loop", "-1", "-i", musicPath);
    musicInput = n++;
  }

  const overlays = {
    captions,
    memes,
    scoreCard: overlayFiles.scoreCard,
    scoreCorner: overlayFiles.scoreCorner,
    scoreCardInput,
    scoreCornerInput,
    scoreCardAt: overlayFiles.scoreCardAt,
    scoreCornerRange: overlayFiles.scoreCornerRange,
  };

  const filterComplex = buildFilterComplex({
    plan,
    record,
    cropCmdPath,
    assPath,
    useLibass,
    overlays,
    sourceW,
    sourceH,
    initialCrop: cropPath.frames[0],
    sfxHits,
    musicPath,
    musicInput,
    sheet,
  });

  args.push(
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "19",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outputPath
  );

  return { args, filterComplex, inputMap, cropMode: cropPath.mode };
}

function collectSfxHits(sheet) {
  /** @type {{ file: string, at: number, name: string }[]} */
  const hits = [];
  for (const b of sheet.beats) {
    for (const s of b.sfx ?? []) {
      const file = SFX_FILES[s.name];
      if (file) hits.push({ file, at: s.at, name: s.name });
    }
  }
  return hits;
}

function collectMemes(sheet) {
  /** @type {{ name: string, path: string, start: number, end: number, w?: number }[]} */
  const out = [];
  for (const b of sheet.beats) {
    for (const name of b.memes ?? []) {
      const file = path.join(ASSETS.memes, `${name}.png`);
      const hold = Math.min(1.2, Math.max(0.6, b.outEnd - b.outStart));
      let start = b.outStart;
      if (name === "red-circle") start = Math.max(b.outStart, 5.2);
      out.push({
        name,
        path: file,
        start,
        end: Math.min(b.outEnd, start + hold),
        w: name === "red-circle" ? 420 : name === "rip" ? 360 : 780,
      });
    }
  }
  return out;
}

/**
 * @param {string[]} args ffmpeg args without the binary name
 */
export function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (buf) => {
      stderr += buf.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stderr });
      else {
        const err = new Error(`ffmpeg exited ${code}`);
        err.stderr = stderr;
        err.args = args;
        reject(err);
      }
    });
  });
}

/**
 * @param {{
 *   plan: import('./plan.mjs').CutPlan,
 *   record: import('./harvest.mjs').RunRecord,
 *   outputPath: string,
 *   musicPath?: string | null,
 *   dry?: boolean,
 * }} opts
 */
export async function renderEdit({
  plan,
  record,
  outputPath,
  musicPath,
  dry = false,
}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const sourceW = record.probe?.width ?? 1920;
  const sourceH = record.probe?.height ?? 1080;
  const duration = record.probe?.duration ?? plan.cut.end;
  const sheet = sheetForPlan(plan, record.sidecar, duration);

  let resolvedMusic = musicPath;
  if (resolvedMusic === undefined && plan.format === "THE_BOARD") {
    const candidate = defaultBoardMusic();
    resolvedMusic = (await fileExists(candidate)) ? candidate : null;
  }
  if (!resolvedMusic) resolvedMusic = null;

  const crop = precomputeCropPath({
    duration: sheetGameplayDuration(sheet.beats),
    sourceW,
    sourceH,
    sidecar: record.sidecar,
    graze: plan.graze,
    punches: sheet.punches,
    shakes: sheet.shakes,
    sourceTimeAt: (t) => sourceTimeAt(sheet.beats, t),
  });

  const cacheDir = path.join(OUT_DIR, ".cache", "v2");
  await mkdir(cacheDir, { recursive: true });
  const cropCmdPath = path.join(cacheDir, `${plan.format}.crop.txt`);
  const assPath = path.join(cacheDir, `${plan.format}.ass`);
  await writeFile(cropCmdPath, sendcmdFromPath(crop.frames));
  await writeFile(assPath, buildAss(textEvents(sheet.beats)));

  const useLibass = await ffmpegHasLibass();
  const events = textEvents(sheet.beats);
  const wantsCard = sheet.beats.some((b) => b.scoreCard);
  const wantsCorner = sheet.beats.some((b) => b.scoreOdometer);

  let overlayFiles = { captions: [], memes: collectMemes(sheet), sfxHits: [] };
  for (const hit of collectSfxHits(sheet)) {
    if (await fileExists(hit.file)) overlayFiles.sfxHits.push(hit);
  }
  overlayFiles.memes = overlayFiles.memes.filter((m) => true);

  if (!useLibass || wantsCard || wantsCorner) {
    const pngs = await ensureBeatOverlayPngs(events, record.sidecar, {
      scoreCard: wantsCard,
      scoreCorner: wantsCorner,
    });
    overlayFiles.captions = (pngs.captions ?? []).map((c, i) => ({
      dest: c.dest,
      start: events[i].start,
      end: events[i].end,
    }));
    overlayFiles.scoreCard = pngs.scoreCard;
    overlayFiles.scoreCorner = pngs.scoreCorner;
    overlayFiles.scoreCardAt = sheet.beats.find((b) => b.scoreCard)?.outStart;
    const od = sheet.beats.find((b) => b.scoreOdometer);
    if (od) overlayFiles.scoreCornerRange = [od.outStart, od.outEnd];
  }

  const built = buildFfmpegCommand({
    plan,
    record,
    outputPath,
    musicPath: resolvedMusic,
    cropCmdPath,
    assPath,
    useLibass,
    overlayFiles,
    sourceW,
    sourceH,
    cropPath: crop,
    sheet,
  });

  if (dry) {
    return { ...built, assPath, cropCmdPath, useLibass, cropMode: crop.mode };
  }

  const ffArgs = built.args.slice(1);
  await runFfmpeg(ffArgs);
  return { ...built, outputPath, assPath, useLibass, cropMode: crop.mode };
}

function parseCli(argv) {
  const out = {
    dry: argv.includes("--dry"),
    closeCallDemo: argv.includes("--close-call-demo"),
    fixture: null,
    format: null,
    music: null,
    video: null,
    sidecar: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--fixture") out.fixture = argv[++i];
    else if (argv[i] === "--format") out.format = argv[++i];
    else if (argv[i] === "--music") out.music = argv[++i];
    else if (argv[i] === "--video") out.video = argv[++i];
    else if (argv[i] === "--sidecar") out.sidecar = argv[++i];
  }
  return out;
}

async function main(argv) {
  const cli = parseCli(argv);

  if (cli.closeCallDemo) {
    const sidecar = {
      day: 10,
      mutatorIds: ["pit"],
      mutatorNames: ["THE PIT"],
      score: 8000,
      medal: null,
      survivalTime: 45,
      closestCall: { time: 10.5, x: 1, y: 2, clearance: 0.05 },
      topGrazes: [{ time: 10.5, clearance: 0.05 }],
    };
    const plan = {
      format: /** @type {const} */ ("CLOSE_CALL"),
      sourceBasename: "demo",
      cut: { start: 4.5, end: 14.5 },
      graze: { time: 10.5, clearance: 0.05, x: 1, y: 2 },
    };
    const sheet = buildBeatSheet("CLOSE_CALL", sidecar, 50, { graze: plan.graze });
    plan.beats = sheet.beats;
    plan.sheetDuration = sheet.duration;
    plan.punches = sheet.punches;
    plan.shakes = sheet.shakes;
    const built = await renderEdit({
      plan,
      record: {
        videoPath: path.join(REPO_ROOT, "fixtures", "demo.webm"),
        sidecar,
        probe: { width: 1920, height: 1080, duration: 50, fps: 30, hasAudio: true },
        filename: { date: "2026-08-21" },
      },
      outputPath: path.join(GOLDEN_DIR, "CLOSE_CALL_demo.mp4"),
      musicPath: cli.music,
      dry: true,
    });
    console.log(formatCommand(built.args));
    return;
  }

  if (cli.fixture === "day43") {
    const result = await tryHarvestDay43(FIXTURES_DIR);
    if (!result.ok) {
      console.error(result.error);
      process.exit(1);
    }
    const plan = cli.format
      ? result.plans.find((p) => p.format === cli.format)
      : result.plans[0];
    if (!plan) {
      console.error(`No plan for format ${cli.format}`);
      process.exit(1);
    }
    const outputPath = path.join(GOLDEN_DIR, `${plan.format}.mp4`);
    const built = await renderEdit({
      plan,
      record: result.record,
      outputPath,
      musicPath: cli.music,
      dry: cli.dry,
    });
    console.log(formatCommand(built.args));
    return;
  }

  console.error(
    "usage: node src/edit.mjs --dry --close-call-demo | --dry --fixture day43 --format THE_BOARD"
  );
  process.exit(1);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main(process.argv.slice(2));
}
