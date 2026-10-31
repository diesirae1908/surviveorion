// Daily Orders client engine (owner: WS-O1). Picks come from the date alone
// (FNV-1a hash of date + tier, never a seeded stream), so the lobby and the
// server agree without anything inside the run. The only counter is a client
// tally of `graze` events (not sim state). The server credits orders from
// validated fields; nothing here can claim an order.

import { hashString } from "./math";
import type { OrdersParams } from "./flags";
import type { GameEvent } from "./types";
import { ordersParamsFor, resolveRunRules } from "./flags";
import { patrolDateStr } from "./patrolDate";
import catalog from "../server/orders-catalog.json";

/** Run-side counters sent with a score so the server can credit orders. */
export interface OrderStats {
  grazes: number;
}

export type OrderMetric = "timeSurvived" | "grazes" | "kills" | "maxMultiplier" | "odHot" | "odFires";

export interface CatalogEntry {
  id: string;
  tier: 1 | 2 | 3;
  metric: OrderMetric;
  needsOverdrive: boolean;
}

export const ORDER_CATALOG = catalog.orders as CatalogEntry[];

export interface OrderPick {
  id: string;
  tier: 1 | 2 | 3;
  metric: OrderMetric;
  target: number;
}

/** Mission Control voice, verb first. `{n}` is the target. Copy pending Lucas's approval. */
export const ORDER_COPY: Record<string, string> = {
  "survive-30": "Hold the line for {n} seconds",
  "graze-15": "Graze {n} drones",
  "kills-25": "Take down {n} drones",
  "chain-5": "Reach a x{n} multiplier",
  "graze-40": "Graze {n} drones",
  "survive-60": "Hold the line for {n} seconds",
  "hot-2": "Go HOT {n} times",
  "survive-120": "Hold the line for {n} seconds",
  "chain-9": "Reach a x{n} multiplier",
  "kills-250": "Take down {n} drones",
  "fires-4": "Fire Overdrive {n} times",
};

export function orderLine(pick: Pick<OrderPick, "id" | "target">): string {
  return (ORDER_COPY[pick.id] ?? pick.id).replace("{n}", String(pick.target));
}

/**
 * The date's picks, one per non-empty tier. Eligible = catalog entries of the
 * tier with `params.pool[id].on === true` (`needsOverdrive` only when Overdrive
 * is on), sorted by id; index = hash(date + tier) % eligible. Mirrors
 * server/orders.mjs (parity-tested).
 */
export function ordersForDate(dateStr: string, params: OrdersParams, overdriveOn: boolean): OrderPick[] {
  const picks: OrderPick[] = [];
  for (const tier of [1, 2, 3] as const) {
    const eligible = ORDER_CATALOG.filter(
      (o) => o.tier === tier && params.pool?.[o.id]?.on === true && (!o.needsOverdrive || overdriveOn),
    ).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (eligible.length === 0) continue;
    const o = eligible[hashString("orion-orders-" + dateStr + "-" + tier) % eligible.length];
    picks.push({ id: o.id, tier: o.tier, metric: o.metric, target: params.pool[o.id].target });
  }
  return picks;
}

export interface EvaluateInput {
  timeSurvived: number;
  kills: number;
  maxMultiplier: number;
  grazes?: number;
  odHot?: number;
  odFires?: number;
}

/** Completed order ids. A missing counter never completes. */
export function evaluate(picks: OrderPick[], input: EvaluateInput): string[] {
  const done: string[] = [];
  for (const p of picks) {
    const v = input[p.metric];
    if (typeof v === "number" && Number.isFinite(v) && v >= p.target) done.push(p.id);
  }
  return done;
}

/** Merit per order tier from the orders params. */
export function meritFor(params: OrdersParams, tier: 1 | 2 | 3): number {
  return tier === 1 ? params.meritEasy : tier === 2 ? params.meritMedium : params.meritHard;
}

// --- run counters ---

let counting = false;
let grazes = 0;

export interface OrdersStartCtx {
  patrolDate: string;
  daily: boolean;
  /** True only for today's live daily (not an archive day). */
  today: boolean;
  preview: boolean;
  training: boolean;
  params: OrdersParams | null;
}

/** Whether a run counts toward orders (pure; unit-tested). */
export function countsForOrders(ctx: OrdersStartCtx): boolean {
  return ctx.daily && ctx.today && !ctx.preview && !ctx.training && ctx.params !== null;
}

/** Called once per run start: resets the tally and decides whether this run counts. */
export function onRunStart(ctx: OrdersStartCtx): void {
  counting = countsForOrders(ctx);
  grazes = 0;
}

/** Called for each sim event. Counts `graze` only. */
export function onEvent(e: GameEvent): void {
  if (counting && e.type === "graze") grazes++;
}

/** Counters for the finished run, or null when this run does not count. */
export function runStats(): OrderStats | null {
  return counting ? { grazes } : null;
}

// --- lobby view ---

export interface OrderView extends OrderPick {
  line: string;
  merit: number;
  done: boolean;
}

/** What the lobby/result paint. */
export interface OrdersView {
  date: string;
  orders: OrderView[];
  /** Signed out: read-only plate ("Sign in to earn Merit"), no local progress. */
  signedOut: boolean;
}

/** Pure view builder (no globals): picks + server-reported completions. */
export function ordersViewModel(
  date: string,
  params: OrdersParams,
  overdriveOn: boolean,
  done: readonly string[] | null,
): OrdersView {
  const doneSet = new Set(done ?? []);
  return {
    date,
    signedOut: done === null,
    orders: ordersForDate(date, params, overdriveOn).map((p) => ({
      ...p,
      line: orderLine(p),
      merit: meritFor(params, p.tier),
      done: doneSet.has(p.id),
    })),
  };
}

// The signed-in pilot's completions for a patrol date. src/api.ts (the only
// writer) pushes it here from GET /api/me and from each score response, so
// this module never imports the api instance.
let session: { signedIn: boolean; date: string | null; done: string[]; tier: number | null } = { signedIn: false, date: null, done: [], tier: null };

export function setOrdersSession(next: { signedIn: boolean; date?: string | null; done?: readonly string[]; tier?: number | null }): void {
  session = { signedIn: next.signedIn, date: next.date ?? null, done: [...(next.done ?? [])], tier: next.tier ?? null };
}

/** The signed-in pilot's ladder tier index (0 = Ensign), or null when signed out or `orders` is off today. */
export function ladderTierToday(): number | null {
  if (!session.signedIn || session.tier === null || !ordersParamsFor(patrolDateStr())) return null;
  return session.tier;
}

/** Today's orders view, or null when the `orders` switch is off or no pick exists. */
export function todayView(): OrdersView | null {
  const date = patrolDateStr();
  const params = ordersParamsFor(date);
  if (!params) return null;
  const view = ordersViewModel(
    date,
    params,
    resolveRunRules(date).overdrive !== null,
    session.signedIn ? (session.date === date ? session.done : []) : null,
  );
  return view.orders.length > 0 ? view : null;
}
