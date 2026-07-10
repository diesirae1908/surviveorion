import { SCORING } from "./config";
import type { World } from "./types";

/**
 * Competitive scoring loop:
 * - Survival pay ramps with time ("danger pay"), scaled by the multiplier.
 * - The kill multiplier climbs fast (x10 cap) but drains faster the higher it
 *   is, so keeping it up under pressure is the skill test.
 * - Kill chains (kills within a short window) pay escalating bonuses.
 */
export function updateScoring(world: World, dt: number): void {
  if (world.phase !== "playing") return;

  world.time += dt;

  const survivalRate = Math.min(
    SCORING.survivalPointsCap,
    SCORING.survivalPointsPerSecond + SCORING.survivalRampPerMinute * (world.time / 60),
  );
  world.score += survivalRate * world.multiplier * dt;

  // chain window
  if (world.chainTimer > 0) {
    world.chainTimer -= dt;
    if (world.chainTimer <= 0) world.chainCount = 0;
  }

  // multiplier decay: grace period, then a drain that scales with how high it is
  if (world.multiplierDecayTimer > 0) {
    world.multiplierDecayTimer -= dt;
  } else if (world.multiplier > 1) {
    const drain =
      SCORING.multiplierDecayRate *
      (1 + SCORING.multiplierDecayScale * (world.multiplier - 1));
    world.multiplier = Math.max(1, world.multiplier - drain * dt);
  }
}

/** Credit a kill and return the points it was worth (for score popups). */
export function registerKill(world: World, x = 0, y = 0): number {
  if (world.phase !== "playing") return 0;

  world.multiplier = Math.min(
    SCORING.multiplierMax,
    world.multiplier + SCORING.multiplierPerKill,
  );
  world.maxMultiplier = Math.max(world.maxMultiplier, world.multiplier);
  world.multiplierDecayTimer = SCORING.multiplierDecayDelay;

  let points = SCORING.killPoints * world.multiplier;

  // chain bonus: escalating payout every N kills inside the chain window
  world.chainCount += 1;
  world.chainTimer = SCORING.chainWindow;
  if (world.chainCount > 0 && world.chainCount % SCORING.chainBonusEvery === 0) {
    const bonus =
      SCORING.chainBonusPoints *
      (world.chainCount / SCORING.chainBonusEvery) *
      world.multiplier;
    points += bonus;
    world.events.push({
      type: "chainBonus",
      x,
      y,
      points: Math.round(bonus),
      count: world.chainCount,
    });
  }

  world.score += points;
  world.kills += 1;
  return Math.round(points);
}
