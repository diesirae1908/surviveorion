/**
 * Characterization + regression lock for Daily Mutators (see AGENTS.md
 * "Adding a Daily Mutator" and JOURNAL.md for the append-only design).
 * Run: npx tsx scripts/test-mutators.ts (wired into `npm test`).
 *
 * This file exists so a future 23rd mutator can ship without silently
 * reshuffling any past Daily Patrol day and without silently changing
 * Classic/Iron Rain/other-mutator-day behavior. If you're adding a
 * mutator and a check here fails, that is the test doing its job: stop,
 * do not "fix" the test to match the new numbers, figure out why a day
 * that should be untouched moved.
 */
import { blackoutDarkRange, blackoutOverlayAmount, blackoutTelegraphMul } from "../src/blackout";
import { BLACKOUT, CREATURE_DAYS, FLOOD_SURGE, MINES, POWERS, SHIP, STARFALL_RAIN } from "../src/config";
import { createWorld, tick } from "../src/gameState";
import type { InputState } from "../src/input";
import { hashString, rand, scheduleRand, setRunSeed } from "../src/math";
import {
  clearActiveMutators,
  getActiveMutators,
  getMutatorById,
  getMutatorsForDate,
  getMutatorsForDateFromPool,
  MUTATOR_POOL,
  MUTATORS_START_DATE,
  WAVE2_AVAILABLE_FROM,
  mutatorAmbientRateScale,
  mutatorBlackoutPulse,
  mutatorFormationWeights,
  mutatorGrazePointsScale,
  mutatorPickupMagnetStrength,
  mutatorTelegraphDurationScale,
  mutatorViewScale,
  mutatorWindShiftWarning,
  mutatorWindVector,
  mutatorFloodSurgeActive,
  mutatorFormationsDisabled,
  setActiveMutators,
  type Mutator,
} from "../src/mutators";
import { freezeMinesInRadius } from "../src/mines";
import { cancelIntoWallWind, clampToBounds } from "../src/physics";
import type { World } from "../src/types";
import golden from "./mutator-snapshot.json";
import goldenWave2 from "./mutator-snapshot-wave2.json";

const input: InputState = {
  turn: 0,
  thrust: 0,
  heading: null,
  moveVector: null,
  inertia: true,
  cruiseSpeed: 8,
};

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures++;
}

function addUtcDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const SNAPSHOT_END_DATE = "2026-12-31";
const SNAPSHOT: Record<string, string> = golden as Record<string, string>;
const SNAPSHOT_WAVE2: Record<string, string> = goldenWave2 as Record<string, string>;

// --- 1. Snapshot: every UTC date from MUTATORS_START_DATE through
// SNAPSHOT_END_DATE must resolve to exactly the ids recorded in
// mutator-snapshot.json. That file was generated once, before the
// append-only selection rewrite, straight off getMutatorsForDate, and is
// the byte-for-byte contract every future selection-math change must honor.
// If this section fails: STOP. Revert the selection change. Do not update
// the snapshot to match; the whole point is that these dates never move.
{
  let checked = 0;
  let mismatches = 0;
  const firstFewMismatches: string[] = [];
  let d = MUTATORS_START_DATE;
  while (d <= SNAPSHOT_END_DATE) {
    const got = getMutatorsForDate(new Date(`${d}T00:00:00Z`))
      .map((m) => m.id)
      .join("+");
    const want = d < WAVE2_AVAILABLE_FROM ? SNAPSHOT[d] : SNAPSHOT_WAVE2[d];
    checked++;
    if (want === undefined) {
      mismatches++;
      if (firstFewMismatches.length < 5) firstFewMismatches.push(`${d}: no fixture entry`);
    } else if (got !== want) {
      mismatches++;
      if (firstFewMismatches.length < 5) firstFewMismatches.push(`${d}: got "${got}" want "${want}"`);
    }
    d = addUtcDays(d, 1);
  }
  check(
    "snapshot: dates before wave 2 match the frozen 22-pool fixture; later dates match wave 2",
    mismatches === 0,
    mismatches > 0 ? `${mismatches}/${checked} mismatched, e.g. ${firstFewMismatches.join(" | ")}` : `${checked} dates`,
  );
}

// --- 2. Classic fingerprint: a mutator PR cannot silently change arcade.
// Same recorder pattern as scripts/sim-test.ts section 7 (daily determinism),
// duplicated here in miniature rather than imported, since this file only
// needs a Classic (non-daily) run and importing sim-test's internals would
// risk a needless coupling between the two suites for one small helper.
{
  interface Script {
    formations: string[];
    powers: string[];
    mines: string[];
  }

  const recordClassic = (): Script => {
    setRunSeed(778899);
    const world = createWorld(17.8, 10); // Classic, not daily, no mutators active
    const script: Script = { formations: [], powers: [], mines: [] };
    const steps = Math.round(180 / (1 / 60));
    for (let i = 0; i < steps; i++) {
      world.powers.starshellTimer = 9999; // invulnerable observer, deterministic
      tick(world, input, 1 / 60);
      for (const e of world.events) {
        if (e.type === "formation") script.formations.push(`${world.time.toFixed(2)}:${e.kind}`);
        if (e.type === "pickupSpawn") {
          script.powers.push(`${world.time.toFixed(2)}:${e.power}@${e.x.toFixed(2)},${e.y.toFixed(2)}`);
        }
      }
      world.events.length = 0;
      for (const m of world.mines) {
        script.mines.push(`${world.time.toFixed(2)}:${m.x.toFixed(2)},${m.y.toFixed(2)}`);
      }
      world.mines.length = 0;
    }
    setRunSeed(null);
    return script;
  };

  const script = recordClassic();
  const fingerprint = hashString(
    `f:${script.formations.join("|")}::p:${script.powers.join("|")}::m:${script.mines.join("|")}`,
  );
  // Frozen 2026-08-18, before this PR touched anything selection-related.
  // Classic never calls setActiveMutators, so nothing in this PR (adding
  // availableFrom, rewriting pickFirst/pickSecond to index into the
  // eligible pool) can change this value; a future PR that somehow does
  // change it has leaked mutator logic into the non-daily path.
  const GOLDEN_CLASSIC_FINGERPRINT = 1971246982;
  check(
    "Classic fingerprint: 3 seeded minutes unaffected by mutator code",
    fingerprint === GOLDEN_CLASSIC_FINGERPRINT &&
      script.formations.length > 5 &&
      script.powers.length > 3 &&
      script.mines.length > 1,
    `fingerprint ${fingerprint} (want ${GOLDEN_CLASSIC_FINGERPRINT}), ${script.formations.length} formations, ${script.powers.length} drops, ${script.mines.length} mines`,
  );
}

// --- 3. Getter algebra: combine rules actually do what mutators.ts's
// header comment claims (multiply / sum / first-wins / clears to identity).
{
  const blackout = getMutatorById("blackout")!;
  const thePit = getMutatorById("the-pit")!;
  const shareTag = blackout.tags.some((t) => thePit.tags.includes(t));
  check("blackout + the-pit share no tag (a real compatible Sunday pair)", !shareTag);

  setActiveMutators([blackout, thePit]);
  check(
    "real pair: each mutator's own scale passes through untouched",
    mutatorTelegraphDurationScale() === 0.36 && mutatorViewScale() === 0.72,
    `telegraph ${mutatorTelegraphDurationScale()}, view ${mutatorViewScale()}`,
  );
  clearActiveMutators();
  check(
    "clearActiveMutators resets scales/getters to identity",
    mutatorTelegraphDurationScale() === 1 &&
      mutatorViewScale() === 1 &&
      mutatorAmbientRateScale() === 1 &&
      mutatorPickupMagnetStrength() === 0 &&
      mutatorWindVector() === null &&
      mutatorFormationWeights() === null &&
      getActiveMutators().length === 0,
  );

  // Synthetic pair (test-only, never added to MUTATOR_POOL): the live pool
  // deliberately never lets two mutators share a combinable knob without
  // also sharing a tag (that's what tags are for), so there's no real pair
  // to prove a genuine two-nonzero multiply/sum against. Two tiny fake
  // mutator objects give a clean, unambiguous arithmetic check instead.
  const synthA: Mutator = {
    id: "test-synth-a",
    name: "TEST SYNTH A",
    briefing: "test-only",
    subline: "test-only",
    difficultyFactor: 1,
    tags: ["test-only"],
    availableFrom: MUTATORS_START_DATE,
    overrides: {
      ambientRateScale: 2,
      pickupMagnetStrength: 1.5,
      formationWeights: {
        line: 1,
        ring: 0,
        burst: 0,
        wall: 0,
        serpent: 0,
        pincer: 0,
        corners: 0,
        tightring: 0,
        swarm: 0,
        megawall: 0,
      },
    },
  };
  const synthB: Mutator = {
    ...synthA,
    id: "test-synth-b",
    name: "TEST SYNTH B",
    overrides: {
      ambientRateScale: 3,
      pickupMagnetStrength: 2.5,
      formationWeights: {
        line: 0,
        ring: 1,
        burst: 0,
        wall: 0,
        serpent: 0,
        pincer: 0,
        corners: 0,
        tightring: 0,
        swarm: 0,
        megawall: 0,
      },
    },
  };
  setActiveMutators([synthA, synthB]);
  check("synthetic pair: multiplicative scale multiplies (2 * 3)", mutatorAmbientRateScale() === 6, `${mutatorAmbientRateScale()}`);
  check(
    "synthetic pair: additive knob sums (1.5 + 2.5)",
    mutatorPickupMagnetStrength() === 4,
    `${mutatorPickupMagnetStrength()}`,
  );
  check(
    "synthetic pair: firstOf replacement takes the first mutator's value",
    mutatorFormationWeights()?.line === 1 && mutatorFormationWeights()?.ring === 0,
    JSON.stringify(mutatorFormationWeights()),
  );
  clearActiveMutators();
  check(
    "clearActiveMutators after synthetic pair also returns to identity",
    mutatorAmbientRateScale() === 1 && mutatorPickupMagnetStrength() === 0 && mutatorFormationWeights() === null,
  );
}

// --- 4. Sunday tags: two mutators sharing a tag never co-occur on any UTC
// Sunday in the snapshot range (re-derives this from the real pool + real
// selection, doesn't just trust the header comment's claim).
{
  let violations = 0;
  const firstFew: string[] = [];
  let d = MUTATORS_START_DATE;
  while (d <= SNAPSHOT_END_DATE) {
    const date = new Date(`${d}T00:00:00Z`);
    if (date.getUTCDay() === 0) {
      const picks = getMutatorsForDate(date);
      if (picks.length === 2) {
        const [a, b] = picks;
        if (a.tags.some((t) => b.tags.includes(t))) {
          violations++;
          if (firstFew.length < 5) firstFew.push(`${d}: ${a.id} + ${b.id} share a tag`);
        }
      }
    }
    d = addUtcDays(d, 1);
  }
  check("Sunday pairs never share a tag", violations === 0, firstFew.join(" | "));
}

// --- 5. Append-only proof: a fake 23rd mutator, never added to the live
// MUTATOR_POOL, injected only via getMutatorsForDateFromPool. Every date
// before its availableFrom must still match the frozen snapshot exactly;
// dates on/after it may (but need not) pick the new id.
{
  const FAKE_AVAILABLE_FROM = "2026-09-01";
  const fake23: Mutator = {
    id: "test-fake-23",
    name: "TEST FAKE 23",
    briefing: "test-only",
    subline: "test-only",
    difficultyFactor: 1,
    tags: ["test-only"],
    availableFrom: FAKE_AVAILABLE_FROM,
    overrides: {},
  };
  const fakePool = [...MUTATOR_POOL, fake23];

  let preMismatches = 0;
  const firstFewPre: string[] = [];
  let d = MUTATORS_START_DATE;
  while (d < FAKE_AVAILABLE_FROM) {
    const got = getMutatorsForDateFromPool(new Date(`${d}T00:00:00Z`), fakePool)
      .map((m) => m.id)
      .join("+");
    const want = d < WAVE2_AVAILABLE_FROM ? SNAPSHOT[d] : SNAPSHOT_WAVE2[d];
    if (got !== want) {
      preMismatches++;
      if (firstFewPre.length < 5) firstFewPre.push(`${d}: got "${got}" want "${want}"`);
    }
    d = addUtcDays(d, 1);
  }
  check(
    "append-only: every date before the fake 23rd's availableFrom is unchanged",
    preMismatches === 0,
    firstFewPre.join(" | "),
  );

  let sawFake = false;
  let postChecked = 0;
  // 200 days (not 30): with 23 eligible entries the odds of any single day
  // landing on the new one are ~1/23, so a short window can miss it by
  // chance even though selection is working correctly. 200 days of daily
  // + Sunday-second-slot draws makes a miss astronomically unlikely, and
  // since hashString is a pure deterministic function of the date string,
  // this is not a source of test flakiness: it either always passes or
  // always fails on this fixed pool/window.
  const windowEnd = addUtcDays(FAKE_AVAILABLE_FROM, 200);
  d = FAKE_AVAILABLE_FROM;
  while (d < windowEnd) {
    const picks = getMutatorsForDateFromPool(new Date(`${d}T00:00:00Z`), fakePool);
    postChecked++;
    if (picks.some((m) => m.id === fake23.id)) sawFake = true;
    d = addUtcDays(d, 1);
  }
  check(
    "append-only: the fake 23rd is actually reachable once its availableFrom arrives",
    sawFake,
    `checked ${postChecked} days from ${FAKE_AVAILABLE_FROM}`,
  );
}

// --- 6. Kind classification: every live MUTATOR_POOL id is classified so
// the next STARFALL-class (environmental) or MENAGERIE-class (creature)
// mutator can't ship covered only by the 60s sim-test boot loop. "override"
// = retunes existing spawn/formation/power knobs, no new runtime system.
// "creature" = direct-spawn choreography instead of the normal spawner
// (creatures.ts). "environmental" = a persistent ambient world effect
// independent of spawn tuning (meteor rain, wind, magnet pull), whether or
// not it has a dedicated module. SOLAR WIND and MAGNETIC FIELD are pure
// per-frame kinematics with no dedicated module like starfall.ts, so they
// could reasonably be called "override" instead; classified environmental
// here since their character (an always-on ambient force, not a spawn/
// formation/power retune) matches STARFALL rather than the tuning-knob
// mutators, and the brief allows either as long as it's picked and
// documented.
{
  type MutatorKind = "override" | "creature" | "environmental";
  const KIND: Record<string, MutatorKind> = {
    blackout: "environmental",
    "red-alert": "override",
    "the-flood": "environmental",
    "great-wall": "override",
    "year-of-the-serpent": "override",
    menagerie: "creature",
    "lancer-doctrine": "creature",
    wheelhouse: "creature",
    "hunting-party": "creature",
    "demolition-day": "creature",
    titanfall: "override",
    arsenal: "override",
    overcharge: "override",
    "cryo-winter": "override",
    "iron-barrage": "override",
    singularity: "override",
    starfall: "environmental",
    "the-pit": "override",
    giants: "override",
    minefield: "override",
    "solar-wind": "environmental",
    "magnetic-field": "environmental",
    "ram-raid": "override",
    "gold-dash": "override",
    "the-lighthouse": "environmental",
    "graze-protocol": "override",
    "razor-day": "override",
    "thunder-day": "override",
    "cloak-day": "override",
    "bait-shot": "override",
    "ion-day": "override",
    "howlers-day": "override",
  };

  const missing = MUTATOR_POOL.filter((m) => KIND[m.id] === undefined).map((m) => m.id);
  const stale = Object.keys(KIND).filter((id) => !MUTATOR_POOL.some((m) => m.id === id));
  check(
    "every live MUTATOR_POOL id has a kind classification, and none are stale",
    missing.length === 0 && stale.length === 0,
    `missing: [${missing.join(", ")}], stale: [${stale.join(", ")}]`,
  );
}

// --- 7. No id-branch leak: gameplay code outside mutators.ts must read
// getters/flags, never branch on a mutator id string directly. A pre-
// existing leak here is a bug to report, not to "fix" by touching gameplay.
{
  const fs = await import("node:fs");
  const path = await import("node:path");
  const SRC_DIR = new URL("../src", import.meta.url).pathname;
  const liveIds = MUTATOR_POOL.map((m) => m.id);

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
    }
    return out;
  }

  const leaks: string[] = [];
  for (const file of walk(SRC_DIR)) {
    if (path.basename(file) === "mutators.ts") continue;
    const text = fs.readFileSync(file, "utf8");
    for (const id of liveIds) {
      // string literal only ("id" or 'id'), so a comment mentioning a
      // mutator's NAME (e.g. "STARFALL") doesn't false-positive; ids are
      // always lowercase-kebab and never appear as prose.
      if (text.includes(`"${id}"`) || text.includes(`'${id}'`)) {
        leaks.push(`${path.relative(SRC_DIR, file)}: "${id}"`);
      }
    }
  }
  check("no mutator-id string literals leak outside mutators.ts", leaks.length === 0, leaks.join(" | "));
}

// --- 8. Clamp keeps outward velocity; wind headings come from hashString,
// never rand()/scheduleRand(); holding away from the wall frees the ship.
{
  const bounds = { viewW: 10, viewH: 10 } as World;
  const r = 0.12;
  const hh = bounds.viewH / 2 - r;
  const hw = bounds.viewW / 2 - r;

  const topOut = { x: 0, y: hh + 1, prevX: 0, prevY: hh, vx: 0, vy: -3 };
  clampToBounds(topOut, bounds, r);
  check("clamp top keeps outward vy", topOut.vy === -3 && topOut.y === hh, `vy=${topOut.vy} y=${topOut.y}`);

  const topIn = { x: 0, y: hh + 1, prevX: 0, prevY: hh, vx: 0, vy: 3 };
  clampToBounds(topIn, bounds, r);
  check("clamp top zeros inward vy", topIn.vy === 0 && topIn.y === hh, `vy=${topIn.vy}`);

  const botOut = { x: 0, y: -hh - 1, prevX: 0, prevY: -hh, vx: 0, vy: 2 };
  clampToBounds(botOut, bounds, r);
  check("clamp bottom keeps outward vy", botOut.vy === 2 && botOut.y === -hh);

  const botIn = { x: 0, y: -hh - 1, prevX: 0, prevY: -hh, vx: 0, vy: -2 };
  clampToBounds(botIn, bounds, r);
  check("clamp bottom zeros inward vy", botIn.vy === 0);

  const leftOut = { x: -hw - 1, y: 0, prevX: -hw, prevY: 0, vx: 4, vy: 0 };
  clampToBounds(leftOut, bounds, r);
  check("clamp left keeps outward vx", leftOut.vx === 4 && leftOut.x === -hw);

  const leftIn = { x: -hw - 1, y: 0, prevX: -hw, prevY: 0, vx: -4, vy: 0 };
  clampToBounds(leftIn, bounds, r);
  check("clamp left zeros inward vx", leftIn.vx === 0);

  const rightOut = { x: hw + 1, y: 0, prevX: hw, prevY: 0, vx: -5, vy: 0 };
  clampToBounds(rightOut, bounds, r);
  check("clamp right keeps outward vx", rightOut.vx === -5 && rightOut.x === hw);

  const rightIn = { x: hw + 1, y: 0, prevX: hw, prevY: 0, vx: 5, vy: 0 };
  clampToBounds(rightIn, bounds, r);
  check("clamp right zeros inward vx", rightIn.vx === 0);

  const pinned = { x: 0, y: hh };
  const cancelled = cancelIntoWallWind(pinned, bounds, r, { x: 0.8, y: 2.0 });
  check("into-wall +y wind is dropped on the top wall", cancelled.x === 0.8 && cancelled.y === 0, `${cancelled.x},${cancelled.y}`);

  const windDate = new Date("2026-08-26T00:00:00Z");
  const solar = getMutatorById("solar-wind")!;
  setRunSeed(42);
  const streamA = rand();
  const schedA = scheduleRand();
  setRunSeed(42);
  setActiveMutators([solar], windDate);
  const v0 = mutatorWindVector(0);
  const vLater = mutatorWindVector(40);
  let warnAt: number | null = null;
  let warn = null as ReturnType<typeof mutatorWindShiftWarning>;
  for (let t = 0; t < 40; t += 0.05) {
    const w = mutatorWindShiftWarning(t);
    if (w) {
      warnAt = t;
      warn = w;
      break;
    }
  }
  const streamB = rand();
  const schedB = scheduleRand();
  check("wind headings do not consume seeded streams", streamA === streamB && schedA === schedB);

  const expected0 = ((hashString("orion-wind-2026-08-26") % 10007) / 10007) * Math.PI * 2;
  check("t=0 heading exists", !!v0);
  if (v0) {
    const got = Math.atan2(v0.y, v0.x);
    let d = Math.abs(got - expected0) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    check("t=0 angle is hashString(orion-wind-2026-08-26)", d < 1e-9, `got ${got} want ${expected0}`);
    check("strength stays 2.2", Math.abs(Math.hypot(v0.x, v0.y) - 2.2) < 1e-9, `${Math.hypot(v0.x, v0.y)}`);
  }
  check("a later segment has a vector", !!v0 && !!vLater);
  if (v0 && vLater) {
    const a0 = Math.atan2(v0.y, v0.x);
    const a1 = Math.atan2(vLater.y, vLater.x);
    let d = Math.abs(a0 - a1) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    check("shift is at least 25 degrees", d >= (25 * Math.PI) / 180 - 1e-6, `diff ${((d * 180) / Math.PI).toFixed(1)} deg`);
  }
  check("a warning window appears in the first 40s", warnAt !== null && !!warn);
  if (warn && warnAt !== null) {
    check("warning countdown is inside 2.5s", warn.secondsLeft > 0 && warn.secondsLeft <= 2.5 + 1e-6, `${warn.secondsLeft}`);
    let turn = Math.abs(warn.currentAngle - warn.incomingAngle) % (Math.PI * 2);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    check("incoming heading is a visible turn", turn >= (25 * Math.PI) / 180 - 1e-6);
    const live = mutatorWindVector(warnAt)!;
    let liveDiff = Math.abs(Math.atan2(live.y, live.x) - warn.currentAngle) % (Math.PI * 2);
    if (liveDiff > Math.PI) liveDiff = Math.PI * 2 - liveDiff;
    check("warning current matches the live vector", liveDiff < 1e-6);
    const after = mutatorWindVector(warnAt + warn.secondsLeft + 0.02)!;
    let afterDiff = Math.abs(Math.atan2(after.y, after.x) - warn.incomingAngle) % (Math.PI * 2);
    if (afterDiff > Math.PI) afterDiff = Math.PI * 2 - afterDiff;
    check("vector after the flip matches incoming", afterDiff < 1e-4);
    check("no warning at t=0 (mid-segment)", mutatorWindShiftWarning(0) === null);
  }

  const wall = worldHalfHeight();
  function worldHalfHeight(): number {
    const w = createWorld(16, 10, true, 0, "classic", true);
    return w.viewH / 2 - SHIP.radius;
  }

  const inertiaWorld = createWorld(16, 10, true, 0, "classic", true);
  inertiaWorld.ship.x = 0;
  inertiaWorld.ship.y = wall;
  inertiaWorld.ship.vx = 0;
  inertiaWorld.ship.vy = 0;
  inertiaWorld.ship.angle = -Math.PI / 2;
  const inertiaInput: InputState = {
    turn: 0,
    thrust: 1,
    heading: null,
    moveVector: null,
    inertia: true,
    cruiseSpeed: 8,
  };
  for (let i = 0; i < 90; i++) tick(inertiaWorld, inertiaInput, 1 / 60);
  check(
    "inertia thrust frees the ship from the top wall",
    inertiaWorld.ship.y < wall - 0.25,
    `y=${inertiaWorld.ship.y.toFixed(3)} wall=${wall.toFixed(3)}`,
  );

  const directWorld = createWorld(16, 10, true, 0, "classic", true);
  directWorld.ship.x = 0;
  directWorld.ship.y = wall;
  directWorld.ship.vx = 0;
  directWorld.ship.vy = 0;
  const directInput: InputState = {
    turn: 0,
    thrust: 0,
    heading: null,
    moveVector: { x: 0, y: -1 },
    inertia: false,
    cruiseSpeed: 8,
  };
  for (let i = 0; i < 45; i++) tick(directWorld, directInput, 1 / 60);
  check(
    "direct control frees the ship from the top wall",
    directWorld.ship.y < wall - 0.25,
    `y=${directWorld.ship.y.toFixed(3)} wall=${wall.toFixed(3)}`,
  );

  function findUpwardWindDate(): Date {
    let best: { date: Date; score: number } | null = null;
    for (let dayOff = 0; dayOff < 5000; dayOff++) {
      const d = new Date(Date.UTC(2026, 0, 1 + dayOff));
      setActiveMutators([solar], d);
      const v = mutatorWindVector(0);
      if (!v || v.y >= 0) continue;
      const angle = Math.atan2(v.y, v.x);
      let diff = Math.abs(angle - -Math.PI / 2) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      const score = diff - Math.min(0, v.y) * 0.01;
      if (!best || score < best.score) best = { date: d, score };
    }
    if (!best) throw new Error("could not find an upward SOLAR WIND date for regression");
    return best.date;
  }

  const upwardDate = findUpwardWindDate();
  setActiveMutators([solar], upwardDate);
  const upWind = mutatorWindVector(0)!;
  check("upward-wind regression uses a mostly-up vector", upWind.y < -1 && Math.abs(upWind.x) < 1, `${upWind.x},${upWind.y}`);

  const upInertia = createWorld(16, 10, true, 0, "classic", true);
  upInertia.ship.x = 0;
  upInertia.ship.y = wall;
  upInertia.ship.vx = 0;
  upInertia.ship.vy = 0;
  upInertia.ship.angle = -Math.PI / 2;
  const upInertiaInput: InputState = {
    turn: 0,
    thrust: 1,
    heading: null,
    moveVector: null,
    inertia: true,
    cruiseSpeed: 8,
  };
  for (let i = 0; i < 90; i++) tick(upInertia, upInertiaInput, 1 / 60);
  check(
    "upward wind: inertia thrust frees the ship from the top wall",
    upInertia.ship.y < wall - 0.25,
    `y=${upInertia.ship.y.toFixed(3)} wall=${wall.toFixed(3)} wind=${upWind.x.toFixed(2)},${upWind.y.toFixed(2)}`,
  );

  const upDirect = createWorld(16, 10, true, 0, "classic", true);
  upDirect.ship.x = 0;
  upDirect.ship.y = wall;
  upDirect.ship.vx = 0;
  upDirect.ship.vy = 0;
  const upDirectInput: InputState = {
    turn: 0,
    thrust: 0,
    heading: null,
    moveVector: { x: 0, y: -1 },
    inertia: false,
    cruiseSpeed: 8,
  };
  for (let i = 0; i < 45; i++) tick(upDirect, upDirectInput, 1 / 60);
  check(
    "upward wind: direct control frees the ship from the top wall",
    upDirect.ship.y < wall - 0.25,
    `y=${upDirect.ship.y.toFixed(3)} wall=${wall.toFixed(3)}`,
  );

  const upDash = createWorld(16, 10, true, 0, "classic", true);
  upDash.ship.x = 0;
  upDash.ship.y = wall;
  upDash.ship.vx = 0;
  upDash.ship.vy = 0;
  upDash.ship.angle = -Math.PI / 2;
  upDash.powers.afterburnerDash = POWERS.afterburner.dashDuration;
  const dashInput: InputState = {
    turn: 0,
    thrust: 0,
    heading: null,
    moveVector: null,
    inertia: true,
    cruiseSpeed: 8,
  };
  for (let i = 0; i < 30; i++) tick(upDash, dashInput, 1 / 60);
  check(
    "upward wind: afterburner dash frees the ship from the top wall",
    upDash.ship.y < wall - 0.25,
    `y=${upDash.ship.y.toFixed(3)} wall=${wall.toFixed(3)}`,
  );

  clearActiveMutators();
}

// --- Aug 26 night feedback pass: lock the shipped tunings + pulse math.
{
  const flood = getMutatorById("the-flood")!;
  check("THE FLOOD formationsDisabled is true", flood.overrides.formationsDisabled === true);
  check("THE FLOOD floodSurgeActive is true", flood.overrides.floodSurgeActive === true);
  check("THE FLOOD ambientRateScale is 0", flood.overrides.ambientRateScale === 0);
  check("THE FLOOD has no ambientMinutesFloor", flood.overrides.ambientMinutesFloor === undefined);
  check("THE FLOOD pop interval starts under 0.4s", FLOOD_SURGE.intervalStart <= 0.4);
  check("THE FLOOD pop rate tightens over time", FLOOD_SURGE.tightenPerMinute > 0);

  setRunSeed(42);
  const floodStreamA = rand();
  const floodSchedA = scheduleRand();
  setRunSeed(42);
  setActiveMutators([flood], "2026-08-28");
  check("THE FLOOD surge flag is on", mutatorFloodSurgeActive() === true);
  check("THE FLOOD formations are disabled", mutatorFormationsDisabled() === true);
  const floodStreamB = rand();
  const floodSchedB = scheduleRand();
  check("THE FLOOD flag does not consume seeded streams", floodStreamA === floodStreamB && floodSchedA === floodSchedB);
  clearActiveMutators();
  check("THE FLOOD surge flag is off on other days", mutatorFloodSurgeActive() === false);

  const starfall = getMutatorById("starfall")!;
  check("STARFALL pickupIntervalScale is 1.4", starfall.overrides.pickupIntervalScale === 1.4);
  check("STARFALL rain opens faster than 3s", STARFALL_RAIN.intervalStart === 2.6);
  check("STARFALL rain ramps in 1.2 min", STARFALL_RAIN.rampMinutes === 1.2);

  const blackout = getMutatorById("blackout")!;
  setActiveMutators([blackout]);
  check("BLACKOUT pulse flag is on", mutatorBlackoutPulse() === true);
  check("BLACKOUT gap is 5-15s", BLACKOUT.gapRange[0] === 5 && BLACKOUT.gapRange[1] === 15);
  check("BLACKOUT overlay is fully opaque", BLACKOUT.overlayOpacity === 1);
  check(
    "BLACKOUT opening dark is 1-2s",
    BLACKOUT.darkOpen[0] === 1.2 && BLACKOUT.darkOpen[1] === 2.0,
  );
  const dark90 = blackoutDarkRange(1.5);
  check(
    "BLACKOUT dark at 1:30 is 3-4s",
    Math.abs(dark90[0] - 3) < 1e-9 && Math.abs(dark90[1] - 4) < 1e-9,
    `${dark90[0]}-${dark90[1]}`,
  );
  const dark180 = blackoutDarkRange(3);
  check(
    "BLACKOUT dark at 3:00 is 6-7s",
    Math.abs(dark180[0] - 6) < 1e-9 && Math.abs(dark180[1] - 7) < 1e-9,
    `${dark180[0]}-${dark180[1]}`,
  );
  setRunSeed(42);
  const blackoutWorld = createWorld(17.8, 10, false, 0, "classic", true);
  check("BLACKOUT opens idle", blackoutWorld.blackoutPhase === "idle" && blackoutOverlayAmount(blackoutWorld) === 0);
  check("BLACKOUT telegraph mul is 1 while idle", blackoutTelegraphMul(blackoutWorld) === 1);
  let sawFlicker = false;
  let sawDark = false;
  for (let i = 0; i < 20 * 60; i++) {
    blackoutWorld.powers.starshellTimer = 9999;
    tick(blackoutWorld, input, 1 / 60);
    if (blackoutWorld.blackoutPhase === "flicker") sawFlicker = true;
    if (blackoutWorld.blackoutPhase === "dark") sawDark = true;
  }
  check("BLACKOUT flickers within 20s", sawFlicker);
  check("BLACKOUT goes dark within 20s", sawDark);
  check(
    "BLACKOUT telegraph mul drops during the outage",
    blackoutWorld.blackoutPhase === "dark"
      ? Math.abs(blackoutTelegraphMul(blackoutWorld) - BLACKOUT.telegraphOpacity) < 1e-9
      : blackoutTelegraphMul(blackoutWorld) <= 1,
  );
  const scriptOf = (world: World): string[] => {
    const script: string[] = [];
    for (let i = 0; i < 45 * 60; i++) {
      world.powers.starshellTimer = 9999;
      tick(world, input, 1 / 60);
      for (const e of world.events) {
        if (e.type === "lightsOut") {
          script.push(
            e.phase === "dark"
              ? `${world.time.toFixed(2)}:dark:${e.duration.toFixed(2)}`
              : `${world.time.toFixed(2)}:${e.phase}`,
          );
        }
      }
      world.events.length = 0;
    }
    return script;
  };
  setRunSeed(42);
  const blackoutA = createWorld(17.8, 10, false, 0, "classic", true);
  const scriptA = scriptOf(blackoutA);
  setRunSeed(42);
  const blackoutB = createWorld(17.8, 10, false, 0, "classic", true);
  const scriptB = scriptOf(blackoutB);
  check(
    "BLACKOUT outage script matches across two seeded worlds",
    scriptA.length > 0 && scriptA.join("|") === scriptB.join("|"),
    `${scriptA.length} outages`,
  );
  check(
    "BLACKOUT script mixes fake flickers with real outages",
    scriptA.some((s) => s.endsWith(":fake")) && scriptA.some((s) => s.includes(":dark:")),
    scriptA.slice(0, 8).join(", "),
  );
  clearActiveMutators();
  const plain = createWorld(17.8, 10, false, 0, "classic", true);
  check("BLACKOUT overlay is off on other days", blackoutOverlayAmount(plain) === 0);
  check("BLACKOUT telegraph mul is 1 on other days", blackoutTelegraphMul(plain) === 1);

  const hunt = getMutatorById("hunting-party")!;
  check("HUNTING PARTY grazePointsScale is 1.5", hunt.overrides.grazePointsScale === 1.5);
  check(
    "HUNTING PARTY early waves are [8,11]",
    CREATURE_DAYS.hunter.waveIntervalEarly[0] === 8 &&
      CREATURE_DAYS.hunter.waveIntervalEarly[1] === 11,
  );
  setActiveMutators([hunt]);
  check("HUNTING PARTY graze scale getter is 1.5", mutatorGrazePointsScale() === 1.5);
  clearActiveMutators();
  check("ordinary-day graze scale is 1", mutatorGrazePointsScale() === 1);

  const ice = createWorld(16, 10, true, 0, "classic", false);
  ice.mines.push({
    x: 1.2,
    y: 0,
    age: MINES.armTime + 0.1,
    lifetime: 20,
    seed: 0,
    alive: true,
    frozen: 0,
  });
  freezeMinesInRadius(ice, 0, 0, 9, 5);
  check("cryo field freezes a nearby mine", ice.mines[0].frozen === 5);
  ice.ship.x = 1.2;
  ice.ship.y = 0;
  ice.ship.vx = 0;
  ice.ship.vy = 0;
  tick(ice, input, 0);
  check("ramming a frozen mine shatters it", ice.mines[0].alive === false);
  check("frozen-mine shatter does not kill the ship", ice.phase === "playing");
  check("frozen-mine shatter pays points", ice.score > 0);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
if (failures > 0) process.exit(1);
