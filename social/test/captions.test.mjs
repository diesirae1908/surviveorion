import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertNoEmDash,
  endcardCopy,
  formatScore,
  formatScoreShort,
  platformCaptions,
  rotateTags,
  videoCaption,
} from "../src/captions.mjs";

const day43 = {
  day: 43,
  mutatorIds: ["arsenal"],
  mutatorNames: ["ARSENAL"],
  score: 3490380,
  medal: "gold",
  survivalTime: 270,
  closestCall: null,
  topGrazes: [],
};

describe("captions", () => {
  it("rejects em dash", () => {
    assert.throws(() => assertNoEmDash("foo \u2014 bar"), /em dash/);
    assert.doesNotThrow(() => assertNoEmDash("foo - bar"));
  });

  it("THE BOARD beat-1 hook is the score, no em dash", () => {
    const cap = videoCaption("THE_BOARD", day43);
    assert.ok(cap.lines.length <= 2);
    assert.match(cap.lines[0], /3,490,380/);
    assert.match(cap.lines[0], /one life/);
    assert.ok(!cap.lines.join(" ").includes("\u2014"));
  });

  it("TODAY'S PATROL beat-1 is ARSENAL DAY", () => {
    const cap = videoCaption("TODAYS_PATROL", day43);
    assert.ok(cap.lines.length <= 2);
    assert.equal(cap.lines[0], "ARSENAL DAY");
    assert.deepEqual(cap.mutatorNames, ["ARSENAL"]);
  });

  it("endcard copy is Mission Control, no em dash", () => {
    const copy = endcardCopy(day43);
    assert.equal(copy.hook1, "DAY 43");
    assert.equal(copy.hook2, "ARSENAL");
    assert.equal(copy.tag, "3.49M");
  });

  it("formats scores", () => {
    assert.equal(formatScore(3490380), "3,490,380");
    assert.equal(formatScoreShort(3490380), "3.49M");
  });

  it("platform captions: no em dash, at most one bang, YT ends with surviveorion.com", () => {
    for (const format of ["WASTED", "NEW_BEST", "PATROL"]) {
      const caps = platformCaptions(format, day43);
      for (const text of [caps.tiktok, caps.instagram, caps.youtube, caps.youtubeTitle, caps.youtubeDescription]) {
        assert.ok(!text.includes("\u2014"), `${format} has em dash`);
        assert.ok((text.match(/!/g) || []).length <= 1, `${format} has more than one !`);
      }
      assert.ok(caps.youtubeDescription.trimEnd().endsWith("surviveorion.com"));
      assert.match(caps.youtubeTitle, /daily dodge game/);
      assert.match(caps.youtubeDescription, /#Shorts/);
      assert.match(caps.tiktok, /dodge|browser/i);
      assert.match(caps.firstComment, /surviveorion.com/);
    }
  });

  it("tag rotation is deterministic on day and never the whole bank", () => {
    const a = rotateTags(43, "arsenal");
    const b = rotateTags(43, "arsenal");
    const c = rotateTags(44, "arsenal");
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
    assert.ok(a.length >= 4 && a.length <= 6);
    assert.ok(a.length < 9);
  });
});
