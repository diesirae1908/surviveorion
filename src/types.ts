import type { PowerId } from "./config";

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
  boostHeld: boolean;
  boostHoldTimer: number;
  boostCooldownTimer: number;
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

/** Expanding ring visual (shockwave / shield detonation). */
export interface WaveFx {
  x: number;
  y: number;
  elapsed: number;
  lifetime: number;
  maxRadius: number;
  color: string;
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
  shieldTimer: number; // >0 => shield active
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
  | { type: "shieldUp" }
  | { type: "starshellUp" }
  | { type: "shieldDetonate"; x: number; y: number }
  | { type: "shockwave"; x: number; y: number }
  | { type: "pulseCharge" }
  | { type: "pulseFire"; x: number; y: number }
  | { type: "boostStart" }
  | { type: "afterburnerCharge" }
  | { type: "dash" }
  | { type: "freeze"; x: number; y: number }
  | { type: "missilesFire" }
  | { type: "chainBonus"; x: number; y: number; points: number; count: number }
  | { type: "pulseMultiKill"; x: number; y: number; points: number; hits: number }
  | { type: "droneSpawn"; x: number; y: number }
  | { type: "ringWarning" }
  | { type: "death"; x: number; y: number };

export interface World {
  // view size in world units (recomputed on resize)
  viewW: number;
  viewH: number;

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
  mineTimer: number;

  shake: number; // screen shake amplitude (world units)

  events: GameEvent[];
}
