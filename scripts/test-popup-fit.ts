/**
 * Fitted popups (QA v3 bug 1): the whole measured text stays inside the field.
 * Run: npx tsx scripts/test-popup-fit.ts
 */
import assert from "node:assert/strict";
import { FIT_PAD, FIT_TOP_BAND, fitPopup, type PopupFit } from "../src/popups.ts";
import { FORM_NAMES } from "../src/fx/overdriveFx.ts";

const HW = 8.9;
const HH = 5;
const mk = (shipY: number): PopupFit => ({ hw: HW, hh: HH, shipY, offset: 1.15 });
// stand-in measure: 0.56 em per char at size 0.8 world units (Rajdhani bold is narrower than that)
const textW = (t: string): number => t.length * 0.56 * 0.8;
const longest = Object.values(FORM_NAMES).reduce((a, b) => (b!.length > a.length ? b! : a), "");
const H = 0.8;

let n = 0;
// every form name, ship x swept across the whole field and beyond
for (const name of Object.values(FORM_NAMES)) {
  const w = textW(name!);
  for (let sx = -HW; sx <= HW; sx += 0.1) {
    const at = fitPopup(sx, 0 + 1.15, w, H, mk(0), 0.8);
    assert.ok(at.x - w / 2 >= -HW + FIT_PAD - 1e-9, `${name} left edge at ship x ${sx}`);
    assert.ok(at.x + w / 2 <= HW - FIT_PAD + 1e-9, `${name} right edge at ship x ${sx}`);
    n++;
  }
}
// mid-field is untouched
assert.deepEqual(fitPopup(1, 1.15, textW(longest), H, mk(0)), { x: 1, y: 1.15 });
// pinned to the wall: longest name hugs it with padding
{
  const w = textW(longest);
  assert.ok(Math.abs(fitPopup(HW, 1.15, w, H, mk(0)).x - (HW - FIT_PAD - w / 2)) < 1e-9);
  assert.ok(Math.abs(fitPopup(-HW, 1.15, w, H, mk(0)).x + (HW - FIT_PAD - w / 2)) < 1e-9);
}
// near the top: flips below the ship; vertical extent stays in the field
for (let sy = -HH; sy <= HH; sy += 0.1) {
  const at = fitPopup(0, sy + 1.15, textW(longest), H, mk(sy), 0.8);
  assert.ok(at.y + H / 2 <= HH + 1e-9 && at.y - H / 2 >= -HH + FIT_PAD - 1e-9, `y ${sy} -> ${at.y}`);
  if (sy + 1.15 + 0.8 + H / 2 > HH - FIT_TOP_BAND) assert.ok(at.y <= sy, "flipped below ship");
  else assert.equal(at.y, sy + 1.15);
}
// a field narrower than the text centers it instead of throwing
assert.equal(fitPopup(3, 0, 40, H, { hw: 2, hh: 5, shipY: 0, offset: 1 }).x, 0);
console.log(`popup fit: ${n} edge cases PASS`);
