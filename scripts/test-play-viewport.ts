/**
 * Desktop play letterbox: ultrawide caps at 16:9, phones stay full-bleed.
 * Run: npx tsx scripts/test-play-viewport.ts
 */
import assert from "node:assert/strict";
import { PLAY_ASPECT_LANDSCAPE, playViewport } from "../src/playView.ts";
import { SHIP, shipTopInset } from "../src/config.ts";

const wide = playViewport(2560, 1080);
assert.equal(wide.h, 1080);
assert.ok(Math.abs(wide.w / wide.h - PLAY_ASPECT_LANDSCAPE) < 1e-6);
assert.ok(wide.w < 2560);

const laptop = playViewport(1440, 900);
assert.deepEqual(laptop, { w: 1440, h: 900 });

const phonePortrait = playViewport(390, 844);
assert.deepEqual(phonePortrait, { w: 390, h: 844 });

const phoneLandscape = playViewport(844, 390);
assert.deepEqual(phoneLandscape, { w: 844, h: 390 });

const squareDesktop = playViewport(1100, 1100);
assert.deepEqual(squareDesktop, { w: 1100, h: 1100 });

const deskInset = shipTopInset(16, 10, 1440, 900);
const phoneInset = shipTopInset(10, 10 * (844 / 390), 390, 844);
const headlessInset = shipTopInset(16, 10, 0, 0);
assert.ok(Math.abs(deskInset - (SHIP.hudBandPx * (10 / 900) + 0.55 * SHIP.visualScale)) < 1e-9);
assert.ok(phoneInset > deskInset, "phone top inset covers the left HUD stack (BEST line)");
assert.ok(Math.abs(headlessInset - deskInset) < 1e-9, "headless clipView keeps the desktop band");

console.log("PASS  play viewport letterbox (ultrawide 16:9, phone full-bleed)");
