/**
 * Phase D/E: post items that already live in out/approved/.
 * Success moves the folder to out/posted/. Failure leaves it and prints why.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { assertItemInApproved } from "./approved-path.mjs";
import { platformCaptions } from "./captions.mjs";
import { envPrivacy, loadEnv } from "./env.mjs";
import { APPROVED_DIR, POSTED_DIR, REPO_ROOT, outRoots } from "./paths.mjs";
import { postInstagram } from "./post-instagram.mjs";
import { postTiktokManual } from "./post-tiktok.mjs";
import { postYoutube } from "./post-youtube.mjs";

/**
 * @param {string} itemDir
 * @param {{
 *   approvedRoot?: string,
 *   postedRoot?: string,
 *   repoRoot?: string,
 *   youtube?: object,
 *   fetchImpl?: typeof fetch,
 *   igPoll?: () => Promise<string>,
 * }} [opts]
 */
export async function postApprovedItem(itemDir, opts = {}) {
  loadEnv(opts.repoRoot || REPO_ROOT);
  const approvedRoot = opts.approvedRoot ?? APPROVED_DIR;
  const postedRoot = opts.postedRoot ?? POSTED_DIR;
  const resolved = assertItemInApproved(itemDir, approvedRoot);

  if (!envPrivacy()) {
    throw new Error("post refused: DEFAULT_PRIVACY is empty (no upload)");
  }

  const meta = JSON.parse(await readFile(path.join(resolved, "meta.json"), "utf8"));
  const sidecar = {
    day: meta.day,
    mutatorIds: meta.mutatorIds || [],
    mutatorNames: meta.mutatorNames || [],
    score: meta.score,
    medal: meta.medal ?? null,
    survivalTime: meta.survivalTime ?? 0,
    closestCall: null,
    topGrazes: [],
  };
  const captions = platformCaptions(meta.format, {
    ...sidecar,
    mutatorIds: sidecar.mutatorIds.length ? sidecar.mutatorIds : ["patrol"],
    mutatorNames: sidecar.mutatorNames.length ? sidecar.mutatorNames : ["PATROL"],
  });

  const platforms = meta.platforms || ["tiktok", "instagram", "youtube"];
  /** @type {Record<string, string>} */
  const postIds = { ...(meta.postIds || {}) };
  /** @type {string[]} */
  const errors = [];

  for (const platform of platforms) {
    try {
      if (platform === "youtube") {
        const r = await postYoutube({
          itemDir: resolved,
          meta,
          captions,
          youtube: opts.youtube,
          repoRoot: opts.repoRoot,
        });
        postIds.youtube = r.id;
      } else if (platform === "instagram") {
        const r = await postInstagram({
          itemDir: resolved,
          caption: captions.instagram,
          fetchImpl: opts.fetchImpl,
          repoRoot: opts.repoRoot,
          poll: opts.igPoll,
        });
        postIds.instagram = r.id;
      } else if (platform === "tiktok") {
        const r = await postTiktokManual({ itemDir: resolved, captions });
        postIds.tiktok = r.id;
      }
    } catch (err) {
      errors.push(`${platform}: ${/** @type {Error} */ (err).message}`);
    }
  }

  meta.postIds = postIds;
  await writeFile(path.join(resolved, "meta.json"), JSON.stringify(meta, null, 2) + "\n");

  if (errors.length) {
    const why = errors.join("; ");
    console.error(`post failed for ${path.basename(resolved)}: ${why}`);
    return { ok: false, itemDir: resolved, postIds, error: why };
  }

  await mkdir(postedRoot, { recursive: true });
  const dest = path.join(postedRoot, path.basename(resolved));
  await rename(resolved, dest);
  return { ok: true, itemDir: dest, postIds };
}

/**
 * @param {{ approvedRoot?: string, postedRoot?: string, repoRoot?: string, youtube?: object, fetchImpl?: typeof fetch }} [opts]
 */
export async function postApprovedQueue(opts = {}) {
  const approvedRoot = opts.approvedRoot ?? APPROVED_DIR;
  if (!existsSync(approvedRoot)) {
    console.log("nothing in out/approved/");
    return { results: [] };
  }
  const names = readdirSync(approvedRoot).filter((n) => n !== "." && n !== "..");
  /** @type {object[]} */
  const results = [];
  for (const name of names) {
    const itemDir = path.join(approvedRoot, name);
    try {
      results.push(await postApprovedItem(itemDir, opts));
    } catch (err) {
      const error = /** @type {Error} */ (err).message;
      console.error(`post failed for ${name}: ${error}`);
      results.push({ ok: false, itemDir, error });
    }
  }
  return { results };
}

async function main() {
  const roots = outRoots();
  const { results } = await postApprovedQueue({
    approvedRoot: roots.approved,
    postedRoot: roots.posted,
  });
  const ok = results.filter((r) => r.ok).length;
  console.log(`post done: ${ok}/${results.length} moved to out/posted/`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main();
}
