// THE FLOOD (Daily Mutator): timed directional surges from one hashed edge.
// Ambient trickle still runs (low) so the gaps between waves aren't empty;
// formations are gated off separately (mutatorFormationsDisabled).
//
// Determinism: cadence jitter rides the seeded SCHEDULE stream (one
// scheduleRange per surge). Lateral center + per-lane jitter ride the
// PLACEMENT stream (rand). Lane count and pack size are pure functions of
// world.time, never of the ship, kills, or drone count. Extra lane slots
// always consume their rand draw so the draw count is fixed (1 + laneCountMax)
// even while fewer lanes are live early on. The surge never looks at drones,
// mines, or the ship, so every pilot on today's seed sees the same waves.
//
// Fully gated behind mutatorFloodSurgeActive(): every other day and mode
// is untouched.

import { FLOOD_SURGE } from "./config";
import { spawnFloodDrone, spawnRadius } from "./enemies";
import { ramp, rand, scheduleRange } from "./math";
import { mutatorFloodHeadingVector, mutatorFloodSurgeActive } from "./mutators";
import type { World } from "./types";

function surgeMinutes(world: World): number {
  return world.time / 60;
}

function baseInterval(world: World): number {
  const minutes = surgeMinutes(world);
  const ramped = ramp(minutes, {
    from: FLOOD_SURGE.intervalStart,
    to: FLOOD_SURGE.intervalFloor,
    plateauMinutes: FLOOD_SURGE.rampMinutes,
  });
  const late = Math.max(0, minutes - FLOOD_SURGE.lateStartMinutes);
  return Math.max(
    FLOOD_SURGE.intervalHardFloor,
    ramped / (1 + FLOOD_SURGE.lateTightenPerMinute * late),
  );
}

function laneCountAt(minutes: number): number {
  return Math.min(
    FLOOD_SURGE.laneCountMax,
    FLOOD_SURGE.laneCountBase + Math.floor(minutes / FLOOD_SURGE.laneCountPerMinutes),
  );
}

function packSizeAt(minutes: number): number {
  return Math.min(
    FLOOD_SURGE.packSizeMax,
    Math.round(FLOOD_SURGE.packSizeBase + FLOOD_SURGE.packSizePerMinute * minutes),
  );
}

function scheduleNextSurge(world: World): void {
  const base = baseInterval(world);
  const j = FLOOD_SURGE.intervalJitter;
  world.floodSurgeTimer = scheduleRange(base * (1 - j), base * (1 + j));
}

function fireSurge(world: World): void {
  const heading = mutatorFloodHeadingVector();
  if (!heading) return;

  const minutes = surgeMinutes(world);
  const liveLanes = laneCountAt(minutes);
  const packSize = packSizeAt(minutes);
  const dist = spawnRadius(world);
  const originX = -heading.x * dist;
  const originY = -heading.y * dist;
  const px = -heading.y;
  const py = heading.x;

  // one placement draw for the whole surge's lateral shift
  const centerOff = (rand() - 0.5) * 2 * FLOOD_SURGE.laneWidthUnits;

  for (let lane = 0; lane < FLOOD_SURGE.laneCountMax; lane++) {
    const jitter = (rand() - 0.5) * FLOOD_SURGE.laneWidthUnits;
    if (lane >= liveLanes) continue;
    const slot = (lane - (liveLanes - 1) / 2) * FLOOD_SURGE.laneGapUnits;
    const x = originX + px * (slot + centerOff + jitter);
    const y = originY + py * (slot + centerOff + jitter);
    world.floodTelegraphs.push({
      x,
      y,
      timer: FLOOD_SURGE.telegraphDuration,
      duration: FLOOD_SURGE.telegraphDuration,
      dirX: heading.x,
      dirY: heading.y,
      packSize,
    });
    world.events.push({ type: "floodSurge", x, y });
  }
}

function popTelegraph(world: World, t: World["floodTelegraphs"][number]): void {
  const minutes = surgeMinutes(world);
  for (let p = 0; p < t.packSize; p++) {
    const back = p * 0.45;
    spawnFloodDrone(
      world,
      t.x - t.dirX * back,
      t.y - t.dirY * back,
      minutes,
      t.dirX,
      t.dirY,
      FLOOD_SURGE.surgeSpeedScale,
      FLOOD_SURGE.scriptSeconds,
      FLOOD_SURGE.scriptWander,
    );
  }
}

export function updateFloodSurge(world: World, dt: number): void {
  if (world.phase !== "playing" || world.sandbox || !mutatorFloodSurgeActive()) return;

  for (let i = world.floodTelegraphs.length - 1; i >= 0; i--) {
    const t = world.floodTelegraphs[i];
    t.timer -= dt;
    if (t.timer <= 0) {
      world.floodTelegraphs.splice(i, 1);
      popTelegraph(world, t);
    }
  }

  world.floodSurgeTimer -= dt;
  if (world.floodSurgeTimer <= 0) {
    fireSurge(world);
    scheduleNextSurge(world);
  }
}
