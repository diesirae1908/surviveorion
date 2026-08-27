// Patrol history calendar: pure day-status logic, no DOM. Kept separate
// from ui.ts (presentation) and api.ts (networking) so the "what does this
// day mean" reasoning can be unit-tested headlessly (see
// scripts/test-daily-history.ts) and reused by whichever screen ends up
// rendering it.
//
// Data capability, read this before changing any status here: the server
// only ever learns about a COMPLETED daily run (a submitted score). It has
// no idea a run was ever started, so it can never see "attempted but did
// not finish" on its own, only "completed" or "nothing". That distinction
// is local-only (see save.ts DailyDayLog), and only exists for patrol days
// this device was actually open for the rollover. A signed-in pilot's
// completed-run history is authoritative from the day they created their
// account onward (any earlier gap is "before this pilot existed", not
// "missed"); a signed-out pilot only ever has whatever this device
// remembers locally.

import { medalForScore, medalThresholdsForDate, type MedalTier } from "./medals";
import { getMutatorsForDate, type Mutator } from "./mutators";
import type { DailyDayLog } from "./save";

/** One patrol day's confirmed server result (GET /api/me/daily-history). */
export interface ServerDayEntry {
  date: string;
  best: number;
  bestTime: number;
  runs: number;
  rank: number | null;
}

export type DayStatus =
  /** After today: no data can exist yet. */
  | "future"
  /** Before Daily Patrol existed (or before this pilot's account, for a
   * signed-in view): not a real gap, just outside the feature's history. */
  | "before-launch"
  | "today"
  /** A completed run this device or account can vouch for. */
  | "completed"
  /** A completed run known only to this device: signed out, or signed in
   * but the server has no matching score (flown before linking this
   * device, or a submission that never landed). Distinguishing this from
   * plain "completed" is the "handle local/server disagreement honestly"
   * requirement. */
  | "completed-local-only"
  /** An attempt was spent (this device saw it) but no run finished. */
  | "attempted"
  /** Confirmed no completed run that day (signed-in: server silence past
   * account creation; signed-out: this device was open with zero attempts
   * spent). */
  | "missed"
  /** No information at all: signed out and this device has no record. */
  | "untracked";

export interface DayInfo {
  date: string;
  status: DayStatus;
  score?: number;
  time?: number;
  rank?: number | null;
  medal?: MedalTier | null;
  /** 1 normally, 2 on Sundays, [] before the mutator pool's launch gate. */
  mutators: Mutator[];
  /** True on "completed-local-only" when it's actually a genuine mismatch
   * (signed in, but the server disagrees) rather than simply "no server
   * account to check against". */
  sourceConflict?: boolean;
}

export interface DayInfoOpts {
  /** Today's patrol date string ('YYYY-MM-DD', Pacific Time). */
  today: string;
  /** Earliest date the calendar should treat as real Daily Patrol history:
   * max(feature launch date, this pilot's account creation date). */
  epochDate: string;
  signedIn: boolean;
  local: DailyDayLog | null;
  server: ServerDayEntry | null;
}

function medalForDate(dateStr: string, score: number): MedalTier | null {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  return medalForScore(score, medalThresholdsForDate(date));
}

/** Resolve one calendar day's status + stats from whatever data is available. */
export function dayInfoFor(dateStr: string, opts: DayInfoOpts): DayInfo {
  // A future day's mutator is technically already decided by the date hash,
  // but handing it out here would spoil tomorrow's reveal for any caller,
  // present or future, not just today's calendar UI. Withhold it at the
  // source rather than trusting every consumer to hide it.
  if (dateStr > opts.today) return { date: dateStr, status: "future", mutators: [] };

  const mutators = getMutatorsForDate(new Date(`${dateStr}T00:00:00.000Z`));
  if (dateStr === opts.today) return { date: dateStr, status: "today", mutators };
  if (dateStr < opts.epochDate) return { date: dateStr, status: "before-launch", mutators };

  const { local, server, signedIn } = opts;

  if (signedIn) {
    if (server) {
      const conflict = !!local?.best && Math.abs(local.best.score - server.best) > 0.5;
      return {
        date: dateStr,
        status: "completed",
        score: server.best,
        time: server.bestTime,
        rank: server.rank,
        medal: medalForDate(dateStr, server.best),
        mutators,
        sourceConflict: conflict,
      };
    }
    // The server is authoritative for a signed-in pilot from their account's
    // creation date onward, so its silence here means "no completed run",
    // not "unknown". A local best surviving that silence never reached the
    // account (flown before linking, or a failed submission) - surface it
    // rather than discarding real information the player might recognize.
    if (local?.best) {
      return {
        date: dateStr,
        status: "completed-local-only",
        score: local.best.score,
        time: local.best.time,
        rank: local.best.rank,
        medal: medalForDate(dateStr, local.best.score),
        mutators,
        sourceConflict: true,
      };
    }
    if (local && local.attemptsUsed > 0) return { date: dateStr, status: "attempted", mutators };
    return { date: dateStr, status: "missed", mutators };
  }

  // Signed out: this device's local log is the only source there is.
  if (local?.best) {
    return {
      date: dateStr,
      status: "completed-local-only",
      score: local.best.score,
      time: local.best.time,
      rank: local.best.rank,
      medal: medalForDate(dateStr, local.best.score),
      mutators,
    };
  }
  if (local && local.attemptsUsed > 0) return { date: dateStr, status: "attempted", mutators };
  if (local) return { date: dateStr, status: "missed", mutators };
  return { date: dateStr, status: "untracked", mutators };
}

// --- calendar date helpers (civil YYYY-MM-DD labels, not live rollover) ---

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function utcDateStr(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Sunday-start grid: how many empty cells precede day 1. */
export function leadingPadding(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 1)).getUTCDay();
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1))
    .toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

export function maxDateStr(a: string, b: string): string {
  return a > b ? a : b;
}

export interface MonthKey {
  year: number;
  month: number;
}

export function prevMonthOf({ year, month }: MonthKey): MonthKey {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

export function nextMonthOf({ year, month }: MonthKey): MonthKey {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}
