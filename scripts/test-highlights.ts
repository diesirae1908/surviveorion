// "Closest call" run-highlight logic, tsx style (see test-nickname.ts /
// sim-test.ts for the convention: manual assertions, no framework).
//
//   npx tsx scripts/test-highlights.ts

import {
  closestCallLabel,
  closestCallTier,
  grazeClearance,
  trackClosestCall,
  type ClosestCall,
} from "../src/highlights";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failures++;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// grazeClearance: 0 at contact, 1 at the outer band edge, clamped beyond it.
check("clearance at contact is 0", grazeClearance(1.0, 1.0, 0.65), 0);
check("clearance at outer edge is 1", Math.round(grazeClearance(1.65, 1.0, 0.65) * 100) / 100, 1);
check("clearance mid-band is ~0.5", Math.round(grazeClearance(1.325, 1.0, 0.65) * 100) / 100, 0.5);
check("clearance clamps below contact to 0", grazeClearance(0.5, 1.0, 0.65), 0);
check("clearance clamps beyond band to 1", grazeClearance(5, 1.0, 0.65), 1);
check("zero graze band never divides by zero", grazeClearance(1.2, 1.0, 0), 0);

// trackClosestCall: keeps the smallest clearance seen, first call included.
const a: ClosestCall = { time: 10, x: 0, y: 0, clearance: 0.5 };
const b: ClosestCall = { time: 20, x: 1, y: 1, clearance: 0.2 };
const c: ClosestCall = { time: 30, x: 2, y: 2, clearance: 0.8 };
check("first call becomes current", trackClosestCall(null, a), a);
check("closer call replaces current", trackClosestCall(a, b), b);
check("further call does not replace current", trackClosestCall(b, c), b);

// closestCallTier: tier boundaries.
check("tier at 0 is hair", closestCallTier(0), "hair");
check("tier at 0.25 is hair", closestCallTier(0.25), "hair");
check("tier at 0.26 is razor", closestCallTier(0.26), "razor");
check("tier at 0.6 is razor", closestCallTier(0.6), "razor");
check("tier at 0.61 is clean", closestCallTier(0.61), "clean");
check("tier at 1 is clean", closestCallTier(1), "clean");

// closestCallLabel: null in, null out; otherwise a compact "<tier> at m:ss" string.
check("no call means no label", closestCallLabel(null), null);
check(
  "label formats mm:ss and tier",
  closestCallLabel({ time: 84, x: 0, y: 0, clearance: 0.1 }),
  "Hair's-breadth dodge at 1:24",
);
check(
  "label pads seconds under 10",
  closestCallLabel({ time: 5, x: 0, y: 0, clearance: 0.9 }),
  "Clean dodge at 0:05",
);

if (failures > 0) {
  console.error(`\n${failures} highlight check(s) FAILED.`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED: grazeClearance, trackClosestCall, closestCallTier, closestCallLabel.");
