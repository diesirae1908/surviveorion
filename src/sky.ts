// Sky background (owner: WS-K).
//
// Contract for `drawSky`: render() calls it in place of `drawStars` while the
// WORLD transform is active (world units, y up, field clip on), so everything
// is drawn in world space. Both layers are fixed to the field: the ship never
// moves them (the ship parallax was removed 2026-11-12, the owner disliked the
// screen moving with the ship). Return true when the sky drew (the caller then
// skips the old star field), false to fall back to the old stars.
//
// Look: two cached offscreen layers, a far nebula (soft tinted blobs and one
// faint band) and a near dust field (fine points, a few flared stars). They are
// generated at resize (200 ms debounce) and at tint change, with Math.random at
// generation only, and drawn with two drawImage calls per frame: no per-frame
// gradients. The tint follows the day's mutator(s) and stays inside the brand
// palette (Void, Rising Red low alpha, Hull Gold low alpha, Starlight). Layer
// alpha is kept low so drones, telegraphs and the red swarm always read first.
// Switch: ui.hud.sky (default OFF), effects "full" only.

import type { ClientFlags } from "./flags";
import type { Mutator } from "./mutators";
import type { FieldLayout } from "./playView";
import type { World } from "./types";

export interface SkyArgs {
  /** CSS size of the canvas and the world size of the field. */
  viewport: { cssW: number; cssH: number; viewW: number; viewH: number };
  field: FieldLayout;
  world: World;
  /** Active mutators for the day (empty outside the daily). */
  mutators: Mutator[];
  uiTime: number;
  flags: ClientFlags;
  effects: "full" | "lite";
}

// --- design constants (named, not switches) ---

/** Brand tokens the sky may use (brand/tokens/orion.tokens.css). */
export const SKY_TOKENS = {
  void: "#0a0a12",
  deepSpace: "#12121e",
  hullLine: "#2a2a3a",
  gold: "#ffd700",
  ingot: "#cc8800",
  flare: "#ffee88",
  red: "#c41e3a",
  ash: "#7a1020",
  starlight: "#fff7e0",
} as const;

export type SkyTintName = "void" | "red" | "gold" | "starlight";
export interface SkyTint {
  name: SkyTintName;
  /** Token color of the nebula body. */
  color: string;
  /** Token color of the highlights inside the nebula. */
  accent: string;
  /** Nebula blob alpha ceiling (kept low so gameplay reads). */
  alpha: number;
}

const TINTS: Record<SkyTintName, SkyTint> = {
  void: { name: "void", color: SKY_TOKENS.hullLine, accent: SKY_TOKENS.deepSpace, alpha: 0.5 },
  red: { name: "red", color: SKY_TOKENS.ash, accent: SKY_TOKENS.red, alpha: 0.5 },
  gold: { name: "gold", color: SKY_TOKENS.ingot, accent: SKY_TOKENS.gold, alpha: 0.3 },
  starlight: { name: "starlight", color: SKY_TOKENS.hullLine, accent: SKY_TOKENS.starlight, alpha: 0.45 },
};
const TINT_NAMES: SkyTintName[] = ["void", "red", "gold", "starlight"];
/** Every color the sky can paint with, for tests. */
export const SKY_TOKEN_COLORS: ReadonlySet<string> = new Set(Object.values(SKY_TOKENS));

/** Resize debounce before the layers regenerate. */
export const SKY_RESIZE_DEBOUNCE_MS = 200;
/** Slow far-layer drift amplitude (world units). Time-based, never ship-based. */
export const DRIFT = 0.18;
/** Layer overscan (world units) so the drift never shows an edge. */
export const OVERSCAN = DRIFT + 0.3;

const NEUTRAL: SkyTint = TINTS.void;

// --- tint by mutator (pure) ---

/** Exclusion tags are the only theme data the pool carries; map them to a tint. */
const TAG_TINT: Record<string, SkyTintName> = {
  tempo: "red",
  density: "red",
  "formation-kind": "red",
  "assembly-kind": "red",
  mines: "red",
  "drone-size": "red",
  "pickup-rate": "gold",
  "pickup-behavior": "gold",
  "power-amp": "gold",
  monopower: "starlight",
  scoring: "gold",
  visibility: "void",
  "arena-size": "starlight",
  physics: "starlight",
};

/** FNV-1a over the id, into one of the four tints. */
export function hashTint(id: string): SkyTintName {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return TINT_NAMES[h % TINT_NAMES.length];
}

/**
 * Tint for one mutator: override flags first (they name the look), then
 * exclusion tags, then a hash of the id so a future mutator always gets one of
 * the four tokens. Never branches on a mutator id.
 */
export function skyTintOf(m: Mutator): SkyTint {
  const o = m.overrides;
  if (o.blackoutPulse) return TINTS.void;
  if (o.redTint || o.floodSurgeActive) return TINTS.red;
  if (o.meteorRainActive) return TINTS.gold;
  for (const t of m.tags) {
    const n = TAG_TINT[t];
    if (n) return TINTS[n];
  }
  return TINTS[hashTint(m.id)];
}

/** Far and near layer tints. Sunday pairs put the second mutator in the near layer. Empty list: neutral Void. */
export function skyTintFor(mutators: readonly Mutator[]): { far: SkyTint; near: SkyTint } {
  if (mutators.length === 0) return { far: NEUTRAL, near: NEUTRAL };
  const far = skyTintOf(mutators[0]);
  const near = mutators.length > 1 ? skyTintOf(mutators[1]) : far;
  return { far, near };
}

// --- layer plans (pure, rng injected) ---

export interface NebulaBlob {
  x: number;
  y: number;
  /** Radii in world units (rx > ry stretches it into a band piece). */
  rx: number;
  ry: number;
  rot: number;
  alpha: number;
  accent: boolean;
}
export interface DustPoint {
  x: number;
  y: number;
  r: number;
  alpha: number;
  /** 0 starlight, 1 tint accent. */
  warm: boolean;
}
export interface FlareStar {
  x: number;
  y: number;
  size: number;
  alpha: number;
}
export interface SkyPlan {
  /** Layer extent in world units, centered on the origin. */
  w: number;
  h: number;
  blobs: NebulaBlob[];
  dust: DustPoint[];
  flares: FlareStar[];
}

export function planSky(viewW: number, viewH: number, rng: () => number = Math.random): SkyPlan {
  const w = viewW + OVERSCAN * 2;
  const h = viewH + OVERSCAN * 2;
  const blobs: NebulaBlob[] = [];
  // one diagonal band (a faint galactic ridge) built from overlapping stretched blobs
  const bandAngle = (rng() - 0.5) * 0.9 + (rng() < 0.5 ? 0.35 : -0.35);
  const bandLen = Math.hypot(w, h) * 0.42;
  const bandPieces = 5;
  for (let i = 0; i < bandPieces; i++) {
    const t = (i / (bandPieces - 1) - 0.5) * 2;
    blobs.push({
      x: Math.cos(bandAngle) * t * bandLen + (rng() - 0.5) * 2,
      y: Math.sin(bandAngle) * t * bandLen + (rng() - 0.5) * 2,
      rx: Math.max(w, h) * (0.2 + rng() * 0.08),
      ry: Math.max(w, h) * (0.05 + rng() * 0.03),
      rot: bandAngle,
      alpha: 0.7 + rng() * 0.3,
      accent: false,
    });
  }
  // a few round clouds off the band, two of them with the accent color
  const clouds = 4;
  for (let i = 0; i < clouds; i++) {
    const r = Math.max(w, h) * (0.14 + rng() * 0.12);
    blobs.push({
      x: (rng() - 0.5) * w * 0.9,
      y: (rng() - 0.5) * h * 0.9,
      rx: r,
      ry: r * (0.55 + rng() * 0.4),
      rot: rng() * Math.PI,
      alpha: 0.35 + rng() * 0.35,
      accent: i < 2,
    });
  }
  const dust: DustPoint[] = [];
  const dustCount = Math.round(2.4 * viewW * viewH);
  for (let i = 0; i < dustCount; i++) {
    const big = rng() < 0.1;
    dust.push({
      x: (rng() - 0.5) * w,
      y: (rng() - 0.5) * h,
      r: big ? 0.026 + rng() * 0.022 : 0.009 + rng() * 0.014,
      alpha: big ? 0.45 + rng() * 0.4 : 0.14 + rng() * 0.4,
      warm: rng() < 0.18,
    });
  }
  const flares: FlareStar[] = [];
  const flareCount = Math.max(4, Math.round(0.028 * viewW * viewH));
  for (let i = 0; i < flareCount; i++) {
    flares.push({
      x: (rng() - 0.5) * w,
      y: (rng() - 0.5) * h,
      size: 0.1 + rng() * 0.16,
      alpha: 0.4 + rng() * 0.4,
    });
  }
  return { w, h, blobs, dust, flares };
}

// --- resize debounce (pure, clock and timers injected) ---

export interface SkyKey {
  viewW: number;
  viewH: number;
  scale: number;
  far: SkyTintName;
  near: SkyTintName;
}
export const sameSkyKey = (a: SkyKey | null, b: SkyKey): boolean =>
  !!a && a.viewW === b.viewW && a.viewH === b.viewH && Math.abs(a.scale - b.scale) < 1e-6 && a.far === b.far && a.near === b.near;

/**
 * Decides when to (re)generate. First build and tint changes build at once;
 * a pure size or scale change waits until the size has been stable for
 * `SKY_RESIZE_DEBOUNCE_MS`, and the old layers keep drawing meanwhile.
 */
export class SkyScheduler {
  private built: SkyKey | null = null;
  private pending: SkyKey | null = null;
  private pendingSince = 0;
  /** Returns true when the caller must build now for `key`. `nowMs` is any monotonic clock. */
  shouldBuild(key: SkyKey, nowMs: number): boolean {
    if (!this.built) return this.commit(key);
    if (sameSkyKey(this.built, key)) {
      this.pending = null;
      return false;
    }
    if (this.built.far !== key.far || this.built.near !== key.near) return this.commit(key);
    if (!sameSkyKey(this.pending, key)) {
      this.pending = key;
      this.pendingSince = nowMs;
      return false;
    }
    if (nowMs - this.pendingSince >= SKY_RESIZE_DEBOUNCE_MS) return this.commit(key);
    return false;
  }
  private commit(key: SkyKey): boolean {
    this.built = key;
    this.pending = null;
    return true;
  }
}

// --- canvas layers (browser only) ---

interface Layer {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}
let farLayer: Layer | null = null;
let nearLayer: Layer | null = null;
const scheduler = new SkyScheduler();

function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  return c;
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function buildFar(plan: SkyPlan, tint: SkyTint, pxPerUnit: number): Layer | null {
  const c = makeCanvas(plan.w * pxPerUnit, plan.h * pxPerUnit);
  const g = c?.getContext("2d");
  if (!c || !g) return null;
  const sx = c.width / plan.w;
  const sy = c.height / plan.h;
  g.translate(c.width / 2, c.height / 2);
  g.scale(sx, sy);
  for (const b of plan.blobs) {
    const color = b.accent ? tint.accent : tint.color;
    const a = b.alpha * tint.alpha * (b.accent ? 0.55 : 1);
    g.save();
    g.translate(b.x, b.y);
    g.rotate(b.rot);
    g.scale(1, b.ry / b.rx);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, b.rx);
    grad.addColorStop(0, rgba(color, a));
    grad.addColorStop(0.55, rgba(color, a * 0.4));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, b.rx, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  return { canvas: c, w: plan.w, h: plan.h };
}

function buildNear(plan: SkyPlan, tint: SkyTint, pxPerUnit: number): Layer | null {
  const c = makeCanvas(plan.w * pxPerUnit, plan.h * pxPerUnit);
  const g = c?.getContext("2d");
  if (!c || !g) return null;
  g.translate(c.width / 2, c.height / 2);
  g.scale(c.width / plan.w, c.height / plan.h);
  for (const d of plan.dust) {
    g.globalAlpha = d.alpha;
    g.fillStyle = d.warm ? tint.accent : SKY_TOKENS.starlight;
    g.beginPath();
    g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    g.fill();
  }
  // a few flared stars: soft halo plus a thin four-point cross
  for (const s of plan.flares) {
    const halo = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
    halo.addColorStop(0, rgba(SKY_TOKENS.starlight, 0.35 * s.alpha));
    halo.addColorStop(1, rgba(SKY_TOKENS.starlight, 0));
    g.globalAlpha = 1;
    g.fillStyle = halo;
    g.beginPath();
    g.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = s.alpha;
    g.fillStyle = SKY_TOKENS.starlight;
    g.fillRect(s.x - s.size, s.y - 0.004, s.size * 2, 0.008);
    g.fillRect(s.x - 0.004, s.y - s.size, 0.008, s.size * 2);
    g.beginPath();
    g.arc(s.x, s.y, 0.028, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return { canvas: c, w: plan.w, h: plan.h };
}

function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, ox: number, oy: number, alpha: number): void {
  ctx.globalAlpha = alpha;
  // world transform is y-up: negative height keeps the bitmap upright
  ctx.drawImage(l.canvas, -l.w / 2 + ox, l.h / 2 + oy, l.w, -l.h);
}

/** True when the sky is on for these args (switch on, full effects). */
export function skyEnabled(flags: ClientFlags, effects: "full" | "lite"): boolean {
  return effects === "full" && !!flags.hud && flags.hud.sky === true;
}

/** Draws the sky and returns true; returns false (old stars) when off, lite, or no canvas. */
export function drawSky(ctx: CanvasRenderingContext2D, args: SkyArgs): boolean {
  if (!skyEnabled(args.flags, args.effects)) return false;
  const { viewW, viewH } = args.viewport;
  const tint = skyTintFor(args.mutators);
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const key: SkyKey = { viewW, viewH, scale: args.field.scale, far: tint.far.name, near: tint.near.name };
  if (scheduler.shouldBuild(key, now)) {
    const plan = planSky(viewW, viewH);
    // far layer is soft, so half resolution; near keeps dust crisp (cap the texture side)
    const nearPx = Math.min(args.field.scale * dpr, 1400 / plan.w);
    farLayer = buildFar(plan, tint.far, Math.max(4, args.field.scale * 0.5));
    nearLayer = buildNear(plan, tint.near, Math.max(8, nearPx));
  }
  if (!farLayer || !nearLayer) return false;
  // BLACKOUT lights-out: draw nothing extra, the field stays black
  if (args.world.blackoutPhase === "dark") return true;
  const drift = Math.sin(args.uiTime * 0.05) * DRIFT;
  const twinkle = 0.9 + 0.1 * Math.sin(args.uiTime * 1.3);
  ctx.save();
  drawLayer(ctx, farLayer, drift, drift * 0.6, 1);
  drawLayer(ctx, nearLayer, 0, 0, twinkle);
  ctx.restore();
  return true;
}
