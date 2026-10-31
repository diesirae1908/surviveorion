// Equipped cosmetics (owner: WS-O2). Trails are unlocked by Pilot Ladder tier
// (src/ladder.ts) and are visual only: nothing here reads or writes sim state.
// Colors are the locked brand tokens (gold family and starlight); never red,
// because red is the swarm.

import { PALETTE } from "./config";
import { DEFAULT_TRAIL_ID, clampTier, unlockedTrails } from "./ladder";

export type TrailStyle = "ribbon" | "spark" | "twin" | "comet";

/** An equipped trail style, drawn behind the ship by `Renderer.drawTrail`. */
export interface TrailCosmetic {
  id: string;
  color: string;
  style: TrailStyle;
  /** Seconds a trail point lives (lite effects use `LITE_LIFE_SCALE` of it). */
  life: number;
  /** Ribbon width at the ship, world units. */
  width: number;
}

export const LITE_LIFE_SCALE = 0.6;

/** Hull Gold (the default) is `null`: no extra wake, today's look. */
export const TRAIL_COSMETICS: Record<string, TrailCosmetic> = {
  flare: { id: "flare", color: PALETTE.goldPale, style: "ribbon", life: 0.5, width: 0.16 },
  starlight: { id: "starlight", color: PALETTE.white, style: "ribbon", life: 0.7, width: 0.18 },
  spark: { id: "spark", color: PALETTE.gold, style: "spark", life: 0.7, width: 0.16 },
  twin: { id: "twin", color: PALETTE.gold, style: "twin", life: 0.7, width: 0.12 },
  comet: { id: "comet", color: PALETTE.gold, style: "comet", life: 1.15, width: 0.26 },
};

/** Trail definition for an id, or null for the default / an unknown id. */
export function trailCosmeticFor(id: string | null | undefined): TrailCosmetic | null {
  if (!id || id === DEFAULT_TRAIL_ID) return null;
  return TRAIL_COSMETICS[id] ?? null;
}

/**
 * What the next frame draws: the equipped trail if the pilot's ladder tier
 * unlocks it, else the default. The server already refuses a locked trail on
 * save; this re-check only keeps a stale cache from drawing one.
 */
export function equippedTrail(id: string | null | undefined, tier: number): TrailCosmetic | null {
  if (!id || !unlockedTrails(clampTier(tier)).includes(id)) return null;
  return trailCosmeticFor(id);
}

export interface WakePoint {
  x: number;
  y: number;
  /** Ship heading (radians) at this point. */
  a: number;
  /** Render clock (seconds) when sampled. */
  t: number;
}

/** Ring of recent ship positions, render side only (cosmetic, never sim state). */
export class ShipWake {
  points: WakePoint[] = [];
  private static readonly MAX = 90;

  push(x: number, y: number, a: number, t: number): void {
    const last = this.points[this.points.length - 1];
    // a clock that went backwards (new run) or a long jump (respawn) restarts the wake
    if (last && (t < last.t || Math.hypot(x - last.x, y - last.y) > 6)) this.points.length = 0;
    if (last && this.points.length > 0 && t - last.t < 0.012) return;
    this.points.push({ x, y, a, t });
    if (this.points.length > ShipWake.MAX) this.points.shift();
  }

  prune(now: number, life: number): void {
    let i = 0;
    while (i < this.points.length && now - this.points[i].t > life) i++;
    if (i > 0) this.points.splice(0, i);
  }

  clear(): void {
    this.points.length = 0;
  }
}

/** Deterministic 0..1 jitter from a timestamp (stable between frames, no RNG). */
export function wakeJitter(t: number, salt: number): number {
  const s = Math.sin(t * 91.7 + salt * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
