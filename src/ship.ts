import { POWERS, SHIP, TILT } from "./config";
import type { InputState } from "./input";
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
  };
}

/** Port of Unity ShipController.FixedUpdate (boost feature removed). */
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

  // --- speed cap + light damping ---
  const maxSpeed = SHIP.maxSpeed;
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
 * mv is a lean strength 0..1 (tilt) or a unit direction (keyboard/stick);
 * input.cruiseSpeed is the flight speed (tilt passes SHIP.maxSpeed).
 */
function updateShipDirect(
  world: World,
  input: InputState,
  mv: { x: number; y: number },
  dt: number,
): void {
  const s = world.ship;
  const tx = mv.x * input.cruiseSpeed;
  const ty = mv.y * input.cruiseSpeed;

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
