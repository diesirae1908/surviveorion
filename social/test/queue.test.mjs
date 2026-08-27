import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildReviewMarkdown, enqueuePending, regenerateReview } from "../src/queue.mjs";

const day43 = {
  basename: "orion_2026-08-25_day43_arsenal_3490380",
  filename: { date: "2026-08-25" },
  sidecar: {
    day: 43,
    mutatorIds: ["arsenal"],
    mutatorNames: ["ARSENAL"],
    score: 3490380,
    medal: "gold",
    survivalTime: 270,
    closestCall: null,
    topGrazes: [],
  },
};

describe("pending queue", () => {
  it("REVIEW.md lists each item and says the pipeline never approves", () => {
    const md = buildReviewMarkdown([
      {
        id: "2026-08-25_WASTED_1",
        format: "WASTED",
        sourceBasename: day43.basename,
        platforms: ["tiktok", "instagram", "youtube"],
        suggestedSound: "",
      },
    ]);
    assert.match(md, /^# Pending review/m);
    assert.match(md, /pipeline never does this/);
    assert.match(md, /2026-08-25_WASTED_1/);
    assert.match(md, /WASTED/);
    assert.match(md, /tiktok, instagram, youtube/);
  });

  it("enqueuePending writes captions, meta, thumbnail, and regenerates REVIEW.md", async () => {
    const root = path.join(tmpdir(), `orion-pending-${Date.now()}`);
    const pendingDir = path.join(root, "pending");
    await mkdir(root, { recursive: true });
    const video = path.join(root, "in.mp4");
    const thumb = path.join(root, "in.jpg");
    await writeFile(video, "video");
    await writeFile(thumb, "jpg");
    try {
      const item = await enqueuePending({
        record: day43,
        format: "WASTED",
        videoPath: video,
        thumbnailPath: thumb,
        pendingDir,
      });
      assert.match(item.id, /^2026-08-25_WASTED_1$/);
      const dest = item.dest;
      const yt = await readFile(path.join(dest, "caption.youtube.txt"), "utf8");
      assert.ok(yt.trimEnd().endsWith("surviveorion.com"));
      assert.ok(!(await readFile(path.join(dest, "caption.tiktok.txt"), "utf8")).includes("\u2014"));
      const meta = JSON.parse(await readFile(path.join(dest, "meta.json"), "utf8"));
      assert.equal(meta.format, "WASTED");
      assert.equal(meta.idea, 1);
      await readFile(path.join(dest, "thumbnail.jpg"));
      await readFile(path.join(dest, "tiktok.manual.txt"));
      const review = await regenerateReview(pendingDir);
      assert.match(review, /2026-08-25_WASTED_1/);
      assert.match(review, /out\/approved/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
