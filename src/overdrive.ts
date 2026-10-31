// OVERDRIVE core: the hull charges from grazes (and a little from kills),
// goes HOT at full charge, and the next orb fires its Overdrive form.
//
// Pure player-side sim: no seeded draws anywhere (the Daily's spawn script is
// seeded; this module only reacts to what the pilot does). No score source:
// HOT pays nothing, forms kill through killDrone/registerKill like every other
// power. Everything is gated on `world.rules.overdrive !== null`; with the
// switch off every function here returns immediately and the game is the game
// it was before.
//
// Tuning lives in the switch registry (server/flags-registry.json), read from
// `world.rules.overdrive`. Design constants below are not switches.

import { SCORING, SHIP, type PowerId } from "./config";
import { droneRadius, killDrone, killDronesInRadius } from "./enemies";
import { killMinesInRadius } from "./mines";
import { mutatorGrazeBandScale, mutatorOverdriveChargeScaleRaw, mutatorSwarmAlwaysHot } from "./mutators";
import { detonateShockwave } from "./powers";
import type { OverdriveState, World } from "./types";

/** Powers that have an Overdrive form (generation 1 and 2). Others get the burst only. */
const FORM_POWERS: ReadonlySet<PowerId> = new Set<PowerId>([
  "pulse",
  "shield",
  "freeze",
  "magnet",
  "shockwave",
  "missiles",
  "starshell",
  "arc",
  "autocannon",
  "meteors",
  "razor",
  "thunder",
  "cloak",
  "flare",
  "ion",
  "howlers",
  "vortex",
]);

export function createOverdriveState(): OverdriveState {
  return {
    charge: 0,
    hot: false,
    armed: false,
    armTime: 0,
    hotTime: 0,
    drainTimer: 0,
    lockout: 0,
    killChargeWindow: 0,
    hotCount: 0,
    fires: 0,
    pulseFan: null,
    shieldCharged: false,
    pending: [],
    chainQueue: [],
  };
}

/** GRAZE PROTOCOL and friends scale the charge, unless the hook is off. */
export function mutatorOverdriveChargeScale(world: World): number {
  const od = world.rules.overdrive;
  return od && od.mutatorHooks ? mutatorOverdriveChargeScaleRaw() : 1;
}

/** Design constant: contact longer than this cannot hold HOT off (armWhenClear). */
export const ARM_MAX_SECONDS = 3;

/** True when a hostile, non-frozen drone is inside the graze band (the hull is in contact range). */
function inGrazeBand(world: World): boolean {
  const s = world.ship;
  const band = SCORING.grazeBand * mutatorGrazeBandScale();
  for (const d of world.drones) {
    if (!d.alive || d.allied || d.frozen > 0) continue;
    const outer = SHIP.radius + droneRadius(d) + band;
    const dx = d.x - s.x;
    const dy = d.y - s.y;
    if (dx * dx + dy * dy <= outer * outer) return true;
  }
  return false;
}

function startHot(world: World): void {
  const o = world.overdrive;
  o.armed = false;
  o.armTime = 0;
  o.hot = true;
  o.hotTime = 0;
  o.hotCount++;
  world.events.push({ type: "overdriveHot" });
}

function addCharge(world: World, amount: number): void {
  const o = world.overdrive;
  if (o.hot || o.armed || amount <= 0) return;
  o.charge = Math.min(1, o.charge + amount);
  if (o.charge >= 1) {
    // Full meter in contact range: wait for a clear hull so HOT never starts mid-graze.
    if (world.rules.overdrive?.armWhenClear === true && inGrazeBand(world)) {
      o.armed = true;
      o.armTime = 0;
    } else {
      startHot(world);
    }
  }
}

/** A graze charges the hull; razor-thin ones charge more, loose ones less. */
export function chargeFromGraze(world: World, clearance: number): void {
  const od = world.rules.overdrive;
  if (!od || world.overdrive.hot || world.overdrive.armed) return;
  const tier =
    clearance < od.razorClearance
      ? od.razorGrazeScale
      : clearance > od.outerClearance
        ? od.outerGrazeScale
        : 1;
  world.overdrive.drainTimer = od.drainDelay;
  addCharge(world, od.chargePerGraze * tier * mutatorOverdriveChargeScale(world));
}

/** Kills add a trickle: capped per second, and locked out right after a spend. */
export function chargeFromKill(world: World): void {
  const od = world.rules.overdrive;
  const o = world.overdrive;
  if (!od || o.hot || o.armed || o.lockout > 0) return;
  const room = Math.max(0, od.maxKillChargePerSec - o.killChargeWindow);
  const gain = Math.min(od.chargePerKill, room);
  if (gain <= 0) return;
  o.killChargeWindow += gain;
  addCharge(world, gain);
}

/**
 * Generation 2: a mutator that keeps the swarm hot (OVERCHARGE) speeds nearby
 * drones by `alwaysHotScale` whether or not the hull is HOT. 1 (no effect)
 * without the overdrive switch, the `mutatorHooks` param, or the param itself.
 */
export function alwaysHotScale(world: World): number {
  const od = world.rules.overdrive;
  if (!od || !od.mutatorHooks || !mutatorSwarmAlwaysHot()) return 1;
  return od.alwaysHotScale ?? 1;
}

/** Loose drones near a HOT hull speed up ("the swarm smells the heat"). */
export function overdriveHeatScale(world: World, distToShip: number): number {
  const od = world.rules.overdrive;
  if (!od) return 1;
  if (distToShip >= od.hotRadius) return 1;
  return Math.max(world.overdrive.hot ? od.hotDroneSpeedScale : 1, alwaysHotScale(world));
}

/**
 * An orb was collected. If the hull is HOT, spend it: reset the meter, lock
 * out kill-charge for a few seconds, fire the burst, and tell the caller
 * whether this power runs its Overdrive form (true) or just the burst (false).
 */
export function spendOverdrive(world: World, power: PowerId): boolean {
  const od = world.rules.overdrive;
  const o = world.overdrive;
  // an armed (full, held) meter spends exactly like HOT: the orb is not wasted
  if (!od || !(o.hot || o.armed)) return false;
  o.hot = false;
  o.armed = false;
  o.armTime = 0;
  o.charge = 0;
  o.hotTime = 0;
  o.fires++;
  o.lockout = od.killChargeLockout;
  o.killChargeWindow = 0;

  const formParams = (od.forms as Record<string, { on?: boolean } | undefined>)[power];
  const form = FORM_POWERS.has(power) && formParams?.on === true;

  if (od.burstRadius > 0) {
    const s = world.ship;
    killDronesInRadius(world, s.x, s.y, od.burstRadius);
    killMinesInRadius(world, s.x, s.y, od.burstRadius);
  }
  world.events.push({ type: "overdriveFire", power, x: world.ship.x, y: world.ship.y, form });
  return form;
}

/** Call once per fixed tick, right after updateScoring. */
export function updateOverdrive(world: World, dt: number): void {
  const od = world.rules.overdrive;
  if (!od || world.phase !== "playing") return;
  const o = world.overdrive;

  o.killChargeWindow = Math.max(0, o.killChargeWindow - od.maxKillChargePerSec * dt);
  if (o.lockout > 0) o.lockout = Math.max(0, o.lockout - dt);

  if (o.armed) {
    // meter held full; HOT starts once clear, or after ARM_MAX_SECONDS regardless
    o.armTime += dt;
    if (!inGrazeBand(world) || o.armTime >= ARM_MAX_SECONDS) startHot(world);
  } else if (o.hot) {
    o.hotTime += dt;
    if (od.hotMaxSeconds > 0 && o.hotTime >= od.hotMaxSeconds) {
      o.hot = false;
      o.charge = 0;
      o.hotTime = 0;
      world.events.push({ type: "overdriveCool" });
    }
  } else if (o.charge > 0) {
    if (o.drainTimer > 0) o.drainTimer -= dt;
    else o.charge = Math.max(0, o.charge - od.drainPerSec * dt);
  }

  // delayed effects (shockwave echo)
  for (let i = o.pending.length - 1; i >= 0; i--) {
    const pe = o.pending[i];
    pe.t -= dt;
    if (pe.t <= 0) {
      o.pending.splice(i, 1);
      detonateShockwave(world, world.ship.x, world.ship.y, pe.scale);
    }
  }

  runFreezeChain(world);
}

/**
 * Freeze form: a frozen-by-Overdrive drone that shatters queues its position;
 * here every queued shatter pulls its frozen neighbors within `chainRadius`
 * along, at most `chainMax` per chain, walked breadth-first with a local frontier
 * (no recursion). Chained kills clear the flag first so they never re-queue.
 */
function runFreezeChain(world: World): void {
  const od = world.rules.overdrive;
  const o = world.overdrive;
  if (!od || o.chainQueue.length === 0) return;
  const chainRadius = od.forms.freeze.chainRadius;
  const queue = o.chainQueue;
  o.chainQueue = [];
  for (const q of queue) {
    let left = q.left;
    const frontier = [{ x: q.x, y: q.y }];
    while (frontier.length > 0 && left > 0) {
      const f = frontier.pop()!;
      for (const d of world.drones) {
        if (left <= 0) break;
        if (!d.alive || d.allied || !d.odFrozen || d.frozen <= 0) continue;
        const dx = d.x - f.x;
        const dy = d.y - f.y;
        if (dx * dx + dy * dy > chainRadius * chainRadius) continue;
        d.odFrozen = false;
        frontier.push({ x: d.x, y: d.y });
        killDrone(world, d);
        left--;
      }
    }
  }
}
