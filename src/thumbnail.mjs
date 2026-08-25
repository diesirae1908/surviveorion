/**
 * YouTube 1280x720 thumbnail from the brand template. Fail if the template is missing.
 */

import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ASSETS } from "./paths.mjs";
import { formatScoreShort } from "./captions.mjs";
import { runFfmpeg } from "./ffmpeg-bin.mjs";

const TITLE_TABLE = {
  WASTED: (sidecar) => ({
    line1: "WASTED",
    line2: `DAY ${sidecar.day}`,
    tag: sidecar.mutatorNames[0] || "PATROL",
  }),
  PATROL: (sidecar) => ({
    line1: "PATROL",
    line2: sidecar.mutatorNames[0] || "PATROL",
    tag: `DAY ${sidecar.day}`,
  }),
  NEW_BEST: (sidecar) => ({
    line1: "NEW BEST",
    line2: formatScoreShort(sidecar.score),
    tag: `DAY ${sidecar.day}`,
  }),
  THE_BOARD: (sidecar) => ({
    line1: "THE BOARD",
    line2: formatScoreShort(sidecar.score),
    tag: `DAY ${sidecar.day}`,
  }),
  TODAYS_PATROL: (sidecar) => ({
    line1: "PATROL",
    line2: sidecar.mutatorNames[0] || "PATROL",
    tag: `DAY ${sidecar.day}`,
  }),
  CLOSE_CALL: (sidecar) => ({
    line1: "CLOSE CALL",
    line2: `DAY ${sidecar.day}`,
    tag: sidecar.mutatorNames[0] || "PATROL",
  }),
  SPACE_DUST: (sidecar) => ({
    line1: "SPACE DUST",
    line2: `DAY ${sidecar.day}`,
    tag: `${Math.round(sidecar.survivalTime)}S`,
  }),
};

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {string} [templatePath]
 */
export async function requireThumbnailTemplate(templatePath = ASSETS.thumbnailSvg) {
  try {
    await access(templatePath);
    return templatePath;
  } catch {
    throw new Error(
      `Thumbnail template missing at "${templatePath}". Will not invent a layout.`
    );
  }
}

/**
 * @param {string} format
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 */
export function thumbnailCopy(format, sidecar) {
  const fn = TITLE_TABLE[format];
  if (!fn) throw new Error(`No thumbnail title table for format "${format}"`);
  return fn(sidecar);
}

/**
 * @param {string} svg
 * @param {{ line1: string, line2: string, tag: string }} copy
 */
export function fillThumbnailSvg(svg, copy) {
  return svg
    .replace(/<rect width="1280" height="720" fill="#12121e"\/>/, '<rect width="1280" height="720" fill="none"/>')
    .replaceAll("{{TITLE_LINE1}}", escapeXml(copy.line1))
    .replaceAll("{{TITLE_LINE2}}", escapeXml(copy.line2))
    .replaceAll("{{TAG}}", escapeXml(copy.tag));
}

/**
 * @param {string} svg
 * @param {string} dest
 */
export async function renderThumbnailOverlayPng(svg, dest) {
  const { chromium } = await import("playwright");
  const font400 = pathToFileURL(ASSETS.fontRegular).href;
  const font700 = pathToFileURL(ASSETS.fontBold).href;
  const styled = svg.replace(
    /<svg /,
    `<svg style="width:1280px;height:720px;display:block" `
  );
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(`<!doctype html><html><head>
<style>
@font-face { font-family: Rajdhani; src: url('${font400}'); font-weight: 400; font-style: normal; }
@font-face { font-family: Rajdhani; src: url('${font700}'); font-weight: 700; font-style: normal; }
</style>
</head><body style="margin:0;background:transparent"><div id="wrap">${styled}</div></body></html>`);
    try {
      await page.evaluate(() => document.fonts.ready);
    } catch {
      /* fonts.ready is best-effort */
    }
    await new Promise((r) => setTimeout(r, 150));
    const el = await page.$("#wrap svg");
    if (!el) throw new Error("thumbnail: SVG element missing after setContent");
    await mkdir(path.dirname(dest), { recursive: true });
    await el.screenshot({ path: dest, omitBackground: true });
  } finally {
    await browser.close();
  }
}

/**
 * @param {{ videoPath: string, format: string, sidecar: import('./sidecar.mjs').ClipSidecar, dest: string, posterTime?: number, basename?: string }} opts
 */
export async function renderThumbnail(opts) {
  const templatePath = await requireThumbnailTemplate();
  const copy = thumbnailCopy(opts.format, opts.sidecar);
  const svg = fillThumbnailSvg(await readFile(templatePath, "utf8"), copy);
  const work = path.join(path.dirname(opts.dest), `.thumb-${opts.format}`);
  await mkdir(work, { recursive: true });
  const still = path.join(work, "still.jpg");
  const overlay = path.join(work, "overlay.png");
  const t = opts.posterTime ?? 0.5;
  const basename = opts.basename || "thumbnail";
  await runFfmpeg(
    [
      "-y", "-loglevel", "error",
      "-ss", String(t), "-i", opts.videoPath,
      "-frames:v", "1",
      "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720",
      still,
    ],
    { basename, label: "thumbnail-still" }
  );
  await renderThumbnailOverlayPng(svg, overlay);
  await runFfmpeg(
    [
      "-y", "-loglevel", "error",
      "-i", still, "-i", overlay,
      "-filter_complex", "overlay=0:0",
      "-frames:v", "1", "-q:v", "2",
      opts.dest,
    ],
    { basename, label: "thumbnail-composite" }
  );
  return opts.dest;
}
