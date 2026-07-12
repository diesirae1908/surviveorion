export interface Vec2 {
  x: number;
  y: number;
}

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const moveTowards = (current: number, target: number, maxDelta: number): number => {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
};

export const len = (x: number, y: number): number => Math.hypot(x, y);

// --- gameplay RNG (seedable for Daily Patrol shared-seed runs) ---
// All *gameplay* randomness (spawner, formations, pickups, powers) draws from
// `rand` so a seeded run deals every player the same opening script. Cosmetic
// randomness (particles, starfield, audio noise) stays on Math.random.

/** mulberry32: tiny, fast, good-enough PRNG for gameplay scripting. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let gameplayRng: () => number = Math.random;

/** Seed the gameplay RNG for a run (null = back to true randomness). */
export function setRunSeed(seed: number | null): void {
  gameplayRng = seed === null ? Math.random : mulberry32(seed);
}

/** Deterministic 32-bit hash of a string (daily seed from the UTC date). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const rand = (): number => gameplayRng();

export const randRange = (min: number, max: number): number =>
  min + rand() * (max - min);

export const randDir = (): Vec2 => {
  const a = rand() * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
};

/** Random point inside the unit circle (like Unity's Random.insideUnitCircle). */
export const randInCircle = (): Vec2 => {
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(rand());
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
};

/** Evaluate a linear ramp that plateaus (Unity AnimationCurve.Linear equivalent). */
export const ramp = (
  minutes: number,
  cfg: { from: number; to: number; plateauMinutes: number },
): number => lerp(cfg.from, cfg.to, clamp01(minutes / cfg.plateauMinutes));

/**
 * Endless escalation: fast linear ramp to `to` over `rampMinutes`, then keeps
 * growing at `latePerMinute` forever (the Tetris model — every run ends).
 */
export const escalate = (
  minutes: number,
  cfg: { from: number; to: number; rampMinutes: number; latePerMinute: number },
): number =>
  minutes <= cfg.rampMinutes
    ? lerp(cfg.from, cfg.to, clamp01(minutes / cfg.rampMinutes))
    : cfg.to + cfg.latePerMinute * (minutes - cfg.rampMinutes);

/** Cheap smooth pseudo-noise in [-1, 1] (stand-in for Perlin jitter). */
export const smoothNoise = (t: number, seed: number): number =>
  Math.sin(t * 2.1 + seed) * 0.6 + Math.sin(t * 3.7 + seed * 2.3) * 0.4;
