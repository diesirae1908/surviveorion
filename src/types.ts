import type { GameMode, PowerId } from "./config";
import type { ClosestCall } from "./highlights";

export interface Ship {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  angle: number; // radians, 0 = +x, forward = (cos, sin)
  prevAngle: number;
  thrusting: number; // 0..1 current thrust input (for visuals/audio)
}

export interface Drone {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  scale: number;
  speedMultiplier: number;
  mass: number;
  jitterSeed: number;
  spin: number; // visual rotation
  frozen: number; // seconds of freeze remaining (0 = mobile)
  alive: boolean;
  // scripted formation movement (walls, serpents); undefined = normal homing
  scriptMode?: "straight" | "follow";
  scriptDirX?: number;
  scriptDirY?: number;
  scriptTimer?: number; // seconds until the drone releases to homing
  scriptWander?: number; // rad/s curve amplitude for straight movers (serpent head)
  followTarget?: Drone | null; // previous segment in a train
  /** Seconds until this drone can pay another graze reward. */
  grazeTimer?: number;
  /** HOWLERS: fighting for the ship. Harmless to the ship. */
  allied?: boolean;
  alliedTimer?: number;
  /** ION: remaining slam time. Overlapping a non-slammed drone kills it. */
  slamTimer?: number;
  slamVx?: number;
  slamVy?: number;
  /** CLOAK hover anchor (set when cloak starts). */
  hoverX?: number;
  hoverY?: number;
  /** Speed multiplier while scripted (e.g. bomb shrapnel flies fast). */
  scriptSpeedScale?: number;
  /** Assembly this drone is conscripted into (null/undefined = free). */
  assembly?: Assembly | null;
  /**
   * Slot offset in the assembly's local frame: slotX along the travel
   * direction, slotY perpendicular — the shape rotates with its heading.
   */
  slotX?: number;
  slotY?: number;
}

/**
 * Evolved swarm creatures: when the crowd thickens, free drones fuse into a
 * shape that behaves nothing like loose drones —
 * - lance: a spear-oriented line that flies straight, fast, and BOUNCES off
 *   the arena walls, then shatters back into drones;
 * - wheel: a rolling, spinning ring that travels straight and bounces;
 * - hunter: a vee that tracks the ship like a slow-turning ship;
 * - bomb: a tight slab that drifts, pulses, then detonates — flinging its
 *   drones outward as fast shrapnel.
 */
export type AssemblyKind = "lance" | "wheel" | "hunter" | "bomb";

/**
 * Round 5 Daily Mutator (creature days): a scripted assembly waiting to
 * materialize fully formed. Timing/anchor/heading were already rolled on the
 * seeded streams when this was queued (see creatures.ts); `timer` just
 * counts down the readable telegraph before spawnAssemblyDirect fires.
 */
export interface CreatureSpawn {
  kind: AssemblyKind;
  timer: number; // seconds left before materializing
  duration: number; // original warning duration, for telegraph render progress
  x: number; // anchor position at materialization
  y: number;
  dirX: number; // initial heading (unit vector)
  dirY: number;
  count: number; // member count, fixed at schedule time
  /** Late-growth travel-speed multiplier for this creature, fixed at schedule
   * time (see creatures.ts lateSpeedScale; 1 = the kind's normal speed). */
  speedScale: number;
}

export interface Assembly {
  kind: AssemblyKind;
  phase: "form" | "active";
  timer: number; // seconds left in the current phase
  members: Drone[];
  x: number; // anchor position
  y: number;
  dirX: number; // travel heading (unit vector)
  dirY: number;
  speed: number; // anchor speed while active (units/s)
  /** Shape half-extent, for wall bounces. */
  radius: number;
  bounces: number;
  /** Wheel only: rotation of the slot frame (the ring visibly rolls). */
  spin: number;
}

/** Stationary hazard: lethal to the ship, chain-explodes when destroyed. */
export interface Mine {
  x: number;
  y: number;
  age: number;
  lifetime: number;
  seed: number; // per-mine visual phase offset
  alive: boolean;
  /** Seconds of freeze remaining (0 = live). Same timer as drone.frozen. */
  frozen: number;
}

/** Guided missile from the Missile Swarm power. */
export interface Missile {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  angle: number;
  elapsed: number;
  target: Drone | Mine | null;
}

export interface Pickup {
  x: number;
  y: number;
  power: PowerId;
  age: number;
  /** Slow drift velocity (bounces softly off arena edges). */
  vx?: number;
  vy?: number;
  /** Claimed by a magnet: homes straight to the ship until collected. */
  magnetized?: boolean;
}

export interface PulseProjectile {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  dirX: number;
  dirY: number;
  elapsed: number;
  hit: Set<Drone>;
}

/**
 * A lingering kill zone: everything inside dies for as long as it stays hot.
 * Optionally expands from zero to full radius first (shockwave sweep).
 */
export interface Blast {
  x: number;
  y: number;
  elapsed: number;
  /** Seconds to expand from 0 to maxRadius (0 = full size instantly). */
  expandTime: number;
  /** Seconds the zone stays lethal at full radius after expanding. */
  holdTime: number;
  maxRadius: number;
  color: string;
  /** STARFALL only: also kills the ship on contact (like a drone hit), not
   * just drones/mines. Undefined/false for every other blast source, so
   * Shockwave/Missiles/Meteor Storm/mine explosions are unaffected. */
  lethalToShip?: boolean;
}

/** Expanding ring visual (shockwave / shield detonation). */
export interface WaveFx {
  x: number;
  y: number;
  elapsed: number;
  lifetime: number;
  maxRadius: number;
  color: string;
}

/** One jagged bolt segment in a chain-lightning arc. */
export interface ArcBolt {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  elapsed: number;
  seed: number;
}

/** Active chain-lightning jump state (staggered kills between targets). */
export interface ArcChainState {
  x: number;
  y: number;
  jumpTimer: number;
  hitDrones: Set<Drone>;
  hitMines: Set<Mine>;
}

/** A single autocannon tracer round: flies straight, kills the first drone hit. */
export interface Bullet {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  dirX: number;
  dirY: number;
  elapsed: number;
}

/** An active singularity: pulls drones inward, then collapses and kills. */
export interface Vortex {
  x: number;
  y: number;
  timer: number; // counts down to the collapse
}

/** A burning point left behind by the afterburner dash; lethal until it fades. */
export interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

/** Red warning glow where a drone is about to materialize on-screen. */
export interface SpawnTelegraph {
  x: number;
  y: number;
  timer: number; // counts down to the pop
  duration: number;
}

/** STARFALL only: a ground reticle marking where a meteor is about to land. */
export interface MeteorTelegraph {
  x: number;
  y: number;
  timer: number; // counts down to impact
  duration: number;
  radius: number; // impact/lethal radius, so the reticle can be sized to match
}

/** Unused on the metronome Flood (World still carries the array). */
export interface FloodTelegraph {
  x: number;
  y: number;
  timer: number;
  duration: number;
  dirX: number;
  dirY: number;
  packSize: number;
}

export interface CloakBomb {
  x: number;
  y: number;
}

export interface FlareDecoy {
  x: number;
  y: number;
  timer: number;
}

export interface ThunderBolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  elapsed: number;
}

export interface Lighthouse {
  x: number;
  y: number;
  age: number;
  angle: number;
  alive: boolean;
  seed: number;
}

export interface PowersState {
  shieldActive: boolean; // persists until it absorbs a hit (banked extra life)
  starshellTimer: number; // >0 => invulnerable ram-kill shell active
  pulseTimer: number; // >0 => pulse charging
  /** Armed magnet grabs waiting for a pickup to spawn (board was empty). */
  magnetPending: number;
  afterburnerCharge: number; // >0 => charging up the dash
  afterburnerDash: number; // >0 => dashing
  afterburnerGrace: number; // >0 => post-dash invincibility window
  trail: TrailPoint[];
  projectiles: PulseProjectile[];
  missiles: Missile[];
  waves: WaveFx[];
  blasts: Blast[];
  arcBolts: ArcBolt[];
  arcChain: ArcChainState | null;
  autocannonTimer: number; // >0 => turret active
  autocannonCooldown: number; // time until the next shot
  autocannonAngle: number; // last aim direction (for the turret barrel)
  bullets: Bullet[];
  meteorTimer: number; // >0 => storm active
  meteorCooldown: number; // time until the next strike
  vortices: Vortex[];
  razorTimer: number;
  cloakTimer: number;
  cloakBombCooldown: number;
  cloakBombs: CloakBomb[];
  flares: FlareDecoy[];
  thunderBolts: ThunderBolt[];
}

export type RunPhase = "playing" | "dying" | "dead";

/** What killed a drone, when it matters for scoring/visuals. */
export type KillSource = "pulse" | "thunder";

/** One-frame gameplay events, drained by main for audio/particles/shake. */
export type GameEvent =
  | {
      type: "droneKilled";
      x: number;
      y: number;
      scale: number;
      wasFrozen: boolean;
      source?: KillSource;
      points: number;
    }
  | { type: "mineExploded"; x: number; y: number; points: number }
  | { type: "pickup"; power: import("./config").PowerId; x: number; y: number }
  | { type: "pickupSpawn"; power: import("./config").PowerId; x: number; y: number }
  | { type: "formation"; kind: import("./config").FormationKind }
  | { type: "shieldUp" }
  | { type: "starshellUp" }
  | { type: "shieldDetonate"; x: number; y: number }
  | { type: "shockwave"; x: number; y: number }
  | { type: "pulseCharge" }
  | { type: "pulseFire"; x: number; y: number }
  | { type: "afterburnerCharge" }
  | { type: "dash" }
  | { type: "dashGrace" }
  | { type: "freeze"; x: number; y: number }
  | { type: "missilesFire" }
  | { type: "autocannonFire"; x: number; y: number }
  | { type: "meteorStrike"; x: number; y: number }
  | { type: "vortexOpen"; x: number; y: number }
  | { type: "vortexCollapse"; x: number; y: number }
  | { type: "arcZap"; x: number; y: number }
  | { type: "arcFizzle"; x: number; y: number }
  | { type: "chainBonus"; x: number; y: number; points: number; count: number }
  | { type: "pulseMultiKill"; x: number; y: number; points: number; hits: number }
  | { type: "graze"; x: number; y: number; points: number }
  | { type: "missileBlast"; x: number; y: number }
  | { type: "assembly"; x: number; y: number; kind: AssemblyKind }
  | { type: "assemblyBurst"; x: number; y: number; kind: AssemblyKind }
  | { type: "droneSpawn"; x: number; y: number }
  | { type: "ambientSpawn"; x: number; y: number }
  | { type: "floodSurge"; x: number; y: number }
  | { type: "lightsOut"; phase: "flicker" | "fake" }
  | { type: "lightsOut"; phase: "dark"; duration: number }
  | { type: "ringWarning" }
  | { type: "razorUp" }
  | { type: "thunderFire"; x: number; y: number }
  | { type: "cloakUp" }
  | { type: "cloakDown" }
  | { type: "flareDrop"; x: number; y: number }
  | { type: "ionPulse"; x: number; y: number }
  | { type: "howlersUp" }
  | { type: "lighthouseSpawn"; x: number; y: number }
  | { type: "lighthouseKill"; x: number; y: number; points: number }
  | { type: "death"; x: number; y: number };

export interface World {
  // view size in world units (recomputed on resize)
  viewW: number;
  viewH: number;

  /** Tutorial sandbox: no ambient spawns, mines, or timed pickups. */
  sandbox: boolean;

  /**
   * Training Ground (daily-only variant): a light unscored practice arena —
   * slow ambient trickle with a hard drone cap, no formations, assemblies,
   * or mines. Pickups drop normally so every power can be sampled.
   */
  training: boolean;

  /** Classic (escalating) or Iron Rain (pinned at peak difficulty). */
  gameMode: GameMode;

  /** Daily Patrol run (shared seed): player-dependent extras (pickup refill floor) off. */
  daily: boolean;

  /**
   * New-pilot grace (0..1): softens the opening burst, first-formation timing,
   * and early ambient spawn rate for a player's first few runs. 0 = normal.
   */
  grace: number;

  phase: RunPhase;
  time: number; // seconds survived
  deathTimer: number; // time since death (for explosion -> game over transition)

  ship: Ship;
  drones: Drone[];
  mines: Mine[];
  lighthouses: Lighthouse[];
  lighthouseTimer: number;
  pickups: Pickup[];
  spawnTelegraphs: SpawnTelegraph[];
  powers: PowersState;

  score: number;
  // score components, for the game-over breakdown (they sum to score)
  scoreKills: number;
  scoreSurvival: number;
  scoreBonuses: number; // chain / pulse multi-kill bonuses
  multiplier: number;
  multiplierDecayTimer: number;
  kills: number;
  maxMultiplier: number;
  chainCount: number; // consecutive kills within the chain window
  chainTimer: number; // time left to extend the chain

  // spawner state
  spawnAccumulator: number;
  /** Zero-ambient formation days only: budget for the late stray-drone trickle,
   * kept off spawnAccumulator (which their formation cadence keeps zeroing).
   * See mutators.ts lateFormationGrowth; stays 0 on every other day and mode. */
  lateAmbientAccumulator: number;
  formationTimer: number;
  nextFormationDelay: number;
  sustainedSpawnCooldown: number;
  pickupTimer: number;
  /** Times each power spawned this run (bad-luck protection in the roll). */
  powerSpawnCounts: Partial<Record<PowerId, number>>;
  mineTimer: number;
  /** STARFALL only: countdown to the next meteor telegraph (schedule stream). */
  meteorRainTimer: number;
  /** STARFALL only: pending impact reticles, counting down to their strike. */
  meteorTelegraphs: MeteorTelegraph[];
  /** THE FLOOD only: countdown to the next metronome pop. */
  floodSurgeTimer: number;
  /** Unused on the metronome Flood (kept so World stays stable). */
  floodTelegraphs: FloodTelegraph[];
  /** BLACKOUT only: idle / flicker / dark. Harmless on other days. */
  blackoutPhase: "idle" | "flicker" | "dark";
  /** BLACKOUT only: remaining time in the current phase (schedule stream). */
  blackoutTimer: number;
  /** BLACKOUT only: gap to apply when the current dark ends (already drawn). */
  blackoutNextGap: number;
  /** BLACKOUT only: first flicker is always a real outage. */
  blackoutHadReal: boolean;
  /** Countdown to the next drone-evolution event (schedule stream). */
  assemblyTimer: number;
  /** Cooldown for crowd-pressure evolutions (Math.random side, off-stream). */
  crowdAssemblyTimer: number;
  assemblies: Assembly[];
  /** Creature days only: countdown to the next choreographed event (schedule stream). */
  creatureTimer: number;
  /** Creature days only: scripted assemblies queued to materialize. */
  creatureSpawnQueue: CreatureSpawn[];
  /** MENAGERIE only: kind of the last scheduled event, for consecutive-repeat avoidance. */
  creatureLastKind: AssemblyKind | null;

  shake: number; // screen shake amplitude (world units)

  events: GameEvent[];

  /** Tightest graze of the run so far (the game-over "closest call" highlight). */
  closestCall: ClosestCall | null;
  /** Closest grazes of the run, smallest clearance first, capped at 5. */
  topGrazes: ClosestCall[];

  /**
   * Clip sidecar ship track: `[t, x, y]` at 2 Hz from world.time and ship
   * position only. Frozen arena/view are the run-start sizes (world units /
   * canvas CSS px); resizeWorld does not rewrite them.
   */
  shipTrack: [number, number, number][];
  clipArena: { w: number; h: number };
  clipView: { w: number; h: number };
}
