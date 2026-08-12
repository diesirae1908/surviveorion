// STARFALL (Daily Mutator): a constant environmental meteor rain, entirely
// separate from the player-triggered Meteor Storm power (see powers.ts
// updateMeteors, which stays untouched and still targets drone clusters via
// Math.random on pickup). This system fires on a fixed cadence for the whole
// run, telegraphing each impact with a ground reticle before it lands.
//
// Determinism: cadence jitter + the warning duration draw from the seeded
// SCHEDULE stream (scheduleRand), impact position draws from the seeded
// PLACEMENT stream (rand). Exactly one scheduling pass happens per meteor,
// with a fixed number of draws every time (2 schedule + 2 placement), same
// discipline as spawnTelegraphs in enemies.ts. The rain never looks at
// drones, mines, or the ship, so it lands identically for every pilot on
// today's seed no matter how they fly.
//
// Fully gated behind mutatorMeteorRainActive() (true only when STARFALL is
// one of today's active mutators): every other day and mode is untouched.

import { PALETTE, STARFALL_RAIN } from "./config";
import { killDronesInRadius } from "./enemies";
import { ramp, randRange, scheduleRange } from "./math";
import { killMinesInRadius } from "./mines";
import { mutatorMeteorRainActive } from "./mutators";
import { spawnBlast } from "./powers";
import type { World } from "./types";

/**
 * Ramped base interval between impacts (seconds), before schedule jitter.
 * Past the ramp the rain keeps intensifying instead of sitting on
 * intervalFloor forever (2026-08-11 late-growth pass: a plateaued rain is a
 * farmable rain), down to a hard floor so the sky never becomes a solid sheet.
 */
function baseInterval(world: World): number {
  const minutes = world.time / 60;
  const ramped = ramp(minutes, {
    from: STARFALL_RAIN.intervalStart,
    to: STARFALL_RAIN.intervalFloor,
    plateauMinutes: STARFALL_RAIN.rampMinutes,
  });
  const late = Math.max(0, minutes - STARFALL_RAIN.rampMinutes);
  return Math.max(
    STARFALL_RAIN.intervalHardFloor,
    ramped / (1 + STARFALL_RAIN.lateTightenPerMinute * late),
  );
}

/** Schedule the next impact: fixed draws regardless of run state. */
function scheduleNextTelegraph(world: World): void {
  const base = baseInterval(world);
  const j = STARFALL_RAIN.intervalJitter;
  world.meteorRainTimer = scheduleRange(base * (1 - j), base * (1 + j));
  const duration = scheduleRange(...STARFALL_RAIN.warningRange);

  const halfW = world.viewW / 2 - 0.5;
  const halfH = world.viewH / 2 - 0.5;
  const x = randRange(-halfW, halfW);
  const y = randRange(-halfH, halfH);

  world.meteorTelegraphs.push({ x, y, timer: duration, duration, radius: STARFALL_RAIN.radius });
}

function strikeMeteor(world: World, x: number, y: number, radius: number): void {
  killDronesInRadius(world, x, y, radius);
  killMinesInRadius(world, x, y, radius);
  // Reuse the shared blast system for the lingering crater (rendering comes
  // free via drawBlasts) and flag it lethal to the ship too: today's only
  // drop is Shield, so a banked shield is the sole way to eat a direct hit
  // (see gameState.ts handleShipBlastCollisions).
  spawnBlast(world, x, y, radius, {
    holdTime: STARFALL_RAIN.holdTime,
    color: PALETTE.meteors,
    lethalToShip: true,
  });
  world.powers.waves.push({
    x,
    y,
    elapsed: 0,
    lifetime: STARFALL_RAIN.waveLifetime,
    maxRadius: radius * 1.6,
    color: PALETTE.meteors,
  });
  world.events.push({ type: "meteorStrike", x, y });
  world.shake = Math.max(world.shake, 0.22);
}

export function updateStarfallRain(world: World, dt: number): void {
  if (world.phase !== "playing" || world.sandbox || !mutatorMeteorRainActive()) return;

  for (let i = world.meteorTelegraphs.length - 1; i >= 0; i--) {
    const t = world.meteorTelegraphs[i];
    t.timer -= dt;
    if (t.timer <= 0) {
      world.meteorTelegraphs.splice(i, 1);
      strikeMeteor(world, t.x, t.y, t.radius);
    }
  }

  world.meteorRainTimer -= dt;
  if (world.meteorRainTimer <= 0) {
    scheduleNextTelegraph(world);
  }
}
