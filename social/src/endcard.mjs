/**
 * Vertical cover SVG -> PNG via headless Chromium (same trick as
 * orion-web/brand/scripts/04-export-png.cjs). Cached per UTC date.
 */

import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ASSETS, ENDCARD_CACHE_DIR } from "./paths.mjs";
import { endcardCopy } from "./captions.mjs";

/**
 * @param {string} date YYYY-MM-DD
 */
export function endcardCachePath(date) {
  return path.join(ENDCARD_CACHE_DIR, `${date}.png`);
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {string} svg
 * @param {string} dest
 */
export async function renderCoverPng(svg, dest) {
  const { chromium } = await import("playwright");
  const font400 = pathToFileURL(ASSETS.fontRegular).href;
  const font700 = pathToFileURL(ASSETS.fontBold).href;
  const styled = svg.replace(
    /<svg /,
    `<svg style="width:1080px;height:1920px;display:block" `
  );

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.setContent(`<!doctype html><html><head>
<style>
@font-face { font-family: Rajdhani; src: url('${font400}'); font-weight: 400; font-style: normal; }
@font-face { font-family: Rajdhani; src: url('${font700}'); font-weight: 700; font-style: normal; }
</style>
</head><body style="margin:0;background:#0a0a12"><div id="wrap">${styled}</div></body></html>`);
    try {
      await page.evaluate(() => document.fonts.ready);
    } catch {
      /* fonts.ready is best-effort */
    }
    await new Promise((r) => setTimeout(r, 200));
    const el = await page.$("#wrap svg");
    if (!el) throw new Error("endcard: SVG element missing after setContent");
    await mkdir(path.dirname(dest), { recursive: true });
    await el.screenshot({ path: dest, omitBackground: false });
  } finally {
    await browser.close();
  }
}

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @param {string} date
 * @returns {Promise<string>} png path
 */
export async function ensureEndcard(sidecar, date) {
  const dest = endcardCachePath(date);
  try {
    await stat(dest);
    return dest;
  } catch {
    /* miss */
  }

  const copy = endcardCopy(sidecar);
  const svg = (await readFile(ASSETS.coverSvg, "utf8"))
    .replaceAll("{{HOOK_LINE1}}", escapeXml(copy.hook1))
    .replaceAll("{{HOOK_LINE2}}", escapeXml(copy.hook2))
    .replaceAll("{{TAG}}", escapeXml(copy.tag));

  await renderCoverPng(svg, dest);
  return dest;
}
