// THE FLOOD (Daily Mutator): a metronome of enemy pops from the edges.
// Formations are gated off separately (mutatorFormationsDisabled). Classic
// ambient is off for the day, so this module is the only spawn.
//
// Cadence is a pure function of world.time: no jitter, no schedule-stream
// draws. Interval shrinks the whole run (rate = start / (1 + k * minutes))
// until intervalHardFloor. Placement rides the seeded PLACEMENT stream
// (one randomEdgePoint draw per pop, plus spawnAt's scale-jitter draw).
// The pop never looks at drones, mines, or the ship, so every pilot on
// today's seed sees the same beat.
//
// Fully gated behind mutatorFloodSurgeActive(): every other day and mode
// is untouched.

import { FLOOD_SURGE } from "./config";
import { spawnFloodPop } from "./enemies";
import { mutatorFloodSurgeActive } from "./mutators";
import type { World } from "./types";

/** Seconds until the next pop. Shrinks for the whole run, never jitters. */
export function floodPopInterval(world: World): number {
  const minutes = world.time / 60;
  return Math.max(
    FLOOD_SURGE.intervalHardFloor,
    FLOOD_SURGE.intervalStart / (1 + FLOOD_SURGE.tightenPerMinute * minutes),
  );
}

function firePop(world: World): void {
  const p = spawnFloodPop(world, world.time / 60);
  world.events.push({ type: "floodSurge", x: p.x, y: p.y });
}

export function updateFloodSurge(world: World, dt: number): void {
  if (world.phase !== "playing" || world.sandbox || !mutatorFloodSurgeActive()) return;

  world.floodSurgeTimer -= dt;
  while (world.floodSurgeTimer <= 0) {
    firePop(world);
    world.floodSurgeTimer += floodPopInterval(world);
  }
}
