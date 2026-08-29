/**
 * YouTube Data API v3 upload. Tests inject a client. Never hit the network from tests.
 */

import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { youtubeInsertBody } from "./discovery.mjs";
import { REPO_ROOT } from "./paths.mjs";
import { envPrivacy, loadEnv } from "./env.mjs";

/**
 * @param {{ repoRoot?: string }} [opts]
 */
export function youtubeAuthConfig(opts = {}) {
  loadEnv(opts.repoRoot);
  const clientJson = process.env.YT_CLIENT_JSON || "auth/google-client.json";
  const refresh = String(process.env.YT_REFRESH_TOKEN || "").trim();
  const privacy = envPrivacy();
  return {
    clientJson: path.isAbsolute(clientJson)
      ? clientJson
      : path.join(opts.repoRoot || REPO_ROOT, clientJson),
    refreshToken: refresh,
    privacy,
    channelId: String(process.env.YT_CHANNEL_ID || "").trim(),
  };
}

/**
 * @param {{ repoRoot?: string }} [opts]
 */
export function assertYoutubeReady(opts = {}) {
  const cfg = youtubeAuthConfig(opts);
  if (!cfg.privacy) {
    throw new Error("YouTube post refused: DEFAULT_PRIVACY is empty (no upload)");
  }
  if (!cfg.refreshToken) {
    throw new Error("YouTube post refused: YT_REFRESH_TOKEN missing (no upload)");
  }
  return cfg;
}

/**
 * @param {{ clientJson: string, refreshToken: string }} cfg
 */
export async function buildYoutubeClient(cfg) {
  const raw = JSON.parse(await readFile(cfg.clientJson, "utf8"));
  const installed = raw.installed || raw.web;
  if (!installed?.client_id || !installed?.client_secret) {
    throw new Error("YouTube post refused: auth/google-client.json missing client_id/secret");
  }
  const { google } = await import("googleapis");
  const oauth = new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret,
    installed.redirect_uris?.[0] || "http://localhost"
  );
  oauth.setCredentials({ refresh_token: cfg.refreshToken });
  return google.youtube({ version: "v3", auth: oauth });
}

/**
 * @param {{
 *   itemDir: string,
 *   meta: object,
 *   captions: { youtubeTitle: string, youtubeDescription: string, tags: string[] },
 *   youtube?: object,
 *   repoRoot?: string,
 * }} opts
 */
export async function postYoutube(opts) {
  const cfg = assertYoutubeReady({ repoRoot: opts.repoRoot });
  const youtube = opts.youtube || (await buildYoutubeClient(cfg));
  const videoPath = path.join(opts.itemDir, "video.mp4");
  const thumbPath = path.join(opts.itemDir, "thumbnail.jpg");
  const privacy = opts.meta.privacy || cfg.privacy;

  const insert = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: youtubeInsertBody({
      title: opts.captions.youtubeTitle,
      description: opts.captions.youtubeDescription,
      tags: opts.captions.tags,
      privacy,
    }),
    media: { body: createReadStream(videoPath) },
  });

  const videoId = insert.data?.id;
  if (!videoId) throw new Error("YouTube videos.insert returned no id");

  await youtube.thumbnails.set({
    videoId,
    media: { body: createReadStream(thumbPath) },
  });

  return { platform: "youtube", id: videoId };
}
