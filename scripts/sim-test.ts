/**
 * Headless playtest of the new formations and powers (no DOM needed).
 * Run: npx tsx scripts/sim-test.ts
 */
import { FIXED_DT } from "../src/config";
import { createWorld, tick } from "../src/gameState";
import type { InputState } from "../src/input";
import type { PowerId } from "../src/config";
import { setRunSeed } from "../src/math";
import { Tutorial } from "../src/tutorial";
import type { World } from "../src/types";

const input: InputState = {
  turn: 0,
  thrust: 0,
  heading: null,
  moveVector: null,
  inertia: true,
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

// --- 1b. swarmy by 20 seconds ---
{
  const world = createWorld(17.8, 10);
  step(world, 20);
  // the starshell observer rams constantly, so spawned = kills + alive
  const spawned = world.kills + world.drones.length;
  check("swarmy by 20s (>=25 drones spawned)", spawned >= 25, `${spawned} spawned in 20s`);
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
  const scoreBeforeVortex = world.score;
  activate(world, "vortex");
  check("vortex opens", world.powers.vortices.length === 1);
  // park a drone on the core: it must be devoured (and scored) mid-pull
  const v = world.powers.vortices[0];
  const victim = world.drones.find((d) => d.alive);
  if (victim) {
    victim.x = v.x;
    victim.y = v.y;
  }
  step(world, 0.1);
  check(
    "vortex absorbs + scores during the pull",
    world.powers.vortices.length === 1 &&
      victim !== undefined &&
      !victim.alive &&
      world.kills > killsBeforeVortex &&
      world.score > scoreBeforeVortex,
    `+${world.kills - killsBeforeVortex} kills, +${Math.round(world.score - scoreBeforeVortex)} pts`,
  );
  step(world, 3.4);
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

// --- 7. Daily Patrol determinism: same seed → same script, however you fly ---
{
  interface Script {
    formations: string[];
    powers: string[];
    mines: string[];
  }

  /** Play 3 seeded minutes in a given style and record the spawn script. */
  const record = (style: "ram" | "drift"): Script => {
    setRunSeed(1234567);
    const world = createWorld(17.8, 10);
    const script: Script = { formations: [], powers: [], mines: [] };
    let t = 0;
    const steps = Math.round(180 / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      t += FIXED_DT;
      // two very different runs: a stationary starshell ram-killer vs a
      // circling shield pilot — kills, drone counts, and positions all differ
      let drive = { x: 0, y: 0 };
      if (style === "ram") {
        world.powers.starshellTimer = 9999;
      } else {
        world.powers.shieldActive = true;
        drive = { x: Math.cos(t * 0.7), y: Math.sin(t * 0.7) };
      }
      tick(world, { ...input, inertia: false, moveVector: drive }, FIXED_DT);

      for (const e of world.events) {
        if (e.type === "formation") script.formations.push(`${world.time.toFixed(2)}:${e.kind}`);
      }
      world.events.length = 0;
      // log + clear drops so neither style ever hits the pickup/mine caps
      // (whether a capped drop is discarded is legitimately player-dependent)
      for (const pu of world.pickups) script.powers.push(`${world.time.toFixed(2)}:${pu.power}`);
      world.pickups.length = 0;
      for (const m of world.mines) script.mines.push(world.time.toFixed(2));
      world.mines.length = 0;
    }
    setRunSeed(null);
    return script;
  };

  const a = record("ram");
  const b = record("drift");
  check(
    "daily seed: formation script identical across play styles",
    a.formations.length > 10 && a.formations.join("|") === b.formations.join("|"),
    `${a.formations.length} formations`,
  );
  check(
    "daily seed: power drop script identical across play styles",
    a.powers.length > 5 && a.powers.join("|") === b.powers.join("|"),
    `${a.powers.length} drops`,
  );
  check(
    "daily seed: mine schedule identical across play styles",
    a.mines.length > 3 && a.mines.join("|") === b.mines.join("|"),
    `${a.mines.length} mines`,
  );
}

// --- 8. tutorial sandbox: no ambient spawns, and the scripted beats advance ---
{
  const world = createWorld(17.8, 10, true);
  const hints: string[] = [];
  const tut = new Tutorial(
    world,
    { touch: false, inertia: false, moveKeys: "W A S D" },
    (h) => hints.push(h),
  );
  check("tutorial: opening message blocks until dismissed", tut.waiting);

  const stepTut = (
    seconds: number,
    drive?: { x: number; y: number },
    invuln = false,
  ): void => {
    const steps = Math.round(seconds / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      // in the browser each message pauses the world; the harness taps through
      tut.dismiss();
      // headless dodging is luck, so the harness banks a shield every tick
      if (invuln) world.powers.shieldActive = true;
      tick(world, { ...input, inertia: false, moveVector: drive ?? { x: 0, y: 0 } }, FIXED_DT);
      tut.update(FIXED_DT);
      world.events.length = 0;
    }
  };

  // sandbox stays empty while idle
  stepTut(5);
  check("tutorial sandbox spawns nothing on its own", world.drones.length === 0 && world.pickups.length === 0 && world.mines.length === 0);

  // beat 1: fly around → static drones appear, frozen
  stepTut(2, { x: 1, y: 0 });
  stepTut(2, { x: -1, y: 0 });
  check("tutorial: flying advances to the drone exhibit", world.drones.length === 5, `${world.drones.length} drones`);
  stepTut(3);
  check("tutorial: exhibit drones stay frozen", world.drones.every((d) => d.frozen > 0));

  // beat 2: shatter one frozen drone by ramming it
  const target = world.drones[0];
  world.ship.x = target.x;
  world.ship.y = target.y;
  stepTut(0.2);
  check("tutorial: ramming a frozen drone shatters it safely", world.phase === "playing" && world.drones.filter((d) => d.alive).length === 4);

  // beat 3: survivors thaw (after the 1.4s warning beat) and hunt
  stepTut(2);
  check("tutorial: survivors thaw and hunt", world.drones.some((d) => d.frozen <= 0));
  world.ship.x = -6;
  world.ship.y = -4;
  stepTut(6.5, { x: 1, y: 0 }, true);
  // beat 4: the shockwave pickup appears; grab it
  const pickupAppeared = world.pickups.length === 1 && world.pickups[0].power === "shockwave";
  if (world.pickups.length === 1) {
    world.ship.x = world.pickups[0].x;
    world.ship.y = world.pickups[0].y;
  }
  // the SCORING beat waits for the blast to fully play out (~1.2s of wave)
  stepTut(4.5);
  const outroShown = hints.some((h) => h.includes("THE GOAL"));
  stepTut(1);
  check("tutorial: shockwave beat + outro reached", pickupAppeared && outroShown && tut.done, hints.length + " hints");
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
