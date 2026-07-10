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

export const randRange = (min: number, max: number): number =>
  min + Math.random() * (max - min);

export const randDir = (): Vec2 => {
  const a = Math.random() * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
};

/** Random point inside the unit circle (like Unity's Random.insideUnitCircle). */
export const randInCircle = (): Vec2 => {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random());
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
};

/** Evaluate a linear ramp that plateaus (Unity AnimationCurve.Linear equivalent). */
export const ramp = (
  minutes: number,
  cfg: { from: number; to: number; plateauMinutes: number },
): number => lerp(cfg.from, cfg.to, clamp01(minutes / cfg.plateauMinutes));

/** Cheap smooth pseudo-noise in [-1, 1] (stand-in for Perlin jitter). */
export const smoothNoise = (t: number, seed: number): number =>
  Math.sin(t * 2.1 + seed) * 0.6 + Math.sin(t * 3.7 + seed * 2.3) * 0.4;
