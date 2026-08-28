// THE LIGHTHOUSE: destroyable scanners with a growing rotating beam.
// Lethal to the ship only. Spawn cadence rides the schedule stream so every
// pilot on the day sees the same scanners. Gated on lighthouseActive.

import { LIGHTHOUSE } from "./config";
import { killDronesInRadius } from "./enemies";
import { randRange, scheduleRange } from "./math";
import { mutatorLighthouseActive } from "./mutators";
import { registerKill } from "./scoring";
import type { Lighthouse, World } from "./types";

export function lighthouseBodyRadius(): number {
  return LIGHTHOUSE.bodyRadius;
}

export function lighthouseGrow(lh: Lighthouse): number {
  return Math.min(1, lh.age / LIGHTHOUSE.growTime);
}

export function lighthouseBeamWidth(lh: Lighthouse): number {
  const t = lighthouseGrow(lh);
  return LIGHTHOUSE.beamWidthFrom + (LIGHTHOUSE.beamWidthTo - LIGHTHOUSE.beamWidthFrom) * t;
}

export function lighthouseBeamLength(lh: Lighthouse): number {
  const t = lighthouseGrow(lh);
  return LIGHTHOUSE.beamLengthFrom + (LIGHTHOUSE.beamLengthTo - LIGHTHOUSE.beamLengthFrom) * t;
}

/** Distance from point to the beam segment (body center to tip). */
export function distToBeam(lh: Lighthouse, px: number, py: number): number {
  const len = lighthouseBeamLength(lh);
  const x2 = lh.x + Math.cos(lh.angle) * len;
  const y2 = lh.y + Math.sin(lh.angle) * len;
  const dx = x2 - lh.x;
  const dy = y2 - lh.y;
  const seg = dx * dx + dy * dy;
  if (seg <= 1e-8) return Math.hypot(px - lh.x, py - lh.y);
  let t = ((px - lh.x) * dx + (py - lh.y) * dy) / seg;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (lh.x + dx * t), py - (lh.y + dy * t));
}

export function updateLighthouses(world: World, dt: number): void {
  if (!mutatorLighthouseActive()) return;
  if (world.phase === "playing" && !world.sandbox && !world.training) {
    world.lighthouseTimer -= dt;
    if (world.lighthouseTimer <= 0) {
      world.lighthouseTimer = scheduleRange(...LIGHTHOUSE.intervalRange);
      trySpawnLighthouse(world);
    }
  }

  for (let i = world.lighthouses.length - 1; i >= 0; i--) {
    const lh = world.lighthouses[i];
    if (!lh.alive) {
      world.lighthouses.splice(i, 1);
      continue;
    }
    lh.age += dt;
    lh.angle += LIGHTHOUSE.spinRate * dt;
  }
}

function trySpawnLighthouse(world: World): void {
  const halfW = world.viewW / 2 - 1.2;
  const halfH = world.viewH / 2 - 1.2;
  const candidates: { x: number; y: number }[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    candidates.push({ x: randRange(-halfW, halfW), y: randRange(-halfH, halfH) });
  }
  const alive = world.lighthouses.filter((l) => l.alive).length;
  if (alive >= LIGHTHOUSE.maxActive) return;

  const { x, y } = candidates[0];
  const angle = scheduleRange(0, Math.PI * 2);
  world.lighthouses.push({
    x,
    y,
    age: 0,
    angle,
    alive: true,
    seed: Math.random() * Math.PI * 2,
  });
  world.events.push({ type: "lighthouseSpawn", x, y });
}

export function killLighthouse(world: World, lh: Lighthouse): void {
  if (!lh.alive) return;
  lh.alive = false;
  const points = registerKill(world, lh.x, lh.y);
  world.events.push({ type: "lighthouseKill", x: lh.x, y: lh.y, points });
  world.shake = Math.max(world.shake, 0.22);
  world.powers.waves.push({
    x: lh.x,
    y: lh.y,
    elapsed: 0,
    lifetime: 0.45,
    maxRadius: LIGHTHOUSE.destroyRadius,
    color: "#ffcc66",
  });
  killDronesInRadius(world, lh.x, lh.y, LIGHTHOUSE.destroyRadius);
}

export function killLighthousesInRadius(world: World, x: number, y: number, radius: number): void {
  const r = radius + LIGHTHOUSE.bodyRadius;
  for (const lh of world.lighthouses) {
    if (!lh.alive) continue;
    const dx = lh.x - x;
    const dy = lh.y - y;
    if (dx * dx + dy * dy <= r * r) killLighthouse(world, lh);
  }
}
