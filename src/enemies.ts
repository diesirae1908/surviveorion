import { ASSEMBLY, DRONE, IRONRAIN, SCORING, SPAWNER, type FormationKind } from "./config";
import { clamp, clamp01, escalate, lerp, rand, randDir, randInCircle, randRange, scheduleRand, scheduleRange, smoothNoise } from "./math";
import { halfDiagonal, randomEdgePoint } from "./physics";
import { registerKill } from "./scoring";
import type { Assembly, Drone, KillSource, World } from "./types";

/**
 * Difficulty clock: Classic escalates with real time; Iron Rain is pinned at
 * a late-game depth from second zero (flat endurance — no ramp, no growth).
 */
export function difficultyMinutes(world: World): number {
  return world.gameMode === "ironrain" ? IRONRAIN.pinnedMinutes : world.time / 60;
}

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
    // per-drone flavor (wobble phase, sprite spin) stays off the seeded
    // streams: drone counts differ per player, so drawing here would desync
    jitterSeed: Math.random() * 100,
    spin: Math.random() * Math.PI * 2,
    frozen: 0,
    alive: true,
  };
}

export function droneRadius(d: Drone): number {
  // frozen drones grow an ice shell: bigger to see and easier to shatter
  return DRONE.radius * d.scale * (d.frozen > 0 ? DRONE.frozenScale : 1);
}

/** Speed factor from drone size: small = slower, large = faster. */
function droneSizeSpeedFactor(scale: number): number {
  const [minScale, maxScale] = SPAWNER.scaleClamp;
  const t = clamp((scale - minScale) / (maxScale - minScale), 0, 1);
  return lerp(DRONE.sizeSpeed.small, DRONE.sizeSpeed.large, t);
}

export function updateDrones(world: World, dt: number): void {
  const ship = world.ship;
  const chase = world.phase === "playing";

  for (const d of world.drones) {
    d.prevX = d.x;
    d.prevY = d.y;

    if (d.grazeTimer && d.grazeTimer > 0) d.grazeTimer -= dt;

    if (d.frozen > 0) {
      d.frozen -= dt;
      d.vx = 0;
      d.vy = 0;
      continue;
    }

    d.spin += dt * 1.5;

    // assembly members are steered by updateAssemblies, not homing/scripts
    if (d.assembly) continue;

    // scripted formation movement releases back to homing when its timer ends
    if (d.scriptMode) {
      d.scriptTimer = (d.scriptTimer ?? 0) - dt;
      if (d.scriptTimer <= 0) {
        d.scriptMode = undefined;
        d.followTarget = null;
      }
    }

    let hx = d.vx;
    let hy = d.vy;
    let scripted = false;

    if (d.scriptMode === "straight" && d.scriptDirX !== undefined && d.scriptDirY !== undefined) {
      // serpent heads carve a smooth-noise curve; walls march dead straight
      if (d.scriptWander) {
        const turn = smoothNoise(world.time * 0.9, d.jitterSeed) * d.scriptWander * dt;
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        const nx = d.scriptDirX * cos - d.scriptDirY * sin;
        const ny = d.scriptDirX * sin + d.scriptDirY * cos;
        d.scriptDirX = nx;
        d.scriptDirY = ny;
        // keep wandering heads inside the arena: reflect off the walls
        const hw = world.viewW / 2;
        const hh = world.viewH / 2;
        if ((d.x < -hw && d.scriptDirX < 0) || (d.x > hw && d.scriptDirX > 0)) {
          d.scriptDirX = -d.scriptDirX;
        }
        if ((d.y < -hh && d.scriptDirY < 0) || (d.y > hh && d.scriptDirY > 0)) {
          d.scriptDirY = -d.scriptDirY;
        }
      }
      hx = d.scriptDirX;
      hy = d.scriptDirY;
      scripted = true;
    } else if (d.scriptMode === "follow") {
      const leader = d.followTarget;
      if (leader && leader.alive) {
        const tx = leader.x - d.x;
        const ty = leader.y - d.y;
        const dist = Math.hypot(tx, ty);
        if (dist <= SPAWNER.formations.serpent.spacing) {
          // holding position in the train
          d.vx = 0;
          d.vy = 0;
          continue;
        }
        hx = tx / dist;
        hy = ty / dist;
        scripted = true;
      } else {
        d.scriptMode = undefined;
        d.followTarget = null;
      }
    }

    if (!scripted) {
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
    }

    // perpendicular wobble (Unity Perlin jitter equivalent); scripted drones
    // skip it so walls and trains hold their shape
    if (!scripted && SPAWNER.jitterStrength > 0) {
      const n = smoothNoise(world.time * DRONE.jitterFrequency, d.jitterSeed);
      const px = -hy;
      const py = hx;
      hx += px * n * SPAWNER.jitterStrength;
      hy += py * n * SPAWNER.jitterStrength;
      const l = Math.hypot(hx, hy);
      hx /= l;
      hy /= l;
    }

    const speed = DRONE.baseSpeed * d.speedMultiplier * droneSizeSpeedFactor(d.scale);
    d.vx = hx * speed;
    d.vy = hy * speed;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
  }
}

/** Kill a drone: mark dead, emit event, credit score. Removal happens in tick(). */
export function killDrone(world: World, d: Drone, source?: KillSource): void {
  if (!d.alive) return;
  d.alive = false;

  // Skill kills pay more: pulse skill shots double the points, and frozen
  // shatters (risky by design) pay extra and build the multiplier faster.
  // Modifiers stack multiplicatively (pulsing a frozen drone gets both).
  const wasFrozen = d.frozen > 0;
  let pointsScale = 1;
  let multiplierScale = 1;
  if (source === "pulse") pointsScale *= SCORING.pulsePointsScale;
  if (wasFrozen) {
    pointsScale *= SCORING.frozenPointsScale;
    multiplierScale *= SCORING.frozenMultiplierScale;
  }

  const points = registerKill(world, d.x, d.y, { pointsScale, multiplierScale });
  world.events.push({
    type: "droneKilled",
    x: d.x,
    y: d.y,
    scale: d.scale,
    wasFrozen,
    source,
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
  world.assemblyTimer = scheduleRange(...ASSEMBLY.intervalRange);

  // Iron Rain: no gentle burst — the run opens with an immediate mega-wall
  // and the first regular formation lands seconds later.
  if (world.gameMode === "ironrain") {
    world.nextFormationDelay = IRONRAIN.firstFormationDelay;
    spawnMegaWallFormation(world, IRONRAIN.pinnedMinutes);
    world.events.push({ type: "formation", kind: "megawall" });
    world.sustainedSpawnCooldown = SPAWNER.formations.postFormationDelay;
    return;
  }

  // Classic breathes before the first formation; new-pilot grace opens even
  // gentler (smaller burst, later first formation) for the first few runs.
  world.nextFormationDelay += SPAWNER.firstFormationExtraDelay + 8 * world.grace;
  const burst = Math.round(SPAWNER.initialBurst * (1 - 0.5 * world.grace));
  // opening drones start at the far formation radius for a gentle ramp-in
  for (let i = 0; i < burst; i++) {
    const dir = randDir();
    const r = spawnRadius(world);
    spawnAt(world, dir.x * r, dir.y * r, 0);
  }
}

/** Ambient-spawn damping for grace runs; fades out over the first minute. */
function graceSpawnScale(world: World): number {
  if (world.grace <= 0) return 1;
  return 1 - 0.35 * world.grace * clamp01(1 - world.time / 60);
}

export function updateSpawner(world: World, dt: number): void {
  if (world.phase !== "playing" || world.sandbox) return;

  const minutes = difficultyMinutes(world);
  world.spawnAccumulator +=
    escalate(minutes, SPAWNER.spawnsPerSecond) * graceSpawnScale(world) * dt;

  updateTelegraphs(world, dt, minutes);
  handleFormations(world, minutes, dt);

  if (world.sustainedSpawnCooldown > 0) {
    world.sustainedSpawnCooldown -= dt;
    return;
  }

  while (world.spawnAccumulator >= 1) {
    // Zombie clumping: spend 1..clumpMax of the spawn budget on one pack.
    // The accumulator may dip negative — average rate is unchanged, arrivals
    // just group. Fixed rand draws per pack keep Daily Patrol shared.
    const clump = 1 + Math.floor(rand() * SPAWNER.clumpMax);
    world.spawnAccumulator -= clump;
    spawnAmbient(world, minutes, clump);
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

function telegraphAmbient(world: World, count = 1): void {
  const cfg = SPAWNER.telegraph;
  const hw = world.viewW / 2 - cfg.edgeInset;
  const hh = world.viewH / 2 - cfg.edgeInset;
  // fixed number of draws (ship position must not advance the seeded stream
  // differently per player); take the first candidate far enough away
  let x = 0;
  let y = 0;
  let found = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const cx = randRange(-hw, hw);
    const cy = randRange(-hh, hh);
    if (found) continue;
    x = cx;
    y = cy;
    const dx = cx - world.ship.x;
    const dy = cy - world.ship.y;
    if (dx * dx + dy * dy >= cfg.minDistanceFromShip ** 2) found = true;
  }
  telegraphAt(world, x, y, cfg.duration);
  // pack members glow in around the anchor (clamped inside the view)
  for (let i = 1; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = SPAWNER.clumpRadius * (0.4 + 0.6 * rand());
    const px = clamp(x + Math.cos(a) * r, -hw, hw);
    const py = clamp(y + Math.sin(a) * r, -hh, hh);
    telegraphAt(world, px, py, cfg.duration);
  }
}

function spawnAt(
  world: World,
  x: number,
  y: number,
  minutes: number,
  opts?: { scale?: number; speedScale?: number },
): Drone | null {
  // draw before the cap check so a capped run consumes the same layout rolls
  const jitter = (rand() - 0.5) * 2 * SPAWNER.scaleJitter;
  if (world.drones.length >= SPAWNER.maxDrones) return null;
  const scale =
    opts?.scale ??
    clamp(
      0.6 + jitter, // avg size (Unity fallback used constant 1, clamped to 0.3..0.9)
      SPAWNER.scaleClamp[0],
      SPAWNER.scaleClamp[1],
    );
  const speedMult =
    Math.max(0.1, escalate(minutes, SPAWNER.speedMultiplier)) * (opts?.speedScale ?? 1);
  const drone = createDrone(x, y, scale, speedMult);
  world.drones.push(drone);
  return drone;
}

/** Direct spawn for the tutorial sandbox: fixed size, fixed (gentle) speed. */
export function spawnDroneDirect(
  world: World,
  x: number,
  y: number,
  scale = 0.6,
  speedMultiplier = 0.8,
): Drone {
  const drone = createDrone(x, y, scale, speedMultiplier);
  world.drones.push(drone);
  return drone;
}

/** Formation distance from the ship: outside the view no matter the aspect. */
export function spawnRadius(world: World): number {
  return Math.max(SPAWNER.minSpawnRadius, halfDiagonal(world) + 1.5);
}

/**
 * Ambient spawns: most telegraph on-screen (red fade-in, then pop) so danger
 * is visible and dodgeable; the rest sneak in from just past the view edge to
 * keep the radar chevrons honest. Packs (count > 1) gather around one anchor
 * so the crowd arrives in blobs with lanes between them.
 */
function spawnAmbient(world: World, minutes: number, count = 1): void {
  if (rand() < SPAWNER.telegraph.ratio) {
    telegraphAmbient(world, count);
    return;
  }

  const shipDist = (p: { x: number; y: number }): number =>
    Math.hypot(p.x - world.ship.x, p.y - world.ship.y);

  // fixed number of draws (see telegraphAmbient); keep the farthest candidate
  // once one clears the minimum ship distance
  let best = randomEdgePoint(world, SPAWNER.edgeMargin);
  let bestDist = shipDist(best);
  for (let attempt = 0; attempt < 8; attempt++) {
    const p = randomEdgePoint(world, SPAWNER.edgeMargin);
    if (bestDist >= SPAWNER.minDistanceFromShip) continue;
    const dist = shipDist(p);
    if (dist > bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  spawnAt(world, best.x, best.y, minutes);
  for (let i = 1; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = SPAWNER.clumpRadius * (0.4 + 0.6 * rand());
    spawnAt(world, best.x + Math.cos(a) * r, best.y + Math.sin(a) * r, minutes);
  }
}

// --- formations ---

/** Formations start big and reach full size fast (swarmy by ~20s). */
function formationIntensity(minutes: number): number {
  return lerp(0.75, 1, clamp(minutes, 0, 1));
}

/** Past the ramp, formations keep growing: +1 enemy per N minutes, capped. */
function formationCountBonus(minutes: number): number {
  const cfg = SPAWNER.formations;
  return Math.min(cfg.maxCountBonus, Math.floor(minutes / cfg.countGrowthMinutes));
}

/**
 * Weighted formation pick; heavier patterns only enter the pool later.
 * Iron Rain uses its own wall-heavy weights (and its pinned minutes unlock
 * the whole roster from second zero).
 */
function rollFormationKind(world: World, minutes: number): FormationKind {
  const cfg = SPAWNER.formations;
  const weights =
    world.gameMode === "ironrain" ? IRONRAIN.formationWeights : cfg.weights;
  const pool = (Object.keys(weights) as FormationKind[]).filter(
    (kind) => minutes >= (cfg.minMinutes[kind] ?? 0),
  );

  let total = 0;
  for (const kind of pool) total += weights[kind];

  let roll = scheduleRand() * total;
  for (const kind of pool) {
    roll -= weights[kind];
    if (roll <= 0) return kind;
  }
  return pool[pool.length - 1];
}

function handleFormations(world: World, minutes: number, dt: number): void {
  world.formationTimer += dt;
  if (world.formationTimer < world.nextFormationDelay) return;

  const kind = rollFormationKind(world, minutes);
  world.events.push({ type: "formation", kind });
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
    case "wall":
      spawnWallFormation(world, minutes);
      break;
    case "serpent":
      spawnSerpentFormation(world, minutes);
      break;
    case "pincer":
      spawnPincerFormation(world, minutes);
      break;
    case "corners":
      spawnCornersFormation(world, minutes);
      break;
    case "tightring":
      spawnRingAt(world, minutes, SPAWNER.formations.tightring);
      break;
    case "swarm":
      spawnSwarmFormation(world, minutes);
      break;
    case "megawall":
      spawnMegaWallFormation(world, minutes);
      break;
  }

  world.spawnAccumulator = 0;
  world.sustainedSpawnCooldown = SPAWNER.formations.postFormationDelay;
  scheduleNextFormation(world);
}

/** Formations come faster over time: the interval shrinks toward a floor. */
function scheduleNextFormation(world: World): void {
  world.formationTimer = 0;
  const cfg = SPAWNER.formations;
  const t = clamp01(difficultyMinutes(world) / cfg.intervalRampMinutes);
  const min = lerp(cfg.intervalRange[0], cfg.intervalFloor[0], t);
  const max = lerp(cfg.intervalRange[1], cfg.intervalFloor[1], t);
  world.nextFormationDelay = scheduleRange(min, max);
}

/** A sweeping line of drones approaching from one off-screen direction. */
function spawnLineFormation(world: World, minutes: number): void {
  const { spacing } = SPAWNER.formations.line;
  const count =
    Math.max(2, Math.round(SPAWNER.formations.line.count * formationIntensity(minutes))) +
    formationCountBonus(minutes);
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
 * one second to escape through a gap before it materializes. Also drives the
 * tight-ring variant (smaller radius, more drones).
 */
function spawnRingAt(
  world: World,
  minutes: number,
  cfg: { count: number; radius: number; telegraphDuration: number },
): void {
  const count =
    Math.max(3, Math.round(cfg.count * formationIntensity(minutes))) +
    formationCountBonus(minutes);
  const startAngle = rand() * Math.PI * 2;

  for (let i = 0; i < count; i++) {
    const a = startAngle + (Math.PI * 2 * i) / count;
    telegraphAt(
      world,
      world.ship.x + Math.cos(a) * cfg.radius,
      world.ship.y + Math.sin(a) * cfg.radius,
      cfg.telegraphDuration,
    );
  }
  world.events.push({ type: "ringWarning" });
}

function spawnRingFormation(world: World, minutes: number): void {
  spawnRingAt(world, minutes, SPAWNER.formations.ring);
}

/** A dense swarm bursting in from a single off-screen point. */
function spawnBurstFormation(world: World, minutes: number): void {
  const { spreadRadius } = SPAWNER.formations.burst;
  const count =
    Math.max(3, Math.round(SPAWNER.formations.burst.count * formationIntensity(minutes))) +
    formationCountBonus(minutes);
  const dir = randDir();
  const dist = spawnRadius(world) + spreadRadius;
  const ox = world.ship.x + dir.x * dist;
  const oy = world.ship.y + dir.y * dist;

  for (let i = 0; i < count; i++) {
    const off = randInCircle();
    spawnAt(world, ox + off.x * spreadRadius, oy + off.y * spreadRadius, minutes);
  }
}

/** Which arena edge a wall marches in from. */
type WallSide = 0 | 1 | 2 | 3; // left, right, bottom, top

/**
 * One wall of drones spanning an arena edge (minus escape gaps), marching
 * straight across on a fixed heading. Uniform size so the line stays a line;
 * the script releases back to homing once the wall has fully crossed.
 */
function spawnWallSpan(
  world: World,
  minutes: number,
  side: WallSide,
  cfg: { spacing: number; gapSize: number; scale: number; speedScale: number },
  opts?: { rows?: number; rowOffset?: number; gapCount?: number },
): void {
  const margin = SPAWNER.edgeMargin + 0.5;
  const hw = world.viewW / 2;
  const hh = world.viewH / 2;
  const alongX = side >= 2; // bottom/top walls span the x axis
  const span = alongX ? world.viewW : world.viewH;
  // Iron Rain packs walls tighter and shrinks the escape gaps
  const ironrain = world.gameMode === "ironrain";
  const spacingScale = ironrain ? IRONRAIN.wallSpacingScale : 1;
  const gapScale = ironrain ? IRONRAIN.wallGapScale : 1;
  // early walls are sparser, tightening to full density by the 3-minute mark
  const spacing = (cfg.spacing * spacingScale) / formationIntensity(minutes);
  const gapSize = cfg.gapSize * gapScale;

  // player-sized escape gaps, spread across the span (shared by every row so
  // multi-row walls stay threadable)
  const gapCount = opts?.gapCount ?? (span > 12 ? 2 : 1);
  const gaps: number[] = [];
  for (let g = 0; g < gapCount; g++) {
    gaps.push(randRange(-span * 0.4, span * 0.4));
  }

  const rows = opts?.rows ?? 1;
  const rowOffset = opts?.rowOffset ?? 0;

  const dirX = side === 0 ? 1 : side === 1 ? -1 : 0;
  const dirY = side === 2 ? 1 : side === 3 ? -1 : 0;
  const startX = side === 0 ? -hw - margin : side === 1 ? hw + margin : 0;
  const startY = side === 2 ? -hh - margin : side === 3 ? hh + margin : 0;

  const crossDist =
    (alongX ? world.viewH : world.viewW) + 2 * margin + 0.5 + rowOffset * (rows - 1);
  const speed =
    DRONE.baseSpeed *
    Math.max(0.1, escalate(minutes, SPAWNER.speedMultiplier)) *
    cfg.speedScale *
    droneSizeSpeedFactor(cfg.scale);
  const timer = crossDist / speed;

  const count = Math.floor(span / spacing) + 1;
  const half = (count - 1) / 2;
  for (let row = 0; row < rows; row++) {
    // trailing rows start further behind the leading edge, staggered half a
    // step sideways so the wall reads as a thick lattice, not stacked lines
    const back = rowOffset * row;
    const sideStagger = (row % 2) * spacing * 0.5;
    for (let i = 0; i < count; i++) {
      const off = (i - half) * spacing + sideStagger;
      if (gaps.some((g) => Math.abs(off - g) < gapSize / 2)) continue;
      const x = alongX ? off : startX - dirX * back;
      const y = alongX ? startY - dirY * back : off;
      const d = spawnAt(world, x, y, minutes, { scale: cfg.scale, speedScale: cfg.speedScale });
      if (!d) return;
      d.scriptMode = "straight";
      d.scriptDirX = dirX;
      d.scriptDirY = dirY;
      d.scriptTimer = timer;
    }
  }
}

/**
 * Iron Rain only: occasionally a wall spawns with NO escape gap — the only
 * way through is a power (shockwave, starshell, shield, afterburner). Iron
 * Rain never runs seeded (Daily Patrol is Classic-only), so Math.random is
 * safe here.
 */
function rollGapless(world: World): { gapCount: number } | undefined {
  if (world.gameMode !== "ironrain") return undefined;
  return Math.random() < IRONRAIN.gaplessWallChance ? { gapCount: 0 } : undefined;
}

/** A dot wall sweeps across the arena from one random edge. */
function spawnWallFormation(world: World, minutes: number): void {
  const side = Math.floor(rand() * 4) as WallSide;
  spawnWallSpan(world, minutes, side, SPAWNER.formations.wall, rollGapless(world));
  world.events.push({ type: "ringWarning" });
}

/** Two walls converge from opposite edges — thread a gap or die. */
function spawnPincerFormation(world: World, minutes: number): void {
  const cfg = SPAWNER.formations.pincer;
  if (rand() < 0.5) {
    spawnWallSpan(world, minutes, 0, cfg);
    spawnWallSpan(world, minutes, 1, cfg);
  } else {
    spawnWallSpan(world, minutes, 2, cfg);
    spawnWallSpan(world, minutes, 3, cfg);
  }
  world.events.push({ type: "ringWarning" });
}

/**
 * A dotted train: the head carves a smooth-noise curve toward the player
 * while the body trails behind it; the whole train releases to homing when
 * the head's script expires.
 */
function spawnSerpentFormation(world: World, minutes: number): void {
  const cfg = SPAWNER.formations.serpent;
  const count =
    Math.max(6, Math.round(cfg.count * formationIntensity(minutes))) +
    formationCountBonus(minutes);
  const dir = randDir();
  const dist = spawnRadius(world);
  const hx = world.ship.x + dir.x * dist;
  const hy = world.ship.y + dir.y * dist;
  const aim = Math.atan2(world.ship.y - hy, world.ship.x - hx) + randRange(-0.4, 0.4);
  const hdx = Math.cos(aim);
  const hdy = Math.sin(aim);

  const head = spawnAt(world, hx, hy, minutes, { scale: cfg.scale, speedScale: cfg.speedScale });
  if (!head) return;
  head.scriptMode = "straight";
  head.scriptDirX = hdx;
  head.scriptDirY = hdy;
  head.scriptTimer = cfg.duration;
  head.scriptWander = cfg.wander;

  let prev = head;
  for (let i = 1; i < count; i++) {
    const seg = spawnAt(world, hx - hdx * cfg.spacing * i, hy - hdy * cfg.spacing * i, minutes, {
      scale: cfg.scale,
      speedScale: cfg.speedScale,
    });
    if (!seg) break;
    seg.scriptMode = "follow";
    seg.followTarget = prev;
    seg.scriptTimer = cfg.duration + 0.5 + i * 0.05;
    prev = seg;
  }
}

/**
 * The big one: a slow, 3-row-thick wall spanning the whole arena with a
 * single narrow gap. Thread the gap or blast a hole with a power.
 */
function spawnMegaWallFormation(world: World, minutes: number): void {
  const cfg = SPAWNER.formations.megawall;
  const side = Math.floor(rand() * 4) as WallSide;
  spawnWallSpan(world, minutes, side, cfg, {
    rows: cfg.rows,
    rowOffset: cfg.rowOffset,
    gapCount: rollGapless(world) ? 0 : 1,
  });
  world.events.push({ type: "ringWarning" });
}

/**
 * A loose school of drones drifting across the arena as one organic blob:
 * every drone shares roughly the same heading (through the player) with a
 * little individual wander, then the school releases to homing.
 */
function spawnSwarmFormation(world: World, minutes: number): void {
  const cfg = SPAWNER.formations.swarm;
  const count =
    Math.max(8, Math.round(cfg.count * formationIntensity(minutes))) +
    formationCountBonus(minutes);
  const dir = randDir();
  const dist = spawnRadius(world) + cfg.spreadRadius;
  const cx = world.ship.x + dir.x * dist;
  const cy = world.ship.y + dir.y * dist;
  const aim = Math.atan2(world.ship.y - cy, world.ship.x - cx);

  // release as the school passes the player so it re-forms into a hunt
  const speed =
    DRONE.baseSpeed *
    Math.max(0.1, escalate(minutes, SPAWNER.speedMultiplier)) *
    cfg.speedScale *
    droneSizeSpeedFactor(cfg.scale);
  const timer = (dist + 5) / speed;

  for (let i = 0; i < count; i++) {
    const off = randInCircle();
    const d = spawnAt(
      world,
      cx + off.x * cfg.spreadRadius,
      cy + off.y * cfg.spreadRadius,
      minutes,
      { scale: cfg.scale, speedScale: cfg.speedScale },
    );
    if (!d) return;
    const a = aim + randRange(-0.18, 0.18);
    d.scriptMode = "straight";
    d.scriptDirX = Math.cos(a);
    d.scriptDirY = Math.sin(a);
    d.scriptTimer = timer * randRange(0.9, 1.1);
    d.scriptWander = cfg.wander;
  }
}

// --- drone assemblies (ambient drones conscript into a charging shape) ---

/** Current drone speed baseline for assembly steering/charging. */
function assemblyBaseSpeed(world: World): number {
  return (
    DRONE.baseSpeed *
    Math.max(0.1, escalate(difficultyMinutes(world), SPAWNER.speedMultiplier))
  );
}

function disbandAssembly(world: World, a: Assembly): void {
  for (const m of a.members) m.assembly = null;
  const i = world.assemblies.indexOf(a);
  if (i >= 0) world.assemblies.splice(i, 1);
}

/**
 * Conscript free ambient drones near a random seed into a line or vee.
 * Member selection depends on the local drone layout (player-dependent), so
 * it uses positions + Math.random and never touches the seeded streams.
 */
function tryFormAssembly(world: World, count: number, vee: boolean): void {
  const free = world.drones.filter(
    (d) => d.alive && !d.scriptMode && !d.assembly && d.frozen <= 0,
  );
  if (free.length < ASSEMBLY.minMembers) return;

  const seed = free[Math.floor(Math.random() * free.length)];
  const members = free
    .filter((d) => Math.hypot(d.x - seed.x, d.y - seed.y) <= ASSEMBLY.gatherRadius)
    .sort(
      (a, b) =>
        Math.hypot(a.x - seed.x, a.y - seed.y) - Math.hypot(b.x - seed.x, b.y - seed.y),
    )
    .slice(0, count);
  if (members.length < ASSEMBLY.minMembers) return;

  let cx = 0;
  let cy = 0;
  for (const m of members) {
    cx += m.x;
    cy += m.y;
  }
  cx /= members.length;
  cy /= members.length;

  const aimLen = Math.hypot(world.ship.x - cx, world.ship.y - cy) || 1;
  const aimX = (world.ship.x - cx) / aimLen;
  const aimY = (world.ship.y - cy) / aimLen;
  const perpX = -aimY;
  const perpY = aimX;

  const assembly: Assembly = {
    phase: "form",
    timer: ASSEMBLY.formTime,
    members,
    x: cx,
    y: cy,
    dirX: aimX,
    dirY: aimY,
    speed: 0,
  };

  const half = (members.length - 1) / 2;
  members.forEach((d, i) => {
    let ox: number;
    let oy: number;
    if (vee) {
      // arrowhead pointing at the ship: tip first, arms sweeping back
      const row = Math.ceil(i / 2);
      const side = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
      ox = -aimX * row * ASSEMBLY.spacing * 0.9 + perpX * side * row * ASSEMBLY.spacing * 0.75;
      oy = -aimY * row * ASSEMBLY.spacing * 0.9 + perpY * side * row * ASSEMBLY.spacing * 0.75;
    } else {
      // broadside line, perpendicular to the approach
      const off = (i - half) * ASSEMBLY.spacing;
      ox = perpX * off;
      oy = perpY * off;
    }
    d.assembly = assembly;
    d.slotX = ox;
    d.slotY = oy;
  });

  world.assemblies.push(assembly);
  world.events.push({ type: "assembly", x: cx, y: cy });
}

/** Move a member toward its slot, capped at `speed`; updates vx/vy. */
function steerMemberToSlot(a: Assembly, d: Drone, speed: number, dt: number): void {
  const tx = a.x + (d.slotX ?? 0) - d.x;
  const ty = a.y + (d.slotY ?? 0) - d.y;
  const dist = Math.hypot(tx, ty);
  const step = Math.min(dist, speed * dt);
  if (dist > 0.001) {
    d.x += (tx / dist) * step;
    d.y += (ty / dist) * step;
    d.vx = (tx / dist) * (step / dt);
    d.vy = (ty / dist) * (step / dt);
  } else {
    d.vx = a.speed * a.dirX;
    d.vy = a.speed * a.dirY;
  }
}

/**
 * Assembly lifecycle. The event timer + shape/count rolls ride the seeded
 * schedule stream with a fixed number of draws per event (gated after the
 * draws), so Daily Patrol runs fire identical assembly events for everyone.
 */
export function updateAssemblies(world: World, dt: number): void {
  if (world.sandbox) return;

  if (world.phase !== "playing") {
    // death: release everyone so the swarm drifts naturally during the cinematic
    while (world.assemblies.length > 0) disbandAssembly(world, world.assemblies[0]);
    return;
  }

  world.assemblyTimer -= dt;
  if (world.assemblyTimer <= 0) {
    world.assemblyTimer = scheduleRange(...ASSEMBLY.intervalRange);
    // fixed draws per event — consumed even when the event fizzles
    const count = Math.round(scheduleRange(...ASSEMBLY.countRange));
    const vee = scheduleRand() < 0.5;
    if (difficultyMinutes(world) >= ASSEMBLY.minMinutes) {
      tryFormAssembly(world, count, vee);
    }
  }

  const hw = world.viewW / 2;
  const hh = world.viewH / 2;

  for (let i = world.assemblies.length - 1; i >= 0; i--) {
    const a = world.assemblies[i];
    // dead members drop out; frozen members are released back to the swarm
    // (so they resume normal homing when they thaw)
    a.members = a.members.filter((m) => {
      if (m.alive && m.frozen <= 0) return true;
      m.assembly = null;
      return false;
    });
    if (a.members.length < 3) {
      disbandAssembly(world, a);
      continue;
    }

    a.timer -= dt;

    if (a.phase === "form") {
      const speed = assemblyBaseSpeed(world) * ASSEMBLY.formSpeedScale;
      for (const m of a.members) steerMemberToSlot(a, m, speed, dt);
      if (a.timer <= 0) {
        a.phase = "charge";
        a.timer = ASSEMBLY.chargeTime;
        const len = Math.hypot(world.ship.x - a.x, world.ship.y - a.y) || 1;
        a.dirX = (world.ship.x - a.x) / len;
        a.dirY = (world.ship.y - a.y) / len;
        a.speed = assemblyBaseSpeed(world) * ASSEMBLY.chargeSpeedScale;
      }
      continue;
    }

    // charge: the anchor barrels ahead; members hold their slots rigidly
    a.x += a.dirX * a.speed * dt;
    a.y += a.dirY * a.speed * dt;
    const memberSpeed = a.speed * 1.6; // catches up, then tracks the shape
    for (const m of a.members) steerMemberToSlot(a, m, memberSpeed, dt);

    const out =
      Math.abs(a.x) > hw + ASSEMBLY.gatherRadius || Math.abs(a.y) > hh + ASSEMBLY.gatherRadius;
    if (a.timer <= 0 || out) disbandAssembly(world, a);
  }
}

/** Simultaneous bursts from all four arena corners. */
function spawnCornersFormation(world: World, minutes: number): void {
  const cfg = SPAWNER.formations.corners;
  const per =
    Math.max(2, Math.round(cfg.countPerCorner * formationIntensity(minutes))) +
    Math.ceil(formationCountBonus(minutes) / 4);
  const hw = world.viewW / 2 + SPAWNER.edgeMargin;
  const hh = world.viewH / 2 + SPAWNER.edgeMargin;

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (let i = 0; i < per; i++) {
        const off = randInCircle();
        spawnAt(world, sx * hw + off.x * cfg.spreadRadius, sy * hh + off.y * cfg.spreadRadius, minutes);
      }
    }
  }
}
