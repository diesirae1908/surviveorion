/**
 * Crowd + survival harness for cloak-day (and any mutator id on argv).
 * Run: npx tsx scripts/measure-cloak-day.ts [--immortal] [mutator-id ...]
 * --immortal: a lethal hit is ignored (counted as hits) so the field can be
 * watched over the full 90 s; without it, survival is the real death time.
 * Bot: repulsion dodger that also drifts toward the nearest pickup, so it
 * collects and uses the day's powers. Reports alive-drone counts at fixed
 * times (trials still alive) and median survival over 10 fixed seeds.
 */
import { FIXED_DT } from "../src/config";
import { createWorld, tick } from "../src/gameState";
import type { InputState } from "../src/input";
import { activatePower } from "../src/powers";
import { setRunSeed } from "../src/math";
import { clearActiveMutators, getMutatorById, mutatorViewScale, setActiveMutators } from "../src/mutators";
import type { World } from "../src/types";

const SEEDS = [11, 2027, 30313, 404_041, 5_050_505, 61, 707_071, 8081, 909_091, 1_010_101];
const CAP = 90;
const IMMORTAL = process.argv.includes("--immortal");
const MARKS = [15, 30, 45, 60, 88];

function heading(world: World): { x: number; y: number } {
  const s = world.ship;
  let fx = 0;
  let fy = 0;
  for (const d of world.drones) {
    if (!d.alive) continue;
    const dx = s.x - d.x;
    const dy = s.y - d.y;
    const q = dx * dx + dy * dy;
    if (q > 36) continue;
    const dist = Math.sqrt(q) || 0.05;
    fx += (dx / dist) / (q + 0.2);
    fy += (dy / dist) / (q + 0.2);
  }
  const threat = Math.hypot(fx, fy);
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (const p of world.pickups) {
    if (p.gone) continue;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d < bd) { bd = d; best = p; }
  }
  if (best && bd > 0.01) {
    const w = threat > 1.2 ? 0 : 0.8;
    fx = (threat > 0 ? fx / threat : 0) + ((best.x - s.x) / bd) * w;
    fy = (threat > 0 ? fy / threat : 0) + ((best.y - s.y) / bd) * w;
  }
  const len = Math.hypot(fx, fy);
  return len < 1e-4 ? { x: 0, y: 0 } : { x: fx / len, y: fy / len };
}

function median(v: number[]): number {
  const a = [...v].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

for (const id of process.argv.slice(2).filter((a) => a[0] !== "-").length ? process.argv.slice(2).filter((a) => a[0] !== "-") : ["cloak-day"]) {
  const m = getMutatorById(id);
  if (!m) throw new Error("unknown mutator " + id);
  const marks: Record<number, number[]> = {};
  MARKS.forEach((t) => (marks[t] = []));
  const times: number[] = [];
  const peaks: number[] = [];
  let cloaks = 0;
  let hits = 0;
  for (const seed of SEEDS) {
    setRunSeed(seed);
    setActiveMutators([m], new Date("2026-11-17T00:00:00Z"));
    const sc = mutatorViewScale();
    const world = createWorld(17.8 * sc, 10 * sc, false, 0, "classic", true);
    const input: InputState = { turn: 0, thrust: 0, heading: null, moveVector: { x: 0, y: 0 }, inertia: false, cruiseSpeed: 8 };
    let peak = 0;
    let next = 0;
    for (let i = 0; i < Math.round(CAP / FIXED_DT); i++) {
      if (IMMORTAL && world.phase === "dying") {
        hits++;
        world.phase = "playing";
        world.deathTimer = 0;
      }
      if (world.phase !== "playing") break;
      input.moveVector = heading(world);
      tick(world, input, FIXED_DT);
      for (const e of world.events) if (e.type === "cloakUp") cloaks++;
      world.events.length = 0;
      const alive = world.drones.reduce((n, d) => n + (d.alive ? 1 : 0), 0);
      peak = Math.max(peak, alive);
      if (next < MARKS.length && world.time >= MARKS[next]) marks[MARKS[next++]].push(alive);
    }
    times.push(Math.min(world.time, CAP));
    peaks.push(peak);
    clearActiveMutators();
    setRunSeed(null);
  }
  const avg = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "-");
  console.log(
    `${id}: median survival ${median(times).toFixed(1)}s | mean peak drones ${avg(peaks)} | cloaks/run ${(cloaks / SEEDS.length).toFixed(1)} | hits/run ${(hits / SEEDS.length).toFixed(0)} | alive drones (mean, n) ` +
      MARKS.map((t) => `t${t}=${avg(marks[t])}(${marks[t].length})`).join(" "),
  );
}

// Per-pickup clearing: at t=40 s (immortal bot, same seeds) fire one power and
// compare alive drones 6 s later against a control that fires nothing.
if (process.argv.includes("--per-pickup")) {
  const m = getMutatorById(process.argv.find((a) => a[0] !== "-" && getMutatorById(a)) ?? "cloak-day")!;
  if (process.env.AMP) m.overrides.powerAmpScale = Number(process.env.AMP);
  const run = (seed: number, power: "cloak" | "shockwave" | null): number => {
    setRunSeed(seed);
    setActiveMutators([m], new Date("2026-11-17T00:00:00Z"));
    const sc = mutatorViewScale();
    const world = createWorld(17.8 * sc, 10 * sc, false, 0, "classic", true);
    const input: InputState = { turn: 0, thrust: 0, heading: null, moveVector: { x: 0, y: 0 }, inertia: false, cruiseSpeed: 8 };
    let fired = false;
    for (let i = 0; i < Math.round(46 / FIXED_DT); i++) {
      if (world.phase === "dying") { world.phase = "playing"; world.deathTimer = 0; }
      if (!fired && world.time >= 40 && power) { activatePower(world, power); fired = true; }
      input.moveVector = heading(world);
      world.pickups.length = 0; // isolate the one power under test
      tick(world, input, FIXED_DT);
      world.events.length = 0;
    }
    const alive = world.drones.reduce((n, d) => n + (d.alive ? 1 : 0), 0);
    clearActiveMutators();
    setRunSeed(null);
    return alive;
  };
  for (const power of ["cloak", "shockwave"] as const) {
    const cut = SEEDS.map((s) => run(s, null) - run(s, power));
    console.log(`per-pickup ${power} (amp ${m.overrides.powerAmpScale ?? 1}): mean drones removed ${(cut.reduce((a, b) => a + b, 0) / cut.length).toFixed(1)} (control field ~100)`);
  }
}
