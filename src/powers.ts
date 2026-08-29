import { MINES, PALETTE, POWERS, SCORING, type PowerId } from "./config";
import { droneRadius, killDrone, killDronesInRadius } from "./enemies";
// Power effects are player-triggered (when a pickup is grabbed), so their
// randomness stays on Math.random — drawing from the seeded daily streams
// here would desync the shared spawn script between players. OVERCHARGE's
// amplification is a plain config-value multiplier on top, so it's safe too.
import { freezeMinesInRadius, isMineArmed, killMine, killMinesInRadius } from "./mines";
import { killLighthousesInRadius } from "./lighthouse";
import { mutatorPowerAmpScale, mutatorStarshellDurationScale } from "./mutators";
import type { ArcChainState, Drone, Mine, Pickup, PowersState, World } from "./types";
import { clamp01 } from "./math";

export function createPowersState(): PowersState {
  return {
    shieldActive: false,
    starshellTimer: 0,
    pulseTimer: 0,
    ionTimer: 0,
    magnetPending: 0,
    afterburnerCharge: 0,
    afterburnerDash: 0,
    afterburnerGrace: 0,
    trail: [],
    projectiles: [],
    missiles: [],
    waves: [],
    blasts: [],
    arcBolts: [],
    arcChain: null,
    autocannonTimer: 0,
    autocannonCooldown: 0,
    autocannonAngle: 0,
    bullets: [],
    meteorTimer: 0,
    meteorCooldown: 0,
    vortices: [],
    razorTimer: 0,
    cloakTimer: 0,
    cloakBombCooldown: 0,
    cloakBombs: [],
    flares: [],
    thunderBolts: [],
  };
}

/**
 * Drop a lingering kill zone: lethal to anything inside for its whole life.
 * expandTime > 0 makes the zone sweep outward first (shockwave), otherwise
 * it lands at full radius instantly (missile impacts, meteor craters).
 */
export function spawnBlast(
  world: World,
  x: number,
  y: number,
  maxRadius: number,
  opts: { expandTime?: number; holdTime: number; color: string; lethalToShip?: boolean },
): void {
  world.powers.blasts.push({
    x,
    y,
    elapsed: 0,
    expandTime: opts.expandTime ?? 0,
    holdTime: opts.holdTime,
    maxRadius,
    color: opts.color,
    lethalToShip: opts.lethalToShip,
  });
}

/** Current lethal radius of a blast (grows during the expand phase). */
export function blastRadius(b: { elapsed: number; expandTime: number; maxRadius: number }): number {
  if (b.expandTime <= 0) return b.maxRadius;
  return b.maxRadius * clamp01(b.elapsed / b.expandTime);
}

function updateBlasts(world: World, dt: number): void {
  const p = world.powers;
  for (let i = p.blasts.length - 1; i >= 0; i--) {
    const b = p.blasts[i];
    b.elapsed += dt;
    if (b.elapsed >= b.expandTime + b.holdTime) {
      p.blasts.splice(i, 1);
      continue;
    }
    const r = blastRadius(b);
    if (r > 0) {
      killDronesInRadius(world, b.x, b.y, r);
      killMinesInRadius(world, b.x, b.y, r);
      killLighthousesInRadius(world, b.x, b.y, r);
    }
  }
}

/** Auto-activate on pickup (port of Unity PowerManager.Trigger). */
export function activatePower(world: World, power: PowerId): void {
  const p = world.powers;
  // OVERCHARGE: drop RATE is untouched (see mutators.ts); this scales the
  // magnitude of whichever power lands, so it reads the same at the moment
  // of activation regardless of when the drop happened.
  const amp = mutatorPowerAmpScale();
  switch (power) {
    case "shield":
      p.shieldActive = true;
      world.events.push({ type: "shieldUp" });
      break;
    case "starshell":
      p.starshellTimer = POWERS.starshell.duration * mutatorStarshellDurationScale();
      world.events.push({ type: "starshellUp" });
      break;
    case "shockwave": {
      // instant core kill, then the sweep stays lethal out to the full wave
      // and lingers there — the "nuclear" afterglow
      const radius = POWERS.shockwave.radius * amp;
      const waveMaxRadius = POWERS.shockwave.waveMaxRadius * amp;
      killDronesInRadius(world, world.ship.x, world.ship.y, radius);
      killMinesInRadius(world, world.ship.x, world.ship.y, radius);
      spawnBlast(world, world.ship.x, world.ship.y, waveMaxRadius, {
        expandTime: POWERS.shockwave.waveLifetime,
        holdTime: POWERS.shockwave.blastLifetime,
        color: PALETTE.gold,
      });
      p.waves.push({
        x: world.ship.x,
        y: world.ship.y,
        elapsed: 0,
        lifetime: POWERS.shockwave.waveLifetime,
        maxRadius: waveMaxRadius,
        color: PALETTE.gold,
      });
      world.events.push({ type: "shockwave", x: world.ship.x, y: world.ship.y });
      world.shake = Math.max(world.shake, 0.35);
      break;
    }
    case "pulse":
      p.pulseTimer = POWERS.pulse.chargeTime;
      world.events.push({ type: "pulseCharge" });
      break;
    case "magnet": {
      // one-shot grab: claim the nearest unclaimed pickup; if the board is
      // empty, stay armed and take the next drop instead (see spawnPickup)
      let nearest: Pickup | undefined;
      let best = Infinity;
      for (const pu of world.pickups) {
        if (pu.magnetized) continue;
        const d = Math.hypot(pu.x - world.ship.x, pu.y - world.ship.y);
        if (d < best) {
          best = d;
          nearest = pu;
        }
      }
      if (nearest) nearest.magnetized = true;
      else p.magnetPending++;
      break;
    }
    case "afterburner":
      // ignore re-pickup mid-dash; restart the charge otherwise
      if (p.afterburnerDash <= 0) {
        p.afterburnerCharge = POWERS.afterburner.chargeTime;
        world.events.push({ type: "afterburnerCharge" });
      }
      break;
    case "freeze": {
      // OVERCHARGE: a bigger, longer-lasting cryo field.
      const r = POWERS.freeze.radius * amp;
      const duration = POWERS.freeze.freezeDuration * amp;
      for (const d of world.drones) {
        if (!d.alive) continue;
        const dx = d.x - world.ship.x;
        const dy = d.y - world.ship.y;
        if (dx * dx + dy * dy <= r * r) d.frozen = duration;
      }
      freezeMinesInRadius(world, world.ship.x, world.ship.y, r, duration);
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
    case "razor":
      p.razorTimer = POWERS.razor.duration * amp;
      world.events.push({ type: "razorUp" });
      break;
    case "thunder":
      fireThunder(world);
      break;
    case "cloak":
      p.cloakTimer = POWERS.cloak.duration;
      p.cloakBombCooldown = 0;
      for (const d of world.drones) {
        if (!d.alive) continue;
        d.hoverX = d.x;
        d.hoverY = d.y;
      }
      world.events.push({ type: "cloakUp" });
      break;
    case "flare":
      p.flares.push({ x: world.ship.x, y: world.ship.y, timer: POWERS.flare.lifetime });
      world.events.push({ type: "flareDrop", x: world.ship.x, y: world.ship.y });
      break;
    case "ion":
      p.ionTimer = POWERS.ion.chargeTime;
      world.events.push({ type: "ionCharge" });
      break;
    case "howlers":
      convertHowlers(world);
      break;
  }
}

/** Launch a ring of guided missiles that curve toward the nearest enemies. */
function fireMissileSwarm(world: World): void {
  const p = world.powers;
  const cfg = POWERS.missiles;
  // OVERCHARGE: more missiles per swarm, still capped by maxAlive so two
  // stacked pickups can't runaway the missile count.
  const amp = mutatorPowerAmpScale();
  const requested = Math.round(cfg.count * amp);
  const room = cfg.maxAlive - p.missiles.length;
  const count = Math.min(requested, Math.max(0, room));
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
    seed: Math.random() * 1000,
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
  // OVERCHARGE: a wider jump radius reaches more targets, so the chain runs
  // longer before it fizzles (see updateArcChain for the jump-side scaling).
  const amp = mutatorPowerAmpScale();
  const ship = world.ship;
  const first = nearestEnemyInRadius(
    world,
    ship.x,
    ship.y,
    cfg.initialRadius * amp,
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
    cfg.jumpRadius * mutatorPowerAmpScale(),
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

    // impact: the missile detonates a small lingering blast — area damage
    // instead of a single-target kill (the blast pass clears everything
    // caught inside, including the drone/mine that triggered it)
    let exploded = false;
    for (const d of world.drones) {
      if (!d.alive) continue;
      const dx = d.x - ms.x;
      const dy = d.y - ms.y;
      const r = cfg.radius + droneRadius(d);
      if (dx * dx + dy * dy <= r * r) {
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
          exploded = true;
          break;
        }
      }
    }
    if (exploded) {
      spawnBlast(world, ms.x, ms.y, cfg.blastRadius, {
        holdTime: cfg.blastLifetime,
        color: PALETTE.missiles,
      });
      world.events.push({ type: "missileBlast", x: ms.x, y: ms.y });
      world.shake = Math.max(world.shake, 0.12);
      p.missiles.splice(i, 1);
    }
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
        // OVERCHARGE: faster fire rate (smaller interval between rounds).
        p.autocannonCooldown = cfg.fireInterval / mutatorPowerAmpScale();
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
  // OVERCHARGE: strikes land more often (smaller interval between them).
  const amp = mutatorPowerAmpScale();
  p.meteorCooldown = cfg.interval / amp;

  // aim at a random alive drone (jittered) so strikes chase the swarm;
  // with no drones left, hammer a random on-screen point for the spectacle
  let x: number;
  let y: number;
  const alive = world.drones.filter((d) => d.alive);
  if (alive.length > 0) {
    const target = alive[Math.floor(Math.random() * alive.length)];
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    x = target.x + Math.cos(a) * r * cfg.scatter;
    y = target.y + Math.sin(a) * r * cfg.scatter;
  } else {
    x = (Math.random() - 0.5) * world.viewW * 0.8;
    y = (Math.random() - 0.5) * world.viewH * 0.8;
  }

  killDronesInRadius(world, x, y, cfg.radius);
  killMinesInRadius(world, x, y, cfg.radius);
  // the crater stays lethal for a beat — drones walking into it still die
  spawnBlast(world, x, y, cfg.radius, {
    holdTime: cfg.blastLifetime,
    color: PALETTE.meteors,
  });
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

  // OVERCHARGE: the main strike fragments into a couple of smaller craters
  // nearby (Math.random-only, same as the main strike's own targeting).
  if (amp > 1) {
    const fragments = amp >= 1.35 ? 2 : 1;
    for (let i = 0; i < fragments; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = cfg.scatter * (1 + Math.random());
      const fx = x + Math.cos(a) * r;
      const fy = y + Math.sin(a) * r;
      const fr = cfg.radius * 0.6;
      killDronesInRadius(world, fx, fy, fr);
      killMinesInRadius(world, fx, fy, fr);
      spawnBlast(world, fx, fy, fr, { holdTime: cfg.blastLifetime * 0.7, color: PALETTE.meteors });
      world.events.push({ type: "meteorStrike", x: fx, y: fy });
    }
  }
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
      world.events.push({ type: "dashGrace" });
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
      killLighthousesInRadius(world, t.x, t.y, kr);
    }
  }

  // pulse shot: charge at the ship's nose, then fire forward
  if (p.pulseTimer > 0) {
    p.pulseTimer -= dt;
    if (p.pulseTimer <= 0 && world.phase === "playing") {
      firePulse(world);
    }
  }

  // ion: charge while the cone tracks the ship, then shove along that aim
  if (p.ionTimer > 0) {
    p.ionTimer -= dt;
    if (p.ionTimer <= 0 && world.phase === "playing") {
      fireIon(world);
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

    // OVERCHARGE: a bigger pulse shot.
    const r = POWERS.pulse.projectileRadius * mutatorPowerAmpScale();
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
          world.scoreBonuses += bonus;
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
    killLighthousesInRadius(world, proj.x, proj.y, r);

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
  updateBlasts(world, dt);
  updateRazor(world, dt);
  updateCloak(world, dt);
  updateFlares(world, dt);
  updateThunderBolts(world, dt);
  updateHowlers(world, dt);

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
  killLighthousesInRadius(world, world.ship.x, world.ship.y, POWERS.shield.detonationRadius);
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

function pointToSegDist(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const seg = dx * dx + dy * dy;
  if (seg <= 1e-8) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / seg;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

function burstArcFrom(world: World, x: number, y: number): void {
  const p = world.powers;
  const amp = mutatorPowerAmpScale();
  const hitDrones = new Set<Drone>();
  const hitMines = new Set<Mine>();
  let cx = x;
  let cy = y;
  for (let hop = 0; hop < 5; hop++) {
    const next = nearestEnemyInRadius(
      world,
      cx,
      cy,
      POWERS.arc.jumpRadius * amp,
      hitDrones,
      hitMines,
    );
    if (!next) break;
    pushArcBolt(p, cx, cy, next.x, next.y);
    if (isDroneTarget(next)) {
      killDrone(world, next);
      hitDrones.add(next);
    } else {
      killMine(world, next);
      hitMines.add(next);
    }
    cx = next.x;
    cy = next.y;
    world.events.push({ type: "arcZap", x: cx, y: cy });
  }
}

function fireThunder(world: World): void {
  const s = world.ship;
  const amp = mutatorPowerAmpScale();
  const dirX = Math.cos(s.angle);
  const dirY = Math.sin(s.angle);
  const len = POWERS.thunder.length * amp;
  const x2 = s.x + dirX * len;
  const y2 = s.y + dirY * len;
  const half = (POWERS.thunder.width * amp) / 2;
  world.powers.thunderBolts.push({ x1: s.x, y1: s.y, x2, y2, elapsed: 0 });
  world.events.push({ type: "thunderFire", x: s.x, y: s.y });
  world.shake = Math.max(world.shake, 0.28);

  for (const d of world.drones) {
    if (!d.alive || d.allied) continue;
    if (pointToSegDist(d.x, d.y, s.x, s.y, x2, y2) <= half + droneRadius(d)) {
      killDrone(world, d, "thunder");
      burstArcFrom(world, d.x, d.y);
    }
  }
  killMinesInRadius(world, s.x + dirX * (len * 0.5), s.y + dirY * (len * 0.5), half + 1.2);
  killLighthousesInRadius(world, s.x + dirX * (len * 0.5), s.y + dirY * (len * 0.5), half + 1.2);
}

function fireIon(world: World): void {
  // Slam axis is ship facing at fire time, after the Pulse-style charge
  // so the pilot can steer the cone. Every shoved drone flies that axis
  // (bowling), not radially away.
  const s = world.ship;
  const fx = Math.cos(s.angle);
  const fy = Math.sin(s.angle);
  const r = POWERS.ion.radius * mutatorPowerAmpScale();
  for (const d of world.drones) {
    if (!d.alive || d.allied) continue;
    const dx = d.x - s.x;
    const dy = d.y - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist > r + droneRadius(d) || dist < 0.05) continue;
    const nx = dx / dist;
    const ny = dy / dist;
    if (nx * fx + ny * fy < POWERS.ion.coneDot) continue;
    d.slamTimer = POWERS.ion.slamDuration;
    d.slamVx = fx * POWERS.ion.slamSpeed;
    d.slamVy = fy * POWERS.ion.slamSpeed;
  }
  world.events.push({ type: "ionPulse", x: s.x, y: s.y });
  world.shake = Math.max(world.shake, 0.2);
  world.powers.waves.push({
    x: s.x + fx * 1.4,
    y: s.y + fy * 1.4,
    elapsed: 0,
    lifetime: 0.35,
    maxRadius: r * 0.55,
    color: PALETTE.ion,
  });
}

function convertHowlers(world: World): void {
  const r = POWERS.howlers.radius * mutatorPowerAmpScale();
  let n = 0;
  for (const d of world.drones) {
    if (!d.alive) continue;
    const dx = d.x - world.ship.x;
    const dy = d.y - world.ship.y;
    if (dx * dx + dy * dy <= (r + droneRadius(d)) ** 2) {
      d.allied = true;
      d.alliedTimer = POWERS.howlers.duration;
      n++;
    }
  }
  if (n > 0) world.events.push({ type: "howlersUp" });
}

function updateRazor(world: World, dt: number): void {
  const p = world.powers;
  if (p.razorTimer <= 0) return;
  p.razorTimer -= dt;
  const cfg = POWERS.razor;
  const amp = mutatorPowerAmpScale();
  const orbit = cfg.orbitRadius * amp;
  const br = cfg.bladeRadius * amp;
  for (let i = 0; i < 2; i++) {
    const a = world.time * cfg.spinRate + i * Math.PI;
    const bx = world.ship.x + Math.cos(a) * orbit;
    const by = world.ship.y + Math.sin(a) * orbit;
    for (const d of world.drones) {
      if (!d.alive || d.allied) continue;
      const dx = d.x - bx;
      const dy = d.y - by;
      if (dx * dx + dy * dy <= (br + droneRadius(d)) ** 2) killDrone(world, d);
    }
    killMinesInRadius(world, bx, by, br);
    killLighthousesInRadius(world, bx, by, br);
  }
}

function explodeCloakBombs(world: World): void {
  const p = world.powers;
  const r = POWERS.cloak.bombRadius * mutatorPowerAmpScale();
  for (const b of p.cloakBombs) {
    killDronesInRadius(world, b.x, b.y, r);
    killMinesInRadius(world, b.x, b.y, r);
    killLighthousesInRadius(world, b.x, b.y, r);
    p.waves.push({
      x: b.x,
      y: b.y,
      elapsed: 0,
      lifetime: 0.4,
      maxRadius: r * 1.4,
      color: PALETTE.cloak,
    });
  }
  p.cloakBombs.length = 0;
}

function updateCloak(world: World, dt: number): void {
  const p = world.powers;
  if (p.cloakTimer <= 0) {
    if (p.cloakBombs.length > 0) explodeCloakBombs(world);
    return;
  }
  p.cloakTimer -= dt;
  p.cloakBombCooldown -= dt;
  if (p.cloakBombCooldown <= 0) {
    p.cloakBombs.push({ x: world.ship.x, y: world.ship.y });
    p.cloakBombCooldown = POWERS.cloak.bombInterval;
  }
  if (p.cloakTimer <= 0) {
    explodeCloakBombs(world);
    world.events.push({ type: "cloakDown" });
  }
}

function updateFlares(world: World, dt: number): void {
  const p = world.powers;
  for (let i = p.flares.length - 1; i >= 0; i--) {
    p.flares[i].timer -= dt;
    if (p.flares[i].timer <= 0) p.flares.splice(i, 1);
  }
}

function updateThunderBolts(world: World, dt: number): void {
  const p = world.powers;
  for (let i = p.thunderBolts.length - 1; i >= 0; i--) {
    p.thunderBolts[i].elapsed += dt;
    if (p.thunderBolts[i].elapsed >= 0.18) p.thunderBolts.splice(i, 1);
  }
}

function updateHowlers(world: World, dt: number): void {
  const r = POWERS.howlers.explodeRadius * mutatorPowerAmpScale();
  for (const d of world.drones) {
    if (!d.alive || !d.allied) continue;
    d.alliedTimer = (d.alliedTimer ?? 0) - dt;
    if (d.alliedTimer > 0) continue;
    d.allied = false;
    d.alive = false;
    killDronesInRadius(world, d.x, d.y, r);
    world.powers.waves.push({
      x: d.x,
      y: d.y,
      elapsed: 0,
      lifetime: 0.35,
      maxRadius: r * 1.3,
      color: PALETTE.howlers,
    });
  }
}

