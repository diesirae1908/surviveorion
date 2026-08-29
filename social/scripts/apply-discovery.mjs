/**
 * Apply discovery overlay to existing Buffer posts (scheduled + sent).
 * Default --dry. Does not delete. Does not create new posts.
 *
 *   node scripts/apply-discovery.mjs
 *   node scripts/apply-discovery.mjs --dry=false
 */

import { pathToFileURL } from "node:url";

import {
  ensureCaptionKeywords,
  ensureHashtagLine,
  ensureSearchableTitle,
  ensureYoutubeDescription,
  hashtagsIn,
  tiktokBufferMetadata,
  uniqueHashtags,
  youtubeBufferMetadata,
} from "../src/discovery.mjs";
import { loadEnv } from "../src/env.mjs";
import { loadBufferConfig, buildGraphqlRequest } from "./post-buffer.mjs";

const BUFFER_GRAPHQL_URL = "https://api.buffer.com/graphql";

const POSTS_QUERY = `query Posts($input: PostsInput!, $first: Int, $after: String) {
  posts(input: $input, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        text
        status
        dueAt
        externalLink
        allowedActions
        assets { source type }
        channel { id service }
        metadata {
          ... on YoutubePostMetadata { title }
          ... on InstagramPostMetadata { type }
        }
      }
    }
  }
}`;

const EDIT_MUTATION = `mutation EditPost($input: EditPostInput!) {
  editPost(input: $input) {
    ... on PostActionSuccess {
      post { id text status }
    }
    ... on MutationError {
      message
    }
  }
}`;

const DEFAULT_IG_TAGS = [
  "#indiegame",
  "#browsergame",
  "#dailychallenge",
  "#arcadegame",
];

/**
 * @param {object} opts
 */
export function overlayForPost({ service, text, youtubeTitle }) {
  const raw = String(text ?? "").trim();
  if (service === "youtube") {
    const title = ensureSearchableTitle(youtubeTitle || raw.split("\n")[0] || "ORION");
    const next = ensureYoutubeDescription(raw, { tags: hashtagsIn(raw) });
    return {
      text: next,
      youtubeTitle: title,
      metadata: { youtube: youtubeBufferMetadata({ title }) },
      changed: next !== raw || title !== String(youtubeTitle || "").trim(),
    };
  }
  if (service === "tiktok") {
    const tags = uniqueHashtags([...hashtagsIn(raw), ...DEFAULT_IG_TAGS]);
    const next = ensureCaptionKeywords(ensureHashtagLine(raw, tags));
    return {
      text: next,
      metadata: { tiktok: tiktokBufferMetadata() },
      changed: next !== raw,
    };
  }
  const tags = uniqueHashtags([...hashtagsIn(raw), ...DEFAULT_IG_TAGS]);
  const next = ensureCaptionKeywords(ensureHashtagLine(raw, tags));
  return { text: next, changed: next !== raw };
}

async function graphql({ query, variables, accessToken, fetchImpl = fetch }) {
  const request = buildGraphqlRequest({ query, variables, accessToken });
  const res = await fetchImpl(BUFFER_GRAPHQL_URL, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Buffer GraphQL failed: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data;
}

/**
 * @param {{ accessToken: string, organizationId: string, channelIds: string[], fetchImpl?: typeof fetch }} opts
 */
export async function listBufferPosts({ accessToken, organizationId, channelIds, fetchImpl = fetch }) {
  const out = [];
  for (const status of ["sent", "scheduled"]) {
    let after = null;
    for (let page = 0; page < 8; page++) {
      const data = await graphql({
        query: POSTS_QUERY,
        variables: {
          first: 50,
          after,
          input: {
            organizationId,
            filter: { channelIds, status: [status] },
          },
        },
        accessToken,
        fetchImpl,
      });
      const conn = data?.posts;
      for (const edge of conn?.edges ?? []) out.push(edge.node);
      if (!conn?.pageInfo?.hasNextPage) break;
      after = conn.pageInfo.endCursor;
    }
  }
  return out;
}

function parseArgv(argv) {
  const args = { dry: true };
  for (const a of argv) {
    if (a === "--dry=false") args.dry = false;
    else if (a === "--dry") args.dry = true;
  }
  return args;
}

export async function applyDiscovery({ dry = true, fetchImpl = fetch } = {}) {
  loadEnv();
  const accessToken = String(process.env.BUFFER_ACCESS_TOKEN || "").trim();
  if (!accessToken) throw new Error("BUFFER_ACCESS_TOKEN is not set");
  const config = loadBufferConfig();
  const channelIds = Object.values(config.channels);
  const posts = await listBufferPosts({
    accessToken,
    organizationId: config.organizationId,
    channelIds,
    fetchImpl,
  });
  const planned = posts.map((post) => {
    const service = post.channel?.service || "";
    const overlay = overlayForPost({
      service,
      text: post.text,
      youtubeTitle: post.metadata?.title,
    });
    return { post, overlay };
  });
  const results = [];
  for (const item of planned) {
    const { post, overlay } = item;
    if (post.status === "sent") {
      results.push({
        id: post.id,
        service: post.channel?.service,
        status: post.status,
        skipped: true,
        reason: "Buffer cannot edit sent posts from this token",
        externalLink: post.externalLink || null,
      });
      continue;
    }
    if (!overlay.changed) {
      results.push({ id: post.id, service: post.channel?.service, status: post.status, skipped: true });
      continue;
    }
    const input = { id: post.id, text: overlay.text };
    const videoUrl = post.assets?.find((a) => a.source)?.source;
    if (videoUrl) input.assets = [{ video: { url: videoUrl } }];
    const metadata = { ...(overlay.metadata || {}) };
    if (post.channel?.service === "instagram") {
      metadata.instagram = { type: "reel", shouldShareToFeed: true };
    }
    if (Object.keys(metadata).length) input.metadata = metadata;
    if (dry) {
      results.push({
        id: post.id,
        service: post.channel?.service,
        status: post.status,
        dry: true,
        preview: overlay.text.slice(0, 120),
        youtubeTitle: overlay.youtubeTitle,
      });
      continue;
    }
    const data = await graphql({
      query: EDIT_MUTATION,
      variables: { input },
      accessToken,
      fetchImpl,
    });
    const result = data?.editPost;
    results.push({
      id: post.id,
      service: post.channel?.service,
      status: post.status,
      error: result?.message || null,
      ok: !result?.message,
    });
  }
  return { dry, total: posts.length, changed: planned.filter((p) => p.overlay.changed).length, results };
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  const out = await applyDiscovery({ dry: args.dry });
  console.log(JSON.stringify(out, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main();
}
