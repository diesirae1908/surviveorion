/**
 * NEW BEST board: fill the locked HTML template and screenshot at 1080x1920.
 * Numbers come from sidecar or HUD BEST. Never invent a previous-best.
 */

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { formatScore, assertNoEmDash } from "./captions.mjs";
import { runFfmpeg } from "./ffmpeg-bin.mjs";
import { PRESETS } from "./paths.mjs";

const execFileAsync = promisify(execFile);

const HUD_FRAME_S = 1;
const HUD_CROP = { w: 700, h: 220, x: 0, y: 0 };

/**
 * @param {string} text
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {string} raw
 */
export function parseHudBestText(raw) {
  const text = String(raw).replace(/\s+/g, " ");
  const labeled = text.match(/BEST\s*([\d,]+)/i);
  const token = labeled?.[1] ?? null;
  if (!token) return null;
  const n = Number(token.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * @param {{ sidecar: import('./sidecar.mjs').ClipSidecar, videoPath?: string|null, basename: string }} opts
 */
export async function resolvePrevBest(opts) {
  const { sidecar, videoPath, basename } = opts;
  if (sidecar.bestScore != null) {
    return sidecar.bestScore;
  }
  if (videoPath) {
    const hud = await tryReadHudBest(videoPath);
    if (hud != null) return hud;
  }
  throw new Error(
    `NEW_BEST cannot resolve PREV_BEST for "${basename}": sidecar has no bestScore and HUD BEST could not be read. Never invent the number.`
  );
}

/**
 * @param {string} videoPath
 * @returns {Promise<number|null>}
 */
export async function tryReadHudBest(videoPath) {
  const tesseract = await findTesseract();
  if (!tesseract) return null;

  const dir = await mkdtemp(path.join(os.tmpdir(), "orion-hud-best-"));
  const frame = path.join(dir, "frame.png");
  const crop = path.join(dir, "hud.png");
  try {
    await runFfmpeg(
      ["-y", "-loglevel", "error", "-ss", String(HUD_FRAME_S), "-i", videoPath, "-frames:v", "1", frame],
      { basename: path.basename(videoPath), label: "hud-best-frame" }
    );
    await runFfmpeg(
      [
        "-y", "-loglevel", "error", "-i", frame,
        "-vf", `crop=${HUD_CROP.w}:${HUD_CROP.h}:${HUD_CROP.x}:${HUD_CROP.y}`,
        crop,
      ],
      { basename: path.basename(videoPath), label: "hud-best-crop" }
    );
    const { stdout } = await execFileAsync(tesseract, [crop, "stdout", "--psm", "6"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    return parseHudBestText(stdout);
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<string|null>}
 */
async function findTesseract() {
  try {
    const { stdout } = await execFileAsync("which", ["tesseract"], { encoding: "utf8" });
    const p = stdout.trim();
    return p || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} template
 * @param {{ score: number, prevBest: number, day: number, mutator: string }} tokens
 */
export function fillNewBestBoardHtml(template, tokens) {
  if (tokens.prevBest == null || !Number.isFinite(tokens.prevBest)) {
    throw new Error("NEW_BEST board fill missing PREV_BEST. Never invent the number.");
  }
  const filled = template
    .replaceAll("{{SCORE}}", escapeHtml(formatScore(tokens.score)))
    .replaceAll("{{PREV_BEST}}", escapeHtml(formatScore(tokens.prevBest)))
    .replaceAll("{{DAY}}", escapeHtml(String(tokens.day)))
    .replaceAll("{{MUTATOR}}", escapeHtml(tokens.mutator));
  if (filled.includes("{{")) {
    throw new Error("NEW_BEST board template still has unfilled tokens");
  }
  assertNoEmDash(filled, "NEW BEST board");
  return filled;
}

/**
 * @param {string} html
 * @param {string} dest
 */
export async function renderNewBestBoardPng(html, dest) {
  const { chromium } = await import("playwright");
  const filledPath = path.join(PRESETS.dir, `.filled-${process.pid}.html`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(filledPath, html, "utf8");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1080, height: 1920 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(filledPath).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: dest,
      type: "png",
      clip: { x: 0, y: 0, width: 1080, height: 1920 },
    });
    await context.close();
  } finally {
    await browser.close();
    await unlink(filledPath).catch(() => {});
  }
  return dest;
}

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @param {string} dest
 * @param {{ videoPath?: string|null, basename?: string }} [ctx]
 */
export async function ensureNewBestBoard(sidecar, dest, ctx = {}) {
  const basename = ctx.basename || "clip";
  const prevBest = await resolvePrevBest({
    sidecar,
    videoPath: ctx.videoPath,
    basename,
  });
  const template = await readFile(PRESETS.newBestBoardTemplate, "utf8");
  const filled = fillNewBestBoardHtml(template, {
    score: sidecar.score,
    prevBest,
    day: sidecar.day,
    mutator: sidecar.mutatorNames[0] || "PATROL",
  });
  await renderNewBestBoardPng(filled, dest);
  return dest;
}

/**
 * @param {string} aPath
 * @param {string} bPath
 */
export async function pixelDiffPng(aPath, bPath) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "orion-board-diff-"));
  const aRaw = path.join(dir, "a.rgb");
  const bRaw = path.join(dir, "b.rgb");
  await runFfmpeg(
    ["-y", "-loglevel", "error", "-i", aPath, "-f", "rawvideo", "-pix_fmt", "rgb24", aRaw],
    { basename: path.basename(aPath), label: "diff-a" }
  );
  await runFfmpeg(
    ["-y", "-loglevel", "error", "-i", bPath, "-f", "rawvideo", "-pix_fmt", "rgb24", bRaw],
    { basename: path.basename(bPath), label: "diff-b" }
  );
  const a = await readFile(aRaw);
  const b = await readFile(bRaw);
  if (a.length !== b.length) {
    throw new Error(
      `NEW BEST board pixel-diff size mismatch: ${a.length} vs ${b.length} raw bytes`
    );
  }
  let maxDelta = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > maxDelta) maxDelta = d;
    sum += d;
  }
  const mae = sum / a.length;
  return {
    maxDelta,
    mae,
    bytes: a.length,
    pixels: a.length / 3,
    match: maxDelta === 0,
  };
}
