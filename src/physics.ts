import { rand } from "./math";
import type { World } from "./types";

/**
 * Hard arena walls: stop the entity at the view edge and zero only the
 * velocity component into the wall, so the ship can slide along the
 * boundary and still thrust away (SOLAR WIND pinning used to wipe the
 * outward component every frame).
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
    if (e.vx < 0) e.vx = 0;
    hit = true;
  } else if (e.x > hw) {
    e.x = hw;
    if (e.vx > 0) e.vx = 0;
    hit = true;
  }
  if (e.y < -hh) {
    e.y = -hh;
    if (e.vy < 0) e.vy = 0;
    hit = true;
  } else if (e.y > hh) {
    e.y = hh;
    if (e.vy > 0) e.vy = 0;
    hit = true;
  }

  return hit;
}

/**
 * Drop the wind component that would shove the hull deeper into a wall
 * it's already on. Drones are not clamped and must not use this.
 */
export function cancelIntoWallWind(
  e: { x: number; y: number },
  world: World,
  radius: number,
  wind: { x: number; y: number },
): { x: number; y: number } {
  const hw = world.viewW / 2 - radius;
  const hh = world.viewH / 2 - radius;
  const slop = 1e-4;
  let wx = wind.x;
  let wy = wind.y;
  if (e.x <= -hw + slop && wx < 0) wx = 0;
  if (e.x >= hw - slop && wx > 0) wx = 0;
  if (e.y <= -hh + slop && wy < 0) wy = 0;
  if (e.y >= hh - slop && wy > 0) wy = 0;
  return { x: wx, y: wy };
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
