/**
 * Daily lobby presentation math. Pure, DOM-free. Does not touch spawn,
 * scoring, or MUTATOR_POOL. See the Sep 27 2026 lobby redesign plan.
 */

import { dayInfoFor, type DayInfo, type ServerDayEntry } from "./dailyHistory";
import { medalForScore, type MedalThresholds, type MedalTier } from "./medals";
import type { DailyBestResult, DailyDayLog } from "./save";

export type LobbyPhase = "offline" | "pre" | "mid" | "out" | "unlimited";

export interface LobbyPhaseInfo {
  online: boolean;
  preview?: boolean;
  unlimitedDaily?: boolean;
  attemptsLeft: number;
  maxAttempts: number;
}

/** Hero phase for the daily lobby. `runCount` is reserved for first-visit copy. */
export function lobbyPhase(info: LobbyPhaseInfo, _runCount: number): LobbyPhase {
  if (!info.online && !info.preview) return "offline";
  if (info.unlimitedDaily || info.preview) return "unlimited";
  if (info.attemptsLeft <= 0) return "out";
  if (info.attemptsLeft >= info.maxAttempts) return "pre";
  return "mid";
}

export interface BoardNeighborhood<T> {
  top: T[];
  gap: boolean;
  around: T[];
}

/**
 * Compact board: top N, then optional gap + the viewer's rank ±1.
 * `meRank` null means pre-play (no neighborhood). When the ±1 window
 * overlaps or sits flush against the top slice, the two merge: no
 * duplicate ranks and no separator for contiguous ranks.
 */
export function boardNeighborhood<T extends { rank: number }>(
  entries: T[],
  meRank: number | null,
  topN: number,
): BoardNeighborhood<T> {
  const sorted = entries.slice().sort((a, b) => a.rank - b.rank);
  const top = sorted.filter((e) => e.rank <= topN).slice(0, topN);
  if (meRank === null || meRank <= 0) {
    return { top, gap: false, around: [] };
  }
  const inTop = new Set(top);
  const around = sorted.filter(
    (e) => e.rank >= meRank - 1 && e.rank <= meRank + 1 && !inTop.has(e),
  );
  if (around.length === 0) return { top, gap: false, around: [] };
  const lastTop = top[top.length - 1]?.rank ?? 0;
  return { top, gap: around[0].rank > lastTop + 1, around };
}

/**
 * Guest is not on the official board. Seat them at `meRank` and bump
 * everyone at or below that rank by one so signed-in and guest compact
 * boards share the same neighborhood math.
 */
export function insertGuestRank<T extends { rank: number }>(
  entries: T[],
  meRank: number,
  guest: T,
): T[] {
  if (meRank <= 0) return entries.slice().sort((a, b) => a.rank - b.rank);
  const shifted = entries.map((e) => (e.rank >= meRank ? { ...e, rank: e.rank + 1 } : e));
  return [...shifted, { ...guest, rank: meRank }].sort((a, b) => a.rank - b.rank);
}

export type WeekCellState =
  | "gold"
  | "silver"
  | "copper"
  | "flown"
  | "missed"
  | "today"
  | "future";

export interface WeekCell {
  date: string;
  dow: string;
  state: WeekCellState;
  medal: MedalTier | null;
}

/** Player-facing aria-label for a lobby week-strip cell. */
export function weekCellAriaLabel(cell: WeekCell): string {
  const d = new Date(`${cell.date}T00:00:00.000Z`);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  const status = cell.medal ?? (cell.state === "today" ? "today" : cell.state === "flown" ? "flown" : "missed");
  return `${weekday} ${month} ${day}, ${status}, open calendar`;
}

export interface WeekStripExtras {
  signedIn?: boolean;
  server?: Map<string, ServerDayEntry>;
  epochDate?: string;
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

function addCivilDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function dowOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DOW[new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1)).getUTCDay()];
}

function cellStateFromDay(
  info: DayInfo,
  todayStr: string,
  todayAttempts: { used: number; best: DailyBestResult | null },
  thresholdsFor: (dateStr: string) => MedalThresholds,
): { state: WeekCellState; medal: MedalTier | null } {
  if (info.status === "future") return { state: "future", medal: null };

  const score =
    info.date === todayStr
      ? (todayAttempts.best?.score ?? info.score)
      : info.score;
  const medal =
    typeof score === "number" ? medalForScore(score, thresholdsFor(info.date)) : (info.medal ?? null);

  if (info.date === todayStr) {
    const flown = todayAttempts.used > 0 || !!todayAttempts.best;
    if (!flown) return { state: "today", medal: null };
    if (medal) return { state: medal, medal };
    return { state: "flown", medal: null };
  }

  if (info.status === "completed" || info.status === "completed-local-only") {
    if (medal) return { state: medal, medal };
    return { state: "flown", medal: null };
  }
  if (info.status === "attempted") return { state: "flown", medal: null };
  return { state: "missed", medal: null };
}

/**
 * Last 7 patrol days ending on `todayStr`. Reuses dayInfoFor + medalForScore.
 * Pass today's live attempt row so the today cell is not waiting on archive.
 */
export function weekStrip(
  history: DailyDayLog[],
  todayStr: string,
  todayAttempts: { used: number; best: DailyBestResult | null },
  thresholdsFor: (dateStr: string) => MedalThresholds,
  extras: WeekStripExtras = {},
): WeekCell[] {
  const local = new Map<string, DailyDayLog>();
  for (const day of history) local.set(day.date, day);
  local.set(todayStr, {
    date: todayStr,
    attemptsUsed: todayAttempts.used,
    best: todayAttempts.best,
  });

  const epochDate = extras.epochDate ?? "2026-07-14";
  const signedIn = extras.signedIn ?? false;
  const server = extras.server;
  const cells: WeekCell[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addCivilDays(todayStr, -i);
    const info = dayInfoFor(date, {
      today: todayStr,
      epochDate,
      signedIn,
      local: local.get(date) ?? null,
      server: server?.get(date) ?? null,
    });
    const { state, medal } = cellStateFromDay(info, todayStr, todayAttempts, thresholdsFor);
    cells.push({ date, dow: dowOf(date), state, medal });
  }
  return cells;
}

/** Consecutive flown / medal days ending today (or yesterday if today is still open). */
export function currentStreak(cells: WeekCell[]): number {
  if (cells.length === 0) return 0;
  let i = cells.length - 1;
  const tip = cells[i];
  if (tip.state === "today" || tip.state === "future") i -= 1;
  let n = 0;
  for (; i >= 0; i--) {
    const s = cells[i].state;
    if (s === "gold" || s === "silver" || s === "copper" || s === "flown") n += 1;
    else break;
  }
  return n;
}

export interface MedalProgress {
  earned: MedalTier | null;
  next: MedalTier | null;
  from: number;
  to: number;
  remaining: number;
  ratio: number;
}

/** Progress bar numbers toward the next medal (1.0 once GOLD is earned). */
export function nextMedalProgress(score: number, thresholds: MedalThresholds): MedalProgress {
  if (score >= thresholds.gold) {
    return {
      earned: "gold",
      next: null,
      from: thresholds.gold,
      to: thresholds.gold,
      remaining: 0,
      ratio: 1,
    };
  }
  if (score >= thresholds.silver) {
    const span = Math.max(1, thresholds.gold - thresholds.silver);
    return {
      earned: "silver",
      next: "gold",
      from: thresholds.silver,
      to: thresholds.gold,
      remaining: Math.max(1, Math.ceil(thresholds.gold - score)),
      ratio: Math.min(1, Math.max(0, (score - thresholds.silver) / span)),
    };
  }
  if (score >= thresholds.copper) {
    const span = Math.max(1, thresholds.silver - thresholds.copper);
    return {
      earned: "copper",
      next: "silver",
      from: thresholds.copper,
      to: thresholds.silver,
      remaining: Math.max(1, Math.ceil(thresholds.silver - score)),
      ratio: Math.min(1, Math.max(0, (score - thresholds.copper) / span)),
    };
  }
  const span = Math.max(1, thresholds.copper);
  return {
    earned: null,
    next: "copper",
    from: 0,
    to: thresholds.copper,
    remaining: Math.max(1, Math.ceil(thresholds.copper - score)),
    ratio: Math.min(1, Math.max(0, score / span)),
  };
}
