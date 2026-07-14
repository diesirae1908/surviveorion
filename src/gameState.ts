import { MINES, POWERS, SCORING, SHIP, type GameMode } from "./config";
import { droneRadius, initSpawner, killDrone, updateAssemblies, updateDrones, updateSpawner } from "./enemies";
import type { InputState } from "./input";
import { isMineArmed, killMine, mineRadius, updateMines } from "./mines";
import { circlesOverlap } from "./physics";
import { initPickups, updatePickups } from "./pickups";
import { createPowersState, detonateShield, updatePowers } from "./powers";
import { registerGraze, updateScoring } from "./scoring";
import { createShip, updateShip } from "./ship";
import type { World } from "./types";

export const DEATH_TO_GAMEOVER_SECONDS = 1.4;

export function createWorld(
  viewW: number,
  viewH: number,
  sandbox = false,
  grace = 0,
  gameMode: GameMode = "classic",
  daily = false,
): World {
  const world: World = {
    viewW,
    viewH,
    sandbox,
    gameMode,
    daily,
    grace: gameMode === "ironrain" ? 0 : grace, // Iron Rain never softens
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
    scoreKills: 0,
    scoreSurvival: 0,
    scoreBonuses: 0,
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
    assemblyTimer: 0, // set by initSpawner (schedule stream)
    assemblies: [],
    shake: 0,
    events: [],
  };
  if (!sandbox) {
    initSpawner(world);
    initPickups(world);
  }
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
  updateAssemblies(world, dt);
  updateMines(world, dt);
  updatePickups(world, dt);
  updatePowers(world, dt);
  updateScoring(world, dt);
  handleShipDroneCollisions(world);
  handleShipMineCollisions(world);
  handleGrazes(world);

  // sweep dead drones
  world.drones = world.drones.filter((d) => d.alive);

  world.shake = Math.max(0, world.shake - dt * 1.6);
}

function handleShipDroneCollisions(world: World): void {
  if (world.phase !== "playing") return;
  const s = world.ship;
  // the starshell rams with the whole golden bubble, not just the hull
  const shipR =
    world.powers.starshellTimer > 0 ? POWERS.starshell.killRadius : SHIP.radius;

  for (const d of world.drones) {
    if (!d.alive) continue;
    if (!circlesOverlap(s.x, s.y, shipR, d.x, d.y, droneRadius(d))) continue;

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

    // an open vortex shields the pilot: contact ram-kills the drone instead
    if (world.powers.vortices.length > 0) {
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
  const shipR =
    world.powers.starshellTimer > 0 ? POWERS.starshell.killRadius : SHIP.radius;

  for (const m of world.mines) {
    if (!m.alive || !isMineArmed(m)) continue;
    if (!circlesOverlap(s.x, s.y, shipR, m.x, m.y, mineRadius())) continue;

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

    // vortex invulnerability covers mines too: they detonate harmlessly
    if (world.powers.vortices.length > 0) {
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

/**
 * Graze pass: shaving past a live drone (inside the band beyond actual
 * contact) pays points and keeps the multiplier alive. Only counts when the
 * near-miss is genuinely risky — true invulnerability (starshell, dash,
 * open vortex) disables it, as do frozen drones (they shatter harmlessly
 * anyway). A banked shield does NOT disable grazes: contact would still cost
 * the extra life, so the near-miss is a real risk.
 */
function handleGrazes(world: World): void {
  if (world.phase !== "playing") return;
  const p = world.powers;
  if (
    p.starshellTimer > 0 ||
    p.afterburnerDash > 0 ||
    p.afterburnerGrace > 0 ||
    p.vortices.length > 0
  ) {
    return;
  }

  const s = world.ship;
  for (const d of world.drones) {
    if (!d.alive || d.frozen > 0) continue;
    if ((d.grazeTimer ?? 0) > 0) continue;
    const contact = SHIP.radius + droneRadius(d);
    const outer = contact + SCORING.grazeBand;
    const dx = d.x - s.x;
    const dy = d.y - s.y;
    const sq = dx * dx + dy * dy;
    if (sq <= outer * outer && sq > contact * contact) {
      d.grazeTimer = SCORING.grazeCooldown;
      registerGraze(world, d.x, d.y);
    }
  }
}
