/**
 * Once-per-day PATROL COMPLETE gate. DOM-free: mocks localStorage.
 *
 *   npx tsx scripts/test-patrol-complete.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  consumePatrolCompletePopup,
  hasShownPatrolComplete,
  PATROL_COMPLETE_BODY_GOLD,
  patrolCompleteShownKey,
} from "../src/save.ts";

const mem = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, String(v));
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
  clear: () => {
    mem.clear();
  },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, configurable: true });

const day = "2026-09-12";
assert.equal(patrolCompleteShownKey(day), "patrolCompleteShown:2026-09-12");

assert.equal(consumePatrolCompletePopup(3, day), false, "attempts left: no popup");
assert.equal(hasShownPatrolComplete(day), false);

assert.equal(consumePatrolCompletePopup(0, day), true, "first zero: show");
assert.equal(hasShownPatrolComplete(day), true);
assert.equal(consumePatrolCompletePopup(0, day), false, "same day: no re-show");

assert.equal(consumePatrolCompletePopup(0, "2026-09-13"), true, "next day: show again");
assert.equal(hasShownPatrolComplete("2026-09-13"), true);
assert.equal(hasShownPatrolComplete(day), true, "prior day flag stays");

assert.equal(
  consumePatrolCompletePopup(0, "2026-09-14", true),
  false,
  "Gold Patrol / admin: no popup",
);
assert.equal(hasShownPatrolComplete("2026-09-14"), false, "unlimited day stays unmarked");
assert.match(PATROL_COMPLETE_BODY_GOLD, /unlimited Daily runs/);
assert.match(PATROL_COMPLETE_BODY_GOLD, /every past patrol/);

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const ui = fs.readFileSync(path.join(ROOT, "src/ui.ts"), "utf8");
assert.match(ui, /PATROL_COMPLETE_BODY_GOLD/);
assert.equal(ui.includes("Missed a day? Gold Patrol opens every past patrol."), false);
const sheet = fs.readFileSync(path.join(ROOT, "ios/App/App/PatrolCompleteSheet.swift"), "utf8");
assert.match(sheet, /unlimited Daily runs, plus every past patrol/);
assert.equal(sheet.includes("Missed a day? Gold Patrol opens every past patrol."), false);

console.log("PASS  patrol-complete once-per-day gate");
