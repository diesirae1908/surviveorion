/**
 * Flexible 16:10 to 16:9 playfield, contained in the canvas.
 * Run: npx tsx scripts/test-play-viewport.ts
 */
import assert from "node:assert/strict";
import {
  FIELD_ASPECT_MAX,
  FIELD_ASPECT_MIN,
  FIELD_LONG,
  FIELD_LONG_MAX,
  FIELD_SHORT,
  fieldLayout,
  fieldWorldSize,
  playViewport,
} from "../src/playView.ts";
import { SHIP } from "../src/config.ts";

const approx = (got: number, want: number, label: string, eps = 1e-6): void => {
  assert.ok(Math.abs(got - want) < eps, `${label}: ${got} !~ ${want}`);
};

const wide = playViewport(2560, 1080);
assert.deepEqual(wide, { w: 2560, h: 1080 }, "canvas fills the window; field letterboxes inside");

const laptop = playViewport(1440, 900);
assert.deepEqual(laptop, { w: 1440, h: 900 });

const phonePortrait = playViewport(390, 844);
assert.deepEqual(phonePortrait, { w: 390, h: 844 });

const phoneLandscape = playViewport(844, 390);
assert.deepEqual(phoneLandscape, { w: 844, h: 390 });

assert.equal(FIELD_ASPECT_MIN, 1.6);
assert.equal(FIELD_ASPECT_MAX, 16 / 9);
assert.equal(FIELD_LONG, 16);
approx(FIELD_LONG_MAX, 160 / 9, "FIELD_LONG_MAX");

const deskWorld = fieldWorldSize(1440, 900);
assert.deepEqual(deskWorld, { w: FIELD_LONG, h: FIELD_SHORT }, "16:10 fills at 16x10");

const fhdWorld = fieldWorldSize(1920, 1080);
approx(fhdWorld.w, FIELD_LONG_MAX, "1920x1080 world.w");
assert.equal(fhdWorld.h, FIELD_SHORT);

const wide169 = fieldWorldSize(1600, 900);
approx(wide169.w, FIELD_LONG_MAX, "1600x900 world.w");
assert.equal(wide169.h, FIELD_SHORT);

const ultraWorld = fieldWorldSize(2560, 1080);
approx(ultraWorld.w, FIELD_LONG_MAX, "ultrawide clamps at 16:9");
assert.equal(ultraWorld.h, FIELD_SHORT);

const lucasWorld = fieldWorldSize(1024, 581);
approx(lucasWorld.h, FIELD_SHORT, "1024x581 short axis");
approx(lucasWorld.w, FIELD_SHORT * (1024 / 581), "1024x581 long axis follows window");

assert.deepEqual(fieldWorldSize(768, 1024), { w: FIELD_SHORT, h: FIELD_LONG }, "iPad 4:3 portrait stays 10x16");
assert.deepEqual(fieldWorldSize(1100, 1100), { w: FIELD_LONG, h: FIELD_SHORT }, "square is landscape-ish 16:10");

const phoneP = fieldWorldSize(390, 844);
assert.equal(phoneP.w, FIELD_SHORT);
approx(phoneP.h, FIELD_LONG_MAX, "tall portrait clamps at 16:9");

const phoneL = fieldWorldSize(844, 390);
approx(phoneL.w, FIELD_LONG_MAX, "phone landscape clamps at 16:9");
assert.equal(phoneL.h, FIELD_SHORT);

const desk = fieldLayout(1440, 900, deskWorld.w, deskWorld.h);
assert.equal(desk.scale, 90);
assert.equal(desk.ox, 0);
assert.equal(desk.oy, 0);
assert.equal(desk.fieldCssW, 1440);
assert.equal(desk.fieldCssH, 900);

const fill169 = fieldLayout(1600, 900, wide169.w, wide169.h);
approx(fill169.scale, 90, "1600x900 px/unit");
approx(fill169.ox, 0, "1600x900 no side bars");
approx(fill169.oy, 0, "1600x900 no top bars");

const fhd = fieldLayout(1920, 1080, fhdWorld.w, fhdWorld.h);
approx(fhd.scale, 108, "1920x1080 px/unit (short axis)");
approx(fhd.ox, 0, "1920x1080 no side bars");
approx(fhd.oy, 0, "1920x1080 no top bars");

const ultra = fieldLayout(2560, 1080, ultraWorld.w, ultraWorld.h);
approx(ultra.scale, 108, "ultrawide px/unit driven by short axis");
approx(ultra.oy, 0, "ultrawide no top bars");
approx(ultra.fieldCssH, 1080, "ultrawide field height fills");
approx(ultra.fieldCssW, 1080 * FIELD_ASPECT_MAX, "ultrawide field width is 16:9");
approx(ultra.ox, (2560 - ultra.fieldCssW) / 2, "ultrawide side bars are the excess");
assert.ok(ultra.ox > 1, "ultrawide has visible side bars");

const lucas = fieldLayout(1024, 581, lucasWorld.w, lucasWorld.h);
approx(lucas.ox, 0, "Lucas 1024x581 fills (inside 16:10..16:9)");
approx(lucas.oy, 0, "Lucas 1024x581 no top bars");

const portrait = fieldLayout(390, 844, phoneP.w, phoneP.h);
approx(portrait.scale, 39, "portrait px/unit");
approx(portrait.ox, 0, "portrait no side bars");
assert.ok(portrait.oy > 1, "tall portrait has top/bottom bars past 16:9");

const landPhone = fieldLayout(844, 390, phoneL.w, phoneL.h);
approx(landPhone.scale, 39, "phone landscape px/unit");
approx(landPhone.oy, 0, "phone landscape no top bars");
assert.ok(landPhone.ox > 1, "phone landscape has side bars past 16:9");

const ipadWorld = fieldWorldSize(768, 1024);
const ipad = fieldLayout(768, 1024, ipadWorld.w, ipadWorld.h);
assert.equal(ipad.scale, 64);
assert.equal(ipad.ox, 64);
assert.equal(ipad.oy, 0);

assert.equal(SHIP.wallInset, 0.42);

console.log("PASS  field aspect [16:10, 16:9], black-bar contain, 1440x900 fills");
