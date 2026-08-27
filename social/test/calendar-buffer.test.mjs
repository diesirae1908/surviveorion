import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bufferJobsForPost,
  joinCaption,
  nineAmPtIso,
  scheduleForDate,
} from "../src/calendar-buffer.mjs";

const CHANNEL_IDS = {
  instagram: "ig",
  tiktok: "tt",
  youtube: "yt",
};

const approved = {
  date: "2026-08-26",
  title: "Launch Trailer",
  asset: "orion_trailer.mp4",
  assetStatus: "Linked",
  postStatus: "Approved",
  igCaption: "hello swarm",
  igTags: "#indiegame",
  ttCaption: "pov dodge",
  ytTitle: "ORION Trailer",
  ytDescription: "Play: https://surviveorion.com",
};

describe("calendar-buffer", () => {
  it("joinCaption stacks tags and rejects em dashes", () => {
    assert.equal(joinCaption("hi", "#x"), "hi\n\n#x");
    assert.throws(() => joinCaption("foo\u2014bar", null), /em\/en dash/);
  });

  it("past and today go to the queue, future is 9am PT", () => {
    const now = new Date("2026-08-26T22:00:00-07:00");
    assert.deepEqual(scheduleForDate("2026-08-26", now), { mode: "addToQueue" });
    const future = scheduleForDate("2026-08-28", now);
    assert.equal(future.mode, "customScheduled");
    assert.equal(future.dueAt, nineAmPtIso("2026-08-28"));
    assert.equal(nineAmPtIso("2026-08-28"), "2026-08-28T16:00:00.000Z");
  });

  it("approved+linked row becomes 3 Buffer jobs", () => {
    const jobs = bufferJobsForPost(approved, {
      mediaBase: "https://surviveorion.com/social-drafts",
      channelIds: CHANNEL_IDS,
      now: new Date("2026-08-26T22:00:00-07:00"),
    });
    assert.equal(jobs.length, 3);
    assert.equal(jobs[0].channel, "instagram");
    assert.equal(jobs[0].text, "hello swarm\n\n#indiegame");
    assert.equal(jobs[0].mediaUrl, "https://surviveorion.com/social-drafts/orion_trailer.mp4");
    assert.equal(jobs[0].mode, "addToQueue");
    assert.equal(jobs[2].youtubeTitle, "ORION Trailer");
  });

  it("rewrites .mov assets to a hosted .mp4 URL", () => {
    const jobs = bufferJobsForPost(
      { ...approved, asset: "0826_heknew_916.mov" },
      {
        mediaBase: "https://surviveorion.com/social-drafts",
        channelIds: CHANNEL_IDS,
        now: new Date("2026-08-26T22:00:00-07:00"),
      },
    );
    assert.equal(jobs[0].mediaUrl, "https://surviveorion.com/social-drafts/0826_heknew_916.mp4");
  });

  it("draft rows emit nothing", () => {
    const jobs = bufferJobsForPost({ ...approved, postStatus: "Draft" }, {
      mediaBase: "https://surviveorion.com/social-drafts",
      channelIds: CHANNEL_IDS,
    });
    assert.equal(jobs.length, 0);
  });
});
