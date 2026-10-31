// Live pace chip data (owner: WS-H). One board fetch at run start, then pure
// rank math against that snapshot as the score climbs. No network mid-run.
// Switch: ui.hud.paceChip (default off). Daily, online, today, not preview.

import type { World } from "./types";
import { clientFlagsSnapshot } from "./flags";

/** One board row the pace chip compares against. */
export interface PaceRow {
  callsign: string;
  score: number;
  /** True for the signed-in pilot's own row. */
  self: boolean;
}

/** What the HUD paints. */
export interface PaceView {
  /** Projected board rank at the current score (1 = leading). */
  rank: number;
  /** Places gained since the run started (>= 0). */
  delta: number;
  /** Closest pilot ahead, or null when leading. gap >= 1. */
  next: { callsign: string; gap: number } | null;
}

export interface PaceStartCtx {
  daily: boolean;
  archive: boolean;
  preview: boolean;
  online: boolean;
  fetchBoard: () => Promise<PaceRow[]>;
}

/** Longest callsign shown on the chip. */
export const PACE_CALLSIGN_MAX = 12;

/** Own row removed, empty callsigns and non-finite scores dropped, sorted high to low. Pure. */
export function normalizeRows(rows: PaceRow[]): PaceRow[] {
  return rows
    .filter((r) => !r.self && !!r.callsign && Number.isFinite(r.score) && r.score > 0)
    .slice()
    .sort((a, b) => b.score - a.score);
}

/** Count of rows with score strictly above `score` in a descending array (binary search). Pure. */
export function countAbove(rows: readonly PaceRow[], score: number): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].score > score) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Rank view for an integer score against normalized rows. Pure. */
export function paceView(rows: readonly PaceRow[], score: number): PaceView {
  const s = Math.floor(score);
  const above = countAbove(rows, s);
  const startAbove = countAbove(rows, 0);
  const next = above > 0 ? rows[above - 1] : null;
  return {
    rank: above + 1,
    delta: Math.max(0, startAbove - above),
    next: next ? { callsign: next.callsign, gap: Math.max(1, next.score - s) } : null,
  };
}

/** Chip text lines. Pure. */
export function paceLines(v: PaceView): string[] {
  const head = v.delta > 0 ? `PACE #${v.rank} ▲${v.delta}` : `PACE #${v.rank}`;
  if (!v.next) return [head, "LEADING"];
  const name = v.next.callsign.toUpperCase().slice(0, PACE_CALLSIGN_MAX);
  return [head, `NEXT ${name} +${v.next.gap.toLocaleString("en-US")}`];
}

/** Whether a run is eligible for the chip. Pure. */
export function paceEligible(ctx: Pick<PaceStartCtx, "daily" | "archive" | "preview" | "online">): boolean {
  return ctx.daily && !ctx.archive && !ctx.preview && ctx.online;
}

let rows: PaceRow[] | null = null;
let token = 0;
let cachedScore = -1;
let cachedView: PaceView | null = null;

/** Called once per run start. */
export function onRunStart(ctx: PaceStartCtx): void {
  token++;
  rows = null;
  cachedScore = -1;
  cachedView = null;
  const mine = token;
  if (!paceEligible(ctx)) return;
  if (!clientFlagsSnapshot().hud?.paceChip) return; // switch off: no fetch
  void ctx
    .fetchBoard()
    .then((r) => {
      if (mine !== token) return; // a newer run started
      const n = normalizeRows(r);
      rows = n.length > 0 ? n : null;
    })
    .catch(() => {
      /* failure or offline: chip stays hidden */
    });
}

/** Per-frame view for the HUD. Cached per integer score. */
export function snapshot(world: World): PaceView | null {
  if (!rows || world.phase !== "playing") return null;
  const s = Math.floor(world.score);
  if (s !== cachedScore || !cachedView) {
    cachedScore = s;
    cachedView = paceView(rows, s);
  }
  return cachedView;
}
