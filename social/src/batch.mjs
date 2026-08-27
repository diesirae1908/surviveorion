/**
 * harvest -> eligible locked presets -> render -> captions -> thumbnails -> pending.
 * Never posts. Never writes out/approved/. Processed pairs move to inbox/done/.
 */

import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { harvestDirectory } from "./harvest.mjs";
import {
  INBOX_DIR,
  INBOX_DONE_DIR,
  PENDING_DIR,
  PRESET_CACHE_DIR,
} from "./paths.mjs";
import { pickEligiblePresets } from "./presets.mjs";
import { renderPreset } from "./preset-runner.mjs";
import { enqueuePending } from "./queue.mjs";
import { renderThumbnail } from "./thumbnail.mjs";

/**
 * @param {{ inboxDir?: string, pendingDir?: string, doneDir?: string }} [opts]
 */
export async function runBatch(opts = {}) {
  const inboxDir = opts.inboxDir ?? INBOX_DIR;
  const pendingDir = opts.pendingDir ?? PENDING_DIR;
  const doneDir = opts.doneDir ?? INBOX_DONE_DIR;

  const harvested = await harvestDirectory(inboxDir);
  for (const w of harvested.warnings) console.warn(w);

  /** @type {object[]} */
  const queued = [];

  for (const record of harvested.records) {
    const formats = pickEligiblePresets(record, {
      isFirstOfUtcDay: record.isFirstOfUtcDay ?? false,
    });
    if (!formats.length) {
      console.log(`no locked presets for ${record.basename}`);
    }

    for (const format of formats) {
      const work = path.join(PRESET_CACHE_DIR, `${record.basename}-${format}`);
      const videoOut = path.join(work, "final.mp4");
      console.log(`render ${format} ${record.basename}`);
      await renderPreset({ format, record, outputPath: videoOut });
      const thumbOut = path.join(work, "thumbnail.jpg");
      await renderThumbnail({
        videoPath: videoOut,
        format,
        sidecar: record.sidecar,
        dest: thumbOut,
        posterTime: format === "WASTED" ? 12.4 : 4,
        basename: record.basename,
      });
      const item = await enqueuePending({
        record,
        format,
        videoPath: videoOut,
        thumbnailPath: thumbOut,
        pendingDir,
      });
      queued.push(item);
      console.log(`queued ${item.id}`);
    }

    await mkdir(doneDir, { recursive: true });
    await rename(record.videoPath, path.join(doneDir, path.basename(record.videoPath)));
    await rename(record.sidecarPath, path.join(doneDir, path.basename(record.sidecarPath)));
  }

  console.log(`batch done: ${queued.length} item(s) in pending. Did not post.`);
  return { queued, warnings: harvested.warnings };
}

async function main() {
  await runBatch();
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main();
}
