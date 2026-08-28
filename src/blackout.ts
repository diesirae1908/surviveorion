// BLACKOUT (Daily Mutator): flicker, then a real lights-out with a small
// lantern of visibility around the ship. Some flickers are fakes and the
// lights come back. Real outages get longer the deeper the run goes.
// Gaps between events are 5-15s.
//
// Determinism: first delay, real-vs-fake, dark length, and the next-gap
// all ride the seeded SCHEDULE stream. Every flicker-end consumes the same
// three draws (real roll, dark duration, next gap) whether the outage is
// real or fake, so ship position/kills cannot desync the script. The
// overlay never looks at drones, mines, or the ship. Flicker strobe is a
// pure function of world.time (no RNG).
//
// Fully gated behind mutatorBlackoutPulse(): every other day and mode
// is untouched.

import { BLACKOUT } from "./config";
import { lerp, scheduleRand, scheduleRange } from "./math";
import { mutatorBlackoutPulse } from "./mutators";
import type { World } from "./types";

const T90 = 1.5;
const T180 = 3.0;

/** Dark-duration range (seconds) at this many minutes into the run.
 * Opening 1.2-2s, 1:30 → 3-4s, 3:00 → 6-7s, then the same slope to a cap. */
export function blackoutDarkRange(minutes: number): [number, number] {
  const m = Math.max(0, minutes);
  let lo: number;
  let hi: number;
  if (m <= T90) {
    const t = m / T90;
    lo = lerp(BLACKOUT.darkOpen[0], BLACKOUT.darkAt90[0], t);
    hi = lerp(BLACKOUT.darkOpen[1], BLACKOUT.darkAt90[1], t);
  } else if (m <= T180) {
    const t = (m - T90) / (T180 - T90);
    lo = lerp(BLACKOUT.darkAt90[0], BLACKOUT.darkAt180[0], t);
    hi = lerp(BLACKOUT.darkAt90[1], BLACKOUT.darkAt180[1], t);
  } else {
    const extra = m - T180;
    const slopeLo = (BLACKOUT.darkAt180[0] - BLACKOUT.darkAt90[0]) / (T180 - T90);
    const slopeHi = (BLACKOUT.darkAt180[1] - BLACKOUT.darkAt90[1]) / (T180 - T90);
    lo = BLACKOUT.darkAt180[0] + slopeLo * extra;
    hi = BLACKOUT.darkAt180[1] + slopeHi * extra;
  }
  return [Math.min(lo, BLACKOUT.darkCap[0]), Math.min(hi, BLACKOUT.darkCap[1])];
}

export function initBlackout(world: World): void {
  if (!mutatorBlackoutPulse()) return;
  world.blackoutPhase = "idle";
  world.blackoutTimer = scheduleRange(...BLACKOUT.firstDelayRange);
  world.blackoutNextGap = 0;
  world.blackoutHadReal = false;
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
      // Fixed draws: real roll, dark duration, next gap. Fake path discards
      // the duration; real path stashes the gap for the dark→idle step.
      const roll = scheduleRand();
      const isReal = !world.blackoutHadReal || roll < BLACKOUT.realChance;
      const darkDur = scheduleRange(...blackoutDarkRange(world.time / 60));
      const nextGap = scheduleRange(...BLACKOUT.gapRange);
      if (isReal) {
        world.blackoutHadReal = true;
        world.blackoutPhase = "dark";
        world.blackoutTimer += darkDur;
        world.blackoutNextGap = nextGap;
        world.events.push({ type: "lightsOut", phase: "dark", duration: darkDur });
      } else {
        world.blackoutPhase = "idle";
        world.blackoutTimer += nextGap;
        world.events.push({ type: "lightsOut", phase: "fake" });
      }
    } else {
      world.blackoutPhase = "idle";
      world.blackoutTimer += world.blackoutNextGap;
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
