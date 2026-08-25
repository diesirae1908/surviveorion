/**
 * CutPlan -> ffmpeg filtergraph -> 1080x1920 H.264 MP4.
 * --dry prints the command without running ffmpeg.
 */

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ASSETS,
  FIXTURES_DIR,
  GOLDEN_DIR,
  REPO_ROOT,
} from "./paths.mjs";
import {
  estimateRajdhaniWidth,
  formatScore,
  videoCaption,
} from "./captions.mjs";
import { endcardCachePath, ensureEndcard } from "./endcard.mjs";
import { tryHarvestDay43 } from "./harvest.mjs";
import {
  ensureCaptionOverlayPng,
  ffmpegHasDrawtext,
} from "./overlay-text.mjs";

export const CANON = {
  width: 1080,
  height: 1920,
  fps: 30,
  crf: 19,
  void: "0x0a0a12",
  starlight: "0xfff7e0",
  alarm: "0xff4455",
  gold: "0xffd700",
  captionY: 180,
  captionH: 120,
  captionLine1Y: 222,
  captionLine2Y: 268,
  wmW: 64,
  wmX: 1080 - 64 - 36,
  wmY: 1920 - 64 - 320,
  wmOpacity: 0.6,
  scoreY: 1360,
  scoreSize: 64,
  xfade: 0.25,
  endcard: 1.5,
};

/**
 * @param {{ start: number, end: number }} cut
 * @param {{ start: number, end: number, rate: number }} slowMo
 * @returns {{ start: number, end: number, rate: number }[]}
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

/**
 * @param {import('./plan.mjs').CutPlan} plan
 */
export function gameplayDuration(plan) {
  if (plan.slowMo) {
    return slowMoSegments(plan.cut, plan.slowMo).reduce(
      (sum, seg) => sum + (seg.end - seg.start) / seg.rate,
      0
    );
  }
  return plan.cut.end - plan.cut.start;
}

/**
 * @param {import('./plan.mjs').FormatId} format
 */
export function gameAudioGain(format) {
  return format === "SPACE_DUST" ? 0.5 : 0.85;
}

function escapeDrawtext(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

function escapeFilterPath(p) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function frameChain() {
  return [
    "scale=1080:-2",
    "pad=1080:1920:0:'max(0\\,min(1920-ih\\,1920*0.46-ih/2))':color=0x0a0a12",
    "fps=30",
    "format=yuv420p",
  ].join(",");
}

function captionFilters(plan, sidecar, fontfile) {
  const caption = videoCaption(plan.format, sidecar, { graze: plan.graze });
  const font = escapeFilterPath(fontfile);
  const filters = [
    `drawbox=x=0:y=${CANON.captionY}:w=1080:h=${CANON.captionH}:color=0x0a0a12@0.72:t=fill`,
  ];
  const ys = [CANON.captionLine1Y, CANON.captionLine2Y];
  caption.lines.forEach((line, i) => {
    if (!line) return;
    const y = ys[i] ?? CANON.captionLine1Y;
    filters.push(
      `drawtext=fontfile='${font}':text='${escapeDrawtext(line)}':fontcolor=${CANON.starlight}:fontsize=${caption.fontSize}:x=(w-text_w)/2:y=${y}`
    );
    for (const name of caption.mutatorNames) {
      const idx = line.indexOf(name);
      if (idx < 0) continue;
      const prefixW = estimateRajdhaniWidth(line.slice(0, idx), caption.fontSize);
      const fullW = estimateRajdhaniWidth(line, caption.fontSize);
      const x = Math.round((1080 - fullW) / 2 + prefixW);
      filters.push(
        `drawtext=fontfile='${font}':text='${escapeDrawtext(name)}':fontcolor=${CANON.alarm}:fontsize=${caption.fontSize}:x=${x}:y=${y}`
      );
    }
  });
  return filters;
}

function scoreFilter(sidecar, fontfile) {
  const font = escapeFilterPath(fontfile);
  return `drawtext=fontfile='${font}':text='${escapeDrawtext(formatScore(sidecar.score))}':fontcolor=${CANON.gold}:fontsize=${CANON.scoreSize}:x=(w-text_w)/2:y=${CANON.scoreY}`;
}

/**
 * @param {{
 *   videoPath: string,
 *   markPath: string,
 *   endcardPath?: string | null,
 *   sfxPath?: string | null,
 *   musicPath?: string | null,
 *   plan: import('./plan.mjs').CutPlan,
 * }} opts
 */
export function buildInputArgs({
  videoPath,
  markPath,
  endcardPath = null,
  sfxPath = null,
  musicPath = null,
  captionPng = null,
  plan,
}) {
  /** @type {string[]} */
  const args = ["-i", videoPath, "-i", markPath];
  /** @type {{ video: number, mark: number, endcard?: number, sfx?: number, music?: number, caption?: number }} */
  const inputMap = { video: 0, mark: 1 };
  let n = 2;
  if (captionPng) {
    args.push("-i", captionPng);
    inputMap.caption = n++;
  }
  if (plan.endcardSeconds && endcardPath) {
    args.push("-loop", "1", "-t", String(plan.endcardSeconds), "-i", endcardPath);
    inputMap.endcard = n++;
  }
  if (plan.format === "SPACE_DUST" && sfxPath) {
    args.push("-i", sfxPath);
    inputMap.sfx = n++;
  }
  if (musicPath) {
    args.push("-stream_loop", "-1", "-i", musicPath);
    inputMap.music = n++;
  }
  return { args, inputMap };
}

/**
 * @param {{
 *   plan: import('./plan.mjs').CutPlan,
 *   record: { sidecar: import('./sidecar.mjs').ClipSidecar, probe?: { hasAudio?: boolean } },
 *   inputMap: { mark: number, endcard?: number, sfx?: number, music?: number },
 *   fontBold: string,
 * }} ctx
 */
export function buildFilterComplex({ plan, record, inputMap, fontBold }) {
  const parts = [];
  const frame = frameChain();
  const hasAudio = Boolean(record.probe?.hasAudio);
  const gp = gameplayDuration(plan);
  const wantsEndcard = Boolean(plan.endcardSeconds) && inputMap.endcard != null;

  if (plan.slowMo) {
    const segs = slowMoSegments(plan.cut, plan.slowMo);
    const labels = segs.map((_, i) => `[v${i}]`);
    segs.forEach((seg, i) => {
      const pts =
        seg.rate === 1
          ? "setpts=PTS-STARTPTS"
          : "setpts=PTS-STARTPTS,setpts=2*PTS";
      parts.push(
        `[0:v]trim=start=${seg.start}:end=${seg.end},${pts},${frame}${labels[i]}`
      );
    });
    if (segs.length === 1) {
      parts.push(`${labels[0]}null[framed]`);
    } else {
      parts.push(`${labels.join("")}concat=n=${segs.length}:v=1:a=0[framed]`);
    }
  } else {
    parts.push(
      `[0:v]trim=start=${plan.cut.start}:end=${plan.cut.end},setpts=PTS-STARTPTS,${frame}[framed]`
    );
  }

  if (inputMap.caption != null) {
    const scrim = `drawbox=x=0:y=${CANON.captionY}:w=1080:h=${CANON.captionH}:color=0x0a0a12@0.72:t=fill`;
    parts.push(`[framed]${scrim}[vscrim]`);
    parts.push(`[${inputMap.caption}:v]format=rgba[cap]`);
    parts.push(`[vscrim][cap]overlay=0:0[vtext]`);
  } else {
    const overlays = captionFilters(plan, record.sidecar, fontBold);
    if (plan.format === "THE_BOARD") {
      overlays.push(scoreFilter(record.sidecar, fontBold));
    }
    parts.push(`[framed]${overlays.join(",")}[vtext]`);
  }
  parts.push(
    `[${inputMap.mark}:v]scale=${CANON.wmW}:-1,format=rgba,colorchannelmixer=aa=${CANON.wmOpacity}[wm]`
  );
  parts.push(`[vtext][wm]overlay=${CANON.wmX}:${CANON.wmY}[vmarked]`);

  if (wantsEndcard) {
    const offset = Math.max(0, gp - CANON.xfade);
    parts.push(
      `[${inputMap.endcard}:v]scale=1080:1920,fps=30,format=yuv420p,setpts=PTS-STARTPTS[ec]`
    );
    parts.push(
      `[vmarked]format=yuv420p[va];[va][ec]xfade=transition=fade:duration=${CANON.xfade}:offset=${offset}[vout]`
    );
  } else {
    parts.push(`[vmarked]format=yuv420p[vout]`);
  }

  const gain = gameAudioGain(plan.format);
  let aLast = "[agame]";

  if (plan.slowMo && hasAudio) {
    const segs = slowMoSegments(plan.cut, plan.slowMo);
    const labels = segs.map((_, i) => `[a${i}]`);
    segs.forEach((seg, i) => {
      const tempo = seg.rate === 1 ? "" : ",atempo=0.5";
      parts.push(
        `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS${tempo}${labels[i]}`
      );
    });
    if (segs.length === 1) {
      parts.push(`${labels[0]}volume=${gain}[agame]`);
    } else {
      parts.push(
        `${labels.join("")}concat=n=${segs.length}:v=0:a=1,volume=${gain}[agame]`
      );
    }
  } else if (hasAudio) {
    parts.push(
      `[0:a]atrim=start=${plan.cut.start}:end=${plan.cut.end},asetpts=PTS-STARTPTS,volume=${gain}[agame]`
    );
  } else {
    parts.push(
      `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${gp},asetpts=PTS-STARTPTS,volume=${gain}[agame]`
    );
  }

  if (plan.format === "SPACE_DUST" && inputMap.sfx != null) {
    const delayMs = Math.max(0, Math.round((gp - 0.12) * 1000));
    parts.push(
      `[${inputMap.sfx}:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000,adelay=${delayMs}|${delayMs}[sfx]`
    );
    parts.push(
      `[agame][sfx]amix=inputs=2:duration=first:dropout_transition=0[amixs]`
    );
    aLast = "[amixs]";
  }

  if (inputMap.music != null) {
    parts.push(
      `[${inputMap.music}:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000,volume=0.35[amusic]`
    );
    parts.push(
      `${aLast}[amusic]amix=inputs=2:duration=first:dropout_transition=0[amixm]`
    );
    aLast = "[amixm]";
  }

  if (wantsEndcard) {
    const fadeStart = Math.max(0, gp - CANON.xfade);
    const pad = Math.max(0, (plan.endcardSeconds ?? CANON.endcard) - CANON.xfade);
    parts.push(
      `${aLast}afade=t=out:st=${fadeStart}:d=${CANON.xfade},apad=pad_dur=${pad}[aout]`
    );
  } else {
    parts.push(`${aLast}acopy[aout]`);
  }

  return parts.join(";");
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
 * Build a full ffmpeg argv list. Does not run ffmpeg.
 * @param {{
 *   plan: import('./plan.mjs').CutPlan,
 *   record: {
 *     videoPath: string,
 *     sidecar: import('./sidecar.mjs').ClipSidecar,
 *     probe?: { hasAudio?: boolean },
 *     filename?: { date?: string },
 *   },
 *   outputPath: string,
 *   musicPath?: string | null,
 *   endcardPath?: string | null,
 * }} opts
 */
export function buildFfmpegCommand({
  plan,
  record,
  outputPath,
  musicPath = null,
  endcardPath = null,
  captionPng = null,
}) {
  const date = record.filename?.date ?? "unknown";
  const resolvedEndcard =
    endcardPath ?? (plan.endcardSeconds ? endcardCachePath(date) : null);
  const { args: inputArgs, inputMap } = buildInputArgs({
    videoPath: record.videoPath,
    markPath: ASSETS.mark,
    endcardPath: resolvedEndcard,
    sfxPath: ASSETS.sfxImpact,
    musicPath,
    captionPng,
    plan,
  });
  const filterComplex = buildFilterComplex({
    plan,
    record,
    inputMap,
    fontBold: ASSETS.fontBold,
  });
  const args = [
    "ffmpeg",
    "-hide_banner",
    "-y",
    ...inputArgs,
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
    outputPath,
  ];
  return { args, filterComplex, inputMap };
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
  musicPath = null,
  dry = false,
}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const date = record.filename?.date ?? "unknown";
  let endcardPath = null;
  if (plan.endcardSeconds) {
    if (dry) {
      try {
        endcardPath = await ensureEndcard(record.sidecar, date);
      } catch {
        endcardPath = endcardCachePath(date);
      }
    } else {
      endcardPath = await ensureEndcard(record.sidecar, date);
    }
  }

  let captionPng = null;
  if (!(await ffmpegHasDrawtext())) {
    captionPng = await ensureCaptionOverlayPng(plan, record.sidecar);
  }

  const built = buildFfmpegCommand({
    plan,
    record,
    outputPath,
    musicPath,
    endcardPath,
    captionPng,
  });

  if (dry) {
    return built;
  }

  const ffArgs = built.args.slice(1);
  await runFfmpeg(ffArgs);
  return { ...built, outputPath };
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

function closeCallDemoPlan() {
  return {
    format: /** @type {const} */ ("CLOSE_CALL"),
    sourceBasename: "demo",
    cut: { start: 4, end: 14 },
    slowMo: { start: 9.6, end: 10.6, rate: 0.5 },
    graze: { time: 10, clearance: 0.05 },
  };
}

function closeCallDemoRecord() {
  return {
    videoPath: path.join(REPO_ROOT, "fixtures", "demo.webm"),
    sidecar: {
      day: 1,
      mutatorIds: ["arsenal"],
      mutatorNames: ["ARSENAL"],
      score: 100,
      medal: null,
      survivalTime: 60,
      closestCall: null,
      topGrazes: [],
    },
    probe: { width: 1920, height: 1080, duration: 60, fps: 30, hasAudio: true },
    filename: { date: "2026-08-25" },
  };
}

async function main(argv) {
  const cli = parseCli(argv);

  if (cli.closeCallDemo) {
    const built = buildFfmpegCommand({
      plan: closeCallDemoPlan(),
      record: closeCallDemoRecord(),
      outputPath: path.join(GOLDEN_DIR, "CLOSE_CALL_demo.mp4"),
      musicPath: cli.music,
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
