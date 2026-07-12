import { MINES, PALETTE, POWERS, SCORING, type PowerId } from "./config";
import { droneRadius, killDrone, killDronesInRadius } from "./enemies";
import { rand, randInCircle } from "./math";
import { isMineArmed, killMine, killMinesInRadius } from "./mines";
import type { ArcChainState, Drone, Mine, PowersState, World } from "./types";

export function createPowersState(): PowersState {
  return {
    shieldActive: false,
    starshellTimer: 0,
    pulseTimer: 0,
    magnetTimer: 0,
    afterburnerCharge: 0,
    afterburnerDash: 0,
    afterburnerGrace: 0,
    trail: [],
    projectiles: [],
    missiles: [],
    waves: [],
    arcBolts: [],
    arcChain: null,
    autocannonTimer: 0,
    autocannonCooldown: 0,
    autocannonAngle: 0,
    bullets: [],
    meteorTimer: 0,
    meteorCooldown: 0,
    vortices: [],
  };
}

/** Auto-activate on pickup (port of Unity PowerManager.Trigger). */
export function activatePower(world: World, power: PowerId): void {
  const p = world.powers;
  switch (power) {
    case "shield":
      p.shieldActive = true;
      world.events.push({ type: "shieldUp" });
      break;
    case "starshell":
      p.starshellTimer = POWERS.starshell.duration;
      world.events.push({ type: "starshellUp" });
      break;
    case "shockwave":
      killDronesInRadius(world, world.ship.x, world.ship.y, POWERS.shockwave.radius);
      killMinesInRadius(world, world.ship.x, world.ship.y, POWERS.shockwave.radius);
      p.waves.push({
        x: world.ship.x,
        y: world.ship.y,
        elapsed: 0,
        lifetime: POWERS.shockwave.waveLifetime,
        maxRadius: POWERS.shockwave.waveMaxRadius,
        color: PALETTE.gold,
      });
      world.events.push({ type: "shockwave", x: world.ship.x, y: world.ship.y });
      world.shake = Math.max(world.shake, 0.35);
      break;
    case "pulse":
      p.pulseTimer = POWERS.pulse.chargeTime;
      world.events.push({ type: "pulseCharge" });
      break;
    case "magnet":
      p.magnetTimer = POWERS.magnet.duration;
      break;
    case "afterburner":
      // ignore re-pickup mid-dash; restart the charge otherwise
      if (p.afterburnerDash <= 0) {
        p.afterburnerCharge = POWERS.afterburner.chargeTime;
        world.events.push({ type: "afterburnerCharge" });
      }
      break;
    case "freeze": {
      const r = POWERS.freeze.radius;
      for (const d of world.drones) {
        if (!d.alive) continue;
        const dx = d.x - world.ship.x;
        const dy = d.y - world.ship.y;
        if (dx * dx + dy * dy <= r * r) d.frozen = POWERS.freeze.freezeDuration;
      }
      p.waves.push({
        x: world.ship.x,
        y: world.ship.y,
        elapsed: 0,
        lifetime: 0.9,
        maxRadius: r,
        color: PALETTE.freeze,
      });
      world.events.push({ type: "freeze", x: world.ship.x, y: world.ship.y });
      world.shake = Math.max(world.shake, 0.2);
      break;
    }
    case "missiles":
      fireMissileSwarm(world);
      break;
    case "arc":
      startArcChain(world);
      break;
    case "autocannon":
      p.autocannonTimer = POWERS.autocannon.duration;
      p.autocannonCooldown = 0; // first shot fires immediately
      break;
    case "meteors":
      p.meteorTimer = POWERS.meteors.duration;
      p.meteorCooldown = 0;
      break;
    case "vortex":
      p.vortices.push({
        x: world.ship.x,
        y: world.ship.y,
        timer: POWERS.vortex.pullDuration,
      });
      world.events.push({ type: "vortexOpen", x: world.ship.x, y: world.ship.y });
      world.shake = Math.max(world.shake, 0.15);
      break;
  }
}

/** Launch a ring of guided missiles that curve toward the nearest enemies. */
function fireMissileSwarm(world: World): void {
  const p = world.powers;
  const cfg = POWERS.missiles;
  const room = cfg.maxAlive - p.missiles.length;
  const count = Math.min(cfg.count, Math.max(0, room));
  const baseAngle = world.ship.angle;
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (Math.PI * 2 * i) / count;
    p.missiles.push({
      x: world.ship.x,
      y: world.ship.y,
      prevX: world.ship.x,
      prevY: world.ship.y,
      angle,
      elapsed: 0,
      target: null,
    });
  }
  if (count > 0) {
    world.events.push({ type: "missilesFire" });
    world.shake = Math.max(world.shake, 0.15);
  }
}

function isTargetAlive(t: Drone | Mine | null): boolean {
  return !!t && t.alive;
}

function nearestEnemyInRadius(
  world: World,
  x: number,
  y: number,
  radius: number,
  excludeDrones: Set<Drone>,
  excludeMines: Set<Mine>,
): Drone | Mine | null {
  const rSq = radius * radius;
  let best: Drone | Mine | null = null;
  let bestSq = Infinity;

  for (const d of world.drones) {
    if (!d.alive || excludeDrones.has(d)) continue;
    const dx = d.x - x;
    const dy = d.y - y;
    const sq = dx * dx + dy * dy;
    if (sq <= rSq && sq < bestSq) {
      bestSq = sq;
      best = d;
    }
  }
  for (const m of world.mines) {
    if (!m.alive || !isMineArmed(m) || excludeMines.has(m)) continue;
    const dx = m.x - x;
    const dy = m.y - y;
    const sq = dx * dx + dy * dy;
    if (sq <= rSq && sq < bestSq) {
      bestSq = sq;
      best = m;
    }
  }
  return best;
}

function pushArcBolt(
  p: PowersState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  p.arcBolts.push({
    fromX,
    fromY,
    toX,
    toY,
    elapsed: 0,
    seed: rand() * 1000,
  });
}

function zapTarget(
  world: World,
  p: PowersState,
  fromX: number,
  fromY: number,
  target: Drone | Mine,
  chain: ArcChainState,
): void {
  const tx = target.x;
  const ty = target.y;
  pushArcBolt(p, fromX, fromY, tx, ty);

  if (isDroneTarget(target)) {
    killDrone(world, target);
    chain.hitDrones.add(target);
  } else {
    killMine(world, target);
    chain.hitMines.add(target);
  }

  chain.x = tx;
  chain.y = ty;
  chain.jumpTimer = POWERS.arc.jumpInterval;
  world.events.push({ type: "arcZap", x: tx, y: ty });
  world.shake = Math.max(world.shake, 0.12);
}

/** Chain lightning: first zap on pickup, then jumps to nearby enemies. */
function startArcChain(world: World): void {
  const p = world.powers;
  const cfg = POWERS.arc;
  const ship = world.ship;
  const first = nearestEnemyInRadius(
    world,
    ship.x,
    ship.y,
    cfg.initialRadius,
    new Set(),
    new Set(),
  );

  if (!first) {
    p.waves.push({
      x: ship.x,
      y: ship.y,
      elapsed: 0,
      lifetime: cfg.fizzleLifetime,
      maxRadius: cfg.fizzleRadius,
      color: PALETTE.arc,
    });
    world.events.push({ type: "arcFizzle", x: ship.x, y: ship.y });
    world.shake = Math.max(world.shake, 0.08);
    return;
  }

  const chain: ArcChainState = {
    x: first.x,
    y: first.y,
    jumpTimer: cfg.jumpInterval,
    hitDrones: new Set(),
    hitMines: new Set(),
  };
  p.arcChain = chain;
  zapTarget(world, p, ship.x, ship.y, first, chain);
  world.shake = Math.max(world.shake, 0.2);
}

function updateArcChain(world: World, dt: number): void {
  const p = world.powers;
  const chain = p.arcChain;
  if (!chain) return;

  chain.jumpTimer -= dt;
  if (chain.jumpTimer > 0) return;

  const cfg = POWERS.arc;
  const next = nearestEnemyInRadius(
    world,
    chain.x,
    chain.y,
    cfg.jumpRadius,
    chain.hitDrones,
    chain.hitMines,
  );

  if (!next) {
    p.arcChain = null;
    return;
  }

  zapTarget(world, p, chain.x, chain.y, next, chain);
}

function updateArcBolts(world: World, dt: number): void {
  const p = world.powers;
  const lifetime = POWERS.arc.boltLifetime;
  for (let i = p.arcBolts.length - 1; i >= 0; i--) {
    const bolt = p.arcBolts[i];
    bolt.elapsed += dt;
    if (bolt.elapsed >= lifetime) p.arcBolts.splice(i, 1);
  }
}

function isDroneTarget(t: Drone | Mine): t is Drone {
  return "scale" in t;
}

function nearestEnemy(world: World, x: number, y: number): Drone | Mine | null {
  let best: Drone | Mine | null = null;
  let bestSq = Infinity;
  for (const d of world.drones) {
    if (!d.alive) continue;
    const dx = d.x - x;
    const dy = d.y - y;
    const sq = dx * dx + dy * dy;
    if (sq < bestSq) {
      bestSq = sq;
      best = d;
    }
  }
  for (const m of world.mines) {
    if (!m.alive || !isMineArmed(m)) continue;
    const dx = m.x - x;
    const dy = m.y - y;
    const sq = dx * dx + dy * dy;
    if (sq < bestSq) {
      bestSq = sq;
      best = m;
    }
  }
  return best;
}

function updateMissiles(world: World, dt: number): void {
  const p = world.powers;
  const cfg = POWERS.missiles;

  for (let i = p.missiles.length - 1; i >= 0; i--) {
    const ms = p.missiles[i];
    ms.prevX = ms.x;
    ms.prevY = ms.y;
    ms.elapsed += dt;
    if (ms.elapsed >= cfg.lifetime) {
      p.missiles.splice(i, 1);
      continue;
    }

    if (!isTargetAlive(ms.target)) {
      ms.target = nearestEnemy(world, ms.x, ms.y);
    }

    // steer toward the target with a limited turn rate so missiles arc
    if (ms.target) {
      const desired = Math.atan2(ms.target.y - ms.y, ms.target.x - ms.x);
      let diff = desired - ms.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = cfg.turnRate * dt;
      ms.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }

    ms.x += Math.cos(ms.angle) * cfg.speed * dt;
    ms.y += Math.sin(ms.angle) * cfg.speed * dt;

    // impact: single-target, missile dies with its kill
    let exploded = false;
    for (const d of world.drones) {
      if (!d.alive) continue;
      const dx = d.x - ms.x;
      const dy = d.y - ms.y;
      const r = cfg.radius + droneRadius(d);
      if (dx * dx + dy * dy <= r * r) {
        killDrone(world, d);
        exploded = true;
        break;
      }
    }
    if (!exploded) {
      for (const m of world.mines) {
        if (!m.alive || !isMineArmed(m)) continue;
        const dx = m.x - ms.x;
        const dy = m.y - ms.y;
        const r = cfg.radius + MINES.radius;
        if (dx * dx + dy * dy <= r * r) {
          killMine(world, m);
          exploded = true;
          break;
        }
      }
    }
    if (exploded) p.missiles.splice(i, 1);
  }
}

const NO_DRONES: Set<Drone> = new Set();
const NO_MINES: Set<Mine> = new Set();

/** Ship-mounted turret: auto-fires tracer rounds at the nearest enemy in range. */
function updateAutocannon(world: World, dt: number): void {
  const p = world.powers;
  const cfg = POWERS.autocannon;

  if (p.autocannonTimer > 0) {
    p.autocannonTimer -= dt;
    p.autocannonCooldown -= dt;
    if (p.autocannonCooldown <= 0 && world.phase === "playing") {
      const ship = world.ship;
      const target = nearestEnemyInRadius(world, ship.x, ship.y, cfg.range, NO_DRONES, NO_MINES);
      if (target) {
        const angle = Math.atan2(target.y - ship.y, target.x - ship.x);
        p.autocannonAngle = angle;
        p.bullets.push({
          x: ship.x,
          y: ship.y,
          prevX: ship.x,
          prevY: ship.y,
          dirX: Math.cos(angle),
          dirY: Math.sin(angle),
          elapsed: 0,
        });
        p.autocannonCooldown = cfg.fireInterval;
        world.events.push({ type: "autocannonFire", x: ship.x, y: ship.y });
      }
    }
  }

  // bullets: fly straight, kill the first drone (or mine) hit, then die
  for (let i = p.bullets.length - 1; i >= 0; i--) {
    const b = p.bullets[i];
    b.prevX = b.x;
    b.prevY = b.y;
    b.elapsed += dt;
    b.x += b.dirX * cfg.bulletSpeed * dt;
    b.y += b.dirY * cfg.bulletSpeed * dt;

    let hit = false;
    for (const d of world.drones) {
      if (!d.alive) continue;
      const dx = d.x - b.x;
      const dy = d.y - b.y;
      const r = cfg.bulletRadius + droneRadius(d);
      if (dx * dx + dy * dy <= r * r) {
        killDrone(world, d);
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const m of world.mines) {
        if (!m.alive || !isMineArmed(m)) continue;
        const dx = m.x - b.x;
        const dy = m.y - b.y;
        const r = cfg.bulletRadius + MINES.radius;
        if (dx * dx + dy * dy <= r * r) {
          killMine(world, m);
          hit = true;
          break;
        }
      }
    }
    if (hit || b.elapsed >= cfg.bulletLifetime) p.bullets.splice(i, 1);
  }
}

/** Meteor storm: explosions rain down, biased toward drone clusters. */
function updateMeteors(world: World, dt: number): void {
  const p = world.powers;
  const cfg = POWERS.meteors;
  if (p.meteorTimer <= 0) return;

  p.meteorTimer -= dt;
  p.meteorCooldown -= dt;
  if (p.meteorCooldown > 0 || world.phase !== "playing") return;
  p.meteorCooldown = cfg.interval;

  // aim at a random alive drone (jittered) so strikes chase the swarm;
  // with no drones left, hammer a random on-screen point for the spectacle
  let x: number;
  let y: number;
  const alive = world.drones.filter((d) => d.alive);
  if (alive.length > 0) {
    const target = alive[Math.floor(rand() * alive.length)];
    const off = randInCircle();
    x = target.x + off.x * cfg.scatter;
    y = target.y + off.y * cfg.scatter;
  } else {
    x = (rand() - 0.5) * world.viewW * 0.8;
    y = (rand() - 0.5) * world.viewH * 0.8;
  }

  killDronesInRadius(world, x, y, cfg.radius);
  killMinesInRadius(world, x, y, cfg.radius);
  p.waves.push({
    x,
    y,
    elapsed: 0,
    lifetime: cfg.waveLifetime,
    maxRadius: cfg.radius * 1.6,
    color: PALETTE.meteors,
  });
  world.events.push({ type: "meteorStrike", x, y });
  world.shake = Math.max(world.shake, 0.18);
}

/** Vortices: pull drones inward, then collapse and kill the core. */
function updateVortices(world: World, dt: number): void {
  const p = world.powers;
  const cfg = POWERS.vortex;

  for (let i = p.vortices.length - 1; i >= 0; i--) {
    const v = p.vortices[i];
    v.timer -= dt;

    if (v.timer <= 0) {
      killDronesInRadius(world, v.x, v.y, cfg.killRadius);
      killMinesInRadius(world, v.x, v.y, cfg.killRadius);
      p.waves.push({
        x: v.x,
        y: v.y,
        elapsed: 0,
        lifetime: 0.9,
        maxRadius: cfg.pullRadius,
        color: PALETTE.vortex,
      });
      world.events.push({ type: "vortexCollapse", x: v.x, y: v.y });
      world.shake = Math.max(world.shake, 0.4);
      p.vortices.splice(i, 1);
      continue;
    }

    // drag drones toward the singularity, harder the closer they get;
    // anything that reaches the core is devoured on the spot (and scores)
    for (const d of world.drones) {
      if (!d.alive) continue;
      const dx = v.x - d.x;
      const dy = v.y - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist > cfg.pullRadius) continue;
      if (dist <= cfg.absorbRadius + droneRadius(d)) {
        killDrone(world, d);
        continue;
      }
      const strength = 0.4 + 0.6 * (1 - dist / cfg.pullRadius);
      const pull = Math.min(dist, cfg.pullSpeed * strength * dt);
      d.x += (dx / dist) * pull;
      d.y += (dy / dist) * pull;
    }
  }
}

export function updatePowers(world: World, dt: number): void {
  const p = world.powers;

  if (p.starshellTimer > 0) p.starshellTimer -= dt;
  if (p.magnetTimer > 0) p.magnetTimer -= dt;

  // afterburner: charge -> dash -> burning trail
  if (p.afterburnerCharge > 0) {
    p.afterburnerCharge -= dt;
    if (p.afterburnerCharge <= 0 && world.phase === "playing") {
      p.afterburnerDash = POWERS.afterburner.dashDuration;
      world.events.push({ type: "dash" });
      world.shake = Math.max(world.shake, 0.3);
    }
  }
  if (p.afterburnerDash > 0) {
    p.afterburnerDash -= dt;
    p.trail.push({ x: world.ship.x, y: world.ship.y, age: 0 });
    // arrival grace: brief invincibility so dashing into a swarm isn't lethal
    if (p.afterburnerDash <= 0) {
      p.afterburnerGrace = POWERS.afterburner.arrivalInvulnTime;
    }
  } else if (p.afterburnerGrace > 0) {
    p.afterburnerGrace -= dt;
  }
  for (let i = p.trail.length - 1; i >= 0; i--) {
    const t = p.trail[i];
    t.age += dt;
    if (t.age >= POWERS.afterburner.trailLifetime) p.trail.splice(i, 1);
  }
  if (p.trail.length > 0) {
    const kr = POWERS.afterburner.trailKillRadius;
    for (const d of world.drones) {
      if (!d.alive) continue;
      const rr = kr + droneRadius(d);
      for (const t of p.trail) {
        const dx = d.x - t.x;
        const dy = d.y - t.y;
        if (dx * dx + dy * dy <= rr * rr) {
          killDrone(world, d);
          break;
        }
      }
    }
    for (const t of p.trail) {
      killMinesInRadius(world, t.x, t.y, kr);
    }
  }

  // pulse shot: charge at the ship's nose, then fire forward
  if (p.pulseTimer > 0) {
    p.pulseTimer -= dt;
    if (p.pulseTimer <= 0 && world.phase === "playing") {
      firePulse(world);
    }
  }

  // projectiles: fly straight, kill each drone once, expire
  for (let i = p.projectiles.length - 1; i >= 0; i--) {
    const proj = p.projectiles[i];
    proj.prevX = proj.x;
    proj.prevY = proj.y;
    proj.elapsed += dt;
    proj.x += proj.dirX * POWERS.pulse.projectileSpeed * dt;
    proj.y += proj.dirY * POWERS.pulse.projectileSpeed * dt;

    const r = POWERS.pulse.projectileRadius;
    for (const d of world.drones) {
      if (!d.alive || proj.hit.has(d)) continue;
      const dx = d.x - proj.x;
      const dy = d.y - proj.y;
      const rr = r + droneRadius(d);
      if (dx * dx + dy * dy <= rr * rr) {
        proj.hit.add(d);
        killDrone(world, d, "pulse");
        // skill-shot payoff: each kill at/past the threshold pays a bonus, so
        // one projectile totals pulseMultiKillPoints * (hits - min + 1) * mult
        if (proj.hit.size >= SCORING.pulseMultiKillMin && world.phase === "playing") {
          const bonus = SCORING.pulseMultiKillPoints * world.multiplier;
          world.score += bonus;
          world.events.push({
            type: "pulseMultiKill",
            x: d.x,
            y: d.y,
            points: Math.round(bonus),
            hits: proj.hit.size,
          });
        }
      }
    }

    killMinesInRadius(world, proj.x, proj.y, r);

    if (proj.elapsed >= POWERS.pulse.projectileLifetime) {
      p.projectiles.splice(i, 1);
    }
  }

  updateMissiles(world, dt);
  updateArcChain(world, dt);
  updateArcBolts(world, dt);
  updateAutocannon(world, dt);
  updateMeteors(world, dt);
  updateVortices(world, dt);

  // expanding ring visuals
  for (let i = p.waves.length - 1; i >= 0; i--) {
    const w = p.waves[i];
    w.elapsed += dt;
    if (w.elapsed >= w.lifetime) p.waves.splice(i, 1);
  }
}

/** Shield absorbed a hit: kill the attacker + detonate radially (Unity ShieldEffect.OnShieldHit). */
export function detonateShield(world: World): void {
  const p = world.powers;
  p.shieldActive = false;
  killDronesInRadius(
    world,
    world.ship.x,
    world.ship.y,
    POWERS.shield.detonationRadius,
  );
  killMinesInRadius(world, world.ship.x, world.ship.y, POWERS.shield.detonationRadius);
  p.waves.push({
    x: world.ship.x,
    y: world.ship.y,
    elapsed: 0,
    lifetime: POWERS.shockwave.waveLifetime,
    maxRadius: POWERS.shield.detonationRadius * 2,
    color: PALETTE.shield,
  });
  world.events.push({ type: "shieldDetonate", x: world.ship.x, y: world.ship.y });
  world.shake = Math.max(world.shake, 0.45);
}

function firePulse(world: World): void {
  const s = world.ship;
  const dirX = Math.cos(s.angle);
  const dirY = Math.sin(s.angle);
  const x = s.x + dirX * POWERS.pulse.spawnOffset;
  const y = s.y + dirY * POWERS.pulse.spawnOffset;
  world.powers.projectiles.push({
    x,
    y,
    prevX: x,
    prevY: y,
    dirX,
    dirY,
    elapsed: 0,
    hit: new Set(),
  });
  world.events.push({ type: "pulseFire", x, y });
  world.shake = Math.max(world.shake, 0.15);
}
