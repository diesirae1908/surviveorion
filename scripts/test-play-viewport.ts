/**
 * Fixed 16x10 / 10x16 playfield, contained in the canvas.
 * Run: npx tsx scripts/test-play-viewport.ts
 */
import assert from "node:assert/strict";
import {
  FIELD_LONG,
  FIELD_SHORT,
  fieldLayout,
  fieldWorldSize,
  playViewport,
} from "../src/playView.ts";
import { SHIP } from "../src/config.ts";

const wide = playViewport(2560, 1080);
assert.deepEqual(wide, { w: 2560, h: 1080 }, "canvas fills the window; field letterboxes inside");

const laptop = playViewport(1440, 900);
assert.deepEqual(laptop, { w: 1440, h: 900 });

const phonePortrait = playViewport(390, 844);
assert.deepEqual(phonePortrait, { w: 390, h: 844 });

const phoneLandscape = playViewport(844, 390);
assert.deepEqual(phoneLandscape, { w: 844, h: 390 });

assert.deepEqual(fieldWorldSize(1440, 900), { w: FIELD_LONG, h: FIELD_SHORT });
assert.deepEqual(fieldWorldSize(1920, 1080), { w: 16, h: 10 });
assert.deepEqual(fieldWorldSize(390, 844), { w: FIELD_SHORT, h: FIELD_LONG });
assert.deepEqual(fieldWorldSize(844, 390), { w: 16, h: 10 });
assert.deepEqual(fieldWorldSize(768, 1024), { w: 10, h: 16 });
assert.deepEqual(fieldWorldSize(1100, 1100), { w: 16, h: 10 }, "square is landscape-ish");

const desk = fieldLayout(1440, 900, 16, 10);
assert.equal(desk.scale, 90);
assert.equal(desk.ox, 0);
assert.equal(desk.oy, 0);
assert.equal(desk.fieldCssW, 1440);
assert.equal(desk.fieldCssH, 900);

const fhd = fieldLayout(1920, 1080, 16, 10);
assert.equal(fhd.scale, 108);
assert.equal(fhd.ox, 96);
assert.equal(fhd.oy, 0);

const portrait = fieldLayout(390, 844, 10, 16);
assert.equal(portrait.scale, 39);
assert.equal(portrait.ox, 0);
assert.equal(portrait.oy, 110);
assert.ok(portrait.oy >= 96, "portrait top bar is tall enough for the left HUD stack");

const landPhone = fieldLayout(844, 390, 16, 10);
assert.equal(landPhone.scale, 39);
assert.equal(landPhone.ox, 110);
assert.equal(landPhone.oy, 0);

const ipad = fieldLayout(768, 1024, 10, 16);
assert.equal(ipad.scale, 64);
assert.equal(ipad.ox, 64);
assert.equal(ipad.oy, 0);

assert.equal(SHIP.wallInset, 0.42);

console.log("PASS  fixed 16x10 / 10x16 field (contain letterbox, 1440x900 fills)");
