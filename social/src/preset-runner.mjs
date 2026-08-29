/**
 * Run locked presets. No fallback to beats.mjs / edit.mjs.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ASSETS, PRESET_CACHE_DIR, PRESETS, defaultBoardMusic } from "./paths.mjs";
import { ensureNewBestBoard } from "./newbest-board.mjs";
import {
  formatFfmpegCommand,
  requireFfmpegFilters,
  runFfmpeg,
} from "./ffmpeg-bin.mjs";
import {
  NEW_BEST_PLAY_S,
  letterboxFilter,
  newBestSourceTimes,
  patrolSourceTimes,
  requirePresetInputs,
  wastedSourceTimes,
} from "./presets.mjs";

const ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", "24"];
const NEEDED = ["scale", "pad", "overlay", "hue", "vignette", "silenceremove"];

/**
 * @typedef {object} FfmpegStep
 * @property {string} label
 * @property {string[]} args
 */

/**
 * @param {import('./presets.mjs').LockedFormat} format
 * @param {import('./harvest.mjs').RunRecord} record
 * @param {string} outputPath
 * @param {{ workDir: string, boardPath?: string }} ctx
 * @returns {FfmpegStep[]}
 */
export function buildPresetSteps(format, record, outputPath, ctx) {
  const basename = record.basename;
  const vf = letterboxFilter(record.probe.width, record.probe.height, basename);
  const mkv = path.join(ctx.workDir, "src.mkv");
  const tagged = path.join(ctx.workDir, "tagged.mp4");
  /** @type {FfmpegStep[]} */
  const steps = [
    {
      label: "remux",
      args: ["-y", "-loglevel", "error", "-i", record.videoPath, "-c", "copy", mkv],
    },
  ];

  if (format === "WASTED") {
    const t = wastedSourceTimes(record.probe.duration, basename);
    const segA = path.join(ctx.workDir, "segA.mp4");
    const freezePng = path.join(ctx.workDir, "freeze.png");
    const segF = path.join(ctx.workDir, "segF.mp4");
    const segCraw = path.join(ctx.workDir, "segC-raw.mp4");
    const segC = path.join(ctx.workDir, "segC.mp4");
    const slamPng = path.join(ctx.workDir, "slam.png");
    const segD = path.join(ctx.workDir, "segD.mp4");
    const concatList = path.join(ctx.workDir, "concat.txt");
    const concatMp4 = path.join(ctx.workDir, "concat.mp4");

    steps.push({
      label: "segA-approach",
      args: [
        "-y", "-loglevel", "error", "-ss", String(t.approach), "-i", mkv, "-t", "4.5",
        "-vf", `${vf},fps=24`,
        "-an", ...ENC, segA,
      ],
    });
    steps.push({
      label: "freeze-frame",
      args: ["-y", "-loglevel", "error", "-ss", String(t.freeze), "-i", mkv, "-frames:v", "1", "-vf", vf, freezePng],
    });
    steps.push({
      label: "segF-freeze-vo",
      args: [
        "-y", "-loglevel", "error", "-loop", "1", "-framerate", "24", "-i", freezePng, "-t", "4.3",
        "-vf", `${vf},fps=24`,
        "-an", ...ENC, segF,
      ],
    });
    // letterbox first, then setpts on a second pass (setpts in the same graph does not stretch)
    steps.push({
      label: "segC-letterbox",
      args: [
        "-y", "-loglevel", "error", "-ss", String(t.freeze), "-i", mkv, "-t", "1.7",
        "-vf", `${vf},fps=24`,
        "-an", ...ENC, segCraw,
      ],
    });
    steps.push({
      label: "segC-slowmo",
      args: [
        "-y", "-loglevel", "error", "-i", segCraw,
        "-vf", "setpts=2.0*PTS",
        "-an", ...ENC, segC,
      ],
    });
    steps.push({
      label: "slam-frame",
      args: ["-y", "-loglevel", "error", "-ss", String(t.slam), "-i", mkv, "-frames:v", "1", "-vf", vf, slamPng],
    });
    steps.push({
      label: "segD-wasted",
      args: [
        "-y", "-loglevel", "error",
        "-loop", "1", "-framerate", "24", "-i", slamPng,
        "-i", ASSETS.wasted,
        "-filter_complex",
        `[0:v]${vf},fps=24,hue=s=0,eq=contrast=1.28:brightness=-0.05,vignette=PI/4.2[bg];[1:v]scale=880:-1[w];[bg][w]overlay=x=(W-w)/2:y='(H-h)/2-40':enable='gte(t,0.2)'`,
        "-t", "2.0", "-an", ...ENC, segD,
      ],
    });
    steps.push({
      label: "write-concat",
      args: [],
      concatList,
      concatFiles: [segA, segF, segC, segD],
    });
    steps.push({
      label: "concat",
      args: ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", concatMp4],
    });
    steps.push({
      label: "tagline",
      args: [
        "-y", "-loglevel", "error", "-i", concatMp4, "-i", PRESETS.tagWasted,
        "-filter_complex", "[0:v][1:v]overlay=x=(W-w)/2:y=64",
        "-an", ...ENC, tagged,
      ],
    });
    steps.push({
      label: "mix",
      args: [
        "-y", "-loglevel", "error",
        "-i", tagged,
        "-i", defaultBoardMusic(),
        "-i", ASSETS.voHeKnew,
        "-i", ASSETS.sfxBraam,
        "-filter_complex",
        [
          "[1:a]volume='if(between(t,12.2,12.4),0,if(between(t,4.5,8.8),0.10,if(gte(t,8.8),0.62,0.42)))'[mus]",
          "[2:a]silenceremove=start_periods=1:start_threshold=-40dB:detection=peak:stop_periods=-1:stop_threshold=-40dB,atrim=0:3.9,asetpts=PTS-STARTPTS,volume=2.1,adelay=4500|4500[vo]",
          "[3:a]volume=1.0,adelay=12400|12400[br]",
          "[mus][vo][br]amix=inputs=3:duration=first:dropout_transition=0,atrim=0:14.2,asetpts=PTS-STARTPTS[a]",
        ].join(";"),
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", "14.2",
        outputPath,
      ],
    });
    return steps;
  }

  if (format === "PATROL") {
    const t = patrolSourceTimes(record.probe.duration, basename);
    const play = path.join(ctx.workDir, "play.mp4");
    const freezePng = path.join(ctx.workDir, "freeze.png");
    const freezeMp4 = path.join(ctx.workDir, "freeze.mp4");
    const concatList = path.join(ctx.workDir, "concat.txt");
    const concatMp4 = path.join(ctx.workDir, "concat.mp4");
    steps.push({
      label: "patrol-play",
      args: [
        "-y", "-loglevel", "error", "-ss", String(t.start), "-i", mkv, "-t", String(t.playS),
        "-vf", `${vf},fps=24`,
        "-an", ...ENC, play,
      ],
    });
    steps.push({
      label: "patrol-freeze-frame",
      args: ["-y", "-loglevel", "error", "-ss", String(t.freezeAt), "-i", mkv, "-frames:v", "1", "-vf", vf, freezePng],
    });
    steps.push({
      label: "patrol-freeze",
      args: [
        "-y", "-loglevel", "error", "-loop", "1", "-framerate", "24", "-i", freezePng, "-t", String(t.freezeS),
        "-vf", `${vf},fps=24`,
        "-an", ...ENC, freezeMp4,
      ],
    });
    steps.push({
      label: "write-concat",
      args: [],
      concatList,
      concatFiles: [play, freezeMp4],
    });
    steps.push({
      label: "concat",
      args: ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", concatMp4],
    });
    steps.push({
      label: "tagline",
      args: [
        "-y", "-loglevel", "error", "-i", concatMp4, "-i", PRESETS.tagPatrol,
        "-filter_complex", "[0:v][1:v]overlay=x=(W-w)/2:y=64",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p",
        "-an", outputPath,
      ],
    });
    return steps;
  }

  if (format === "NEW_BEST") {
    const t = newBestSourceTimes(record.probe.duration, basename);
    const play = path.join(ctx.workDir, "play.mp4");
    const boardMp4 = path.join(ctx.workDir, "board.mp4");
    const concatList = path.join(ctx.workDir, "concat.txt");
    const boardPath = ctx.boardPath || path.join(ctx.workDir, "board.png");
    const music = defaultBoardMusic();
    steps.push({
      label: "newbest-play",
      args: [
        "-y", "-loglevel", "error", "-ss", String(t.start), "-i", mkv, "-t", String(NEW_BEST_PLAY_S),
        "-i", music,
        "-filter_complex",
        `[0:v]${vf},fps=24[v];[1:a]atrim=0:${NEW_BEST_PLAY_S},asetpts=PTS-STARTPTS,volume=0.42[a]`,
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", "24",
        "-c:a", "aac", "-b:a", "192k",
        play,
      ],
    });
    steps.push({
      label: "newbest-board",
      args: [
        "-y", "-loglevel", "error",
        "-loop", "1", "-framerate", "24", "-i", boardPath,
        "-i", ASSETS.celebrationFunk,
        "-filter_complex", "[0:v]scale=1080:1920,fps=24[v]",
        "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest",
        boardMp4,
      ],
    });
    steps.push({
      label: "write-concat",
      args: [],
      concatList,
      concatFiles: [play, boardMp4],
    });
    steps.push({
      label: "concat",
      args: [
        "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concatList,
        "-c", "copy",
        outputPath,
      ],
    });
    return steps;
  }

  throw new Error(`Unknown locked preset "${format}" for "${basename}"`);
}

/**
 * @param {FfmpegStep[]} steps
 */
export function formatPresetPlan(steps) {
  return steps
    .map((s) => {
      if (s.label === "write-concat") {
        return `# ${s.label}\n${(s.concatFiles || []).map((f) => `file '${f}'`).join("\n")}`;
      }
      return `# ${s.label}\n${formatFfmpegCommand(s.args)}`;
    })
    .join("\n\n");
}

/**
 * @param {{ format: import('./presets.mjs').LockedFormat, record: import('./harvest.mjs').RunRecord, outputPath: string, dry?: boolean }} opts
 */
export async function renderPreset({ format, record, outputPath, dry = false }) {
  const basename = record.basename;
  await requirePresetInputs(format, record);
  await requireFfmpegFilters(NEEDED, basename);

  const workDir = path.join(PRESET_CACHE_DIR, `${basename}-${format}`);
  await mkdir(workDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  let boardPath;
  if (format === "NEW_BEST" && !dry) {
    boardPath = await ensureNewBestBoard(record.sidecar, path.join(workDir, "board.png"), {
      videoPath: record.videoPath,
      basename,
    });
  } else if (format === "NEW_BEST") {
    boardPath = path.join(workDir, "board.png");
  }

  const steps = buildPresetSteps(format, record, outputPath, { workDir, boardPath });
  const plan = formatPresetPlan(steps);

  if (dry) {
    return { dry: true, format, basename, plan, steps, outputPath };
  }

  for (const step of steps) {
    if (step.label === "write-concat") {
      const body = (step.concatFiles || []).map((f) => `file '${f}'`).join("\n") + "\n";
      await writeFile(step.concatList, body);
      continue;
    }
    await runFfmpeg(step.args, { basename, label: step.label });
  }

  return { dry: false, format, basename, plan, outputPath };
}

async function main(argv) {
  const dry = argv.includes("--dry");
  let format = null;
  let video = null;
  let sidecarPath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--format") format = argv[++i];
    else if (argv[i] === "--video") video = argv[++i];
    else if (argv[i] === "--sidecar") sidecarPath = argv[++i];
  }
  if (!format) {
    console.error("usage: node src/preset-runner.mjs --format WASTED|PATROL|NEW_BEST [--dry]");
    process.exit(1);
  }
  const { tryHarvestDay43 } = await import("./harvest.mjs");
  const { FIXTURES_DIR, GOLDEN_DIR } = await import("./paths.mjs");
  const { harvestPair } = await import("./harvest.mjs");
  let record;
  if (video && sidecarPath) {
    record = await harvestPair(video, sidecarPath);
  } else {
    const result = await tryHarvestDay43(FIXTURES_DIR);
    if (!result.ok) {
      console.error(result.error);
      process.exit(1);
    }
    record = result.record;
  }
  const outputPath = path.join(GOLDEN_DIR, `${format}.mp4`);
  const built = await renderPreset({ format, record, outputPath, dry });
  console.log(built.plan);
  if (!dry) console.log(`wrote ${outputPath}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main(process.argv.slice(2));
}
