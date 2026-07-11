import { DIRECT, POWERS, SHIP, TILT } from "./config";
import type { InputState } from "./input";
import { clamp01, lerp } from "./math";
import { clampToBounds } from "./physics";
import type { Ship, World } from "./types";

export function createShip(): Ship {
  return {
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    angle: Math.PI / 2, // facing up
    prevAngle: Math.PI / 2,
    thrusting: 0,
    boostHeld: false,
    boostHoldTimer: 0,
    boostCooldownTimer: 0,
  };
}

/** Port of Unity ShipController.FixedUpdate + boost state machine. */
export function updateShip(world: World, input: InputState, dt: number): void {
  const s = world.ship;
  s.prevX = s.x;
  s.prevY = s.y;
  s.prevAngle = s.angle;

  // afterburner dash: locked on a straight line at dash speed, input ignored
  if (world.powers.afterburnerDash > 0) {
    const fx = Math.cos(s.angle);
    const fy = Math.sin(s.angle);
    s.vx = fx * POWERS.afterburner.dashSpeed;
    s.vy = fy * POWERS.afterburner.dashSpeed;
    s.thrusting = 1;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    const hitWall = clampToBounds(s, world, SHIP.radius);
    // hard brake on the last dash step so the ship exits controllable
    if (world.powers.afterburnerDash <= dt || hitWall) {
      s.vx = fx * POWERS.afterburner.exitSpeed;
      s.vy = fy * POWERS.afterburner.exitSpeed;
      if (hitWall) {
        world.powers.afterburnerDash = 0;
        world.powers.afterburnerGrace = POWERS.afterburner.arrivalInvulnTime;
      }
    }
    return;
  }

  if (input.moveVector !== null) {
    // tilt or directional no-inertia: direct velocity, hull faces travel
    updateShipDirect(world, input, input.moveVector, dt);
    return;
  }

  if (input.heading !== null) {
    // touch: rotate toward the stick direction (shortest way around)
    let diff = input.heading - s.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = SHIP.rotateSpeed * dt;
    s.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
  } else {
    s.angle += -input.turn * SHIP.rotateSpeed * dt;
  }

  const fx = Math.cos(s.angle);
  const fy = Math.sin(s.angle);

  s.thrusting = input.thrust;
  if (input.thrust > 0) {
    const a = SHIP.thrust * input.thrust;
    s.vx += fx * a * dt;
    s.vy += fy * a * dt;
  }

  // --- boost (hold to ramp force, capped hold time, cooldown after) ---
  if (s.boostCooldownTimer > 0) s.boostCooldownTimer -= dt;

  if (input.boost && !s.boostHeld && s.boostCooldownTimer <= 0) {
    s.boostHeld = true;
    s.boostHoldTimer = 0;
    world.events.push({ type: "boostStart" });
  } else if (!input.boost && s.boostHeld) {
    stopBoost(s);
  }

  if (s.boostHeld) {
    s.boostHoldTimer += dt;
    const t = clamp01(s.boostHoldTimer / SHIP.boost.rampTime);
    const force = lerp(SHIP.boost.initialForce, SHIP.boost.maxForce, t);
    s.vx += fx * force * dt;
    s.vy += fy * force * dt;
    if (s.boostHoldTimer >= SHIP.boost.maxHoldTime) stopBoost(s);
  }

  // --- speed cap + light damping ---
  let maxSpeed = SHIP.maxSpeed;
  if (s.boostHeld) maxSpeed *= SHIP.boost.maxSpeedMultiplier;

  const speedSq = s.vx * s.vx + s.vy * s.vy;
  if (speedSq > maxSpeed * maxSpeed) {
    const speed = Math.sqrt(speedSq);
    s.vx = (s.vx / speed) * maxSpeed;
    s.vy = (s.vy / speed) * maxSpeed;
  }

  const damp = 1 / (1 + SHIP.linearDamping * dt);
  s.vx *= damp;
  s.vy *= damp;

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  clampToBounds(s, world, SHIP.radius);
}

/**
 * Direct control (Tilt to Live rules): velocity converges straight to a target
 * — no thrust integration, no damping, no drift. Hull faces travel direction.
 *
 * - Tilt: mv is lean strength 0..1 × SHIP.maxSpeed; boost uses ramp/cooldown.
 * - Keyboard/stick (simpleBoost): mv is a unit direction; cruise vs boostSpeed
 *   with a plain hold (no timers).
 */
function updateShipDirect(
  world: World,
  input: InputState,
  mv: { x: number; y: number },
  dt: number,
): void {
  const s = world.ship;
  let tx: number;
  let ty: number;

  if (input.simpleBoost) {
    // two-speed: cruise while moving, hold Space for full speed — no cooldown
    if (input.boost && !s.boostHeld) {
      s.boostHeld = true;
      s.boostHoldTimer = 0;
      world.events.push({ type: "boostStart" });
    } else if (!input.boost && s.boostHeld) {
      s.boostHeld = false;
      s.boostHoldTimer = 0;
    }
    const speed = input.boost ? DIRECT.boostSpeed : input.cruiseSpeed;
    tx = mv.x * speed;
    ty = mv.y * speed;
  } else {
    // tilt: managed boost multiplies max speed
    if (s.boostCooldownTimer > 0) s.boostCooldownTimer -= dt;
    if (input.boost && !s.boostHeld && s.boostCooldownTimer <= 0) {
      s.boostHeld = true;
      s.boostHoldTimer = 0;
      world.events.push({ type: "boostStart" });
    } else if (!input.boost && s.boostHeld) {
      stopBoost(s);
    }
    if (s.boostHeld) {
      s.boostHoldTimer += dt;
      if (s.boostHoldTimer >= SHIP.boost.maxHoldTime) stopBoost(s);
    }
    const speedScale = s.boostHeld ? SHIP.boost.maxSpeedMultiplier : 1;
    tx = mv.x * SHIP.maxSpeed * speedScale;
    ty = mv.y * SHIP.maxSpeed * speedScale;
  }

  // tight exponential approach: reads as instant but filters sensor jitter
  const k = 1 - Math.exp(-TILT.response * dt);
  s.vx += (tx - s.vx) * k;
  s.vy += (ty - s.vy) * k;

  const speed = Math.hypot(s.vx, s.vy);
  if (speed > 0.5) {
    let diff = Math.atan2(s.vy, s.vx) - s.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = TILT.rotateSpeed * dt;
    s.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
  }

  s.thrusting = Math.min(1, Math.hypot(mv.x, mv.y));
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  clampToBounds(s, world, SHIP.radius);
}

function stopBoost(s: Ship): void {
  s.boostHeld = false;
  s.boostHoldTimer = 0;
  s.boostCooldownTimer = SHIP.boost.cooldown;
}
