import type { GameMode, PowerId } from "./config";

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

export interface PowersState {
  shieldActive: boolean; // persists until it absorbs a hit (banked extra life)
  starshellTimer: number; // >0 => invulnerable ram-kill shell active
  pulseTimer: number; // >0 => pulse charging
  magnetTimer: number;
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
}

export type RunPhase = "playing" | "dying" | "dead";

/** What killed a drone, when it matters for scoring/visuals. */
export type KillSource = "pulse";

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
  | { type: "ringWarning" }
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
  formationTimer: number;
  nextFormationDelay: number;
  sustainedSpawnCooldown: number;
  pickupTimer: number;
  /** Times each power spawned this run (bad-luck protection in the roll). */
  powerSpawnCounts: Partial<Record<PowerId, number>>;
  mineTimer: number;
  /** Countdown to the next drone-evolution event (schedule stream). */
  assemblyTimer: number;
  /** Cooldown for crowd-pressure evolutions (Math.random side, off-stream). */
  crowdAssemblyTimer: number;
  assemblies: Assembly[];

  shake: number; // screen shake amplitude (world units)

  events: GameEvent[];
}
