import { DRONE, SHIP, SPAWNER } from "./config";
import { clamp, lerp, ramp, randDir, randInCircle, randRange, smoothNoise } from "./math";
import { halfDiagonal, randomEdgePoint, toroidalDistance } from "./physics";
import { registerKill } from "./scoring";
import type { Drone, World } from "./types";

// --- drones ---

function createDrone(
  x: number,
  y: number,
  scale: number,
  speedMultiplier: number,
): Drone {
  return {
    x,
    y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    scale,
    speedMultiplier,
    mass: lerp(DRONE.massMin, DRONE.massMax, clamp(scale, 0, 1)),
    jitterSeed: Math.random() * 100,
    spin: Math.random() * Math.PI * 2,
    frozen: 0,
    alive: true,
  };
}

export function droneRadius(d: Drone): number {
  return DRONE.radius * d.scale;
}

export function updateDrones(world: World, dt: number): void {
  const ship = world.ship;
  const chase = world.phase === "playing";

  for (const d of world.drones) {
    d.prevX = d.x;
    d.prevY = d.y;

    if (d.frozen > 0) {
      d.frozen -= dt;
      d.vx = 0;
      d.vy = 0;
      continue;
    }

    d.spin += dt * 1.5;

    let hx = d.vx;
    let hy = d.vy;
    if (chase) {
      const tx = ship.x - d.x;
      const ty = ship.y - d.y;
      const dist = Math.hypot(tx, ty);
      if (dist > 0.01) {
        hx = tx / dist;
        hy = ty / dist;
      }
    } else {
      const l = Math.hypot(hx, hy);
      if (l > 0.01) {
        hx /= l;
        hy /= l;
      } else {
        hx = 1;
        hy = 0;
      }
    }

    // perpendicular wobble (Unity Perlin jitter equivalent)
    if (SPAWNER.jitterStrength > 0) {
      const n = smoothNoise(world.time * DRONE.jitterFrequency, d.jitterSeed);
      const px = -hy;
      const py = hx;
      hx += px * n * SPAWNER.jitterStrength;
      hy += py * n * SPAWNER.jitterStrength;
      const l = Math.hypot(hx, hy);
      hx /= l;
      hy /= l;
    }

    const speed = DRONE.baseSpeed * d.speedMultiplier;
    d.vx = hx * speed;
    d.vy = hy * speed;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
  }
}

/** Kill a drone: mark dead, emit event, credit score. Removal happens in tick(). */
export function killDrone(world: World, d: Drone): void {
  if (!d.alive) return;
  d.alive = false;
  const points = registerKill(world, d.x, d.y);
  world.events.push({
    type: "droneKilled",
    x: d.x,
    y: d.y,
    scale: d.scale,
    wasFrozen: d.frozen > 0,
    points,
  });
}

export function killDronesInRadius(world: World, x: number, y: number, radius: number): void {
  for (const d of world.drones) {
    if (!d.alive) continue;
    const dx = d.x - x;
    const dy = d.y - y;
    const r = radius + droneRadius(d);
    if (dx * dx + dy * dy <= r * r) killDrone(world, d);
  }
}

// --- spawner (port of Unity EnemySpawner: ramps + formations) ---

export function initSpawner(world: World): void {
  scheduleNextFormation(world);
  // opening drones start at the far formation radius for a gentle ramp-in
  for (let i = 0; i < SPAWNER.initialBurst; i++) {
    const dir = randDir();
    const r = spawnRadius(world);
    spawnAt(world, dir.x * r, dir.y * r, 0);
  }
}

export function updateSpawner(world: World, dt: number): void {
  if (world.phase !== "playing") return;

  const minutes = world.time / 60;
  world.spawnAccumulator += ramp(minutes, SPAWNER.spawnsPerSecond) * dt;

  updateTelegraphs(world, dt, minutes);
  handleFormations(world, minutes, dt);

  if (world.sustainedSpawnCooldown > 0) {
    world.sustainedSpawnCooldown -= dt;
    return;
  }

  while (world.spawnAccumulator >= 1) {
    world.spawnAccumulator -= 1;
    spawnAmbient(world, minutes);
  }
}

/** Count down warning glows; pop a drone when one expires. */
function updateTelegraphs(world: World, dt: number, minutes: number): void {
  for (let i = world.spawnTelegraphs.length - 1; i >= 0; i--) {
    const t = world.spawnTelegraphs[i];
    t.timer -= dt;
    if (t.timer <= 0) {
      world.spawnTelegraphs.splice(i, 1);
      spawnAt(world, t.x, t.y, minutes);
      world.events.push({ type: "droneSpawn", x: t.x, y: t.y });
    }
  }
}

/** Place a warning glow at an on-screen point away from the ship. */
function telegraphAt(world: World, x: number, y: number, duration: number): void {
  world.spawnTelegraphs.push({ x, y, timer: duration, duration });
}

function telegraphAmbient(world: World): void {
  const cfg = SPAWNER.telegraph;
  const hw = world.viewW / 2 - cfg.edgeInset;
  const hh = world.viewH / 2 - cfg.edgeInset;
  let x = 0;
  let y = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    x = randRange(-hw, hw);
    y = randRange(-hh, hh);
    const dx = x - world.ship.x;
    const dy = y - world.ship.y;
    if (dx * dx + dy * dy >= cfg.minDistanceFromShip ** 2) break;
  }
  telegraphAt(world, x, y, cfg.duration);
}

function spawnAt(world: World, x: number, y: number, minutes: number): void {
  const jitter = (Math.random() - 0.5) * 2 * SPAWNER.scaleJitter;
  const scale = clamp(
    0.6 + jitter, // avg size (Unity fallback used constant 1, clamped to 0.3..0.9)
    SPAWNER.scaleClamp[0],
    SPAWNER.scaleClamp[1],
  );
  const speedMult = Math.max(0.1, ramp(minutes, SPAWNER.speedMultiplier));
  world.drones.push(createDrone(x, y, scale, speedMult));
}

/** Formation distance from the ship: outside the view no matter the aspect. */
export function spawnRadius(world: World): number {
  return Math.max(SPAWNER.minSpawnRadius, halfDiagonal(world) + 1.5);
}

/**
 * Ambient spawns: most telegraph on-screen (red fade-in, then pop) so danger
 * is visible and dodgeable; the rest sneak in from just past the view edge to
 * keep the radar chevrons honest.
 */
function spawnAmbient(world: World, minutes: number): void {
  if (Math.random() < SPAWNER.telegraph.ratio) {
    telegraphAmbient(world);
    return;
  }

  const shipDist = (p: { x: number; y: number }): number =>
    toroidalDistance(world, SHIP.wrapMargin, p.x, p.y, world.ship.x, world.ship.y);

  let best = randomEdgePoint(world, SPAWNER.edgeMargin);
  let bestDist = shipDist(best);
  for (let attempt = 0; attempt < 8 && bestDist < SPAWNER.minDistanceFromShip; attempt++) {
    const p = randomEdgePoint(world, SPAWNER.edgeMargin);
    const dist = shipDist(p);
    if (dist > bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  spawnAt(world, best.x, best.y, minutes);
}

// --- formations ---

/** Formations start at half strength and reach full size at the 3-minute mark. */
function formationIntensity(minutes: number): number {
  return lerp(0.5, 1, clamp(minutes / 3, 0, 1));
}

function handleFormations(world: World, minutes: number, dt: number): void {
  world.formationTimer += dt;
  if (world.formationTimer < world.nextFormationDelay) return;

  const kinds = ["line", "ring", "burst"] as const;
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  switch (kind) {
    case "line":
      spawnLineFormation(world, minutes);
      break;
    case "ring":
      spawnRingFormation(world, minutes);
      break;
    case "burst":
      spawnBurstFormation(world, minutes);
      break;
  }

  world.spawnAccumulator = 0;
  world.sustainedSpawnCooldown = SPAWNER.formations.postFormationDelay;
  scheduleNextFormation(world);
}

function scheduleNextFormation(world: World): void {
  world.formationTimer = 0;
  const [min, max] = SPAWNER.formations.intervalRange;
  world.nextFormationDelay = randRange(min, max);
}

/** A sweeping line of drones approaching from one off-screen direction. */
function spawnLineFormation(world: World, minutes: number): void {
  const { spacing } = SPAWNER.formations.line;
  const count = Math.max(2, Math.round(SPAWNER.formations.line.count * formationIntensity(minutes)));
  const dir = randDir();
  const dist = spawnRadius(world) + 1;
  const cx = world.ship.x + dir.x * dist;
  const cy = world.ship.y + dir.y * dist;
  const tx = -dir.y;
  const ty = dir.x;
  const half = (count - 1) / 2;

  for (let i = 0; i < count; i++) {
    const off = (i - half) * spacing;
    spawnAt(world, cx + tx * off, cy + ty * off, minutes);
  }
}

/**
 * The ring closes in ON-screen: a circle of warnings around the player with
 * one second to escape through a gap before it materializes.
 */
function spawnRingFormation(world: World, minutes: number): void {
  const { radius, telegraphDuration } = SPAWNER.formations.ring;
  const count = Math.max(3, Math.round(SPAWNER.formations.ring.count * formationIntensity(minutes)));
  const startAngle = Math.random() * Math.PI * 2;

  for (let i = 0; i < count; i++) {
    const a = startAngle + (Math.PI * 2 * i) / count;
    telegraphAt(
      world,
      world.ship.x + Math.cos(a) * radius,
      world.ship.y + Math.sin(a) * radius,
      telegraphDuration,
    );
  }
  world.events.push({ type: "ringWarning" });
}

/** A dense swarm bursting in from a single off-screen point. */
function spawnBurstFormation(world: World, minutes: number): void {
  const { spreadRadius } = SPAWNER.formations.burst;
  const count = Math.max(3, Math.round(SPAWNER.formations.burst.count * formationIntensity(minutes)));
  const dir = randDir();
  const dist = spawnRadius(world) + spreadRadius;
  const ox = world.ship.x + dir.x * dist;
  const oy = world.ship.y + dir.y * dist;

  for (let i = 0; i < count; i++) {
    const off = randInCircle();
    spawnAt(world, ox + off.x * spreadRadius, oy + off.y * spreadRadius, minutes);
  }
}
