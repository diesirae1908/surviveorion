// Daily Orders + Pilot Ladder, server side. Same algorithm as src/orders.ts
// (parity-tested by scripts/test-orders-parity.ts). The server resolves the
// date's orders itself and credits from validated run fields only: the client
// never names an order id.

import fs from "node:fs";
import { grazeLimits } from "./validate.mjs";

// readFileSync, not a JSON import attribute: works on every Node the server runs on.
const catalog = JSON.parse(
  fs.readFileSync(new URL("./orders-catalog.json", import.meta.url), "utf8"),
);

export const ORDER_CATALOG = catalog.orders;
export const LADDER = catalog.ladder;
export const TRAILS = catalog.trails;

/** Mirror of the max `overdriveChargeScale` in src/mutators.ts (parity-tested). */
export const MAX_MUTATOR_OD_CHARGE_SCALE = 2;

/** FNV-1a 32-bit, identical to hashString in src/math.ts. */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The date's picks, one per non-empty tier: `[{ id, tier, metric, target }]`.
 * Eligible = catalog entries of the tier with `params.pool[id].on === true`
 * (needsOverdrive entries only when Overdrive is on), sorted by id, indexed by
 * a hash of date + tier (not a stream, so turning an entry off never moves
 * another tier's pick).
 */
export function ordersForDate(dateStr, params, overdriveOn) {
  const picks = [];
  const pool = params?.pool ?? {};
  for (const tier of [1, 2, 3]) {
    const eligible = ORDER_CATALOG.filter(
      (o) => o.tier === tier && pool[o.id]?.on === true && (!o.needsOverdrive || overdriveOn),
    ).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (eligible.length === 0) continue;
    const o = eligible[hashString("orion-orders-" + dateStr + "-" + tier) % eligible.length];
    picks.push({ id: o.id, tier: o.tier, metric: o.metric, target: pool[o.id].target });
  }
  return picks;
}

/** Merit for an order tier from the orders params. */
export function meritForTier(params, tier) {
  const v = tier === 1 ? params?.meritEasy : tier === 2 ? params?.meritMedium : params?.meritHard;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Completed order ids. A missing or non-numeric counter never completes. */
export function evaluate(picks, input) {
  const done = [];
  for (const p of picks) {
    const v = input?.[p.metric];
    if (typeof v === "number" && Number.isFinite(v) && v >= p.target) done.push(p.id);
  }
  return done;
}

/** Upper bound on how many full Overdrive meters a run could have filled. */
export function meterFills(timeSurvived, grazes, odParams) {
  const p = odParams ?? {};
  const perGraze = (p.chargePerGraze ?? 0.15) * (p.razorGrazeScale ?? 2) * MAX_MUTATOR_OD_CHARGE_SCALE;
  return Math.ceil(grazes * perGraze + timeSurvived * (p.maxKillChargePerSec ?? 0.1)) + 1;
}

const isCount = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * Plausibility of the run-side counters. Returns the counters the server will
 * trust (`undefined` = missing, so no order on that metric can complete) and
 * whether any counter was rejected.
 */
export function checkPlausible(stats, run, mutatorNames, odParams, overdriveOn) {
  const out = { grazes: undefined, odHot: undefined, odFires: undefined };
  let rejected = false;
  const t = run.timeSurvived;
  const g = stats?.grazes;
  if (g !== undefined && g !== null) {
    if (isCount(g) && g <= Math.ceil(t * grazeLimits(mutatorNames).perSec) + 2) out.grazes = g;
    else rejected = true;
  }
  // Without a trusted graze counter the meter bound is unknowable: those
  // counters stay missing (no order on them completes) and are not "rejected".
  const fills = overdriveOn && out.grazes !== undefined ? meterFills(t, out.grazes, odParams) : 0;
  for (const k of ["odHot", "odFires"]) {
    const v = run[k];
    if (v === undefined || v === null || out.grazes === undefined) continue;
    if (isCount(v) && v <= fills) out[k] = v;
    else rejected = true;
  }
  return { counters: out, rejected };
}

/** Highest ladder tier whose threshold the Merit reaches. */
export function tierForMerit(merit) {
  let tier = 0;
  for (const l of LADDER) if (merit >= l.merit) tier = l.tier;
  return tier;
}

/** Trail ids a ladder tier may equip. */
export const unlockedTrails = (tier) => TRAILS.filter((t) => t.tier <= tier).map((t) => t.id);
