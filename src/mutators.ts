// Daily Mutators: a named, deterministic set of config overrides for Daily
// Patrol, derived from the UTC date (same day boundary as the daily seed,
// see `dailySeed()` in main.ts). Every pilot on the same patrol day gets the
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
// Wind heading is hashed from the UTC date plus a segment index and shifts
// during the run (same schedule for every pilot); it is not a constant
// per-day vector.
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
import { BLACKOUT, SPAWNER, type FormationKind, type PowerId } from "./config";

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
  /** Crosswind strength (units/sec); heading is hashed from the UTC date
   * plus a segment index, not the run-seeded streams (see mutatorWindVector). */
  windStrength?: number;
  /** Slow ambient homing pull toward the ship, added on top of normal pickup
   * drift (units/sec); 0/undefined = no pull. */
  pickupMagnetStrength?: number;
  /** Cosmetic only: renderer shows a subtle red vignette (RED ALERT). */
  redTint?: boolean;
  /** BLACKOUT only: time-driven lights-out pulse (vignette + dim telegraphs). */
  blackoutPulse?: boolean;
  /** STARFALL only: turns on the environmental meteor rain (see starfall.ts). */
  meteorRainActive?: boolean;
  /** THE FLOOD only: skip handleFormations entirely for the day. */
  formationsDisabled?: boolean;
  /** THE FLOOD only: timed directional surge waves (see flood.ts). */
  floodSurgeActive?: boolean;
  /** Floor fed to the ambient escalate() clock so the opening is already
   * dense. 0/undefined = real minutes. Does not move drone speed or scoring. */
  ambientMinutesFloor?: number;
  /** Multiplies graze point pay for the day (1 = unchanged). */
  grazePointsScale?: number;
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
  /**
   * UTC `YYYY-MM-DD`: the first day this entry can be selected. Every one of
   * the 22 entries below is pinned to `MUTATORS_START_DATE` so they behave
   * exactly as before this field existed. This is what makes appending a
   * 23rd entry safe later: selection indexes into the pool of entries
   * eligible for the requested date (see `eligiblePool` below), never the
   * live pool as a whole, so a mutator that isn't eligible yet can't shift
   * any past day's pick. Set on the day a new mutator ships; never edited
   * afterward (see AGENTS.md "Adding a Daily Mutator").
   */
  availableFrom: string;
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

/**
 * Shared pickup-drop slowdown for the choreography days (2026-08-12 mid-ramp
 * densify). Daily Patrol runs the whole drop schedule at
 * PICKUPS.dailyIntervalScale (0.7x intervals) because it has no refill floor;
 * on a creature day that compensation overshot badly. Those days have no
 * ambient swarm and no ordinary formations, so between choreographed events
 * there was nothing to spend a power on, and drops kept arriving 30% faster
 * than normal: Lucas could sit on a full board of banked powers through the
 * whole mid-game (live feedback, WHEELHOUSE, 2026-08-12).
 *
 * 1.3 x 0.7 = 0.91, i.e. these days land just under the ordinary non-daily
 * drop rate. Deliberately not a starve: the powers are the counterplay to a
 * dense field, they just stop stockpiling faster than the day can drain them.
 */
const CREATURE_DAY_PICKUP_SCALE = 1.3;

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

/**
 * Launch gate (UTC date string, obvious place to find/change it). Any UTC
 * date strictly before this one resolves to no mutators at all (see the
 * early return in `getMutatorsForDateFromPool` below): vanilla daily, no
 * briefing card, no medal thresholds/UI/share lines (main.ts/ui.ts key all
 * of that off an empty mutator list). From this date onward, selection
 * below runs as normal. Also doubles as the shared `availableFrom` for
 * every entry below: all 22 went live on day one, so they're all eligible
 * from the same date the gate opens (see `Mutator.availableFrom`).
 *
 * Live from 2026-08-10 (Lucas's call): a handful of pilots flew that UTC
 * day's vanilla daily before the feature shipped, so today's board mixes
 * vanilla and mutator flights. Accepted tradeoff, not a bug.
 *
 * The ?mutator= preview override (main.ts) bypasses this gate on purpose
 * where it's still reachable (see PREVIEW_MUTATORS there: dev-only since
 * the same change that moved this date up).
 *
 * This only suppresses; it never shifts. `pickFirst`/`pickSecond` below are
 * unconditional functions of the date string, so which mutator lands on
 * which future date is unaffected by this gate.
 */
export const MUTATORS_START_DATE = "2026-08-10";

/** The full mutator pool. Order is stable (selection indexes into the
 * subset of this pool eligible for a given date, see `eligiblePool`). */
export const MUTATOR_POOL: Mutator[] = [
  {
    id: "blackout",
    name: "BLACKOUT",
    briefing: "The grid flickers. When the lights cut, dodge blind.",
    subline: "Spawn warnings stay short. Every few seconds the lights die and the warnings nearly vanish.",
    difficultyFactor: 1.1,
    tags: ["visibility"],
    availableFrom: MUTATORS_START_DATE,
    // v3 (2026-08-26): skip-the-card pilots could not tell this day from a
    // normal one. Keep the short-warning retune (ratio=0 was too lethal) and
    // add a deterministic lights-out pulse so the identity is visible in the
    // first 10 seconds. No extra seeded draws: pulse is a function of time.
    overrides: { telegraphDurationScale: 0.36, blackoutPulse: true },
  },
  {
    id: "red-alert",
    name: "RED ALERT",
    briefing: "Klaxons up. Everything moves faster except you.",
    subline: "Spawn rate, formation frequency, and pickup drops all sped up. Drone speed is unchanged.",
    difficultyFactor: 1.05,
    tags: ["tempo"],
    availableFrom: MUTATORS_START_DATE,
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
    briefing: "No formations. Just the current. It only runs one way.",
    subline: "Formations are off. Packs surge in from one edge in timed waves, lanes between them.",
    difficultyFactor: 0.95,
    tags: ["density"],
    availableFrom: MUTATORS_START_DATE,
    // v4 (2026-08-27): v3 slider push still read as vanilla (#19). Formations
    // actually off, opening already at the 1-min density clock, identity is
    // the directional surge module (flood.ts). Ambient trickle fills gaps.
    overrides: {
      formationsDisabled: true,
      floodSurgeActive: true,
      ambientRateScale: 0.45,
      ambientMinutesFloor: 1.0,
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
    availableFrom: MUTATORS_START_DATE,
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
    availableFrom: MUTATORS_START_DATE,
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
    subline: "A brief calm, then hunters, lances, wheels, and bombs take turns, drawn at random with no repeats back to back. Ambient is a faint trickle, ordinary formations are gone, and from a couple of minutes in two kinds usually fuse in at once. Power drops come a little slower than a usual Daily.",
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
    availableFrom: MUTATORS_START_DATE,
    overrides: {
      menagerieChoreography: true,
      ambientRateScale: 0.3, // density pass (2026-08-10): raised from 0.15, the thinner trickle still read dead between creatures
      formationIntervalScale: 30,
      firstCreatureDelayRange: [8, 12], // the screenshot moment: a beat of quiet, then the first creature bursts in
      pickupIntervalScale: CREATURE_DAY_PICKUP_SCALE,
    },
  },
  {
    id: "lancer-doctrine",
    name: "LANCER DOCTRINE",
    briefing: "Broadsides only. Weave the volley or eat the spear.",
    subline: "Salvos of parallel lance bars sweep in from one edge in sequence, more of them every minute past the first. No ambient swarm, no ordinary formations: the artillery is the whole day. Power drops come a little slower than a usual Daily.",
    // v3 (round 5): direct-spawn choreography replaces conscription; see
    // creatures.ts. The evasive bot's score median came out roughly at
    // baseline for the volley rhythm; see JOURNAL.md for all four numbers.
    difficultyFactor: 0.95,
    tags: ["assembly-kind"],
    availableFrom: MUTATORS_START_DATE,
    overrides: {
      forceAssemblyKind: "lance",
      ambientRateScale: 0,
      formationIntervalScale: 30,
      pickupIntervalScale: CREATURE_DAY_PICKUP_SCALE,
    },
  },
  {
    id: "wheelhouse",
    name: "WHEELHOUSE",
    briefing: "Crossing traffic only. Survive the intersection.",
    subline: "Wheels roll through in lanes from alternating sides, Frogger-style. One lane at the open, then rush hour builds fast. No ambient swarm, no ordinary formations: the traffic is the whole day. Power drops come a little slower than a usual Daily.",
    // See LANCER DOCTRINE's comment for the round-5 rationale; the evasive
    // bot's score median came in highest of the four (lanes give the most
    // room to graze safely while still crossing danger).
    difficultyFactor: 1.0,
    tags: ["assembly-kind"],
    availableFrom: MUTATORS_START_DATE,
    overrides: {
      forceAssemblyKind: "wheel",
      ambientRateScale: 0,
      formationIntervalScale: 30,
      pickupIntervalScale: CREATURE_DAY_PICKUP_SCALE,
    },
  },
  {
    id: "hunting-party",
    name: "HUNTING PARTY",
    briefing: "Wolf packs only. They close in early.",
    subline: "Waves tighten after the first half minute. Threading a pack pays more than a usual graze. No ambient swarm, no ordinary formations: the hunt is the whole day.",
    // See LANCER DOCTRINE's comment for the round-5 rationale; the evasive
    // bot's score median came in lowest of the four here (packs close in and
    // die one at a time rather than sweeping through in a batch).
    difficultyFactor: 0.75,
    tags: ["assembly-kind"],
    availableFrom: MUTATORS_START_DATE,
    overrides: {
      forceAssemblyKind: "hunter",
      ambientRateScale: 0,
      formationIntervalScale: 30,
      pickupIntervalScale: CREATURE_DAY_PICKUP_SCALE,
      grazePointsScale: 1.5,
    },
  },
  {
    id: "demolition-day",
    name: "DEMOLITION DAY",
    briefing: "Area denial only. The floor is always about to explode.",
    subline: "Bomb slabs deploy continuously and detonate into shrapnel, crowding the arena fast after the first minute. No ambient swarm, no ordinary formations: the minefield is the whole day. Power drops come a little slower than a usual Daily.",
    // See LANCER DOCTRINE's comment for the round-5 rationale; the evasive
    // bot's score median came in highest of the four here (a fragmented
    // shrapnel burst offers the most simultaneous graze surface).
    difficultyFactor: 0.9,
    tags: ["assembly-kind"],
    availableFrom: MUTATORS_START_DATE,
    overrides: {
      forceAssemblyKind: "bomb",
      ambientRateScale: 0,
      formationIntervalScale: 30,
      pickupIntervalScale: CREATURE_DAY_PICKUP_SCALE,
    },
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
    availableFrom: MUTATORS_START_DATE,
    overrides: { assemblyIntervalScale: 2.4, assemblyCountScale: 1.8, assemblyMaxConcurrent: 1 },
  },
  {
    id: "arsenal",
    name: "ARSENAL",
    briefing: "The board never runs dry today. Go loud.",
    subline: "Pickup drops roughly twice as often, ambient density up slightly.",
    difficultyFactor: 0.85,
    tags: ["pickup-rate"],
    availableFrom: MUTATORS_START_DATE,
    overrides: { pickupIntervalScale: 0.5, ambientRateScale: 1.1 },
  },
  {
    id: "overcharge",
    name: "OVERCHARGE",
    briefing: "Same drops. Every power just got a lot louder.",
    subline: "Drop rate is normal, but every power's blast radius, count, or duration is amplified.",
    difficultyFactor: 0.8,
    tags: ["power-amp"],
    availableFrom: MUTATORS_START_DATE,
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
    briefing: "Every drop is a Cryo Field. Freeze the fleet, and the mines.",
    subline: "Ice freezes drones and mines. Ram the frozen ones to shatter them.",
    difficultyFactor: 0.9,
    tags: ["monopower"],
    availableFrom: MUTATORS_START_DATE,
    overrides: { powerWeights: monoPowerWeights("freeze") },
  },
  {
    id: "iron-barrage",
    name: "IRON BARRAGE",
    briefing: "Every drop is a Missile Swarm. Bring the barrage.",
    subline: "Every pickup is a Missile Swarm.",
    difficultyFactor: 0.95,
    tags: ["monopower"],
    availableFrom: MUTATORS_START_DATE,
    overrides: { powerWeights: monoPowerWeights("missiles") },
  },
  {
    id: "singularity",
    name: "SINGULARITY",
    briefing: "The banned singularity is back for one day. Use it well.",
    subline: "Vortex (normally benched) drops often today.",
    difficultyFactor: 0.85,
    tags: ["monopower"],
    availableFrom: MUTATORS_START_DATE,
    overrides: { extraPowerIds: ["vortex"], powerWeights: { vortex: 6 } },
  },
  {
    id: "starfall",
    name: "STARFALL",
    briefing: "The sky opens early. Shields are scarce.",
    subline: "Meteor rain from the first seconds. Shield is the only drop, and it is late.",
    difficultyFactor: 0.8,
    // v3 (round 3, replaced the monopower-Meteor-Storm version): now an
    // environmental event day, not a power day, but it still zeroes the
    // drop pool down to one power (see starfall.ts + gameState.ts
    // handleShipBlastCollisions), so it keeps the "monopower" exclusion
    // (can't stack with CRYO WINTER/IRON BARRAGE/SINGULARITY on a Sunday).
    tags: ["monopower"],
    availableFrom: MUTATORS_START_DATE,
    overrides: {
      powerWeights: monoPowerWeights("shield"),
      pickupIntervalScale: 1.4,
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
    availableFrom: MUTATORS_START_DATE,
    overrides: { viewScale: 0.72 },
  },
  {
    id: "giants",
    name: "GIANTS",
    briefing: "Fewer drones. Bigger ones. Slower, if you're patient.",
    subline: "Every drone is bigger and a bit slower. Fewer of them spawn.",
    difficultyFactor: 1.0,
    tags: ["drone-size"],
    availableFrom: MUTATORS_START_DATE,
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
    availableFrom: MUTATORS_START_DATE,
    overrides: { mineIntervalScale: 0.35 },
  },
  {
    id: "solar-wind",
    name: "SOLAR WIND",
    briefing: "The current shifts during the run. You'll get a warning.",
    subline: "A crosswind pushes your ship and every drone. The heading changes every half minute, with a short warning before each flip.",
    difficultyFactor: 1.1,
    // Also excluded from THE PIT: a shrunk arena plus a constant crosswind
    // pinning you against the (now closer) walls tested as too much at once.
    tags: ["physics", "arena-size"],
    availableFrom: MUTATORS_START_DATE,
    overrides: { windStrength: 2.2 },
  },
  {
    id: "magnetic-field",
    name: "MAGNETIC FIELD",
    briefing: "The pickups want to find you today.",
    subline: "Pickups slowly drift toward your ship all day, on top of their normal wander.",
    difficultyFactor: 0.85,
    tags: ["pickup-behavior"],
    availableFrom: MUTATORS_START_DATE,
    overrides: { pickupMagnetStrength: 1.4 },
  },
];

const MUTATOR_BY_ID = new Map(MUTATOR_POOL.map((m) => [m.id, m] as const));

// --- selection: deterministic from the civil date label, no server call ---

function addCivilDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** True when the YYYY-MM-DD label falls on a Sunday (civil calendar). */
function isSundayDateStr(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

function shareTag(a: Mutator, b: Mutator): boolean {
  return a.tags.some((t) => b.tags.includes(t));
}

function poolIndex(seedKey: string, length: number): number {
  return hashString(seedKey) % length;
}

/**
 * Entries eligible on a given patrol date label, preserving pool order. Selection
 * below indexes into this, never the raw MUTATOR_POOL.length, so appending a
 * 23rd entry (future availableFrom) can never change what any past date
 * resolves to: past dates see the exact same eligible list, same length,
 * same order, as before the append (see JOURNAL.md "append-only selection").
 */
function eligiblePool(pool: Mutator[], dateStr: string): Mutator[] {
  return pool.filter((m) => m.availableFrom <= dateStr);
}

/**
 * First mutator slot for a day. Steps forward once if the raw hash would
 * repeat the previous day's raw pick, a cheap O(1) proxy for "yesterday's
 * mutator" (it compares against yesterday's raw hash index, not its fully
 * resolved pick, so it can rarely miss a repeat after yesterday's own step;
 * acceptable for a hobby daily feature, and documented here on purpose).
 *
 * Indexes into today's eligible pool with modulus eligible.length, never
 * MUTATOR_POOL.length. On the day a new mutator is introduced, today's and
 * yesterday's eligible pools can have different lengths (yesterday's raw
 * index is meaningless against a differently-sized pool, but comparing
 * indices from two different-length pools was already the documented
 * "can rarely miss a repeat" tradeoff above, just with one more way to miss;
 * not worth getting clever over for a hobby daily). If nothing was eligible
 * yesterday at all (only possible the day the feature itself launches, since
 * every live entry is pinned to the same availableFrom), there is nothing to
 * avoid repeating, so the step is skipped outright.
 */
function pickFirst(dateStr: string, pool: Mutator[]): Mutator {
  const eligible = eligiblePool(pool, dateStr);
  const idx = poolIndex(`orion-mutator-${dateStr}-1`, eligible.length);
  const yesterdayStr = addCivilDays(dateStr, -1);
  const yesterdayEligible = eligiblePool(pool, yesterdayStr);
  const yesterdayIdx =
    yesterdayEligible.length > 0 ? poolIndex(`orion-mutator-${yesterdayStr}-1`, yesterdayEligible.length) : -1;
  const finalIdx = idx === yesterdayIdx ? (idx + 1) % eligible.length : idx;
  return eligible[finalIdx];
}

/** Second Sunday slot: compatible with the first pick, distinct from it.
 * See pickFirst's comment for the eligible-pool / introduction-day notes,
 * which apply here identically. */
function pickSecond(dateStr: string, first: Mutator, pool: Mutator[]): Mutator {
  const eligible = eligiblePool(pool, dateStr);
  const start = poolIndex(`orion-mutator-${dateStr}-2`, eligible.length);
  const yesterdayStr = addCivilDays(dateStr, -1);
  const yesterdayEligible = eligiblePool(pool, yesterdayStr);
  const yesterdayIdx =
    yesterdayEligible.length > 0 ? poolIndex(`orion-mutator-${yesterdayStr}-2`, yesterdayEligible.length) : -1;
  for (let step = 0; step < eligible.length; step++) {
    const idx = (start + step) % eligible.length;
    const candidate = eligible[idx];
    if (candidate.id === first.id || shareTag(candidate, first)) continue;
    if (idx === yesterdayIdx && step === 0) continue; // try the next slot first
    return candidate;
  }
  // unreachable with the current pool (always >=2 mutually-compatible
  // entries), but keep a safe, always-compatible fallback just in case.
  const fallback = eligible.find((m) => m.id !== first.id && !shareTag(m, first));
  return fallback ?? first;
}

/** Mutator(s) for a YYYY-MM-DD patrol label: 1 normally, 2 on Sundays. */
export function getMutatorsForDateStr(dateStr: string, pool: Mutator[] = MUTATOR_POOL): Mutator[] {
  if (dateStr < MUTATORS_START_DATE) return [];
  const first = pickFirst(dateStr, pool);
  if (!isSundayDateStr(dateStr)) return [first];
  return [first, pickSecond(dateStr, first, pool)];
}

/** Resolve mutators for a Date anchored at UTC midnight of its label. Live
 * "today" uses getMutatorsForDateStr(patrolDateStr()). */
export function getMutatorsForDate(date: Date): Mutator[] {
  return getMutatorsForDateStr(date.toISOString().slice(0, 10));
}

/**
 * Same selection as `getMutatorsForDateStr`, but against an arbitrary pool
 * instead of the live `MUTATOR_POOL`. Exists so tests can prove append-only
 * behavior (inject a pool with an extra future-dated entry and confirm every
 * past day's pick is untouched) without exporting the live pool as mutable
 * or duplicating the selection logic. Production always calls this with
 * `MUTATOR_POOL` via `getMutatorsForDateStr`; nothing else should call this
 * directly outside tests.
 */
export function getMutatorsForDateFromPool(date: Date, pool: Mutator[]): Mutator[] {
  return getMutatorsForDateStr(date.toISOString().slice(0, 10), pool);
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
let activeWindDate: string | null = null;
let activeWindStrength = 0;
let activeFloodDate: string | null = null;

const WIND_PERIOD_MIN = 20;
const WIND_PERIOD_MAX = 28;
const WIND_WARNING = 2.5;
const WIND_MIN_TURN = (25 * Math.PI) / 180;

function windAngleFromKey(key: string): number {
  return ((hashString(key) % 10007) / 10007) * Math.PI * 2;
}

function smallestAngleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

function rawWindHeading(dateStr: string, segment: number): number {
  // Segment 0 keeps the original per-day key so already-assigned days
  // open on the same heading they always had.
  const key = segment === 0 ? `orion-wind-${dateStr}` : `orion-wind-${dateStr}-${segment}`;
  return windAngleFromKey(key);
}

function ensureWindTurn(angle: number, prev: number, dateStr: string, segment: number): number {
  if (smallestAngleDiff(angle, prev) >= WIND_MIN_TURN) return angle;
  const alt = windAngleFromKey(`orion-wind-${dateStr}-${segment}-alt`);
  if (smallestAngleDiff(alt, prev) >= WIND_MIN_TURN) return alt;
  return prev + Math.PI / 2;
}

function windPeriod(dateStr: string, segment: number): number {
  const t = (hashString(`orion-wind-period-${dateStr}-${segment}`) % 10007) / 10007;
  return WIND_PERIOD_MIN + t * (WIND_PERIOD_MAX - WIND_PERIOD_MIN);
}

interface WindState {
  angle: number;
  nextAngle: number;
  secondsToFlip: number;
}

function windStateAt(dateStr: string, time: number): WindState {
  let elapsed = 0;
  let segment = 0;
  let angle = rawWindHeading(dateStr, 0);
  const t = Math.max(0, time);
  while (segment < 10000) {
    const period = windPeriod(dateStr, segment);
    if (t < elapsed + period) {
      const next = ensureWindTurn(rawWindHeading(dateStr, segment + 1), angle, dateStr, segment + 1);
      return { angle, nextAngle: next, secondsToFlip: elapsed + period - t };
    }
    elapsed += period;
    segment++;
    angle = ensureWindTurn(rawWindHeading(dateStr, segment), angle, dateStr, segment);
  }
  return { angle, nextAngle: angle, secondsToFlip: WIND_PERIOD_MAX };
}

/**
 * `date` is used to derive SOLAR WIND headings and THE FLOOD's current
 * heading. Neither draws from the run-seeded rand()/scheduleRand() streams:
 * each heading is a pure hash of the patrol date string (wind also hashes a
 * segment index). Same "deterministic from the date, no stream draw" trick
 * mutator selection already uses. That keeps both features outside the
 * seeded-draw-count discipline entirely.
 */
export function setActiveMutators(mutators: Mutator[], patrolDateLabel: string | Date = new Date()): void {
  active = mutators;
  const strength = sumOf((o) => o.windStrength);
  const label =
    typeof patrolDateLabel === "string"
      ? patrolDateLabel
      : patrolDateLabel.toISOString().slice(0, 10);
  if (strength > 0) {
    activeWindStrength = strength;
    activeWindDate = label;
  } else {
    activeWindStrength = 0;
    activeWindDate = null;
  }
  activeFloodDate = mutators.some((m) => m.overrides.floodSurgeActive) ? label : null;
}

export function clearActiveMutators(): void {
  active = [];
  activeWindStrength = 0;
  activeWindDate = null;
  activeFloodDate = null;
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

/** Crosswind (units/sec) at `time` seconds into the run, or null on ordinary days. */
export function mutatorWindVector(time = 0): { x: number; y: number } | null {
  if (activeWindDate === null || activeWindStrength <= 0) return null;
  const { angle } = windStateAt(activeWindDate, time);
  return { x: Math.cos(angle) * activeWindStrength, y: Math.sin(angle) * activeWindStrength };
}

export interface WindShiftWarning {
  currentAngle: number;
  incomingAngle: number;
  secondsLeft: number;
}

/** Incoming heading + countdown during the pre-flip warning, else null. */
export function mutatorWindShiftWarning(time: number): WindShiftWarning | null {
  if (activeWindDate === null || activeWindStrength <= 0) return null;
  const state = windStateAt(activeWindDate, time);
  if (state.secondsToFlip <= 0 || state.secondsToFlip > WIND_WARNING) return null;
  return {
    currentAngle: state.angle,
    incomingAngle: state.nextAngle,
    secondsLeft: state.secondsToFlip,
  };
}

export function mutatorPickupMagnetStrength(): number {
  return sumOf((o) => o.pickupMagnetStrength);
}

export function mutatorRedTint(): boolean {
  return firstOf((o) => o.redTint) ?? false;
}

/** BLACKOUT only: lights-out pulse overlay + telegraph dim. */
export function mutatorBlackoutPulse(): boolean {
  return firstOf((o) => o.blackoutPulse) ?? false;
}

/**
 * 0..1 vignette strength at run-seconds `time`. First pulse at 6s, then
 * every pulseIntervalSeconds, 0.5s window with short fades. Pure function
 * of time: no RNG, same for every pilot.
 */
export function blackoutPulseAmount(time: number): number {
  const { firstPulseAt, pulseIntervalSeconds, pulseDurationSeconds, pulseFadeSeconds } =
    BLACKOUT;
  if (time < firstPulseAt) return 0;
  const cycle = time % pulseIntervalSeconds;
  if (cycle >= pulseDurationSeconds) return 0;
  if (cycle < pulseFadeSeconds) return cycle / pulseFadeSeconds;
  const fadeOut = pulseDurationSeconds - cycle;
  if (fadeOut < pulseFadeSeconds) return fadeOut / pulseFadeSeconds;
  return 1;
}

/** Multiplier on telegraph alpha during a BLACKOUT pulse (1 outside the window). */
export function blackoutTelegraphMul(time: number): number {
  if (!mutatorBlackoutPulse()) return 1;
  const a = blackoutPulseAmount(time);
  return 1 + (BLACKOUT.pulseTelegraphOpacity - 1) * a;
}

/** Multiplies graze point pay (1 on ordinary days). */
export function mutatorGrazePointsScale(): number {
  return scaleOf((o) => o.grazePointsScale);
}

/** STARFALL only: whether the environmental meteor rain should be running. */
export function mutatorMeteorRainActive(): boolean {
  return active.some((m) => m.overrides.meteorRainActive);
}

/** THE FLOOD only: skip the formation scheduler for the day. */
export function mutatorFormationsDisabled(): boolean {
  return firstOf((o) => o.formationsDisabled) === true;
}

/** THE FLOOD only: whether the directional surge waves should be running. */
export function mutatorFloodSurgeActive(): boolean {
  return active.some((m) => m.overrides.floodSurgeActive);
}

/** Floor on the ambient escalate() clock, in minutes (0 on ordinary days). */
export function mutatorAmbientMinutesFloor(): number {
  return firstOf((o) => o.ambientMinutesFloor) ?? 0;
}

/** Unit heading the flood current travels along, hashed from the patrol date.
 * Null on every other day. Own key namespace (orion-flood-), cannot collide
 * with SOLAR WIND. Fixed for the whole run, no segment shifting. */
export function mutatorFloodHeadingVector(): { x: number; y: number } | null {
  if (activeFloodDate === null || !mutatorFloodSurgeActive()) return null;
  const angle = ((hashString(`orion-flood-${activeFloodDate}`) % 10007) / 10007) * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}
