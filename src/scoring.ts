import { SCORING } from "./config";
import type { World } from "./types";

/**
 * Competitive scoring loop:
 * - All scoring scales with elapsed danger ("danger pay", uncapped linear):
 *   the deeper into the escalation you are, the more every second and every
 *   kill is worth — so the easy opening is never worth grinding.
 * - The kill multiplier climbs fast (x10 cap) but drains faster the higher it
 *   is, so keeping it up under pressure is the skill test.
 * - Kill chains (kills within a short window) pay escalating bonuses.
 */

/** Uncapped linear score scale: 1 + minutes * dangerPerMinute. */
export function dangerFactor(world: World): number {
  return 1 + (world.time / 60) * SCORING.dangerPerMinute;
}

export function updateScoring(world: World, dt: number): void {
  if (world.phase !== "playing") return;

  world.time += dt;

  const survival = SCORING.survivalPointsPerSecond * world.multiplier * dangerFactor(world) * dt;
  world.score += survival;
  world.scoreSurvival += survival;

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

/**
 * Credit a graze (near-miss on a live drone): pays points, bumps the
 * multiplier a notch, and resets its decay delay — threading a tight gap
 * keeps the multiplier alive between kills. Returns the points paid.
 */
export function registerGraze(world: World, x = 0, y = 0): number {
  if (world.phase !== "playing") return 0;

  world.multiplier = Math.min(
    SCORING.multiplierMax,
    world.multiplier + SCORING.grazeMultiplier,
  );
  world.maxMultiplier = Math.max(world.maxMultiplier, world.multiplier);
  world.multiplierDecayTimer = SCORING.multiplierDecayDelay;

  const points = SCORING.grazePoints * world.multiplier * dangerFactor(world);
  world.score += points;
  world.scoreBonuses += points;
  world.events.push({ type: "graze", x, y, points: Math.round(points) });
  return Math.round(points);
}

/** Optional scaling for skill kills (pulse shots, frozen shatters, ...). */
export interface KillModifiers {
  pointsScale?: number; // multiplies the base kill points
  multiplierScale?: number; // multiplies the multiplier gain per kill
}

/** Credit a kill and return the points it was worth (for score popups). */
export function registerKill(
  world: World,
  x = 0,
  y = 0,
  mods?: KillModifiers,
): number {
  if (world.phase !== "playing") return 0;

  world.multiplier = Math.min(
    SCORING.multiplierMax,
    world.multiplier + SCORING.multiplierPerKill * (mods?.multiplierScale ?? 1),
  );
  world.maxMultiplier = Math.max(world.maxMultiplier, world.multiplier);
  world.multiplierDecayTimer = SCORING.multiplierDecayDelay;

  let points = SCORING.killPoints * (mods?.pointsScale ?? 1) * world.multiplier * dangerFactor(world);
  world.scoreKills += points;

  // chain bonus: escalating payout every N kills inside the chain window
  world.chainCount += 1;
  world.chainTimer = SCORING.chainWindow;
  if (world.chainCount > 0 && world.chainCount % SCORING.chainBonusEvery === 0) {
    const bonus =
      SCORING.chainBonusPoints *
      (world.chainCount / SCORING.chainBonusEvery) *
      world.multiplier;
    points += bonus;
    world.scoreBonuses += bonus;
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
