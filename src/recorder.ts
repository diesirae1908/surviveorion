// Opt-in local game recording for Lucas's Orion social content. Fully
// client-side: canvas.captureStream() + MediaRecorder produce a Blob that's
// offered as a download (an <a download> click on an object URL) and revoked
// right after. The only upload path is Lucas-only POST /api/clip-inbox
// (signed-in allowlist). Other pilots never start a recorder. Degrades cleanly:
// recordingSupported() gates every call site, and any runtime failure
// (unsupported codec, permission quirk, mid-run exception) resolves to
// "no clip" instead of throwing into the game loop.
//
// Memory correction (2026-08-16 review pass, still true): the 1s chunk
// interval passed to recorder.start() does NOT bound total memory by
// itself: it only bounds how much is buffered inside the encoder between
// flushes; every flushed chunk still gets pushed onto `chunks` and held
// until stop(), so total memory scales with duration x bitrate regardless
// of chunk size. A true rolling buffer (drop old chunks so memory is
// capped independent of duration) was considered and rejected as unsafe
// here: MediaRecorder emits a single WebM header in the FIRST chunk, so
// discarding early chunks to keep a fixed-size window produces a file most
// players can't open, not a clip. The fix is capping duration AND setting
// an explicit bitrate (below) so the worst case is small enough to be safe
// on a phone.
//
// Cap reassessed 2026-08-17 (follow-up review): the 2026-08-16 pass raised
// this from 360s to 600s specifically so the cap wouldn't cut off the
// death/ending on Orion's best runs (skilled-run ceiling is ~7-8 minutes,
// per AGENTS.md). But at the bitrate that bump kept (1.2Mbps), 600s means
// an ~86MB worst case in memory (600 x 1.2Mbps / 8), which is not a safe
// default for the mobile traffic this feature actually ships to: Orion's
// install base skews mobile, and a low-end Android tab can OOM well below
// that. Reverted to the original 360s (6:00) cap and lowered the bitrate
// instead of raising the duration again: 360s x BITRATE_BPS below is a
// ~34MB (36,000,000 byte) worst case, comfortably under a 40MB budget. A
// canvas-captured 2D game (flat shapes, dark background, no film-grain
// detail) reads fine well below the "small social clip" bitrates real
// video needs, so this trades a small amount of headroom on Orion's rare
// 7-8 minute runs (their clip auto-stops at 6:00, with a visible "capped"
// note, not a silent truncation) for a materially safer memory ceiling on
// every run. If full-length clips on long runs matter enough later, the
// right fix is a resolution/fps reduction (smaller frames, same duration)
// rather than a rolling buffer (see above for why that doesn't work) or
// raising bitrate x duration again.
export const RECORDING_MAX_SECONDS = 360;

/** Capture at a modest fixed rate: plenty for a social clip, cheap to encode. */
const CAPTURE_FPS = 24;

/**
 * Explicit modest cap, not codec-default quality: a canvas-captured 2D-game
 * clip doesn't need archival bitrate, and an unbounded default could push
 * the RECORDING_MAX_SECONDS worst case well past the ~40MB budget this was
 * sized for (see the module comment above). 0.8Mbps keeps VP9/VP8 output
 * readable for simple 2D gameplay footage while landing the 360s worst
 * case at ~34MB (36,000,000 bytes: 360 x 800,000 / 8), not the ~86MB the
 * previous 1.2Mbps/600s combination worked out to.
 */
export const BITRATE_BPS = 800_000;

// Desktop / Android: WebM first (smaller at the same visual quality for a
// flat-shaded 2D canvas). iPhone / iPad: MP4 first. Safari 18.4+ now
// reports WebM as supported, and picking it produces a .webm Files download
// that Photos and CapCut will not treat as a normal camera-roll video.
// Older Safari (14.5-18.3) never supported WebM at all; without an mp4
// candidate, pickMimeType() used to return undefined and MediaRecorder
// started with an undocumented default. Two mp4 candidates, most-specific
// first: Safari's isTypeSupported is stricter about the parameterized
// string than the bare mime type on some versions.
export const WEBM_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export const MP4_MIME_TYPES = ["video/mp4;codecs=avc1", "video/mp4"];

export const PREFERRED_MIME_TYPES = [...WEBM_MIME_TYPES, ...MP4_MIME_TYPES];

interface CaptureCanvas extends HTMLCanvasElement {
  captureStream(frameRate?: number): MediaStream;
}

/** First mime type this MediaRecorder implementation can actually produce,
 * or undefined if none of the candidates are supported. `preferMp4` flips
 * the order (iOS Photos / CapCut). Exported for scripts/test-recorder.ts. */
export function pickMimeType(preferMp4 = false): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  const list = preferMp4 ? [...MP4_MIME_TYPES, ...WEBM_MIME_TYPES] : PREFERRED_MIME_TYPES;
  return list.find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * True only when this browser can both capture the canvas AND actually
 * encode at least one of PREFERRED_MIME_TYPES — API existence alone isn't
 * enough (see the module comment above): a browser with the APIs but zero
 * usable codecs would otherwise show a toggle that silently produces no
 * clip, which is worse than not showing it (see recordingUnavailableReason
 * for what to show instead).
 */
export function recordingSupported(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof (HTMLCanvasElement.prototype as Partial<CaptureCanvas>).captureStream === "function" &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function" &&
    pickMimeType() !== undefined
  );
}

/**
 * One plain sentence for why recording isn't offered here, or null when it
 * is. Shown as a disabled Settings row for the allowlisted account (see
 * ui.ts showSettings). Other pilots never see recording UI at all.
 */
export function recordingUnavailableReason(): string {
  return "Clip recording isn't available in this browser. Common on Safari and older phones, works on most desktop and Android browsers.";
}

export interface RecordingHandle {
  /** Stop capture and resolve with the finished clip (null if nothing usable was captured). */
  stop(): Promise<Blob | null>;
  /**
   * True once the RECORDING_MAX_SECONDS safety timer has auto-finalized the
   * clip. Readable at any time (not just after stop()), so the result
   * screen can tell a player their clip was cut at the cap instead of
   * silently handing back a shorter file than the run that just happened.
   */
  readonly hitCap: boolean;
}

/**
 * Start recording the given canvas. Returns null immediately (no-op) if the
 * browser lacks captureStream/MediaRecorder, or if starting throws for any
 * reason (some browsers reject captureStream on a canvas with no draws yet,
 * or on an unsupported GPU path) — callers should treat null as "just don't
 * offer a clip this run", never as an error to surface to the player.
 */
export function startRecording(
  canvas: HTMLCanvasElement,
  opts?: { preferMp4?: boolean },
): RecordingHandle | null {
  if (!recordingSupported()) return null;
  try {
    const stream = (canvas as CaptureCanvas).captureStream(CAPTURE_FPS);
    const mimeType = pickMimeType(opts?.preferMp4 === true);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: BITRATE_BPS });
    } catch {
      // some MediaRecorder implementations (older Safari point releases)
      // reject a bitrate hint paired with certain codecs; retry with just
      // the mime type before giving up on this run entirely
      recorder = new MediaRecorder(stream, { mimeType });
    }
    const chunks: BlobPart[] = [];
    let stopped = false;
    let hitCap = false;

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const finalize = (): Blob | null =>
      chunks.length > 0 ? new Blob(chunks, { type: mimeType ?? "video/webm" }) : null;

    // 1s chunks bound how much sits unflushed inside the encoder between
    // ondataavailable events (so a mid-run crash still leaves most footage
    // flushed) — they do NOT bound total memory; every flushed chunk is
    // still retained in `chunks` for the life of the recording, so total
    // memory is duration x bitrate (see the module comment above for why
    // that's capped via RECORDING_MAX_SECONDS + BITRATE_BPS instead).
    recorder.start(1000);

    const autoStopTimer = setTimeout(() => {
      if (recorder.state !== "inactive") {
        hitCap = true;
        recorder.stop();
      }
    }, RECORDING_MAX_SECONDS * 1000);

    const cleanup = (): void => {
      clearTimeout(autoStopTimer);
      for (const track of stream.getTracks()) track.stop();
    };

    return {
      get hitCap() {
        return hitCap;
      },
      stop: () =>
        new Promise((resolve) => {
          if (stopped) return resolve(null);
          stopped = true;
          if (recorder.state === "inactive") {
            cleanup();
            resolve(finalize());
            return;
          }
          recorder.onstop = () => {
            cleanup();
            resolve(finalize());
          };
          try {
            recorder.stop();
          } catch {
            cleanup();
            resolve(finalize());
          }
        }),
    };
  } catch {
    return null;
  }
}

/** Trigger a browser download of the clip; no server round-trip, no persistence. */
export function downloadClip(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export type SaveClipOutcome = "shared" | "downloaded" | "failed";

/**
 * iOS share sheet with the clip as a File. Photos shows Save Video for
 * MP4/H.264. User cancel (AbortError) still counts as handled: they saw
 * the sheet. False = share is unavailable or rejected; caller should
 * fall back to downloadClip.
 */
export async function shareClipFile(blob: Blob, filename: string): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof File === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  const type = blob.type.includes("webm") ? blob.type : "video/mp4";
  const file = new File([blob], filename, { type });
  const payload = { files: [file] };
  try {
    if (typeof navigator.canShare === "function" && !navigator.canShare(payload)) return false;
    await navigator.share(payload);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return true;
    return false;
  }
}

/**
 * iPhone / iPad: native share sheet (Save Video → Photos). Everywhere
 * else: the existing <a download> into the browser Downloads folder.
 */
export async function saveClipToDevice(
  blob: Blob,
  filename: string,
  opts: { ios: boolean },
): Promise<SaveClipOutcome> {
  if (opts.ios) {
    const shared = await shareClipFile(blob, filename);
    if (shared) return "shared";
  }
  try {
    downloadClip(blob, filename);
    return "downloaded";
  } catch {
    return "failed";
  }
}

/** File extension matching the mime type actually used, for the download name. */
export function clipExtension(blob: Blob): string {
  return blob.type.includes("webm") ? "webm" : "mp4";
}
