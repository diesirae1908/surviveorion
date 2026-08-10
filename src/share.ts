// Share card for the daily-only site: a Wordle-style pasteable text block.
// Native share sheet on phones, clipboard on desktop.

import { MEDAL_EMOJI, MEDAL_LABEL, type MedalTier } from "./medals";
import { DAILY_MAX_ATTEMPTS } from "./save";

/**
 * Day the daily site went live, that date is Daily/Patrol #1. Reused as the
 * Patrol # epoch too (same feature, same numbering, no separate epoch).
 */
const DAILY_EPOCH_UTC = Date.UTC(2026, 6, 14);

const MS_PER_DAY = 86_400_000;

/** Daily Patrol number for the current UTC date (same boundary as the seed). */
export function dailyNumber(date = new Date()): number {
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
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
}

export const SHARE_URL = "surviveorion.com";

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
    s.mutatorNames && s.mutatorNames.length > 0 ? s.mutatorNames.join(" + ") : null,
    line.join("  ·  "),
    medalLine,
    `attempt ${Math.min(s.attempt, DAILY_MAX_ATTEMPTS)}/${DAILY_MAX_ATTEMPTS}`,
    SHARE_URL,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

export type ShareOutcome = "shared" | "copied" | "failed";

/**
 * Native share sheet where it makes sense (phones), clipboard otherwise.
 * A user-cancelled share sheet still counts as "shared" — no error toast.
 */
export async function shareText(text: string, preferNative: boolean): Promise<ShareOutcome> {
  if (preferNative && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
      // NotAllowedError etc. — fall through to the clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
