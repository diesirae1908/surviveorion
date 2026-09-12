/**
 * nativePlay query must stay opt-in. The website without that param keeps
 * the lobby boot path. Run: npx tsx scripts/test-native-play.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseNativePlay } from "../src/native.ts";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const main = fs.readFileSync(path.join(ROOT, "src/main.ts"), "utf8");

assert.equal(parseNativePlay(""), null);
assert.equal(parseNativePlay("?fullgame=1"), null);
assert.equal(parseNativePlay("?foo=bar"), null);
assert.equal(parseNativePlay("?nativePlay=nope"), null);
assert.equal(parseNativePlay("?nativePlay=daily"), "daily");
assert.equal(parseNativePlay("?nativePlay=training"), "training");
assert.equal(parseNativePlay("?nativePlay=training&foo=1"), "training");

assert.match(main, /IS_NATIVE_PLAY/);
assert.match(main, /clearScreens\(\)/);
assert.match(main, /ui\.showIntroGate/);
assert.match(main, /if \(!IS_NATIVE_PLAY\) \{\s*ui\.showIntroGate/s);
assert.match(main, /beginLaunch\(!training/);
assert.equal(main.includes("showIntroGate(enterFromGate)") && main.includes("if (!IS_NATIVE_PLAY)"), true);
assert.match(main, /postNativeLeave/);
assert.match(main, /orion-native-pause/);
assert.match(main, /allow Motion & Fitness for ORION/);

const ui = fs.readFileSync(path.join(ROOT, "src/ui.ts"), "utf8");
assert.equal(ui.includes("Tilt is our tribute to Tilt to Live"), false);
assert.match(ui, /Hold your phone at your comfortable play angle before tapping/);

console.log("PASS  nativePlay guard (website boot unchanged without the query)");
