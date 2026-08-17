// Opt-in local game recording for Lucas's Orion social content. Fully
// client-side: canvas.captureStream() + MediaRecorder produce a Blob that's
// only ever offered as a download (an <a download> click on an object URL)
// and revoked right after, never uploaded, never persisted anywhere, so
// there's no storage cost and nothing leaves the browser. Degrades cleanly:
// recordingSupported() gates every call site, and any runtime failure
// (unsupported codec, permission quirk, mid-run exception) resolves to
// "no clip" instead of throwing into the game loop.
//
// Cap picked from actual gameplay ceiling, not a round number (2026-08-16
// review pass). Orion's intended skilled-run ceiling is ~7-8 minutes; the
// original 360s (6:00) cap could cut off the death/ending on exactly the
// best, most shareable runs. RECORDING_MAX_SECONDS is now 600 (10:00), with
// headroom above the ceiling instead of under it.
//
// Memory correction: the 1s chunk interval passed to recorder.start() does
// NOT bound total memory by itself — it only bounds how much is buffered
// inside the encoder between flushes; every flushed chunk still gets
// pushed onto `chunks` and held until stop(), so total memory scales with
// duration x bitrate regardless of chunk size. A true rolling buffer (drop
// old chunks so memory is capped independent of duration) was considered
// and rejected as unsafe here: MediaRecorder emits a single WebM header in
// the FIRST chunk, so discarding early chunks to keep a fixed-size window
// produces a file most players can't open, not a clip. Given a full-run
// recording was requested and 10 minutes is a bounded, known worst case,
// the simpler fix is capping duration AND setting an explicit bitrate
// (below) so that worst case is small enough to be safe: ~9MB/min at
// BITRATE_BPS, ~90MB for the full 10-minute cap on a low-end phone, well
// within what a modern mobile browser tab can hold in memory.
export const RECORDING_MAX_SECONDS = 600;

/** Capture at a modest fixed rate: plenty for a social clip, cheap to encode. */
const CAPTURE_FPS = 24;

/**
 * Explicit modest cap, not codec-default quality: a canvas-captured
 * 2D-game clip doesn't need archival bitrate, and an unbounded default
 * could push the RECORDING_MAX_SECONDS worst case well past the ~90MB
 * this was sized for. ~1.2Mbps is a common "small social clip" target.
 */
export const BITRATE_BPS = 1_200_000;

const PREFERRED_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

interface CaptureCanvas extends HTMLCanvasElement {
  captureStream(frameRate?: number): MediaStream;
}

export function recordingSupported(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof (HTMLCanvasElement.prototype as Partial<CaptureCanvas>).captureStream === "function" &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function"
  );
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return PREFERRED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
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
export function startRecording(canvas: HTMLCanvasElement): RecordingHandle | null {
  if (!recordingSupported()) return null;
  try {
    const stream = (canvas as CaptureCanvas).captureStream(CAPTURE_FPS);
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType, videoBitsPerSecond: BITRATE_BPS } : { videoBitsPerSecond: BITRATE_BPS },
    );
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

/** File extension matching the mime type actually used, for the download name. */
export function clipExtension(blob: Blob): string {
  return blob.type.includes("webm") ? "webm" : "mp4";
}
