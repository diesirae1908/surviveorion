import {
  ALL_POWER_IDS,
  PICKUPS,
  POWERS,
  POWER_MIN_MINUTES,
  POWER_SPAWN_WEIGHTS,
  SHIP,
  type PowerId,
} from "./config";
import { clamp01, lerp, randRange } from "./math";
import { circlesOverlap } from "./physics";
import { activatePower } from "./powers";
import type { World } from "./types";

export function initPickups(world: World): void {
  world.pickupTimer = nextInterval(world);
  if (PICKUPS.spawnOnStart) spawnPickup(world);
}

/** Support scales with pressure: drops come faster as the escalation climbs. */
function nextInterval(world: World): number {
  const t = clamp01(world.time / 60 / PICKUPS.intervalRampMinutes);
  const min = lerp(PICKUPS.secondsBetweenRange[0], PICKUPS.secondsBetweenAtPeak[0], t);
  const max = lerp(PICKUPS.secondsBetweenRange[1], PICKUPS.secondsBetweenAtPeak[1], t);
  return randRange(min, max);
}

export function updatePickups(world: World, dt: number): void {
  if (world.phase !== "playing") return;

  world.pickupTimer -= dt;
  if (world.pickupTimer <= 0) {
    world.pickupTimer = nextInterval(world);
    if (world.pickups.length < PICKUPS.maxActive) spawnPickup(world);
  }

  const ship = world.ship;
  const magnetActive = world.powers.magnetTimer > 0;

  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const p = world.pickups[i];
    p.age += dt;

    if (magnetActive) {
      const dx = ship.x - p.x;
      const dy = ship.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01 && dist <= POWERS.magnet.radius) {
        const pull = POWERS.magnet.pullSpeed * dt;
        p.x += (dx / dist) * pull;
        p.y += (dy / dist) * pull;
      }
    }

    if (circlesOverlap(ship.x, ship.y, SHIP.radius, p.x, p.y, PICKUPS.radius)) {
      world.pickups.splice(i, 1);
      world.events.push({ type: "pickup", power: p.power, x: p.x, y: p.y });
      activatePower(world, p.power);
    }
  }
}

/**
 * Spawns inside the visible area (unlike Unity's fixed radius, which could
 * land pickups off-screen), keeping a minimum distance from the ship.
 */
function spawnPickup(world: World): void {
  const hw = world.viewW / 2 - PICKUPS.edgeInset;
  const hh = world.viewH / 2 - PICKUPS.edgeInset;

  let x = 0;
  let y = 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    x = randRange(-hw, hw);
    y = randRange(-hh, hh);
    const dist = Math.hypot(x - world.ship.x, y - world.ship.y);
    if (dist >= PICKUPS.minDistanceFromShip) break;
  }

  world.pickups.push({ x, y, power: rollPowerId(world), age: 0 });
}

/**
 * Weighted random pick so not every power appears at the same frequency.
 * Late-game powers (POWER_MIN_MINUTES) only enter the pool once the run is
 * deep enough to warrant them.
 */
function rollPowerId(world: World): PowerId {
  const minutes = world.time / 60;
  const pool = ALL_POWER_IDS.filter((id) => minutes >= (POWER_MIN_MINUTES[id] ?? 0));

  let total = 0;
  for (const id of pool) total += POWER_SPAWN_WEIGHTS[id];

  let roll = Math.random() * total;
  for (const id of pool) {
    roll -= POWER_SPAWN_WEIGHTS[id];
    if (roll <= 0) return id;
  }
  return pool[pool.length - 1];
}
