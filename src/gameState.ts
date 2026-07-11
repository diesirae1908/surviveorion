import { MINES, SHIP } from "./config";
import { droneRadius, initSpawner, killDrone, updateDrones, updateSpawner } from "./enemies";
import type { InputState } from "./input";
import { isMineArmed, killMine, mineRadius, updateMines } from "./mines";
import { circlesOverlap } from "./physics";
import { initPickups, updatePickups } from "./pickups";
import { createPowersState, detonateShield, updatePowers } from "./powers";
import { updateScoring } from "./scoring";
import { createShip, updateShip } from "./ship";
import type { World } from "./types";

const DEATH_TO_GAMEOVER_SECONDS = 1.4;

export function createWorld(viewW: number, viewH: number): World {
  const world: World = {
    viewW,
    viewH,
    phase: "playing",
    time: 0,
    deathTimer: 0,
    ship: createShip(),
    drones: [],
    mines: [],
    pickups: [],
    spawnTelegraphs: [],
    powers: createPowersState(),
    score: 0,
    multiplier: 1,
    multiplierDecayTimer: 0,
    kills: 0,
    maxMultiplier: 1,
    chainCount: 0,
    chainTimer: 0,
    spawnAccumulator: 0,
    formationTimer: 0,
    nextFormationDelay: 0,
    sustainedSpawnCooldown: 0,
    pickupTimer: 0,
    powerSpawnCounts: {},
    mineTimer: MINES.intervalRange[0],
    shake: 0,
    events: [],
  };
  initSpawner(world);
  initPickups(world);
  return world;
}

export function resizeWorld(world: World, viewW: number, viewH: number): void {
  world.viewW = viewW;
  world.viewH = viewH;
}

/** One fixed-timestep simulation step. */
export function tick(world: World, input: InputState, dt: number): void {
  if (world.phase === "playing") {
    updateShip(world, input, dt);
  } else {
    world.deathTimer += dt;
    if (world.phase === "dying" && world.deathTimer >= DEATH_TO_GAMEOVER_SECONDS) {
      world.phase = "dead";
    }
  }

  updateSpawner(world, dt);
  updateDrones(world, dt);
  updateMines(world, dt);
  updatePickups(world, dt);
  updatePowers(world, dt);
  updateScoring(world, dt);
  handleShipDroneCollisions(world);
  handleShipMineCollisions(world);

  // sweep dead drones
  world.drones = world.drones.filter((d) => d.alive);

  world.shake = Math.max(0, world.shake - dt * 1.6);
}

function handleShipDroneCollisions(world: World): void {
  if (world.phase !== "playing") return;
  const s = world.ship;

  for (const d of world.drones) {
    if (!d.alive) continue;
    if (!circlesOverlap(s.x, s.y, SHIP.radius, d.x, d.y, droneRadius(d))) continue;

    // starshell: invulnerable ram-kill shell — everything you touch dies
    if (world.powers.starshellTimer > 0) {
      killDrone(world, d);
      continue;
    }

    // dashing through drones kills them; the arrival grace window extends
    // that protection so landing inside a swarm isn't an instant death
    if (world.powers.afterburnerDash > 0 || world.powers.afterburnerGrace > 0) {
      killDrone(world, d);
      continue;
    }

    // frozen drones shatter harmlessly on contact
    if (d.frozen > 0) {
      killDrone(world, d);
      continue;
    }

    if (world.powers.shieldActive) {
      killDrone(world, d);
      detonateShield(world);
      continue;
    }

    // death: knockback impulse away from the drone, then explosion state
    const dx = s.x - d.x;
    const dy = s.y - d.y;
    const dist = Math.hypot(dx, dy) || 1;
    s.vx += (dx / dist) * SHIP.deathKnockback;
    s.vy += (dy / dist) * SHIP.deathKnockback;
    world.phase = "dying";
    world.deathTimer = 0;
    world.shake = Math.max(world.shake, 0.7);
    world.events.push({ type: "death", x: s.x, y: s.y });
    return;
  }
}

function handleShipMineCollisions(world: World): void {
  if (world.phase !== "playing") return;
  const s = world.ship;

  for (const m of world.mines) {
    if (!m.alive || !isMineArmed(m)) continue;
    if (!circlesOverlap(s.x, s.y, SHIP.radius, m.x, m.y, mineRadius())) continue;

    // starshell rams mines safely too: they detonate against the shell
    if (world.powers.starshellTimer > 0) {
      killMine(world, m);
      continue;
    }

    // dashing through a mine detonates it safely, arrival grace included
    if (world.powers.afterburnerDash > 0 || world.powers.afterburnerGrace > 0) {
      killMine(world, m);
      continue;
    }

    if (world.powers.shieldActive) {
      killMine(world, m);
      detonateShield(world);
      continue;
    }

    const dx = s.x - m.x;
    const dy = s.y - m.y;
    const dist = Math.hypot(dx, dy) || 1;
    s.vx += (dx / dist) * SHIP.deathKnockback;
    s.vy += (dy / dist) * SHIP.deathKnockback;
    world.phase = "dying"; // set before killMine so no points are credited
    killMine(world, m); // it blows up with you
    world.deathTimer = 0;
    world.shake = Math.max(world.shake, 0.7);
    world.events.push({ type: "death", x: s.x, y: s.y });
    return;
  }
}
