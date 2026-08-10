// Daily medals: Copper / Silver / Gold thresholds on SURVIVAL TIME (not
// score; time is legible and immune to any future scoring tuning). Fully
// deterministic from the UTC date, so any client can compute anyone's medal
// from their time alone. Client-side only for now (see save.ts); a medal
// calendar and server persistence are a planned later phase.

import { combinedDifficultyFactor, getMutatorsForDate, type Mutator } from "./mutators";

/** Base thresholds (seconds) before the day's mutator difficulty factor. */
export const MEDAL_BASE_SECONDS = {
  copper: 60,
  silver: 120,
  gold: 200,
};

export type MedalTier = "gold" | "silver" | "copper";

export interface MedalThresholds {
  copper: number;
  silver: number;
  gold: number;
}

function roundTo5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

/** Today's (or any date's) medal thresholds: base * combined mutator factor. */
export function medalThresholdsForDate(date: Date): MedalThresholds {
  const factor = combinedDifficultyFactor(getMutatorsForDate(date));
  return {
    copper: roundTo5(MEDAL_BASE_SECONDS.copper * factor),
    silver: roundTo5(MEDAL_BASE_SECONDS.silver * factor),
    gold: roundTo5(MEDAL_BASE_SECONDS.gold * factor),
  };
}

export function medalThresholdsFor(mutators: Mutator[]): MedalThresholds {
  const factor = combinedDifficultyFactor(mutators);
  return {
    copper: roundTo5(MEDAL_BASE_SECONDS.copper * factor),
    silver: roundTo5(MEDAL_BASE_SECONDS.silver * factor),
    gold: roundTo5(MEDAL_BASE_SECONDS.gold * factor),
  };
}

/** Medal earned for a survival time against a set of thresholds (null = none yet). */
export function medalForTime(time: number, thresholds: MedalThresholds): MedalTier | null {
  if (time >= thresholds.gold) return "gold";
  if (time >= thresholds.silver) return "silver";
  if (time >= thresholds.copper) return "copper";
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

/** "12s to SILVER" style hint toward the next tier (null once GOLD is earned). */
export function nextMedalHint(time: number, thresholds: MedalThresholds): string | null {
  if (time >= thresholds.gold) return null;
  const target: { label: string; t: number } =
    time >= thresholds.silver
      ? { label: "GOLD", t: thresholds.gold }
      : time >= thresholds.copper
        ? { label: "SILVER", t: thresholds.silver }
        : { label: "COPPER", t: thresholds.copper };
  const remaining = Math.max(1, Math.ceil(target.t - time));
  return `${remaining}s to ${target.label}`;
}
