/**
 * Desktop play letterbox: ultrawide caps at 16:9, phones stay full-bleed.
 * Run: npx tsx scripts/test-play-viewport.ts
 */
import assert from "node:assert/strict";
import { PLAY_ASPECT_LANDSCAPE, playViewport } from "../src/playView.ts";

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

console.log("PASS  play viewport letterbox (ultrawide 16:9, phone full-bleed)");
