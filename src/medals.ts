// Daily medals: Copper / Silver / Gold thresholds on SCORE (not survival
// time). Score is actionable mid-run (it's on screen; grazing/kills/holding
// the multiplier let a skilled pilot push it higher at equal survival time),
// and it isn't monotonic with time (see JOURNAL.md round 3 for the live
// reference that motivated the switch). Fully deterministic from the UTC
// date, so any client can compute anyone's medal from their score alone.
// Client-side only for now (see save.ts); a medal calendar and server
// persistence are a planned later phase.

import { combinedDifficultyFactor, getMutatorsForDate, type Mutator } from "./mutators";

/**
 * Base thresholds before the day's mutator difficulty factor. Calibrated
 * (round 3) against the live pre-mutators production board (3 pilots, best
 * scores 279k/375k/520k at 105-121s survival, i.e. today's factor-1.0
 * baseline): Copper sits well under what a casual run needs, Silver is a
 * solid-run level, Gold sits right at the bottom of that day's real top
 * three so it stays "genuinely good", not a rubber stamp for the board's
 * leaders. Expect a re-tune after a week of real score data; these three
 * numbers are the whole knob (see JOURNAL.md round 3 for the full reasoning).
 */
export const MEDAL_BASE_SCORE = {
  copper: 60_000,
  silver: 130_000,
  gold: 300_000,
};

export type MedalTier = "gold" | "silver" | "copper";

export interface MedalThresholds {
  copper: number;
  silver: number;
  gold: number;
}

function roundTo5k(n: number): number {
  return Math.max(5_000, Math.round(n / 5_000) * 5_000);
}

/** Today's (or any date's) medal thresholds: base * combined mutator factor. */
export function medalThresholdsForDate(date: Date): MedalThresholds {
  const factor = combinedDifficultyFactor(getMutatorsForDate(date));
  return {
    copper: roundTo5k(MEDAL_BASE_SCORE.copper * factor),
    silver: roundTo5k(MEDAL_BASE_SCORE.silver * factor),
    gold: roundTo5k(MEDAL_BASE_SCORE.gold * factor),
  };
}

export function medalThresholdsFor(mutators: Mutator[]): MedalThresholds {
  const factor = combinedDifficultyFactor(mutators);
  return {
    copper: roundTo5k(MEDAL_BASE_SCORE.copper * factor),
    silver: roundTo5k(MEDAL_BASE_SCORE.silver * factor),
    gold: roundTo5k(MEDAL_BASE_SCORE.gold * factor),
  };
}

/** Medal earned for a score against a set of thresholds (null = none yet). */
export function medalForScore(score: number, thresholds: MedalThresholds): MedalTier | null {
  if (score >= thresholds.gold) return "gold";
  if (score >= thresholds.silver) return "silver";
  if (score >= thresholds.copper) return "copper";
  return null;
}

export const MEDAL_EMOJI: Record<MedalTier, string> = {
  gold: "\u{1F947}",
  silver: "\u{1F948}",
  copper: "\u{1F949}",
};

export const MEDAL_LABEL: Record<MedalTier, string> = {
  gold: "GOLD",
  silver: "SILVER",
  copper: "COPPER",
};

/** "12,000 pts to SILVER" style hint toward the next tier (null once GOLD is earned). */
export function nextMedalHint(score: number, thresholds: MedalThresholds): string | null {
  if (score >= thresholds.gold) return null;
  const target: { label: string; s: number } =
    score >= thresholds.silver
      ? { label: "GOLD", s: thresholds.gold }
      : score >= thresholds.copper
        ? { label: "SILVER", s: thresholds.silver }
        : { label: "COPPER", s: thresholds.copper };
  const remaining = Math.max(1, Math.ceil(target.s - score));
  return `${remaining.toLocaleString()} pts to ${target.label}`;
}
