import type { World } from "./types";

/**
 * Toroidal screen wrap (port of Unity ScreenWrap): the entity travels up to
 * `marginFrac` of the view size beyond the edge before reappearing opposite.
 */
export function wrap(
  e: { x: number; y: number; prevX: number; prevY: number },
  world: World,
  marginFrac: number,
): void {
  const mx = world.viewW * marginFrac;
  const my = world.viewH * marginFrac;
  const hw = world.viewW / 2;
  const hh = world.viewH / 2;
  let wrapped = false;

  if (e.x < -hw - mx) {
    e.x = hw + mx;
    wrapped = true;
  } else if (e.x > hw + mx) {
    e.x = -hw - mx;
    wrapped = true;
  }
  if (e.y < -hh - my) {
    e.y = hh + my;
    wrapped = true;
  } else if (e.y > hh + my) {
    e.y = -hh - my;
    wrapped = true;
  }

  // avoid interpolating across the whole screen on the wrap frame
  if (wrapped) {
    e.prevX = e.x;
    e.prevY = e.y;
  }
}

/**
 * Distance accounting for the screen-wrap seam: a point just outside the right
 * edge is close to a ship about to wrap from the left edge.
 */
export function toroidalDistance(
  world: World,
  marginFrac: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const periodX = world.viewW * (1 + 2 * marginFrac);
  const periodY = world.viewH * (1 + 2 * marginFrac);
  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);
  dx = Math.min(dx, periodX - dx);
  dy = Math.min(dy, periodY - dy);
  return Math.hypot(dx, dy);
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
  let d = Math.random() * total;

  if (d < hw * 2) return { x: -hw + d, y: hh }; // top
  d -= hw * 2;
  if (d < hw * 2) return { x: -hw + d, y: -hh }; // bottom
  d -= hw * 2;
  if (d < hh * 2) return { x: -hw, y: -hh + d }; // left
  d -= hh * 2;
  return { x: hw, y: -hh + d }; // right
}
