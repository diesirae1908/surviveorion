// All gameplay tuning in one place — the web equivalent of the Unity Inspector.
// Values ported from the Unity prototype (ShipController, EnemySpawner,
// GameRules, PickupSpawner, power effect ScriptableObjects).

export const FIXED_DT = 1 / 60;

// World is measured in "units"; the shorter screen axis spans VIEW_MIN units
// (Unity used an orthographic camera of half-height 5 => 10 units tall).
export const VIEW_MIN = 10;

export const SHIP = {
  thrust: 12,
  rotateSpeed: (320 * Math.PI) / 180, // rad/s
  maxSpeed: 15,
  radius: 0.16, // forgiving hitbox, much smaller than the drawn hull (arcade-fair)
  visualScale: 0.8, // hull drawn smaller for more perceived flying room
  linearDamping: 0.12, // gentle drag so the ship eventually settles
  boost: {
    initialForce: 10,
    maxForce: 42,
    rampTime: 1.2,
    maxHoldTime: 2.2,
    cooldown: 1.2,
    maxSpeedMultiplier: 1.6,
  },
  // Fraction of view size beyond the edge before wrapping. Kept small so the
  // ship never lingers off-screen where unseen drones spawn (Unity used 0.2,
  // which made edge collisions invisible).
  wrapMargin: 0.05,
  deathKnockback: 12,
};

export const DRONE = {
  baseSpeed: 1.8,
  radius: 0.28, // scaled by drone size
  massMin: 0.3,
  massMax: 1.8,
  jitterFrequency: 0.8,
};

export const SPAWNER = {
  initialBurst: 3,
  // Endless escalation (the Tetris model): fast ramp, then slow growth
  // forever so every run ends and scores measure depth, not patience.
  spawnsPerSecond: { from: 0.5, to: 1.5, rampMinutes: 3, latePerMinute: 0.12 },
  speedMultiplier: { from: 1.0, to: 1.3, rampMinutes: 3, latePerMinute: 0.03 },
  scaleClamp: [0.3, 0.9] as const,
  scaleJitter: 0.15,
  jitterStrength: 0.35, // perpendicular wobble on drone heading
  minSpawnRadius: 12, // Unity's spawnRadius; formations use max(this, view half-diagonal)
  edgeMargin: 1.0, // ambient spawns appear this far beyond the view edge
  minDistanceFromShip: 7, // edge spawns keep at least this distance from the ship
  // Telegraphed on-screen spawns: a red glow fades in, then the drone pops.
  telegraph: {
    ratio: 0.7, // fraction of ambient spawns that appear on-screen (rest sneak from edges)
    duration: 1.4, // warning time before the drone materializes
    minDistanceFromShip: 3,
    edgeInset: 1.0, // keep telegraphs this far inside the view
  },
  formations: {
    intervalRange: [12, 20] as const,
    // formations come faster over time, down to this floor
    intervalFloor: [8, 10] as const,
    intervalRampMinutes: 6,
    countGrowthMinutes: 2, // formations gain +1 enemy per this many minutes...
    maxCountBonus: 4, // ...capped here
    postFormationDelay: 1.5,
    line: { count: 6, spacing: 1.6 },
    // ring closes in around the player ON-screen: telegraphed circle with
    // enough warning time to fly through a gap before it pops
    ring: { count: 12, radius: 4.2, telegraphDuration: 2.0 },
    burst: { count: 14, spreadRadius: 2.5 },
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

// Competitive scoring: skilled play compounds. The multiplier climbs fast on
// kill streaks (up to x10) but drains faster the higher it is, so holding a
// big multiplier is the core skill test. Chained kills pay escalating bonuses
// and survival pay rises the longer the run goes ("danger pay").
// NOTE: server/validate.mjs mirrors these caps for score sanity checks.
export const SCORING = {
  survivalPointsPerSecond: 5,
  // Danger pay: all scoring scales by 1 + minutes * dangerPerMinute, uncapped
  // (like Tetris points-per-line growing with level). Late-game survival and
  // kills dominate the score, so the easy opening is never worth grinding.
  // Linear, not exponential, so early mistakes don't force insta-resets.
  dangerPerMinute: 0.5,
  killPoints: 40,
  multiplierPerKill: 0.5,
  multiplierMax: 10,
  multiplierDecayRate: 0.4, // base drain per second...
  multiplierDecayScale: 0.15, // ...+15% of base per multiplier step (x10 drains ~2.4x faster)
  multiplierDecayDelay: 2.0,
  chainWindow: 2.0, // kills within this window keep the chain alive
  chainBonusEvery: 5, // every N chained kills...
  chainBonusPoints: 100, // ...award this * multiplier
  // Skill-kill bonuses: risky/deliberate kills pay more than passive ones.
  pulsePointsScale: 2, // pulse projectile kills are worth double
  pulseMultiKillMin: 3, // one projectile killing >= this many drones pays a bonus...
  pulseMultiKillPoints: 150, // ...of this * (hits - min + 1) * multiplier
  frozenPointsScale: 1.5, // shattering a frozen drone pays extra...
  frozenMultiplierScale: 2, // ...and builds the multiplier twice as fast
};

export const PICKUPS = {
  secondsBetweenRange: [3.5, 6] as const,
  // support scales with pressure: intervals shrink to this range over the ramp
  secondsBetweenAtPeak: [2.8, 4.5] as const,
  intervalRampMinutes: 4,
  maxActive: 5,
  spawnOnStart: true,
  radius: 0.45,
  minDistanceFromShip: 3,
  edgeInset: 1.0, // keep pickups this far inside the view bounds
  bobSpeed: 2.2,
};

export type PowerId =
  | "shield"
  | "shockwave"
  | "pulse"
  | "magnet"
  | "afterburner"
  | "freeze"
  | "missiles"
  | "starshell";

export const POWERS = {
  shield: {
    duration: 5,
    flickerLastSeconds: 2,
    detonationRadius: 7,
    detonationForce: 24,
  },
  shockwave: {
    radius: 7,
    push: 14,
    waveLifetime: 1.2,
    waveMaxRadius: 14,
  },
  pulse: {
    chargeTime: 2,
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
  // the nearest enemies.
  missiles: {
    count: 6,
    maxAlive: 12, // cap if two pickups stack
    speed: 8,
    turnRate: 6, // rad/s steering limit (makes them curve, not snap)
    lifetime: 4,
    radius: 0.15,
  },
  // Late-game pressure valve (Tilt to Live's Spike Shield): a golden shell
  // that makes the ship invulnerable and ram-kill everything it touches.
  starshell: {
    duration: 6,
    flickerLastSeconds: 2,
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
];

// Relative spawn frequency. Panic-button powers stay common as a safety net
// for new players; the high-skill, high-reward powers (see SCORING bonuses)
// show up less often so they feel special without being a crutch.
export const POWER_SPAWN_WEIGHTS: Record<PowerId, number> = {
  shield: 3,
  shockwave: 3,
  pulse: 2,
  magnet: 2,
  missiles: 2,
  freeze: 1.5,
  afterburner: 1,
  starshell: 1.5,
};

// Powers gated to the late game: they only enter the pickup pool after this
// many minutes, once the escalation actually warrants them.
export const POWER_MIN_MINUTES: Partial<Record<PowerId, number>> = {
  starshell: 2.5,
};

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
};
