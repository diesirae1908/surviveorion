// Recording module sanity checks, tsx style. Most of recorder.ts needs a
// real browser (HTMLCanvasElement.captureStream, MediaRecorder) and isn't
// exercisable headlessly, so this covers the things that are pure: clip
// extension mapping, feature detection degrading cleanly outside a browser
// (should never throw just because it's running under Node), and the
// duration/bitrate/worst-case-memory safety cap (2026-08-17: reassessed
// down from ~86MB to a ~40MB mobile-safe budget, see recorder.ts).
//
//   npx tsx scripts/test-recorder.ts

import {
  clipExtension,
  pickMimeType,
  recordingSupported,
  recordingUnavailableReason,
  saveClipToDevice,
  shareClipFile,
  PREFERRED_MIME_TYPES,
  RECORDING_MAX_SECONDS,
  BITRATE_BPS,
} from "../src/recorder";

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

// recordingUnavailableReason: always a non-empty, player-readable sentence
// when recording isn't offered (true in this Node environment, no DOM at
// all). Covers the "unsupported-browser copy path" — the message a player
// actually sees instead of a silently missing control (2026-08-18: iOS
// Safari findable-recording fix, see recorder.ts module comment).
const reason = recordingUnavailableReason();
check("recordingUnavailableReason mentions Safari (the common real case)", /safari/i.test(reason), true);
check("recordingUnavailableReason has no em dash", /\u2014|\s-\s/.test(reason), false);
if (reason.length === 0 || reason.length > 200) {
  failures++;
  console.error(`FAIL recordingUnavailableReason length out of a sane range: ${reason.length}`);
}

// pickMimeType: mocks MediaRecorder.isTypeSupported (no real browser
// needed) to verify the preference order. Desktop stays WebM first.
// iOS passes preferMp4 so Safari 18.4+ (which now supports both) encodes
// H.264 MP4 that Photos / CapCut will open, instead of a .webm dump.
function withMockMediaRecorder(supported: string[], run: () => void): void {
  const prev = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
    isTypeSupported: (t: string) => supported.includes(t),
  };
  try {
    run();
  } finally {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = prev;
  }
}

withMockMediaRecorder(["video/webm;codecs=vp9", "video/mp4"], () => {
  check("prefers WebM vp9 when both WebM and MP4 are supported (desktop Chrome-like)", pickMimeType(), "video/webm;codecs=vp9");
});

withMockMediaRecorder(["video/mp4;codecs=avc1", "video/mp4"], () => {
  check(
    "falls back to MP4 avc1 when no WebM candidate is supported (Safari 14.5-18.3-like)",
    pickMimeType(),
    "video/mp4;codecs=avc1",
  );
});

withMockMediaRecorder(["video/mp4"], () => {
  check("falls back to bare video/mp4 when only the generic type is supported", pickMimeType(), "video/mp4");
});

withMockMediaRecorder(["video/webm;codecs=vp9", "video/mp4;codecs=avc1", "video/mp4"], () => {
  check(
    "iOS preferMp4 picks avc1 even when WebM is also supported (Safari 18.4+)",
    pickMimeType(true),
    "video/mp4;codecs=avc1",
  );
  check("desktop still prefers WebM when preferMp4 is off", pickMimeType(false), "video/webm;codecs=vp9");
});

withMockMediaRecorder(["video/webm;codecs=vp8"], () => {
  check("iOS preferMp4 falls back to WebM when no MP4 candidate exists", pickMimeType(true), "video/webm;codecs=vp8");
});

withMockMediaRecorder([], () => {
  check("returns undefined when nothing in the list is supported", pickMimeType(), undefined);
});

check(
  "PREFERRED_MIME_TYPES lists every WebM candidate before every MP4 candidate",
  PREFERRED_MIME_TYPES.findIndex((t) => t.includes("mp4")) >
    PREFERRED_MIME_TYPES.map((t) => t.includes("webm")).lastIndexOf(true),
  true,
);

// shareClipFile / saveClipToDevice: mock navigator.share so we can prove
// iOS takes the share-sheet path without a real Safari, and that a
// cancelled sheet still counts as handled (same contract as share.ts).
const clipBlob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: "video/mp4" });

async function withMockShare(
  impl: { share: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean },
  run: () => Promise<void>,
): Promise<void> {
  const nav = globalThis.navigator as Navigator | undefined;
  const prevShare = nav?.share;
  const prevCanShare = nav?.canShare;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      ...(nav ?? {}),
      share: impl.share,
      canShare: impl.canShare ?? (() => true),
    },
  });
  try {
    await run();
  } finally {
    if (nav) {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: nav });
      if (prevShare) (nav as Navigator & { share: typeof prevShare }).share = prevShare;
      if (prevCanShare) (nav as Navigator & { canShare: typeof prevCanShare }).canShare = prevCanShare;
    }
  }
}

await withMockShare(
  {
    share: async (data) => {
      check("share payload has one file", Array.isArray(data.files) && data.files.length === 1, true);
      const file = data.files?.[0];
      check("shared file is named .mp4", file?.name.endsWith(".mp4") === true, true);
      check("shared file type is video/mp4", file?.type === "video/mp4", true);
    },
  },
  async () => {
    check("shareClipFile returns true when share resolves", await shareClipFile(clipBlob, "orion_test.mp4"), true);
    check(
      "saveClipToDevice on iOS reports shared",
      await saveClipToDevice(clipBlob, "orion_test.mp4", { ios: true }),
      "shared",
    );
  },
);

await withMockShare(
  {
    share: async () => {
      throw new DOMException("Share canceled", "AbortError");
    },
  },
  async () => {
    check("shareClipFile treats AbortError as handled", await shareClipFile(clipBlob, "orion_test.mp4"), true);
  },
);

await withMockShare(
  {
    canShare: () => false,
    share: async () => {
      throw new Error("share should not be called when canShare is false");
    },
  },
  async () => {
    check("shareClipFile returns false when canShare rejects the file", await shareClipFile(clipBlob, "orion_test.mp4"), false);
  },
);

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
