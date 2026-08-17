// Crash-telemetry noise filter regression check, tsx style (matches
// sim-test.ts / test-nickname.ts: manual assertions, no test framework).
//
// Classifies the Aug 16 Brave/iPhone reports (`window.__firefox__.reader`,
// opaque `Script error.`) as third-party/browser-injected noise, not genuine
// Orion crashes, and guards against the filter overreaching into anything
// that could plausibly be Orion's own bug.
//
//   npx tsx scripts/test-crash-filter.ts

import { isThirdPartyCrashNoise } from "../src/crashFilter";

let failures = 0;

function check(label: string, actual: boolean, expected: boolean): void {
  if (actual !== expected) {
    failures++;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}

// --- The two Aug 16 reports must be classified as noise. ---
check("exact 'Script error.' (cross-origin redaction)", isThirdPartyCrashNoise("Script error."), true);
check(
  "window.__firefox__.reader is not a function (Firefox iOS injected namespace)",
  isThirdPartyCrashNoise("window.__firefox__.reader.showContent is not a function"),
  true,
);
check(
  "TypeError: undefined is not an object (evaluating 'window.__firefox__.reader')",
  isThirdPartyCrashNoise("undefined is not an object (evaluating 'window.__firefox__.reader.something')"),
  true,
);

// --- Must NOT swallow genuine Orion crashes, including ones that merely
// look vague or share superficial wording with the noise patterns. ---
check("real TypeError from Orion's own code", isThirdPartyCrashNoise("Cannot read properties of undefined (reading 'x')"), false);
check("real ReferenceError", isThirdPartyCrashNoise("world is not defined"), false);
check("a message that mentions 'script' but isn't the exact redaction", isThirdPartyCrashNoise("my script error occurred"), false);
check("a message that merely contains 'error.' as a substring", isThirdPartyCrashNoise("Uncaught error. something broke"), false);
check("empty message", isThirdPartyCrashNoise(""), false);
check("unrelated third-party-sounding but non-matching message", isThirdPartyCrashNoise("window.__unrelated__ crashed"), false);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("ALL CHECKS PASSED: crash-noise filter (Aug 16 Brave/iPhone reports classified, genuine crashes preserved).");
}
