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
let libassCached = null;

async function ffmpegFilterList() {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-filters"],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }
  );
  return stdout;
}

export async function ffmpegHasDrawtext() {
  if (drawtextCached != null) return drawtextCached;
  try {
    drawtextCached = /^\s*\S*\s+drawtext\s/m.test(await ffmpegFilterList());
  } catch {
    drawtextCached = false;
  }
  return drawtextCached;
}

export async function ffmpegHasLibass() {
  if (libassCached != null) return libassCached;
  try {
    libassCached = /^\s*\S*\s+subtitles\s/m.test(await ffmpegFilterList());
  } catch {
    libassCached = false;
  }
  return libassCached;
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

const COLOR_HEX = {
  starlight: "#fff7e0",
  alarm: "#ff4455",
  gold: "#ffd700",
};

/**
 * Timed caption / score-card PNGs for a v2 beat sheet (libass fallback).
 * @param {{ id: string, lines: string[], color?: string }[]} events
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 */
export async function ensureBeatOverlayPngs(events, sidecar, extras = {}) {
  const { chromium } = await import("playwright");
  const font400 = pathToFileURL(ASSETS.fontRegular).href;
  const font700 = pathToFileURL(ASSETS.fontBold).href;
  await mkdir(CACHE_DIR, { recursive: true });

  const jobs = events.map((ev) => {
    const key = createHash("sha1")
      .update(JSON.stringify({ lines: ev.lines, color: ev.color, kind: ev.kind ?? "text" }))
      .digest("hex")
      .slice(0, 16);
    return { ...ev, dest: path.join(CACHE_DIR, `v2-${key}.png`) };
  });

  const missing = [];
  for (const job of jobs) {
    try {
      await stat(job.dest);
    } catch {
      missing.push(job);
    }
  }
  if (missing.length === 0 && !extras.scoreCard && !extras.scoreCorner) {
    return { captions: jobs };
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    const shoot = async (dest, body) => {
      await page.setContent(`<!doctype html><html><head><style>
@font-face { font-family: Rajdhani; src: url('${font400}'); font-weight: 400; }
@font-face { font-family: Rajdhani; src: url('${font700}'); font-weight: 700; }
html, body { margin: 0; width: 1080px; height: 1920px; background: transparent; }
.wrap {
  position: absolute; top: 18%; left: 48px; right: 48px; text-align: center;
  font-family: Rajdhani, sans-serif; font-weight: 700; letter-spacing: 0.04em;
  line-height: 1.08; text-transform: uppercase;
  -webkit-text-stroke: 4px #0a0a12;
  paint-order: stroke fill;
}
.line { font-size: 96px; }
.card {
  position: absolute; inset: 0; background: rgba(10,10,18,0.72);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: Rajdhani, sans-serif; font-weight: 700; text-align: center;
}
.card .score {
  color: #ffd700; font-size: 120px; letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums; -webkit-text-stroke: 3px #0a0a12;
}
.card .sub { color: #fff7e0; font-size: 42px; margin-top: 18px; letter-spacing: 0.08em; }
.corner {
  position: absolute; right: 48px; top: 72%; color: #ffd700;
  font-family: Rajdhani, sans-serif; font-weight: 700; font-size: 54px;
  font-variant-numeric: tabular-nums; -webkit-text-stroke: 3px #0a0a12;
}
</style></head><body>${body}</body></html>`);
      try { await page.evaluate(() => document.fonts.ready); } catch { /* */ }
      await new Promise((r) => setTimeout(r, 80));
      await page.screenshot({ path: dest, omitBackground: true });
    };

    for (const job of missing) {
      const color = COLOR_HEX[job.color] ?? COLOR_HEX.starlight;
      const html = `<div class="wrap" style="color:${color}">${
        job.lines.map((l) => `<div class="line">${escapeHtml(l)}</div>`).join("")
      }</div>`;
      await shoot(job.dest, html);
    }

    /** @type {{ scoreCard?: string, scoreCorner?: string }} */
    const extra = {};
    if (extras.scoreCard) {
      const dest = path.join(
        CACHE_DIR,
        `scorecard-${sidecar.day}-${sidecar.score}.png`
      );
      try {
        await stat(dest);
        extra.scoreCard = dest;
      } catch {
        const name = sidecar.mutatorNames[0] || "PATROL";
        await shoot(
          dest,
          `<div class="card"><div class="score">${escapeHtml(formatScore(sidecar.score))}</div>
           <div class="sub">DAY ${sidecar.day} · ${escapeHtml(name)}</div></div>`
        );
        extra.scoreCard = dest;
      }
    }
    if (extras.scoreCorner) {
      const dest = path.join(CACHE_DIR, `scorecorner-${sidecar.score}.png`);
      try {
        await stat(dest);
        extra.scoreCorner = dest;
      } catch {
        await shoot(dest, `<div class="corner">${escapeHtml(formatScore(sidecar.score))}</div>`);
        extra.scoreCorner = dest;
      }
    }
    return { captions: jobs, ...extra };
  } finally {
    await browser.close();
  }
}
