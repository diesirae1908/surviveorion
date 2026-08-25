import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCutPlans,
  closeCallCut,
  spaceDustCut,
  theBoardCut,
  todaysPatrolCut,
  eligibleCloseCallGrazes,
  isSpaceDustEligible,
  isTheBoardEligible,
  isTodaysPatrolEligible,
} from "../src/plan.mjs";
import { parseSidecarFile } from "../src/sidecar.mjs";
import { readFile } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

async function loadSidecar(name) {
  const basename = `${name}.json`;
  const text = await readFile(path.join(FIXTURES, basename), "utf8");
  return parseSidecarFile(text, basename);
}

describe("cut plan math", () => {
  it("CLOSE CALL segment and slow-mo windows", () => {
    const { cut, slowMo } = closeCallCut(10, 60);
    assert.deepEqual(cut, { start: 4, end: 14 });
    assert.deepEqual(slowMo, { start: 9.6, end: 10.6, rate: 0.5 });
  });

  it("CLOSE CALL clamps at run end", () => {
    const { cut } = closeCallCut(58, 60);
    assert.equal(cut.end, 60);
  });

  it("SPACE DUST uses whole run when duration <= 9s", () => {
    assert.deepEqual(spaceDustCut(8), { start: 0, end: 8 });
    assert.deepEqual(spaceDustCut(9), { start: 0, end: 9 });
  });

  it("SPACE DUST uses last 8s when duration > 9s", () => {
    assert.deepEqual(spaceDustCut(30), { start: 22, end: 30 });
    assert.deepEqual(spaceDustCut(12), { start: 4, end: 12 });
  });

  it("THE BOARD last 10s, no endcard, crop v2.0", () => {
    const plans = buildCutPlans({
      sourceBasename: "test",
      sidecar: {
        day: 1,
        mutatorIds: [],
        mutatorNames: [],
        score: 2_000_000,
        medal: null,
        survivalTime: 100,
        closestCall: null,
        topGrazes: [],
      },
      duration: 100,
      isFirstOfUtcDay: false,
    });
    const board = plans.find((p) => p.format === "THE_BOARD");
    assert.ok(board);
    assert.deepEqual(board.cut, { start: 90, end: 100 });
    assert.equal(board.endcardSeconds, undefined);
    assert.equal(board.cropMode, "v2.0");
    assert.ok(board.sheetDuration <= 12);
    assert.ok(board.sheetDuration >= 9);
  });

  it("TODAY'S PATROL first 10s (v1 22s retired)", () => {
    assert.deepEqual(todaysPatrolCut(60), { start: 0, end: 10 });
    assert.deepEqual(todaysPatrolCut(8), { start: 0, end: 8 });
  });
});

describe("format eligibility on hand-written fixtures", () => {
  it("8s death: SPACE DUST only (short run, no patrol mutators for first-of-day off)", async () => {
    const { sidecar } = await loadSidecar("orion_2026-08-20_day1_starfall_150");
    assert.ok(isSpaceDustEligible(sidecar));
    assert.ok(!isTheBoardEligible(sidecar));

    const plans = buildCutPlans({
      sourceBasename: "orion_2026-08-20_day1_starfall_150",
      sidecar,
      duration: 8,
      isFirstOfUtcDay: false,
    });

    assert.deepEqual(
      plans.map((p) => p.format),
      ["SPACE_DUST"]
    );
    assert.deepEqual(plans[0].cut, { start: 0, end: 8 });
  });

  it("8s death with first-of-day: adds TODAY'S PATROL", async () => {
    const { sidecar } = await loadSidecar("orion_2026-08-20_day1_starfall_150");
    const plans = buildCutPlans({
      sourceBasename: "orion_2026-08-20_day1_starfall_150",
      sidecar,
      duration: 8,
      isFirstOfUtcDay: true,
    });
    assert.deepEqual(plans.map((p) => p.format), ["SPACE_DUST", "TODAYS_PATROL"]);
  });

  it("Sunday double: CLOSE CALL x2 + THE BOARD when not space dust", async () => {
    const { sidecar } = await loadSidecar(
      "orion_2026-08-24_day42_arsenal+starfall_50000"
    );
    const grazes = eligibleCloseCallGrazes(sidecar);
    assert.equal(grazes.length, 2);

    const plans = buildCutPlans({
      sourceBasename: "orion_2026-08-24_day42_arsenal+starfall_50000",
      sidecar,
      duration: 100,
      isFirstOfUtcDay: true,
    });

    const formats = plans.map((p) => p.format);
    assert.equal(formats.filter((f) => f === "CLOSE_CALL").length, 2);
    assert.ok(formats.includes("TODAYS_PATROL"));
    assert.ok(!formats.includes("SPACE_DUST"));
  });

  it("fullgame classic: THE BOARD only, no TODAY'S PATROL", async () => {
    const { sidecar } = await loadSidecar("orion_2026-08-24_day0_classic_1500000");
    assert.ok(!isTodaysPatrolEligible(sidecar, true));

    const plans = buildCutPlans({
      sourceBasename: "orion_2026-08-24_day0_classic_1500000",
      sidecar,
      duration: 180,
      isFirstOfUtcDay: true,
    });

    assert.deepEqual(plans.map((p) => p.format), ["THE_BOARD"]);
    assert.deepEqual(plans[0].cut, theBoardCut(180));
  });

  it("multiple grazes: at most 2 CLOSE CALL, best clearance first", async () => {
    const { sidecar } = await loadSidecar("orion_2026-08-21_day10_pit_8000");
    const plans = buildCutPlans({
      sourceBasename: "orion_2026-08-21_day10_pit_8000",
      sidecar,
      duration: 50,
      isFirstOfUtcDay: false,
    });

    const closeCalls = plans.filter((p) => p.format === "CLOSE_CALL");
    assert.equal(closeCalls.length, 2);
    assert.equal(closeCalls[0].graze.clearance, 0.05);
    assert.equal(closeCalls[1].graze.clearance, 0.12);
  });
});

describe("day43 fixture sidecar", () => {
  it("plans THE BOARD + TODAY'S PATROL from the real sidecar", async () => {
    const day43Path = path.join(
      path.dirname(__dirname),
      "fixtures",
      "orion_2026-08-25_day43_arsenal_3490380.json"
    );
    const text = await readFile(day43Path, "utf8");
    const { sidecar } = parseSidecarFile(
      text,
      "orion_2026-08-25_day43_arsenal_3490380.json"
    );
    assert.equal(sidecar.score, 3490380);
    assert.deepEqual(sidecar.mutatorIds, ["arsenal"]);
    assert.deepEqual(sidecar.topGrazes, []);
    const plans = buildCutPlans({
      sourceBasename: "orion_2026-08-25_day43_arsenal_3490380",
      sidecar,
      duration: 7678 / 24,
      isFirstOfUtcDay: true,
    });
    assert.deepEqual(
      plans.map((p) => p.format),
      ["THE_BOARD", "TODAYS_PATROL"]
    );
    assert.deepEqual(plans[0].cut, theBoardCut(7678 / 24));
    assert.deepEqual(plans[1].cut, todaysPatrolCut(7678 / 24));
  });
});
