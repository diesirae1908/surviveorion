// Daily Mutators: a named, deterministic set of config overrides for Daily
// Patrol, derived from the UTC date (same day boundary as the daily seed,
// see `dailySeed()` in main.ts). Every pilot on the same UTC day gets the
// same mutator(s); selection needs no server call.
//
// Design constraint (shared-seed determinism, see math.ts and AGENTS.md):
// overrides may only change config VALUES identically for everyone. They
// must never add or remove a draw on the seeded `rand`/`scheduleRand`
// streams, or two pilots playing differently would see different scripts.
// Every override below is a plain multiplier/replacement read at the moment
// a value is used; the draw sequence itself is untouched.
//
// Sundays (UTC) fly 2 compatible mutators (tagged so incompatible pairs,
// e.g. two arena-size or two monopower days, can never co-occur). Overrides
// combine: multiplicative knobs (rates/scales) multiply together, and
// difficulty factors multiply for the day's medal thresholds.
//
// None of these touch SCORING (src/config.ts); see JOURNAL.md for the
// server/validate.mjs ceiling analysis that cleared the whole pool.

import type { AssemblyKind } from "./types";
import { hashString } from "./math";
import { SPAWNER, type FormationKind, type PowerId } from "./config";

export interface MutatorOverrides {
  /** Multiplies the ambient spawn accumulation rate (spawns/sec). */
  ambientRateScale?: number;
  /** Multiplies drone travel speed (on top of the size-speed factor). */
  droneSpeedScale?: number;
  /** Replaces SPAWNER.telegraph.ratio for the day (0 = nothing telegraphs). */
  telegraphRatio?: number;
  /** Multiplies the computed formation interval (min & max). */
  formationIntervalScale?: number;
  /** Replaces the formation weight table outright for the day. */
  formationWeights?: Record<FormationKind, number>;
  /** Multiplies the assembly (evolution) event interval. */
  assemblyIntervalScale?: number;
  /** Forces every assembly (scheduled + crowd-triggered) to one kind. */
  forceAssemblyKind?: AssemblyKind;
  /** Multiplies the pickup drop interval (lower = faster drops). */
  pickupIntervalScale?: number;
  /** Per-power weight overrides merged over POWER_SPAWN_WEIGHTS. */
  powerWeights?: Partial<Record<PowerId, number>>;
  /** Extra power ids added to the day's drop pool (e.g. unbenching vortex). */
  extraPowerIds?: PowerId[];
  /** Replaces SPAWNER.scaleClamp for the day. */
  scaleClamp?: readonly [number, number];
  /** Multiplies the mine spawn interval (min & max). */
  mineIntervalScale?: number;
  /** Multiplies the arena view size (world.viewW/viewH); <1 shrinks it. */
  viewScale?: number;
}

export interface Mutator {
  id: string;
  name: string;
  /** One-line, Red Rising-flavored mission briefing shown before launch. */
  briefing: string;
  /** Multiplies the day's medal time thresholds (>1 = harder, <1 = easier/fun). */
  difficultyFactor: number;
  /** Exclusion tags: two mutators sharing a tag can never fly the same Sunday. */
  tags: string[];
  overrides: MutatorOverrides;
}

// Every non-mono power kept at its normal weight except the target, so the
// existing bad-luck-protection math in pickups.ts never has to fight the
// override: with every other candidate weight at 0, the weighted roll always
// lands on the target regardless of demotion (see JOURNAL.md for the proof).
function monoPowerWeights(target: PowerId): Record<PowerId, number> {
  const zeroed: Record<PowerId, number> = {
    shield: 0,
    shockwave: 0,
    pulse: 0,
    magnet: 0,
    afterburner: 0,
    freeze: 0,
    missiles: 0,
    starshell: 0,
    arc: 0,
    autocannon: 0,
    meteors: 0,
    vortex: 0,
  };
  zeroed[target] = 20;
  return zeroed;
}

/** The full mutator pool. Order is stable (selection indexes into this). */
export const MUTATOR_POOL: Mutator[] = [
  {
    id: "blackout",
    name: "BLACKOUT",
    briefing: "No warnings tonight. They come from the dark.",
    difficultyFactor: 1.15,
    tags: ["visibility"],
    overrides: { telegraphRatio: 0 },
  },
  {
    id: "overdrive",
    name: "OVERDRIVE",
    briefing: "Everything moves faster today. So do the drops.",
    difficultyFactor: 1.05,
    tags: ["tempo"],
    overrides: { ambientRateScale: 1.22, droneSpeedScale: 1.2, pickupIntervalScale: 0.8 },
  },
  {
    id: "the-flood",
    name: "THE FLOOD",
    briefing: "No formations. Just an ocean of drones.",
    difficultyFactor: 0.9,
    tags: ["density"],
    overrides: { ambientRateScale: 1.6, formationIntervalScale: 3.0 },
  },
  {
    id: "wargames",
    name: "WARGAMES",
    briefing: "The ambient horde stands down. The set pieces don't.",
    difficultyFactor: 1.15,
    tags: ["density"],
    overrides: {
      ambientRateScale: 0.35,
      formationIntervalScale: 0.45,
      formationWeights: {
        line: 1,
        ring: 1,
        burst: 1,
        wall: 4,
        serpent: 3,
        pincer: 3,
        corners: 1,
        tightring: 1,
        swarm: 0.5,
        megawall: 2,
      },
    },
  },
  {
    id: "menagerie",
    name: "MENAGERIE",
    briefing: "The swarm keeps fusing into something worse.",
    difficultyFactor: 1.1,
    tags: ["assembly-freq"],
    overrides: { assemblyIntervalScale: 0.45, ambientRateScale: 0.85 },
  },
  {
    id: "lancer-doctrine",
    name: "LANCER DOCTRINE",
    briefing: "Every evolution rides the same spear.",
    difficultyFactor: 1.05,
    tags: ["assembly-kind"],
    overrides: { forceAssemblyKind: "lance" },
  },
  {
    id: "wheelhouse",
    name: "WHEELHOUSE",
    briefing: "Every evolution rolls in like a wrecking ball.",
    difficultyFactor: 1.05,
    tags: ["assembly-kind"],
    overrides: { forceAssemblyKind: "wheel" },
  },
  {
    id: "hunting-party",
    name: "HUNTING PARTY",
    briefing: "Every evolution hunts you down.",
    difficultyFactor: 1.1,
    tags: ["assembly-kind"],
    overrides: { forceAssemblyKind: "hunter" },
  },
  {
    id: "demolition-day",
    name: "DEMOLITION DAY",
    briefing: "Every evolution ends in shrapnel.",
    difficultyFactor: 1.05,
    tags: ["assembly-kind"],
    overrides: { forceAssemblyKind: "bomb" },
  },
  {
    id: "arsenal",
    name: "ARSENAL",
    briefing: "The board never runs dry today. Go loud.",
    difficultyFactor: 0.85,
    tags: ["pickup-rate"],
    overrides: { pickupIntervalScale: 0.5, ambientRateScale: 1.1 },
  },
  {
    id: "cryo-winter",
    name: "CRYO WINTER",
    briefing: "Every drop is a Cryo Field. Freeze the fleet.",
    difficultyFactor: 0.9,
    tags: ["monopower"],
    overrides: { powerWeights: monoPowerWeights("freeze") },
  },
  {
    id: "iron-barrage",
    name: "IRON BARRAGE",
    briefing: "Every drop is a Missile Swarm. Bring the barrage.",
    difficultyFactor: 0.95,
    tags: ["monopower"],
    overrides: { powerWeights: monoPowerWeights("missiles") },
  },
  {
    id: "singularity",
    name: "SINGULARITY",
    briefing: "The banned singularity is back for one day. Use it well.",
    difficultyFactor: 0.85,
    tags: ["monopower"],
    overrides: { extraPowerIds: ["vortex"], powerWeights: { vortex: 6 } },
  },
  {
    id: "the-pit",
    name: "THE PIT",
    briefing: "The arena just got smaller. So did your margin.",
    difficultyFactor: 1.2,
    tags: ["arena-size"],
    overrides: { viewScale: 0.72 },
  },
  {
    id: "giants",
    name: "GIANTS",
    briefing: "Fewer drones. Bigger ones. Slower, if you're patient.",
    difficultyFactor: 1.0,
    tags: ["drone-size"],
    // A zero-width clamp pins every drone (ambient AND formation members) to
    // one bigger size, same trick SPAWNER.scaleClamp already uses to pin the
    // default 0.9. It neutralizes the size-speed lerp (see droneSizeSpeedFactor
    // in enemies.ts) so "slower" comes from the explicit droneSpeedScale
    // below, not the built-in link. Bigger only: AGENTS.md flags smaller
    // drones as a phone-visibility regression.
    overrides: { scaleClamp: [1.6, 1.6], ambientRateScale: 0.7, droneSpeedScale: 0.85 },
  },
  {
    id: "minefield",
    name: "MINEFIELD",
    briefing: "The floor is mined today. Fly clean.",
    difficultyFactor: 1.1,
    tags: ["mines"],
    overrides: { mineIntervalScale: 0.35 },
  },
];

const MUTATOR_BY_ID = new Map(MUTATOR_POOL.map((m) => [m.id, m] as const));

// --- selection: deterministic from the UTC date, no server call ---

function utcDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return utcDateStr(new Date(Date.UTC(y, m - 1, d + days)));
}

function isUtcSunday(date: Date): boolean {
  return date.getUTCDay() === 0;
}

function shareTag(a: Mutator, b: Mutator): boolean {
  return a.tags.some((t) => b.tags.includes(t));
}

function poolIndex(seedKey: string): number {
  return hashString(seedKey) % MUTATOR_POOL.length;
}

/**
 * First mutator slot for a day. Steps forward once if the raw hash would
 * repeat the previous day's raw pick, a cheap O(1) proxy for "yesterday's
 * mutator" (it compares against yesterday's raw hash index, not its fully
 * resolved pick, so it can rarely miss a repeat after yesterday's own step;
 * acceptable for a hobby daily feature, and documented here on purpose).
 */
function pickFirst(dateStr: string): Mutator {
  const idx = poolIndex(`orion-mutator-${dateStr}-1`);
  const yesterdayIdx = poolIndex(`orion-mutator-${addUtcDays(dateStr, -1)}-1`);
  const finalIdx = idx === yesterdayIdx ? (idx + 1) % MUTATOR_POOL.length : idx;
  return MUTATOR_POOL[finalIdx];
}

/** Second Sunday slot: compatible with the first pick, distinct from it. */
function pickSecond(dateStr: string, first: Mutator): Mutator {
  const start = poolIndex(`orion-mutator-${dateStr}-2`);
  const yesterdayIdx = poolIndex(`orion-mutator-${addUtcDays(dateStr, -1)}-2`);
  for (let step = 0; step < MUTATOR_POOL.length; step++) {
    const idx = (start + step) % MUTATOR_POOL.length;
    const candidate = MUTATOR_POOL[idx];
    if (candidate.id === first.id || shareTag(candidate, first)) continue;
    if (idx === yesterdayIdx && step === 0) continue; // try the next slot first
    return candidate;
  }
  // unreachable with the current pool (always >=2 mutually-compatible
  // entries), but keep a safe, always-compatible fallback just in case.
  const fallback = MUTATOR_POOL.find((m) => m.id !== first.id && !shareTag(m, first));
  return fallback ?? first;
}

/** Today's (or any date's) mutator(s): 1 normally, 2 on UTC Sundays. */
export function getMutatorsForDate(date: Date): Mutator[] {
  const dateStr = utcDateStr(date);
  const first = pickFirst(dateStr);
  if (!isUtcSunday(date)) return [first];
  return [first, pickSecond(dateStr, first)];
}

export function getMutatorById(id: string): Mutator | undefined {
  return MUTATOR_BY_ID.get(id);
}

export function combinedDifficultyFactor(mutators: Mutator[]): number {
  return mutators.reduce((acc, m) => acc * m.difficultyFactor, 1);
}

// --- runtime application: getters the gameplay modules read from ---
//
// Set once before a mutated Daily Patrol world is created (main.ts,
// scripts/sim-test.ts) and cleared right after (or before any non-daily
// world), so Classic/Iron Rain/Training Ground never see an override.

let active: Mutator[] = [];

export function setActiveMutators(mutators: Mutator[]): void {
  active = mutators;
}

export function clearActiveMutators(): void {
  active = [];
}

export function getActiveMutators(): Mutator[] {
  return active;
}

function scaleOf(pick: (o: MutatorOverrides) => number | undefined): number {
  let result = 1;
  for (const m of active) {
    const v = pick(m.overrides);
    if (v !== undefined) result *= v;
  }
  return result;
}

function firstOf<T>(pick: (o: MutatorOverrides) => T | undefined): T | undefined {
  for (const m of active) {
    const v = pick(m.overrides);
    if (v !== undefined) return v;
  }
  return undefined;
}

export function mutatorAmbientRateScale(): number {
  return scaleOf((o) => o.ambientRateScale);
}

export function mutatorDroneSpeedScale(): number {
  return scaleOf((o) => o.droneSpeedScale);
}

export function mutatorTelegraphRatio(): number {
  return firstOf((o) => o.telegraphRatio) ?? SPAWNER.telegraph.ratio;
}

export function mutatorFormationIntervalScale(): number {
  return scaleOf((o) => o.formationIntervalScale);
}

export function mutatorFormationWeights(): Record<FormationKind, number> | null {
  return firstOf((o) => o.formationWeights) ?? null;
}

export function mutatorAssemblyIntervalScale(): number {
  return scaleOf((o) => o.assemblyIntervalScale);
}

export function mutatorForceAssemblyKind(): AssemblyKind | null {
  return firstOf((o) => o.forceAssemblyKind) ?? null;
}

export function mutatorPickupIntervalScale(): number {
  return scaleOf((o) => o.pickupIntervalScale);
}

/** Per-power weight overrides merged across active mutators (last wins per key). */
export function mutatorPowerWeights(): Partial<Record<PowerId, number>> {
  let merged: Partial<Record<PowerId, number>> = {};
  for (const m of active) {
    if (m.overrides.powerWeights) merged = { ...merged, ...m.overrides.powerWeights };
  }
  return merged;
}

export function mutatorExtraPowerIds(): PowerId[] {
  const set = new Set<PowerId>();
  for (const m of active) {
    for (const id of m.overrides.extraPowerIds ?? []) set.add(id);
  }
  return [...set];
}

export function mutatorScaleClamp(): readonly [number, number] | null {
  return firstOf((o) => o.scaleClamp) ?? null;
}

export function mutatorMineIntervalScale(): number {
  return scaleOf((o) => o.mineIntervalScale);
}

export function mutatorViewScale(): number {
  return scaleOf((o) => o.viewScale);
}
