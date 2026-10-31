/**
 * Daily Orders client engine (WS-O1): deterministic picks, tier independence,
 * needsOverdrive, evaluate, counting rules, the signed-out view, and the
 * seeded-draw ban. Run: npx tsx scripts/test-orders.ts (wired into `npm test`).
 */
import fs from "node:fs";
import {
  ORDER_CATALOG,
  countsForOrders,
  evaluate,
  onEvent,
  onRunStart,
  ordersForDate,
  ordersViewModel,
  runStats,
  type OrdersStartCtx,
} from "../src/orders";
import registry from "../server/flags-registry.json";
import type { OrdersParams } from "../src/flags";
import type { GameEvent } from "../src/types";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const def = () => structuredClone(registry.flags.orders.default.params) as OrdersParams;
const dates = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10));

// --- picks -----------------------------------------------------------------
{
  const a = ordersForDate("2026-11-03", def(), true);
  const b = ordersForDate("2026-11-03", def(), true);
  check("same date and params give the same picks", JSON.stringify(a) === JSON.stringify(b));
  check("three tiers, one pick each", a.length === 3 && a.map((p) => p.tier).join() === "1,2,3");
  const seen = new Set(dates.map((d) => ordersForDate(d, def(), true).map((p) => p.id).join("|")));
  check("picks vary across dates", seen.size > 10, String(seen.size));
  check("target comes from params", ordersForDate("2026-11-03", { ...def(), pool: { ...def().pool, [a[0].id]: { on: true, target: 17 } } }, true)[0].target === 17);
}

// --- turning an entry off never moves other tiers ---------------------------
{
  let moved = 0;
  for (const d of dates) {
    const base = ordersForDate(d, def(), true);
    const t1 = base[0].id;
    const p = def();
    p.pool[t1] = { ...p.pool[t1], on: false };
    const after = ordersForDate(d, p, true);
    if (after[1].id !== base[1].id || after[2].id !== base[2].id) moved++;
    if (after[0].id === t1) moved++;
  }
  check("turning off a tier 1 entry never changes tiers 2 and 3", moved === 0, String(moved));
}

// --- empty tier skipped ------------------------------------------------------
{
  const p = def();
  for (const o of ORDER_CATALOG) if (o.tier === 2) p.pool[o.id] = { ...p.pool[o.id], on: false };
  const r = ordersForDate("2026-11-05", p, true);
  check("an empty tier is skipped", r.length === 2 && r.every((x) => x.tier !== 2));
}

// --- needsOverdrive ----------------------------------------------------------
{
  const needs = ORDER_CATALOG.filter((o) => o.needsOverdrive).map((o) => o.id);
  const anyOn = dates.some((d) => ordersForDate(d, def(), true).some((p) => needs.includes(p.id)));
  const anyOff = dates.some((d) => ordersForDate(d, def(), false).some((p) => needs.includes(p.id)));
  check("needsOverdrive orders can be picked with Overdrive on", anyOn);
  check("needsOverdrive orders are never picked with Overdrive off", !anyOff);
}

// --- evaluate ----------------------------------------------------------------
{
  const picks = [
    { id: "survive-30", tier: 1 as const, metric: "timeSurvived" as const, target: 30 },
    { id: "graze-40", tier: 2 as const, metric: "grazes" as const, target: 40 },
    { id: "hot-2", tier: 2 as const, metric: "odHot" as const, target: 2 },
  ];
  const base = { timeSurvived: 31, kills: 0, maxMultiplier: 1 };
  check("evaluate: met target completes", evaluate(picks, base).join() === "survive-30");
  check("evaluate: exact target completes", evaluate(picks, { ...base, timeSurvived: 30 }).includes("survive-30"));
  check("evaluate: below target does not", !evaluate(picks, { ...base, timeSurvived: 29.9 }).includes("survive-30"));
  check("evaluate: a missing counter never completes", !evaluate(picks, base).includes("graze-40") && !evaluate(picks, base).includes("hot-2"));
  check("evaluate: counters count when present", evaluate(picks, { ...base, grazes: 40, odHot: 2 }).length === 3);
  check("evaluate: NaN never completes", evaluate(picks, { ...base, timeSurvived: Number.NaN }).length === 0);
}

// --- counting rules ----------------------------------------------------------
{
  const params = def();
  const ctx: OrdersStartCtx = { patrolDate: "2026-11-03", daily: true, today: true, preview: false, training: false, params };
  const graze = { type: "graze", x: 0, y: 0, points: 10 } as GameEvent;
  const other = { type: "droneKilled" } as unknown as GameEvent;
  check("counts: today's live daily with params", countsForOrders(ctx));
  check("no count: not a daily", !countsForOrders({ ...ctx, daily: false }));
  check("no count: archive day", !countsForOrders({ ...ctx, today: false }));
  check("no count: preview", !countsForOrders({ ...ctx, preview: true }));
  check("no count: training", !countsForOrders({ ...ctx, training: true }));
  check("no count: switch off (params null)", !countsForOrders({ ...ctx, params: null }));
  onRunStart(ctx);
  onEvent(graze);
  onEvent(graze);
  onEvent(other);
  check("runStats counts graze events only", JSON.stringify(runStats()) === '{"grazes":2}');
  onRunStart(ctx);
  check("a new run resets the tally", runStats()?.grazes === 0);
  onRunStart({ ...ctx, preview: true });
  onEvent(graze);
  check("runStats is null when the run does not count", runStats() === null);
}

// --- signed-out view ---------------------------------------------------------
{
  const v = ordersViewModel("2026-11-03", def(), true, null);
  check("signed-out view is read-only: signedOut, nothing done", v.signedOut && v.orders.every((o) => !o.done) && v.orders.length === 3);
  const first = v.orders[0].id;
  const s = ordersViewModel("2026-11-03", def(), true, [first]);
  check("signed-in view marks server-reported completions", !s.signedOut && s.orders[0].done && !s.orders[1].done);
  check("view carries copy and merit per tier", v.orders.every((o) => o.line.length > 0 && !o.line.includes("{n}")) && v.orders.map((o) => o.merit).join() === "1,2,4");
}

// --- no seeded draws ---------------------------------------------------------
{
  const src = fs.readFileSync(new URL("../src/orders.ts", import.meta.url), "utf8");
  check("src/orders.ts never calls a seeded draw", !/\b(rand|scheduleRand|randRange|scheduleRange)\s*\(/.test(src) && !/import[^;]*\b(rand|scheduleRand|randRange|scheduleRange)\b/.test(src));
}

process.exit(failures === 0 ? (console.log("\nALL PASS"), 0) : (console.log(`\n${failures} FAILED`), 1));
