import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ANCHOR_EASE_S,
  CROP_MODE_V20,
  CROP_MODE_V21,
  PUSH_IN_PER_SEC,
  baseCropSize,
  clampCrop,
  easedPunchAt,
  inferArena,
  interpolateTrack,
  precomputeCropPath,
  resolveCropMode,
  sendcmdFromPath,
  windowAt,
  worldToPixel,
} from "../src/crop.mjs";

describe("crop engine v2.0", () => {
  it("base window is 9:16 and never larger than the source", () => {
    const { w, h } = baseCropSize(2904, 1656);
    assert.ok(w <= 2904 && h <= 1656);
    assert.ok(Math.abs(w / h - 9 / 16) < 1e-6);
  });

  it("clamp keeps the window inside the frame", () => {
    const c = clampCrop(-50, -50, 2000, 3000, 1000, 1000);
    assert.ok(c.x >= 0 && c.y >= 0);
    assert.ok(c.x + c.w <= 1000);
    assert.ok(c.y + c.h <= 1000);
  });

  it("push-in shrinks the window at 6%/s", () => {
    const a = windowAt({
      t: 0,
      sourceW: 1920,
      sourceH: 1080,
      anchorX: 960,
      anchorY: 540,
      punch: 1,
    });
    const b = windowAt({
      t: 1,
      sourceW: 1920,
      sourceH: 1080,
      anchorX: 960,
      anchorY: 540,
      punch: 1,
    });
    assert.ok(b.w < a.w);
    assert.ok(Math.abs(a.w / b.w - (1 + PUSH_IN_PER_SEC)) < 0.02);
  });

  it("punch eases over 400ms, no snap", () => {
    const keys = [
      { at: 0, value: 1 },
      { at: 1, value: 1.5 },
    ];
    const mid = easedPunchAt(1 + ANCHOR_EASE_S / 2, keys);
    assert.ok(mid > 1 && mid < 1.5);
    assert.equal(easedPunchAt(1.5, keys), 1.5);
  });

  it("CLOSE CALL anchors on graze world x,y; others use arena center", () => {
    const graze = precomputeCropPath({
      duration: 2,
      sourceW: 1920,
      sourceH: 1080,
      graze: { x: 0, y: 0 },
      punches: [{ at: 0, value: 1 }],
    });
    assert.equal(graze.mode, CROP_MODE_V20);
    assert.ok(Math.abs(graze.fallbackAnchor.x - 960) < 1);
    assert.ok(Math.abs(graze.fallbackAnchor.y - 540) < 1);

    const board = precomputeCropPath({
      duration: 2,
      sourceW: 1920,
      sourceH: 1080,
    });
    assert.equal(board.fallbackAnchor.x, 960);
    assert.equal(board.fallbackAnchor.y, 540);
    assert.equal(board.mode, CROP_MODE_V20);
  });

  it("worldToPixel uses center-origin arena", () => {
    const p = worldToPixel(0, 0, 1000, 1000, { w: 10, h: 10 });
    assert.equal(p.px, 500);
    assert.equal(p.py, 500);
  });

  it("sendcmd lists crop x/y/w/h", () => {
    const { frames } = precomputeCropPath({
      duration: 0.1,
      sourceW: 1920,
      sourceH: 1080,
      fps: 10,
    });
    const cmd = sendcmdFromPath(frames);
    assert.match(cmd, /crop w /);
    assert.match(cmd, /crop x /);
    assert.ok(!cmd.includes("pad"));
  });

  it("v2.1 when track+arena+view exist; interpolates track", () => {
    const sidecar = {
      track: [
        [0, 0, 0],
        [1, 2, 0],
      ],
      arena: { w: 10, h: 10 },
      view: { w: 1920, h: 1080 },
    };
    assert.equal(resolveCropMode(sidecar), CROP_MODE_V21);
    const mid = interpolateTrack(sidecar.track, 0.5);
    assert.equal(mid.x, 1);
    const path = precomputeCropPath({
      duration: 1,
      sourceW: 1920,
      sourceH: 1080,
      fps: 10,
      sidecar,
      sourceTimeAt: (t) => t,
    });
    assert.equal(path.mode, CROP_MODE_V21);
  });

  it("inferArena falls back to VIEW_MIN aspect when sidecar has no track", () => {
    const a = inferArena(2904, 1656, {});
    assert.equal(a.source, "v2.0-aspect");
    assert.ok(a.h === 10);
  });
});
