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
// Round 5: the four forced-creature days (lancer-doctrine, wheelhouse,
// hunting-party, demolition-day) no longer conscript ambient drones into
// evolutions; they direct-spawn scripted, choreographed assemblies instead
// (see creatures.ts). Ambient no longer needs to feed conscription, so
// ambient-rate combine is back to plain multiplication (round 4's "max wins"
// exception is gone: nothing needs an ambient floor anymore).
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
  /** MENAGERIE only: direct-spawn choreography with the kind drawn per event
   * across all four kinds, instead of one forced kind (see creatures.ts
   * scheduleMenagerieEvent). Mutually exclusive with forceAssemblyKind in
   * practice (no mutator sets both), gates conscription off the same way. */
  menagerieChoreography?: boolean;
  /** Seeded [min,max] delay (seconds) before the very first creature-day
   * event, drawn once at world setup. Only set by mutators that want a
   * deliberate reveal beat instead of the default near-instant first event
   * (creatureTimer starts at 0 otherwise, see enemies.ts initSpawner). */
  firstCreatureDelayRange?: readonly [number, number];
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
  /** Caps the run's very first formation delay (seconds), so a zero-ambient
   * formation day (GREAT WALL, YEAR OF THE SERPENT) doesn't open on an
   * empty screen waiting for it. Only ever tightens the delay (Math.min),
   * never lengthens it. */
  firstFormationDelayCap?: number;
  /** Late-run pressure growth for a zero-ambient formation day (GREAT WALL,
   * YEAR OF THE SERPENT). Those days replace Classic's endless ambient leg
   * with a formation diet whose interval floors out after
   * SPAWNER.formations.intervalRampMinutes, so without this they plateau and
   * can be farmed for 20+ minutes (see JOURNAL.md 2026-08-11). Both knobs are
   * pure time-driven value changes, no extra seeded draws. */
  lateFormationGrowth?: LateFormationGrowth;
}

/** See MutatorOverrides.lateFormationGrowth. */
export interface LateFormationGrowth {
  /** Formation interval keeps shrinking past the ramp: interval / (1 + tighten * lateMinutes). */
  intervalTighten: number;
  /** Floor: never tighter than this fraction of the day's ramped interval. */
  intervalFloorScale: number;
  /** Run minutes before the late ambient trickle starts (identity stays pure early). */
  ambientStartMinutes: number;
  /** Ambient spawns/sec added per minute past ambientStartMinutes. */
  ambientPerMinute: number;
  /** Cap on that added ambient rate (spawns/sec). */
  ambientMax: number;
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
    subline: "No ambient drones at all. Only walls, mega walls, and pincers, faster than usual, released to hunt after their sweep. Deep in the run the walls keep coming faster and stray drones start leaking in.",
    // v3 (round 4): ambient to true zero ("purer" per Lucas's playtest note;
    // no more lone stray drones diluting the identity). Scripted members
    // still release to normal homing after their sweep (see handleFormations
    // release logic), so the organic accumulation everyone likes is intact;
    // only the ambient TRICKLE is gone. Lowered from v2's 1.15: with only
    // formation batches as kill targets (no continuous ambient throughput),
    // a real offensive run's total kill count over time drops, so the score
    // ceiling drops with it, even though the evasive (dodge-only, no-kill)
    // bot's SURVIVAL-based score actually rose (see JOURNAL.md: it reads as
    // easier for a bot that only grazes past slow-moving walls and never
    // attacks, a different profile from a scoring run and not trusted here).
    difficultyFactor: 0.85,
    // Replaces round-1 WARGAMES ("not sure what this is", illegible name).
    // Shares "density" with THE FLOOD (opposite identity, can't co-occur)
    // and "formation-kind" with YEAR OF THE SERPENT (only one forced-diet
    // formation day per Sunday).
    tags: ["formation-kind", "density"],
    overrides: {
      ambientRateScale: 0,
      formationIntervalScale: 0.5,
      formationWeights: { ...NO_WALL, wall: 4, pincer: 3, megawall: 2 },
      // Without this, an empty ambient field plus the natural first-formation
      // roll (5-8s) can silently fizzle the opening (see rollFormationKind's
      // minMinutes bypass) or just feel slow to arrive; cap it so the wall
      // shows up fast on a screen with nothing else on it.
      firstFormationDelayCap: 4,
      // v4 (2026-08-11 late-growth pass): the formation interval floors out at
      // ~2 min, and this day has no ambient leg to keep growing, so the late
      // run used to plateau (a shield-assisted dodge bot ran it 3.5 min, see
      // JOURNAL.md). Walls keep coming faster forever now, and from minute 4
      // a stray-drone trickle leaks in and grows, enough late pressure to end
      // a farm without touching the pure "walls only" opening.
      lateFormationGrowth: {
        intervalTighten: 0.18,
        intervalFloorScale: 0.45,
        ambientStartMinutes: 4,
        ambientPerMinute: 0.25,
        ambientMax: 1.5,
      },
    },
  },
  {
    id: "year-of-the-serpent",
    name: "YEAR OF THE SERPENT",
    briefing: "Every formation slithers today. Watch the trains.",
    subline: "No ambient drones at all. Only serpent trains, more of them, released to hunt after their sweep. Deep in the run the trains keep coming faster and stray drones start leaking in.",
    // v3 (round 4): same "ambient to true zero" treatment as GREAT WALL; see
    // that entry's comment. Eased slightly further than GREAT WALL's 0.85:
    // a serpent is a single-file train, so each formation offers a narrower
    // simultaneous kill cluster than a wall spanning the whole screen edge.
    difficultyFactor: 0.8,
    tags: ["formation-kind", "density"],
    overrides: {
      ambientRateScale: 0,
      formationIntervalScale: 0.45,
      formationWeights: { ...NO_WALL, serpent: 1 },
      firstFormationDelayCap: 4,
      // v4 (2026-08-11 late-growth pass): same plateau as GREAT WALL, same
      // fix. A serpent train is a narrower threat than a wall, so this day
      // leans slightly harder on the late ambient trickle to fill the arena.
      lateFormationGrowth: {
        intervalTighten: 0.18,
        intervalFloorScale: 0.45,
        ambientStartMinutes: 4,
        ambientPerMinute: 0.3,
        ambientMax: 1.8,
      },
    },
  },
  {
    id: "menagerie",
    name: "MENAGERIE",
    briefing: "The Zoo is open. Every cage, every kind. You never know what fuses next.",
    subline: "A brief calm, then hunters, lances, wheels, and bombs take turns, drawn at random with no repeats back to back. Ambient is a faint trickle, ordinary formations are gone, and late in the run two kinds sometimes fuse in at once.",
    // v3 (round 5, this fix): moved onto the direct-spawn choreography
    // engine like the four single-kind days (see creatures.ts
    // scheduleMenagerieEvent), replacing round 2's conscription-based
    // "ambient thin + evolutions frequent" tuning. Root cause of the old
    // version's "just drones as usual" opening: conscription needs the
    // ambient crowd to build mass before anything can fuse, so the first
    // real creature could take well past a minute to show up.
    // v4 (2026-08-10, density pass): live feedback the same day ("a minute
    // in, still not a lot of enemies") meant the v3 pacing above was too
    // sparse; cadence tightened (see CREATURE_DAYS.menagerie) until events
    // regularly outlast the gap to the next one, producing real overlap
    // (2+ creatures live/forming at once by mid-run) instead of one lone
    // animal at a time. The extra pressure moved the evasive-bot survival
    // ratio down from WHEELHOUSE's territory to LANCER DOCTRINE's, so the
    // factor follows: 1.1 -> 0.95.
    difficultyFactor: 0.95,
    tags: ["assembly-kind"],
    overrides: {
      menagerieChoreography: true,
      ambientRateScale: 0.3, // density pass (2026-08-10): raised from 0.15, the thinner trickle still read dead between creatures
      formationIntervalScale: 30,
      firstCreatureDelayRange: [8, 12], // the screenshot moment: a beat of quiet, then the first creature bursts in
    },
  },
  {
    id: "lancer-doctrine",
    name: "LANCER DOCTRINE",
    briefing: "Broadsides only. Weave the volley or eat the spear.",
    subline: "Salvos of parallel lance bars sweep in from one edge in sequence. No ambient swarm, no ordinary formations: the artillery is the whole day.",
    // v3 (round 5): direct-spawn choreography replaces conscription; see
    // creatures.ts. The evasive bot's score median came out roughly at
    // baseline for the volley rhythm; see JOURNAL.md for all four numbers.
    difficultyFactor: 0.95,
    tags: ["assembly-kind"],
    overrides: { forceAssemblyKind: "lance", ambientRateScale: 0, formationIntervalScale: 30 },
  },
  {
    id: "wheelhouse",
    name: "WHEELHOUSE",
    briefing: "Crossing traffic only. Survive the intersection.",
    subline: "Wheels roll through in lanes from alternating sides, Frogger-style. No ambient swarm, no ordinary formations: the traffic is the whole day.",
    // See LANCER DOCTRINE's comment for the round-5 rationale; the evasive
    // bot's score median came in highest of the four (lanes give the most
    // room to graze safely while still crossing danger).
    difficultyFactor: 1.0,
    tags: ["assembly-kind"],
    overrides: { forceAssemblyKind: "wheel", ambientRateScale: 0, formationIntervalScale: 30 },
  },
  {
    id: "hunting-party",
    name: "HUNTING PARTY",
    briefing: "Wolf packs only. You are the prey today.",
    subline: "Waves of hunters close in from different edges and converge, growing in size and frequency. No ambient swarm, no ordinary formations: the hunt is the whole day.",
    // See LANCER DOCTRINE's comment for the round-5 rationale; the evasive
    // bot's score median came in lowest of the four here (packs close in and
    // die one at a time rather than sweeping through in a batch).
    difficultyFactor: 0.75,
    tags: ["assembly-kind"],
    overrides: { forceAssemblyKind: "hunter", ambientRateScale: 0, formationIntervalScale: 30 },
  },
  {
    id: "demolition-day",
    name: "DEMOLITION DAY",
    briefing: "Area denial only. The floor is always about to explode.",
    subline: "Bomb slabs deploy continuously and detonate into shrapnel, crowding the arena over time. No ambient swarm, no ordinary formations: the minefield is the whole day.",
    // See LANCER DOCTRINE's comment for the round-5 rationale; the evasive
    // bot's score median came in highest of the four here (a fragmented
    // shrapnel burst offers the most simultaneous graze surface).
    difficultyFactor: 0.9,
    tags: ["assembly-kind"],
    overrides: { forceAssemblyKind: "bomb", ambientRateScale: 0, formationIntervalScale: 30 },
  },
  {
    id: "titanfall",
    name: "TITANFALL",
    briefing: "Fewer evolutions today. Each one is a titan.",
    subline: "Evolutions are much rarer, only one active at a time, and roughly twice the usual size.",
    difficultyFactor: 1.1,
    // Excludes the forced-kind days AND MENAGERIE (both "assembly-kind" as
    // of round 5's MENAGERIE rebuild): this is a conscription frequency AND
    // scale change, so it can't stack sensibly with any direct-spawn day.
    tags: ["assembly-kind"],
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
    // checked against server/validate.mjs's MAX_KILLS_PER_SEC (raised 12 to 20
    // on 2026-08-11 for the late-growth pass) via the
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

/**
 * Launch gate (UTC date string, obvious place to find/change it). Any UTC
 * date strictly before this one resolves to no mutators at all (see the
 * early return below): vanilla daily, no briefing card, no medal
 * thresholds/UI/share lines (main.ts/ui.ts key all of that off an empty
 * mutator list). From this date onward, selection below runs as normal.
 *
 * Live from 2026-08-10 (Lucas's call): a handful of pilots flew that UTC
 * day's vanilla daily before the feature shipped, so today's board mixes
 * vanilla and mutator flights. Accepted tradeoff, not a bug.
 *
 * The ?mutator= preview override (main.ts) bypasses this gate on purpose
 * where it's still reachable (see PREVIEW_MUTATORS there: dev-only since
 * the same change that moved this date up).
 *
 * This only suppresses; it never shifts. pickFirst/pickSecond below are
 * unconditional functions of the date string, so which mutator lands on
 * which future date is unaffected by this gate.
 */
export const MUTATORS_START_DATE = "2026-08-10";

/** Today's (or any date's) mutator(s): 1 normally, 2 on UTC Sundays. */
export function getMutatorsForDate(date: Date): Mutator[] {
  const dateStr = utcDateStr(date);
  if (dateStr < MUTATORS_START_DATE) return [];
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

/**
 * Ambient rate combine rule: plain multiplicative, same as every other
 * scale knob. Round 4 special-cased this (a "max wins" rule) because forced-
 * creature days conscripted members FROM the ambient pool, so zero ambient
 * from a paired formation day could starve their conscription floor. Round
 * 5 removed conscription from creature days entirely (they direct-spawn
 * choreographed assemblies instead, see creatures.ts), so there's no floor
 * left to protect: a zero-ambient formation day paired with a now-also-
 * near-zero-ambient creature day just multiplies down to near zero, which is
 * exactly what both days want.
 */
export function mutatorAmbientRateScale(): number {
  return scaleOf((o) => o.ambientRateScale);
}

/** Caps the run's very first formation delay (seconds); null on ordinary days. */
export function mutatorFirstFormationDelayCap(): number | null {
  return firstOf((o) => o.firstFormationDelayCap) ?? null;
}

/** Late-run growth for a zero-ambient formation day; null on every other day. */
export function mutatorLateFormationGrowth(): LateFormationGrowth | null {
  return firstOf((o) => o.lateFormationGrowth) ?? null;
}

/**
 * Extra formation-interval tightening for a plateau-prone formation day, as a
 * multiplier on the already-ramped interval (1 on every ordinary day).
 */
export function mutatorLateFormationIntervalScale(minutes: number): number {
  const growth = mutatorLateFormationGrowth();
  if (growth === null) return 1;
  const late = Math.max(0, minutes - SPAWNER.formations.intervalRampMinutes);
  return Math.max(growth.intervalFloorScale, 1 / (1 + growth.intervalTighten * late));
}

/**
 * Late ambient trickle (spawns/sec) added on a zero-ambient formation day, so
 * the late run can't be farmed on a pure formation diet. Zero before
 * ambientStartMinutes and on every day that doesn't set the override, so early
 * identity ("no ambient drones at all") is untouched.
 */
export function mutatorLateAmbientRate(minutes: number): number {
  const growth = mutatorLateFormationGrowth();
  if (growth === null) return 0;
  const late = Math.max(0, minutes - growth.ambientStartMinutes);
  return Math.min(growth.ambientMax, growth.ambientPerMinute * late);
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

/** MENAGERIE's mixed-kind direct-spawn choreography (see creatures.ts). */
export function mutatorMenagerieActive(): boolean {
  return firstOf((o) => o.menagerieChoreography) ?? false;
}

/** Seeded first-creature-event delay range; null on every ordinary day (and
 * on the four single-kind creature days, which keep their instant open). */
export function mutatorFirstCreatureDelayRange(): readonly [number, number] | null {
  return firstOf((o) => o.firstCreatureDelayRange) ?? null;
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
