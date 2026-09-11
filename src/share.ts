// Share card for the daily-only site: a Wordle-style pasteable text block.
// Native share sheet on phones, clipboard on desktop.

import { MEDAL_EMOJI, MEDAL_LABEL, type MedalTier } from "./medals";
import { isNativeApp, nativeShare } from "./native";
import { patrolDateStr } from "./patrolDate";
import { DAILY_MAX_ATTEMPTS } from "./save";

/**
 * Day the daily site went live, that date is Daily/Patrol #1. Reused as the
 * Patrol # epoch too (same feature, same numbering, no separate epoch), and
 * as the earliest date the patrol history calendar will ever show as a real
 * (rather than "before launch") day.
 */
export const DAILY_EPOCH_UTC = Date.UTC(2026, 6, 14);

/** DAILY_EPOCH_UTC as a 'YYYY-MM-DD' string, for date-string comparisons. */
export const DAILY_EPOCH_DATE = new Date(DAILY_EPOCH_UTC).toISOString().slice(0, 10);

const MS_PER_DAY = 86_400_000;

/** Daily Patrol number for the current patrol date (same boundary as the seed). */
export function dailyNumber(date = new Date()): number {
  const dateStr = patrolDateStr(date);
  const [y, m, d] = dateStr.split("-").map(Number);
  const today = Date.UTC(y, m - 1, d);
  return Math.round((today - DAILY_EPOCH_UTC) / MS_PER_DAY) + 1;
}

export interface ShareStats {
  dayNumber: number;
  score: number;
  /** Seconds survived. */
  time: number;
  maxMultiplier: number;
  /** Daily board rank, if known (signed-in runs only). */
  rank: number | null;
  /** 1-based attempt number the result came from. */
  attempt: number;
  /** Today's mutator name(s), e.g. ["RED ALERT"] or ["BLACKOUT", "GIANTS"] on Sundays. */
  mutatorNames?: string[];
  /** Best-of-day medal, or null if no tier reached yet. */
  medal?: MedalTier | null;
  /** This card came from a ?mutator= preview run: not scored, not on any board. */
  preview?: boolean;
}

export const SHARE_URL = "https://surviveorion.com";

export function buildShareText(s: ShareStats): string {
  const mins = Math.floor(s.time / 60);
  const secs = Math.floor(s.time % 60).toString().padStart(2, "0");
  const line = [
    `⏱ ${mins}:${secs}`,
    `${Math.floor(s.score).toLocaleString()} pts`,
    `×${s.maxMultiplier.toFixed(1)} peak`,
  ];
  if (s.rank !== null) line.push(`🏆 #${s.rank} today`);
  const medalLine = s.medal ? `${MEDAL_EMOJI[s.medal]} ${MEDAL_LABEL[s.medal]}` : null;
  return [
    `ORION Patrol #${s.dayNumber}`,
    s.preview ? "PREVIEW (not scored, not submitted)" : null,
    s.mutatorNames && s.mutatorNames.length > 0 ? s.mutatorNames.join(" + ") : null,
    line.join("  ·  "),
    medalLine,
    s.preview ? null : `attempt ${Math.min(s.attempt, DAILY_MAX_ATTEMPTS)}/${DAILY_MAX_ATTEMPTS}`,
    SHARE_URL,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

export type ShareOutcome = "shared" | "copied" | "failed";

/** Brand-kit share card (1080 square) as a PNG blob for the native sheet. */
export function renderShareCardPng(s: ShareStats): Promise<Blob | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  const bg = ctx.createRadialGradient(size / 2, size / 2, 40, size / 2, size / 2, size * 0.78);
  bg.addColorStop(0, "#12121e");
  bg.addColorStop(1, "#0a0a12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#2a2a3a";
  ctx.lineWidth = 3;
  ctx.strokeRect(56, 56, 968, 968);

  const gold = ctx.createLinearGradient(112, 0, 112, 200);
  gold.addColorStop(0, "#ffee88");
  gold.addColorStop(0.55, "#ffd700");
  gold.addColorStop(1, "#cc8800");

  ctx.fillStyle = gold;
  ctx.font = "700 72px Rajdhani, system-ui, sans-serif";
  ctx.fillText("ORION", 226, 190);
  ctx.fillStyle = "#8a7a55";
  ctx.font = "600 28px Rajdhani, system-ui, sans-serif";
  ctx.fillText(`DAILY PATROL No. ${s.dayNumber}`, 226, 232);

  const mins = Math.floor(s.time / 60);
  const secs = Math.floor(s.time % 60).toString().padStart(2, "0");
  const lines: Array<[string, string, string]> = [
    ["SCORE", Math.floor(s.score).toLocaleString(), "#ffd700"],
    ["SURVIVED", `${mins}:${secs}`, "#fff7e0"],
    ["PEAK", `×${s.maxMultiplier.toFixed(1)}`, "#fff7e0"],
  ];
  if (s.rank !== null) lines.push(["RANK", `#${s.rank} today`, "#fff7e0"]);
  if (s.medal) lines.push(["MEDAL", MEDAL_LABEL[s.medal], "#ffd700"]);
  if (s.mutatorNames && s.mutatorNames.length > 0) {
    lines.push(["TODAY'S MUTATOR", s.mutatorNames.join(" + "), "#ff4455"]);
  }

  let y = 360;
  for (const [label, value, color] of lines) {
    ctx.fillStyle = "#8a7a55";
    ctx.font = "600 28px Rajdhani, system-ui, sans-serif";
    ctx.fillText(label, 112, y);
    ctx.fillStyle = color;
    ctx.font = "700 56px Rajdhani, system-ui, sans-serif";
    ctx.fillText(value, 112, y + 64);
    y += 130;
  }

  ctx.fillStyle = "#8a7a55";
  ctx.font = "600 28px Rajdhani, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("surviveorion.com", 968, 966);
  ctx.textAlign = "left";

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/**
 * Native share sheet where it makes sense (phones), clipboard otherwise.
 * A user-cancelled share sheet still counts as "shared" — no error toast.
 */
export async function shareText(text: string, preferNative: boolean, png?: Blob | null): Promise<ShareOutcome> {
  if (isNativeApp()) {
    const ok = await nativeShare(text, png);
    if (ok) return "shared";
  }
  if (preferNative && typeof navigator.share === "function") {
    try {
      const files =
        png && typeof File !== "undefined"
          ? [new File([png], "orion-patrol.png", { type: "image/png" })]
          : undefined;
      if (files && navigator.canShare?.({ files })) {
        await navigator.share({ text, url: SHARE_URL, files });
      } else {
        await navigator.share({ text, url: SHARE_URL });
      }
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

export async function sharePatrol(stats: ShareStats, preferNative: boolean): Promise<ShareOutcome> {
  const text = buildShareText(stats);
  const png = await renderShareCardPng(stats);
  return shareText(text, preferNative, png);
}
