/**
 * Assemble out/pending/<YYYY-MM-DD>_<format>_<n>/ and regenerate REVIEW.md.
 * Never writes out/approved/.
 */

import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { platformCaptions, tiktokManualManifest } from "./captions.mjs";
import { IDEA_BY_FORMAT } from "./presets.mjs";
import { PENDING_DIR, outRoots } from "./paths.mjs";
import { envPrivacy, loadEnv } from "./env.mjs";

/**
 * @param {string} pendingDir
 * @param {string} date
 * @param {string} format
 */
export async function nextPendingDir(pendingDir, date, format) {
  await mkdir(pendingDir, { recursive: true });
  const prefix = `${date}_${format}_`;
  let max = 0;
  for (const name of await readdir(pendingDir)) {
    if (!name.startsWith(prefix)) continue;
    const n = Number(name.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return path.join(pendingDir, `${prefix}${max + 1}`);
}

/**
 * @param {object} item
 * @param {string} item.id
 * @param {string} item.format
 * @param {string} item.sourceBasename
 * @param {string[]} item.platforms
 * @param {string} [item.suggestedSound]
 */
export function reviewLine(item) {
  const sound = item.suggestedSound ? ` sound:${item.suggestedSound}` : "";
  return `- \`${item.id}/\` ${item.format} from ${item.sourceBasename} -> ${item.platforms.join(", ")}${sound}`;
}

/**
 * @param {string} pendingDir
 * @param {object[]} items
 */
export function buildReviewMarkdown(items) {
  const lines = [
    "# Pending review",
    "",
    "Move a folder into `out/approved/` to allow posting. The pipeline never does this.",
    "",
  ];
  if (!items.length) {
    lines.push("_Nothing pending._");
  } else {
    for (const item of items) lines.push(reviewLine(item));
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * @param {string} pendingDir
 */
export async function regenerateReview(pendingDir) {
  let names = [];
  try {
    names = (await readdir(pendingDir)).filter((n) => n !== "REVIEW.md");
  } catch {
    names = [];
  }
  /** @type {object[]} */
  const items = [];
  for (const name of names.sort()) {
    try {
      const { readFile } = await import("node:fs/promises");
      const meta = JSON.parse(await readFile(path.join(pendingDir, name, "meta.json"), "utf8"));
      items.push({
        id: name,
        format: meta.format,
        sourceBasename: meta.sourceBasename,
        platforms: meta.platforms,
        suggestedSound: meta.suggestedSound,
      });
    } catch {
      items.push({
        id: name,
        format: "?",
        sourceBasename: "?",
        platforms: [],
      });
    }
  }
  const md = buildReviewMarkdown(items);
  await mkdir(pendingDir, { recursive: true });
  await writeFile(path.join(pendingDir, "REVIEW.md"), md);
  return md;
}

/**
 * @param {{
 *   record: import('./harvest.mjs').RunRecord,
 *   format: string,
 *   videoPath: string,
 *   thumbnailPath?: string,
 *   pendingDir?: string,
 *   platforms?: string[],
 * }} opts
 */
export async function enqueuePending(opts) {
  loadEnv();
  const pendingDir = opts.pendingDir ?? PENDING_DIR;
  const date = opts.record.filename.date;
  const dest = await nextPendingDir(pendingDir, date, opts.format);
  await mkdir(dest, { recursive: true });

  const captions = platformCaptions(opts.format, opts.record.sidecar);
  const platforms = opts.platforms ?? ["tiktok", "instagram", "youtube"];
  const id = path.basename(dest);

  await copyFile(opts.videoPath, path.join(dest, "video.mp4"));
  await writeFile(path.join(dest, "caption.tiktok.txt"), captions.tiktok);
  await writeFile(path.join(dest, "caption.instagram.txt"), captions.instagram);
  await writeFile(path.join(dest, "caption.youtube.txt"), captions.youtube);
  await writeFile(path.join(dest, "tiktok.manual.txt"), tiktokManualManifest(captions));
  if (platforms.includes("youtube")) {
    if (!opts.thumbnailPath) {
      throw new Error(`YouTube item "${id}" needs thumbnail.jpg`);
    }
    await copyFile(opts.thumbnailPath, path.join(dest, "thumbnail.jpg"));
  }

  const meta = {
    format: opts.format,
    sourceBasename: opts.record.basename,
    platforms,
    suggestedSound: captions.suggestedSound || "",
    idea: IDEA_BY_FORMAT[opts.format] ?? null,
    day: opts.record.sidecar.day,
    score: opts.record.sidecar.score,
    mutatorIds: opts.record.sidecar.mutatorIds,
    mutatorNames: opts.record.sidecar.mutatorNames,
    survivalTime: opts.record.sidecar.survivalTime,
    medal: opts.record.sidecar.medal,
    privacy: envPrivacy() || "public",
    cut: { preset: opts.format },
  };
  await writeFile(path.join(dest, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  await regenerateReview(pendingDir);
  return { dest, id, meta, captions };
}

export { outRoots };
