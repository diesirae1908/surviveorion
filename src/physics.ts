import { rand } from "./math";
import type { World } from "./types";

/**
 * Hard arena walls: stop the entity at the view edge and zero velocity into
 * the wall so the ship slides along the boundary (inertia-friendly).
 */
export function clampToBounds(
  e: { x: number; y: number; prevX: number; prevY: number; vx: number; vy: number },
  world: World,
  radius: number,
): boolean {
  const hw = world.viewW / 2 - radius;
  const hh = world.viewH / 2 - radius;
  let hit = false;

  if (e.x < -hw) {
    e.x = -hw;
    e.vx = 0;
    hit = true;
  } else if (e.x > hw) {
    e.x = hw;
    e.vx = 0;
    hit = true;
  }
  if (e.y < -hh) {
    e.y = -hh;
    e.vy = 0;
    hit = true;
  } else if (e.y > hh) {
    e.y = hh;
    e.vy = 0;
    hit = true;
  }

  return hit;
}

export function circlesOverlap(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const r = r1 + r2;
  return dx * dx + dy * dy <= r * r;
}

/** Half-diagonal of the view (distance from center to a corner). */
export function halfDiagonal(world: World): number {
  return Math.hypot(world.viewW / 2, world.viewH / 2);
}

/**
 * Random point just outside the view edge (`margin` world units beyond),
 * uniformly distributed along the perimeter.
 */
export function randomEdgePoint(world: World, margin: number): { x: number; y: number } {
  const hw = world.viewW / 2 + margin;
  const hh = world.viewH / 2 + margin;
  const total = 2 * (hw * 2 + hh * 2);
  let d = rand() * total;

  if (d < hw * 2) return { x: -hw + d, y: hh }; // top
  d -= hw * 2;
  if (d < hw * 2) return { x: -hw + d, y: -hh }; // bottom
  d -= hw * 2;
  if (d < hh * 2) return { x: -hw, y: -hh + d }; // left
  d -= hh * 2;
  return { x: hw, y: -hh + d }; // right
}
