// Result v2: flight trace maths, cause lines, medal bar, chips, death flash.
import assert from "node:assert/strict";
import type { FormationKind } from "../src/config";
import { FLASH_ALPHA, FLASH_MS, flashAlphaAt } from "../src/fx/deathFx";
import { appendDeathPoint, traceToPath, TRACE_MAX_POINTS, type TraceSample } from "../src/flightTrace";
import {
  CAUSE_LINES,
  RESULT_HEADER,
  causeParts,
  causeText,
  headerLine,
  hotLine,
  medalBarModel,
  resultChips,
  showNewBest,
} from "../src/resultView";
import { medalThresholdsFor } from "../src/medals";
import type { DeathCause } from "../src/types";

const field = { w: 20, h: 40 };
const box = { x: 10, y: 20, w: 100, h: 200 };

// --- traceToPath ---
{
  const track: TraceSample[] = Array.from({ length: 720 }, (_, i) => [i * 0.5, Math.sin(i / 30) * 8, -15 + (i / 720) * 30]);
  const p = traceToPath(track, field, box);
  assert.ok(p.points.length <= TRACE_MAX_POINTS, "downsampled to the cap");
  assert.equal(p.points.length, TRACE_MAX_POINTS);
  const first = p.project(track[0][1], track[0][2]);
  const last = p.project(track[719][1], track[719][2]);
  assert.deepEqual(p.points[0], first, "first sample kept");
  assert.deepEqual(p.points[p.points.length - 1], last, "last sample kept");
  for (const [x, y] of p.points) {
    assert.ok(x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h, "inside the box");
  }
  // y-up to y-down: higher world y is a smaller screen y
  assert.ok(p.project(0, 10)[1] < p.project(0, -10)[1], "y flipped");
  // centered, uniform scale: origin lands in the middle of the box
  assert.deepEqual(p.project(0, 0), [60, 120]);
  // short tracks are not resampled
  assert.equal(traceToPath(track.slice(0, 5), field, box).points.length, 5);
  // custom cap
  assert.equal(traceToPath(track, field, box, 50).points.length, 50);
  // empty track is safe
  assert.equal(traceToPath([], field, box).points.length, 0);
}

// --- appendDeathPoint: from deathCause, not the last track sample ---
{
  const track: TraceSample[] = [
    [0, 0, 0],
    [0.5, 1, 1],
    [1, 2, 2],
  ];
  const cause: DeathCause = { kind: "drone", time: 47.3, x: -6, y: 12 };
  const p = appendDeathPoint(traceToPath(track, field, box), cause);
  assert.equal(p.points.length, 4, "death point appended");
  assert.deepEqual(p.death, p.project(-6, 12));
  assert.deepEqual(p.points[3], p.death);
  assert.notDeepEqual(p.death, p.project(2, 2), "not the last track sample");
  const none = appendDeathPoint(traceToPath(track, field, box), null);
  assert.equal(none.points.length, 3);
  assert.equal(none.death, null);
}

// --- cause strings: every kind, every formation, every creature ---
{
  const at = (kind: DeathCause["kind"], detail?: string): DeathCause => ({ kind, detail, time: 47.9, x: 0, y: 0 });
  assert.equal(causeText(at("formation", "pincer")), "Caught in a pincer at 0:47");
  assert.equal(causeText(at("formation", "megawall")), "Downed by the Great Wall at 0:47");
  assert.equal(causeText(at("formation", "swarm")), "Downed by the swarm at 0:47");
  assert.equal(causeText(at("formation", "line")), "Downed by a drone line at 0:47");
  assert.equal(causeText(at("formation", "tightring")), "Caught in a closing ring at 0:47");
  assert.equal(causeText(at("creature", "lance")), "Downed by a LANCE at 0:47");
  assert.equal(causeText(at("drone")), "Downed by a loose drone at 0:47");
  assert.equal(causeText(at("mine")), "Hit a mine at 0:47");
  assert.equal(causeText(at("beam")), "Caught by a lighthouse at 0:47");
  assert.equal(causeText(at("crater")), "Hit a meteor crater at 0:47");
  const formations = Object.keys(CAUSE_LINES.formation) as FormationKind[];
  assert.equal(formations.length, 10, "all ten formation kinds named");
  for (const f of formations) {
    const t = causeText({ kind: "formation", detail: f, time: 83, x: 0, y: 0 });
    assert.ok(/^(Downed by|Caught in) /.test(t) && t.endsWith("at 1:23"), t);
    assert.ok(t.includes(CAUSE_LINES.formation[f].name), t);
  }
  for (const c of ["lance", "wheel", "hunter", "bomb"]) {
    const t = causeText({ kind: "creature", detail: c, time: 5, x: 0, y: 0 });
    assert.ok(t.includes(CAUSE_LINES.creature[c].name) && t.endsWith("at 0:05"), t);
  }
  // unknown detail never prints "undefined"
  assert.ok(!causeText(at("formation", "nope")).includes("undefined"));
  assert.ok(!causeText(at("creature")).includes("undefined"));
  assert.equal(causeParts(at("mine")).name, "mine");
}

// --- medal bar ---
{
  const t = { copper: 60000, silver: 130000, gold: 300000 };
  const none = medalBarModel(0, t);
  assert.equal(none.fill, 0);
  assert.equal(none.next, "copper");
  assert.equal(none.toGo, 60000);
  const mid = medalBarModel(95000, t); // halfway copper..silver
  assert.ok(Math.abs(mid.fill - (1 / 3 + 1 / 6)) < 1e-9, `fill ${mid.fill}`);
  assert.equal(mid.next, "silver");
  assert.equal(mid.toGo, 35000);
  assert.deepEqual(mid.reached, { copper: true, silver: false, gold: false });
  const gold = medalBarModel(310000, t);
  assert.equal(gold.fill, 1);
  assert.equal(gold.next, null);
  assert.equal(gold.toGo, 0);
  // monotonic fill
  let prev = -1;
  for (let s = 0; s <= 350000; s += 5000) {
    const f = medalBarModel(s, t).fill;
    assert.ok(f >= prev, "fill never decreases");
    prev = f;
  }
  // real thresholds for no mutators are well formed
  const real = medalThresholdsFor([]);
  assert.ok(real.copper < real.silver && real.silver < real.gold);
}

// --- chips, hot line, header, personal best ---
{
  const chips = resultChips({ kills: 17, maxMultiplier: 9, grazes: 9 });
  assert.deepEqual(
    chips.map((c) => c.label),
    ["KILLS", "PEAK CHAIN", "GRAZES"],
  );
  assert.deepEqual(
    chips.map((c) => c.value),
    ["17", "×9.0", "9"],
  );
  assert.equal(resultChips({ kills: 0, maxMultiplier: 1 })[2].value, "0", "grazes default to 0");
  assert.equal(hotLine(0), null);
  assert.equal(hotLine(undefined), null);
  assert.equal(hotLine(1), "Ran hot 1 time");
  assert.equal(hotLine(3), "Ran hot 3 times");
  assert.equal(RESULT_HEADER, "SIGNAL LOST", "approved by Lucas 2026-10-30");
  assert.equal(
    headerLine({ daily: true, gameMode: "classic", mutatorNames: ["BLACKOUT", "GIANTS"] }),
    "SIGNAL LOST · DAILY PATROL · BLACKOUT + GIANTS",
  );
  assert.equal(headerLine({ daily: false, gameMode: "ironrain" }), "SIGNAL LOST · IRON RAIN");
  assert.equal(headerLine({ daily: true, gameMode: "classic", preview: true }), "SIGNAL LOST · DAILY PATROL PREVIEW");
  assert.equal(showNewBest({ isNewBest: true, prevBest: 100, runCount: 5 }), true);
  assert.equal(showNewBest({ isNewBest: true, prevBest: 0, runCount: 1 }), false, "first score is not a PB");
  assert.equal(showNewBest({ isNewBest: false, prevBest: 100, runCount: 5 }), false);
}

// --- death flash: 0.2 at the first frame, gone by 150 ms ---
{
  assert.equal(flashAlphaAt(0), FLASH_ALPHA);
  assert.ok(flashAlphaAt(FLASH_MS / 2) > 0 && flashAlphaAt(FLASH_MS / 2) < FLASH_ALPHA);
  assert.equal(flashAlphaAt(FLASH_MS), 0);
  assert.equal(flashAlphaAt(-1), 0);
  assert.equal(FLASH_MS, 150);
  assert.equal(FLASH_ALPHA, 0.2);
}

console.log("PASS test-result-view");
