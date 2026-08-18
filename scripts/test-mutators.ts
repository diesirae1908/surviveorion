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
import { createWorld, tick } from "../src/gameState";
import type { InputState } from "../src/input";
import { hashString, setRunSeed } from "../src/math";
import {
  clearActiveMutators,
  getActiveMutators,
  getMutatorById,
  getMutatorsForDate,
  getMutatorsForDateFromPool,
  MUTATOR_POOL,
  MUTATORS_START_DATE,
  mutatorAmbientRateScale,
  mutatorFormationWeights,
  mutatorPickupMagnetStrength,
  mutatorTelegraphDurationScale,
  mutatorViewScale,
  mutatorWindVector,
  setActiveMutators,
  type Mutator,
} from "../src/mutators";
import golden from "./mutator-snapshot.json";

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
    const want = SNAPSHOT[d];
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
    "snapshot: every date 2026-08-10..2026-12-31 matches the frozen fixture",
    checked === Object.keys(SNAPSHOT).length && mismatches === 0,
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
    const want = SNAPSHOT[d];
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
    blackout: "override",
    "red-alert": "override",
    "the-flood": "override",
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

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
if (failures > 0) process.exit(1);
