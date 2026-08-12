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

import { CREATURE_DAYS, SPAWNER, type CreatureLateGrowth } from "./config";
import { difficultyMinutes, spawnAssemblyDirect } from "./enemies";
import { clamp01, lerp, randRange, scheduleRand, scheduleRange } from "./math";
import { mutatorForceAssemblyKind, mutatorMenagerieActive } from "./mutators";
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

// --- shared escalation math (opening beat + fast mid ramp + endless late leg) ---
//
// Every creature day uses these five helpers, so the escalation SHAPE is the
// same everywhere and only the per-day numbers differ (CREATURE_DAYS.*.late,
// see config.ts CreatureLateGrowth). All are pure functions of elapsed run
// minutes: a given point in the run consumes the same number of seeded draws
// for every pilot, so the shared daily script is unaffected.

/**
 * Early-ramp progress, 0 at the end of the opening beat to 1 at rampMinutes.
 * Flat through CREATURE_DAYS.openingMinutes (the readable opening), then
 * concave (rampCurve < 1) so the climb is steepest right after it. The
 * 2026-08-12 mid-ramp densify, see the comment on CREATURE_DAYS.
 */
function rampProgress(minutes: number): number {
  const span = Math.max(0.01, CREATURE_DAYS.rampMinutes - CREATURE_DAYS.openingMinutes);
  return Math.pow(clamp01((minutes - CREATURE_DAYS.openingMinutes) / span), CREATURE_DAYS.rampCurve);
}

/** Run minutes past the late-growth anchor (0 before it). */
function lateMinutes(minutes: number): number {
  return Math.max(0, minutes - CREATURE_DAYS.lateStartMinutes);
}

/**
 * [min,max] interval taken from an "early" feel to a "late" feel over the
 * mid ramp, then tightened forever past lateStartMinutes (hyperbolic, so the
 * first late minutes bite hardest), bottoming out at intervalFloorScale of
 * the late range.
 */
function escalateInterval(
  minutes: number,
  early: readonly [number, number],
  late: readonly [number, number],
  growth: CreatureLateGrowth,
): [number, number] {
  const t = rampProgress(minutes);
  const lateScale = Math.max(
    growth.intervalFloorScale,
    1 / (1 + growth.intervalTighten * lateMinutes(minutes)),
  );
  return [lerp(early[0], late[0], t) * lateScale, lerp(early[1], late[1], t) * lateScale];
}

/**
 * Structures per event (hunter vees / lance bars / wheel lanes / bomb slabs /
 * menagerie animals): ramps over the mid ramp, then keeps growing linearly
 * up to growth.groupMax.
 */
function escalateCount(
  minutes: number,
  range: readonly [number, number],
  growth: CreatureLateGrowth,
): number {
  const t = rampProgress(minutes);
  const grown = lerp(range[0], range[1], t) + growth.groupPerMinute * lateMinutes(minutes);
  return Math.max(1, Math.round(Math.min(growth.groupMax, grown)));
}

/** Extra member drones per structure late in the run (added to the seeded roll). */
function lateMemberBonus(minutes: number, growth: CreatureLateGrowth): number {
  return Math.min(growth.memberMax, growth.memberPerMinute * lateMinutes(minutes));
}

/**
 * Travel-speed multiplier for creatures spawned this late in the run. The
 * drone baseline speed ramp is deliberately near-flat (see SPAWNER.speedMultiplier),
 * so without this a creature day's pace never changes at all.
 */
function lateSpeedScale(minutes: number, growth: CreatureLateGrowth): number {
  return Math.min(growth.speedMax, 1 + growth.speedPerMinute * lateMinutes(minutes));
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
  speedScale: number,
): void {
  const spawn: CreatureSpawn = {
    kind,
    timer: duration + extraDelay,
    duration,
    x,
    y,
    dirX,
    dirY,
    count,
    speedScale,
  };
  world.creatureSpawnQueue.push(spawn);
}

/** HUNTING PARTY: waves of 2-4 hunter vees entering from different edges, converging. */
function scheduleHunterWave(world: World, minutes: number): void {
  const cfg = CREATURE_DAYS.hunter;
  const [minI, maxI] = escalateInterval(minutes, cfg.waveIntervalEarly, cfg.waveIntervalLate, cfg.late);
  world.creatureTimer = scheduleRange(minI, maxI);

  const packSize = escalateCount(minutes, cfg.packSizeRange, cfg.late);
  const memberBonus = lateMemberBonus(minutes, cfg.late);
  const speedScale = lateSpeedScale(minutes, cfg.late);
  const startEdge = Math.floor(scheduleRand() * EDGE_COUNT);
  const warning = CREATURE_DAYS.telegraph.entryWarning;
  for (let i = 0; i < packSize; i++) {
    const geo = edgeGeometry(world, startEdge + i);
    const lateral = randRange(-geo.span * 0.35, geo.span * 0.35);
    const anchor = edgeAnchor(geo, lateral);
    const heading = jitterHeading(geo.dirX, geo.dirY, randRange(-0.35, 0.35));
    const count = Math.round(scheduleRange(...cfg.veeMemberRange) + memberBonus);
    queueSpawn(
      world,
      "hunter",
      anchor.x,
      anchor.y,
      heading.x,
      heading.y,
      count,
      warning,
      i * cfg.veeStagger,
      speedScale,
    );
  }
}

/** LANCER DOCTRINE: salvos of 2-5 parallel lance bars sweeping from one edge. */
function scheduleLanceSalvo(world: World, minutes: number): void {
  const cfg = CREATURE_DAYS.lance;
  const [minI, maxI] = escalateInterval(minutes, cfg.salvoIntervalEarly, cfg.salvoIntervalLate, cfg.late);
  world.creatureTimer = scheduleRange(minI, maxI);

  const salvoSize = escalateCount(minutes, cfg.salvoSizeRange, cfg.late);
  const memberBonus = lateMemberBonus(minutes, cfg.late);
  const speedScale = lateSpeedScale(minutes, cfg.late);
  const edge = Math.floor(scheduleRand() * EDGE_COUNT);
  const geo = edgeGeometry(world, edge);
  const warning = CREATURE_DAYS.telegraph.entryWarning;
  for (let i = 0; i < salvoSize; i++) {
    const lateral = randRange(-geo.span * 0.4, geo.span * 0.4);
    const anchor = edgeAnchor(geo, lateral);
    const heading = jitterHeading(geo.dirX, geo.dirY, randRange(-0.12, 0.12));
    const count = Math.round(scheduleRange(...cfg.barMemberRange) + memberBonus);
    queueSpawn(
      world,
      "lance",
      anchor.x,
      anchor.y,
      heading.x,
      heading.y,
      count,
      warning,
      i * cfg.barStagger,
      speedScale,
    );
  }
}

/** WHEELHOUSE: wheels rolling through in lanes from alternating sides. */
function scheduleWheelLanes(world: World, minutes: number): void {
  const cfg = CREATURE_DAYS.wheel;
  const [minI, maxI] = escalateInterval(minutes, cfg.laneIntervalEarly, cfg.laneIntervalLate, cfg.late);
  world.creatureTimer = scheduleRange(minI, maxI);

  const laneCount = escalateCount(minutes, cfg.laneCountRange, cfg.late);
  const memberBonus = lateMemberBonus(minutes, cfg.late);
  const speedScale = lateSpeedScale(minutes, cfg.late);
  // one axis pair per burst (left/right or bottom/top) so lanes read as
  // consistent crossing traffic rather than a random scatter of directions
  const axisPair = Math.floor(scheduleRand() * 2) * 2;
  const warning = CREATURE_DAYS.telegraph.entryWarning;
  for (let i = 0; i < laneCount; i++) {
    const geo = edgeGeometry(world, axisPair + (i % 2));
    const lateral = randRange(-geo.span * 0.4, geo.span * 0.4);
    const anchor = edgeAnchor(geo, lateral);
    const count = Math.round(scheduleRange(...cfg.wheelMemberRange) + memberBonus);
    // no heading jitter: a clean lane crossing reads best straight across
    queueSpawn(
      world,
      "wheel",
      anchor.x,
      anchor.y,
      geo.dirX,
      geo.dirY,
      count,
      warning,
      i * cfg.laneStagger,
      speedScale,
    );
  }
}

/** DEMOLITION DAY: continuous scripted bomb deployments that materialize with a warning strobe. */
function scheduleBombDeployment(world: World, minutes: number): void {
  const cfg = CREATURE_DAYS.bomb;
  const [minI, maxI] = escalateInterval(
    minutes,
    cfg.deploymentIntervalEarly,
    cfg.deploymentIntervalLate,
    cfg.late,
  );
  world.creatureTimer = scheduleRange(minI, maxI);

  const slabCount = escalateCount(minutes, cfg.deploymentCountRange, cfg.late);
  const memberBonus = lateMemberBonus(minutes, cfg.late);
  const hw = world.viewW / 2 - 1.5;
  const hh = world.viewH / 2 - 1.5;
  for (let i = 0; i < slabCount; i++) {
    const x = randRange(-hw, hw);
    const y = randRange(-hh, hh);
    const angle = randRange(0, Math.PI * 2);
    const count = Math.round(scheduleRange(...cfg.memberRange) + memberBonus);
    // no crowd left to "lean on" (no conscription anymore), so a slow seeded
    // drift stands in for the old crowd-lean heading. Slabs within one
    // deployment are staggered so their fuses don't all pop on the same
    // frame: a deployment should deny space in waves, not flash-fry the arena.
    queueSpawn(
      world,
      "bomb",
      x,
      y,
      Math.cos(angle) * 0.15,
      Math.sin(angle) * 0.15,
      count,
      CREATURE_DAYS.telegraph.materializeWarning,
      i * cfg.slabStagger,
      1,
    );
  }
}

/** MENAGERIE: the four kinds in seeded draw order (stable indices, used by
 * drawMenagerieKind's consecutive-repeat guard below). */
const MENAGERIE_KINDS: AssemblyKind[] = ["hunter", "lance", "wheel", "bomb"];

/**
 * Draws a kind from the seeded schedule stream. If it would repeat `avoid`,
 * steps forward once (no extra draw), the same trick pickFirst (mutators.ts)
 * uses to dodge repeats: exactly one scheduleRand() call either way, so this
 * stays a fixed-draw, shared-script operation.
 */
function drawMenagerieKind(avoid: AssemblyKind | null): AssemblyKind {
  const idx = Math.floor(scheduleRand() * MENAGERIE_KINDS.length);
  const avoidIdx = avoid === null ? -1 : MENAGERIE_KINDS.indexOf(avoid);
  const finalIdx = idx === avoidIdx ? (idx + 1) % MENAGERIE_KINDS.length : idx;
  return MENAGERIE_KINDS[finalIdx];
}

/** Each kind's own telegraph length (bomb's materialize-strobe is longer
 * than the other three's entry-flash, see CREATURE_DAYS.telegraph). */
function telegraphFor(kind: AssemblyKind): number {
  return kind === "bomb" ? CREATURE_DAYS.telegraph.materializeWarning : CREATURE_DAYS.telegraph.entryWarning;
}

/**
 * Spawns ONE instance of `kind` (not a whole wave/salvo like the single-kind
 * days), reusing that kind's own edge geometry, member-count range, and
 * telegraph from CREATURE_DAYS. One event = one creature fusing in; that's
 * what makes MENAGERIE read as variety rather than a shrunken wave.
 * `extraDelay` lets a double event force strict materialization order (see
 * scheduleMenagerieEvent) regardless of the two kinds' own telegraph lengths.
 */
function spawnMenagerieKind(
  world: World,
  kind: AssemblyKind,
  extraDelay: number,
  memberBonus: number,
  speedScale: number,
): void {
  const warning = telegraphFor(kind);
  switch (kind) {
    case "hunter": {
      const cfg = CREATURE_DAYS.hunter;
      const geo = edgeGeometry(world, Math.floor(scheduleRand() * EDGE_COUNT));
      const anchor = edgeAnchor(geo, randRange(-geo.span * 0.35, geo.span * 0.35));
      const heading = jitterHeading(geo.dirX, geo.dirY, randRange(-0.35, 0.35));
      const count = Math.round(scheduleRange(...cfg.veeMemberRange) + memberBonus);
      queueSpawn(world, "hunter", anchor.x, anchor.y, heading.x, heading.y, count, warning, extraDelay, speedScale);
      return;
    }
    case "lance": {
      const cfg = CREATURE_DAYS.lance;
      const geo = edgeGeometry(world, Math.floor(scheduleRand() * EDGE_COUNT));
      const anchor = edgeAnchor(geo, randRange(-geo.span * 0.4, geo.span * 0.4));
      const heading = jitterHeading(geo.dirX, geo.dirY, randRange(-0.12, 0.12));
      const count = Math.round(scheduleRange(...cfg.barMemberRange) + memberBonus);
      queueSpawn(world, "lance", anchor.x, anchor.y, heading.x, heading.y, count, warning, extraDelay, speedScale);
      return;
    }
    case "wheel": {
      const cfg = CREATURE_DAYS.wheel;
      const geo = edgeGeometry(world, Math.floor(scheduleRand() * EDGE_COUNT));
      const anchor = edgeAnchor(geo, randRange(-geo.span * 0.4, geo.span * 0.4));
      const count = Math.round(scheduleRange(...cfg.wheelMemberRange) + memberBonus);
      // no heading jitter: a clean lane crossing reads best straight across
      queueSpawn(world, "wheel", anchor.x, anchor.y, geo.dirX, geo.dirY, count, warning, extraDelay, speedScale);
      return;
    }
    case "bomb": {
      const cfg = CREATURE_DAYS.bomb;
      const hw = world.viewW / 2 - 1.5;
      const hh = world.viewH / 2 - 1.5;
      const x = randRange(-hw, hw);
      const y = randRange(-hh, hh);
      const angle = randRange(0, Math.PI * 2);
      const count = Math.round(scheduleRange(...cfg.memberRange) + memberBonus);
      queueSpawn(
        world,
        "bomb",
        x,
        y,
        Math.cos(angle) * 0.15,
        Math.sin(angle) * 0.15,
        count,
        warning,
        extraDelay,
        // a bomb's drift is its identity; late growth gives it more shrapnel,
        // not more pace (matches DEMOLITION DAY's own late block)
        1,
      );
      return;
    }
  }
}

/**
 * MENAGERIE: draws one kind per event from the seeded schedule stream
 * across all four kinds (consecutive-repeat avoidance so the variety
 * actually reads), doubling into two different kinds at once more and more
 * often as the run escalates, and, deep into the run, stacking a third and
 * fourth animal per event (CREATURE_DAYS.menagerie.late.groupPerMinute).
 * Cadence sits between the four single-kind days' own pacing (see
 * CREATURE_DAYS.menagerie), it doesn't match any one of them.
 *
 * Every animal after the first materializes strictly after the one before it
 * (extraDelay below), no matter which kinds are drawn: telegraphFor varies
 * per kind (bomb is longer), so without this a short-telegraph animal could
 * pop in before its predecessor and land next to whatever kind ended the
 * PREVIOUS event instead, silently defeating the repeat guard on the visible
 * script. Forcing the order keeps "visible order == draw order", so avoiding
 * only the immediately preceding kind is enough.
 */
function scheduleMenagerieEvent(world: World, minutes: number): void {
  const cfg = CREATURE_DAYS.menagerie;
  const [minI, maxI] = escalateInterval(minutes, cfg.eventIntervalEarly, cfg.eventIntervalLate, cfg.late);
  world.creatureTimer = scheduleRange(minI, maxI);

  const rampT = rampProgress(minutes);
  const doubleChance = Math.min(
    1,
    lerp(cfg.doubleChanceEarly, cfg.doubleChanceLate, rampT) +
      cfg.doubleChanceLatePerMinute * lateMinutes(minutes),
  );
  const isDouble = scheduleRand() < doubleChance;
  const memberBonus = lateMemberBonus(minutes, cfg.late);
  const speedScale = lateSpeedScale(minutes, cfg.late);

  // 1 animal, +1 on a successful double roll, +1 per late-growth step past
  // the ramp (escalateCount's [1,1] range keeps the early game at exactly one)
  const animals = (isDouble ? 2 : 1) + escalateCount(minutes, [1, 1], cfg.late) - 1;

  let prev = world.creatureLastKind;
  let prevLanding = 0; // when the animal before this one materializes
  for (let i = 0; i < animals; i++) {
    const kind = drawMenagerieKind(prev);
    // each animal's own telegraph runs on TOP of its predecessor's landing, so
    // the order holds for any mix of kinds (this is the pre-existing double
    // formula, generalized to a chain: extraDelay = prevLanding + 0.1)
    const extraDelay = i === 0 ? 0 : prevLanding + 0.1;
    spawnMenagerieKind(world, kind, extraDelay, memberBonus, speedScale);
    prevLanding = telegraphFor(kind) + extraDelay;
    prev = kind;
  }
  world.creatureLastKind = prev;
}

/**
 * Creature-day choreography tick: drains the spawn queue (materializing any
 * item whose telegraph has expired) and, on cooldown, schedules the next
 * wave/salvo/lane-burst/deployment/menagerie-draw for whichever creature day
 * is active. No-op on every other day (neither forced kind nor MENAGERIE).
 */
export function updateCreatureChoreography(world: World, dt: number): void {
  const kind = mutatorForceAssemblyKind();
  const menagerie = mutatorMenagerieActive();
  if (kind === null && !menagerie) return;
  if (world.phase !== "playing" || world.sandbox || world.training) return;

  for (let i = world.creatureSpawnQueue.length - 1; i >= 0; i--) {
    const q = world.creatureSpawnQueue[i];
    q.timer -= dt;
    if (q.timer <= 0) {
      world.creatureSpawnQueue.splice(i, 1);
      spawnAssemblyDirect(
        world,
        difficultyMinutes(world),
        q.kind,
        q.count,
        q.x,
        q.y,
        q.dirX,
        q.dirY,
        q.speedScale,
      );
    }
  }

  world.creatureTimer -= dt;
  if (world.creatureTimer > 0) return;

  const minutes = difficultyMinutes(world);
  if (menagerie) {
    scheduleMenagerieEvent(world, minutes);
    return;
  }
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
