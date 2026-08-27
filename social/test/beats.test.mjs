import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DURATION_CAPS,
  assertBeatLines,
  boardBeat1,
  buildBeatSheet,
  closeCallBeat1,
  closeCallPct,
  patrolBeat1,
  sheetDuration,
  textEvents,
  wordCount,
  wrapHook,
} from "../src/beats.mjs";
import { buildAss, assTime } from "../src/ass.mjs";

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

describe("beat sheet math", () => {
  it("wraps to max 2 lines, 4 words/line", () => {
    const lines = wrapHook("everyone flies this exact run.");
    assert.ok(lines.length <= 2);
    for (const line of lines) assert.ok(wordCount(line) <= 4);
  });

  it("CLOSE CALL hook uses clearance percent, one decimal", () => {
    assert.equal(closeCallPct(0.05), "5.0");
    assert.equal(closeCallBeat1({ clearance: 0.05 }), "5.0% FROM DEATH");
  });

  it("day43 THE BOARD + TODAY'S PATROL stay inside caps", () => {
    const board = buildBeatSheet("THE_BOARD", day43, 319.9167);
    const patrol = buildBeatSheet("TODAYS_PATROL", day43, 319.9167);
    assert.ok(board.duration >= DURATION_CAPS.THE_BOARD.min);
    assert.ok(board.duration <= DURATION_CAPS.THE_BOARD.max);
    assert.ok(patrol.duration >= DURATION_CAPS.TODAYS_PATROL.min);
    assert.ok(patrol.duration <= DURATION_CAPS.TODAYS_PATROL.max);
    assert.match(boardBeat1(day43), /3,490,380/);
    assert.equal(patrolBeat1(day43), "ARSENAL DAY");
    assert.ok(board.beats.some((b) => b.id === "freeze"));
    assert.ok(!board.beats.some((b) => b.kind === "endcard"));
    assert.equal(patrol.beats.find((b) => b.id === "stretch").lines[0], "double the pickups.");
  });

  it("CLOSE CALL sheet is 8-11s and ends on freeze CTA", () => {
    const graze = { time: 10.5, clearance: 0.05, x: 1, y: 2 };
    const sheet = buildBeatSheet("CLOSE_CALL", day43, 50, { graze });
    assert.ok(sheet.duration >= 8 && sheet.duration <= 11);
    const last = sheet.beats[sheet.beats.length - 1];
    assert.equal(last.kind, "freeze");
    assert.match(last.lines.join(" "), /could you/);
    assert.ok(sheet.memes.length <= 2);
  });

  it("SPACE DUST may use 3 memes and stays 6-9s", () => {
    const dust = {
      ...day43,
      score: 150,
      survivalTime: 8,
      medal: null,
    };
    const sheet = buildBeatSheet("SPACE_DUST", dust, 8);
    assert.ok(sheet.duration >= 6 && sheet.duration <= 9);
    assert.ok(sheet.memes.length <= 3);
    assert.ok(sheet.memes.includes("at-this-moment"));
  });

  it("rejects em dash and over-long lines", () => {
    assert.throws(() => assertBeatLines(["foo \u2014 bar"], "x"), /em dash/);
    assert.throws(() => assertBeatLines(["one two three four five"], "x"), /4 words/);
  });

  it("ASS events use libass times and pop-in tags", () => {
    const sheet = buildBeatSheet("THE_BOARD", day43, 200);
    const ass = buildAss(textEvents(sheet.beats));
    assert.match(ass, /Dialogue:/);
    assert.match(ass, /\\fscx80/);
    assert.equal(assTime(0), "0:00:00.00");
    assert.equal(sheetDuration(sheet.beats), sheet.duration);
  });
});
