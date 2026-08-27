import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCreatePostVariables,
  buildGraphqlRequest,
  createBufferPost,
} from "../scripts/post-buffer.mjs";
import { REPO_ROOT } from "../src/paths.mjs";

const CHANNEL_IDS = {
  instagram: "6a8f9f62ccaf649a6724669f",
  tiktok: "6a8f9f8accaf649a67246735",
  youtube: "6a8f9f78ccaf649a672466f0",
};

describe("post-buffer", () => {
  it("builds shareNow input", () => {
    const { input } = buildCreatePostVariables({
      channel: "instagram",
      text: "hello",
      mode: "shareNow",
      channelIds: CHANNEL_IDS,
    });
    assert.deepEqual(input, {
      text: "hello",
      channelId: CHANNEL_IDS.instagram,
      schedulingType: "automatic",
      mode: "shareNow",
      metadata: { instagram: { type: "reel", shouldShareToFeed: true } },
    });
  });

  it("builds addToQueue input", () => {
    const { input } = buildCreatePostVariables({
      channel: "tiktok",
      text: "queue me",
      mode: "addToQueue",
      channelIds: CHANNEL_IDS,
    });
    assert.equal(input.mode, "addToQueue");
    assert.equal(input.channelId, CHANNEL_IDS.tiktok);
  });

  it("builds customScheduled input with dueAt", () => {
    const dueAt = "2026-08-27T12:00:00.000Z";
    const { input } = buildCreatePostVariables({
      channel: "youtube",
      text: "scheduled",
      mode: "customScheduled",
      dueAt,
      channelIds: CHANNEL_IDS,
    });
    assert.equal(input.dueAt, dueAt);
    assert.equal(input.channelId, CHANNEL_IDS.youtube);
  });

  it("wires the confirmed assets shape when mediaUrl is a public URL", () => {
    const { input } = buildCreatePostVariables({
      channel: "instagram",
      text: "with media",
      mode: "shareNow",
      mediaUrl: "https://example.com/clip.mp4",
      channelIds: CHANNEL_IDS,
    });
    assert.deepEqual(input.assets, [{ video: { url: "https://example.com/clip.mp4" } }]);
    assert.deepEqual(input.metadata, { instagram: { type: "reel", shouldShareToFeed: true } });
  });

  it("rejects a local-looking mediaUrl", () => {
    assert.throws(() =>
      buildCreatePostVariables({
        channel: "instagram",
        text: "with media",
        mode: "shareNow",
        mediaUrl: "/tmp/video.mp4",
        channelIds: CHANNEL_IDS,
      }),
    );
  });

  it("builds GraphQL request with bearer auth", () => {
    const request = buildGraphqlRequest({
      query: "mutation { createPost }",
      variables: { input: { text: "x" } },
      accessToken: "test-token",
    });
    assert.equal(request.url, "https://api.buffer.com/graphql");
    assert.equal(request.method, "POST");
    assert.equal(request.headers.Authorization, "Bearer test-token");
    const body = JSON.parse(request.body);
    assert.equal(body.query, "mutation { createPost }");
    assert.deepEqual(body.variables, { input: { text: "x" } });
  });

  it("sets metadata.youtube.title when youtubeTitle is passed for youtube", () => {
    const { input } = buildCreatePostVariables({
      channel: "youtube",
      text: "description body",
      youtubeTitle: "Title Here",
      mode: "shareNow",
      channelIds: CHANNEL_IDS,
    });
    assert.deepEqual(input.metadata, {
      youtube: { title: "Title Here", categoryId: "20" },
    });
    assert.equal(input.text, "description body");
  });

  it("youtube falls back to text for title when youtubeTitle is omitted", () => {
    const withoutTitle = buildCreatePostVariables({
      channel: "youtube",
      text: "description only",
      mode: "shareNow",
      channelIds: CHANNEL_IDS,
    });
    assert.deepEqual(withoutTitle.input.metadata, {
      youtube: { title: "description only", categoryId: "20" },
    });

    const tiktok = buildCreatePostVariables({
      channel: "tiktok",
      text: "hello",
      youtubeTitle: "ignored",
      mode: "shareNow",
      channelIds: CHANNEL_IDS,
    });
    assert.equal(tiktok.input.metadata, undefined);
  });

  it("dry run prints request shape without calling fetch", async () => {
    let called = false;
    const result = await createBufferPost({
      channel: "instagram",
      text: "test",
      mode: "shareNow",
      dry: true,
      repoRoot: REPO_ROOT,
      fetchImpl: async () => {
        called = true;
        return new Response("{}");
      },
    });
    assert.equal(called, false);
    assert.equal(result.dry, true);
    const body = JSON.parse(result.request.body);
    assert.match(body.query, /createPost/);
    assert.equal(body.variables.input.text, "test");
    assert.equal(body.variables.input.mode, "shareNow");
  });
});
