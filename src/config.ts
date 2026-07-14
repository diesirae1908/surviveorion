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
  // Most of the horde is slow; only the big bruisers keep some pace.
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
  // Wide size spread: runts to bruisers in the same crowd (bigger = faster).
  scaleClamp: [0.25, 1.05] as const,
  scaleJitter: 0.35,
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
  // (shockwave, starshell, shield, afterburner). Iron Rain only.
  gaplessWallChance: 0.15,
};

// Drone assemblies: free ambient drones periodically conscript into a shape
// (line or vee "ship"), hold formation briefly, then charge the player at
// boosted speed before disbanding back to normal homing. Assembly timing and
// shape ride the seeded schedule stream (fixed draws per event) so Daily
// Patrol scripts stay shared; member selection is position/Math.random based
// (player-dependent by design, like power effects).
export const ASSEMBLY = {
  minMinutes: 0.5,
  intervalRange: [9, 14] as const,
  countRange: [8, 14] as const,
  gatherRadius: 7, // conscripts must be this close to the seed drone
  minMembers: 4, // fewer free drones than this → the event fizzles
  spacing: 0.7, // slot spacing inside the shape
  formTime: 1.8, // seconds steering into the shape (the telegraph)
  formSpeedScale: 1.8,
  chargeTime: 3.5, // seconds the shape charges before disbanding
  chargeSpeedScale: 1.9, // charge reads fast against the slow zombie baseline
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
  magnet: {
    duration: 6,
    radius: 7,
    pullSpeed: 9,
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
// vortex is too strong even as a rare drop, magnet is off with it.
export const BENCHED_POWER_IDS: PowerId[] = ["magnet", "vortex"];

/** Powers that can actually drop (and that the codex shows). */
export const SPAWNABLE_POWER_IDS: PowerId[] = ALL_POWER_IDS.filter(
  (id) => !BENCHED_POWER_IDS.includes(id),
);

// Relative spawn frequency, in the intended pecking order: pulse first
// (the skill weapon), then shield, freeze, afterburner, shockwave, then the
// rest evenly. Bad-luck demotion still gets the whole roster seen.
export const POWER_SPAWN_WEIGHTS: Record<PowerId, number> = {
  pulse: 4,
  shield: 3,
  freeze: 2.5,
  afterburner: 2,
  shockwave: 1.5,
  missiles: 1,
  starshell: 1,
  arc: 1,
  autocannon: 1,
  meteors: 1,
  magnet: 1, // benched (see BENCHED_POWER_IDS)
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
  magnet: "pulls pickups to you",
  afterburner: "warp dash, untouchable on arrival",
  freeze: "freezes drones, shatter them for bonus",
  missiles: "homing missiles blast the swarm",
  starshell: "invulnerable, ram them!",
  arc: "lightning chains through the swarm",
  autocannon: "turret auto-fires at the nearest drone",
  meteors: "explosions rain on drone packs",
  vortex: "drags drones in — you're untouchable",
};
