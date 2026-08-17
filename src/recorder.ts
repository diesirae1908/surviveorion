// Opt-in local game recording for Lucas's Orion social content. Fully
// client-side: canvas.captureStream() + MediaRecorder produce a Blob that's
// only ever offered as a download (an <a download> click on an object URL)
// and revoked right after, never uploaded, never persisted anywhere, so
// there's no storage cost and nothing leaves the browser. Degrades cleanly:
// recordingSupported() gates every call site, and any runtime failure
// (unsupported codec, permission quirk, mid-run exception) resolves to
// "no clip" instead of throwing into the game loop.
//
// Deliberately NOT full-run-unbounded: a long Iron Rain session held as
// growing Blob chunks in memory is a real risk on low-end phones, so
// recordings auto-finalize at RECORDING_MAX_SECONDS. Daily Patrol and most
// Classic runs finish in 1-3 minutes, well under the cap; only a marathon
// run loses its tail. See JOURNAL.md for the rolling-buffer alternative
// considered and deferred.

/** Safety cap: auto-stop and finalize after this long, regardless of run length. */
export const RECORDING_MAX_SECONDS = 360;

/** Capture at a modest fixed rate: plenty for a social clip, cheap to encode. */
const CAPTURE_FPS = 24;

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
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    let stopped = false;

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const finalize = (): Blob | null =>
      chunks.length > 0 ? new Blob(chunks, { type: mimeType ?? "video/webm" }) : null;

    // 1s chunks keep memory bounded and mean a mid-run crash still leaves
    // most of the footage flushed instead of buffered in one giant blob.
    recorder.start(1000);

    const autoStopTimer = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, RECORDING_MAX_SECONDS * 1000);

    const cleanup = (): void => {
      clearTimeout(autoStopTimer);
      for (const track of stream.getTracks()) track.stop();
    };

    return {
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
