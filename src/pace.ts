// Live pace chip data (owner: WS-H). One board fetch at run start, then pure
// rank math against that snapshot as the score climbs. No network mid-run.
// Switch: ui.hud.paceChip (default off) for the board; a challenge target
// (ui.challenge.paceTarget) is gated by the caller. Daily, online, today, not preview.

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
  /** True when the rank fields come from a fetched board; false for a target-only view. */
  board: boolean;
  /** Challenge target line data, or null. gap >= 1 when behind; `ahead` when the score is strictly above. */
  vs: { callsign: string; gap: number; ahead: boolean } | null;
}

/** A single score to chase (the challenger's best today). Frozen at run start. */
export interface PaceTarget {
  callsign: string;
  score: number;
}

export interface PaceStartCtx {
  daily: boolean;
  archive: boolean;
  preview: boolean;
  online: boolean;
  fetchBoard: () => Promise<PaceRow[]>;
  /** Challenge target, or null/absent. The caller gates it on ui.challenge.paceTarget. */
  target?: PaceTarget | null;
  /** Board fetch gate (ui.hud.paceChip). Absent: read the flag here, as before. */
  boardOn?: boolean;
  /** First Flight is unscored practice: never a target. */
  firstFlight?: boolean;
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
export function paceView(rows: readonly PaceRow[], score: number, target?: PaceTarget | null): PaceView {
  const s = Math.floor(score);
  const above = countAbove(rows, s);
  const startAbove = countAbove(rows, 0);
  const next = above > 0 ? rows[above - 1] : null;
  return {
    rank: above + 1,
    delta: Math.max(0, startAbove - above),
    next: next ? { callsign: next.callsign, gap: Math.max(1, next.score - s) } : null,
    board: true,
    vs: vsOf(s, target),
  };
}

function vsOf(s: number, target?: PaceTarget | null): PaceView["vs"] {
  if (!target) return null;
  const ahead = s > target.score;
  return { callsign: target.callsign, gap: ahead ? s - target.score : Math.max(1, target.score - s), ahead };
}

/** View with no board: only the target line. Pure. */
export function targetOnlyView(score: number, target: PaceTarget): PaceView {
  return { rank: 0, delta: 0, next: null, board: false, vs: vsOf(Math.floor(score), target) };
}

function paceVsLine(vs: NonNullable<PaceView["vs"]>): string {
  const name = vs.callsign.toUpperCase().slice(0, PACE_CALLSIGN_MAX);
  const gap = vs.gap.toLocaleString("en-US");
  return vs.ahead ? `PAST ${name} ▲${gap}` : `VS ${name} +${gap}`;
}

/** Chip text lines. Pure. */
export function paceLines(v: PaceView): string[] {
  const vsLine = v.vs ? paceVsLine(v.vs) : null;
  if (!v.board) return vsLine ? [vsLine] : [];
  const head = v.delta > 0 ? `PACE #${v.rank} ▲${v.delta}` : `PACE #${v.rank}`;
  if (vsLine) return [head, vsLine];
  if (!v.next) return [head, "LEADING"];
  const name = v.next.callsign.toUpperCase().slice(0, PACE_CALLSIGN_MAX);
  return [head, `NEXT ${name} +${v.next.gap.toLocaleString("en-US")}`];
}

/** Whether a run is eligible for the chip. Pure. */
export function paceEligible(ctx: Pick<PaceStartCtx, "daily" | "archive" | "preview" | "online">): boolean {
  return ctx.daily && !ctx.archive && !ctx.preview && ctx.online;
}

let rows: PaceRow[] | null = null;
let target: PaceTarget | null = null;
let token = 0;
let cachedScore = -1;
let cachedView: PaceView | null = null;

/** Called once per run start. */
export function onRunStart(ctx: PaceStartCtx): void {
  token++;
  rows = null;
  cachedScore = -1;
  cachedView = null;
  target = null;
  const mine = token;
  if (!paceEligible(ctx)) return;
  const t = ctx.target;
  if (t && !ctx.firstFlight && t.callsign && Number.isFinite(t.score) && t.score > 0) target = t;
  const boardOn = ctx.boardOn ?? clientFlagsSnapshot().hud?.paceChip === true;
  if (!boardOn) return; // switch off: no fetch (a target, if any, shows alone)
  void ctx
    .fetchBoard()
    .then((r) => {
      if (mine !== token) return; // a newer run started
      const n = normalizeRows(r);
      rows = n.length > 0 ? n : null;
      cachedScore = -1; // drop a target-only view cached before the board landed
      cachedView = null;
    })
    .catch(() => {
      /* failure or offline: chip stays hidden */
    });
}

/** Per-frame view for the HUD. Cached per integer score. */
export function snapshot(world: World): PaceView | null {
  if ((!rows && !target) || world.phase !== "playing") return null;
  const s = Math.floor(world.score);
  if (s !== cachedScore || !cachedView) {
    cachedScore = s;
    cachedView = rows ? paceView(rows, s, target) : targetOnlyView(s, target as PaceTarget);
  }
  return cachedView;
}
