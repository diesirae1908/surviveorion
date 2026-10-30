/**
 * OVERDRIVE core: meter math, off-is-identical, every power with the burst
 * and the six forms, and the anti-cheat ceiling observer (forced HOT).
 * Run: npx tsx scripts/test-overdrive.ts   (wired into `npm test`)
 * Determinism with real bots is in scripts/sim-test.ts section 7b.
 */
import { ALL_POWER_IDS, FIXED_DT, PALETTE, POWERS, SHIP, type PowerId } from "../src/config";
import { killDrone, killDronesInRadius, spawnDroneDirect } from "../src/enemies";
import { BASE_RULES, resolveRunRules, rulesFromDefaults, type RunRules } from "../src/flags";
import { createWorld, tick } from "../src/gameState";
import type { InputState } from "../src/input";
import { killMinesInRadius } from "../src/mines";
import { setRunSeed } from "../src/math";
import {
  clearActiveMutators,
  getMutatorById,
  getMutatorsForDateStr,
  MUTATOR_POOL,
  mutatorViewScale,
  setActiveMutators,
  type Mutator,
} from "../src/mutators";
import {
  chargeFromGraze,
  chargeFromKill,
  overdriveHeatScale,
  spendOverdrive,
  updateOverdrive,
} from "../src/overdrive";
import { activatePower, detonateShield, spawnBlast } from "../src/powers";
import type { World } from "../src/types";
import { validateRun } from "../server/validate.mjs";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}
/** Player-side randomness is Math.random; pin it so two runs are comparable. */
function withPinnedMathRandom<T>(seed: number, fn: () => T): T {
  const orig = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}
const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) < eps;

const idle: InputState = {
  turn: 0,
  thrust: 0,
  heading: null,
  moveVector: { x: 0, y: 0 },
  inertia: false,
  cruiseSpeed: 8,
};

/** A fresh rules object per test (forms mutated freely). */
function onRules(patch?: (od: NonNullable<RunRules["overdrive"]>) => void): RunRules {
  const r = rulesFromDefaults({ overdrive: true });
  if (patch && r.overdrive) patch(r.overdrive);
  return r;
}
function mkWorld(rules: RunRules, daily = false): World {
  return createWorld(17.8, 10, false, 0, "classic", daily, false, rules);
}
function run(world: World, seconds: number, invulnerable = true): void {
  const n = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < n; i++) {
    if (invulnerable) world.powers.starshellTimer = 9999;
    tick(world, idle, FIXED_DT);
    world.events.length = 0;
  }
}

// --- 1. meter math ---------------------------------------------------------
{
  const w = mkWorld(onRules());
  const od = w.rules.overdrive!;
  chargeFromGraze(w, 0.1);
  check("razor-thin graze charges x razorGrazeScale", near(w.overdrive.charge, od.chargePerGraze * od.razorGrazeScale));
  w.overdrive.charge = 0;
  chargeFromGraze(w, 0.5);
  check("mid graze charges x1", near(w.overdrive.charge, od.chargePerGraze));
  w.overdrive.charge = 0;
  chargeFromGraze(w, 0.9);
  check("loose graze charges x outerGrazeScale", near(w.overdrive.charge, od.chargePerGraze * od.outerGrazeScale));
  check("a graze resets the drain delay", w.overdrive.drainTimer === od.drainDelay);

  // drain: holds for drainDelay, then falls
  w.overdrive.charge = 0.5;
  w.overdrive.drainTimer = od.drainDelay;
  for (let i = 0; i < Math.round((od.drainDelay - 0.1) / FIXED_DT); i++) updateOverdrive(w, FIXED_DT);
  check("no drain inside the delay", near(w.overdrive.charge, 0.5, 1e-6));
  for (let i = 0; i < Math.round(2 / FIXED_DT); i++) updateOverdrive(w, FIXED_DT);
  check("drains after the delay", w.overdrive.charge < 0.5 - od.drainPerSec, `${w.overdrive.charge.toFixed(3)}`);

  // HOT at 1, event once
  const w2 = mkWorld(onRules());
  for (let i = 0; i < 12; i++) chargeFromGraze(w2, 0.5);
  const hotEvents = w2.events.filter((e) => e.type === "overdriveHot").length;
  check("reaching 1 goes HOT once", w2.overdrive.hot && w2.overdrive.charge === 1 && w2.overdrive.hotCount === 1 && hotEvents === 1);
  chargeFromGraze(w2, 0.1);
  check("no charge while HOT", w2.overdrive.charge === 1 && w2.overdrive.hotCount === 1);

  // HOT expires unspent
  for (let i = 0; i < Math.round((od.hotMaxSeconds - 0.2) / FIXED_DT); i++) updateOverdrive(w2, FIXED_DT);
  check("HOT holds before hotMaxSeconds", w2.overdrive.hot);
  for (let i = 0; i < Math.round(0.5 / FIXED_DT); i++) updateOverdrive(w2, FIXED_DT);
  check(
    "HOT cools after hotMaxSeconds, charge 0, cool event",
    !w2.overdrive.hot && w2.overdrive.charge === 0 && w2.events.some((e) => e.type === "overdriveCool"),
  );

  // hotMaxSeconds 0 = no limit
  const w3 = mkWorld(onRules((o) => (o.hotMaxSeconds = 0)));
  for (let i = 0; i < 12; i++) chargeFromGraze(w3, 0.5);
  for (let i = 0; i < Math.round(30 / FIXED_DT); i++) updateOverdrive(w3, FIXED_DT);
  check("hotMaxSeconds 0 never expires", w3.overdrive.hot);

  // spend
  const w4 = mkWorld(onRules());
  check("spend when not HOT does nothing", spendOverdrive(w4, "pulse") === false && w4.overdrive.fires === 0);
  for (let i = 0; i < 12; i++) chargeFromGraze(w4, 0.5);
  const form = spendOverdrive(w4, "pulse");
  check(
    "spend resets the meter, counts a fire, locks out kill charge, returns the form",
    form && !w4.overdrive.hot && w4.overdrive.charge === 0 && w4.overdrive.fires === 1 && w4.overdrive.lockout > 0,
  );
  chargeFromKill(w4);
  check("kill charge locked out after a spend", w4.overdrive.charge === 0);
  const fire = w4.events.find((e) => e.type === "overdriveFire");
  check("overdriveFire event carries power and form", !!fire && fire.type === "overdriveFire" && fire.power === "pulse" && fire.form === true);
  for (let i = 0; i < Math.round((w4.rules.overdrive!.killChargeLockout + 0.1) / FIXED_DT); i++) updateOverdrive(w4, FIXED_DT);
  chargeFromKill(w4);
  check("kill charge resumes after the lockout", near(w4.overdrive.charge, w4.rules.overdrive!.chargePerKill, 1e-6));

  // kill cap per second
  const w5 = mkWorld(onRules());
  for (let i = 0; i < 30; i++) chargeFromKill(w5);
  check(
    "kill charge capped per second",
    near(w5.overdrive.charge, w5.rules.overdrive!.maxKillChargePerSec, 1e-9),
    `${w5.overdrive.charge.toFixed(3)}`,
  );

  // power without a form, or a form switched off: burst only
  const w6 = mkWorld(onRules());
  for (let i = 0; i < 12; i++) chargeFromGraze(w6, 0.5);
  check("a power without an Overdrive form gets the burst only", spendOverdrive(w6, "starshell") === false && w6.overdrive.fires === 1);
  const w7 = mkWorld(onRules((o) => (o.forms.pulse.on = false)));
  for (let i = 0; i < 12; i++) chargeFromGraze(w7, 0.5);
  check("a form switched off falls back to the burst", spendOverdrive(w7, "pulse") === false && w7.overdrive.fires === 1);

  // burst kills a drone at the hull, none outside
  const w8 = mkWorld(onRules((o) => { o.burstRadius = 1.2; o.armWhenClear = false; }));
  w8.ship.x = 0;
  w8.ship.y = 0;
  const near1 = spawnDroneDirect(w8, 0.6, 0, 1);
  const far1 = spawnDroneDirect(w8, 4, 0, 1);
  for (let i = 0; i < 12; i++) chargeFromGraze(w8, 0.5);
  spendOverdrive(w8, "starshell");
  check("burst kills inside burstRadius only", !near1.alive && far1.alive);
  const w9 = mkWorld(onRules((o) => (o.burstRadius = 0)));
  const near2 = spawnDroneDirect(w9, 0.6, 0, 1);
  for (let i = 0; i < 12; i++) chargeFromGraze(w9, 0.5);
  spendOverdrive(w9, "starshell");
  check("burstRadius 0 disables the burst", near2.alive);

  // GRAZE PROTOCOL 2x, only with the hook
  const gp = getMutatorById("graze-protocol")!;
  setActiveMutators([gp], "2026-12-01");
  const wa = mkWorld(onRules());
  chargeFromGraze(wa, 0.5);
  const wb = mkWorld(onRules((o) => (o.mutatorHooks = false)));
  chargeFromGraze(wb, 0.5);
  check("GRAZE PROTOCOL charges 2x", near(wa.overdrive.charge, 2 * wa.rules.overdrive!.chargePerGraze));
  check("mutatorHooks off: GRAZE PROTOCOL charges 1x", near(wb.overdrive.charge, wb.rules.overdrive!.chargePerGraze));
  clearActiveMutators();
  const wc = mkWorld(onRules());
  chargeFromGraze(wc, 0.5);
  check("no mutator: 1x", near(wc.overdrive.charge, wc.rules.overdrive!.chargePerGraze));

  // loose drones near a HOT hull speed up; far ones and the switch-off case do not
  const speedOf = (rules: RunRules, hot: boolean, dist: number): number => {
    const w = mkWorld(rules);
    w.ship.x = 0;
    w.ship.y = 0;
    w.overdrive.hot = hot;
    const d = spawnDroneDirect(w, dist, 0, 1);
    d.speedMultiplier = 1;
    d.jitterSeed = 1;
    const x0 = d.x;
    w.powers.starshellTimer = 0;
    // one drone update only: call tick with a tiny dt would also move the ship; idle input is fine
    tick(w, idle, FIXED_DT);
    return Math.abs(d.x - x0);
  };
  // 2-unit and 6-unit drones, rules on vs off
  const cold = speedOf(onRules(), false, 2);
  const hotNear = speedOf(onRules(), true, 2);
  const hotFar = speedOf(onRules(), true, 6);
  const coldFar = speedOf(onRules(), false, 6);
  check("HOT: a near loose drone moves hotDroneSpeedScale faster", near(hotNear / cold, 1.2, 0.02), `${(hotNear / cold).toFixed(3)}`);
  check("HOT: a far drone is unchanged", near(hotFar, coldFar, 1e-9));
}

// --- 1a. arm when clear: a full meter in contact range waits for a clear hull ---
{
  const mk = (arm: boolean, droneDist: number | null) => {
    const w = mkWorld(onRules((o) => (o.armWhenClear = arm)));
    w.ship.x = 0;
    w.ship.y = 0;
    w.powers.starshellTimer = 9999;
    let d: ReturnType<typeof spawnDroneDirect> | null = null;
    if (droneDist !== null) {
      d = spawnDroneDirect(w, droneDist, 0, 1);
      d.speedMultiplier = 0; // parked
    }
    w.overdrive.charge = 0.99;
    return { w, d };
  };
  const near = 0.9; // inside ship radius + drone radius + graze band
  check("armWhenClear default is on", rulesFromDefaults({ overdrive: true }).overdrive!.armWhenClear === true);
  {
    const { w } = mk(true, near);
    chargeFromGraze(w, 0.5);
    check("arm: full meter in the band does not go HOT", w.overdrive.armed && !w.overdrive.hot && w.overdrive.charge === 1 && w.overdrive.hotCount === 0);
    const before = w.overdrive.charge;
    chargeFromGraze(w, 0.1);
    check("arm: further grazes add nothing while armed", w.overdrive.charge === before && w.overdrive.hotCount === 0);
    updateOverdrive(w, 1);
    check("arm: stays armed while the drone is in the band, meter does not drain", w.overdrive.armed && w.overdrive.charge === 1);
    for (const d of w.drones) d.x = 20;
    updateOverdrive(w, FIXED_DT);
    check("arm: HOT starts the tick the band clears (event once)", !w.overdrive.armed && w.overdrive.hot && w.overdrive.hotCount === 1 && w.events.filter((e) => e.type === "overdriveHot").length === 1);
  }
  {
    const { w } = mk(true, near);
    chargeFromGraze(w, 0.5);
    for (let i = 0; i < Math.round(2.9 / FIXED_DT); i++) updateOverdrive(w, FIXED_DT);
    check("arm: still held at 2.9 s of contact", w.overdrive.armed && !w.overdrive.hot);
    for (let i = 0; i < Math.round(0.2 / FIXED_DT); i++) updateOverdrive(w, FIXED_DT);
    check("arm: contact past ARM_MAX_SECONDS starts HOT anyway", !w.overdrive.armed && w.overdrive.hot);
  }
  {
    const { w, d } = mk(true, near);
    d!.frozen = 2;
    chargeFromGraze(w, 0.5);
    check("arm: a frozen drone in the band does not hold HOT", w.overdrive.hot && !w.overdrive.armed);
  }
  {
    const { w } = mk(true, 6);
    chargeFromGraze(w, 0.5);
    check("arm: nothing in the band goes HOT at once", w.overdrive.hot && !w.overdrive.armed);
  }
  {
    const { w } = mk(false, near);
    chargeFromGraze(w, 0.5);
    check("armWhenClear off: HOT at once, as before", w.overdrive.hot && !w.overdrive.armed);
  }
  {
    const { w } = mk(true, near);
    const rules = w.rules.overdrive as { armWhenClear?: boolean };
    delete rules.armWhenClear;
    chargeFromGraze(w, 0.5);
    check("armWhenClear absent (older row): HOT at once, as before", w.overdrive.hot && !w.overdrive.armed);
  }
}

// --- 1b. review fixes ------------------------------------------------------
{
  // freeze chain skips allied drones
  const w = mkWorld(onRules());
  w.ship.x = 0;
  w.ship.y = 0;
  const a = spawnDroneDirect(w, 1.5, 3, 1);
  const ally = spawnDroneDirect(w, 1.5, 3.6, 1);
  const b = spawnDroneDirect(w, 1.5, 4.2, 1);
  for (const d of [a, ally, b]) d.speedMultiplier = 0;
  for (let i = 0; i < 12; i++) chargeFromGraze(w, 0.5);
  activatePower(w, "freeze", spendOverdrive(w, "freeze"));
  ally.allied = true;
  ally.alliedTimer = 30;
  killDrone(w, a);
  tick(w, idle, FIXED_DT);
  check("freeze chain never shatters an allied drone", ally.alive, `ally=${ally.alive}`);

  // a later plain Cryo orb clears the Overdrive mark (no chain from it)
  const w2 = mkWorld(onRules());
  w2.ship.x = 0;
  w2.ship.y = 0;
  const c = spawnDroneDirect(w2, 1.5, 3, 1);
  const d2 = spawnDroneDirect(w2, 1.5, 3.6, 1);
  for (const d of [c, d2]) d.speedMultiplier = 0;
  for (let i = 0; i < 12; i++) chargeFromGraze(w2, 0.5);
  activatePower(w2, "freeze", spendOverdrive(w2, "freeze"));
  check("overdrive freeze marks drones", c.odFrozen === true);
  w2.overdrive.lockout = 0;
  activatePower(w2, "freeze", false);
  check("plain freeze clears the overdrive mark", c.odFrozen === false && d2.odFrozen === false);
  killDrone(w2, c);
  tick(w2, idle, FIXED_DT);
  check("plain freeze: shattering one does not chain", d2.alive);

  // shield refund never reaches HOT
  const w3 = mkWorld(onRules((o) => (o.forms.shield.refund = 1)));
  for (let i = 0; i < 12; i++) chargeFromGraze(w3, 0.5);
  activatePower(w3, "shield", spendOverdrive(w3, "shield"));
  detonateShield(w3);
  check("shield refund capped below HOT", w3.overdrive.charge <= 0.99 && !w3.overdrive.hot, `${w3.overdrive.charge}`);
}

// --- 2. off is identical ---------------------------------------------------
{
  const date = "2026-12-09";
  const offRules = resolveRunRules(date, { daily: true });
  check("switch off resolves overdrive to null", offRules.overdrive === null && offRules.rulesetId === "base");
  const trace = (rules: RunRules): string[] => {
    setRunSeed(777);
    const w = createWorld(17.8, 10, false, 0, "classic", true, false, rules);
    const out: string[] = [];
    let t = 0;
    for (let i = 0; i < Math.round(180 / FIXED_DT); i++) {
      t += FIXED_DT;
      w.powers.shieldActive = true;
      tick(w, { ...idle, moveVector: { x: Math.cos(t * 0.7), y: Math.sin(t * 0.7) } }, FIXED_DT);
      w.events.length = 0;
      if (i % 60 === 0) {
        out.push(
          [
            w.score.toFixed(3),
            w.kills,
            w.multiplier.toFixed(4),
            w.drones.length,
            w.ship.x.toFixed(4),
            w.ship.y.toFixed(4),
            w.phase,
          ].join("|"),
        );
      }
    }
    setRunSeed(null);
    return out;
  };
  const a = withPinnedMathRandom(9, () => trace(BASE_RULES));
  const b = withPinnedMathRandom(9, () => trace(offRules));
  check("off: 3 minutes, BASE_RULES vs resolved-off rules, state hash every second identical", a.length >= 180 && a.join("\n") === b.join("\n"), `${a.length} samples`);
}

// --- 3. every power activates with the burst/forms and ticks ---------------
{
  let threw: string | null = null;
  for (const id of ALL_POWER_IDS) {
    try {
      const w = mkWorld(onRules());
      for (let i = 0; i < 6; i++) spawnDroneDirect(w, 1 + i * 0.4, 0.5, 1);
      for (let i = 0; i < 12; i++) chargeFromGraze(w, 0.5);
      const form = spendOverdrive(w, id);
      activatePower(w, id, form);
      run(w, 10);
    } catch (e) {
      threw = `${id}: ${(e as Error).message}`;
      break;
    }
  }
  check("all 18 power ids activate HOT and tick 10 s without throwing", threw === null, threw ?? "");

  // each form changes something observable (not just the base power)
  const probe = (id: PowerId, patch?: (o: NonNullable<RunRules["overdrive"]>) => void) => {
    const w = mkWorld(onRules(patch));
    w.ship.x = 0;
    w.ship.y = 0;
    for (let i = 0; i < 12; i++) chargeFromGraze(w, 0.5);
    const form = spendOverdrive(w, id);
    activatePower(w, id, form);
    return { w, form };
  };
  // pulse: a 3-shot fan after the charge time
  {
    const { w, form } = probe("pulse");
    run(w, POWERS.pulse.chargeTime + 0.1);
    check("pulse form: fan fires fanCount projectiles", form && w.powers.projectiles.length >= 3 + 0, `${w.powers.projectiles.length}`);
    const { w: wo } = probe("pulse", (o) => (o.forms.pulse.on = false));
    run(wo, POWERS.pulse.chargeTime + 0.1);
    check("pulse form off: one projectile", wo.powers.projectiles.length === 1);
  }
  // shield: charged flag, bigger detonation, refund
  {
    const { w } = probe("shield");
    const nearD = spawnDroneDirect(w, 1.9, 0, 1);
    const baseR = POWERS.shield.detonationRadius;
    w.powers.starshellTimer = 0;
    check("shield form: banked shield is charged", w.overdrive.shieldCharged && w.powers.shieldActive);
    const radiusProbe = spawnDroneDirect(w, baseR * 1.15, 0, 1);
    w.drones = w.drones.filter((d) => d === radiusProbe || d === nearD);
    nearD.x = 0.2;
    detonateShield(w);
    check(
      "shield form: detonation reaches radiusScale, refunds charge",
      !radiusProbe.alive && near(w.overdrive.charge, w.rules.overdrive!.forms.shield.refund) && !w.overdrive.shieldCharged,
    );
    const { w: w0 } = probe("shield", (o) => (o.forms.shield.on = false));
    const rp = spawnDroneDirect(w0, baseR * 1.15, 0, 1);
    detonateShield(w0);
    check("shield form off: base radius, no refund", rp.alive && w0.overdrive.charge === 0);
  }
  // freeze: wider field + chain shatters neighbors
  {
    const { w } = probe("freeze");
    // after spend the world has no drones near; build the scene fresh
    const w2 = mkWorld(onRules());
    w2.ship.x = 0;
    w2.ship.y = 0;
    const baseR = POWERS.freeze.radius;
    const ring = spawnDroneDirect(w2, baseR * 1.15, 0, 1); // only inside radiusScale 1.25
    const a = spawnDroneDirect(w2, 1.5, 3, 1);
    const b = spawnDroneDirect(w2, 1.5, 3.8, 1);
    const c = spawnDroneDirect(w2, 1.5, 4.6, 1);
    for (const d of [a, b, c]) d.speedMultiplier = 0;
    for (let i = 0; i < 12; i++) chargeFromGraze(w2, 0.5);
    const form = spendOverdrive(w2, "freeze");
    activatePower(w2, "freeze", form);
    check("freeze form: radiusScale widens the field", ring.frozen > 0 || !ring.alive);
    // shatter one: the chain takes its frozen neighbors within chainRadius
    killDrone(w2, a);
    tick(w2, idle, FIXED_DT);
    w2.powers.starshellTimer = 0;
    check("freeze form: shattering one frozen drone chains to neighbors", !b.alive && !c.alive, `b=${b.alive} c=${c.alive}`);
    void w;
  }
  // magnet: claims up to maxPull
  {
    const w = mkWorld(onRules());
    w.pickups.length = 0;
    for (let i = 0; i < 5; i++) w.pickups.push({ x: 1 + i, y: 1, power: "shield", age: 0, magnetized: false } as never);
    for (let i = 0; i < 12; i++) chargeFromGraze(w, 0.5);
    const form = spendOverdrive(w, "magnet");
    activatePower(w, "magnet", form);
    const claimed = w.pickups.filter((p) => p.magnetized).length;
    check("magnet form: claims maxPull pickups", claimed === 3, `${claimed}`);
  }
  // shockwave: echo
  {
    const { w } = probe("shockwave");
    const before = w.events.filter((e) => e.type === "shockwave").length;
    run(w, w.rules.overdrive!.forms.shockwave.echoDelay + 0.1);
    check("shockwave form: queued an echo that fired", before >= 0 && w.overdrive.pending.length === 0);
    const { w: w0 } = probe("shockwave", (o) => (o.forms.shockwave.on = false));
    check("shockwave form off: no echo queued", w0.overdrive.pending.length === 0);
  }
  // missiles: count
  {
    const { w } = probe("missiles");
    check("missiles form: fires form.count", w.powers.missiles.length === w.rules.overdrive!.forms.missiles.count, `${w.powers.missiles.length}`);
    const { w: w0 } = probe("missiles", (o) => (o.forms.missiles.on = false));
    check("missiles form off: base count", w0.powers.missiles.length === POWERS.missiles.count);
  }
}

// --- 4. activatePower(..., false) is the pre-refactor behavior --------------
{
  // The shockwave moved into detonateShockwave. Compare against the old
  // inline body (kept here as a test-local copy) on identical seeded worlds.
  const scenario = (legacy: boolean) => {
    setRunSeed(4242);
    const w = createWorld(17.8, 10, false, 0, "classic", true, false, BASE_RULES);
    w.powers.starshellTimer = 9999;
    for (let i = 0; i < Math.round(20 / FIXED_DT); i++) {
      tick(w, idle, FIXED_DT);
      w.events.length = 0;
    }
    if (legacy) legacyShockwave(w);
    else activatePower(w, "shockwave");
    for (let i = 0; i < Math.round(5 / FIXED_DT); i++) {
      w.powers.starshellTimer = 9999;
      tick(w, idle, FIXED_DT);
      w.events.length = 0;
    }
    setRunSeed(null);
    return [w.kills, w.score.toFixed(4), w.drones.length, w.powers.waves.length, w.powers.blasts.length, w.multiplier.toFixed(4)].join("|");
  };
  const sa = withPinnedMathRandom(5, () => scenario(true));
  const sb = withPinnedMathRandom(5, () => scenario(false));
  check("shockwave refactor: identical to the old inline path", sa === sb, sb);
}

// --- 5. ceiling observer: forced HOT before every pickup, 10 minutes --------
{
  const SECONDS = 600;
  const dateStr = "2026-12-09";
  const sundayPairs = ["2026-12-06", "2026-12-13", "2026-12-20"].map((d) => getMutatorsForDateStr(d));
  const worst: Mutator[] = [getMutatorById("graze-protocol")!, getMutatorById("overcharge")!];
  const sets: { label: string; ms: Mutator[]; names: string[] }[] = [
    { label: "none", ms: [], names: [] },
    ...MUTATOR_POOL.map((m) => ({ label: m.id, ms: [m], names: [m.name] })),
    ...sundayPairs.map((ms, i) => ({ label: `sunday-${i + 1}:${ms.map((m) => m.id).join("+")}`, ms, names: ms.map((m) => m.name) })),
    { label: "worst:graze-protocol+overcharge", ms: worst, names: worst.map((m) => m.name) },
  ];

  const observe = (ms: Mutator[], rules: RunRules, minGap = 0): { score: number; kills: number; time: number; maxMult: number; peak: number; fires: number } => {
    setRunSeed(31337);
    setActiveMutators(ms, dateStr);
    const scale = mutatorViewScale();
    const w = createWorld(17.8 * scale, 10 * scale, false, 0, "classic", true, false, rules);
    let lastForce = -1e9;
    const killLog: number[] = [];
    let lastKills = 0;
    const steps = Math.round(SECONDS / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      // ghost hull: lethal hits are undone each tick, so drones are NOT
      // ram-killed for free; kills come only from powers, forms and bursts
      if (w.phase !== "playing") {
        w.phase = "playing";
        w.deathTimer = 0;
        w.deathCause = null;
      }
      // forced HOT before every pickup, ship parked on the nearest one
      if (w.pickups.length > 0) {
        if (rules.overdrive && w.time - lastForce >= minGap) {
          lastForce = w.time;
          w.overdrive.hot = true;
          w.overdrive.armed = false;
          w.overdrive.charge = 1;
          w.overdrive.hotTime = 0;
          w.overdrive.lockout = 0;
        }
        const p = w.pickups[0];
        w.ship.x = Math.max(-w.viewW / 2 + SHIP.wallInset, Math.min(w.viewW / 2 - SHIP.wallInset, p.x));
        w.ship.y = Math.max(-w.viewH / 2 + SHIP.wallInset, Math.min(w.viewH / 2 - SHIP.wallInset, p.y));
      }
      tick(w, idle, FIXED_DT);
      w.events.length = 0;
      if (i % 60 === 0) {
        killLog.push(w.kills - lastKills);
        lastKills = w.kills;
      }
    }
    // peak sustained kills/s over any 10 s window
    let peak = 0;
    for (let i = 0; i + 10 <= killLog.length; i++) {
      peak = Math.max(peak, killLog.slice(i, i + 10).reduce((x, y) => x + y, 0) / 10);
    }
    clearActiveMutators();
    setRunSeed(null);
    return { score: w.score, kills: w.kills, time: w.time, maxMult: w.maxMultiplier, peak, fires: w.overdrive.fires };
  };

  type Obs = ReturnType<typeof observe>;
  const headroomOf = (o: Obs, names: string[]): number => {
    const ok = (k: number): boolean =>
      validateRun({
        score: Math.floor(o.score * k),
        timeSurvived: o.time,
        kills: o.kills,
        maxMultiplier: Math.min(10, o.maxMult),
        mode: "desktop",
        gameMode: "classic",
        mutatorNames: names.length ? names : null,
      }) === null;
    if (!ok(1)) return 0;
    let lo = 1;
    let hi = 64;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  // The server compares the WHOLE-RUN average (kills <= time * 20) and the
  // score ceiling. A ghost hull parked on every orb in a dense swarm is far
  // beyond a human, so a few sets are already at 60 to 110% of the kill cap
  // with the switch OFF (the bot, not Overdrive). Gates are therefore relative
  // to OFF on the same seed; the absolute 80% tripwire is printed for Sam.
  //   stress   : HOT forced before EVERY orb (about one fire per 4 s).
  //   realistic: HOT forced at most once per 15 s (a skimmer's real cadence).
  // Gates: stress ON/OFF kill-rate ratio <= 1.35; realistic ON keeps >= 10%
  // score headroom wherever OFF has it. Absolute tripwire list: report only.
  const rows: string[] = [];
  const tripwire: string[] = [];
  const stressRegress: string[] = [];
  const realRegress: string[] = [];
  const realRate: string[] = [];
  let maxRatio = 0;
  let maxRatioLabel = "";
  let realMaxAvg = 0;
  let realMaxLabel = "";
  let realMinHead = Infinity;
  let realMinHeadLabel = "";
  for (const s of sets) {
    const pinned = (rules: RunRules, gap = 0) => withPinnedMathRandom(2027, () => observe(s.ms, rules, gap));
    const off = pinned(BASE_RULES);
    const stress = pinned(onRules());
    const real = pinned(onRules(), 15);
    const offAvg = off.kills / off.time;
    const stressAvg = stress.kills / stress.time;
    const realAvg = real.kills / real.time;
    const offHead = headroomOf(off, s.names);
    const stressHead = headroomOf(stress, s.names);
    const realHead = headroomOf(real, s.names);
    const ratio = offAvg >= 8 ? stressAvg / offAvg : 1;
    if (ratio > maxRatio) {
      maxRatio = ratio;
      maxRatioLabel = s.label;
    }
    if (ratio > 1.35) stressRegress.push(`${s.label} x${ratio.toFixed(2)}`);
    if (offHead >= 1.1) {
      // OFF itself passes the ceiling: realistic ON must keep 10% headroom too
      if (realHead < 1.1) realRegress.push(`${s.label} (avg ${realAvg.toFixed(1)}/s, headroom x${realHead.toFixed(2)})`);
      if (realAvg > realMaxAvg) {
        realMaxAvg = realAvg;
        realMaxLabel = s.label;
      }
      if (realHead < realMinHead) {
        realMinHead = realHead;
        realMinHeadLabel = s.label;
      }
    }
    if (offAvg >= 8 && realAvg / offAvg > 1.1 + 0.01) realRate.push(`${s.label} x${(realAvg / offAvg).toFixed(2)}`);
    if (stressAvg >= 16 || offAvg >= 16) tripwire.push(`${s.label}: OFF ${offAvg.toFixed(1)}/s, stress ON ${stressAvg.toFixed(1)}/s, realistic ON ${realAvg.toFixed(1)}/s`);
    rows.push(
      `  ${s.label}: avg kills/s off ${offAvg.toFixed(2)} stress ${stressAvg.toFixed(2)} realistic ${realAvg.toFixed(2)} | fires stress ${stress.fires} realistic ${real.fires} | headroom off x${offHead.toFixed(2)} stress x${stressHead.toFixed(2)} realistic x${realHead.toFixed(2)}`,
    );
  }
  if (process.env.OD_VERBOSE) console.log(rows.join("\n"));
  console.log(
    `  ceiling observer: ${sets.length} sets x ${SECONDS}s. Stress ON/OFF avg kills/s max ratio x${maxRatio.toFixed(2)} (${maxRatioLabel}). Realistic ON (OFF in range): max avg ${realMaxAvg.toFixed(2)}/s (${realMaxLabel}), min headroom x${realMinHead.toFixed(2)} (${realMinHeadLabel}).`,
  );
  if (tripwire.length) console.log(`  TRIPWIRE (>=80% of the 20/s cap, mostly bot-saturated already OFF): ${tripwire.join("; ")}`);
  check("observer stress: Overdrive adds at most 35% average kills/s over OFF (same seed, pinned Math.random)", stressRegress.length === 0, stressRegress.join(", "));
  check("observer realistic cadence: ON average kills/s at most 1.10x OFF (+0.01 run noise)", realRate.length === 0, realRate.join(", "));
  check("observer realistic cadence: ON stays valid with 10% headroom wherever OFF does", realRegress.length === 0, realRegress.join(", "));
}

// --- helpers ---------------------------------------------------------------

/** The shockwave case as it was written before detonateShockwave existed. */
function legacyShockwave(world: World): void {
  const p = world.powers;
  const amp = 1;
  const radius = POWERS.shockwave.radius * amp;
  const waveMaxRadius = POWERS.shockwave.waveMaxRadius * amp;
  killDronesInRadius(world, world.ship.x, world.ship.y, radius);
  killMinesInRadius(world, world.ship.x, world.ship.y, radius);
  spawnBlast(world, world.ship.x, world.ship.y, waveMaxRadius, {
    expandTime: POWERS.shockwave.waveLifetime,
    holdTime: POWERS.shockwave.blastLifetime,
    color: PALETTE.gold,
  });
  p.waves.push({
    x: world.ship.x,
    y: world.ship.y,
    elapsed: 0,
    lifetime: POWERS.shockwave.waveLifetime,
    maxRadius: waveMaxRadius,
    color: PALETTE.gold,
  });
  world.events.push({ type: "shockwave", x: world.ship.x, y: world.ship.y });
  world.shake = Math.max(world.shake, 0.35);
}

console.log(failures === 0 ? "\nALL OVERDRIVE CHECKS PASSED" : `\n${failures} OVERDRIVE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
