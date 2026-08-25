import assert from "node:assert/strict";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { assertItemInApproved } from "../src/approved-path.mjs";
import { postApprovedItem } from "../src/post.mjs";

async function writeItem(dir, extraMeta = {}) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "video.mp4"), "video");
  await writeFile(path.join(dir, "thumbnail.jpg"), "jpg");
  await writeFile(
    path.join(dir, "meta.json"),
    JSON.stringify({
      format: "PATROL",
      sourceBasename: "orion_2026-08-25_day43_arsenal_3490380",
      platforms: ["tiktok", "youtube", "instagram"],
      day: 43,
      score: 3490380,
      mutatorIds: ["arsenal"],
      mutatorNames: ["ARSENAL"],
      survivalTime: 270,
      medal: "gold",
      privacy: "private",
      ...extraMeta,
    })
  );
}

describe("post path guard", () => {
  it("refuses a path under out/pending/ or anywhere else", async () => {
    const root = path.join(tmpdir(), `orion-post-${Date.now()}`);
    const approved = path.join(root, "approved");
    const pending = path.join(root, "pending", "2026-08-25_WASTED_1");
    await mkdir(approved, { recursive: true });
    await writeItem(pending);
    try {
      assert.throws(() => assertItemInApproved(pending, approved), /refuses path/);
      await assert.rejects(
        () => postApprovedItem(pending, { approvedRoot: approved, postedRoot: path.join(root, "posted") }),
        /refuses path/
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts out/approved/ with mocked network and moves to posted", async () => {
    const root = path.join(tmpdir(), `orion-post-ok-${Date.now()}`);
    const approved = path.join(root, "approved");
    const posted = path.join(root, "posted");
    const item = path.join(approved, "2026-08-25_PATROL_1");
    await writeItem(item);

    const prev = {
      DEFAULT_PRIVACY: process.env.DEFAULT_PRIVACY,
      YT_REFRESH_TOKEN: process.env.YT_REFRESH_TOKEN,
      IG_USER_ID: process.env.IG_USER_ID,
      IG_ACCESS_TOKEN: process.env.IG_ACCESS_TOKEN,
    };
    process.env.DEFAULT_PRIVACY = "private";
    process.env.YT_REFRESH_TOKEN = "test-refresh";
    process.env.IG_USER_ID = "123";
    process.env.IG_ACCESS_TOKEN = "test-ig";

    const youtube = {
      videos: {
        insert: async () => ({ data: { id: "yt-mock-1" } }),
      },
      thumbnails: {
        set: async () => ({}),
      },
    };
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.includes("/media?")) {
        return { ok: true, json: async () => ({ id: "ig-c1", uri: "https://rupload.facebook.com/x" }) };
      }
      if (u.includes("rupload.facebook.com")) {
        return { ok: true, text: async () => "" };
      }
      if (u.includes("media_publish")) {
        return { ok: true, json: async () => ({ id: "ig-mock-1" }) };
      }
      throw new Error(`unexpected fetch ${u}`);
    };

    try {
      const result = await postApprovedItem(item, {
        approvedRoot: approved,
        postedRoot: posted,
        youtube,
        fetchImpl,
        igPoll: async () => "FINISHED",
      });
      assert.equal(result.ok, true);
      assert.equal(result.postIds.youtube, "yt-mock-1");
      assert.equal(result.postIds.instagram, "ig-mock-1");
      assert.equal(result.postIds.tiktok, "manual");
      assert.equal(existsSync(item), false);
      const moved = path.join(posted, "2026-08-25_PATROL_1");
      const meta = JSON.parse(await readFile(path.join(moved, "meta.json"), "utf8"));
      assert.equal(meta.postIds.youtube, "yt-mock-1");
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v == null) delete process.env[k];
        else process.env[k] = v;
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails loud when DEFAULT_PRIVACY is empty (no upload)", async () => {
    const root = path.join(tmpdir(), `orion-post-priv-${Date.now()}`);
    const approved = path.join(root, "approved");
    const item = path.join(approved, "2026-08-25_PATROL_1");
    await writeItem(item);
    const prev = process.env.DEFAULT_PRIVACY;
    process.env.DEFAULT_PRIVACY = "";
    try {
      await assert.rejects(
        () => postApprovedItem(item, { approvedRoot: approved, postedRoot: path.join(root, "posted") }),
        /DEFAULT_PRIVACY/
      );
      assert.equal(existsSync(item), true);
    } finally {
      if (prev == null) delete process.env.DEFAULT_PRIVACY;
      else process.env.DEFAULT_PRIVACY = prev;
      await rm(root, { recursive: true, force: true });
    }
  });
});
