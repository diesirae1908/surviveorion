import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { overlayForPost } from "../scripts/apply-discovery.mjs";

describe("apply-discovery overlay", () => {
  it("adds TikTok hashtags and the keyword line when missing", () => {
    const out = overlayForPost({ service: "tiktok", text: "nice clip" });
    assert.equal(out.changed, true);
    assert.match(out.text, /#indiegame/);
    assert.match(out.text, /daily dodge game/i);
  });

  it("keeps a YouTube title that already names Orion and adds #Shorts", () => {
    const out = overlayForPost({
      service: "youtube",
      youtubeTitle: "THE PIT DAY: Today's ORION Patrol (Day 45)",
      text: "Today's shared seed: THE PIT.\n\nPlay now: https://surviveorion.com",
    });
    assert.equal(out.youtubeTitle, "THE PIT DAY: Today's ORION Patrol (Day 45)");
    assert.match(out.text, /#Shorts/);
    assert.ok(out.text.trimEnd().endsWith("surviveorion.com"));
    assert.equal(out.metadata.youtube.madeForKids, false);
  });

  it("appends the search phrase to a title with no discovery words", () => {
    const out = overlayForPost({
      service: "youtube",
      youtubeTitle: "There's a Better Daily Than the Bathroom Can",
      text: "Play: https://surviveorion.com\n\n#Shorts",
    });
    assert.match(out.youtubeTitle, /daily dodge game/);
  });
});
