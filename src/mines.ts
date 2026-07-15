import { MINES } from "./config";
import { randRange, scheduleRange } from "./math";
import { killDronesInRadius } from "./enemies";
import { registerKill } from "./scoring";
import type { Mine, World } from "./types";

// Floating mines: stationary space-denial hazards. They arm after a short
// fade-in, despawn after a while (so the field never clutters), and when
// destroyed by a power they chain-explode, killing everything around them.

export function mineRadius(): number {
  return MINES.radius;
}

export function isMineArmed(m: Mine): boolean {
  return m.age >= MINES.armTime;
}

export function updateMines(world: World, dt: number): void {
  // spawning
  // Training Ground never spawns mines — it's a dodging classroom, not a test
  if (
    world.phase === "playing" &&
    !world.sandbox &&
    !world.training &&
    world.time >= MINES.startAfterSeconds
  ) {
    world.mineTimer -= dt;
    if (world.mineTimer <= 0) {
      world.mineTimer = scheduleRange(...MINES.intervalRange);
      trySpawnMine(world);
    }
  }

  // aging / despawn
  for (let i = world.mines.length - 1; i >= 0; i--) {
    const m = world.mines[i];
    m.age += dt;
    if (!m.alive || m.age >= m.lifetime) world.mines.splice(i, 1);
  }
}

function trySpawnMine(world: World): void {
  // fixed number of draws before any bail-out, so a player's mine kills and
  // ship position never advance the seeded layout stream differently
  const halfW = world.viewW / 2 - 1;
  const halfH = world.viewH / 2 - 1;
  const candidates: { x: number; y: number }[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    candidates.push({ x: randRange(-halfW, halfW), y: randRange(-halfH, halfH) });
  }

  const alive = world.mines.filter((m) => m.alive).length;
  if (alive >= MINES.maxActive) return;

  for (const { x, y } of candidates) {
    const dx = x - world.ship.x;
    const dy = y - world.ship.y;
    if (Math.hypot(dx, dy) < MINES.minDistanceFromShip) continue;

    let tooClose = false;
    for (const other of world.mines) {
      if (Math.hypot(x - other.x, y - other.y) < MINES.minDistanceBetween) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    world.mines.push({
      x,
      y,
      age: 0,
      lifetime: MINES.lifetime,
      seed: Math.random() * Math.PI * 2, // visual bob phase, cosmetic
      alive: true,
    });
    return;
  }
}

/**
 * Destroy a mine (via a power, dash, or shield): credits a kill and
 * chain-explodes, killing drones and other mines in the blast radius.
 */
export function killMine(world: World, m: Mine): void {
  if (!m.alive) return;
  m.alive = false;
  const points = registerKill(world, m.x, m.y);
  world.events.push({ type: "mineExploded", x: m.x, y: m.y, points });
  world.shake = Math.max(world.shake, 0.3);
  world.powers.waves.push({
    x: m.x,
    y: m.y,
    elapsed: 0,
    lifetime: 0.6,
    maxRadius: MINES.explosionRadius,
    color: "#ff8844",
  });

  killDronesInRadius(world, m.x, m.y, MINES.explosionRadius);
  for (const other of world.mines) {
    if (!other.alive || other === m) continue;
    const dx = other.x - m.x;
    const dy = other.y - m.y;
    const r = MINES.explosionRadius + MINES.radius;
    if (dx * dx + dy * dy <= r * r) killMine(world, other);
  }
}

/** Blast helper for shockwave / shield detonation / pulse. */
export function killMinesInRadius(world: World, x: number, y: number, radius: number): void {
  for (const m of world.mines) {
    if (!m.alive) continue;
    const dx = m.x - x;
    const dy = m.y - y;
    const r = radius + MINES.radius;
    if (dx * dx + dy * dy <= r * r) killMine(world, m);
  }
}
