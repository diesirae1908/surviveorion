/**
 * TikTok v1: no API. Write a manual-tap manifest next to the approved item.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { tiktokManualManifest } from "./captions.mjs";

/**
 * @param {{ itemDir: string, captions: import('./captions.mjs').ReturnType<typeof import('./captions.mjs').platformCaptions> }} opts
 */
export async function postTiktokManual(opts) {
  const dest = path.join(opts.itemDir, "tiktok.manual.txt");
  const text = tiktokManualManifest(opts.captions);
  await writeFile(dest, text);
  return { platform: "tiktok", id: "manual", manifest: dest };
}
