// Death moment presentation: a short freeze beat, the hull breaking into gold
// shards, and a red flash over the first 150 ms of the death veil. Gated by
// `ui.result` (param `deathMoment`); a no-op with the switch off. Presentation
// only: it never mutates the sim (the freeze is `ctx.holdSim`, which does not
// advance sim time) and it draws no seeded random numbers (shards use the
// cosmetic Math.random in Particles).

import { PALETTE } from "../config";
import type { FxContext, GameEvent } from "../types";

/** Red flash peak alpha, linearly faded to 0 across FLASH_MS. */
export const FLASH_ALPHA = 0.2;
/** Flash length from the first veil frame. */
export const FLASH_MS = 150;
/** Gold shards thrown from the ship (on top of the existing death burst). */
const SHARD_COUNT = 34;
const SHARD_COLORS = [PALETTE.gold, PALETTE.goldPale, PALETTE.gold, PALETTE.white];

/** Wall-clock ms (performance.now) the flash started; null = no flash armed. */
let flashStartedAt: number | null = null;

/** Pure: flash alpha `elapsedMs` after the death frame (0 outside the window). */
export function flashAlphaAt(elapsedMs: number): number {
  if (elapsedMs < 0 || elapsedMs >= FLASH_MS) return 0;
  return FLASH_ALPHA * (1 - elapsedMs / FLASH_MS);
}

/** Alpha for drawDeathFx this frame. 0 when the switch or the flash is off. */
export function flashAlpha(now: number = performance.now()): number {
  if (flashStartedAt === null) return 0;
  const a = flashAlphaAt(now - flashStartedAt);
  if (a === 0) flashStartedAt = null;
  return a;
}

/** React to a gameplay event. Only `death`, only with `ui.result.deathMoment` on. */
export function onEvent(e: GameEvent, ctx: FxContext): void {
  if (e.type !== "death") return;
  const r = ctx.flags.result;
  if (!r || !r.deathMoment) {
    flashStartedAt = null;
    return;
  }
  // gold shards at the ship, in every effects mode (they are the moment itself)
  ctx.particles.burst(e.x, e.y, SHARD_COLORS, SHARD_COUNT, 11, 1.1, 0.12);
  if (ctx.effects === "lite") {
    flashStartedAt = null; // lite: no flash, no freeze
    return;
  }
  ctx.holdSim(r.freezeMs);
  flashStartedAt = performance.now();
}
