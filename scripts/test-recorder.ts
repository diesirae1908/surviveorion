// Recording module sanity checks, tsx style. Most of recorder.ts needs a
// real browser (HTMLCanvasElement.captureStream, MediaRecorder) and isn't
// exercisable headlessly, so this covers the two things that are pure and
// the one thing that must degrade cleanly outside a browser: feature
// detection should never throw just because it's running under Node.
//
//   npx tsx scripts/test-recorder.ts

import { clipExtension, recordingSupported, RECORDING_MAX_SECONDS } from "../src/recorder";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failures++;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// clipExtension: matches the mime type used, defaults sanely.
check("webm mime picks .webm", clipExtension(new Blob([], { type: "video/webm;codecs=vp9" })), "webm");
check("unknown mime falls back to .mp4", clipExtension(new Blob([], { type: "" })), "mp4");

// recordingSupported must never throw in a non-browser environment (this
// script runs under plain Node via tsx, no DOM at all) — it should just
// report false, which is exactly the "degrades cleanly" contract.
let threw = false;
let supported = true;
try {
  supported = recordingSupported();
} catch {
  threw = true;
}
check("recordingSupported does not throw without a DOM", threw, false);
check("recordingSupported reports false without a DOM", supported, false);

// Sanity on the safety cap: long enough to cover a normal Daily Patrol /
// Classic run, short enough to bound memory on a long Iron Rain session.
if (RECORDING_MAX_SECONDS < 120 || RECORDING_MAX_SECONDS > 1800) {
  failures++;
  console.error(`FAIL RECORDING_MAX_SECONDS out of a sane range: ${RECORDING_MAX_SECONDS}`);
}

if (failures > 0) {
  console.error(`\n${failures} recorder check(s) FAILED.`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED: clipExtension, recordingSupported degrades cleanly, safety cap sane.");
