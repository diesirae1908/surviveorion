/**
 * Crop engine v2.0: full-bleed 9:16 window path, pure + testable.
 * v2.1 follows sidecar.track when present; otherwise v2.0 fallbacks.
 */

export const VIEW_MIN = 10;
export const OUT_W = 1080;
export const OUT_H = 1920;
export const PUSH_IN_PER_SEC = 0.06;
export const ANCHOR_EASE_S = 0.4;
export const CROP_FPS = 30;
export const CROP_MODE_V20 = "v2.0";
export const CROP_MODE_V21 = "v2.1";

/**
 * @param {number} t
 */
export function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Largest 9:16 window that fits in the source (never pads).
 * @param {number} sourceW
 * @param {number} sourceH
 */
export function baseCropSize(sourceW, sourceH) {
  const target = 9 / 16;
  const src = sourceW / sourceH;
  if (src > target) {
    const h = sourceH;
    return { w: h * target, h };
  }
  const w = sourceW;
  return { w, h: w / target };
}

/**
 * Infer world arena when sidecar has no arena/view (v2.0).
 * Shorter axis is VIEW_MIN, matching orion-web.
 * @param {number} sourceW
 * @param {number} sourceH
 * @param {{ arena?: { w: number, h: number }, view?: { w: number, h: number } }} [sidecar]
 */
export function inferArena(sourceW, sourceH, sidecar = {}) {
  if (sidecar.arena && sidecar.arena.w > 0 && sidecar.arena.h > 0) {
    return { w: sidecar.arena.w, h: sidecar.arena.h, source: "sidecar.arena" };
  }
  if (sidecar.view && sidecar.view.w > 0 && sidecar.view.h > 0) {
    const aspect = sidecar.view.w / sidecar.view.h;
    if (aspect >= 1) {
      return { w: VIEW_MIN * aspect, h: VIEW_MIN, source: "sidecar.view" };
    }
    return { w: VIEW_MIN, h: VIEW_MIN / aspect, source: "sidecar.view" };
  }
  const aspect = sourceW / sourceH;
  if (aspect >= 1) {
    return { w: VIEW_MIN * aspect, h: VIEW_MIN, source: "v2.0-aspect" };
  }
  return { w: VIEW_MIN, h: VIEW_MIN / aspect, source: "v2.0-aspect" };
}

/**
 * World (origin at arena center) -> source pixels.
 * @param {number} x
 * @param {number} y
 * @param {number} sourceW
 * @param {number} sourceH
 * @param {{ w: number, h: number }} arena
 */
export function worldToPixel(x, y, sourceW, sourceH, arena) {
  return {
    px: (x / arena.w + 0.5) * sourceW,
    py: (y / arena.h + 0.5) * sourceH,
  };
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} sourceW
 * @param {number} sourceH
 */
export function clampCrop(x, y, w, h, sourceW, sourceH) {
  const cw = Math.min(Math.max(2, w), sourceW);
  const ch = Math.min(Math.max(2, h), sourceH);
  const cx = Math.min(Math.max(0, x), Math.max(0, sourceW - cw));
  const cy = Math.min(Math.max(0, y), Math.max(0, sourceH - ch));
  return { x: cx, y: cy, w: cw, h: ch };
}

/**
 * @param {{
 *   t: number,
 *   sourceW: number,
 *   sourceH: number,
 *   anchorX: number,
 *   anchorY: number,
 *   pushInPerSec?: number,
 *   punch?: number,
 *   shakeX?: number,
 *   shakeY?: number,
 * }} opts
 */
export function windowAt({
  t,
  sourceW,
  sourceH,
  anchorX,
  anchorY,
  pushInPerSec = PUSH_IN_PER_SEC,
  punch = 1,
  shakeX = 0,
  shakeY = 0,
}) {
  const base = baseCropSize(sourceW, sourceH);
  const zoom = Math.max(1, (1 + pushInPerSec * Math.max(0, t)) * punch);
  const w = base.w / zoom;
  const h = base.h / zoom;
  return clampCrop(
    anchorX - w / 2 + shakeX,
    anchorY - h / 2 + shakeY,
    w,
    h,
    sourceW,
    sourceH
  );
}

/**
 * Piecewise punch with 400ms ease between values (no snaps).
 * @param {number} t
 * @param {{ at: number, value: number }[]} keys  sorted by at
 * @param {number} [easeS]
 */
export function easedPunchAt(t, keys, easeS = ANCHOR_EASE_S) {
  if (!keys.length) return 1;
  let from = keys[0].value;
  let to = keys[0].value;
  let start = keys[0].at;
  let seen = false;
  for (const k of keys) {
    if (t >= k.at) {
      from = seen ? to : k.value;
      to = k.value;
      start = k.at;
      seen = true;
    }
  }
  if (!seen) return keys[0].value;
  if (from === to) return to;
  const u = smoothstep((t - start) / easeS);
  return from + (to - from) * u;
}

/**
 * @param {number} t
 * @param {{ at: number, amp?: number, dur?: number }[]} shakes
 */
export function shakeAt(t, shakes) {
  let sx = 0;
  let sy = 0;
  for (const s of shakes) {
    const dur = s.dur ?? 0.18;
    const dt = t - s.at;
    if (dt < 0 || dt > dur) continue;
    const amp = s.amp ?? 6;
    const fall = 1 - dt / dur;
    sx += Math.sin(dt * 62) * amp * fall;
    sy += Math.cos(dt * 51) * amp * 0.7 * fall;
  }
  return { shakeX: sx, shakeY: sy };
}

/**
 * Ease an anchor (pixel) toward a target over 400ms.
 * @param {{ x: number, y: number }[]} samples  one per frame, already in pixels
 * @param {number} fps
 * @param {number} [easeS]
 */
export function easeAnchorPath(samples, fps, easeS = ANCHOR_EASE_S) {
  if (samples.length === 0) return samples;
  const out = [{ ...samples[0] }];
  const alpha = 1 - Math.exp(-1 / (easeS * fps));
  for (let i = 1; i < samples.length; i++) {
    const prev = out[i - 1];
    const tgt = samples[i];
    out.push({
      x: prev.x + (tgt.x - prev.x) * alpha,
      y: prev.y + (tgt.y - prev.y) * alpha,
    });
  }
  return out;
}

/**
 * Sample sidecar.track [t,x,y] at 2 Hz (or any cadence) to output time.
 * @param {[number, number, number][]} track
 * @param {number} sourceTime
 */
export function interpolateTrack(track, sourceTime) {
  if (!track.length) return null;
  if (sourceTime <= track[0][0]) return { x: track[0][1], y: track[0][2] };
  const last = track[track.length - 1];
  if (sourceTime >= last[0]) return { x: last[1], y: last[2] };
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    if (sourceTime <= b[0]) {
      const u = (sourceTime - a[0]) / (b[0] - a[0] || 1);
      return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u };
    }
  }
  return { x: last[1], y: last[2] };
}

/**
 * @param {{
 *   duration: number,
 *   sourceW: number,
 *   sourceH: number,
 *   fps?: number,
 *   sidecar?: object,
 *   graze?: { x?: number, y?: number },
 *   punches?: { at: number, value: number }[],
 *   shakes?: { at: number, amp?: number, dur?: number }[],
 *   sourceTimeAt?: (outT: number) => number,
 * }} opts
 */
export function resolveCropMode(sidecar) {
  if (sidecar?.track?.length && sidecar.arena && sidecar.view) {
    return CROP_MODE_V21;
  }
  return CROP_MODE_V20;
}

/**
 * Precompute the 9:16 window per output frame.
 * @param {Parameters<typeof resolveCropMode>[0] extends never ? never : {
 *   duration: number,
 *   sourceW: number,
 *   sourceH: number,
 *   fps?: number,
 *   sidecar?: object,
 *   graze?: { x?: number, y?: number },
 *   punches?: { at: number, value: number }[],
 *   shakes?: { at: number, amp?: number, dur?: number }[],
 *   sourceTimeAt?: (outT: number) => number,
 * }} opts
 */
export function precomputeCropPath({
  duration,
  sourceW,
  sourceH,
  fps = CROP_FPS,
  sidecar = {},
  graze = null,
  punches = [],
  shakes = [],
  sourceTimeAt = null,
}) {
  const mode = resolveCropMode(sidecar);
  const arena = inferArena(sourceW, sourceH, sidecar);
  const center = { x: sourceW / 2, y: sourceH / 2 };

  let fallbackAnchor = center;
  if (graze && Number.isFinite(graze.x) && Number.isFinite(graze.y)) {
    const p = worldToPixel(graze.x, graze.y, sourceW, sourceH, arena);
    fallbackAnchor = { x: p.px, y: p.py };
  }

  const n = Math.max(1, Math.round(duration * fps));
  /** @type {{ x: number, y: number }[]} */
  const rawAnchors = [];
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    if (mode === CROP_MODE_V21 && sidecar.track?.length && sourceTimeAt) {
      const srcT = sourceTimeAt(t);
      const wpos = interpolateTrack(sidecar.track, srcT);
      if (wpos) {
        const p = worldToPixel(wpos.x, wpos.y, sourceW, sourceH, sidecar.arena);
        rawAnchors.push({ x: p.px, y: p.py });
        continue;
      }
    }
    rawAnchors.push(fallbackAnchor);
  }

  const anchors = easeAnchorPath(rawAnchors, fps);
  /** @type {{ t: number, x: number, y: number, w: number, h: number }[]} */
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const punch = easedPunchAt(t, punches);
    const { shakeX, shakeY } = shakeAt(t, shakes);
    const win = windowAt({
      t,
      sourceW,
      sourceH,
      anchorX: anchors[i].x,
      anchorY: anchors[i].y,
      punch,
      shakeX,
      shakeY,
    });
    frames.push({ t, ...win });
  }

  return { mode, arena, frames, fallbackAnchor };
}

/**
 * ffmpeg sendcmd script driving crop x/y/w/h.
 * @param {{ t: number, x: number, y: number, w: number, h: number }[]} frames
 */
export function sendcmdFromPath(frames) {
  return frames
    .map((f) => {
      const ts = f.t.toFixed(4);
      return [
        `${ts} crop w ${Math.round(f.w)};`,
        `${ts} crop h ${Math.round(f.h)};`,
        `${ts} crop x ${Math.round(f.x)};`,
        `${ts} crop y ${Math.round(f.y)};`,
      ].join("\n");
    })
    .join("\n");
}
