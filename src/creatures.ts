// Round 5 Daily Mutator: creature-day choreography. On the four forced-
// creature days (Hunting Party, Lancer Doctrine, Wheelhouse, Demolition Day)
// assemblies stop being conscripted from the ambient swarm and become the
// spawn pattern itself. This module schedules those scripted events and
// queues them behind a short readable telegraph before they materialize
// fully formed via enemies.ts spawnAssemblyDirect.
//
// Determinism, same discipline as starfall.ts: event cadence + member counts
// ride the seeded SCHEDULE stream (scheduleRand), anchor positions/headings
// ride the seeded PLACEMENT stream (rand). A fixed, day-independent number
// of draws happens for a given point in the run (pack/salvo/lane size is a
// pure function of elapsed minutes, never of field state), so every pilot on
// today's seed gets the identical script no matter how they fly. Movement,
// wall-bounce, and burst/disband logic is entirely reused from
// updateAssemblies in enemies.ts: this module only decides WHEN/WHERE
// members appear.
//
// Fully gated behind mutatorForceAssemblyKind() (non-null only on the four
// creature days): every other day and mode never calls into this file.

import { CREATURE_DAYS, SPAWNER } from "./config";
import { difficultyMinutes, spawnAssemblyDirect } from "./enemies";
import { clamp01, lerp, randRange, scheduleRand, scheduleRange } from "./math";
import { mutatorForceAssemblyKind } from "./mutators";
import type { AssemblyKind, CreatureSpawn, World } from "./types";

const EDGE_COUNT = 4;

interface EdgeGeometry {
  x: number;
  y: number;
  dirX: number; // inward heading (unit vector)
  dirY: number;
  span: number; // length of this edge, for lateral placement
  axisX: boolean; // true = lateral offset is along x (top/bottom edges)
}

/** left=0, right=1, bottom=2, top=3: a point just outside the view edge, heading inward. */
function edgeGeometry(world: World, edge: number): EdgeGeometry {
  const margin = SPAWNER.edgeMargin + 0.5;
  const hw = world.viewW / 2 + margin;
  const hh = world.viewH / 2 + margin;
  switch (((edge % EDGE_COUNT) + EDGE_COUNT) % EDGE_COUNT) {
    case 0:
      return { x: -hw, y: 0, dirX: 1, dirY: 0, span: world.viewH, axisX: false };
    case 1:
      return { x: hw, y: 0, dirX: -1, dirY: 0, span: world.viewH, axisX: false };
    case 2:
      return { x: 0, y: -hh, dirX: 0, dirY: 1, span: world.viewW, axisX: true };
    default:
      return { x: 0, y: hh, dirX: 0, dirY: -1, span: world.viewW, axisX: true };
  }
}

function edgeAnchor(geo: EdgeGeometry, lateral: number): { x: number; y: number } {
  return geo.axisX ? { x: geo.x + lateral, y: geo.y } : { x: geo.x, y: geo.y + lateral };
}

function jitterHeading(dirX: number, dirY: number, angle: number): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: dirX * cos - dirY * sin, y: dirX * sin + dirY * cos };
}

/** [min,max] interval lerped from an "early" feel to a "late" feel over CREATURE_DAYS.rampMinutes. */
function rampedInterval(
  minutes: number,
  early: readonly [number, number],
  late: readonly [number, number],
): [number, number] {
  const t = clamp01(minutes / CREATURE_DAYS.rampMinutes);
  return [lerp(early[0], late[0], t), lerp(early[1], late[1], t)];
}

/** Integer count ramped purely from elapsed run time (never field state). */
function rampedCount(minutes: number, range: readonly [number, number]): number {
  const t = clamp01(minutes / CREATURE_DAYS.rampMinutes);
  return Math.round(lerp(range[0], range[1], t));
}

function queueSpawn(
  world: World,
  kind: AssemblyKind,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  count: number,
  duration: number,
  extraDelay: number,
): void {
  const spawn: CreatureSpawn = { kind, timer: duration + extraDelay, duration, x, y, dirX, dirY, count };
  world.creatureSpawnQueue.push(spawn);
}

/** HUNTING PARTY: waves of 2-4 hunter vees entering from different edges, converging. */
function scheduleHunterWave(world: World, minutes: number): void {
  const cfg = CREATURE_DAYS.hunter;
  const [minI, maxI] = rampedInterval(minutes, cfg.waveIntervalEarly, cfg.waveIntervalLate);
  world.creatureTimer = scheduleRange(minI, maxI);

  const packSize = rampedCount(minutes, cfg.packSizeRange);
  const startEdge = Math.floor(scheduleRand() * EDGE_COUNT);
  const warning = CREATURE_DAYS.telegraph.entryWarning;
  for (let i = 0; i < packSize; i++) {
    const geo = edgeGeometry(world, startEdge + i);
    const lateral = randRange(-geo.span * 0.35, geo.span * 0.35);
    const anchor = edgeAnchor(geo, lateral);
    const heading = jitterHeading(geo.dirX, geo.dirY, randRange(-0.35, 0.35));
    const count = Math.round(scheduleRange(...cfg.veeMemberRange));
    queueSpawn(world, "hunter", anchor.x, anchor.y, heading.x, heading.y, count, warning, i * cfg.veeStagger);
  }
}

/** LANCER DOCTRINE: salvos of 2-5 parallel lance bars sweeping from one edge. */
function scheduleLanceSalvo(world: World, minutes: number): void {
  const cfg = CREATURE_DAYS.lance;
  const [minI, maxI] = rampedInterval(minutes, cfg.salvoIntervalEarly, cfg.salvoIntervalLate);
  world.creatureTimer = scheduleRange(minI, maxI);

  const salvoSize = rampedCount(minutes, cfg.salvoSizeRange);
  const edge = Math.floor(scheduleRand() * EDGE_COUNT);
  const geo = edgeGeometry(world, edge);
  const warning = CREATURE_DAYS.telegraph.entryWarning;
  for (let i = 0; i < salvoSize; i++) {
    const lateral = randRange(-geo.span * 0.4, geo.span * 0.4);
    const anchor = edgeAnchor(geo, lateral);
    const heading = jitterHeading(geo.dirX, geo.dirY, randRange(-0.12, 0.12));
    const count = Math.round(scheduleRange(...cfg.barMemberRange));
    queueSpawn(world, "lance", anchor.x, anchor.y, heading.x, heading.y, count, warning, i * cfg.barStagger);
  }
}

/** WHEELHOUSE: wheels rolling through in lanes from alternating sides. */
function scheduleWheelLanes(world: World, minutes: number): void {
  const cfg = CREATURE_DAYS.wheel;
  const [minI, maxI] = rampedInterval(minutes, cfg.laneIntervalEarly, cfg.laneIntervalLate);
  world.creatureTimer = scheduleRange(minI, maxI);

  const laneCount = rampedCount(minutes, cfg.laneCountRange);
  // one axis pair per burst (left/right or bottom/top) so lanes read as
  // consistent crossing traffic rather than a random scatter of directions
  const axisPair = Math.floor(scheduleRand() * 2) * 2;
  const warning = CREATURE_DAYS.telegraph.entryWarning;
  for (let i = 0; i < laneCount; i++) {
    const geo = edgeGeometry(world, axisPair + (i % 2));
    const lateral = randRange(-geo.span * 0.4, geo.span * 0.4);
    const anchor = edgeAnchor(geo, lateral);
    const count = Math.round(scheduleRange(...cfg.wheelMemberRange));
    // no heading jitter: a clean lane crossing reads best straight across
    queueSpawn(world, "wheel", anchor.x, anchor.y, geo.dirX, geo.dirY, count, warning, i * cfg.laneStagger);
  }
}

/** DEMOLITION DAY: continuous scripted bomb deployments that materialize with a warning strobe. */
function scheduleBombDeployment(world: World, minutes: number): void {
  const cfg = CREATURE_DAYS.bomb;
  const [minI, maxI] = rampedInterval(minutes, cfg.deploymentIntervalEarly, cfg.deploymentIntervalLate);
  world.creatureTimer = scheduleRange(minI, maxI);

  const hw = world.viewW / 2 - 1.5;
  const hh = world.viewH / 2 - 1.5;
  const x = randRange(-hw, hw);
  const y = randRange(-hh, hh);
  const angle = randRange(0, Math.PI * 2);
  const count = Math.round(scheduleRange(...cfg.memberRange));
  // no crowd left to "lean on" (no conscription anymore), so a slow seeded
  // drift stands in for the old crowd-lean heading
  queueSpawn(
    world,
    "bomb",
    x,
    y,
    Math.cos(angle) * 0.15,
    Math.sin(angle) * 0.15,
    count,
    CREATURE_DAYS.telegraph.materializeWarning,
    0,
  );
}

/**
 * Creature-day choreography tick: drains the spawn queue (materializing any
 * item whose telegraph has expired) and, on cooldown, schedules the next
 * wave/salvo/lane-burst/deployment for whichever creature day is active.
 * No-op on every other day (mutatorForceAssemblyKind() is null).
 */
export function updateCreatureChoreography(world: World, dt: number): void {
  const kind = mutatorForceAssemblyKind();
  if (kind === null) return;
  if (world.phase !== "playing" || world.sandbox || world.training) return;

  for (let i = world.creatureSpawnQueue.length - 1; i >= 0; i--) {
    const q = world.creatureSpawnQueue[i];
    q.timer -= dt;
    if (q.timer <= 0) {
      world.creatureSpawnQueue.splice(i, 1);
      spawnAssemblyDirect(world, difficultyMinutes(world), q.kind, q.count, q.x, q.y, q.dirX, q.dirY);
    }
  }

  world.creatureTimer -= dt;
  if (world.creatureTimer > 0) return;

  const minutes = difficultyMinutes(world);
  switch (kind) {
    case "hunter":
      scheduleHunterWave(world, minutes);
      break;
    case "lance":
      scheduleLanceSalvo(world, minutes);
      break;
    case "wheel":
      scheduleWheelLanes(world, minutes);
      break;
    case "bomb":
      scheduleBombDeployment(world, minutes);
      break;
  }
}
