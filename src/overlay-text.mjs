/**
 * Caption/score PNG overlay for ffmpeg builds without drawtext
 * (Homebrew ffmpeg 8/9 bottles drop freetype). Same Rajdhani 700, same slots.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { ASSETS, OUT_DIR } from "./paths.mjs";
import { formatScore, videoCaption } from "./captions.mjs";

const execFileAsync = promisify(execFile);
const CACHE_DIR = path.join(OUT_DIR, ".cache", "captions");

let drawtextCached = null;

export async function ffmpegHasDrawtext() {
  if (drawtextCached != null) return drawtextCached;
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      ["-hide_banner", "-filters"],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }
    );
    drawtextCached = /^\s*\S*\s+drawtext\s/m.test(stdout);
  } catch {
    drawtextCached = false;
  }
  return drawtextCached;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function colorizeMutators(line, mutatorNames) {
  let html = escapeHtml(line);
  for (const name of mutatorNames) {
    html = html.replaceAll(
      escapeHtml(name),
      `<span style="color:#ff4455">${escapeHtml(name)}</span>`
    );
  }
  return html;
}

/**
 * @param {import('./plan.mjs').CutPlan} plan
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 */
export function captionOverlayKey(plan, sidecar) {
  const cap = videoCaption(plan.format, sidecar, { graze: plan.graze });
  const score = plan.format === "THE_BOARD" ? formatScore(sidecar.score) : "";
  return createHash("sha1")
    .update(JSON.stringify({ lines: cap.lines, score, format: plan.format }))
    .digest("hex")
    .slice(0, 16);
}

/**
 * @param {import('./plan.mjs').CutPlan} plan
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @returns {Promise<string>} png path
 */
export async function ensureCaptionOverlayPng(plan, sidecar) {
  const key = captionOverlayKey(plan, sidecar);
  const dest = path.join(CACHE_DIR, `${key}.png`);
  try {
    await stat(dest);
    return dest;
  } catch {
    /* miss */
  }

  const cap = videoCaption(plan.format, sidecar, { graze: plan.graze });
  const score = plan.format === "THE_BOARD" ? formatScore(sidecar.score) : "";
  const font400 = pathToFileURL(ASSETS.fontRegular).href;
  const font700 = pathToFileURL(ASSETS.fontBold).href;
  const lineHtml = cap.lines
    .map(
      (line, i) =>
        `<div class="line" style="top:${i === 0 ? 196 : 246}px;font-size:${cap.fontSize}px">${colorizeMutators(line, cap.mutatorNames)}</div>`
    )
    .join("");
  const scoreHtml = score
    ? `<div class="score">${escapeHtml(score)}</div>`
    : "";

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
    });
    await page.setContent(`<!doctype html><html><head>
<style>
@font-face { font-family: Rajdhani; src: url('${font400}'); font-weight: 400; }
@font-face { font-family: Rajdhani; src: url('${font700}'); font-weight: 700; }
html, body { margin: 0; width: 1080px; height: 1920px; background: transparent; }
.line {
  position: absolute; left: 40px; right: 40px; text-align: center;
  font-family: Rajdhani, sans-serif; font-weight: 700; color: #fff7e0;
  letter-spacing: 0.02em;
}
.score {
  position: absolute; top: 1296px; left: 40px; right: 40px; text-align: center;
  font-family: Rajdhani, sans-serif; font-weight: 700; color: #ffd700;
  font-size: 64px; font-variant-numeric: tabular-nums; letter-spacing: 0.04em;
}
</style></head>
<body>${lineHtml}${scoreHtml}</body></html>`);
    try {
      await page.evaluate(() => document.fonts.ready);
    } catch {
      /* best-effort */
    }
    await new Promise((r) => setTimeout(r, 160));
    await mkdir(CACHE_DIR, { recursive: true });
    await page.screenshot({ path: dest, omitBackground: true });
  } finally {
    await browser.close();
  }
  return dest;
}
