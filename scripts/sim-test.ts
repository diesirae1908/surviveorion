/**
 * Headless playtest of the new formations and powers (no DOM needed).
 * Run: npx tsx scripts/sim-test.ts
 */
import { FIXED_DT } from "../src/config";
import { createWorld, tick } from "../src/gameState";
import type { InputState } from "../src/input";
import type { PowerId } from "../src/config";
import type { World } from "../src/types";

const input: InputState = {
  turn: 0,
  thrust: 0,
  boost: false,
  heading: null,
  moveVector: null,
  inertia: true,
  simpleBoost: false,
  cruiseSpeed: 8,
};

function step(world: World, seconds: number): void {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    world.powers.starshellTimer = 9999; // invulnerable observer
    tick(world, input, FIXED_DT);
    world.events.length = 0;
  }
}

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- 1. formations over 3 minutes of game time ---
{
  const world = createWorld(17.8, 10);
  let sawStraight = 0;
  let sawFollow = 0;
  let maxDrones = 0;
  for (let s = 0; s < 180; s++) {
    step(world, 1);
    for (const d of world.drones) {
      if (d.scriptMode === "straight") sawStraight++;
      if (d.scriptMode === "follow") sawFollow++;
    }
    maxDrones = Math.max(maxDrones, world.drones.length);
  }
  check("run survives 3 min without crash", world.phase === "playing");
  check("wall/serpent drones marched (straight script)", sawStraight > 0, `${sawStraight} drone-seconds`);
  check("serpent followers trailed (follow script)", sawFollow > 0, `${sawFollow} drone-seconds`);
  check("drone population grew but stayed under cap", maxDrones > 20 && maxDrones <= 250, `max ${maxDrones}`);
  check("kills accumulated (starshell ram)", world.kills > 50, `${world.kills} kills`);
  check("score is finite and positive", Number.isFinite(world.score) && world.score > 0, `${Math.round(world.score)}`);
}

// --- 2. scripted drones release back to homing ---
{
  const world = createWorld(17.8, 10);
  step(world, 45); // by now at least one wall (min 0.5 min) has spawned and finished crossing
  const stuck = world.drones.filter((d) => d.scriptMode && (d.scriptTimer ?? 0) > 60);
  check("no drone scripted for absurdly long", stuck.length === 0, `${stuck.length} stuck`);
}

// --- 3. powers ---
function activate(world: World, power: PowerId): void {
  world.pickups.push({ x: world.ship.x, y: world.ship.y, power, age: 0 });
  step(world, 0.1);
}

{
  const world = createWorld(17.8, 10);
  step(world, 30); // let some drones build up

  // autocannon
  const killsBefore = world.kills;
  activate(world, "autocannon");
  check("autocannon activates", world.powers.autocannonTimer > 0);
  step(world, 2);
  check("autocannon kills drones", world.kills > killsBefore, `+${world.kills - killsBefore}`);

  // meteors
  const killsBeforeMeteors = world.kills;
  activate(world, "meteors");
  check("meteor storm activates", world.powers.meteorTimer > 0);
  step(world, 4.5);
  check("meteor storm expires", world.powers.meteorTimer <= 0);
  check("meteor storm kills drones", world.kills > killsBeforeMeteors, `+${world.kills - killsBeforeMeteors}`);

  // vortex
  const killsBeforeVortex = world.kills;
  activate(world, "vortex");
  check("vortex opens", world.powers.vortices.length === 1);
  step(world, 3.5);
  check("vortex collapses", world.powers.vortices.length === 0);
  check("vortex kills drones", world.kills > killsBeforeVortex, `+${world.kills - killsBeforeVortex}`);
}

// --- 4. every power id activates without crashing ---
{
  const world = createWorld(17.8, 10);
  step(world, 10);
  const all: PowerId[] = [
    "shield", "shockwave", "pulse", "magnet", "afterburner", "freeze",
    "missiles", "starshell", "arc", "autocannon", "meteors", "vortex",
  ];
  let crashed: string | null = null;
  for (const id of all) {
    try {
      activate(world, id);
      step(world, 1);
    } catch (e) {
      crashed = `${id}: ${e}`;
      break;
    }
  }
  check("all 12 powers activate + tick cleanly", crashed === null, crashed ?? "");
}

// --- 5. pickup pool includes new powers from minute zero ---
{
  const world = createWorld(17.8, 10);
  const seen = new Set<string>();
  const first15 = new Set<string>();
  let rolled = 0;
  // fast-roll pickups: force the timer repeatedly at t≈0
  for (let i = 0; i < 60; i++) {
    world.pickups.length = 0;
    world.pickupTimer = 0;
    step(world, 0.05);
    for (const pu of world.pickups) {
      seen.add(pu.power);
      rolled++;
      if (rolled <= 15) first15.add(pu.power);
    }
  }
  check(
    "starshell + new powers spawn at minute zero",
    seen.has("starshell") && seen.has("autocannon") && seen.has("meteors") && seen.has("vortex"),
    [...seen].sort().join(","),
  );
  check("all 12 powers appear within 60 drops", seen.size === 12, `${seen.size}/12`);
  check(
    "bad-luck protection: >=9 distinct powers in first 15 drops",
    first15.size >= 9,
    `${first15.size} distinct`,
  );
}

// --- 6. long run with the full pattern roster (tightring/swarm/megawall live past 1.5 min) ---
{
  const world = createWorld(17.8, 10);
  let maxScripted = 0;
  for (let s = 0; s < 300; s++) {
    step(world, 1);
    maxScripted = Math.max(maxScripted, world.drones.filter((d) => d.scriptMode).length);
  }
  check("5-minute run with all patterns survives", world.phase === "playing", `${world.kills} kills`);
  check(
    "big scripted waves observed (swarm/megawall scale)",
    maxScripted >= 15,
    `max ${maxScripted} scripted at once`,
  );
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
