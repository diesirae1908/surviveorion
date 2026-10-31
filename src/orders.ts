// Daily Orders client engine (owner: WS-O1). Stub from WS-R: types and no-op
// bodies for the main.ts seams. Nothing here touches sim state or draws from
// the seeded streams; the only counter WS-O1 adds is a client tally of graze
// events.

import type { OrdersParams } from "./flags";
import type { GameEvent } from "./types";

/** Run-side counters sent with a score so the server can credit orders. */
export interface OrderStats {
  grazes: number;
}

/** What the lobby/result paint. WS-O1 fills the fields. */
export type OrdersView = Record<string, unknown>;

export interface OrdersStartCtx {
  patrolDate: string;
  daily: boolean;
  /** True only for today's live daily (not an archive day). */
  today: boolean;
  preview: boolean;
  training: boolean;
  params: OrdersParams | null;
}

/** Called once per run start. Stub: does nothing. */
export function onRunStart(_ctx: OrdersStartCtx): void {
  void _ctx;
}

/** Called for each sim event. Stub: does nothing. */
export function onEvent(_e: GameEvent): void {
  void _e;
}

/** Counters for the finished run, or null when nothing to report (stub: always null). */
export function runStats(): OrderStats | null {
  return null;
}

/** Today's orders view, or null (stub: always null). */
export function todayView(): OrdersView | null {
  return null;
}
