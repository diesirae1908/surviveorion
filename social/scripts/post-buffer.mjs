/**
 * Buffer GraphQL posting (alternative to direct YT/IG in post.mjs).
 * Default --dry: prints the request only, never hits the network.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadEnv } from "../src/env.mjs";
import { REPO_ROOT } from "../src/paths.mjs";

const BUFFER_GRAPHQL_URL = "https://api.buffer.com/graphql";

const CREATE_POST_MUTATION = `mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess {
      post { id text status }
    }
    ... on MutationError {
      message
    }
  }
}`;

/**
 * @typedef {"instagram" | "tiktok" | "youtube"} BufferChannel
 * @typedef {"addToQueue" | "customScheduled" | "shareNow"} BufferMode
 */

/**
 * @param {object} opts
 * @param {BufferChannel} opts.channel
 * @param {string} opts.text
 * @param {string} [opts.mediaPath]
 * @param {BufferMode} opts.mode
 * @param {string} [opts.dueAt]
 * @param {Record<string, string>} opts.channelIds
 */
export function buildCreatePostVariables({ channel, text, mediaPath, mode, dueAt, channelIds }) {
  const channelId = channelIds[channel];
  if (!channelId) {
    throw new Error(`unknown channel: ${channel}`);
  }
  if (mode === "customScheduled" && !dueAt) {
    throw new Error("dueAt required for customScheduled mode");
  }

  /** @type {Record<string, unknown>} */
  const input = {
    text,
    channelId,
    schedulingType: "automatic",
    mode,
  };
  if (mode === "customScheduled") {
    input.dueAt = dueAt;
  }
  if (mediaPath) {
    // UNCONFIRMED: media field name not verified against live schema.
    // Likely requires a prior upload step to obtain attachment ids/urls.
    input.mediaAttachments = [{ localPath: mediaPath }];
  }
  return { input };
}

/**
 * @param {{ query: string, variables: object, accessToken: string }} opts
 */
export function buildGraphqlRequest({ query, variables, accessToken }) {
  return {
    url: BUFFER_GRAPHQL_URL,
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  };
}

/**
 * @param {string} [repoRoot]
 */
export function loadBufferConfig(repoRoot = REPO_ROOT) {
  const raw = readFileSync(path.join(repoRoot, "buffer-channels.json"), "utf8");
  return JSON.parse(raw);
}

/**
 * @param {{
 *   channel: BufferChannel,
 *   text: string,
 *   mediaPath?: string,
 *   mode: BufferMode,
 *   dueAt?: string,
 *   dry?: boolean,
 *   fetchImpl?: typeof fetch,
 *   repoRoot?: string,
 * }} opts
 */
export async function createBufferPost({
  channel,
  text,
  mediaPath,
  mode,
  dueAt,
  dry = true,
  fetchImpl = fetch,
  repoRoot = REPO_ROOT,
}) {
  loadEnv(repoRoot);
  const accessToken = String(process.env.BUFFER_ACCESS_TOKEN || "").trim();
  const config = loadBufferConfig(repoRoot);
  const variables = buildCreatePostVariables({
    channel,
    text,
    mediaPath,
    mode,
    dueAt,
    channelIds: config.channels,
  });
  const request = buildGraphqlRequest({
    query: CREATE_POST_MUTATION,
    variables,
    accessToken: accessToken || "(missing)",
  });

  if (dry) {
    return { dry: true, request };
  }
  if (!accessToken) {
    throw new Error("BUFFER_ACCESS_TOKEN is not set");
  }

  const res = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Buffer API HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  const result = json?.data?.createPost;
  if (result?.message) {
    throw new Error(`Buffer mutation error: ${result.message}`);
  }
  return { dry: false, post: result?.post, raw: json };
}

/**
 * @param {string[]} argv
 */
function parseArgv(argv) {
  /** @type {{ channel?: string, text?: string, mode?: string, mediaPath?: string, dueAt?: string, dry: boolean }} */
  const args = { dry: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--channel" && argv[i + 1]) args.channel = argv[++i];
    else if (a === "--text" && argv[i + 1]) args.text = argv[++i];
    else if (a === "--mode" && argv[i + 1]) args.mode = argv[++i];
    else if (a === "--media" && argv[i + 1]) args.mediaPath = argv[++i];
    else if (a === "--due-at" && argv[i + 1]) args.dueAt = argv[++i];
    else if (a === "--dry=false") args.dry = false;
    else if (a === "--dry") args.dry = true;
  }
  return args;
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  if (!args.channel || !args.text || !args.mode) {
    console.error(
      'Usage: node social/scripts/post-buffer.mjs --channel instagram|tiktok|youtube --text "..." --mode addToQueue|customScheduled|shareNow [--media path] [--due-at ISO] [--dry] [--dry=false]'
    );
    process.exit(1);
  }
  const result = await createBufferPost({
    channel: /** @type {BufferChannel} */ (args.channel),
    text: args.text,
    mediaPath: args.mediaPath,
    mode: /** @type {BufferMode} */ (args.mode),
    dueAt: args.dueAt,
    dry: args.dry,
  });
  if (result.dry) {
    console.log(JSON.stringify(result.request, null, 2));
  } else {
    console.log(JSON.stringify(result.post ?? result.raw, null, 2));
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main();
}
