import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertNoEmDash,
  endcardCopy,
  formatScore,
  formatScoreShort,
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

  it("THE BOARD burn-in is two lines, no em dash", () => {
    const cap = videoCaption("THE_BOARD", day43);
    assert.ok(cap.lines.length <= 2);
    assert.match(cap.lines[0], /3,490,380/);
    assert.ok(!cap.lines.join(" ").includes("\u2014"));
  });

  it("TODAY'S PATROL uses ARSENAL subline and Alarm-ready mutator name", () => {
    const cap = videoCaption("TODAYS_PATROL", day43);
    assert.ok(cap.lines.length <= 2);
    assert.match(cap.lines[0], /ARSENAL/);
    assert.match(cap.lines[1], /twice as often/);
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
});
