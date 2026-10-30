// Onset observer: how many lethal hits land while HOT, and how soon after HOT
// began. Ghost-hull graze bot (a lethal hit is counted, then undone) so the run
// keeps going and the same seeds are comparable with heatRampSeconds 0 vs the
// default. Usage: npx tsx scripts/measure-onset.ts [rampSeconds ...] (default: 0 1.5)
import { FIXED_DT, SCORING, SHIP } from "../src/config";
import { droneRadius } from "../src/enemies";
import { rulesFromDefaults } from "../src/flags";
import { createWorld, tick } from "../src/gameState";
import type { InputState } from "../src/input";
import { setRunSeed } from "../src/math";
import type { World } from "../src/types";

function grazeHeading(world: World): { x: number; y: number } {
  const s = world.ship;
  if (world.overdrive.hot && world.pickups.length > 0) {
    const p = world.pickups[0];
    const l = Math.hypot(p.x - s.x, p.y - s.y) || 1;
    return { x: (p.x - s.x) / l, y: (p.y - s.y) / l };
  }
  let best: World["drones"][number] | null = null;
  let bd = Infinity;
  for (const d of world.drones) {
    if (!d.alive || d.allied || d.frozen > 0) continue;
    const dist = Math.hypot(d.x - s.x, d.y - s.y);
    if (dist < bd) {
      bd = dist;
      best = d;
    }
  }
  if (!best) return { x: 0, y: 0 };
  let rx = 0;
  let ry = 0;
  for (const d of world.drones) {
    if (!d.alive || d === best) continue;
    const dx = s.x - d.x;
    const dy = s.y - d.y;
    const sq = dx * dx + dy * dy;
    if (sq > 9) continue;
    const dist = Math.sqrt(sq) || 0.05;
    rx += (dx / dist) / (sq + 0.2);
    ry += (dy / dist) / (sq + 0.2);
  }
  for (const m of world.mines) {
    if (!m.alive) continue;
    const dx = s.x - m.x;
    const dy = s.y - m.y;
    const sq = dx * dx + dy * dy;
    if (sq > 9) continue;
    const dist = Math.sqrt(sq) || 0.05;
    rx += (1.5 * dx) / dist / (sq + 0.2);
    ry += (1.5 * dy) / dist / (sq + 0.2);
  }
  const stand = SHIP.radius + droneRadius(best) + SCORING.grazeBand * 0.15;
  const dx = best.x - s.x;
  const dy = best.y - s.y;
  const dist = Math.hypot(dx, dy) || 0.05;
  const radial = Math.max(-1, Math.min(1, (dist - stand) / Math.max(0.5, stand)));
  const hx = (dx / dist) * radial + (-dy / dist) * 0.6 + rx * 0.5;
  const hy = (dy / dist) * radial + (dx / dist) * 0.6 + ry * 0.5;
  const l = Math.hypot(hx, hy) || 1;
  return { x: hx / l, y: hy / l };
}

function trial(seed: number, ramp: number, cap: number) {
  setRunSeed(seed);
  const rules = rulesFromDefaults({ overdrive: true });
  rules.overdrive!.heatRampSeconds = ramp;
  if (process.env.HEAT_SCALE) rules.overdrive!.hotDroneSpeedScale = Number(process.env.HEAT_SCALE);
  const world = createWorld(17.8, 10, false, 0, "classic", true, false, rules);
  const inp: InputState = { turn: 0, thrust: 0, heading: null, moveVector: { x: 0, y: 0 }, inertia: false, cruiseSpeed: 8 };
  let lastHit = -9, grazeCtl = 0, ctlHit = 0;
  const ctlPending: number[] = [];
  let hits = 0, hotHits = 0, near1 = 0, hotTicks = 0;
  const n = Math.round(cap / FIXED_DT);
  for (let i = 0; i < n; i++) {
    if (world.phase !== "playing") {
      // one hit per 1 s contact (the ghost hull stays overlapped for a while)
      if (world.time - lastHit >= 1) {
      for (const g of ctlPending) if (world.time - g <= 1) ctlHit++;
      ctlPending.length = 0;
      lastHit = world.time;
      hits++;
      if (world.overdrive.hot) {
        hotHits++;
        if (world.overdrive.hotTime <= 1.0) near1++;
      }
      }
      world.phase = "playing";
      world.deathTimer = 0;
      world.deathCause = null;
    }
    inp.moveVector = grazeHeading(world);
    tick(world, inp, FIXED_DT);
    // control: a plain graze that did not trigger HOT, and whether a hit follows within 1 s
    if (world.events.some((e) => e.type === "graze") && !world.overdrive.hot) {
      grazeCtl++;
      ctlPending.push(world.time);
    }
    world.events.length = 0;
    if (world.overdrive.hot) hotTicks++;
  }
  setRunSeed(null);
  return { hits, hotHits, near1, hotTicks, hotCount: world.overdrive.hotCount, grazeCtl, ctlHit };
}

const ramps = process.argv.slice(2).map(Number);
for (const ramp of ramps.length ? ramps : [0, 1.5]) {
  const t = { hits: 0, hotHits: 0, near1: 0, hotTicks: 0, hotCount: 0, grazeCtl: 0, ctlHit: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    const r = trial(seed, ramp, 60);
    t.hits += r.hits; t.hotHits += r.hotHits; t.near1 += r.near1; t.hotTicks += r.hotTicks; t.hotCount += r.hotCount; t.grazeCtl += r.grazeCtl; t.ctlHit += r.ctlHit;
  }
  console.log(`ramp ${ramp}s: 40 seeds x 60 s, lethal hits ${t.hits}, while HOT ${t.hotHits}, within 1 s of HOT onset ${t.near1}, HOT share ${((t.hotTicks * FIXED_DT) / (40 * 60) * 100).toFixed(1)}%, HOT onsets ${t.hotCount}, onsets with a hit inside 1 s ${((t.near1 / t.hotCount) * 100).toFixed(1)}%; control: non-HOT grazes ${t.grazeCtl}, hit inside 1 s ${((t.ctlHit / t.grazeCtl) * 100).toFixed(1)}%`);
}
