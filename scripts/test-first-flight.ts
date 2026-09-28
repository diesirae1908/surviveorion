/**
 * First Flight gate: fresh devices only, never native WebPlay, never spends
 * a daily attempt. Pure + a source tripwire on main.ts.
 * Run: npx tsx scripts/test-first-flight.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FIRST_FLIGHT_HINT_ORB_AT,
  FIRST_FLIGHT_HINT_PATROL_AT,
  FIRST_FLIGHT_PATROL_LINE,
  FIRST_FLIGHT_PATROL_STRIP,
  FIRST_FLIGHT_SECONDS,
  firstFlightHint,
  shouldStartFirstFlight,
} from "../src/save.ts";

assert.equal(FIRST_FLIGHT_SECONDS, 25);
assert.equal(FIRST_FLIGHT_HINT_ORB_AT, 8);
assert.equal(FIRST_FLIGHT_HINT_PATROL_AT, 18);

assert.equal(shouldStartFirstFlight(0, false, false), true, "fresh web profile flies First Flight");
assert.equal(shouldStartFirstFlight(0, true, false), false, "already done");
assert.equal(shouldStartFirstFlight(1, false, false), false, "returning device skips");
assert.equal(
  shouldStartFirstFlight(0, false, true),
  false,
  "native ?nativePlay=daily skips First Flight",
);

assert.equal(firstFlightHint(0, true), "Drag anywhere to fly");
assert.equal(firstFlightHint(0, false), "WASD or arrows");
assert.equal(firstFlightHint(8, true), "Grab the glowing orb, it fires itself");
assert.equal(firstFlightHint(18, false), FIRST_FLIGHT_PATROL_STRIP);
assert.equal(FIRST_FLIGHT_PATROL_STRIP, "Same patrol for everyone. 3 attempts.");
assert.ok(
  FIRST_FLIGHT_PATROL_LINE.startsWith("Everyone flies this same patrol today."),
  "end screen keeps the full patrol sentence",
);

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const main = fs.readFileSync(path.join(ROOT, "src/main.ts"), "utf8");

assert.match(main, /shouldStartFirstFlight\(/);
assert.match(main, /runIsFirstFlight/);
assert.match(main, /markFirstFlightDone/);
assert.match(
  main,
  /runIsDaily = pendingDaily && !pendingTraining/,
  "First Flight is training, so runIsDaily is false",
);
assert.match(
  main,
  /if \(DAILY_ONLY && runIsDaily && !PREVIEW_ACTIVE && !isArchiveRun\(\)\) useDailyAttempt\(\)/,
  "useDailyAttempt stays behind runIsDaily (First Flight is not daily)",
);
assert.doesNotMatch(
  main,
  /if \(runIsFirstFlight\)[\s\S]{0,120}useDailyAttempt/,
  "First Flight must never call useDailyAttempt",
);
assert.match(
  main,
  /if \(runIsTraining\) \{[\s\S]*?return;\s*\}/,
  "training / First Flight returns before submitRun",
);
assert.match(
  main,
  /shouldStartFirstFlight\(\s*loadRunCount\(\),\s*loadFirstFlightDone\(\),\s*IS_NATIVE_PLAY\s*\)/,
  "native daily skips the First Flight insertion",
);

assert.match(main, /ui\.showGuestWingmates/);
assert.match(
  main,
  /if \(!IS_NATIVE_PLAY && !isNativeApp\(\) && !api\.signedIn\)/,
  "native play still uses community.showFriends (login) for Wingmates",
);
assert.match(
  main,
  /function openWebGoldPatrolPaywall\(\): void \{[\s\S]*?ui\.showGoldPatrolPaywall\(webGoldPatrolPrices\(\), runCheckout, showMenu\);\n\}/,
  "guest ACTIVATE opens the paywall immediately",
);
assert.match(
  main,
  /function openWebGoldPatrolPaywall\(\): void \{[\s\S]*?if \(!api\.signedIn\) \{[\s\S]*?community\.showAuth/,
  "unsigned plan tap still uses the paywall's sign-in step",
);

console.log("PASS  first-flight gate (web only, no attempt, no submit)");
