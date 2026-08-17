// Recording module sanity checks, tsx style. Most of recorder.ts needs a
// real browser (HTMLCanvasElement.captureStream, MediaRecorder) and isn't
// exercisable headlessly, so this covers the things that are pure: clip
// extension mapping, feature detection degrading cleanly outside a browser
// (should never throw just because it's running under Node), and the
// duration/bitrate/worst-case-memory safety cap (2026-08-17: reassessed
// down from ~86MB to a ~40MB mobile-safe budget, see recorder.ts).
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

// Sanity on the duration cap: a round, known value (not accidentally
// changed to something huge or zero). 360s (6:00) is a deliberate choice
// (2026-08-17 review): it's under Orion's ~7-8 minute skilled-run ceiling
// (a known, accepted tradeoff: the auto-stop is visible to the player via
// the "capped" note, not a silent truncation), traded for a materially
// safer worst-case memory bound on mobile (see the worst-case check below
// and the recorder.ts module comment for the full reasoning).
check("RECORDING_MAX_SECONDS is the reassessed 360s (6:00) cap", RECORDING_MAX_SECONDS, 360);
if (RECORDING_MAX_SECONDS <= 0 || RECORDING_MAX_SECONDS > 1800) {
  failures++;
  console.error(`FAIL RECORDING_MAX_SECONDS out of a sane range: ${RECORDING_MAX_SECONDS}`);
}

// Worst-case memory: duration x bitrate is the real bound (1s chunking does
// NOT bound total memory by itself — see the recorder.ts module comment).
// The 2026-08-16 pass's 600s/1.2Mbps combination worked out to an ~86MB
// worst case, not safe for the mobile traffic this feature actually ships
// to; the 2026-08-17 follow-up re-picked both numbers to land comfortably
// under a 40MB budget instead. This regression-guards that budget directly
// (not just "a few hundred MB", the old, too-loose ceiling) so a future
// bump to either constant can't silently blow past it again.
const worstCaseBytes = (RECORDING_MAX_SECONDS * BITRATE_BPS) / 8;
const worstCaseMB = worstCaseBytes / (1000 * 1000); // decimal MB, matching how the player-facing "MB" figure is usually meant
check("BITRATE_BPS is the reassessed 800kbps bitrate", BITRATE_BPS, 800_000);
if (worstCaseMB > 40) {
  failures++;
  console.error(
    `FAIL worst-case recording size (${worstCaseMB.toFixed(1)}MB) exceeds the 40MB mobile-safe budget`,
  );
}
if (worstCaseMB < 20) {
  // not a failure, just a heads-up if someone tightens this further: no
  // hard floor, but a huge undershoot is worth a second look at whether
  // clip quality is being sacrificed more than necessary.
  console.log(`(worst-case recording size ${worstCaseMB.toFixed(1)}MB, well under the 40MB budget)`);
}

if (failures > 0) {
  console.error(`\n${failures} recorder check(s) FAILED.`);
  process.exit(1);
}
console.log(
  `ALL CHECKS PASSED: clipExtension, recordingSupported degrades cleanly, safety cap sane ` +
    `(${RECORDING_MAX_SECONDS}s / ${(BITRATE_BPS / 1000).toFixed(0)}kbps, ~${worstCaseMB.toFixed(1)}MB worst case).`,
);
