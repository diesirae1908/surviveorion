/**
 * Graze anti-cheat ceiling: server/validate.mjs mirrors the graze scales of
 * src/mutators.ts by mutator NAME (server runtime cannot import src/). This
 * test locks that parity and the per-day ceilings.
 * Run: npx tsx scripts/test-graze-ceiling.ts (wired into `npm test`).
 */
import fs from "node:fs";
import { getMutatorsForDateStr, MUTATOR_POOL } from "../src/mutators";
import { grazeLimits, MUTATOR_GRAZE_SCALES, validateRun } from "../server/validate.mjs";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- Parity: server table vs src/mutators.ts -------------------------------
for (const m of MUTATOR_POOL) {
  const pts = m.overrides.grazePointsScale;
  const cd = m.overrides.grazeCooldownScale;
  const row = (MUTATOR_GRAZE_SCALES as Record<string, { points: number; cooldown: number }>)[m.name];
  if (pts === undefined && cd === undefined) {
    check(`${m.name}: no graze scale, no server row`, row === undefined);
  } else {
    check(
      `${m.name}: server row matches src`,
      !!row && row.points === (pts ?? 1) && row.cooldown === (cd ?? 1),
      JSON.stringify(row),
    );
  }
}
for (const name of Object.keys(MUTATOR_GRAZE_SCALES)) {
  check(`server row ${name} exists in the pool`, MUTATOR_POOL.some((m) => m.name === name));
}

// --- Every scheduled day: schedule names give the live scale math -----------
const schedule = JSON.parse(fs.readFileSync("server/mutator-schedule.json", "utf8")) as Record<
  string,
  Array<{ name: string }>
>;
// Safety property: whatever the schedule file says, the server must never be
// TIGHTER than the live mutator math (that would reject legit runs). A stale
// schedule day is reported as drift (run scripts/export-mutator-schedule.ts)
// but only a tighter-than-live day fails.
let tighter = 0;
let drift = 0;
let maxPts = 0;
for (const [date, day] of Object.entries(schedule)) {
  const live = getMutatorsForDateStr(date);
  const livePts = live.reduce((a, m) => a * (m.overrides.grazePointsScale ?? 1), 1);
  const liveCd = live.reduce((a, m) => a * (m.overrides.grazeCooldownScale ?? 1), 1);
  const lim = grazeLimits(day.map((m) => m.name));
  const wantPts = 10 * Math.max(1.5, livePts);
  const wantRate = 8 / Math.min(1, liveCd);
  if (lim.points < wantPts - 1e-9 || lim.perSec < wantRate - 1e-9) {
    tighter++;
    console.log(`  TIGHTER ${date}: schedule ${JSON.stringify(day.map((m) => m.name))} vs live ${JSON.stringify(live.map((m) => m.name))}`);
  } else if (Math.abs(lim.points - wantPts) > 1e-9 || Math.abs(lim.perSec - wantRate) > 1e-9) {
    drift++;
    console.log(`  note: schedule drift ${date} (schedule looser than live, harmless)`);
  }
  maxPts = Math.max(maxPts, lim.points);
}
check("no scheduled day is tighter than the live graze math", tighter === 0, `${tighter} tighter, ${drift} drifted`);
const pool = grazeLimits(null);
check("pool worst case covers every scheduled day", maxPts <= pool.points, `${maxPts} <= ${pool.points}`);

// --- Ceilings, before/after ---------------------------------------------------
const plain = grazeLimits(["MENAGERIE"]);
const gp = grazeLimits(["GRAZE PROTOCOL"]);
const hp = grazeLimits(["HUNTING PARTY"]);
check("plain day unchanged: 15 pts, 8/s", plain.points === 15 && plain.perSec === 8, JSON.stringify(plain));
check("hunting party unchanged: 15 pts, 8/s", hp.points === 15 && hp.perSec === 8);
check("graze protocol: 80 pts, ~17.8/s", gp.points === 80 && Math.abs(gp.perSec - 8 / 0.45) < 1e-9, JSON.stringify(gp));
check("Sunday pair multiplies", grazeLimits(["BLACKOUT", "GRAZE PROTOCOL"]).points === 80);
check("unknown / empty falls back to pool max", grazeLimits([]).points === pool.points && pool.points === 120);

// --- validateRun end to end ---------------------------------------------------
const base = { timeSurvived: 120, kills: 0, maxMultiplier: 10, mode: "desktop" };
const big = 1_000_000;
const huge = 3_000_000;
const absurd = 9_000_000;
check("graze-heavy run fails on a plain day", validateRun({ ...base, score: big, mutatorNames: ["MENAGERIE"] }) !== null);
check("graze-heavy run fails on a Hunting Party day", validateRun({ ...base, score: big, mutatorNames: ["HUNTING PARTY"] }) !== null);
check("same run passes on a GRAZE PROTOCOL day", validateRun({ ...base, score: big, mutatorNames: ["GRAZE PROTOCOL"] }) === null);
check("impossible score still fails on GRAZE PROTOCOL", validateRun({ ...base, score: huge, mutatorNames: ["GRAZE PROTOCOL"] }) !== null);
check("Classic (no names) uses the pool max", validateRun({ ...base, score: huge }) === null);
check("Classic still rejects an absurd score", validateRun({ ...base, score: absurd }) !== null);
check("ordinary run unchanged", validateRun({ ...base, score: 20_000, mutatorNames: ["MENAGERIE"] }) === null);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall graze-ceiling checks passed");
