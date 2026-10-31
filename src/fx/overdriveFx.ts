// OVERDRIVE presentation: hull charge ring, HOT glow, swarm heat tint, form
// popups and stings. Cosmetic only: it reads world.overdrive and never writes
// the sim. All randomness here is Math.random (inside particles). Gated by the
// `ui.overdriveFx` switch: with it off (null) every entry point returns early.
// Gold = pilot/reward, red = swarm (brand tokens).

import { PALETTE, POWER_COLORS, type PowerId } from "../config";
import type { OverdriveFxParams } from "../flags";
import { hapticGraze } from "../native";
import { alwaysHotScale } from "../overdrive";
import type { RenderOpts } from "../render";
import type { Drone, FxContext, GameEvent, World } from "../types";

// --- design constants (not switches) ---
/** Ring stroke width in screen CSS px (kept constant across field sizes). */
export const RING_WIDTH_PX = 3;
/** HOT pulse rate. */
export const HOT_PULSE_HZ = 2;
/** Ring radius in world units: clear of the 0.8-scale hull (about 0.44 long). */
export const RING_RADIUS = 0.56;
/** Fallback heat radius when the run has no overdrive rules (matches the registry default). */
export const DEFAULT_HOT_RADIUS = 3;
/** A heated swarm drone reads hotter than the base red (#ff4455), not just "red". */
export const HEAT_INNER = "#ff9a66";
export const HEAT_OUTER = "#b3202c";
export const HEAT_STROKE = "#ffb08a";
export const HEAT_CORE = "#fff0c8";

const TAU = Math.PI * 2;
const START = Math.PI / 2; // 12 o'clock in the y-up world

/** Phase 1 form names (copy, plan decision 5). Burst-only fires say OVERDRIVE. */
export const FORM_NAMES: Partial<Record<PowerId, string>> = {
  pulse: "PULSE FAN",
  shield: "SHIELD NOVA",
  freeze: "CRYO CHAIN",
  magnet: "MAGNET SWEEP",
  shockwave: "ECHO WAVE",
  missiles: "MISSILE STORM",
  starshell: "STAR NOVA",
  arc: "ARC STORM",
  autocannon: "TWIN CANNON",
  meteors: "METEOR SIEGE",
  razor: "BLADE DANCE",
  thunder: "THUNDER WALL",
  cloak: "GHOST BOMBS",
  flare: "LONG FLARE",
  ion: "ION SURGE",
  howlers: "PACK HOWL",
  vortex: "DEEP VORTEX",
};
export const BURST_NAME = "OVERDRIVE";

/** Popup label for an overdriveFire event. */
export function formLabel(power: PowerId, form: boolean): string {
  if (!form) return BURST_NAME;
  return FORM_NAMES[power] ?? BURST_NAME;
}

/** Swept angle (radians) of the charge arc. */
export function ringSweep(charge: number): number {
  return (charge <= 0 ? 0 : charge >= 1 ? 1 : charge) * TAU;
}

/** True when this drone should read as heated: HOT ship, loose, hostile, in range. */
export function isHeated(world: World, d: Drone, fx: OverdriveFxParams | null): boolean {
  if (!fx || !fx.heatTint) return false;
  // HOT hull, or a mutator (OVERCHARGE) that keeps the swarm hot (alwaysHotScale > 1)
  if (!world.overdrive.hot && alwaysHotScale(world) <= 1) return false;
  if (d.allied || d.assembly || d.frozen > 0 || (d.slamTimer ?? 0) > 0) return false;
  const r = world.rules.overdrive?.hotRadius ?? DEFAULT_HOT_RADIUS;
  const dx = d.x - world.ship.x;
  const dy = d.y - world.ship.y;
  return dx * dx + dy * dy <= r * r;
}

/** React to a gameplay event. */
export function onEvent(e: GameEvent, ctx: FxContext): void {
  const fx = ctx.flags.overdriveFx;
  if (!fx) return;
  const lite = ctx.effects === "lite";
  const { particles, popups, audio, world } = ctx;
  switch (e.type) {
    case "overdriveHot": {
      if (fx.stings) audio.overdriveHot();
      const s = world.ship;
      particles.burst(s.x, s.y, [PALETTE.gold, PALETTE.goldPale, PALETTE.white], lite ? 10 : 26, 5, 0.6, 0.1);
      if (!lite) particles.ringPulse();
      void hapticGraze();
      break;
    }
    case "overdriveFire": {
      if (fx.stings) audio.overdriveFire();
      const color = POWER_COLORS[e.power];
      particles.burst(e.x, e.y, [PALETTE.gold, PALETTE.goldPale, color], lite ? 14 : 36, 7, 0.8, 0.14);
      if (fx.formPopup) {
        popups.spawn(e.x, e.y + 1.15, formLabel(e.power, e.form), PALETTE.gold, 0.8, 1.3);
      }
      break;
    }
    case "overdriveCool":
      if (fx.stings) audio.overdriveCool();
      break;
  }
}

/**
 * Hull ring, drawn after the ship inside the world transform (y up).
 * Charge sweeps a gold arc clockwise from 12 o'clock; HOT is a full pulsing
 * ring with a goldPale bloom and a faint red heat halo at the heat radius.
 * `pxPerUnit` turns the screen-px ring width into world units.
 */
export function drawShipOverlay(
  g: CanvasRenderingContext2D,
  world: World,
  opts: RenderOpts,
  x: number,
  y: number,
  pxPerUnit: number,
): void {
  const fx = opts.flags.overdriveFx;
  if (!fx) return;
  const od = world.overdrive;
  const charge = od.charge;
  if (!od.hot && charge < 0.01) return;
  const lite = opts.effects === "lite";
  const w = RING_WIDTH_PX / Math.max(1, pxPerUnit);
  const pulse = 0.5 + 0.5 * Math.sin(opts.uiTime * TAU * HOT_PULSE_HZ);

  g.save();
  g.lineCap = "round";

  if (od.hot) {
    // heat halo at the heat radius: you see how far the swarm feels you
    if (fx.heatTint && !lite) {
      const hr = world.rules.overdrive?.hotRadius ?? DEFAULT_HOT_RADIUS;
      const hg = g.createRadialGradient(x, y, hr * 0.55, x, y, hr);
      hg.addColorStop(0, "rgba(255,68,85,0)");
      hg.addColorStop(0.85, `rgba(255,68,85,${0.1 + 0.05 * pulse})`);
      hg.addColorStop(1, "rgba(255,68,85,0)");
      g.fillStyle = hg;
      g.beginPath();
      g.arc(x, y, hr, 0, TAU);
      g.fill();
    }
    g.globalCompositeOperation = "lighter";
    if (!lite) {
      // bloom: two wide soft strokes under the ring
      g.strokeStyle = PALETTE.goldPale;
      g.globalAlpha = 0.12 + 0.12 * pulse;
      g.lineWidth = w * 6;
      g.beginPath();
      g.arc(x, y, RING_RADIUS, 0, TAU);
      g.stroke();
      g.globalAlpha = 0.2 + 0.15 * pulse;
      g.lineWidth = w * 3;
      g.stroke();
    }
    // the ring itself, a touch wider than the charge arc so HOT reads at a glance
    g.globalAlpha = 0.75 + 0.25 * pulse;
    g.strokeStyle = PALETTE.goldPale;
    g.lineWidth = w * (1.2 + 0.4 * pulse);
    g.beginPath();
    g.arc(x, y, RING_RADIUS, 0, TAU);
    g.stroke();
    // orbiting spark so peripheral vision catches motion, not just brightness
    const a = START - opts.uiTime * TAU * HOT_PULSE_HZ * 0.5;
    g.fillStyle = PALETTE.white;
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(x + Math.cos(a) * RING_RADIUS, y + Math.sin(a) * RING_RADIUS, w * 1.6, 0, TAU);
    g.fill();
  } else {
    // dark underlay keeps the arc legible over the gold multiplier glow
    g.strokeStyle = "rgba(10,10,18,0.55)";
    g.globalAlpha = 1;
    g.lineWidth = w * 2.6;
    g.beginPath();
    g.arc(x, y, RING_RADIUS, 0, TAU);
    g.stroke();
    // faint track so the empty part of the ring still reads
    g.strokeStyle = PALETTE.white;
    g.globalAlpha = 0.12;
    g.lineWidth = w;
    g.beginPath();
    g.arc(x, y, RING_RADIUS, 0, TAU);
    g.stroke();
    // charge arc, brightening as it fills
    const sweep = ringSweep(charge);
    g.strokeStyle = charge > 0.8 ? PALETTE.goldPale : PALETTE.gold;
    g.globalAlpha = 0.75 + 0.25 * charge;
    g.lineWidth = w * 1.3;
    g.beginPath();
    g.arc(x, y, RING_RADIUS, START, START - sweep, true);
    g.stroke();
    // leading dot
    const a = START - sweep;
    g.fillStyle = PALETTE.goldPale;
    g.beginPath();
    g.arc(x + Math.cos(a) * RING_RADIUS, y + Math.sin(a) * RING_RADIUS, w * 0.9, 0, TAU);
    g.fill();
  }
  g.restore();
}

/**
 * Core color for a loose drone near a HOT ship. Returns `baseColor` unchanged
 * when the drone is not heated (callers compare to know whether to swap the
 * rest of the palette). No allocations: heated colors are constants.
 */
export function drawDroneTint(world: World, drone: Drone, baseColor: string, fx: OverdriveFxParams | null): string {
  return isHeated(world, drone, fx) ? HEAT_INNER : baseColor;
}
