import {
  PICKUPS,
  POWERS,
  POWER_MIN_MINUTES,
  POWER_SPAWN_WEIGHTS,
  SHIP,
  SPAWNABLE_POWER_IDS,
  type PowerId,
} from "./config";
import { clamp01, lerp, rand, randRange, scheduleRand, scheduleRange } from "./math";
import { circlesOverlap } from "./physics";
import { activatePower } from "./powers";
import type { Pickup, World } from "./types";

export function initPickups(world: World): void {
  world.pickupTimer = nextInterval(world);
  for (let i = 0; i < PICKUPS.spawnOnStart; i++) spawnPickup(world);
}

/** Support scales with pressure: drops come faster as the escalation climbs. */
function nextInterval(world: World): number {
  const t = clamp01(world.time / 60 / PICKUPS.intervalRampMinutes);
  // dailies have no refill floor, so the baseline schedule runs faster —
  // a flat scale on a single seeded draw keeps the shared script in sync
  const scale = world.daily ? PICKUPS.dailyIntervalScale : 1;
  const min = lerp(PICKUPS.secondsBetweenRange[0], PICKUPS.secondsBetweenAtPeak[0], t) * scale;
  const max = lerp(PICKUPS.secondsBetweenRange[1], PICKUPS.secondsBetweenAtPeak[1], t) * scale;
  return scheduleRange(min, max);
}

export function updatePickups(world: World, dt: number): void {
  if (world.phase !== "playing") return;

  if (!world.sandbox) {
    // refill floor: never leave the arena short on support. Skipped on Daily
    // Patrol — refill timing depends on when the player collects, which
    // would desync the shared seed (the faster baseline covers dailies).
    if (!world.daily && world.pickups.length < PICKUPS.minActive) {
      world.pickupTimer = Math.min(world.pickupTimer, 0.5);
    }
    world.pickupTimer -= dt;
    if (world.pickupTimer <= 0) {
      world.pickupTimer = nextInterval(world);
      spawnPickup(world);
    }
  }

  const ship = world.ship;
  const hw = world.viewW / 2 - PICKUPS.edgeInset;
  const hh = world.viewH / 2 - PICKUPS.edgeInset;

  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const p = world.pickups[i];
    p.age += dt;

    if (p.magnetized) {
      // claimed by a magnet: forget the drift, home straight to the ship
      const dx = ship.x - p.x;
      const dy = ship.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        const pull = Math.min(POWERS.magnet.pullSpeed * dt, dist);
        p.x += (dx / dist) * pull;
        p.y += (dy / dist) * pull;
      }
    } else {
      // slow drift, bouncing softly off the arena edges
      p.x += (p.vx ?? 0) * dt;
      p.y += (p.vy ?? 0) * dt;
      if (p.vx !== undefined && ((p.x < -hw && p.vx < 0) || (p.x > hw && p.vx > 0))) {
        p.vx = -p.vx;
      }
      if (p.vy !== undefined && ((p.y < -hh && p.vy < 0) || (p.y > hh && p.vy > 0))) {
        p.vy = -p.vy;
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

  // fixed number of draws (ship position must not advance the seeded stream
  // differently per player); take the first candidate far enough away.
  // Daily Patrol: the FIRST candidate wins unconditionally — ship-relative
  // placement would give every pilot different drop spots on the shared run.
  let x = 0;
  let y = 0;
  let found = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const cx = randRange(-hw, hw);
    const cy = randRange(-hh, hh);
    if (found) continue;
    x = cx;
    y = cy;
    if (world.daily) {
      found = true;
      continue;
    }
    const dist = Math.hypot(cx - world.ship.x, cy - world.ship.y);
    if (dist >= PICKUPS.minDistanceFromShip) found = true;
  }

  // roll before the cap check: how many pickups float uncollected is
  // player-dependent, and a seeded run must consume the same draws (and the
  // same bad-luck demotions) for everyone. At the cap the drop is discarded —
  // except on Daily Patrol, where a discard would make the visible power
  // script depend on how many pickups the pilot left floating. On dailies
  // every scheduled drop lands, so all pilots see the identical board.
  const driftAngle = rand() * Math.PI * 2; // drift heading (fixed draw too)
  const power = rollPowerId(world);
  if (!world.daily && world.pickups.length >= PICKUPS.maxActive) return;
  const pickup: Pickup = {
    x,
    y,
    power,
    age: 0,
    vx: Math.cos(driftAngle) * PICKUPS.driftSpeed,
    vy: Math.sin(driftAngle) * PICKUPS.driftSpeed,
  };
  // a magnet grabbed on an empty board stays armed and claims the next drop
  if (world.powers.magnetPending > 0) {
    world.powers.magnetPending--;
    pickup.magnetized = true;
  }
  world.pickups.push(pickup);
}

/**
 * Weighted random pick so not every power appears at the same frequency.
 * Late-game powers (POWER_MIN_MINUTES) only enter the pool once the run is
 * deep enough to warrant them. Bad-luck protection: each time a power spawns
 * its weight is demoted for the rest of the run, so the rarer powers all get
 * their moment instead of shield/shockwave hogging every drop.
 */
function rollPowerId(world: World): PowerId {
  const minutes = world.time / 60;
  const pool = SPAWNABLE_POWER_IDS.filter((id) => minutes >= (POWER_MIN_MINUTES[id] ?? 0));

  const weight = (id: PowerId): number =>
    POWER_SPAWN_WEIGHTS[id] / (1 + 1.5 * (world.powerSpawnCounts[id] ?? 0));

  let total = 0;
  for (const id of pool) total += weight(id);

  let roll = scheduleRand() * total;
  let picked = pool[pool.length - 1];
  for (const id of pool) {
    roll -= weight(id);
    if (roll <= 0) {
      picked = id;
      break;
    }
  }
  world.powerSpawnCounts[picked] = (world.powerSpawnCounts[picked] ?? 0) + 1;
  return picked;
}
