// Flight trace: the run's ship track as a downsampled, fitted path for the
// result screen. Pure (no DOM, no sim state, no RNG).
//
// The sim samples the ship every 0.5 s into world.shipTrack and stops at
// CLIP_TRACK_CAP samples, so a long run's track ends well before the ship does.
// The death point therefore always comes from world.deathCause (the ship's
// position at the moment of death), never the last track sample.

import type { DeathCause } from "./types";

/** `[t, x, y]` in world units: centered on the origin, y up (see clipSidecar). */
export type TraceSample = [number, number, number];

export interface TraceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TracePath {
  /** Screen-space points inside the box, y down. */
  points: Array<[number, number]>;
  /** The red impact mark, set by appendDeathPoint. */
  death: [number, number] | null;
  /** World to box projection (shared by the track and the death point). */
  project(x: number, y: number): [number, number];
}

/** Hard cap on drawn points: the SVG stays light and the line stays smooth. */
export const TRACE_MAX_POINTS = 180;

/**
 * Downsample (evenly by index, first and last always kept), fit the world
 * field into `box` with one uniform scale (aspect kept, centered), flip y-up
 * to y-down. Points outside the field are clamped to the box edge.
 */
export function traceToPath(
  track: ReadonlyArray<TraceSample>,
  field: { w: number; h: number },
  box: TraceBox,
  maxPoints: number = TRACE_MAX_POINTS,
): TracePath {
  const fw = Math.max(1e-6, field.w);
  const fh = Math.max(1e-6, field.h);
  const k = Math.min(box.w / fw, box.h / fh);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const project = (x: number, y: number): [number, number] => [
    clamp(cx + x * k, box.x, box.x + box.w),
    clamp(cy - y * k, box.y, box.y + box.h),
  ];

  const cap = Math.max(2, Math.floor(maxPoints));
  const n = track.length;
  const idx: number[] = [];
  if (n <= cap) {
    for (let i = 0; i < n; i++) idx.push(i);
  } else {
    for (let i = 0; i < cap; i++) idx.push(Math.round((i * (n - 1)) / (cap - 1)));
  }
  const points = idx.map((i) => project(track[i][1], track[i][2]));
  return { points, death: null, project };
}

/** Append the impact point from world.deathCause (no-op when the cause is unknown). */
export function appendDeathPoint(path: TracePath, cause: DeathCause | null | undefined): TracePath {
  if (!cause) return path;
  const p = path.project(cause.x, cause.y);
  path.points.push(p);
  path.death = p;
  return path;
}

/**
 * SVG path data for a TracePath. Smoothed with quadratic curves through the
 * segment midpoints so the 0.5 s samples read as a flight line, not a polyline.
 */
export function pathData(path: TracePath): string {
  const pts = path.points;
  if (pts.length === 0) return "";
  const f = (n: number): string => n.toFixed(1);
  if (pts.length < 3) return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${f(x)} ${f(y)}`).join(" ");
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${f(last[0])} ${f(last[1])}`;
}
