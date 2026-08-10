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
// a value is used; the draw sequence itself is untouched. Wind (SOLAR WIND)
// and the pickup homing pull (MAGNETIC FIELD) are both pure per-frame
// kinematics with zero RNG involved, so they're safe for the same reason.
//
// Sundays (UTC) fly 2 compatible mutators (tagged so incompatible pairs,
// e.g. two arena-size or two monopower days, can never co-occur). Overrides
// combine: multiplicative knobs (rates/scales) multiply together, additive
// knobs (wind/magnet strength) sum, and difficulty factors multiply for the
// day's medal thresholds.
//
// None of these touch SCORING (src/config.ts); see JOURNAL.md for the
// server/validate.mjs ceiling analysis (round 1 + round 2, incl. OVERCHARGE)
// that cleared the whole pool.

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
  /** Multiplies SPAWNER.telegraph.duration (the on-screen warning time). */
  telegraphDurationScale?: number;
  /** Multiplies the computed formation interval (min & max). */
  formationIntervalScale?: number;
  /** Replaces the formation weight table outright for the day. */
  formationWeights?: Record<FormationKind, number>;
  /** Multiplies the assembly (evolution) event interval. */
  assemblyIntervalScale?: number;
  /** Forces every assembly (scheduled + crowd-triggered) to one kind. */
  forceAssemblyKind?: AssemblyKind;
  /** Multiplies the rolled assembly member count (both scheduled + crowd). */
  assemblyCountScale?: number;
  /** Replaces ASSEMBLY.maxConcurrent for the day. */
  assemblyMaxConcurrent?: number;
  /** Multiplies the pickup drop interval (lower = faster drops). */
  pickupIntervalScale?: number;
  /** Per-power weight overrides merged over POWER_SPAWN_WEIGHTS. */
  powerWeights?: Partial<Record<PowerId, number>>;
  /** Extra power ids added to the day's drop pool (e.g. unbenching vortex). */
  extraPowerIds?: PowerId[];
  /** Multiplies power effect magnitudes (radius/count/etc; see powers.ts). */
  powerAmpScale?: number;
  /** Replaces SPAWNER.scaleClamp for the day. */
  scaleClamp?: readonly [number, number];
  /** Multiplies SPAWNER.ambientSoftCap (the loose-drone relief valve). */
  ambientSoftCapScale?: number;
  /** Multiplies SPAWNER.clumpMax (ambient packs gather in bigger/smaller blobs). */
  clumpMaxScale?: number;
  /** Multiplies the mine spawn interval (min & max). */
  mineIntervalScale?: number;
  /** Multiplies the arena view size (world.viewW/viewH); <1 shrinks it. */
  viewScale?: number;
  /** Constant crosswind strength (units/sec); direction comes from the date
   * hash, not the run-seeded streams (see mutatorWindVector below). */
  windStrength?: number;
  /** Slow ambient homing pull toward the ship, added on top of normal pickup
   * drift (units/sec); 0/undefined = no pull. */
  pickupMagnetStrength?: number;
  /** Cosmetic only: renderer shows a subtle red vignette (RED ALERT). */
  redTint?: boolean;
  /** STARFALL only: turns on the environmental meteor rain (see starfall.ts). */
  meteorRainActive?: boolean;
}

export interface Mutator {
  id: string;
  name: string;
  /** One-line, Red Rising-flavored mission briefing shown before launch. */
  briefing: string;
  /** Second, plain-language line: what mechanically changed, no flavor. */
  subline: string;
  /** Multiplies the day's medal score thresholds (>1 = harder, <1 = easier/fun). */
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

const NO_WALL: Record<FormationKind, number> = {
  line: 0,
  ring: 0,
  burst: 0,
  wall: 0,
  serpent: 0,
  pincer: 0,
  corners: 0,
  tightring: 0,
  swarm: 0,
  megawall: 0,
};

/** The full mutator pool. Order is stable (selection indexes into this). */
export const MUTATOR_POOL: Mutator[] = [
  {
    id: "blackout",
    name: "BLACKOUT",
    briefing: "The sirens are slow tonight.",
    subline: "On-screen spawn warnings are much shorter (0.5s instead of 1.4s). Everything else is normal.",
    difficultyFactor: 1.1,
    tags: ["visibility"],
    // v2 (round 2): pure ratio=0 ("everything sneaks, no warning at all")
    // tested too lethal for a dodge-only game: the evasive-bot harness in
    // sim-test showed a real survival hit vs baseline. Keeping telegraphs on
    // but cutting their warning time to ~1/3 preserves "vigilance day" while
    // staying a fair fight: you still get a heads-up, just a short one.
    overrides: { telegraphDurationScale: 0.36 },
  },
  {
    id: "red-alert",
    name: "RED ALERT",
    briefing: "Klaxons up. Everything moves faster except you.",
    subline: "Spawn rate, formation frequency, and pickup drops all sped up. Drone speed is unchanged.",
    difficultyFactor: 1.05,
    tags: ["tempo"],
    // v2 (round 2, was OVERDRIVE): tempo, not twitch. droneSpeedScale is
    // deliberately absent so drones keep their normal zombie-shamble speed;
    // the pressure is more threats arriving faster, not faster threats.
    overrides: {
      ambientRateScale: 1.25,
      formationIntervalScale: 0.75,
      pickupIntervalScale: 0.75,
      redTint: true,
    },
  },
  {
    id: "the-flood",
    name: "THE FLOOD",
    briefing: "No formations. Just a current of drones.",
    subline: "Formations almost never happen. Ambient density is up, but arrives in clearer packs with lanes between them.",
    difficultyFactor: 0.95,
    tags: ["density"],
    // v2 (round 2): Lucas's playability concern was legitimate. Toned the
    // raw ambient rate down from 1.6 to 1.3, added a lower soft cap on loose
    // drones (real lanes instead of the default 130-drone ceiling) and bigger
    // clump grouping (same total density, gathered into fewer/bigger blobs
    // with more open space between them), plus a touch more support.
    overrides: {
      ambientRateScale: 1.3,
      formationIntervalScale: 3.0,
      ambientSoftCapScale: 0.7,
      clumpMaxScale: 1.6,
      pickupIntervalScale: 0.85,
    },
  },
  {
    id: "great-wall",
    name: "GREAT WALL",
    briefing: "Today the enemy builds walls. Find the gaps.",
    subline: "Ambient spawns way down. Formations come faster and are always walls, mega walls, or pincers.",
    difficultyFactor: 1.15,
    // Replaces round-1 WARGAMES ("not sure what this is", illegible name).
    // Shares "density" with THE FLOOD (opposite identity, can't co-occur)
    // and "formation-kind" with YEAR OF THE SERPENT (only one forced-diet
    // formation day per Sunday).
    tags: ["formation-kind", "density"],
    overrides: {
      ambientRateScale: 0.4,
      formationIntervalScale: 0.5,
      formationWeights: { ...NO_WALL, wall: 4, pincer: 3, megawall: 2 },
    },
  },
  {
    id: "year-of-the-serpent",
    name: "YEAR OF THE SERPENT",
    briefing: "Every formation slithers today. Watch the trains.",
    subline: "Ambient spawns way down. Every formation is a serpent train, more of them.",
    difficultyFactor: 1.1,
    tags: ["formation-kind", "density"],
    overrides: {
      ambientRateScale: 0.4,
      formationIntervalScale: 0.45,
      formationWeights: { ...NO_WALL, serpent: 1 },
    },
  },
  {
    id: "menagerie",
    name: "MENAGERIE",
    briefing: "The swarm keeps fusing into hunters and worse.",
    subline: "Ambient density cut roughly in half. Evolutions form more than twice as often.",
    difficultyFactor: 1.2,
    tags: ["assembly-freq"],
    // v2 (round 2): sharpened so it reads in the first minute. Ambient down
    // hard (was 0.85) so the thinner swarm makes the more-frequent (was
    // 0.45) evolutions the obvious main event, not background noise.
    overrides: { assemblyIntervalScale: 0.35, ambientRateScale: 0.55 },
  },
  {
    id: "lancer-doctrine",
    name: "LANCER DOCTRINE",
    briefing: "Every evolution rides the same spear.",
    subline: "Every evolution (scheduled or crowd-triggered) forms a lance.",
    difficultyFactor: 1.05,
    tags: ["assembly-kind"],
    overrides: { forceAssemblyKind: "lance" },
  },
  {
    id: "wheelhouse",
    name: "WHEELHOUSE",
    briefing: "Every evolution rolls in like a wrecking ball.",
    subline: "Every evolution (scheduled or crowd-triggered) forms a wheel.",
    difficultyFactor: 1.05,
    tags: ["assembly-kind"],
    overrides: { forceAssemblyKind: "wheel" },
  },
  {
    id: "hunting-party",
    name: "HUNTING PARTY",
    briefing: "Every evolution hunts you down.",
    subline: "Every evolution (scheduled or crowd-triggered) forms a hunter.",
    difficultyFactor: 1.1,
    tags: ["assembly-kind"],
    overrides: { forceAssemblyKind: "hunter" },
  },
  {
    id: "demolition-day",
    name: "DEMOLITION DAY",
    briefing: "Every evolution ends in shrapnel.",
    subline: "Every evolution (scheduled or crowd-triggered) forms a bomb.",
    difficultyFactor: 1.05,
    tags: ["assembly-kind"],
    overrides: { forceAssemblyKind: "bomb" },
  },
  {
    id: "titanfall",
    name: "TITANFALL",
    briefing: "Fewer evolutions today. Each one is a titan.",
    subline: "Evolutions are much rarer, only one active at a time, and roughly twice the usual size.",
    difficultyFactor: 1.1,
    // Excludes both the forced-kind days (assembly-kind) and MENAGERIE
    // (assembly-freq) per Sam's ask: this is a frequency AND scale change,
    // so it can't stack sensibly with either family.
    tags: ["assembly-kind", "assembly-freq"],
    overrides: { assemblyIntervalScale: 2.4, assemblyCountScale: 1.8, assemblyMaxConcurrent: 1 },
  },
  {
    id: "arsenal",
    name: "ARSENAL",
    briefing: "The board never runs dry today. Go loud.",
    subline: "Pickup drops roughly twice as often, ambient density up slightly.",
    difficultyFactor: 0.85,
    tags: ["pickup-rate"],
    overrides: { pickupIntervalScale: 0.5, ambientRateScale: 1.1 },
  },
  {
    id: "overcharge",
    name: "OVERCHARGE",
    briefing: "Same drops. Every power just got a lot louder.",
    subline: "Drop rate is normal, but every power's blast radius, count, or duration is amplified.",
    difficultyFactor: 0.8,
    tags: ["power-amp"],
    // Drop RATE is deliberately untouched (per Sam's ask); only magnitude.
    // See powers.ts for exactly which dimension gets amplified per power;
    // checked against server/validate.mjs's MAX_KILLS_PER_SEC (12) via the
    // same invulnerable-observer harness used for round 1 (see JOURNAL.md).
    overrides: { powerAmpScale: 1.4 },
  },
  {
    id: "cryo-winter",
    name: "CRYO WINTER",
    briefing: "Every drop is a Cryo Field. Freeze the fleet.",
    subline: "Every pickup is a Cryo Field.",
    difficultyFactor: 0.9,
    tags: ["monopower"],
    overrides: { powerWeights: monoPowerWeights("freeze") },
  },
  {
    id: "iron-barrage",
    name: "IRON BARRAGE",
    briefing: "Every drop is a Missile Swarm. Bring the barrage.",
    subline: "Every pickup is a Missile Swarm.",
    difficultyFactor: 0.95,
    tags: ["monopower"],
    overrides: { powerWeights: monoPowerWeights("missiles") },
  },
  {
    id: "singularity",
    name: "SINGULARITY",
    briefing: "The banned singularity is back for one day. Use it well.",
    subline: "Vortex (normally benched) drops often today.",
    difficultyFactor: 0.85,
    tags: ["monopower"],
    overrides: { extraPowerIds: ["vortex"], powerWeights: { vortex: 6 } },
  },
  {
    id: "starfall",
    name: "STARFALL",
    briefing: "The sky itself is falling. Shields up, pilot.",
    subline: "A constant meteor rain falls all run, each impact flashed by a ground reticle first. The only drop is Shield, a little more often.",
    difficultyFactor: 0.8,
    // v3 (round 3, replaced the monopower-Meteor-Storm version): now an
    // environmental event day, not a power day, but it still zeroes the
    // drop pool down to one power (see starfall.ts + gameState.ts
    // handleShipBlastCollisions), so it keeps the "monopower" exclusion
    // (can't stack with CRYO WINTER/IRON BARRAGE/SINGULARITY on a Sunday).
    tags: ["monopower"],
    overrides: {
      powerWeights: monoPowerWeights("shield"),
      pickupIntervalScale: 0.8,
      meteorRainActive: true,
    },
  },
  {
    id: "the-pit",
    name: "THE PIT",
    briefing: "The arena just got smaller. So did your margin.",
    subline: "The arena is about 30% smaller in both dimensions.",
    difficultyFactor: 1.2,
    tags: ["arena-size"],
    overrides: { viewScale: 0.72 },
  },
  {
    id: "giants",
    name: "GIANTS",
    briefing: "Fewer drones. Bigger ones. Slower, if you're patient.",
    subline: "Every drone is bigger and a bit slower. Fewer of them spawn.",
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
    subline: "Mines appear roughly three times as often.",
    difficultyFactor: 1.1,
    tags: ["mines"],
    overrides: { mineIntervalScale: 0.35 },
  },
  {
    id: "solar-wind",
    name: "SOLAR WIND",
    briefing: "A steady current runs through the arena today.",
    subline: "A constant crosswind pushes your ship and every drone the same way, all day.",
    difficultyFactor: 1.1,
    // Also excluded from THE PIT: a shrunk arena plus a constant crosswind
    // pinning you against the (now closer) walls tested as too much at once.
    tags: ["physics", "arena-size"],
    overrides: { windStrength: 2.2 },
  },
  {
    id: "magnetic-field",
    name: "MAGNETIC FIELD",
    briefing: "The pickups want to find you today.",
    subline: "Pickups slowly drift toward your ship all day, on top of their normal wander.",
    difficultyFactor: 0.85,
    tags: ["pickup-behavior"],
    overrides: { pickupMagnetStrength: 1.4 },
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
let activeWindVector: { x: number; y: number } | null = null;

/**
 * `date` is only used to derive SOLAR WIND's direction (see below); it does
 * NOT draw from the run-seeded rand()/scheduleRand() streams: the angle is
 * a pure hash of the UTC date string, the same "deterministic from the date,
 * no stream draw" trick the mutator selection above already uses. That keeps
 * the whole feature outside the seeded-draw-count discipline entirely,
 * rather than resting on "one fixed draw at world setup" being threaded
 * correctly through every call site.
 */
export function setActiveMutators(mutators: Mutator[], date: Date = new Date()): void {
  active = mutators;
  const strength = sumOf((o) => o.windStrength);
  if (strength > 0) {
    const angle = (hashString(`orion-wind-${utcDateStr(date)}`) % 10007) / 10007 * Math.PI * 2;
    activeWindVector = { x: Math.cos(angle) * strength, y: Math.sin(angle) * strength };
  } else {
    activeWindVector = null;
  }
}

export function clearActiveMutators(): void {
  active = [];
  activeWindVector = null;
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

function sumOf(pick: (o: MutatorOverrides) => number | undefined): number {
  let result = 0;
  for (const m of active) {
    const v = pick(m.overrides);
    if (v !== undefined) result += v;
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

export function mutatorTelegraphDurationScale(): number {
  return scaleOf((o) => o.telegraphDurationScale);
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

export function mutatorAssemblyCountScale(): number {
  return scaleOf((o) => o.assemblyCountScale);
}

export function mutatorAssemblyMaxConcurrent(): number | null {
  return firstOf((o) => o.assemblyMaxConcurrent) ?? null;
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

export function mutatorPowerAmpScale(): number {
  return scaleOf((o) => o.powerAmpScale);
}

export function mutatorScaleClamp(): readonly [number, number] | null {
  return firstOf((o) => o.scaleClamp) ?? null;
}

export function mutatorAmbientSoftCapScale(): number {
  return scaleOf((o) => o.ambientSoftCapScale);
}

/**
 * Whether any active mutator actually overrides the ambient soft cap. The
 * base game never wires the cap into a spawn call (it's a relief valve that
 * was defined in config but never plumbed through); enforcing it only when
 * a mutator explicitly asks for it (THE FLOOD) keeps ordinary Classic/Iron
 * Rain/undated-Daily behavior byte-for-byte unchanged.
 */
export function mutatorAmbientSoftCapActive(): boolean {
  return active.some((m) => m.overrides.ambientSoftCapScale !== undefined);
}

export function mutatorClumpMaxScale(): number {
  return scaleOf((o) => o.clumpMaxScale);
}

export function mutatorMineIntervalScale(): number {
  return scaleOf((o) => o.mineIntervalScale);
}

export function mutatorViewScale(): number {
  return scaleOf((o) => o.viewScale);
}

/** Constant crosswind (units/sec) for the day, or null on ordinary days. */
export function mutatorWindVector(): { x: number; y: number } | null {
  return activeWindVector;
}

export function mutatorPickupMagnetStrength(): number {
  return sumOf((o) => o.pickupMagnetStrength);
}

export function mutatorRedTint(): boolean {
  return firstOf((o) => o.redTint) ?? false;
}

/** STARFALL only: whether the environmental meteor rain should be running. */
export function mutatorMeteorRainActive(): boolean {
  return active.some((m) => m.overrides.meteorRainActive);
}
