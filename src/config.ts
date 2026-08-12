// All gameplay tuning in one place — the web equivalent of the Unity Inspector.
// Values ported from the Unity prototype (ShipController, EnemySpawner,
// GameRules, PickupSpawner, power effect ScriptableObjects).

export const FIXED_DT = 1 / 60;

/**
 * Game modes (each ranks on its own leaderboards):
 * - classic: the standard run — slow, deliberate opening that escalates forever.
 * - ironrain: starts pinned at a late-game difficulty and stays there — a flat
 *   endurance gauntlet for pilots who want to skip the warm-up.
 */
export type GameMode = "classic" | "ironrain";

export const GAME_MODES: GameMode[] = ["classic", "ironrain"];

export const GAME_MODE_LABEL: Record<GameMode, string> = {
  classic: "Classic",
  ironrain: "Iron Rain",
};

// World is measured in "units"; the shorter screen axis spans VIEW_MIN units
// (Unity used an orthographic camera of half-height 5 => 10 units tall).
export const VIEW_MIN = 10;

export const SHIP = {
  thrust: 12,
  rotateSpeed: (320 * Math.PI) / 180, // rad/s
  maxSpeed: 15,
  radius: 0.12, // bullet-hell-tiny hitbox (~the canopy), way under the drawn hull
  visualScale: 0.8, // hull drawn smaller for more perceived flying room
  linearDamping: 0.12, // gentle drag so the ship eventually settles
  deathKnockback: 12,
};

// Tilt controls (mobile): tilt maps directly to velocity, Tilt to Live style.
// No inertia — the ship goes where the phone leans. Tilt runs rank on their
// own leaderboard, separate from phone touch and desktop.
export const TILT = {
  deadzoneDeg: 3, // resting-hand jitter absorbed here
  maxTiltDeg: 22, // full speed at this lean (overridden by tiltSensitivity setting)
  response: 14, // 1/s exponential convergence of velocity to target (feels instant, not jittery)
  rotateSpeed: (720 * Math.PI) / 180, // hull turns to face travel fast enough to track flicks
};

// Directional no-inertia (keyboard/stick with Inertia OFF): one flat speed,
// tuned by the Direct speed setting. No boost.
export const DIRECT = {
  cruiseSpeed: 8, // overridden by directSpeed setting
};

export type SenseLevel = "low" | "med" | "high";

/** Full-speed lean angle: Low = more lean needed, High = twitchier. */
export const TILT_MAX_DEG: Record<SenseLevel, number> = {
  low: 30,
  med: 22,
  high: 15,
};

/** Flight speed in directional no-inertia mode. */
export const DIRECT_CRUISE: Record<SenseLevel, number> = {
  low: 6.5,
  med: 8,
  high: 10,
};

export const DRONE = {
  // Zombie-horde pacing: individual drones shamble, the threat is the crowd.
  // The game is about reading the swarm and finding the way out, not
  // out-twitching drones.
  baseSpeed: 0.85,
  radius: 0.28, // scaled by drone size
  massMin: 0.3,
  massMax: 1.8,
  jitterFrequency: 0.8,
  // Frozen drones puff up (ice shell): easier targets to ram and shatter.
  frozenScale: 1.5,
  // Inert while scaleClamp is pinned to one size (see SPAWNER.scaleClamp);
  // widen the clamp again to bring back "small = slower, large = faster".
  sizeSpeed: { small: 0.7, large: 1.25 },
};

export type FormationKind =
  | "line"
  | "ring"
  | "burst"
  | "wall"
  | "serpent"
  | "pincer"
  | "corners"
  | "tightring"
  | "swarm"
  | "megawall";

export const SPAWNER = {
  initialBurst: 5,
  // Endless escalation (the Tetris model): ramp, then slow growth forever so
  // every run ends and scores measure depth, not patience. Classic opens
  // gently on purpose (Iron Rain exists to skip the warm-up); the speed ramp
  // is soft — density and patterns are the late-game pressure, not chase speed.
  // Tilt to Live density target: the late game should be a sea of dots.
  spawnsPerSecond: { from: 1.3, to: 4.0, rampMinutes: 3, latePerMinute: 0.35 },
  // near-flat: Iron Rain's pinned depth must not turn the horde quick
  speedMultiplier: { from: 1.0, to: 1.05, rampMinutes: 4, latePerMinute: 0.01 },
  // Classic only: the first formation arrives this much later than the normal
  // formation cadence, so brand-new runs get a beat to breathe.
  firstFormationExtraDelay: 2,
  // One drone size, the big readable one: the old runt-to-bruiser spread made
  // the smallest drones nearly invisible on phones. The clamp applies to
  // formation sizes too; with zero width, every drone lands on 0.9 and the
  // size-speed spread is neutral (all drones fly the shared baseline).
  scaleClamp: [0.9, 0.9] as const,
  scaleJitter: 0,
  // Zombie clumping: ambient drones arrive in packs of 1..clumpMax gathered
  // around one point (the average spawn rate is unchanged — packs just group
  // the same budget), so the crowd reads as blobs with lanes between them.
  clumpMax: 4,
  clumpRadius: 1.1,
  jitterStrength: 0.35, // perpendicular wobble on drone heading
  minSpawnRadius: 12, // Unity's spawnRadius; formations use max(this, view half-diagonal)
  edgeMargin: 1.0, // ambient spawns appear this far beyond the view edge
  minDistanceFromShip: 7, // edge spawns keep at least this distance from the ship
  // Soft safety cap: no pooling/partitioning, so guard frame rate in marathon runs.
  maxDrones: 550,
  // Relief valve: past this many loose homing drones, ambient spawns are
  // discarded (their RNG draws still consumed, so Daily Patrol seeds stay
  // shared). The field never silts up into an unmovable sea of singles —
  // formations and assemblies carry the pressure instead.
  ambientSoftCap: 130,
  // Telegraphed on-screen spawns: a red glow fades in, then the drone pops.
  telegraph: {
    ratio: 0.7, // fraction of ambient spawns that appear on-screen (rest sneak from edges)
    duration: 1.4, // warning time before the drone materializes
    minDistanceFromShip: 3,
    edgeInset: 1.0, // keep telegraphs this far inside the view
  },
  formations: {
    intervalRange: [5, 8] as const,
    // formations come faster over time, down to this floor
    intervalFloor: [3.5, 5.5] as const,
    intervalRampMinutes: 2,
    countGrowthMinutes: 1.5, // formations gain +1 enemy per this many minutes...
    maxCountBonus: 10, // ...capped here
    postFormationDelay: 1.5,
    // Relative pick frequency per pattern; heavy patterns unlock later.
    weights: {
      line: 2,
      ring: 2,
      burst: 2,
      wall: 2,
      serpent: 2,
      pincer: 1.5,
      corners: 1.5,
      tightring: 1.5,
      swarm: 2,
      megawall: 1.5,
    } as Record<FormationKind, number>,
    minMinutes: {
      wall: 0.1,
      swarm: 0.15,
      serpent: 0.3,
      tightring: 0.35,
      corners: 0.5,
      megawall: 0.75,
      pincer: 1,
    } as Partial<Record<FormationKind, number>>,
    line: { count: 8, spacing: 1.2 },
    // ring closes in around the player ON-screen: telegraphed circle with
    // enough warning time to fly through a gap before it pops
    ring: { count: 16, radius: 4.2, telegraphDuration: 2.0 },
    burst: { count: 18, spreadRadius: 2.0 },
    // Tilt to Live-style dot wall: spans one arena edge (minus 1-2 escape
    // gaps) and marches straight across before releasing to homing.
    // Scripted patterns keep speedScales high so walls hold their marching
    // pace over the slow zombie baseline — the crowd shambles, the walls sweep.
    wall: { spacing: 1.0, gapSize: 2.6, scale: 0.55, speedScale: 1.25 },
    // A dotted train: the head wanders on a curved path, the body follows.
    serpent: { count: 14, spacing: 0.55, duration: 7, wander: 1.7, scale: 0.5, speedScale: 1.35 },
    // Two walls converging from opposite edges (each with an escape gap).
    pincer: { spacing: 1.5, gapSize: 2.8, scale: 0.55, speedScale: 1.05 },
    // Simultaneous bursts from all four corners.
    corners: { countPerCorner: 5, spreadRadius: 1.4 },
    // A much tighter, denser ring: less room, more drones, slightly more warning.
    tightring: { count: 20, radius: 2.9, telegraphDuration: 2.2 },
    // A loose school of drones drifting across the arena as one organic blob,
    // released to homing as it passes the player.
    swarm: { count: 32, spreadRadius: 3.0, scale: 0.5, speedScale: 1.2, wander: 0.5 },
    // The big one: a slow 3-row-thick wall spanning the whole arena with a
    // single narrow gap — thread it or blast through with a power.
    megawall: { spacing: 0.9, gapSize: 2.2, scale: 0.55, speedScale: 0.85, rows: 3, rowOffset: 0.9 },
  },
};

// Iron Rain: flat endurance mode. The spawner behaves as if the run were
// already `pinnedMinutes` deep — and stays there. No ramp, no growth; score
// still climbs with time (danger pay is real-time based) so longer survival
// ranks higher.
export const IRONRAIN = {
  pinnedMinutes: 9,
  // opens with an immediate mega-wall instead of the ambient burst
  firstFormationDelay: 3,
  // wall-heavy pattern diet: the mode is about threading tight lines
  formationWeights: {
    line: 1,
    ring: 1,
    burst: 1,
    wall: 3,
    serpent: 1,
    pincer: 2.5,
    corners: 1,
    tightring: 2,
    swarm: 1,
    megawall: 3,
  } as Record<FormationKind, number>,
  // walls pack tighter and their escape gaps shrink
  wallSpacingScale: 0.75,
  wallGapScale: 0.8,
  // some walls spawn with NO gap at all — survivable only via powers
  // (shockwave, starshell, shield, freeze). Iron Rain only.
  gaplessWallChance: 0.15,
};

// Training Ground (daily-only site): a free, unscored practice arena. A slow
// ambient trickle with a hard cap — enough drones to learn dodging and sample
// powers, never enough to feel like the real thing. No formations, no
// assemblies, no mines; difficulty stays pinned at minute zero.
export const TRAINING = {
  initialBurst: 3,
  spawnsPerSecond: 0.45,
  maxDrones: 14,
  speedScale: 0.85, // a touch slower than even a minute-zero classic run
};

// Drone evolutions ("assemblies"): when the crowd thickens, free ambient
// drones fuse into a creature with its own movement style — not just faster
// drones. Lance: a rigid bar that flies straight and bounces off the walls.
// Wheel: a spinning ring that rolls across the arena and bounces. Hunter: a
// vee that tracks the ship with a slow turn rate, like a big ship. Bomb: a
// tight slab that drifts, pulses, then detonates its members outward as fast
// shrapnel. Event timing/kind ride the seeded schedule stream (fixed draws
// per event) so Daily Patrol scripts stay shared; member selection and the
// crowd-pressure trigger use positions/Math.random (player-dependent by
// design, like power effects).
export const ASSEMBLY = {
  minMinutes: 0.5,
  intervalRange: [6, 10] as const,
  countRange: [10, 18] as const,
  gatherRadius: 9, // conscripts must be this close to the seed drone
  minMembers: 4, // fewer free drones than this → the event fizzles
  spacing: 0.7, // slot spacing inside the shape
  // Crowd-pressure valve: when the loose swarm gets thick, an extra evolution
  // fires immediately instead of waiting for the timer (Math.random only —
  // the seeded schedule stream is never touched, so Daily Patrol stays shared).
  crowdTrigger: 60, // free homing drones that count as "too thick"
  crowdCooldown: 4, // seconds between crowd-triggered evolutions
  maxConcurrent: 3,
  formTime: 1.8, // seconds steering into the shape (the telegraph)
  formSpeedScale: 1.8,
  // Lance/wheel death: members scatter outward briefly before homing again.
  shatterSpeedScale: 2.8,
  shatterTime: 0.5,
  // Per-kind behavior once formed. speedScale multiplies the drone baseline.
  kinds: {
    // a broadside bar sweeping the arena in straight lines, wall to wall
    lance: { speedScale: 2.6, duration: 8, maxBounces: 2 },
    // a rolling ring that bowls across and rebounds like a ball
    wheel: { speedScale: 2.2, duration: 9, maxBounces: 3 },
    // hunts the ship with a limited turn rate — outfly it, don't outrun it
    hunter: { speedScale: 2.0, duration: 6, turnRate: 1.1 },
    // slow drift, burning fuse, then shrapnel in every direction
    bomb: { speedScale: 0.8, fuse: 2.6, shrapnelSpeedScale: 5.5, shrapnelTime: 1.1 },
  },
};

/**
 * Late growth for a creature day (2026-08-11): the early→late ramp below is
 * done by `CREATURE_DAYS.rampMinutes`, and these keep the day escalating
 * FOREVER past it, the same endless-leg shape Classic gets from `escalate()`
 * (see math.ts and SPAWNER.spawnsPerSecond's `latePerMinute`). Without this a
 * creature day hard-plateaus at minute 3 and can be farmed indefinitely
 * (WHEELHOUSE was flown for 25 minutes on 2026-08-11).
 *
 * Every field is a pure function of elapsed run minutes (never field state),
 * so the shared Daily Patrol script stays identical for every pilot: the
 * number of seeded draws at a given point in the run is unchanged from pilot
 * to pilot even though it now grows with time. See creatures.ts helpers
 * (escalateInterval / escalateCount / lateMemberBonus / lateSpeedScale).
 */
export interface CreatureLateGrowth {
  /** Event interval keeps shrinking: late range / (1 + intervalTighten * lateMinutes). */
  intervalTighten: number;
  /** Floor: never tighter than this fraction of the day's late interval range. */
  intervalFloorScale: number;
  /** Extra structures per event (lanes / vees / bars / slabs) per late minute. */
  groupPerMinute: number;
  /** Hard cap on structures per event. */
  groupMax: number;
  /** Extra member drones per structure per late minute (added to the seeded roll). */
  memberPerMinute: number;
  /** Hard cap on that member bonus. */
  memberMax: number;
  /** Creature travel speed gained per late minute (1.0 = the kind's normal speed). */
  speedPerMinute: number;
  /** Hard cap on the speed multiplier. */
  speedMax: number;
}

// Round 5 Daily Mutator system: on the four forced-creature days (Hunting
// Party, Lancer Doctrine, Wheelhouse, Demolition Day) assemblies stop being
// conscripted from the ambient swarm and become the spawn pattern itself:
// scripted events that materialize fully formed (see creatures.ts). Event
// cadence/counts ride the seeded schedule stream, anchors/headings ride the
// seeded placement stream, so every pilot on the day gets the identical
// script no matter how they fly. Every entry ramps from an "early" feel to a
// "late" feel over `rampMinutes`, then keeps growing forever on its `late`
// block (see CreatureLateGrowth above).
export const CREATURE_DAYS = {
  // --- shared early/mid ramp shape (2026-08-12 mid-ramp densify) ---
  //
  // Live feedback (Lucas, WHEELHOUSE, 2026-08-12): "after 30 secs it needs to
  // ramp up a bit more, people will get bored otherwise". The old shape was a
  // straight lerp from the early feel to the late feel over 3 minutes starting
  // at t=0, which spent the whole first two minutes barely off the opening
  // (~2.4 concurrent wheels at 1:55) and only got interesting right as the
  // late leg took over. The shape is now: hold the opening flat, then climb
  // hard. Three knobs, shared by every creature day so the feel stays
  // consistent across the pool:
  //
  //   progress(m) = clamp01((m - openingMinutes) / (rampMinutes - openingMinutes)) ^ rampCurve
  //
  // `openingMinutes` is the readable opening beat (the screenshot moment, and
  // the reason the first burst is still one lane): the day is pinned at its
  // early values for that long. `rampCurve < 1` makes the climb steepest right
  // after it, so 0:30-2:00 is where the day actually wakes up.
  openingMinutes: 0.5,
  rampMinutes: 2,
  rampCurve: 0.65,
  // Where the endless late leg (CreatureLateGrowth above) starts counting.
  // Deliberately decoupled from `rampMinutes`, which used to double as the
  // late-growth anchor: shortening the early ramp must NOT drag the whole
  // shipped late curve forward with it, or the two passes compound and minute
  // 4-8 runs away (measured: with the anchor pulled to 2.5, WHEELHOUSE hit 9
  // concurrent wheels before minute 3, which used to be minute-6 pressure).
  // Held at the 2026-08-11 value, so minute 3+ keeps exactly the shape that
  // shipped, just starting from a denser mid-game. Minute 2-3 is a short flat
  // shelf at full early-ramp pressure.
  lateStartMinutes: 3,
  telegraph: {
    // hunter/lance/wheel: a brief on-screen flash at the entry point right
    // before the member drones pop in (they're already telegraphed by their
    // inbound motion, this is just a beat of warning so the pop isn't a jump-scare)
    entryWarning: 0.4,
    // bomb: no inbound motion to read, so it needs a real warning strobe
    // before it materializes out of thin air
    materializeWarning: 1.5,
  },
  hunter: {
    // mid-ramp densify: the pack tops out at 5 vees instead of 4, and it gets
    // there by ~m2 instead of m3 (see the ramp shape above)
    packSizeRange: [2, 5] as const, // vees per wave, ramps up over the run
    veeMemberRange: [4, 6] as const,
    veeStagger: 0.3, // seconds between vees within a wave entering
    waveIntervalEarly: [11, 14] as const,
    waveIntervalLate: [6, 7.5] as const,
    // The pack keeps growing and closing faster after minute 3. Speed grows
    // least of the four: a hunter is meant to be outflown, not outrun (its
    // turn rate is the counterplay), so pace stays readable while the pack
    // size and cadence carry the late pressure.
    late: {
      intervalTighten: 0.22,
      intervalFloorScale: 0.5,
      groupPerMinute: 0.5,
      groupMax: 7,
      memberPerMinute: 0.7,
      memberMax: 5,
      speedPerMinute: 0.05,
      speedMax: 1.4,
    } as CreatureLateGrowth,
  },
  lance: {
    // left at 5 bars: a salvo of parallel sweeping bars is the most lethal
    // shape in the pool, so this day's densify is the faster ramp to 5 plus a
    // slightly tighter volley cadence, not a 6th bar
    salvoSizeRange: [2, 5] as const, // bars per salvo, ramps up over the run
    barMemberRange: [5, 8] as const,
    barStagger: 0.4, // volley rhythm: each bar a beat behind the last
    salvoIntervalEarly: [9, 12] as const,
    salvoIntervalLate: [4.6, 6.2] as const,
    // Salvos get wider bars, more bars per volley, and a faster volley rhythm.
    late: {
      intervalTighten: 0.22,
      intervalFloorScale: 0.5,
      groupPerMinute: 0.5,
      groupMax: 8,
      memberPerMinute: 0.7,
      memberMax: 5,
      speedPerMinute: 0.06,
      speedMax: 1.5,
    } as CreatureLateGrowth,
  },
  wheel: {
    // mid-ramp densify (2026-08-12): 4 lanes at the top of the ramp instead of
    // 3, reached by ~m2. The opening is still a single lane crossing.
    laneCountRange: [1, 4] as const, // concurrent lanes per burst, ramps up
    wheelMemberRange: [6, 9] as const,
    laneStagger: 0.5,
    laneIntervalEarly: [7, 9] as const,
    // slightly LOOSER than the pre-densify [3.5, 5]: the 4th lane above adds
    // more traffic per burst than the tighter cadence it replaces, and lanes
    // read better as traffic than a machine-gun of single crossings. Net
    // arrival rate at the top of the ramp is still ~1.4x what it was, and it
    // now lands at minute 2 instead of minute 3.
    laneIntervalLate: [4, 5.4] as const,
    // The 2026-08-11 calibration target (Lucas: 25-minute WHEELHOUSE runs must
    // stop being possible, skilled runs should land ~5 min and cap out at
    // 7-8): ~4 lanes and ~9-member wheels by m=5, ~5 lanes / ~11-member
    // wheels and a ~2.0-2.5s burst cadence by m=7, with the traffic itself
    // ~25% faster by then. Everything before minute 3 is untouched.
    late: {
      intervalTighten: 0.25,
      intervalFloorScale: 0.5,
      groupPerMinute: 0.5,
      groupMax: 6,
      memberPerMinute: 0.9,
      memberMax: 6,
      speedPerMinute: 0.08,
      speedMax: 1.6,
    } as CreatureLateGrowth,
  },
  bomb: {
    // slabs per deployment: 1 at the open (the original behavior), a second
    // one from ~m1.5, then late growth from there. DEMOLITION DAY was by far
    // the most farmable day of the pool (an assisted dodge bot ran it to a
    // 10-minute cap, see JOURNAL.md 2026-08-11), because one short-fused slab
    // at a time disbands before the next one lands.
    // mid-ramp densify: a third slab at the top of the ramp (reached ~m2)
    deploymentCountRange: [1, 3] as const,
    slabStagger: 0.6, // seconds between slabs of one deployment materializing
    memberRange: [5, 9] as const,
    deploymentIntervalEarly: [7, 9] as const,
    deploymentIntervalLate: [3.2, 4.6] as const,
    // No speed growth: a bomb drifts by design (the shrapnel is the threat),
    // so its late pressure is more slabs, bigger slabs, deployed faster.
    late: {
      intervalTighten: 0.25,
      // tightest floor of the pool (~1.2-1.8s between deployments): a slab is
      // a stationary threat, the most farmable kind, so cadence has to carry
      // what pace can't
      intervalFloorScale: 0.4,
      groupPerMinute: 0.5,
      groupMax: 6,
      memberPerMinute: 0.8,
      memberMax: 6,
      speedPerMinute: 0,
      speedMax: 1,
    } as CreatureLateGrowth,
  },
  // MENAGERIE: kind drawn per event (see creatures.ts scheduleMenagerieEvent),
  // reusing each kind's own member-count range and telegraph above. Density
  // pass (2026-08-10, live tuning feedback: "a minute in, still not a lot of
  // enemies"): cadence tightened until it runs faster than most single
  // creatures' own active lifetime (6-9s, see ASSEMBLY.kinds), so events
  // naturally overlap (a new creature lands while the last one is still
  // live) instead of reading as one lone animal at a time.
  menagerie: {
    eventIntervalEarly: [4, 6] as const,
    eventIntervalLate: [2.4, 3.2] as const,
    // chance an event doubles into two different kinds at once, lerped from
    // the early floor up to the late cap by rampMinutes. Starts nonzero
    // (doubles from the first event, not just late) per the density pass.
    doubleChanceEarly: 0.25,
    // mid-ramp densify: the double is the norm by ~m2 (was a coin flip at m3),
    // which is the zoo's version of "more lanes" on the single-kind days
    doubleChanceLate: 0.7,
    // ...and past the ramp the double stops being a coin flip and becomes the
    // norm (capped at certainty), so the zoo keeps compounding late.
    doubleChanceLatePerMinute: 0.12,
    // One creature per event is MENAGERIE's identity, so its `groupPerMinute`
    // is the gentlest of the pool: a guaranteed double gains a third animal
    // only around m=6 and a fourth around m=9.
    late: {
      intervalTighten: 0.2,
      intervalFloorScale: 0.55,
      groupPerMinute: 0.35,
      groupMax: 4,
      memberPerMinute: 0.7,
      memberMax: 5,
      speedPerMinute: 0.06,
      speedMax: 1.5,
    } as CreatureLateGrowth,
  },
};

// Stationary hazards that deny space. Capped low and spawned away from the
// ship so the arena never turns into a minefield mess.
export const MINES = {
  startAfterSeconds: 30,
  intervalRange: [9, 15] as const,
  maxActive: 4,
  radius: 0.32,
  armTime: 1.2, // fade-in; harmless until armed
  lifetime: 22, // fades out and despawns after this
  fadeOutTime: 2,
  explosionRadius: 3.5, // destroying a mine chain-kills drones around it
  minDistanceFromShip: 4,
  minDistanceBetween: 2.5,
};

// STARFALL (Daily Mutator) environmental event: a constant meteor rain, wholly
// separate from the player-triggered Meteor Storm power above. Cadence rides
// the seeded schedule stream, impact position rides the seeded placement
// stream (see starfall.ts), so every pilot on the day sees the identical
// rain regardless of how they fly. Gated entirely behind the STARFALL
// mutator; every other day and mode is untouched.
export const STARFALL_RAIN = {
  intervalStart: 4.0, // seconds between impacts near minute zero
  intervalFloor: 1.0, // seconds between impacts once fully ramped
  // 2026-08-12 mid-ramp densify: 3.5 to 2.5, so the rain thickens noticeably
  // across the first two minutes instead of creeping. Lighter touch than the
  // creature days (this day's early game already had real pressure), and the
  // opening is untouched: the first impacts still land intervalStart apart.
  rampMinutes: 2.5, // time to go from intervalStart to intervalFloor
  // Past the ramp the sky keeps opening up (2026-08-11 late-growth pass): the
  // interval keeps shrinking instead of sitting on intervalFloor forever, so
  // STARFALL's rain has an endless leg like Classic's density does. Reaches
  // ~0.7s by m=7 and bottoms out at intervalHardFloor around m=13.
  // The late leg is anchored separately from `rampMinutes` (same reasoning as
  // CREATURE_DAYS.lateStartMinutes): shortening the early ramp must not pull
  // the shipped late curve forward with it.
  lateStartMinutes: 3.5,
  lateTightenPerMinute: 0.14,
  intervalHardFloor: 0.45,
  intervalJitter: 0.15, // +/- fraction of the ramped interval (schedule-stream draw)
  warningRange: [1.0, 2.0] as const, // ground-reticle warning duration
  radius: 1.8, // kill/lethal radius on impact, matches the Meteor Storm power's feel
  holdTime: 1.0, // lingering lethality after impact (same discipline as blasts elsewhere)
  waveLifetime: 0.6,
};

// Competitive scoring: skilled play compounds. The multiplier climbs fast on
// kill streaks (up to x10) but drains faster the higher it is, so holding a
// big multiplier is the core skill test. Chained kills pay escalating bonuses
// and survival pay rises the longer the run goes ("danger pay").
// NOTE: server/validate.mjs mirrors these caps for score sanity checks.
export const SCORING = {
  survivalPointsPerSecond: 2,
  // Danger pay: all scoring scales by 1 + minutes * dangerPerMinute, uncapped
  // (like Tetris points-per-line growing with level). Late-game survival and
  // kills dominate the score, so the easy opening is never worth grinding.
  // Linear, not exponential, so early mistakes don't force insta-resets.
  dangerPerMinute: 0.25,
  killPoints: 15,
  multiplierPerKill: 0.5,
  multiplierMax: 10,
  multiplierDecayRate: 0.4, // base drain per second...
  multiplierDecayScale: 0.15, // ...+15% of base per multiplier step (x10 drains ~2.4x faster)
  multiplierDecayDelay: 2.0,
  chainWindow: 2.0, // kills within this window keep the chain alive
  chainBonusEvery: 5, // every N chained kills...
  chainBonusPoints: 40, // ...award this * multiplier
  // Skill-kill bonuses: risky/deliberate kills pay more than passive ones.
  pulsePointsScale: 2, // pulse projectile kills are worth double
  pulseMultiKillMin: 3, // one projectile killing >= this many drones pays a bonus...
  pulseMultiKillPoints: 60, // ...of this * (hits - min + 1) * multiplier
  frozenPointsScale: 1.5, // shattering a frozen drone pays extra...
  frozenMultiplierScale: 2, // ...and builds the multiplier twice as fast
  // Graze rewards: shaving past a live drone (within grazeBand beyond actual
  // contact) pays points, bumps the multiplier, and resets its decay delay —
  // threading a tight gap is a scoring strategy, not just survival. Per-drone
  // cooldown stops orbiting one drone for infinite pay. No graze while truly
  // invulnerable (starshell/dash/vortex); a banked shield still grazes since
  // contact would cost the extra life.
  grazeBand: 0.65,
  grazePoints: 10,
  grazeMultiplier: 0.1,
  grazeCooldown: 1.5,
};

export const PICKUPS = {
  secondsBetweenRange: [6, 10] as const,
  // support scales with pressure: intervals shrink to this range over the ramp
  secondsBetweenAtPeak: [5, 8] as const,
  intervalRampMinutes: 4,
  maxActive: 3,
  // Daily Patrol has no refill floor (collection timing would desync the
  // shared seed), so the whole drop schedule runs faster to compensate —
  // intervals are multiplied by this on daily runs.
  dailyIntervalScale: 0.7,
  spawnOnStart: 1, // pickups dealt the moment the run starts
  // Refill floor: below this many live pickups the next drop is hurried in.
  // Disabled on Daily Patrol (refill timing depends on when the player
  // collects, which would desync the shared seed).
  minActive: 1,
  radius: 0.45,
  minDistanceFromShip: 3,
  edgeInset: 1.0, // keep pickups this far inside the view bounds
  bobSpeed: 2.2,
  driftSpeed: 0.35, // pickups drift slowly and bounce softly off the walls
};

export type PowerId =
  | "shield"
  | "shockwave"
  | "pulse"
  | "magnet"
  | "afterburner"
  | "freeze"
  | "missiles"
  | "starshell"
  | "arc"
  | "autocannon"
  | "meteors"
  | "vortex";

export const POWERS = {
  // The shield has no timer: it stays on the ship until it absorbs a hit
  // (an extra life you can bank), then detonates, clearing nearby drones.
  shield: {
    detonationRadius: 7,
    detonationForce: 24,
  },
  shockwave: {
    radius: 1.75, // instant kill zone on detonation
    push: 10,
    waveLifetime: 1.0,
    waveMaxRadius: 3.5,
    // nuclear linger: the expanding wave is lethal for its whole sweep, then
    // the full-radius zone stays hot for this long
    blastLifetime: 1.0,
  },
  pulse: {
    chargeTime: 1,
    projectileSpeed: 16,
    projectileLifetime: 1.6,
    projectileRadius: 1.6,
    spawnOffset: 0.8, // along ship forward
  },
  // One-shot grab: yanks the nearest power pickup straight to the ship. If
  // the board is empty the charge stays armed and grabs the next drop instead.
  magnet: {
    pullSpeed: 11,
  },
  // Charge briefly, then dash forward in a straight line: enemies on the way
  // die, and the burning trail left behind stays lethal for a few seconds.
  afterburner: {
    chargeTime: 0.7,
    dashSpeed: 30,
    dashDuration: 0.35, // ~10 units of travel
    exitSpeed: 3.5, // hard brake when the dash ends so the ship stays controllable
    arrivalInvulnTime: 1.0, // grace window on arrival: contact kills drones instead of you
    trailLifetime: 2.5,
    trailKillRadius: 0.55,
  },
  // Flash-freezes every drone in a large area; frozen drones stop dead and
  // shatter harmlessly if you fly into them before they thaw.
  freeze: {
    radius: 9,
    freezeDuration: 5,
  },
  // Launches a volley of guided missiles in all directions that curve toward
  // the nearest enemies. Each impact detonates a small area blast that stays
  // lethal for a beat, so one missile can clear a small cluster.
  missiles: {
    count: 6,
    maxAlive: 12, // cap if two pickups stack
    speed: 8,
    turnRate: 6, // rad/s steering limit (makes them curve, not snap)
    lifetime: 4,
    radius: 0.15,
    blastRadius: 1.2,
    blastLifetime: 1.0,
  },
  // Late-game pressure valve (Tilt to Live's Spike Shield): a golden shell
  // that makes the ship invulnerable and ram-kill everything it touches.
  starshell: {
    duration: 6,
    flickerLastSeconds: 2,
    killRadius: 0.8, // matches the drawn shell — the whole golden bubble rams
  },
  // Chain lightning: zaps the nearest enemy, then jumps to the next closest
  // within range until no more targets are close enough to continue.
  arc: {
    initialRadius: 5,
    jumpRadius: 3.5,
    jumpInterval: 0.07,
    boltLifetime: 0.25,
    fizzleLifetime: 0.5,
    fizzleRadius: 2.5,
  },
  // Ship-mounted turret (Tilt to Live's gun): auto-fires at the nearest
  // enemy in range for the duration; each bullet kills one drone.
  autocannon: {
    duration: 6,
    fireInterval: 0.12, // ~8 rounds/s — tuned for the denser swarms

    range: 8,
    bulletSpeed: 22,
    bulletLifetime: 0.6,
    bulletRadius: 0.2,
  },
  // Meteor storm (Tilt to Live's Brimstone): explosions rain down, biased
  // toward drone clusters, each clearing a small radius.
  meteors: {
    duration: 4,
    interval: 0.35,
    radius: 1.8,
    scatter: 1.4, // strike jitter around the targeted drone
    waveLifetime: 0.6,
    blastLifetime: 1.0, // each crater stays lethal for this long
  },
  // Drops a singularity at the ship: pulls drones inward, devouring (and
  // scoring) everything that reaches the core, then collapses and kills
  // whatever is still caught nearby. While any vortex is open the ship is
  // untouchable — contact ram-kills the drone instead.
  vortex: {
    pullDuration: 3,
    pullRadius: 8,
    pullSpeed: 7,
    absorbRadius: 0.7, // drones this close to the core are eaten immediately
    killRadius: 3,
  },
};

export const ALL_POWER_IDS: PowerId[] = [
  "shield",
  "shockwave",
  "pulse",
  "magnet",
  "afterburner",
  "freeze",
  "missiles",
  "starshell",
  "arc",
  "autocannon",
  "meteors",
  "vortex",
];

// Benched for now (code stays intact so they're easy to bring back):
// vortex is too strong even as a rare drop, afterburner's control-stealing
// dash felt too risky to pick up (magnet took its slot).
export const BENCHED_POWER_IDS: PowerId[] = ["afterburner", "vortex"];

/** Powers that can actually drop (and that the codex shows). */
export const SPAWNABLE_POWER_IDS: PowerId[] = ALL_POWER_IDS.filter(
  (id) => !BENCHED_POWER_IDS.includes(id),
);

// Relative spawn frequency, in the intended pecking order: pulse first
// (the skill weapon), then shield, freeze, magnet, shockwave, then the
// rest evenly. Bad-luck demotion still gets the whole roster seen.
export const POWER_SPAWN_WEIGHTS: Record<PowerId, number> = {
  pulse: 4,
  shield: 3,
  freeze: 2.5,
  magnet: 2,
  shockwave: 1.5,
  missiles: 1,
  starshell: 1,
  arc: 1,
  autocannon: 1,
  meteors: 1,
  afterburner: 1, // benched (see BENCHED_POWER_IDS)
  vortex: 1, // benched
};

// Powers gated to the late game: they only enter the pickup pool after this
// many minutes. Currently empty — every power can spawn from minute zero.
export const POWER_MIN_MINUTES: Partial<Record<PowerId, number>> = {};

// Gold / red "Red Rising" palette from the style bible + menu mockup.
export const PALETTE = {
  bgTop: "#12121e",
  bgBottom: "#0a0a12",
  gold: "#ffd700",
  goldPale: "#ffee88",
  goldDark: "#cc8800",
  bronze: "#aa8844",
  red: "#c41e3a",
  redBright: "#ff4455",
  redDark: "#7a1020",
  white: "#fff7e0",
  shield: "#66ccff",
  pulse: "#ffaa33",
  magnet: "#cc66ff",
  afterburner: "#ff6633",
  freeze: "#9fe8ff",
  missiles: "#a8ff9e",
  starshell: "#ffd24d",
  arc: "#88eeff",
  autocannon: "#e8e8f8",
  meteors: "#ffce55",
  vortex: "#8877ff",
};

export const POWER_COLORS: Record<PowerId, string> = {
  shield: PALETTE.shield,
  shockwave: PALETTE.gold,
  pulse: PALETTE.pulse,
  magnet: PALETTE.magnet,
  afterburner: PALETTE.afterburner,
  freeze: PALETTE.freeze,
  missiles: PALETTE.missiles,
  starshell: PALETTE.starshell,
  arc: PALETTE.arc,
  autocannon: PALETTE.autocannon,
  meteors: PALETTE.meteors,
  vortex: PALETTE.vortex,
};

export const POWER_NAMES: Record<PowerId, string> = {
  shield: "Aegis Shield",
  shockwave: "Shockwave",
  pulse: "Pulse Shot",
  magnet: "Magnet",
  afterburner: "Afterburner",
  freeze: "Cryo Field",
  missiles: "Missile Swarm",
  starshell: "Starshell",
  arc: "Arc Lightning",
  autocannon: "Autocannon",
  meteors: "Meteor Storm",
  vortex: "Vortex",
};

// One-line action hints: shown under the name on pickup and in the menu
// Powers codex, so players learn what each power does mid-flight.
export const POWER_HINTS: Record<PowerId, string> = {
  shield: "banks an extra life, blocks one hit",
  shockwave: "blasts the swarm away from you",
  pulse: "aimed shots, kills pay double",
  magnet: "yanks the nearest power to your ship",
  afterburner: "warp dash, untouchable on arrival",
  freeze: "freezes drones, shatter them for bonus",
  missiles: "homing missiles blast the swarm",
  starshell: "invulnerable, ram them!",
  arc: "lightning chains through the swarm",
  autocannon: "turret auto-fires at the nearest drone",
  meteors: "explosions rain on drone packs",
  vortex: "drags drones in — you're untouchable",
};
