/**
 * nativePlay query must stay opt-in. The website without that param keeps
 * the lobby boot path. Run: npx tsx scripts/test-native-play.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseNativeGoldPatrol, parseNativePlay, parseNativePlayDate } from "../src/native.ts";
import { shouldShowPhoneLanding } from "../src/webGate.ts";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const main = fs.readFileSync(path.join(ROOT, "src/main.ts"), "utf8");

assert.equal(parseNativePlay(""), null);
assert.equal(parseNativePlay("?fullgame=1"), null);
assert.equal(parseNativePlay("?foo=bar"), null);
assert.equal(parseNativePlay("?nativePlay=nope"), null);
assert.equal(parseNativePlay("?nativePlay=daily"), "daily");
assert.equal(parseNativePlay("?nativePlay=training"), "training");
assert.equal(parseNativePlay("?nativePlay=training&foo=1"), "training");
assert.equal(parseNativePlayDate(""), null);
assert.equal(parseNativePlayDate("?nativePlay=daily"), null);
assert.equal(parseNativePlayDate("?nativePlay=daily&date=2026-09-01"), "2026-09-01");
assert.equal(parseNativePlayDate("?date=not-a-date"), null);
assert.equal(parseNativePlayDate("?date=2026-13-40"), null);
assert.equal(parseNativeGoldPatrol(""), false);
assert.equal(parseNativeGoldPatrol("?nativePlay=daily"), false);
assert.equal(parseNativeGoldPatrol("?nativePlay=daily&goldPatrol=1"), true);

assert.equal(
  shouldShowPhoneLanding({
    search: "",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    protocol: "https:",
    nativePlay: false,
    nativeApp: false,
    coarsePointer: true,
    innerWidth: 390,
  }),
  false,
  "website iPhone boots intro/lobby, not App Store landing",
);

assert.match(main, /IS_NATIVE_PLAY/);
assert.match(main, /clearScreens\(\)/);
assert.match(main, /ui\.showIntroGate/);
assert.match(main, /PHONE_LANDING/);
assert.match(main, /showPhoneLanding/);
assert.match(main, /if \(!IS_NATIVE_PLAY\) \{\s*if \(PHONE_LANDING\) ui\.showPhoneLanding\(\);\s*else ui\.showIntroGate/s);
assert.match(main, /nativePlay: IS_NATIVE_PLAY/);
assert.match(main, /beginLaunch\(!training/);
assert.equal(main.includes("showIntroGate(enterFromGate)") && main.includes("if (!IS_NATIVE_PLAY)"), true);
assert.match(main, /postNativeLeave/);
assert.match(main, /postNativePremium/);
assert.match(main, /DEATH_UI_AT/);
assert.equal(
  /onGameOver\(\)[\s\S]*?if \(IS_NATIVE_PLAY\) showGameOverUi\(\)/.test(main),
  false,
  "native play must not skip the death veil timing",
);
assert.match(main, /ui\.showGameOver\(/);
assert.match(main, /ui\.showTrainingEnd/);
assert.match(main, /orion-native-pause/);
assert.match(main, /allow Motion & Fitness for ORION/);
assert.match(main, /NATIVE_AUTO === "tiltconfirm"/);
assert.match(main, /runMode \(the board this run files on\)/);
assert.match(main, /NATIVE_PATROL_DATE/);
assert.match(main, /parseNativePlayDate/);
assert.match(main, /dailyDate/);
assert.match(main, /webArchiveDate/);
assert.match(main, /isArchiveRun/);
assert.match(main, /playArchiveDay/);
assert.match(main, /input\.tilt\.stop\(\)/);

const ui = fs.readFileSync(path.join(ROOT, "src/ui.ts"), "utf8");
assert.match(ui, /FLY_THIS_PATROL|Fly this Patrol/);
assert.match(ui, /archivePatrolTag/);
assert.equal(ui.includes("Tilt is our tribute to Tilt to Live"), false);
assert.match(ui, /Hold your phone at your comfortable play angle before tapping/);
assert.match(ui, /showTiltReadyConfirm/);
assert.match(ui, /HOLD YOUR POSITION/);
assert.match(ui, /Hold your phone at your comfortable play angle, then confirm/);
assert.match(ui, /isNativePlay\(\)/);
assert.match(ui, /Switch to touch/);
assert.match(ui, /Switch to tilt/);

const tilt = fs.readFileSync(path.join(ROOT, "src/tilt.ts"), "utf8");
assert.match(tilt, /stopMotion/);

console.log("PASS  nativePlay guard (website boot unchanged without the query)");
