// In-run game feel: kill and graze feedback today, the Rising Gold HUD feel
// later. Everything here is cosmetic and uses Math.random only (never the
// seeded sim streams). The `graze` and `droneKilled` bodies were moved here
// unchanged from main.ts drainEvents, so later feel work edits only this file.

import { PALETTE, SCORING, SHIP } from "./config";
import type { HudParams } from "./flags";
import { hapticGraze } from "./native";
import type { RenderOpts } from "./render";
import type { FxContext, GameEvent, World } from "./types";

// --- Rising Gold in-run HUD constants (design constants, not switches) ---
/** Score size in CSS px: the one big number. */
export const SCORE_PX_PHONE = 34;
export const SCORE_PX_DESKTOP = 40;
/**
 * Kill pop rise and life (see popups.ts). The rise is deliberately in WORLD
 * units (0.9, about 30 to 55 CSS px depending on field scale) so it scales with
 * the ship; the plan's flat 24 px was dropped on purpose (review item e).
 */
export const POP_RISE_WORLD = 0.9;
export const POP_MS = 450;
/** At most one kill pop per this many ms, so a mass kill reads as one number. */
export const KILL_POP_MIN_GAP_MS = 120;
/**
 * No kill, chain or graze pops this long after an overdriveFire, so the form
 * name is the only text near the ship (was 300 ms and kill pops only).
 */
export const KILL_POP_AFTER_FIRE_MS = 500;
/** Crowding radius for the danger vignette, in drawn ship lengths. */
export const VIGNETTE_RADIUS_SHIP_LENGTHS = 1.5;
/** A drawn hull is about 1.1 world units long before visualScale. */
const SHIP_LENGTH_WORLD = 1.1 * SHIP.visualScale;
const VIGNETTE_RADIUS = VIGNETTE_RADIUS_SHIP_LENGTHS * SHIP_LENGTH_WORLD;
/** Drones inside the radius that give the full vignette. */
const VIGNETTE_FULL_AT = 4;
/** Seconds of the vignette easing toward its target. */
const VIGNETTE_EASE = 0.18;
/** Stick: continuous use before it dims, dimmed alpha, fade duration. */
export const STICK_FADE_AFTER_S = 1;
export const STICK_FADE_ALPHA = 0.15;
const STICK_FADE_S = 0.4;
/** Multiplier chain bar flickers when about to lose a sub-x2 multiplier. */
const FLICKER_BELOW_MULT = 2;
const FLICKER_WINDOW_S = 0.6;
/** Screen-space HUD metrics. */
const HUD_PAD = 18;
const HUD_LEFT_MAX_W = 240;
const CENTER_HALF_W = 24; // half-width of the time readout at 22px

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// --- pure helpers (tested in scripts/test-feel.ts) ---

/** 0..1 fill of the multiplier chain bar: the hold window before decay starts. */
export function chainBarFill(world: World): number {
  if (world.multiplier <= 1.01) return 0;
  return clamp01(world.multiplierDecayTimer / SCORING.multiplierDecayDelay);
}

/** True while a sub-x2 multiplier is about to start draining. */
export function chainBarFlicker(world: World): boolean {
  const m = world.multiplier;
  const t = world.multiplierDecayTimer;
  return m > 1.01 && m < FLICKER_BELOW_MULT && t > 0 && t < FLICKER_WINDOW_S;
}

/** Stick alpha multiplier: 1 for the first second of use, then eases to STICK_FADE_ALPHA; 0 when idle. */
export function stickAlpha(heldSeconds: number, idle: boolean, hud: HudParams | null): number {
  if (!hud || !hud.stickFade) return 1;
  if (idle) return 0;
  const over = heldSeconds - STICK_FADE_AFTER_S;
  if (over <= 0) return 1;
  const k = clamp01(over / STICK_FADE_S);
  return 1 + (STICK_FADE_ALPHA - 1) * k;
}

/** 0..1 crowding: live, mobile drones within the vignette radius of the hull. Allocation free. */
export function vignetteAmount(world: World): number {
  const { x, y } = world.ship;
  const r = VIGNETTE_RADIUS;
  const r2 = r * r;
  let n = 0;
  const drones = world.drones;
  for (let i = 0; i < drones.length; i++) {
    const d = drones[i];
    if (!d.alive || d.frozen > 0) continue;
    const dx = d.x - x;
    if (dx > r || dx < -r) continue; // bounding box first
    const dy = d.y - y;
    if (dy > r || dy < -r) continue;
    if (dx * dx + dy * dy <= r2) n++;
  }
  return clamp01(n / VIGNETTE_FULL_AT);
}

/** Kill pops only inside a real chain, with the switch on and effects full. */
export function killPopAllowed(chainCount: number, hud: HudParams | null, effects: "full" | "lite"): boolean {
  return !!hud && hud.pops && effects === "full" && chainCount >= hud.killPopMinChain;
}

export interface HudRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface HudLayout {
  pad: number;
  padTop: number;
  /** Top-left block: score, multiplier, chain bar, best. */
  scoreY: number;
  multY: number;
  barY: number;
  barH: number;
  bestY: number;
  /** Width the score may use before it must shrink. */
  scoreMaxW: number;
  leftRect: HudRect;
  centerRect: HudRect;
  pauseRect: HudRect;
  /** Bottom edge (CSS y) the power timers must stay above. */
  bottomLimit: number;
}

/** Same placement as today with the new score block stacked under the same padTop. Pure. */
export function hudLayout(
  cssW: number,
  cssH: number,
  safe: { top: number; right: number; bottom: number; left: number },
  daily: boolean,
  scorePx: number,
): HudLayout {
  const pad = HUD_PAD + safe.left;
  const padTop = HUD_PAD + safe.top;
  const scoreY = padTop;
  const multY = scoreY + Math.round(scorePx * 1.12);
  const barY = multY + 24;
  const barH = 4;
  const bestY = barY + barH + 6;
  const scoreMaxW = Math.min(HUD_LEFT_MAX_W, cssW / 2 - CENTER_HALF_W - 8 - pad);
  const centerBottom = daily ? padTop + 76 : padTop + 28;
  return {
    pad,
    padTop,
    scoreY,
    multY,
    barY,
    barH,
    bestY,
    scoreMaxW,
    leftRect: { x: 0, y: 0, w: pad + scoreMaxW, h: bestY + 18 },
    centerRect: { x: cssW / 2 - 160, y: 0, w: 320, h: centerBottom },
    pauseRect: { x: cssW - 72 - safe.right, y: safe.top, w: 72, h: 72 },
    bottomLimit: cssH - safe.bottom,
  };
}

/** Largest score font (<= basePx) that fits maxW, using a per-glyph estimate for tabular Rajdhani. */
export function fitScorePx(chars: number, maxW: number, basePx: number): number {
  const need = chars * 0.56 * basePx;
  if (need <= maxW) return basePx;
  return Math.max(20, Math.floor((maxW / (chars * 0.56)) * 10) / 10);
}

// Kill pop budget (cosmetic, wall clock). The clock is injectable for tests.
let popClock: () => number = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
let lastPopAt = -Infinity;
let lastFireAt = -Infinity;
/** Test seam: replace the clock and clear the budget. */
export function resetKillPopBudget(clock?: () => number): void {
  if (clock) popClock = clock;
  lastPopAt = -Infinity;
  lastFireAt = -Infinity;
}

/**
 * Call once per drained batch, before the events are handled: burst kills are
 * pushed before the overdriveFire event, so the quiet window must open first.
 */
export function primeFire(events: readonly GameEvent[]): void {
  for (const e of events) if (e.type === "overdriveFire") lastFireAt = popClock();
}

/** True while the form name owns the ship: popups other than it hold back. */
export function firePopQuiet(ctx: FxContext): boolean {
  return !!ctx.flags.overdriveFx?.formPopup && popClock() - lastFireAt < KILL_POP_AFTER_FIRE_MS;
}

/** True when this pickup's orb is being spent on a form, so its label is dropped. */
export function pickupLabelSuppressed(events: readonly GameEvent[], power: string, ctx: FxContext): boolean {
  if (!ctx.flags.overdriveFx?.formPopup) return false;
  return events.some((o) => o.type === "overdriveFire" && o.form && o.power === power);
}

/** React to a gameplay event. */
export function onEvent(e: GameEvent, ctx: FxContext): void {
  const { particles, popups, audio, world } = ctx;
  switch (e.type) {
    case "droneKilled": {
      if (e.wasFrozen) {
        particles.burst(e.x, e.y, [PALETTE.freeze, PALETTE.white, "#dffaff"], 16, 4, 0.7, 0.1);
      } else if (e.source === "pulse") {
        particles.burst(e.x, e.y, [PALETTE.pulse, PALETTE.goldPale, "#ffcc77"], 16, 5, 0.65, 0.12);
      } else {
        particles.burst(e.x, e.y, [PALETTE.redBright, PALETTE.gold, "#ff8866"], 14, 5, 0.6, 0.12);
      }
      // no floating +points outside a real chain: with the dense swarm the
      // numbers cluttered the view. ui.hud adds a rising +N inside chains only.
      audio.droneKill();
      if (killPopAllowed(world.chainCount, ctx.flags.hud, ctx.effects)) {
        const now = popClock();
        if (now - lastPopAt >= KILL_POP_MIN_GAP_MS && !firePopQuiet(ctx)) {
          lastPopAt = now;
          popups.spawnRising(e.x, e.y + 0.3, `+${e.points}`, PALETTE.goldPale, 0.5, POP_MS / 1000, POP_RISE_WORLD);
        }
      }
      break;
    }
    case "overdriveFire":
      lastFireAt = popClock();
      break;
    case "graze":
      particles.burst(e.x, e.y, [PALETTE.goldPale, PALETTE.white], 5, 2.5, 0.3, 0.06);
      particles.grazeArc(Math.atan2(e.y - world.ship.y, e.x - world.ship.x));
      audio.graze();
      void hapticGraze();
      if (!firePopQuiet(ctx)) popups.spawn(e.x, e.y + 0.55, `+${e.points}`, PALETTE.gold, 0.72, 1.15);
      if (ctx.flags.hud?.pops && ctx.effects === "full") particles.ringPulse();
      break;
  }
}

// Danger vignette state: eased so a drone grazing past does not strobe the edge.
let vigLevel = 0;
let vigLastT = 0;
let vigGrad: CanvasGradient | null = null;
let vigW = 0;
let vigH = 0;

/** Screen-space overlay drawn once per frame inside the field clip. Vignette only, ui.hud + full effects. */
export function drawOverlay(g: CanvasRenderingContext2D, world: World, opts: RenderOpts): void {
  const hud = opts.flags.hud;
  if (!hud || !hud.vignette || opts.effects !== "full" || world.phase !== "playing") {
    vigLevel = 0;
    return;
  }
  const dt = Math.min(0.1, Math.max(0, opts.uiTime - vigLastT));
  vigLastT = opts.uiTime;
  const target = vignetteAmount(world);
  vigLevel += (target - vigLevel) * Math.min(1, dt / VIGNETTE_EASE);
  const a = vigLevel * hud.vignetteMaxAlpha;
  if (a < 0.01) return;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const w = g.canvas.width / dpr;
  const h = g.canvas.height / dpr;
  if (!vigGrad || vigW !== w || vigH !== h) {
    const r = Math.hypot(w, h) / 2;
    vigGrad = g.createRadialGradient(w / 2, h / 2, r * 0.55, w / 2, h / 2, r);
    vigGrad.addColorStop(0, "rgba(255,68,85,0)");
    vigGrad.addColorStop(1, "rgba(255,68,85,1)");
    vigW = w;
    vigH = h;
  }
  g.save();
  g.globalAlpha = a;
  g.fillStyle = vigGrad;
  g.fillRect(0, 0, w, h);
  g.restore();
}
