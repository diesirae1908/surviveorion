/**
 * Instagram Graph Reels resumable upload. Tests inject fetch. Do not run live here.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { loadEnv } from "./env.mjs";

/**
 * @param {{ repoRoot?: string }} [opts]
 */
export function instagramAuthConfig(opts = {}) {
  loadEnv(opts.repoRoot);
  return {
    userId: String(process.env.IG_USER_ID || "").trim(),
    accessToken: String(process.env.IG_ACCESS_TOKEN || "").trim(),
  };
}

/**
 * @param {{ repoRoot?: string }} [opts]
 */
export function assertInstagramReady(opts = {}) {
  const cfg = instagramAuthConfig(opts);
  if (!cfg.userId || !cfg.accessToken) {
    throw new Error("Instagram post refused: IG_USER_ID or IG_ACCESS_TOKEN missing (no upload)");
  }
  return cfg;
}

/**
 * @param {{
 *   itemDir: string,
 *   caption: string,
 *   fetchImpl?: typeof fetch,
 *   repoRoot?: string,
 *   poll?: () => Promise<string>,
 * }} opts
 */
export async function postInstagram(opts) {
  const cfg = assertInstagramReady({ repoRoot: opts.repoRoot });
  const fetchImpl = opts.fetchImpl || fetch;
  const videoPath = path.join(opts.itemDir, "video.mp4");
  const bytes = (await stat(videoPath)).size;
  const file = await readFile(videoPath);

  const initRes = await fetchImpl(
    `https://graph.facebook.com/v21.0/${cfg.userId}/media?media_type=REELS&upload_type=resumable&caption=${encodeURIComponent(opts.caption)}&access_token=${encodeURIComponent(cfg.accessToken)}`,
    { method: "POST" }
  );
  const initJson = await initRes.json();
  if (!initRes.ok || !initJson.uri || !initJson.id) {
    throw new Error(`Instagram container create failed: ${JSON.stringify(initJson).slice(0, 400)}`);
  }

  const uploadRes = await fetchImpl(initJson.uri, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${cfg.accessToken}`,
      offset: "0",
      file_size: String(bytes),
    },
    body: file,
  });
  if (!uploadRes.ok) {
    const t = await uploadRes.text();
    throw new Error(`Instagram rupload failed: ${t.slice(0, 400)}`);
  }

  let status = "IN_PROGRESS";
  for (let i = 0; i < 30 && status !== "FINISHED"; i++) {
    if (opts.poll) {
      status = await opts.poll();
    } else {
      const st = await fetchImpl(
        `https://graph.facebook.com/v21.0/${initJson.id}?fields=status_code&access_token=${encodeURIComponent(cfg.accessToken)}`
      );
      const stJson = await st.json();
      status = stJson.status_code || "ERROR";
    }
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Instagram processing ${status}`);
    }
    if (status !== "FINISHED") {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  if (status !== "FINISHED") {
    throw new Error("Instagram processing timed out");
  }

  const pub = await fetchImpl(
    `https://graph.facebook.com/v21.0/${cfg.userId}/media_publish?creation_id=${encodeURIComponent(initJson.id)}&access_token=${encodeURIComponent(cfg.accessToken)}`,
    { method: "POST" }
  );
  const pubJson = await pub.json();
  if (!pub.ok || !pubJson.id) {
    throw new Error(`Instagram media_publish failed: ${JSON.stringify(pubJson).slice(0, 400)}`);
  }
  return { platform: "instagram", id: pubJson.id };
}
