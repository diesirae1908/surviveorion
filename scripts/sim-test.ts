/**
 * Headless playtest of the new formations and powers (no DOM needed).
 * Run: npx tsx scripts/sim-test.ts
 */
import { ASSEMBLY, FIXED_DT, IRONRAIN, PICKUPS, POWERS, SCORING, SHIP, SPAWNABLE_POWER_IDS, TRAINING } from "../src/config";
import { droneRadius, spawnAssemblyDirect, spawnDroneDirect } from "../src/enemies";
import { createWorld, tick } from "../src/gameState";
import type { InputState } from "../src/input";
import type { PowerId } from "../src/config";
import { clamp01, setRunSeed } from "../src/math";
import { medalThresholdsForDate } from "../src/medals";
import {
  clearActiveMutators,
  getMutatorById,
  getMutatorsForDate,
  MUTATOR_POOL,
  MUTATORS_START_DATE,
  mutatorAmbientRateScale,
  mutatorViewScale,
  setActiveMutators,
  type Mutator,
} from "../src/mutators";
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

const MS_PER_DAY = 86_400_000;

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- 1. formations over 3 minutes of game time ---
//
// Seeded (2026-08-12): this smoke test asserts a population ceiling on a
// 3-minute vanilla Classic run, and unseeded that peak wanders right across
// the bar (observed 265 against a <=250 bar on a run where nothing about
// Classic had changed). The seed pins the spawn script so the ceiling means
// "the cap logic works" instead of "today's dice were kind"; variety across
// scripts is covered by the seeded bot trials in sections 10-11.
{
  setRunSeed(90_210);
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
  setRunSeed(null);
}

// --- 1b. swarmy by 20 seconds ---
{
  setRunSeed(90_211);
  const world = createWorld(17.8, 10);
  step(world, 20);
  // the starshell observer rams constantly, so spawned = kills + alive
  const spawned = world.kills + world.drones.length;
  check("swarmy by 20s (>=25 drones spawned)", spawned >= 25, `${spawned} spawned in 20s`);
  setRunSeed(null);
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

/** Stop ambient pickups from drifting into the stationary observer. */
function muteAmbientPickups(world: World): void {
  world.daily = true; // disables the refill floor
  world.pickups.length = 0;
  world.pickupTimer = 99999;
}

{
  const world = createWorld(17.8, 10);
  step(world, 30); // let some drones build up
  muteAmbientPickups(world);

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
  // (spawned explicitly — ambient survivors near the observer are not a given)
  const v = world.powers.vortices[0];
  const victim = spawnDroneDirect(world, v.x + 0.1, v.y, 0.6, 0);
  victim.frozen = 0;
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

// --- 3b. magnet: one-shot grab yanks a single pickup to the ship ---
{
  const world = createWorld(17.8, 10);
  step(world, 5);
  muteAmbientPickups(world);

  // park a pickup far away, then grab a magnet at the ship
  world.pickups.push({ x: world.ship.x + 7, y: world.ship.y, power: "shield", age: 0 });
  activate(world, "magnet");
  const claimed = world.pickups.find((p) => p.power === "shield");
  check("magnet claims the nearest pickup", claimed?.magnetized === true);
  step(world, 1.5); // 7 units at pullSpeed 11 — arrives well within this
  check("claimed pickup flies in and is collected", world.powers.shieldActive);

  // empty board: the charge stays armed and takes the next drop instead
  world.pickups.length = 0;
  activate(world, "magnet");
  check("magnet on an empty board arms a pending grab", world.powers.magnetPending === 1);
  world.pickupTimer = 0; // force the next scheduled drop
  step(world, 0.1);
  const inbound = world.pickups.filter((p) => p.magnetized);
  check(
    "pending grab claims the next drop",
    inbound.length === 1 && world.powers.magnetPending === 0,
    inbound.map((p) => p.power).join(","),
  );
}

// --- 3c. ion: Pulse-style charge, then a directed cone shove ---
{
  const world = createWorld(17.8, 10);
  muteAmbientPickups(world);
  world.drones.length = 0;
  world.ship.angle = Math.PI / 2; // facing up at pickup

  const missed = spawnDroneDirect(world, 0, 3, 0.6, 0);
  const aimed = spawnDroneDirect(world, 3, 0, 0.6, 0);
  missed.frozen = 99;
  aimed.frozen = 99;

  activate(world, "ion");
  check(
    "ion charges on pickup instead of firing",
    world.powers.ionTimer > 0 && (aimed.slamTimer ?? 0) <= 0 && (missed.slamTimer ?? 0) <= 0,
    `timer ${world.powers.ionTimer.toFixed(2)}`,
  );

  world.ship.angle = 0; // steer the cone right during the charge
  step(world, POWERS.ion.chargeTime + 0.05);

  check("ion fires after the charge", world.powers.ionTimer <= 0);
  check(
    "aimed cone slams the drone in front of the new heading",
    (aimed.slamTimer ?? 0) > 0 && Math.abs((aimed.slamVx ?? 0) - POWERS.ion.slamSpeed) < 0.01,
    `timer ${aimed.slamTimer} vx ${aimed.slamVx}`,
  );
  check(
    "drone outside the aimed cone is not slammed",
    (missed.slamTimer ?? 0) <= 0 && missed.alive,
  );
}

// --- 3c2. ion charge: hull-glow rams while the cone is up ---
{
  const world = createWorld(17.8, 10, true);
  muteAmbientPickups(world);
  world.drones.length = 0;
  world.ship.x = 0;
  world.ship.y = 0;
  activate(world, "ion");
  const ram = spawnDroneDirect(
    world,
    world.ship.x + POWERS.ion.ramRadius * 0.4,
    world.ship.y,
    0.6,
    0,
  );
  ram.frozen = 0;
  tick(world, input, FIXED_DT);
  check(
    "ion charge rams overlapping drones instead of dying",
    world.phase === "playing" && !ram.alive && world.powers.ionTimer > 0,
    `phase ${world.phase} alive ${ram.alive} timer ${world.powers.ionTimer.toFixed(2)}`,
  );
}

// --- 3c3. thunder: Pulse-style charge, then an aimed ray with sequential hops ---
{
  const world = createWorld(17.8, 10);
  muteAmbientPickups(world);
  world.drones.length = 0;
  world.ship.x = 0;
  world.ship.y = 0;
  world.ship.angle = Math.PI / 2;

  const missed = spawnDroneDirect(world, 0, 4, 0.6, 0);
  const aimed = spawnDroneDirect(world, 4, 0, 0.6, 0);
  missed.frozen = 99;
  aimed.frozen = 99;

  activate(world, "thunder");
  check(
    "thunder charges on pickup instead of firing",
    world.powers.thunderTimer > 0 && missed.alive && aimed.alive,
    `timer ${world.powers.thunderTimer.toFixed(2)}`,
  );

  world.ship.angle = 0;
  step(world, POWERS.thunder.chargeTime + 0.05);
  check("thunder fires after the charge", world.powers.thunderTimer <= 0);
  check("aimed ray kills the drone in front of the new heading", !aimed.alive);
  check("drone off the aimed ray is not on the beam", missed.alive);
}

// --- 3c4. thunder charge: hull-glow rams while the ray is charging ---
{
  const world = createWorld(17.8, 10, true);
  muteAmbientPickups(world);
  world.drones.length = 0;
  world.ship.x = 0;
  world.ship.y = 0;
  activate(world, "thunder");
  const ram = spawnDroneDirect(
    world,
    world.ship.x + POWERS.thunder.ramRadius * 0.4,
    world.ship.y,
    0.6,
    0,
  );
  ram.frozen = 0;
  tick(world, input, FIXED_DT);
  check(
    "thunder charge rams overlapping drones instead of dying",
    world.phase === "playing" && !ram.alive && world.powers.thunderTimer > 0,
    `phase ${world.phase} alive ${ram.alive} timer ${world.powers.thunderTimer.toFixed(2)}`,
  );
}

// --- 3c5. thunder hops: sequential, cluster-local, shared budget ---
{
  const world = createWorld(17.8, 10);
  muteAmbientPickups(world);
  world.drones.length = 0;
  world.ship.x = 0;
  world.ship.y = 0;
  world.ship.angle = Math.PI / 2;

  const beam = spawnDroneDirect(world, 0, 4, 0.6, 0);
  const hop = spawnDroneDirect(world, 2.2, 4, 0.6, 0);
  const far = spawnDroneDirect(world, 7, 4, 0.6, 0);
  beam.frozen = 99;
  hop.frozen = 99;
  far.frozen = 99;

  activate(world, "thunder");
  world.powers.thunderTimer = 0.001;
  tick(world, input, FIXED_DT);
  check("ray kills the drone on the beam", !beam.alive);
  check(
    "hops do not all fire on the bolt frame",
    hop.alive && far.alive && world.powers.thunderChain !== null,
    `hop ${hop.alive} far ${far.alive} chain ${world.powers.thunderChain ? "yes" : "no"}`,
  );

  step(world, POWERS.thunder.hopInterval + 0.02);
  check("first hop walks to the nearby drone", !hop.alive);
  check("hop radius does not reach the far drone", far.alive);
}

// --- 3d. afterburner: freeze, aim, ram, then dash ---
{
  const world = createWorld(17.8, 10, true);
  muteAmbientPickups(world);
  world.drones.length = 0;
  world.ship.x = 0;
  world.ship.y = 0;
  world.ship.vx = 4;
  world.ship.vy = -2;
  world.ship.angle = 0;
  activate(world, "afterburner");
  tick(world, { ...input, turn: 1, thrust: 1 }, FIXED_DT);
  check(
    "afterburner charge stops the ship",
    world.powers.afterburnerCharge > 0 &&
      Math.abs(world.ship.vx) < 0.01 &&
      Math.abs(world.ship.vy) < 0.01,
    `vx ${world.ship.vx} vy ${world.ship.vy} charge ${world.powers.afterburnerCharge.toFixed(2)}`,
  );
  check("afterburner charge still lets you turn", world.ship.angle !== 0);

  const ram = spawnDroneDirect(
    world,
    world.ship.x + POWERS.afterburner.ramRadius * 0.4,
    world.ship.y,
    0.6,
    0,
  );
  ram.frozen = 0;
  tick(world, input, FIXED_DT);
  check(
    "afterburner charge rams overlapping drones",
    world.phase === "playing" && !ram.alive && world.powers.afterburnerCharge > 0,
    `phase ${world.phase} alive ${ram.alive}`,
  );

  world.ship.angle = 0;
  step(world, POWERS.afterburner.chargeTime + 0.05);
  check(
    "afterburner dashes along the aimed heading after the charge",
    world.powers.afterburnerCharge <= 0 &&
      (world.powers.afterburnerDash > 0 || world.powers.afterburnerGrace > 0),
  );
}

// --- 3d2. GOLD DASH: always one pickup, replace far away, no seed desync ---
{
  const gold = getMutatorById("gold-dash")!;
  setActiveMutators([gold], "2026-08-29");
  const world = createWorld(17.8, 10, false, 0, "classic", true);
  check("gold-dash opens with exactly one pickup", world.pickups.length === 1);
  const orb = world.pickups[0];
  world.ship.x = orb.x;
  world.ship.y = orb.y;
  tick(world, input, FIXED_DT);
  check(
    "collecting a gold-dash pickup spawns the next one immediately",
    world.pickups.length === 1 && world.powers.afterburnerCharge > 0,
    `pickups ${world.pickups.length} charge ${world.powers.afterburnerCharge}`,
  );
  const next = world.pickups[0];
  const gap = Math.hypot(next.x - world.ship.x, next.y - world.ship.y);
  check("next gold-dash pickup waits across the field", gap > 5, `gap ${gap.toFixed(2)}`);
  clearActiveMutators();

  const recordForms = (collect: boolean): string => {
    setRunSeed(1234567);
    setActiveMutators([gold], "2026-08-29");
    const w = createWorld(17.8, 10, false, 0, "classic", true);
    const forms: string[] = [];
    const steps = Math.round(40 / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      w.powers.starshellTimer = 9999;
      if (collect && w.pickups[0]) {
        w.ship.x = w.pickups[0].x;
        w.ship.y = w.pickups[0].y;
      }
      tick(w, { ...input, inertia: false, moveVector: { x: 0, y: 0 } }, FIXED_DT);
      for (const e of w.events) {
        if (e.type === "formation") forms.push(`${w.time.toFixed(2)}:${e.kind}`);
      }
      w.events.length = 0;
    }
    clearActiveMutators();
    setRunSeed(null);
    return forms.join("|");
  };
  const withCollect = recordForms(true);
  const withoutCollect = recordForms(false);
  check(
    "gold-dash collect-replace does not desync the formation script",
    withCollect.length > 0 && withCollect === withoutCollect,
    withCollect === withoutCollect
      ? `${withCollect.split("|").length} formations`
      : "scripts diverged",
  );
}

// --- 3e. flare: pulls trains and shapes, keeps the pile grouped ---
{
  const world = createWorld(17.8, 10);
  muteAmbientPickups(world);
  world.drones.length = 0;
  world.assemblies.length = 0;
  world.assemblyTimer = 999;
  world.crowdAssemblyTimer = 999;
  world.ship.x = 0;
  world.ship.y = 0;

  const head = spawnDroneDirect(world, 2.2, 0.3, 0.6, 1.6);
  head.scriptMode = "straight";
  head.scriptDirX = 1;
  head.scriptDirY = 0;
  head.scriptTimer = 10;
  const tail = spawnDroneDirect(world, 2.8, 0.3, 0.6, 1.6);
  tail.scriptMode = "follow";
  tail.followTarget = head;
  tail.scriptTimer = 10;

  activate(world, "flare");
  check("flare drops a decoy", world.powers.flares.length === 1);
  world.ship.x = 8;
  world.ship.y = 8;
  const killsBefore = world.kills;
  step(world, 2.2);
  const decoy = world.powers.flares[0];
  const headDist = decoy ? Math.hypot(head.x - decoy.x, head.y - decoy.y) : 99;
  const tailDist = decoy ? Math.hypot(tail.x - decoy.x, tail.y - decoy.y) : 99;
  check("flare does not kill the pile", world.kills === killsBefore && head.alive && tail.alive);
  check("serpent drones drop the train and home to the flare", !head.scriptMode && !tail.scriptMode);
  check(
    "scripted drones gather on the flare",
    headDist < 1.6 && tailDist < 1.6,
    `h ${headDist.toFixed(2)} t ${tailDist.toFixed(2)}`,
  );

  world.drones.length = 0;
  world.assemblies.length = 0;
  world.powers.flares.length = 0;
  world.ship.x = 0;
  world.ship.y = 0;
  spawnAssemblyDirect(world, 1, "bomb", 10, 2.4, 0, -1, 0);
  const bombKills = world.kills;
  activate(world, "flare");
  world.ship.x = 8;
  world.ship.y = 8;
  step(world, 3.2);
  const bait = world.powers.flares[0];
  const asm = world.assemblies[0];
  const asmDist = bait && asm ? Math.hypot(asm.x - bait.x, asm.y - bait.y) : 99;
  check(
    "bomb shape stays grouped on the flare instead of detonating",
    world.assemblies.length === 1 && asmDist < 2.2,
    `assemblies ${world.assemblies.length} dist ${asmDist.toFixed(2)}`,
  );
  check("flare still does not kill the shape", world.kills === bombKills);

  world.drones.length = 0;
  world.assemblies.length = 0;
  world.powers.flares.length = 0;
  world.ship.x = 0;
  world.ship.y = 0;
  world.time = 40;
  world.assemblyTimer = 999;
  world.crowdAssemblyTimer = 0;
  world.nextFormationDelay = 999;
  world.sustainedSpawnCooldown = 999;
  world.spawnAccumulator = 0;
  world.lateAmbientAccumulator = 0;
  activate(world, "flare");
  if (world.powers.flares[0]) world.powers.flares[0].timer = 12;
  world.ship.x = 8;
  world.ship.y = 8;
  for (let i = 0; i < 70; i++) {
    spawnDroneDirect(world, Math.cos(i) * 0.25, Math.sin(i) * 0.25, 0.6, 0.4);
  }
  step(world, ASSEMBLY.crowdCooldown + 0.4);
  check("flare pile does not fuse into an exploding shape", world.assemblies.length === 0);
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
//
// Seeded (2026-08-12), same reason as section 1: the "distinct powers in the
// first 15 drops" bar sits close enough to the bad-luck protection's actual
// behavior that an unseeded roll flips it (observed 7 against a >=8 bar). What
// this section is testing is the demotion logic, not the dice.
{
  setRunSeed(51_500);
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
    seen.has("starshell") && seen.has("autocannon") && seen.has("meteors"),
    [...seen].sort().join(","),
  );
  check(
    "all spawnable powers appear within 60 drops (benched ones never)",
    seen.size === SPAWNABLE_POWER_IDS.length && !seen.has("afterburner") && !seen.has("vortex"),
    `${seen.size}/${SPAWNABLE_POWER_IDS.length}`,
  );
  check(
    "bad-luck protection: >=8 distinct powers in first 15 drops",
    first15.size >= 8,
    `${first15.size} distinct`,
  );
  setRunSeed(null);
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

// --- 6b. Iron Rain: max pressure from second zero, pinned difficulty ---
{
  const world = createWorld(17.8, 10, false, 1, "ironrain"); // grace 1 must be ignored
  check("iron rain forces grace off", world.grace === 0);
  check(
    "iron rain opens with an immediate mega-wall",
    world.drones.filter((d) => d.scriptMode === "straight").length >= 10,
    `${world.drones.length} drones at t=0`,
  );

  const kinds = new Set<string>();
  const steps = Math.round(120 / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    world.powers.starshellTimer = 9999;
    tick(world, input, FIXED_DT);
    for (const e of world.events) {
      if (e.type === "formation") kinds.add(e.kind);
    }
    world.events.length = 0;
  }
  const allowed = new Set(Object.keys(IRONRAIN.formationWeights));
  const offMenu = [...kinds].filter((k) => !allowed.has(k) && k !== "megawall");
  check(
    "iron rain formations come from the wall-heavy menu",
    kinds.size >= 3 && offMenu.length === 0,
    `saw: ${[...kinds].sort().join(",")}`,
  );
  check("iron rain 2-min run survives", world.phase === "playing", `${world.kills} kills`);

  // pinned difficulty: an iron rain opening spawns like a deep classic run
  const fresh = createWorld(17.8, 10, false, 0, "ironrain");
  const classic = createWorld(17.8, 10);
  const spawnedIn20 = (w: World): number => {
    const start = w.drones.length;
    step(w, 20);
    return w.kills + w.drones.length - start;
  };
  const iron20 = spawnedIn20(fresh);
  const classic20 = spawnedIn20(classic);
  check(
    "iron rain opening far denser than classic",
    iron20 > classic20 * 1.5,
    `ironrain ${iron20} vs classic ${classic20} spawns in 20s`,
  );
}

// --- 6c. graze: near misses pay, cooldown stops farming ---
{
  const world = createWorld(17.8, 10, true); // sandbox: nothing else interferes
  const d = spawnDroneDirect(world, 0, 0, 0.6, 0);
  d.frozen = 0;
  // park the drone just inside the graze band (outside contact distance)
  const contact = SHIP.radius + droneRadius(d);
  world.ship.x = 0;
  world.ship.y = 0;
  d.x = contact + SCORING.grazeBand * 0.5;
  d.y = 0;
  d.vx = 0;
  d.vy = 0;

  const scoreBefore = world.score;
  const multBefore = world.multiplier;
  tick(world, input, FIXED_DT);
  const grazed = world.events.some((e) => e.type === "graze");
  world.events.length = 0;
  check("graze detected in the band", grazed);
  check("graze pays points", world.score > scoreBefore, `+${Math.round(world.score - scoreBefore)}`);
  check("graze bumps the multiplier", world.multiplier > multBefore, `x${world.multiplier.toFixed(2)}`);

  // still in the band next tick: the per-drone cooldown must block a repeat
  // (compare bonuses — total score keeps rising from survival pay)
  const bonusesAfterFirst = world.scoreBonuses;
  d.x = contact + SCORING.grazeBand * 0.5;
  d.y = 0;
  tick(world, input, FIXED_DT);
  const regrazed = world.events.some((e) => e.type === "graze");
  world.events.length = 0;
  check(
    "graze cooldown blocks farming the same drone",
    !regrazed && world.scoreBonuses === bonusesAfterFirst,
  );

  // a banked shield does NOT block grazes (contact would still cost it),
  // but true invulnerability (starshell) does
  const d2 = spawnDroneDirect(world, 5, 5, 0.6, 0);
  world.ship.x = 5 - (SHIP.radius + droneRadius(d2) + SCORING.grazeBand * 0.5);
  world.ship.y = 5;
  world.powers.shieldActive = true;
  tick(world, input, FIXED_DT);
  const shieldedGraze = world.events.some((e) => e.type === "graze");
  world.events.length = 0;
  check("graze still pays while the shield is banked", shieldedGraze);
  world.powers.shieldActive = false;

  const d3 = spawnDroneDirect(world, -5, 5, 0.6, 0);
  world.ship.x = -5 - (SHIP.radius + droneRadius(d3) + SCORING.grazeBand * 0.5);
  world.ship.y = 5;
  world.powers.starshellTimer = 3;
  tick(world, input, FIXED_DT);
  const invulnGraze = world.events.some((e) => e.type === "graze");
  world.events.length = 0;
  check("no graze while truly invulnerable (starshell)", !invulnGraze);
  world.powers.starshellTimer = 0;
}

// --- 6d. pickups: 1 on start, cap of 3, refill floor, drift (floor off on daily) ---
{
  const world = createWorld(17.8, 10);
  check(
    "one pickup dealt on launch",
    world.pickups.length === PICKUPS.spawnOnStart,
    `${world.pickups.length}`,
  );

  // measure drift away from walls (a bounce near the edge could cancel it out)
  const p = world.pickups[0];
  p.x = 4;
  p.y = 0;
  const hasVel = Math.hypot(p.vx ?? 0, p.vy ?? 0) > 0.2;
  step(world, 1);
  const drifted =
    hasVel && (!world.pickups.includes(p) || Math.hypot(p.x - 4, p.y - 0) > 0.2);
  check("pickups drift", drifted);

  // refill floor: strip the arena, the next drop must be hurried in
  world.pickups.length = 0;
  world.pickupTimer = 30;
  step(world, 1);
  check("refill floor hurries a drop in (arena dry)", world.pickups.length >= 1);

  // cap: never more than maxActive on the board
  world.pickupTimer = 0.01;
  let maxSeen = 0;
  for (let i = 0; i < 40; i++) {
    world.pickupTimer = 0.01;
    step(world, 0.05);
    maxSeen = Math.max(maxSeen, world.pickups.length);
  }
  check("pickup cap holds (max 3 on the board)", maxSeen <= PICKUPS.maxActive, `${maxSeen}`);

  // daily runs keep the seeded schedule instead (no player-dependent refill)
  const daily = createWorld(17.8, 10, false, 0, "classic", true);
  daily.pickups.length = 0;
  daily.pickupTimer = 30;
  step(daily, 1);
  check("daily patrol skips the refill floor", daily.pickups.length === 0);
}

// --- 6e. lingering blasts + vortex invulnerability ---
{
  const world = createWorld(17.8, 10, true); // sandbox
  world.ship.x = 0;
  world.ship.y = 0;

  // shockwave leaves a lingering kill zone: a drone spawned into the zone
  // AFTER the blast fires must still die
  activate(world, "shockwave");
  check("shockwave spawns a lingering blast", world.powers.blasts.length >= 1);
  // inside the (now much smaller) wave radius, after the blast fired
  const late = spawnDroneDirect(world, POWERS.shockwave.waveMaxRadius * 0.5, 0, 0.6, 0);
  late.frozen = 0;
  step(world, 1.2);
  check("shockwave linger kills late arrivals", !late.alive);

  // missile impact detonates an area blast: neighbours die too
  const w2 = createWorld(17.8, 10, true);
  w2.ship.x = 0;
  w2.ship.y = 0;
  const a = spawnDroneDirect(w2, 4, 0, 0.6, 0);
  const b = spawnDroneDirect(w2, 4 + 0.8, 0, 0.6, 0); // inside the 1.2 blast radius
  a.frozen = 0;
  b.frozen = 0;
  activate(w2, "missiles");
  step(w2, 2.5);
  check(
    "missile blast is area damage (neighbour dies too)",
    !a.alive && !b.alive && w2.powers.blasts.length + w2.kills >= 2,
    `${w2.kills} kills`,
  );

  // vortex: ship untouchable while a singularity is open
  const w3 = createWorld(17.8, 10, true);
  w3.ship.x = 0;
  w3.ship.y = 0;
  activate(w3, "vortex");
  w3.powers.starshellTimer = 0; // the vortex must be the only protection
  // overlapping the hull, slightly offset (dead-center would zero the heading)
  const ram = spawnDroneDirect(w3, w3.ship.x + SHIP.radius * 0.5, w3.ship.y, 0.6, 0);
  ram.frozen = 0;
  tick(w3, input, FIXED_DT);
  check(
    "ship invulnerable while the vortex is open (ram-kills instead)",
    w3.phase === "playing" && !ram.alive,
  );
}

// --- 6f. drone evolutions: form, go active, burst/disband ---
{
  const world = createWorld(17.8, 10);
  let sawAssembly = false;
  let sawMembers = false;
  let sawActive = false;
  let sawBurst = false;
  const kindsSeen = new Set<string>();
  const steps = Math.round(240 / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    world.powers.shieldActive = true; // survive without ram-killing recruits
    tick(world, input, FIXED_DT);
    for (const e of world.events) {
      if (e.type === "assembly") {
        sawAssembly = true;
        kindsSeen.add(e.kind);
      }
      if (e.type === "assemblyBurst") sawBurst = true;
    }
    world.events.length = 0;
    if (world.assemblies.length > 0) {
      const asm = world.assemblies[0];
      if (asm.members.every((m) => m.assembly === asm)) sawMembers = true;
      if (asm.phase === "active" && asm.speed > 0) sawActive = true;
    }
  }
  check("evolutions form within 4 minutes", sawAssembly);
  check("evolution members carry their assembly ref", sawMembers);
  check("evolutions reach the active phase", sawActive);
  check("lances/wheels/bombs burst back into drones", sawBurst);
  check("multiple evolution kinds appear", kindsSeen.size >= 2, [...kindsSeen].join(","));
  // death disbands everything (checked directly on the running world)
  if (world.assemblies.length === 0) {
    // force one more so the disband path is actually exercised
    world.assemblyTimer = 0;
    for (let i = 0; i < Math.round(30 / FIXED_DT) && world.assemblies.length === 0; i++) {
      world.powers.shieldActive = true;
      tick(world, input, FIXED_DT);
      world.events.length = 0;
    }
  }
  world.phase = "dying";
  tick(world, input, FIXED_DT);
  const freed = world.drones.every((d) => !d.assembly);
  check("death disbands all evolutions", world.assemblies.length === 0 && freed);
}

// --- 6g. Training Ground: capped trickle, no formations/assemblies/mines ---
{
  const world = createWorld(17.8, 10, false, 0, "classic", false, true);
  check("training opens with a small burst", world.drones.length === TRAINING.initialBurst, `${world.drones.length}`);
  let sawFormation = false;
  let maxDrones = world.drones.length;
  const steps = Math.round(120 / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    world.powers.shieldActive = true; // survive without killing the class
    tick(world, input, FIXED_DT);
    for (const e of world.events) {
      if (e.type === "formation" || e.type === "assembly") sawFormation = true;
    }
    world.events.length = 0;
    maxDrones = Math.max(maxDrones, world.drones.length);
  }
  check("training never fires formations or assemblies", !sawFormation);
  check(
    "training drone cap holds",
    maxDrones <= TRAINING.maxDrones + 2, // telegraphs in flight can overshoot a hair
    `max ${maxDrones}`,
  );
  check("training spawns no mines", world.mines.length === 0);
  check("training still deals pickups", world.pickups.length > 0 || world.pickupTimer < 99);
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
    const world = createWorld(17.8, 10, false, 0, "classic", true); // a real daily run
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

      // event-sourced, not scanned from world.pickups after the fact: a
      // pickup that spawns and gets instantly self-collected by one of these
      // synthetic bots in the same tick (a quirk of the bot, not a real
      // player) would otherwise silently drop out of the recorded script
      for (const e of world.events) {
        if (e.type === "formation") script.formations.push(`${world.time.toFixed(2)}:${e.kind}`);
        if (e.type === "pickupSpawn") {
          script.powers.push(
            `${world.time.toFixed(2)}:${e.power}@${e.x.toFixed(2)},${e.y.toFixed(2)}`,
          );
        }
      }
      world.events.length = 0;
      // mines never miss on dailies: log each with its position, then clear
      // (chain explosions from powers would otherwise diverge the field)
      for (const m of world.mines) {
        script.mines.push(`${world.time.toFixed(2)}:${m.x.toFixed(2)},${m.y.toFixed(2)}`);
      }
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
    "daily seed: power drops (kind + position) identical across play styles",
    a.powers.length > 5 && a.powers.join("|") === b.powers.join("|"),
    `${a.powers.length} drops`,
  );
  check(
    "daily seed: mine schedule (time + position) identical across play styles",
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

// --- 9. Daily Mutators: determinism, day-to-day variety, pool playability ---
{
  interface Script {
    formations: string[];
    powers: string[];
    mines: string[];
    meteors: string[];
    assemblies: string[];
    surges: string[];
    ambient: string[];
    blackouts: string[];
  }

  /** Same shape as the section-7 daily determinism recorder, but with a set
   * of mutators active for the run (main.ts calls setActiveMutators before
   * createWorld the same way for a real Daily Patrol launch). */
  const recordMutated = (mutators: Mutator[], style: "ram" | "drift", date: Date): Script => {
    setRunSeed(1234567);
    setActiveMutators(mutators, date);
    const scale = mutatorViewScale();
    const world = createWorld(17.8 * scale, 10 * scale, false, 0, "classic", true);
    const script: Script = { formations: [], powers: [], mines: [], meteors: [], assemblies: [], surges: [], ambient: [], blackouts: [] };
    let t = 0;
    const steps = Math.round(180 / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      t += FIXED_DT;
      let drive = { x: 0, y: 0 };
      if (style === "ram") {
        world.powers.starshellTimer = 9999;
      } else {
        world.powers.shieldActive = true;
        drive = { x: Math.cos(t * 0.7), y: Math.sin(t * 0.7) };
      }
      tick(world, { ...input, inertia: false, moveVector: drive }, FIXED_DT);

      // event-sourced (see the section-7 recorder above for why).
      for (const e of world.events) {
        if (e.type === "formation") script.formations.push(`${world.time.toFixed(2)}:${e.kind}`);
        if (e.type === "pickupSpawn") {
          script.powers.push(
            `${world.time.toFixed(2)}:${e.power}@${e.x.toFixed(2)},${e.y.toFixed(2)}`,
          );
        }
        // STARFALL: the meteor rain's impact script (rides schedule + placement
        // streams only, see starfall.ts), independent of the ship/drones.
        if (e.type === "meteorStrike") {
          script.meteors.push(`${world.time.toFixed(2)}:${e.x.toFixed(2)},${e.y.toFixed(2)}`);
        }
        // Round 5 creature days: direct-spawn assembly anchors/headings ride
        // the seeded streams (see creatures.ts), so this is now a shared
        // script too, unlike conscription's player-dependent member picks.
        if (e.type === "assembly") {
          script.assemblies.push(`${world.time.toFixed(2)}:${e.kind}@${e.x.toFixed(2)},${e.y.toFixed(2)}`);
        }
        if (e.type === "floodSurge") {
          script.surges.push(`${world.time.toFixed(2)}:${e.x.toFixed(2)},${e.y.toFixed(2)}`);
        }
        if (e.type === "lightsOut") {
          script.blackouts.push(
            e.phase === "dark"
              ? `${world.time.toFixed(2)}:dark:${e.duration.toFixed(2)}`
              : `${world.time.toFixed(2)}:${e.phase}`,
          );
        }
        if (e.type === "ambientSpawn") {
          script.ambient.push(`${world.time.toFixed(2)}:${e.x.toFixed(2)},${e.y.toFixed(2)}`);
        }
      }
      world.events.length = 0;
      for (const m of world.mines) {
        script.mines.push(`${world.time.toFixed(2)}:${m.x.toFixed(2)},${m.y.toFixed(2)}`);
      }
      world.mines.length = 0;
    }
    setRunSeed(null);
    clearActiveMutators();
    return script;
  };

  // (a) same mutated day, two very different play styles -> identical script
  // (post launch-gate: MUTATORS_START_DATE is 2026-08-11, see section (g)
  // below; picked a non-creature, non-flood day since this check expects the
  // normal formation cadence. 2026-08-13 is THE FLOOD, which now has none.)
  const dayA = new Date("2026-08-14T00:00:00Z"); // SINGULARITY, not a Sunday
  const mutatorsA = getMutatorsForDate(dayA);
  const namesA = mutatorsA.map((m) => m.name).join("+");
  const a1 = recordMutated(mutatorsA, "ram", dayA);
  const a2 = recordMutated(mutatorsA, "drift", dayA);
  check(
    `mutated day (${namesA}) determinism: formations match across play styles`,
    a1.formations.length > 3 && a1.formations.join("|") === a2.formations.join("|"),
    `${a1.formations.length} formations`,
  );
  check(
    `mutated day (${namesA}) determinism: power drops match across play styles`,
    a1.powers.join("|") === a2.powers.join("|"),
    `${a1.powers.length} drops`,
  );
  check(
    `mutated day (${namesA}) determinism: mine schedule matches across play styles`,
    a1.mines.join("|") === a2.mines.join("|"),
    `${a1.mines.length} mines`,
  );

  // (b) two different days pick different mutators, and their scripts diverge
  let dayB = dayA;
  let mutatorsB = mutatorsA;
  for (let i = 1; i <= 30; i++) {
    const candidate = new Date(dayA.getTime() + i * MS_PER_DAY);
    const candidateMutators = getMutatorsForDate(candidate);
    if (candidateMutators.map((m) => m.id).join(",") !== mutatorsA.map((m) => m.id).join(",")) {
      dayB = candidate;
      mutatorsB = candidateMutators;
      break;
    }
  }
  check(
    "a different mutator turns up within 30 days (no permanent stuck day)",
    mutatorsB.map((m) => m.id).join(",") !== mutatorsA.map((m) => m.id).join(","),
    `${namesA} (day A) vs ${mutatorsB.map((m) => m.name).join("+")} (day B, +${Math.round((dayB.getTime() - dayA.getTime()) / MS_PER_DAY)}d)`,
  );
  const b1 = recordMutated(mutatorsB, "ram", dayB);
  check(
    "two days with different mutators produce different scripts",
    a1.formations.join("|") !== b1.formations.join("|") || a1.powers.join("|") !== b1.powers.join("|"),
  );

  // (c) every mutator in the pool boots and survives a sim run cleanly
  let crashedMutator: string | null = null;
  const deadArena: string[] = [];
  for (const m of MUTATOR_POOL) {
    setActiveMutators([m], dayA);
    const scale = mutatorViewScale();
    try {
      const world = createWorld(17.8 * scale, 10 * scale, false, 0, "classic", true);
      step(world, 60);
      if (!Number.isFinite(world.score) || !Number.isFinite(world.time)) {
        crashedMutator = `${m.id}: non-finite score/time`;
        break;
      }
      // the stationary observer ram-kills anything that reaches it, so a
      // healthy arena always spawns/kills something over a full minute
      const spawned = world.kills + world.drones.length;
      if (spawned === 0) deadArena.push(m.id);
    } catch (e) {
      crashedMutator = `${m.id}: ${e}`;
      break;
    } finally {
      clearActiveMutators();
    }
  }
  check(
    `all ${MUTATOR_POOL.length} pool mutators boot + survive 60s (no crash, no NaN)`,
    crashedMutator === null,
    crashedMutator ?? "",
  );
  check("no mutator produces a zero-spawn dead arena", deadArena.length === 0, deadArena.join(","));

  // (d) STARFALL: the meteor rain script (timing + impact position) rides
  // the seeded schedule/placement streams only, so it must be byte-identical
  // across play styles, same as formations/powers/mines above.
  {
    const starfallDate = new Date("2026-08-16T00:00:00Z"); // arbitrary, not a Sunday
    const starfall = getMutatorById("starfall")!;
    const s1 = recordMutated([starfall], "ram", starfallDate);
    const s2 = recordMutated([starfall], "drift", starfallDate);
    check(
      "STARFALL determinism: meteor impact script identical across play styles",
      s1.meteors.length > 5 && s1.meteors.join("|") === s2.meteors.join("|"),
      `${s1.meteors.length} impacts`,
    );
    // sanity: the rain ramps up (later gaps between impacts are tighter)
    const times = s1.meteors.map((e) => Number(e.split(":")[0]));
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const earlyGap = gaps.slice(0, Math.max(1, Math.floor(gaps.length * 0.3))).reduce((a, b) => a + b, 0) /
      Math.max(1, Math.floor(gaps.length * 0.3));
    const lateGap = gaps.slice(-Math.max(1, Math.floor(gaps.length * 0.3))).reduce((a, b) => a + b, 0) /
      Math.max(1, Math.floor(gaps.length * 0.3));
    check(
      "STARFALL: cadence ramps up over the run (later gaps tighter than early gaps)",
      gaps.length > 5 && lateGap < earlyGap,
      `early ~${earlyGap.toFixed(2)}s vs late ~${lateGap.toFixed(2)}s`,
    );
  }

  // (e) forced-formation days go to true zero ambient. Forced-creature days
  // (round 5) now direct-spawn choreographed assemblies instead of
  // conscripting the ambient swarm (see creatures.ts), so they go to true
  // zero ambient AND near-zero ordinary formations too: the choreography
  // is the whole day. See section (f) below for the choreography-specific
  // determinism/shape checks.
  {
    function countEvents(
      mutators: Mutator[],
      seconds: number,
    ): { ambientSpawns: number; assemblies: number; formations: number } {
      setActiveMutators(mutators, dayA);
      const scale = mutatorViewScale();
      const world = createWorld(17.8 * scale, 10 * scale, false, 0, "classic", true);
      let ambientSpawns = 0;
      let assemblies = 0;
      let formations = 0;
      const steps = Math.round(seconds / FIXED_DT);
      for (let i = 0; i < steps; i++) {
        world.powers.shieldActive = true; // survive without ram-killing conscripts
        tick(world, input, FIXED_DT);
        for (const e of world.events) {
          if (e.type === "ambientSpawn") ambientSpawns++;
          if (e.type === "assembly") assemblies++;
          if (e.type === "formation") formations++;
        }
        world.events.length = 0;
      }
      clearActiveMutators();
      return { ambientSpawns, assemblies, formations };
    }

    const greatWall = getMutatorById("great-wall")!;
    const serpent = getMutatorById("year-of-the-serpent")!;

    // The opening must not sit empty: the very first formation has to land
    // fast (firstFormationDelayCap) AND resolve to a real kind, not fizzle
    // on an empty weight pool (wall/serpent's own minMinutes ramp-gate would
    // otherwise still be closed this early; see rollFormationKind's bypass
    // for a mutator-forced weight table).
    function firstFormationLanding(m: Mutator): { time: number; kind: string | null } {
      setActiveMutators([m], dayA);
      const scale = mutatorViewScale();
      const world = createWorld(17.8 * scale, 10 * scale, false, 0, "classic", true);
      const steps = Math.round(20 / FIXED_DT);
      for (let i = 0; i < steps; i++) {
        tick(world, input, FIXED_DT);
        for (const e of world.events) {
          if (e.type === "formation") {
            clearActiveMutators();
            return { time: world.time, kind: e.kind };
          }
        }
        world.events.length = 0;
      }
      clearActiveMutators();
      return { time: -1, kind: null };
    }
    const gwOpening = firstFormationLanding(greatWall);
    const serpentOpening = firstFormationLanding(serpent);
    check(
      "GREAT WALL: opening formation lands fast and resolves (no empty-pool fizzle)",
      gwOpening.kind !== null && gwOpening.time <= 5,
      `${gwOpening.kind ?? "none"} @ t=${gwOpening.time.toFixed(2)}`,
    );
    check(
      "YEAR OF THE SERPENT: opening formation lands fast and resolves (no empty-pool fizzle)",
      serpentOpening.kind === "serpent" && serpentOpening.time <= 5,
      `${serpentOpening.kind ?? "none"} @ t=${serpentOpening.time.toFixed(2)}`,
    );

    const gwStats = countEvents([greatWall], 90);
    const serpentStats = countEvents([serpent], 90);
    check(
      "GREAT WALL: zero ambient spawn events over a 90s run",
      gwStats.ambientSpawns === 0,
      `${gwStats.ambientSpawns} ambient spawns`,
    );
    check(
      "YEAR OF THE SERPENT: zero ambient spawn events over a 90s run",
      serpentStats.ambientSpawns === 0,
      `${serpentStats.ambientSpawns} ambient spawns`,
    );

    const creatureIds = ["lancer-doctrine", "wheelhouse", "hunting-party", "demolition-day"];
    const creatureResults = creatureIds.map((id) => ({
      id,
      ...countEvents([getMutatorById(id)!], 120),
    }));
    check(
      "forced-creature days: direct-spawn choreography produces plenty of assemblies",
      creatureResults.every((r) => r.assemblies > 0),
      creatureResults.map((r) => `${r.id}:${r.assemblies} assemblies`).join(", "),
    );
    check(
      "forced-creature days: zero ambient spawn events over a 120s run (round 5, no more conscription fuel)",
      creatureResults.every((r) => r.ambientSpawns === 0),
      creatureResults.map((r) => `${r.id}:${r.ambientSpawns} spawns`).join(", "),
    );
    check(
      "forced-creature days: ordinary formations near-zero (choreography is the whole day)",
      creatureResults.every((r) => r.formations <= 1),
      creatureResults.map((r) => `${r.id}:${r.formations} formations`).join(", "),
    );

    // Sunday pairing edge case: GREAT WALL (different exclusion tag from the
    // forced-creature days) can legally pair with one of them. Round 5
    // removed conscription's need for an ambient floor, so both sides now
    // want zero, so the simplified multiplicative rule should resolve to a
    // sane, finite, non-negative value (not NaN, not negative) regardless.
    const lancer = getMutatorById("lancer-doctrine")!;
    setActiveMutators([greatWall, lancer], dayA);
    const pairedRate = mutatorAmbientRateScale();
    clearActiveMutators();
    check(
      "Sunday pairing: zero-ambient formation day + creature day resolves to a sane rate",
      Number.isFinite(pairedRate) && pairedRate === 0,
      `resolved ${pairedRate} (formation day wants 0, creature day wants ${lancer.overrides.ambientRateScale})`,
    );

    // the combine rule stays multiplicative everywhere (RED ALERT x ARSENAL
    // both wanting more ambient should stack).
    const redAlert = getMutatorById("red-alert")!;
    const arsenal = getMutatorById("arsenal")!;
    setActiveMutators([redAlert, arsenal], dayA);
    const stackedRate = mutatorAmbientRateScale();
    clearActiveMutators();
    const expectedStacked = (redAlert.overrides.ambientRateScale ?? 1) * (arsenal.overrides.ambientRateScale ?? 1);
    check(
      "ambient rate combine stays multiplicative",
      Math.abs(stackedRate - expectedStacked) < 1e-9,
      `${stackedRate.toFixed(3)} vs expected ${expectedStacked.toFixed(3)}`,
    );
  }

  // (f) round 5: creature-day choreography determinism + shape checks. Event
    // timing/anchors/headings ride the seeded streams (see creatures.ts), so,
    // unlike the old conscription system, these scripts must now be
    // byte-identical across play styles, same discipline as formations/STARFALL.
  {
    const creatureMutatorIds: Array<{ id: string; label: string }> = [
      { id: "hunting-party", label: "wolf packs" },
      { id: "lancer-doctrine", label: "broadsides" },
      { id: "wheelhouse", label: "crossing traffic" },
      { id: "demolition-day", label: "area denial" },
    ];
    const creatureDate = new Date("2026-08-17T00:00:00Z"); // arbitrary, not a Sunday
    const summaries: string[] = [];
    for (const { id, label } of creatureMutatorIds) {
      const m = getMutatorById(id)!;
      const c1 = recordMutated([m], "ram", creatureDate);
      const c2 = recordMutated([m], "drift", creatureDate);
      check(
        `${m.name} determinism: choreography script (event time/kind/anchor) identical across play styles`,
        c1.assemblies.length > 3 && c1.assemblies.join("|") === c2.assemblies.join("|"),
        `${c1.assemblies.length} events`,
      );
      summaries.push(`${m.name} (${label}): ${c1.assemblies.length} events`);
    }
    console.log(`  creature-day choreography counts (180s run): ${summaries.join(" | ")}`);
  }

  // (f2) MENAGERIE: mixed-kind direct-spawn choreography (round-5-launch-day
  // fix; Lucas's playtest on the old conscription-based version: "the
  // beginning is just drones as usual"). Same determinism discipline as the
  // four single-kind days above, plus its own two checks: kind variety (a
  // run must actually show several different creatures, not read like a
  // single-kind day) and a fast-but-deliberate first landing (the reveal
  // beat from firstCreatureDelayRange, see mutators.ts/creatures.ts).
  {
    const menagerie = getMutatorById("menagerie")!;
    const menagerieDate = new Date("2026-08-18T00:00:00Z"); // arbitrary, not a Sunday
    const g1 = recordMutated([menagerie], "ram", menagerieDate);
    const g2 = recordMutated([menagerie], "drift", menagerieDate);
    check(
      "MENAGERIE determinism: choreography script (event time/kind/anchor) identical across play styles",
      g1.assemblies.length > 3 && g1.assemblies.join("|") === g2.assemblies.join("|"),
      `${g1.assemblies.length} events`,
    );

    const kinds = g1.assemblies.map((e) => e.split(":")[1].split("@")[0]);
    const distinctKinds = new Set(kinds);
    check(
      "MENAGERIE: a run shows at least 3 distinct creature kinds (the zoo, not one animal)",
      distinctKinds.size >= 3,
      `saw ${[...distinctKinds].join(", ")} across ${kinds.length} events`,
    );

    let hasRepeat = false;
    for (let i = 1; i < kinds.length; i++) {
      if (kinds[i] === kinds[i - 1]) hasRepeat = true;
    }
    check(
      "MENAGERIE: no two consecutive events repeat the same kind",
      !hasRepeat,
      hasRepeat ? "found a back-to-back repeat" : "no back-to-back repeats",
    );

    const firstTime = g1.assemblies.length > 0 ? Number(g1.assemblies[0].split(":")[0]) : -1;
    check(
      "MENAGERIE: the first creature lands fast (the screenshot moment), not an empty-screen wait",
      firstTime >= 7 && firstTime <= 14,
      `first creature at t=${firstTime.toFixed(2)}`,
    );

    console.log(
      `  MENAGERIE choreography (180s run): ${kinds.length} events, kinds seen: ${[...distinctKinds].join(", ")}, first @ t=${firstTime.toFixed(2)}`,
    );

    // Density regression guard (2026-08-10 live tuning fix: "a minute in,
    // still not a lot of enemies", a screenshot showing one lone creature in
    // mostly empty space). Tracks concurrent creatures (world.assemblies) on
    // an invulnerable observer run, same fixed seed/date as the determinism
    // check above, so this is a durable, non-flaky guard against the day
    // going sparse again. Lucas's ballpark: 2+ creatures live/forming by
    // t=60, climbing from there.
    setRunSeed(1234567);
    setActiveMutators([menagerie], menagerieDate);
    const scale = mutatorViewScale();
    const densityWorld = createWorld(17.8 * scale, 10 * scale, false, 0, "classic", true);
    let maxAssembliesBy60 = 0;
    let maxAssembliesBy120 = 0;
    const densitySteps = Math.round(120 / FIXED_DT);
    for (let i = 0; i < densitySteps; i++) {
      densityWorld.powers.shieldActive = true; // invulnerable observer: measures density, not survival
      tick(densityWorld, { ...input, inertia: false, moveVector: { x: 0, y: 0 } }, FIXED_DT);
      densityWorld.events.length = 0;
      if (densityWorld.time <= 60) maxAssembliesBy60 = Math.max(maxAssembliesBy60, densityWorld.assemblies.length);
      maxAssembliesBy120 = Math.max(maxAssembliesBy120, densityWorld.assemblies.length);
    }
    clearActiveMutators();
    check(
      "MENAGERIE: at least 2 creatures live/forming at once within the first 60s (density guard)",
      maxAssembliesBy60 >= 2,
      `peaked at ${maxAssembliesBy60} concurrent by t=60`,
    );
    check(
      "MENAGERIE: concurrent creature count climbs by t=120 vs the first 60s",
      maxAssembliesBy120 >= maxAssembliesBy60,
      `peaked at ${maxAssembliesBy120} concurrent by t=120 (vs ${maxAssembliesBy60} by t=60)`,
    );
  }

  // (g) launch-date gate: a pre-gate UTC date yields no mutators at all
  // (vanilla daily), a post-gate date resolves the normal hash pick. The
  // gate only suppresses, so the post-gate date's pick must match what the
  // same date would have resolved to without a gate (i.e. it isn't shifted).
  {
    const gateOpenMs = Date.parse(`${MUTATORS_START_DATE}T00:00:00Z`);
    const preGateDate = new Date(gateOpenMs - MS_PER_DAY); // the day before the gate opens
    const postGateDate = new Date(gateOpenMs); // the gate date itself
    const preGatePick = getMutatorsForDate(preGateDate);
    const postGatePick = getMutatorsForDate(postGateDate);
    check(
      "launch gate: a pre-gate UTC date yields no mutators",
      preGatePick.length === 0,
      `${preGatePick.length} mutator(s) picked`,
    );
    check(
      "launch gate: the gate date itself yields the expected hash pick",
      postGatePick.length > 0,
      `${postGatePick.map((m) => m.id).join("+") || "(none)"}`,
    );
    // Regression: MUTATORS_START_DATE moved from 2026-08-11 to 2026-08-10
    // (Lucas, round 2 of launch). The gate only ever suppresses, so 08-11's
    // pick must be the same iron-barrage it always was, not shifted by the
    // gate date moving underneath it.
    const aug11Pick = getMutatorsForDate(new Date("2026-08-11T00:00:00Z"));
    check(
      "launch gate move: 2026-08-11 still resolves to iron-barrage (unshifted)",
      aug11Pick.length === 1 && aug11Pick[0].id === "iron-barrage",
      `${aug11Pick.map((m) => m.id).join("+") || "(none)"}`,
    );
  }

  // medal SCORE thresholds stay sane (positive, ordered, 5k-rounded) across a sample week
  let badThresholds: string | null = null;
  for (let i = 0; i < 7; i++) {
    const date = new Date(dayA.getTime() + i * MS_PER_DAY);
    const t = medalThresholdsForDate(date);
    const sane =
      t.copper > 0 &&
      t.copper < t.silver &&
      t.silver < t.gold &&
      t.copper % 5000 === 0 &&
      t.silver % 5000 === 0 &&
      t.gold % 5000 === 0;
    if (!sane) {
      badThresholds = `${date.toISOString().slice(0, 10)}: ${JSON.stringify(t)}`;
      break;
    }
  }
  check(
    "medal score thresholds ordered/positive/5k-rounded across a sample week",
    badThresholds === null,
    badThresholds ?? "",
  );
}

// --- 10. Daily Mutators: evasive-bot playability (can you actually dodge?) ---
//
// Round 1's playability check used an invulnerable starshell observer, which
// answers "does the arena spawn/kill sanely" but not "can a pilot who
// actually has to dodge survive it". This harness flies a simple repulsion
// dodger (steer away from the nearest drones/mines, no powers, no offense:
// a deliberately pessimistic lower bound) and measures real survival time.
//
// Each trial runs on its OWN fixed seed (TRIAL_SEEDS below) instead of on
// Math.random: the bot still faces TRIALS different run scripts, so a median
// still measures playability across varied days, but it faces the SAME
// TRIALS scripts every time, so the medians are reproducible run to run.
// Both bot harnesses (here and the section-11 survival guard) used to be
// fully unseeded and their medians swung hard between sim-test runs
// (WHEELHOUSE 188s on one run, 125s on the next, see JOURNAL.md 2026-08-12),
// which made any bar near its threshold flap and let a real regression hide
// behind "probably the flaky one".
/**
 * Steer away from every nearby drone/mine, weighted by inverse-square distance.
 * Shared by the section-10 playability harness and the section-11 late-growth
 * survival guard (same pilot model, different cap and shield support).
 */
function evasiveHeading(world: World): { x: number; y: number } {
  let fx = 0;
  let fy = 0;
  const ship = world.ship;
  for (const d of world.drones) {
    if (!d.alive) continue;
    const dx = ship.x - d.x;
    const dy = ship.y - d.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > 36) continue; // only threats within 6 units matter
    const dist = Math.sqrt(distSq) || 0.05;
    const w = 1 / (distSq + 0.2);
    fx += (dx / dist) * w;
    fy += (dy / dist) * w;
  }
  for (const m of world.mines) {
    if (!m.alive) continue;
    const dx = ship.x - m.x;
    const dy = ship.y - m.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > 16) continue;
    const dist = Math.sqrt(distSq) || 0.05;
    const w = 1.5 / (distSq + 0.2);
    fx += (dx / dist) * w;
    fy += (dy / dist) * w;
  }
  // STARFALL only: the ground reticle is visible telegraphed warning, so a
  // real pilot dodges it too (empty on every other mutator, no effect there).
  for (const t of world.meteorTelegraphs) {
    const dx = ship.x - t.x;
    const dy = ship.y - t.y;
    const distSq = dx * dx + dy * dy;
    const avoidR = t.radius + 1.5;
    if (distSq > avoidR * avoidR) continue;
    const dist = Math.sqrt(distSq) || 0.05;
    const urgency = clamp01(1 - t.timer / t.duration); // scarier as impact nears
    const w = (1 + urgency * 3) / (distSq + 0.2);
    fx += (dx / dist) * w;
    fy += (dy / dist) * w;
  }
  const len = Math.hypot(fx, fy);
  if (len < 0.0001) return { x: 0, y: 0 };
  return { x: fx / len, y: fy / len };
}

/**
 * One fixed seed per bot trial, shared by both bot harnesses: varied run
 * scripts, reproducible results (see the section-10 header comment).
 */
const TRIAL_SEEDS = [11, 2027, 30313, 404_041, 5_050_505, 61, 707_071, 8081, 909_091, 1_010_101];

{
  const CAP_SECONDS = 90;
  const TRIALS = 10;
  const evasiveDate = new Date("2026-08-10T00:00:00Z");

  function runEvasiveTrial(mutators: Mutator[], seed: number): { time: number; score: number } {
    setRunSeed(seed);
    setActiveMutators(mutators, evasiveDate);
    const scale = mutatorViewScale();
    const world = createWorld(17.8 * scale, 10 * scale, false, 0, "classic", true);
    const evasiveInput: InputState = {
      turn: 0,
      thrust: 0,
      heading: null,
      moveVector: { x: 0, y: 0 },
      inertia: false,
      cruiseSpeed: 8,
    };
    const steps = Math.round(CAP_SECONDS / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      if (world.phase !== "playing") break;
      evasiveInput.moveVector = evasiveHeading(world);
      tick(world, evasiveInput, FIXED_DT);
      world.events.length = 0;
    }
    clearActiveMutators();
    setRunSeed(null);
    return { time: Math.min(world.time, CAP_SECONDS), score: world.score };
  }

  function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  const baselineTrials = TRIAL_SEEDS.slice(0, TRIALS).map((seed) => runEvasiveTrial([], seed));
  const baselineMedian = median(baselineTrials.map((r) => r.time));
  const baselineScoreMedian = median(baselineTrials.map((r) => r.score));
  check(
    "evasive bot: baseline (no mutator) survives a sane median time",
    // Harness sanity only (a broken bot dies in ~2s); the observed median
    // hovers around 12s with real variance, so the bar sits well below it.
    baselineMedian >= 8,
    `median ${baselineMedian.toFixed(1)}s over ${TRIALS} trials`,
  );

  // Every mutator gets the same bar: a dodging pilot with no powers must
  // clear either an absolute floor or a fraction of the baseline median,
  // whichever is more lenient, since a genuinely harder day is allowed to
  // cut survival somewhat, it just can't be an instant-death trap. Score
  // medians are also collected here (dodge-only, so a rough LOWER bound on
  // real scoring opportunity) to calibrate each mutator's medal difficulty
  // factor for SCORE — see mutators.ts and JOURNAL.md round 3.
  const FLOOR_SECONDS = 10;
  const FLOOR_FRACTION = 0.4;
  const results: { id: string; name: string; median: number; medianScore: number }[] = [];
  for (const m of MUTATOR_POOL) {
    const trials = TRIAL_SEEDS.slice(0, TRIALS).map((seed) => runEvasiveTrial([m], seed));
    results.push({
      id: m.id,
      name: m.name,
      median: median(trials.map((r) => r.time)),
      medianScore: median(trials.map((r) => r.score)),
    });
  }
  const bar = Math.min(FLOOR_SECONDS, baselineMedian * FLOOR_FRACTION);
  const tooLethal = results.filter((r) => r.median < bar);
  check(
    `evasive bot: every mutator clears the playability bar (>=${bar.toFixed(1)}s median)`,
    tooLethal.length === 0,
    tooLethal.map((r) => `${r.name} ${r.median.toFixed(1)}s`).join(", "),
  );
  console.log(
    `  evasive-bot baseline: ${baselineMedian.toFixed(1)}s / ${Math.round(baselineScoreMedian)}pts median\n` +
      "  evasive-bot medians: " +
      results
        .map((r) => `${r.name} ${r.median.toFixed(1)}s/${Math.round(r.medianScore)}pts`)
        .join(" | "),
  );

  // Named call-outs from Sam's brief: BLACKOUT, THE FLOOD, and (round 3) STARFALL.
  const blackout = results.find((r) => r.id === "blackout");
  const flood = results.find((r) => r.id === "the-flood");
  const starfallResult = results.find((r) => r.id === "starfall");
  check(
    "evasive bot: BLACKOUT is a fair fight, not a surprise-death trap",
    !!blackout && blackout.median >= bar,
    `${blackout?.median.toFixed(1)}s vs baseline ${baselineMedian.toFixed(1)}s`,
  );
  check(
    "evasive bot: THE FLOOD is navigable (a flood, not instant death)",
    !!flood && flood.median >= bar,
    `${flood?.median.toFixed(1)}s vs baseline ${baselineMedian.toFixed(1)}s`,
  );
  // STARFALL is already covered by the pool-wide bar above (tooLethal); this
  // named call-out reports the actual number for the round-3 playability
  // write-up (the bot only steers away from telegraphed reticles, no
  // reflexes beyond that, so it's a rough proxy for a pilot who reads the
  // warning and dodges it).
  check(
    "evasive bot: STARFALL is navigable for a reticle-aware dodge bot",
    !!starfallResult && starfallResult.median >= bar,
    `${starfallResult?.median.toFixed(1)}s / ${Math.round(starfallResult?.medianScore ?? 0)}pts` +
      ` vs baseline ${baselineMedian.toFixed(1)}s / ${Math.round(baselineScoreMedian)}pts`,
  );
  // Round 5: the four creature days rebuilt around direct-spawn choreography
  // (see creatures.ts) need the same fair-fight bar re-checked, since the
  // whole spawn pattern changed. The bot only reacts once drones/telegraphs
  // are close enough to matter (no lookahead into the schedule), so this is
  // a pessimistic proxy, same as STARFALL's reticle-dodge above.
  for (const id of ["hunting-party", "lancer-doctrine", "wheelhouse", "demolition-day", "menagerie"]) {
    const r = results.find((x) => x.id === id);
    check(
      `evasive bot: ${r?.name ?? id} choreography is a fair fight, not a surprise-death trap`,
      !!r && r.median >= bar,
      `${r?.median.toFixed(1)}s / ${Math.round(r?.medianScore ?? 0)}pts vs baseline ${baselineMedian.toFixed(1)}s / ${Math.round(baselineScoreMedian)}pts`,
    );
  }
  // sanity: getMutatorById resolves every id used above (catches stale ids)
  check(
    "getMutatorById resolves every pool id",
    MUTATOR_POOL.every((m) => getMutatorById(m.id)?.id === m.id),
  );
}

// --- 10b. THE FLOOD v5: formations gone, metronome pops, opening flooded ---
{
  const flood = getMutatorById("the-flood")!;
  const floodDate = new Date("2026-08-28T00:00:00Z");

  const recordFlood = (style: "ram" | "drift"): { formations: string[]; surges: string[]; ambient: string[] } => {
    setRunSeed(1234567);
    setActiveMutators([flood], floodDate);
    const world = createWorld(17.8, 10, false, 0, "classic", true);
    const script = { formations: [] as string[], surges: [] as string[], ambient: [] as string[] };
    let t = 0;
    const steps = Math.round(180 / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      t += FIXED_DT;
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
        if (e.type === "floodSurge") script.surges.push(`${world.time.toFixed(2)}:${e.x.toFixed(2)},${e.y.toFixed(2)}`);
        if (e.type === "ambientSpawn") script.ambient.push(`${world.time.toFixed(2)}:${e.x.toFixed(2)},${e.y.toFixed(2)}`);
      }
      world.events.length = 0;
    }
    setRunSeed(null);
    clearActiveMutators();
    return script;
  };

  const ram = recordFlood("ram");
  const drift = recordFlood("drift");
  check("THE FLOOD formations are gone (3 min ram)", ram.formations.length === 0, `${ram.formations.length} formations`);
  check("THE FLOOD formations are gone (3 min drift)", drift.formations.length === 0);
  check(
    "THE FLOOD pop script matches across play styles",
    ram.surges.length > 0 && ram.surges.join("|") === drift.surges.join("|"),
    `${ram.surges.length} pops`,
  );
  check(
    "THE FLOOD classic ambient is off",
    ram.ambient.length === 0 && drift.ambient.length === 0,
    `${ram.ambient.length}/${drift.ambient.length} ambient`,
  );
  const popTime = (s: string) => Number(s.split(":")[0]);
  const earlyPops = ram.surges.filter((s) => popTime(s) < 60).length;
  const latePops = ram.surges.filter((s) => popTime(s) >= 120).length;
  check(
    "THE FLOOD pop rate is higher late than early",
    latePops > earlyPops,
    `early=${earlyPops} late=${latePops}`,
  );

  setRunSeed(1234567);
  setActiveMutators([flood], floodDate);
  const open = createWorld(17.8, 10, false, 0, "classic", true);
  step(open, 3);
  const opened = open.kills + open.drones.filter((d) => d.alive).length;
  check(
    "THE FLOOD opening is already flooded (t=3s)",
    opened >= 4,
    `${opened} drones spawned/alive`,
  );
  setRunSeed(null);
  clearActiveMutators();

  setRunSeed(1234567);
  setActiveMutators([flood], floodDate);
  const observer = createWorld(17.8, 10, false, 0, "classic", true);
  step(observer, 60);
  const kps = observer.kills / 60;
  check(
    "THE FLOOD invulnerable observer stays under the 20 kills/sec ceiling",
    kps < 20,
    `${kps.toFixed(2)} kills/sec (${observer.kills} kills)`,
  );
  setRunSeed(null);
  clearActiveMutators();
}

// --- 10c. BLACKOUT v4: flicker then a real lights-out, script shared ---
{
  const blackout = getMutatorById("blackout")!;
  const blackoutDate = new Date("2026-08-11T00:00:00Z");

  const recordBlackout = (style: "ram" | "drift"): string[] => {
    setRunSeed(1234567);
    setActiveMutators([blackout], blackoutDate);
    const world = createWorld(17.8, 10, false, 0, "classic", true);
    const script: string[] = [];
    let t = 0;
    const steps = Math.round(200 / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      t += FIXED_DT;
      let drive = { x: 0, y: 0 };
      if (style === "ram") {
        world.powers.starshellTimer = 9999;
      } else {
        world.powers.shieldActive = true;
        drive = { x: Math.cos(t * 0.7), y: Math.sin(t * 0.7) };
      }
      tick(world, { ...input, inertia: false, moveVector: drive }, FIXED_DT);
      for (const e of world.events) {
        if (e.type === "lightsOut") {
          script.push(
            e.phase === "dark"
              ? `${world.time.toFixed(2)}:dark:${e.duration.toFixed(2)}`
              : `${world.time.toFixed(2)}:${e.phase}`,
          );
        }
      }
      world.events.length = 0;
    }
    setRunSeed(null);
    clearActiveMutators();
    return script;
  };

  const ram = recordBlackout("ram");
  const drift = recordBlackout("drift");
  check(
    "BLACKOUT outage script matches across play styles",
    ram.length > 0 && ram.join("|") === drift.join("|"),
    `${ram.length} outages`,
  );
  const firstT = ram[0] ? Number(ram[0].split(":")[0]) : 99;
  check("BLACKOUT first flicker lands inside 8s", firstT < 8, `t=${firstT.toFixed(2)}`);
  check(
    "BLACKOUT script includes flicker and dark",
    ram.some((s) => s.endsWith(":flicker")) && ram.some((s) => s.includes(":dark:")),
    ram.slice(0, 4).join(", "),
  );
  check(
    "BLACKOUT script includes fake flickers",
    ram.some((s) => s.endsWith(":fake")),
    ram.filter((s) => s.endsWith(":fake")).length + " fakes",
  );
  const parseDark = (s: string): { t: number; dur: number } | null => {
    const parts = s.split(":");
    if (parts[1] !== "dark") return null;
    return { t: Number(parts[0]), dur: Number(parts[2]) };
  };
  const darks = ram.map(parseDark).filter((d): d is { t: number; dur: number } => d !== null);
  const earlyDark = darks.find((d) => d.t < 30);
  const lateDark = [...darks].reverse().find((d) => d.t > 170);
  check(
    "BLACKOUT opening dark stays in the 1-2s band",
    !!earlyDark && earlyDark.dur >= 1.15 && earlyDark.dur <= 2.05,
    earlyDark ? `t=${earlyDark.t.toFixed(2)} dur=${earlyDark.dur.toFixed(2)}` : "no early dark",
  );
  check(
    "BLACKOUT late dark has grown to 6s+",
    !!lateDark && lateDark.dur >= 5.5,
    lateDark ? `t=${lateDark.t.toFixed(2)} dur=${lateDark.dur.toFixed(2)}` : "no late dark",
  );
}

// --- 11. late growth: no plateau-farming on the choreographed / zero-ambient days ---
//
// The 2026-08-11 pass: every creature day used to hard-plateau at
// CREATURE_DAYS.rampMinutes (3 min) and the two zero-ambient formation days
// floored out on their formation interval, so a skilled pilot could farm a run
// for 20+ minutes (a WHEELHOUSE 25-minute flight is what triggered this work).
// Two guards below.
//
// (a) Pressure telemetry on a seeded, invulnerable observer: pressure at
// minute 6-8 must be well above minute 3-4 on EVERY day that grows, and
// WHEELHOUSE has to hit Lucas's explicit calibration targets. This is the
// durable guard: it measures the escalation curve directly instead of
// inferring it from a bot's survival.
{
  const lateDate = new Date("2026-08-17T00:00:00Z"); // arbitrary, not a Sunday
  const MINUTES = 8;
  // The mid-ramp (2026-08-12) lives inside the first three minutes, so the
  // minute buckets below are too coarse to see it: they can't tell "calm open,
  // then a hard climb" from "flat and boring for two minutes". These 30-second
  // buckets cover the first HALF_BUCKETS / 2 minutes at the resolution the
  // shape is tuned at.
  const HALF = 30;
  const HALF_BUCKETS = 8;
  // "A drone this close and you must already be moving" — the radius used by
  // the pocket search below. Roughly a second and a half of warning against
  // creature-day traffic in a 17.8 x 10 arena.
  const POCKET_R = 3;

  interface Pressure {
    /** average concurrent creatures per minute bucket (index 0 = minute 0-1) */
    concurrent: number[];
    /** average member count of creatures spawned in each bucket */
    members: number[];
    /** average travel speed of creatures spawned in each bucket */
    speed: number[];
    /** average seconds between consecutive creature arrivals in each bucket */
    gap: number[];
    formations: number[];
    ambient: number[];
    meteors: number[];
    /** scheduled pickup drops per minute bucket (daily runs land every one) */
    pickups: number[];
    /** average concurrent creatures per 30s bucket (index 0 = 0-30s) */
    halfConcurrent: number[];
    /** average seconds between arrivals per 30s bucket */
    halfGap: number[];
    /** creature arrivals per 30s bucket */
    halfArrivals: number[];
    /** LONGEST gap between arrivals in each 30s bucket (the dead air) */
    halfMaxGap: number[];
    /**
     * Felt pressure (2026-08-12 "no chill" pass): mean over the bucket of the
     * longest time the ROOMIEST spot on a coarse arena grid stays clear of
     * drones, looking forward from each sample. In other words, "if the pilot
     * parked in the best available pocket right now, how long could they sit
     * there?" — which is literally what Lucas did when he screenshotted a calm
     * arena at 1:43 while the average-concurrent telemetry said the day was
     * busy. Averages and arrival rates cannot see this; only coverage can.
     */
    halfPocket: number[];
  }

  /** `id === null` measures a plain Daily run (no mutator), the reference. */
  function measurePressure(id: string | null): Pressure {
    setRunSeed(1234567);
    setActiveMutators(id === null ? [] : [getMutatorById(id)!], lateDate);
    const scale = mutatorViewScale();
    const world = createWorld(17.8 * scale, 10 * scale, false, 0, "classic", true);
    const zeros = (): number[] => new Array(MINUTES).fill(0);
    const events = zeros();
    const memberSum = zeros();
    const speedSum = zeros();
    const concurrentSum = zeros();
    const samples = zeros();
    const gapSum = zeros();
    const gapCount = zeros();
    const formations = zeros();
    const ambient = zeros();
    const meteors = zeros();
    const pickups = zeros();
    const halfZeros = (): number[] => new Array(HALF_BUCKETS).fill(0);
    const halfConcurrentSum = halfZeros();
    const halfSamples = halfZeros();
    const halfArrivals = halfZeros();
    const halfGapSum = halfZeros();
    const halfGapCount = halfZeros();
    const halfMaxGap = halfZeros();
    let prevArrival = -1;

    // Pocket search grid (see Pressure.halfPocket). Sampled at POCKET_HZ over
    // the buckets we report on only — an 8-minute full-resolution sweep would
    // dominate the runtime of this whole script for no extra signal.
    const POCKET_HZ = 4;
    const pocketSteps = Math.max(1, Math.round(1 / (POCKET_HZ * FIXED_DT)));
    const pocketDt = pocketSteps * FIXED_DT;
    const pocketWindow = HALF_BUCKETS * HALF;
    const grid: { x: number; y: number }[] = [];
    for (let gi = 0; gi < 11; gi++) {
      for (let gj = 0; gj < 6; gj++) {
        grid.push({
          x: (-0.5 + (gi + 0.5) / 11) * world.viewW,
          y: (-0.5 + (gj + 0.5) / 6) * world.viewH,
        });
      }
    }
    const occupancy: boolean[][] = grid.map(() => []);
    const occupancyTime: number[] = [];

    const steps = Math.round(MINUTES * 60 / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      // invulnerable observer: measures the escalation curve, not survival
      world.powers.shieldActive = true;
      world.powers.starshellTimer = 9999;
      tick(world, { ...input, inertia: false, moveVector: { x: 0, y: 0 } }, FIXED_DT);
      const b = Math.min(MINUTES - 1, Math.floor(world.time / 60));
      const h = Math.floor(world.time / HALF);
      for (const e of world.events) {
        if (e.type === "assembly") {
          const newest = world.assemblies[world.assemblies.length - 1];
          events[b]++;
          memberSum[b] += newest?.members.length ?? 0;
          speedSum[b] += newest?.speed ?? 0;
          if (h < HALF_BUCKETS) halfArrivals[h]++;
          if (prevArrival >= 0) {
            gapSum[b] += world.time - prevArrival;
            gapCount[b]++;
            if (h < HALF_BUCKETS) {
              halfGapSum[h] += world.time - prevArrival;
              halfGapCount[h]++;
              halfMaxGap[h] = Math.max(halfMaxGap[h], world.time - prevArrival);
            }
          }
          prevArrival = world.time;
        }
        if (e.type === "formation") formations[b]++;
        if (e.type === "ambientSpawn") ambient[b]++;
        if (e.type === "meteorStrike") meteors[b]++;
        if (e.type === "pickupSpawn") pickups[b]++;
      }
      world.events.length = 0;
      concurrentSum[b] += world.assemblies.length;
      samples[b]++;
      if (h < HALF_BUCKETS) {
        halfConcurrentSum[h] += world.assemblies.length;
        halfSamples[h]++;
      }
      if (world.time <= pocketWindow && i % pocketSteps === 0) {
        occupancyTime.push(world.time);
        for (let p = 0; p < grid.length; p++) {
          const g = grid[p];
          let occupied = false;
          for (const d of world.drones) {
            if (!d.alive) continue;
            const dx = d.x - g.x;
            const dy = d.y - g.y;
            if (dx * dx + dy * dy <= POCKET_R * POCKET_R) {
              occupied = true;
              break;
            }
          }
          occupancy[p].push(occupied);
        }
      }
    }
    clearActiveMutators();
    setRunSeed(null);

    // Backward pass per grid point: how long that point stays clear from each
    // sample onward; halfPocket takes the most generous spot at each sample.
    const pn = occupancyTime.length;
    const bestDwell = new Array(pn).fill(0);
    for (let p = 0; p < grid.length; p++) {
      const occ = occupancy[p];
      let dwell = 0;
      for (let s = pn - 1; s >= 0; s--) {
        dwell = occ[s] ? 0 : dwell + pocketDt;
        if (dwell > bestDwell[s]) bestDwell[s] = dwell;
      }
    }
    const pocketSum = halfZeros();
    const pocketSamples = halfZeros();
    for (let s = 0; s < pn; s++) {
      const h = Math.floor(occupancyTime[s] / HALF);
      if (h >= HALF_BUCKETS) continue;
      pocketSum[h] += bestDwell[s];
      pocketSamples[h]++;
    }
    return {
      concurrent: concurrentSum.map((s, i) => s / Math.max(1, samples[i])),
      members: memberSum.map((s, i) => s / Math.max(1, events[i])),
      speed: speedSum.map((s, i) => s / Math.max(1, events[i])),
      gap: gapSum.map((s, i) => s / Math.max(1, gapCount[i])),
      formations,
      ambient,
      meteors,
      pickups,
      halfConcurrent: halfConcurrentSum.map((s, i) => s / Math.max(1, halfSamples[i])),
      halfGap: halfGapSum.map((s, i) => s / Math.max(1, halfGapCount[i])),
      halfArrivals,
      halfMaxGap,
      halfPocket: pocketSum.map((s, i) => s / Math.max(1, pocketSamples[i])),
    };
  }

  /** Mean of a [from,to) window of minute buckets. */
  const window = (values: number[], from: number, to: number): number =>
    values.slice(from, to).reduce((a, b) => a + b, 0) / (to - from);

  const creatureDays = ["wheelhouse", "hunting-party", "lancer-doctrine", "demolition-day", "menagerie"];
  const pressures = new Map(creatureDays.map((id) => [id, measurePressure(id)] as const));

  // Tuning aid for the next densify pass: `ORION_FELT_DUMP=1 npx tsx
  // scripts/sim-test.ts` prints the raw 30-second telemetry the bars below are
  // derived from (0-30s, 30-60s, ... 210-240s), which is how the numbers in the
  // calibration tables in this section were measured. Off by default because
  // it is three dense rows per day.
  if (process.env.ORION_FELT_DUMP) {
    const f = (v: number[]): string => v.map((x) => x.toFixed(1).padStart(6)).join("");
    for (const id of creatureDays) {
      const p = pressures.get(id)!;
      console.log(
        `  DUMP ${id}\n    concurrent ${f(p.halfConcurrent)}\n` +
          `    pocket     ${f(p.halfPocket)}\n    maxQuietGap${f(p.halfMaxGap)}`,
      );
    }
  }

  // Shared shape: every creature day keeps escalating past the ramp, and by a
  // comparable factor (they run the same helpers in creatures.ts, only the
  // per-day numbers differ). Pre-pass these ratios were ~1.0 (flat) everywhere.
  const GROWTH_BAR = 1.6;
  const growth = creatureDays.map((id) => {
    const p = pressures.get(id)!;
    return { id, ratio: window(p.concurrent, 5, 8) / Math.max(0.01, window(p.concurrent, 2, 4)) };
  });
  check(
    `creature days: concurrent-creature pressure keeps climbing past the ramp (>=${GROWTH_BAR}x minute 6-8 vs 3-4)`,
    growth.every((g) => g.ratio >= GROWTH_BAR),
    growth.map((g) => `${g.id} ${g.ratio.toFixed(1)}x`).join(", "),
  );

  // Mid-ramp shape (Lucas, 2026-08-12, live WHEELHOUSE: "after 30 secs it
  // needs to ramp up a bit more, people will get bored otherwise"). Two halves
  // that pull against each other on purpose: the opening has to stay readable
  // AND the 0:30-3:00 stretch has to climb hard out of it.
  //
  // The mid-ramp bars are ABSOLUTE, per day, unlike the growth-ratio guard
  // above, because a ratio can't see this bug: the pre-pass curve grew by a
  // perfectly respectable 1.8x from minute 1 to minute 2, it was just doing it
  // from nothing to almost nothing. Each floor sits roughly 20-25% above the
  // pre-pass measurement and 20% below the post-pass one, so the pre-pass
  // curve fails it and normal tuning drift doesn't (avg concurrent creatures,
  // seeded invulnerable observer, `before` = the 2026-08-11 late-growth build):
  //
  //   day               60-120s  before      120-180s  before
  //   wheelhouse        3.0      2.5         4.5       3.3
  //   hunting-party     1.9      1.4         2.5       2.0
  //   lancer-doctrine   3.4      2.7         5.5       4.5
  //   demolition-day    1.0      0.6         1.5       1.0
  //   menagerie         2.1      1.9         2.8       1.8
  //
  // 2026-08-12 (second pass) raised every floor again, measured on the same
  // harness — Lucas screenshotted a calm arena at 1:43 on the build that set
  // the floors above, so those floors were provably too low to mean anything:
  //
  //   day               60-120s  was   shipped     120-180s  was   shipped
  //   wheelhouse        6.6      3.0   (3.9)       7.4       4.5   (5.9)
  //   hunting-party     3.8      1.9   (2.4)       3.9       2.5   (3.4)
  //   lancer-doctrine   6.1      3.4   (4.4)       6.6       5.5   (7.0)
  //   demolition-day    1.6      1.0   (1.3)       1.6       1.5   (1.8)
  //   menagerie         3.0      2.1   (2.6)       3.2       2.8   (3.3)
  {
    const OPENING_CONCURRENT_CEILING = 2.5; // no jump-scare open
    const OPENING_ARRIVAL_CEILING = 8; // creatures materializing in the first 30s
    // ...and the other side of the same coin: the opening must stay ROOMY. A
    // future densify that drags the pocket search below this has eaten the
    // readable opening, whatever the concurrent counts say.
    const OPENING_POCKET_FLOOR = 8;
    const MID_FLOORS: Record<string, readonly [number, number]> = {
      wheelhouse: [6.6, 7.4],
      "hunting-party": [3.8, 3.9],
      "lancer-doctrine": [6.1, 6.6],
      "demolition-day": [1.6, 1.6],
      menagerie: [3.0, 3.2],
    };
    const rows = creatureDays.map((id) => {
      const p = pressures.get(id)!;
      return {
        id,
        // bucket 0 only: this check is named "the first 30s" and used to average
        // the first SIXTY seconds, which put it on a collision course with the
        // mid ramp it is not supposed to police (it read 2.3 against its own
        // 2.5 ceiling purely because 0:30-1:00 got busier, as intended).
        open: p.halfConcurrent[0],
        openArrivals: p.halfArrivals[0],
        openPocket: p.halfPocket[0],
        at60: window(p.halfConcurrent, 2, 4),
        at120: window(p.halfConcurrent, 4, 6),
        floors: MID_FLOORS[id],
      };
    });
    const brutal = rows.filter(
      (r) =>
        r.open > OPENING_CONCURRENT_CEILING ||
        r.openArrivals > OPENING_ARRIVAL_CEILING ||
        r.openPocket < OPENING_POCKET_FLOOR,
    );
    check(
      "creature days: the first 30s stays a readable opening (the screenshot moment)",
      brutal.length === 0,
      rows
        .map((r) => `${r.id} ${r.open.toFixed(1)} concurrent / ${r.openArrivals} arrivals / ${r.openPocket.toFixed(0)}s pocket`)
        .join(", "),
    );
    check(
      "creature days: pressure climbs out of the opening by t=60s (per-day mid-ramp floors)",
      rows.every((r) => r.at60 >= r.floors[0]),
      rows.map((r) => `${r.id} ${r.at60.toFixed(1)} vs floor ${r.floors[0]}`).join(", "),
    );
    check(
      "creature days: and keeps climbing through t=120s (per-day mid-ramp floors)",
      rows.every((r) => r.at120 >= r.floors[1]),
      rows.map((r) => `${r.id} ${r.at120.toFixed(1)} vs floor ${r.floors[1]}`).join(", "),
    );
  }

  // FELT pressure at t=60-120s (2026-08-12 "no chill" pass). The two checks
  // below exist because the ones above passed comfortably on a build where
  // Lucas could still line up a screenshot at 1:43: average concurrent
  // creatures and mean arrival rate are both blind to the two things that
  // actually make a moment feel calm.
  //
  // (a) DEAD AIR. Every day fired its event as a clump and then went silent;
  //     the MEAN arrival gap looked healthy while the LONGEST one was 5-9s.
  // (b) COVERAGE. Crossing traffic can be dense on average and still leave one
  //     roomy corner, and a competent pilot will find it and sit in it. The
  //     pocket search measures that corner directly.
  //
  // Measured at 60-120s on this harness (`shipped` = the build Lucas
  // screenshotted, which every bar below is calibrated to FAIL):
  //
  //   day               longest quiet gap   roomiest pocket
  //   wheelhouse        1.9   (5.6)         1.7   (6.6)
  //   hunting-party     2.4   (9.0)        10.2  (27.8)
  //   lancer-doctrine   3.2   (8.8)         2.2   (7.9)
  //   demolition-day    3.7   (6.2)         4.3   (6.3)
  //   menagerie         3.1   (4.6)         4.6   (6.3)
  {
    const QUIET_GAP_CEILING = 4.2; // seconds of nothing-arriving, anywhere in 60-120s
    // Per-day, because the geometry differs enormously. HUNTING PARTY is the
    // loose one on purpose: its hunters TRACK the ship, so they cluster around
    // the pilot and genuinely do leave the far side of the arena empty — the
    // roomy spot is real but unusable, since taking it means turning your back
    // on the pack. WHEELHOUSE and LANCER DOCTRINE, pure crossing traffic, are
    // the sharp bars. DEMOLITION DAY and MENAGERIE sit in between: single point
    // threats rather than sweeps, so a clear spot always exists somewhere.
    const POCKET_CEILING: Record<string, number> = {
      wheelhouse: 3.0,
      "hunting-party": 14.0,
      "lancer-doctrine": 3.5,
      "demolition-day": 5.5,
      menagerie: 6.0,
    };
    const rows = creatureDays.map((id) => {
      const p = pressures.get(id)!;
      return {
        id,
        quiet: Math.max(...p.halfMaxGap.slice(2, 4)),
        pocket: window(p.halfPocket, 2, 4),
        ceiling: POCKET_CEILING[id],
      };
    });
    check(
      `creature days: no dead air in the 60-120s stretch (longest gap with nothing arriving <=${QUIET_GAP_CEILING}s)`,
      rows.every((r) => r.quiet <= QUIET_GAP_CEILING),
      rows.map((r) => `${r.id} ${r.quiet.toFixed(1)}s`).join(", "),
    );
    check(
      "creature days: no calm pocket to park in at 60-120s (Lucas's 1:45 screenshot test)",
      rows.every((r) => r.pocket <= r.ceiling),
      rows.map((r) => `${r.id} ${r.pocket.toFixed(1)}s vs ceiling ${r.ceiling}s`).join(", "),
    );
  }

  // Pickup economy on the choreography days (2026-08-12, same live feedback:
  // "I could hoard powers easily"). Daily Patrol runs the drop schedule 30%
  // faster because it has no refill floor; on a day with no ambient swarm to
  // spend powers on, that meant a permanently full board. These days now sit
  // just under the ordinary drop rate, and the bars are two-sided: slower than
  // a plain Daily, but nowhere near starved (the powers ARE the counterplay).
  {
    const daily = measurePressure(null);
    const SLOWER_THAN = 0.9; // fraction of a plain Daily's drops, upper bound
    const NOT_STARVED = 0.6; // ...and lower bound
    const reference = daily.pickups.reduce((a, b) => a + b, 0);
    const rows = creatureDays.map((id) => {
      const drops = pressures.get(id)!.pickups.reduce((a, b) => a + b, 0);
      return { id, drops, ratio: drops / Math.max(1, reference) };
    });
    check(
      `creature days: power drops slowed vs a plain Daily (${NOT_STARVED}-${SLOWER_THAN}x), so powers can't be carpet-hoarded`,
      rows.every((r) => r.ratio >= NOT_STARVED && r.ratio <= SLOWER_THAN),
      `plain Daily ${reference} drops in ${MINUTES} min | ` +
        rows.map((r) => `${r.id} ${r.drops} (${r.ratio.toFixed(2)}x)`).join(", "),
    );
  }

  // WHEELHOUSE's own calibration targets (Lucas, 2026-08-11: ~5-6 concurrent
  // wheels by m=5, ~10-12 members and a ~2.0-2.5s burst cadence by m=7, and
  // the traffic itself meaningfully faster, not a +1%/min creep; plus the
  // 2026-08-12 mid-ramp numbers, measured on the live day that triggered it:
  // ~2.4 concurrent wheels at 1:55 was "still sparse, I can hoard powers").
  {
    const w = pressures.get("wheelhouse")!;
    check(
      "WHEELHOUSE: lanes arrive <=2s apart by t=60s (the mid-ramp cadence Lucas asked for)",
      window(w.halfGap, 2, 4) <= 2,
      `${window(w.halfGap, 2, 4).toFixed(2)}s between arrivals over 60-120s ` +
        `(first 30s: ${w.halfGap[0].toFixed(2)}s)`,
    );
    check(
      "WHEELHOUSE: >=5 concurrent wheels on average through minute 5",
      w.concurrent[4] >= 5,
      `${w.concurrent[4].toFixed(1)} avg concurrent in minute 5 (minute 3: ${w.concurrent[2].toFixed(1)})`,
    );
    check(
      "WHEELHOUSE: wheels reach >=10 members by minute 7",
      w.members[6] >= 10,
      `${w.members[6].toFixed(1)} members/wheel in minute 7 (minute 3: ${w.members[2].toFixed(1)})`,
    );
    check(
      "WHEELHOUSE: lane cadence keeps tightening (<=0.8s between wheel arrivals by minute 7)",
      w.gap[6] <= 0.8,
      `${w.gap[6].toFixed(2)}s between arrivals in minute 7 (minute 3: ${w.gap[2].toFixed(2)}s)`,
    );
    check(
      "WHEELHOUSE: traffic gets meaningfully faster late (>=1.2x wheel speed by minute 7)",
      w.speed[6] >= w.speed[2] * 1.2,
      `${w.speed[6].toFixed(2)} vs ${w.speed[2].toFixed(2)} units/s`,
    );
  }

  // STARFALL: the rain used to sit on STARFALL_RAIN.intervalFloor forever
  // after 3.5 min; it now keeps intensifying toward intervalHardFloor.
  {
    const s = measurePressure("starfall");
    check(
      "STARFALL: the rain keeps intensifying past its ramp (more impacts in minute 7-8 than 3-4)",
      window(s.meteors, 5, 8) > window(s.meteors, 2, 4) * 1.15,
      `${window(s.meteors, 2, 4).toFixed(0)}/min at 3-4 vs ${window(s.meteors, 5, 8).toFixed(0)}/min at 6-8`,
    );
    // 2026-08-12 mid-ramp densify, lighter touch than the creature days: the
    // ramp to intervalFloor is 2.5 min instead of 3.5, so the sky thickens
    // noticeably while the player is still in minute 1-2 (the late leg's own
    // anchor, STARFALL_RAIN.lateStartMinutes, deliberately did NOT move).
    check(
      "STARFALL: the rain thickens across the first two minutes (>=1.4x minute 2 vs minute 1)",
      s.meteors[1] >= s.meteors[0] * 1.4,
      `${s.meteors[0]}/min in minute 1 vs ${s.meteors[1]}/min in minute 2 (minute 3: ${s.meteors[2]})`,
    );
  }

  // GREAT WALL / YEAR OF THE SERPENT: formation cadence keeps tightening past
  // the interval floor AND a stray-drone trickle starts leaking in, but only
  // after lateFormationGrowth.ambientStartMinutes, so the day's "no ambient
  // drones at all" identity is intact for the whole early run.
  for (const id of ["great-wall", "year-of-the-serpent"]) {
    const p = measurePressure(id);
    const name = getMutatorById(id)!.name;
    check(
      `${name}: formations keep coming faster past the interval floor (>=1.3x minute 7-8 vs 3)`,
      window(p.formations, 5, 8) >= p.formations[2] * 1.3,
      `${p.formations[2]}/min in minute 3 vs ${window(p.formations, 5, 8).toFixed(0)}/min in minute 6-8`,
    );
    check(
      `${name}: zero ambient for the first 4 minutes, then a growing trickle`,
      p.ambient.slice(0, 4).every((n) => n === 0) && window(p.ambient, 5, 8) > 0,
      `first 4 min: ${p.ambient.slice(0, 4).join(",")} | minute 5-8: ${p.ambient.slice(4).join(",")}`,
    );
  }
}

// (b) Longer-cap survival guard. The dodge bot from section 10 dies around
// minute 1 (its median is ~12s at the 90s cap), far short of a skilled human
// (Lucas flew this WHEELHOUSE to 2.5 min, a friend farmed it to 25 min), so
// it cannot see a minute-3 plateau at all. This harness gives the same bot a
// rebankable shield every 7s (a stand-in for a pilot converting drops into
// extra lives), which pushes it into the 2-7 minute band where the late curve
// actually bites. Calibration measured on 2026-08-11 (25 trials/day):
// vanilla Classic (the endless reference) medians ~83s and never reaches 5
// minutes; pre-pass WHEELHOUSE ran to 9.6 min and DEMOLITION DAY hit the
// 10-minute cap in 10 of 25 trials. Post-pass nothing reaches 7.1 min. The
// bars below are deliberately loose (this bot is unseeded and high-variance);
// they catch a return of the plateau, not small tuning drift.
{
  const CAP = 300;
  const TRIALS = 10;
  // >=50% of trials must END before the cap. Deliberately loose: the spread
  // across days is wide (observed 7/10 to 10/10 dying post-late-growth, vs
  // DEMOLITION DAY's pre-pass 40%), and the seeds below are a sample of run
  // scripts, not a proof. The telemetry checks in (a) are the sharp guard;
  // this one is the end-to-end sanity that a pilot with extra lives can't
  // just sit in the day.
  const CAP_ESCAPE_BAR = 0.5;
  const lateDate = new Date("2026-08-17T00:00:00Z");

  function shieldedTrial(mutators: Mutator[], seed: number): number {
    setRunSeed(seed);
    setActiveMutators(mutators, lateDate);
    const scale = mutatorViewScale();
    const world = createWorld(17.8 * scale, 10 * scale, false, 0, "classic", true);
    const botInput: InputState = {
      turn: 0,
      thrust: 0,
      heading: null,
      moveVector: { x: 0, y: 0 },
      inertia: false,
      cruiseSpeed: 8,
    };
    let nextShield = 0;
    const steps = Math.round(CAP / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      if (world.phase !== "playing") break;
      if (world.time >= nextShield) {
        world.powers.shieldActive = true; // banked extra life, re-armed every 7s
        nextShield = world.time + 7;
      }
      botInput.moveVector = evasiveHeading(world);
      tick(world, botInput, FIXED_DT);
      world.events.length = 0;
    }
    clearActiveMutators();
    setRunSeed(null);
    return Math.min(world.time, CAP);
  }

  const plateauProneIds = [
    "wheelhouse",
    "hunting-party",
    "lancer-doctrine",
    "demolition-day",
    "menagerie",
    "great-wall",
    "year-of-the-serpent",
  ];
  const rows = plateauProneIds.map((id) => {
    const times = TRIAL_SEEDS.slice(0, TRIALS).map((seed) => shieldedTrial([getMutatorById(id)!], seed));
    const ended = times.filter((t) => t < CAP - 0.5).length;
    return { id, name: getMutatorById(id)!.name, times, ended };
  });
  const farmable = rows.filter((r) => r.ended / TRIALS < CAP_ESCAPE_BAR);
  check(
    `shield-assisted dodge bot: every plateau-prone day ends the run (>=${CAP_ESCAPE_BAR * 100}% of trials die inside ${CAP}s)`,
    farmable.length === 0,
    farmable.map((r) => `${r.name} ${r.ended}/${TRIALS}`).join(", "),
  );
  console.log(
    "  shield-assisted bot (cap 300s): " +
      rows
        .map((r) => {
          const sorted = [...r.times].sort((a, b) => a - b);
          const med = sorted[Math.floor(TRIALS / 2)];
          return `${r.name} med ${med.toFixed(0)}s, ${r.ended}/${TRIALS} died`;
        })
        .join(" | "),
  );
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
