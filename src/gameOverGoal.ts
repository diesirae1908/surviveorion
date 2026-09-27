/**
 * Game-over goal line and guest provisional rank. Pure, DOM-free.
 * Bots count toward M: same combined board TODAY'S BOARD already shows.
 */

import { nextMedalHint, type MedalThresholds } from "./medals";

export interface GoalBoardEntry {
  callsign: string;
  score: number;
}

export function fmtPts(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

/**
 * Guest rank on the combined daily board (bots included). The run is not
 * on the board yet, so total is board length + 1. Ties rank below: anyone
 * with an equal or higher score sits above this guest.
 */
export function provisionalRank(
  score: number,
  boardEntries: GoalBoardEntry[],
): { rank: number; total: number } {
  const betterOrTied = boardEntries.filter((e) => e.score >= score).length;
  return { rank: betterOrTied + 1, total: boardEntries.length + 1 };
}

/** Unsigned, non-refunded daily: "Would be #N of M today". Else null. */
export function guestRankLine(opts: {
  score: number;
  board: GoalBoardEntry[];
  signedIn: boolean;
  refunded: boolean;
}): string | null {
  if (opts.signedIn || opts.refunded) return null;
  const { rank, total } = provisionalRank(opts.score, opts.board);
  return `Would be #${rank} of ${total} today`;
}

/**
 * Reachable first goal. Far below copper (under 40% of the threshold):
 * nearest board name above you, or "Beat your best today". Otherwise the
 * existing next-medal hint. Null once GOLD is earned.
 */
export function goalLine(
  score: number,
  thresholds: MedalThresholds,
  board: GoalBoardEntry[],
  ownBestToday: number,
): string | null {
  if (score >= thresholds.gold) return null;
  if (score < 0.4 * thresholds.copper) {
    let nearest: GoalBoardEntry | null = null;
    for (const row of board) {
      if (row.score <= score) continue;
      if (!nearest || row.score < nearest.score) nearest = row;
    }
    if (nearest) return `Next up: ${nearest.callsign}, ${fmtPts(nearest.score)}`;
    return `Beat your best today: ${fmtPts(ownBestToday)}`;
  }
  return nextMedalHint(score, thresholds);
}
