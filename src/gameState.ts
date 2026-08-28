import { FLOOD_SURGE, LIGHTHOUSE, MINES, POWERS, SCORING, SHIP, STARFALL_RAIN, type GameMode } from "./config";
import { initBlackout, updateBlackout } from "./blackout";
import { updateCreatureChoreography } from "./creatures";
import { droneRadius, initSpawner, killDrone, updateAssemblies, updateDrones, updateSpawner } from "./enemies";
import type { InputState } from "./input";
import { isMineArmed, killMine, mineRadius, shatterFrozenMine, updateMines } from "./mines";
import { circlesOverlap } from "./physics";
import { initPickups, updatePickups } from "./pickups";
import { blastRadius, createPowersState, detonateShield, updatePowers } from "./powers";
import { registerGraze, updateScoring } from "./scoring";
import { createShip, updateShip } from "./ship";
import { updateStarfallRain } from "./starfall";
import {
  distToBeam,
  killLighthouse,
  lighthouseBeamWidth,
  lighthouseBodyRadius,
  updateLighthouses,
} from "./lighthouse";
import {
  mutatorGrazeBandScale,
  mutatorGrazeCooldownScale,
} from "./mutators";
import { updateFloodSurge } from "./flood";
import { grazeClearance, trackClosestCall, trackTopGrazes } from "./highlights";
import { sampleShipTrack } from "./clipSidecar";
import type { World } from "./types";

export const DEATH_TO_GAMEOVER_SECONDS = 1.4;

export function createWorld(
  viewW: number,
  viewH: number,
  sandbox = false,
  grace = 0,
  gameMode: GameMode = "classic",
  daily = false,
  training = false,
): World {
  const world: World = {
    viewW,
    viewH,
    sandbox,
    training,
    gameMode,
    daily,
    grace: gameMode === "ironrain" ? 0 : grace, // Iron Rain never softens
    phase: "playing",
    time: 0,
    deathTimer: 0,
    ship: createShip(),
    drones: [],
    mines: [],
    lighthouses: [],
    lighthouseTimer: LIGHTHOUSE.firstAt,
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
    lateAmbientAccumulator: 0,
    formationTimer: 0,
    nextFormationDelay: 0,
    sustainedSpawnCooldown: 0,
    pickupTimer: 0,
    powerSpawnCounts: {},
    mineTimer: MINES.intervalRange[0],
    // STARFALL only (see starfall.ts); harmless on every other day, the
    // timer is never consumed unless the mutator is active.
    meteorRainTimer: STARFALL_RAIN.intervalStart,
    meteorTelegraphs: [],
    floodSurgeTimer: FLOOD_SURGE.openingDelay,
    floodTelegraphs: [],
    blackoutPhase: "idle",
    blackoutTimer: 0,
    blackoutNextGap: 0,
    blackoutHadReal: false,
    assemblyTimer: 0, // set by initSpawner (schedule stream)
    crowdAssemblyTimer: 0,
    assemblies: [],
    // Round 5 creature days only (see creatures.ts); harmless everywhere else.
    creatureTimer: 0,
    creatureSpawnQueue: [],
    creatureLastKind: null,
    shake: 0,
    events: [],
    closestCall: null,
    topGrazes: [],
    shipTrack: [],
    clipArena: { w: viewW, h: viewH },
    clipView: { w: 0, h: 0 },
  };
  sampleShipTrack(world.shipTrack, world.time, world.ship.x, world.ship.y);
  if (!sandbox) {
    initSpawner(world);
    initPickups(world);
    initBlackout(world);
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
  updateCreatureChoreography(world, dt);
  updateMines(world, dt);
  updateLighthouses(world, dt);
  updateStarfallRain(world, dt);
  updateFloodSurge(world, dt);
  updateBlackout(world, dt);
  updatePickups(world, dt);
  updatePowers(world, dt);
  updateScoring(world, dt);
  handleShipDroneCollisions(world);
  handleShipMineCollisions(world);
  handleShipLighthouseCollisions(world);
  handleSlamCollisions(world);
  handleHowlerRams(world);
  handleShipBlastCollisions(world);
  handleGrazes(world);
  if (world.phase === "playing") {
    sampleShipTrack(world.shipTrack, world.time, world.ship.x, world.ship.y);
  }

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
    if (!d.alive || d.allied) continue;
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
    if (!m.alive) continue;
    if (!circlesOverlap(s.x, s.y, shipR, m.x, m.y, mineRadius())) continue;

    // frozen mines shatter on contact, same as frozen drones (no boom)
    if (m.frozen > 0) {
      shatterFrozenMine(world, m);
      continue;
    }

    if (!isMineArmed(m)) continue;

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

function handleShipLighthouseCollisions(world: World): void {
  if (world.phase !== "playing") return;
  const s = world.ship;
  const invuln =
    world.powers.starshellTimer > 0 ||
    world.powers.afterburnerDash > 0 ||
    world.powers.afterburnerGrace > 0 ||
    world.powers.vortices.length > 0;
  const shipR =
    world.powers.starshellTimer > 0 ? POWERS.starshell.killRadius : SHIP.radius;

  for (const lh of world.lighthouses) {
    if (!lh.alive) continue;
    const bodyHit = circlesOverlap(s.x, s.y, shipR, lh.x, lh.y, lighthouseBodyRadius());
    const beamHit = distToBeam(lh, s.x, s.y) <= lighthouseBeamWidth(lh) / 2 + SHIP.radius;
    if (!bodyHit && !beamHit) continue;
    if (invuln || world.powers.shieldActive) {
      killLighthouse(world, lh);
      if (world.powers.shieldActive && !invuln) detonateShield(world);
      continue;
    }
    const dx = s.x - lh.x;
    const dy = s.y - lh.y;
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

function handleSlamCollisions(world: World): void {
  if (world.phase !== "playing") return;
  const slammed = world.drones.filter((d) => d.alive && (d.slamTimer ?? 0) > 0);
  if (slammed.length === 0) return;
  for (const s of slammed) {
    const sr = droneRadius(s);
    for (const t of world.drones) {
      if (!t.alive || t === s || t.allied || (t.slamTimer ?? 0) > 0) continue;
      if (circlesOverlap(s.x, s.y, sr, t.x, t.y, droneRadius(t))) killDrone(world, t);
    }
  }
}

function handleHowlerRams(world: World): void {
  if (world.phase !== "playing") return;
  const pack = world.drones.filter((d) => d.alive && d.allied);
  if (pack.length === 0) return;
  for (const a of pack) {
    const ar = droneRadius(a);
    for (const t of world.drones) {
      if (!t.alive || t.allied) continue;
      if (circlesOverlap(a.x, a.y, ar, t.x, t.y, droneRadius(t))) killDrone(world, t);
    }
  }
}

/**
 * STARFALL only: a meteor crater flagged `lethalToShip` costs the run same
 * as a drone hit, unless a banked shield absorbs it. Every other blast
 * source (Shockwave, Missiles, the Meteor Storm power, mine explosions)
 * never sets that flag, so this is a no-op on every other day and mode.
 */
function handleShipBlastCollisions(world: World): void {
  if (world.phase !== "playing") return;
  const s = world.ship;
  const shipR =
    world.powers.starshellTimer > 0 ? POWERS.starshell.killRadius : SHIP.radius;

  for (const b of world.powers.blasts) {
    if (!b.lethalToShip) continue;
    const r = blastRadius(b);
    if (r <= 0) continue;
    if (!circlesOverlap(s.x, s.y, shipR, b.x, b.y, r)) continue;

    // same escape hatches as a drone hit: the shell/dash/vortex ride it out
    // untouched (there's nothing to ram-kill, so just skip the crater).
    if (world.powers.starshellTimer > 0) continue;
    if (world.powers.afterburnerDash > 0 || world.powers.afterburnerGrace > 0) continue;
    if (world.powers.vortices.length > 0) continue;

    if (world.powers.shieldActive) {
      detonateShield(world);
      continue;
    }

    const dx = s.x - b.x;
    const dy = s.y - b.y;
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
    if (!d.alive || d.frozen > 0 || d.allied) continue;
    if ((d.grazeTimer ?? 0) > 0) continue;
    const band = SCORING.grazeBand * mutatorGrazeBandScale();
    const contact = SHIP.radius + droneRadius(d);
    const outer = contact + band;
    const dx = d.x - s.x;
    const dy = d.y - s.y;
    const sq = dx * dx + dy * dy;
    if (sq <= outer * outer && sq > contact * contact) {
      d.grazeTimer = SCORING.grazeCooldown * mutatorGrazeCooldownScale();
      registerGraze(world, d.x, d.y);
      const clearance = grazeClearance(Math.sqrt(sq), contact, band);
      const candidate = {
        time: world.time,
        x: d.x,
        y: d.y,
        clearance,
      };
      world.closestCall = trackClosestCall(world.closestCall, candidate);
      world.topGrazes = trackTopGrazes(world.topGrazes, candidate);
    }
  }
}
