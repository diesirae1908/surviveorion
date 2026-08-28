// BLACKOUT (Daily Mutator): flicker, then a real lights-out with a small
// lantern of visibility around the ship. Gaps between outages are 5-15s.
//
// Determinism: first delay, dark length, and the next-gap all ride the
// seeded SCHEDULE stream (one scheduleRange per transition). The overlay
// never looks at drones, mines, or the ship, so every pilot on today's
// seed sees the same outage times no matter how they fly. Flicker strobe
// is a pure function of world.time (no RNG).
//
// Fully gated behind mutatorBlackoutPulse(): every other day and mode
// is untouched.

import { BLACKOUT } from "./config";
import { scheduleRange } from "./math";
import { mutatorBlackoutPulse } from "./mutators";
import type { World } from "./types";

export function initBlackout(world: World): void {
  if (!mutatorBlackoutPulse()) return;
  world.blackoutPhase = "idle";
  world.blackoutTimer = scheduleRange(...BLACKOUT.firstDelayRange);
}

export function updateBlackout(world: World, dt: number): void {
  if (world.phase !== "playing" || world.sandbox || !mutatorBlackoutPulse()) return;

  world.blackoutTimer -= dt;
  while (world.blackoutTimer <= 0) {
    if (world.blackoutPhase === "idle") {
      world.blackoutPhase = "flicker";
      world.blackoutTimer += BLACKOUT.flickerSeconds;
      world.events.push({ type: "lightsOut", phase: "flicker" });
    } else if (world.blackoutPhase === "flicker") {
      world.blackoutPhase = "dark";
      world.blackoutTimer += scheduleRange(...BLACKOUT.darkRange);
      world.events.push({ type: "lightsOut", phase: "dark" });
    } else {
      world.blackoutPhase = "idle";
      world.blackoutTimer += scheduleRange(...BLACKOUT.gapRange);
    }
  }
}

/** 0..1 overlay strength. 1 is a full lights-out (lantern hole is render-only). */
export function blackoutOverlayAmount(world: World): number {
  if (!mutatorBlackoutPulse()) return 0;
  if (world.blackoutPhase === "dark") return 1;
  if (world.blackoutPhase === "flicker") {
    return (world.time * BLACKOUT.flickerHz) % 1 < 0.5 ? 1 : 0.18;
  }
  return 0;
}

/** Multiplier on telegraph alpha (1 outside an outage). */
export function blackoutTelegraphMul(world: World): number {
  if (!mutatorBlackoutPulse()) return 1;
  const a = blackoutOverlayAmount(world);
  return 1 + (BLACKOUT.telegraphOpacity - 1) * a;
}
