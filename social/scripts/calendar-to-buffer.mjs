/**
 * Read social/calendar.json and create Buffer posts for Approved + Linked rows.
 * Default --dry. Does not delete files. Does not host clips.
 *
 * Usage:
 *   node scripts/calendar-to-buffer.mjs
 *   node scripts/calendar-to-buffer.mjs --dry=false --media-base https://surviveorion.com/social-drafts
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { bufferJobsForCalendar } from "../src/calendar-buffer.mjs";
import { REPO_ROOT } from "../src/paths.mjs";
import { createBufferPost, loadBufferConfig } from "./post-buffer.mjs";

const DEFAULT_MEDIA_BASE = "https://surviveorion.com/social-drafts";
const ASSET_DIRS = [
  path.resolve(REPO_ROOT, "../final_videoasset"),
  path.resolve(REPO_ROOT, "../Final_videoasset"),
];

function parseArgv(argv) {
  const args = { dry: true, mediaBase: DEFAULT_MEDIA_BASE, calendar: path.join(REPO_ROOT, "calendar.json") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry=false") args.dry = false;
    else if (a === "--dry") args.dry = true;
    else if (a === "--media-base" && argv[i + 1]) args.mediaBase = argv[++i];
    else if (a === "--calendar" && argv[i + 1]) args.calendar = argv[++i];
  }
  return args;
}

function localAssetPath(filename) {
  for (const dir of ASSET_DIRS) {
    const p = path.join(dir, filename);
    if (existsSync(p)) return p;
  }
  return null;
}

export async function runCalendarToBuffer({
  calendar,
  mediaBase,
  dry = true,
  createPost = createBufferPost,
  now = new Date(),
}) {
  const config = loadBufferConfig(REPO_ROOT);
  const jobs = bufferJobsForCalendar(calendar, {
    mediaBase,
    channelIds: config.channels,
    now,
  });
  const results = [];
  for (const job of jobs) {
    const local = localAssetPath(decodeURIComponent(job.mediaUrl.split("/").pop() ?? ""));
    try {
      const posted = await createPost({
        channel: job.channel,
        text: job.text,
        mediaUrl: job.mediaUrl,
        youtubeTitle: job.youtubeTitle,
        mode: job.mode,
        dueAt: job.dueAt,
        dry,
      });
      results.push({ ...job, localAsset: local, localAssetFound: Boolean(local), result: posted });
    } catch (err) {
      results.push({
        ...job,
        localAsset: local,
        localAssetFound: Boolean(local),
        result: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }
  return results;
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  const calendar = JSON.parse(readFileSync(args.calendar, "utf8"));
  const results = await runCalendarToBuffer({
    calendar,
    mediaBase: args.mediaBase,
    dry: args.dry,
  });
  const missing = results.filter((r) => !r.localAssetFound).map((r) => r.mediaUrl);
  if (args.dry) {
    console.log(
      JSON.stringify(
        {
          dry: true,
          jobs: results.length,
          missingLocalAssets: [...new Set(missing)],
          posts: results.map((r) => ({
            channel: r.channel,
            mode: r.mode,
            dueAt: r.dueAt,
            mediaUrl: r.mediaUrl,
            localAsset: r.localAsset,
            textPreview: r.text.slice(0, 80),
            youtubeTitle: r.youtubeTitle,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(
    JSON.stringify(
      results.map((r) => ({
        channel: r.channel,
        mode: r.mode,
        dueAt: r.dueAt,
        mediaUrl: r.mediaUrl,
        result: r.result,
      })),
      null,
      2,
    ),
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main();
}
