// Recording module sanity checks, tsx style. Most of recorder.ts needs a
// real browser (HTMLCanvasElement.captureStream, MediaRecorder) and isn't
// exercisable headlessly, so this covers the two things that are pure and
// the one thing that must degrade cleanly outside a browser: feature
// detection should never throw just because it's running under Node.
//
//   npx tsx scripts/test-recorder.ts

import { clipExtension, recordingSupported, RECORDING_MAX_SECONDS, BITRATE_BPS } from "../src/recorder";

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

// Sanity on the safety cap: long enough to clear Orion's ~7-8 minute
// skilled-run ceiling (a cap under that would cut off the death/ending on
// exactly the best, most shareable runs — the 2026-08-16 review finding),
// short enough to keep the worst-case recording bounded.
const SKILLED_RUN_CEILING_SECONDS = 8 * 60;
if (RECORDING_MAX_SECONDS <= SKILLED_RUN_CEILING_SECONDS) {
  failures++;
  console.error(
    `FAIL RECORDING_MAX_SECONDS (${RECORDING_MAX_SECONDS}) does not clear the ~8min skilled-run ceiling`,
  );
}
if (RECORDING_MAX_SECONDS > 1800) {
  failures++;
  console.error(`FAIL RECORDING_MAX_SECONDS out of a sane range: ${RECORDING_MAX_SECONDS}`);
}

// Worst-case memory: duration x bitrate is the real bound (1s chunking does
// NOT bound total memory by itself — see the recorder.ts module comment).
// Keep the worst case comfortably inside what a low-end mobile browser tab
// can hold: a few hundred MB, not a few GB.
const worstCaseBytes = (RECORDING_MAX_SECONDS * BITRATE_BPS) / 8;
const worstCaseMB = worstCaseBytes / (1024 * 1024);
if (worstCaseMB > 200) {
  failures++;
  console.error(`FAIL worst-case recording size too large for a low-end phone: ${worstCaseMB.toFixed(0)}MB`);
}

if (failures > 0) {
  console.error(`\n${failures} recorder check(s) FAILED.`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED: clipExtension, recordingSupported degrades cleanly, safety cap sane.");
