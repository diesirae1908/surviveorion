/**
 * Headless playtest of the new formations and powers (no DOM needed).
 * Run: npx tsx scripts/sim-test.ts
 */
import { FIXED_DT, IRONRAIN, PICKUPS, POWERS, SCORING, SHIP, SPAWNABLE_POWER_IDS, TRAINING } from "../src/config";
import { droneRadius, spawnDroneDirect } from "../src/enemies";
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
    seen.has("starshell") && seen.has("autocannon") && seen.has("meteors"),
    [...seen].sort().join(","),
  );
  check(
    "all spawnable powers appear within 60 drops (benched ones never)",
    seen.size === SPAWNABLE_POWER_IDS.length && !seen.has("magnet") && !seen.has("vortex"),
    `${seen.size}/${SPAWNABLE_POWER_IDS.length}`,
  );
  check(
    "bad-luck protection: >=8 distinct powers in first 15 drops",
    first15.size >= 8,
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
    const seenPickups = new Set<unknown>();
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
      // pickups stay on the board (dailies never discard a scheduled drop):
      // log each drop once, WITH its position — the whole visible power
      // script must match, not just the identities
      for (const pu of world.pickups) {
        if (seenPickups.has(pu)) continue;
        seenPickups.add(pu);
        script.powers.push(
          `${world.time.toFixed(2)}:${pu.power}@${pu.x.toFixed(2)},${pu.y.toFixed(2)}`,
        );
      }
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

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
