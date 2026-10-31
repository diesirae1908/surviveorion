/**
 * Daily Orders parity (WS-O1): the client picks (src/orders.ts) and the server
 * picks (server/orders.mjs) must agree for every date and pool; hashString,
 * the Overdrive meter constant and the ladder constant are locked here.
 * Run: npx tsx scripts/test-orders-parity.ts (wired into `npm test`).
 */
import fs from "node:fs";
import registry from "../server/flags-registry.json";
import { hashString } from "../src/math";
import { MUTATOR_POOL } from "../src/mutators";
import { ORDER_CATALOG, evaluate as clientEvaluate, ordersForDate as clientPicks } from "../src/orders";
import type { OrdersParams } from "../src/flags";
import * as server from "../server/orders.mjs";
import { meterFills } from "../server/orders.mjs";
import { checkPlausible } from "../server/orders.mjs";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const defParams = registry.flags.orders.default.params as unknown as OrdersParams;
const allOn = structuredClone(defParams);
const sparse = structuredClone(defParams);
for (const o of ORDER_CATALOG) if (o.id.endsWith("-5") || o.id.startsWith("graze") || o.id === "hot-2") sparse.pool[o.id] = { ...sparse.pool[o.id], on: false };
const retargeted = structuredClone(defParams);
for (const o of ORDER_CATALOG) retargeted.pool[o.id] = { on: o.id.length % 2 === 0 || o.tier === 3, target: 7 };
// A row that lacks pool entries (older/hand-written row): missing = OFF on both sides.
const lacking = structuredClone(defParams);
delete (lacking.pool as Record<string, unknown>)["survive-30"];
delete (lacking.pool as Record<string, unknown>)["chain-9"];
const fixtures: Array<[string, OrdersParams]> = [["all on", allOn], ["sparse", sparse], ["retargeted", retargeted], ["lacking", lacking]];
{
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const d = new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
    for (const p of clientPicks(d, lacking, true)) ids.add(p.id);
  }
  check("a pool entry missing from a row is never picked", !ids.has("survive-30") && !ids.has("chain-9"));
}

// --- picks: 400 dates x 4 pool fixtures x Overdrive on/off -------------------
{
  let mismatches = 0;
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
    for (const [, p] of fixtures) {
      for (const od of [true, false]) {
        n++;
        if (JSON.stringify(clientPicks(d, p, od)) !== JSON.stringify(server.ordersForDate(d, p, od))) mismatches++;
      }
    }
  }
  check(`client and server picks agree (${n} cases)`, mismatches === 0, String(mismatches));
}

// --- catalog: both read the same file ----------------------------------------
{
  const json = JSON.parse(fs.readFileSync(new URL("../server/orders-catalog.json", import.meta.url), "utf8"));
  check("server catalog equals the shared JSON", JSON.stringify(server.ORDER_CATALOG) === JSON.stringify(json.orders));
  check("client catalog equals the shared JSON", JSON.stringify(ORDER_CATALOG) === JSON.stringify(json.orders));
  check("registry pool covers exactly the catalog", JSON.stringify(Object.keys(defParams.pool).sort()) === JSON.stringify(ORDER_CATALOG.map((o) => o.id).sort()));
  const bounds = registry.flags.orders.bounds as Record<string, [number, number]>;
  check("every default target sits inside its registry bounds", ORDER_CATALOG.every((o) => {
    const b = bounds[`pool.${o.id}.target`];
    const t = defParams.pool[o.id].target;
    return !!b && t >= b[0] && t <= b[1];
  }));
}

// --- hashString --------------------------------------------------------------
{
  const samples = ["", "a", "orion-orders-2026-11-03-1", "orion-orders-2026-12-31-3", "é✓"];
  check("hashString matches src/math.ts", samples.every((s) => hashString(s) === server.hashString(s)));
}

// --- evaluate ----------------------------------------------------------------
{
  const inputs = [
    { timeSurvived: 31, kills: 30, maxMultiplier: 6, grazes: 41, odHot: 2, odFires: 5 },
    { timeSurvived: 10, kills: 1, maxMultiplier: 1 },
    { timeSurvived: 125, kills: 300, maxMultiplier: 10, grazes: 0 },
  ];
  let bad = 0;
  for (let i = 0; i < 100; i++) {
    const d = new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
    const picks = clientPicks(d, allOn, true);
    for (const inp of inputs) if (clientEvaluate(picks, inp).join() !== server.evaluate(picks, inp).join()) bad++;
  }
  check("evaluate agrees client vs server", bad === 0, String(bad));
}

// --- Overdrive meter constant ------------------------------------------------
{
  const carriers = MUTATOR_POOL.filter((m) => (m.overrides.overdriveChargeScale ?? 1) !== 1);
  const max = Math.max(1, ...MUTATOR_POOL.map((m) => m.overrides.overdriveChargeScale ?? 1));
  check("MAX_MUTATOR_OD_CHARGE_SCALE equals the pool's max overdriveChargeScale", server.MAX_MUTATOR_OD_CHARGE_SCALE === max, `${server.MAX_MUTATOR_OD_CHARGE_SCALE} vs ${max}`);
  // Sunday pairs multiply the scale; the constant is only sound while one mutator carries it.
  check("only one mutator carries overdriveChargeScale (a second needs a constant review)", carriers.length === 1, carriers.map((m) => m.name).join());
  const od = registry.flags.overdrive.default.params;
  check("meterFills follows the formula", meterFills(60, 10, od) === Math.ceil(10 * od.chargePerGraze * od.razorGrazeScale * 2 + 60 * od.maxKillChargePerSec) + 1);
}

// --- plausibility --------------------------------------------------------------
{
  const od = registry.flags.overdrive.default.params;
  const run = { timeSurvived: 20 } as { timeSurvived: number; odHot?: number; odFires?: number };
  const ok = checkPlausible({ grazes: 100 }, run, null, od, true);
  check("plausible grazes pass", ok.counters.grazes === 100 && !ok.rejected);
  const bad = checkPlausible({ grazes: 100000 }, run, null, od, true);
  check("implausible grazes are dropped and flagged", bad.counters.grazes === undefined && bad.rejected);
  const hotOff = checkPlausible({ grazes: 10 }, { ...run, odHot: 1 }, null, od, false);
  check("odHot with Overdrive off for the date is rejected", hotOff.counters.odHot === undefined && hotOff.rejected);
  const hotOn = checkPlausible({ grazes: 10 }, { ...run, odHot: 1, odFires: 1 }, null, od, true);
  check("odHot within the meter bound passes", hotOn.counters.odHot === 1 && hotOn.counters.odFires === 1 && !hotOn.rejected);
  const hotMany = checkPlausible({ grazes: 10 }, { ...run, odHot: 9999 }, null, od, true);
  check("odHot above the meter bound is rejected", hotMany.counters.odHot === undefined && hotMany.rejected);
  const noStats = checkPlausible(null, { ...run, odHot: 1 }, null, od, true);
  check("no stats: nothing trusted, nothing rejected", noStats.counters.grazes === undefined && noStats.counters.odHot === undefined && !noStats.rejected);
}

// --- ladder: one constant -------------------------------------------------------
{
  const json = JSON.parse(fs.readFileSync(new URL("../server/orders-catalog.json", import.meta.url), "utf8"));
  check("server LADDER is the shared constant", JSON.stringify(server.LADDER) === JSON.stringify(json.ladder));
  check("ladder thresholds ascend from 0", server.LADDER[0].merit === 0 && server.LADDER.every((l: { merit: number }, i: number, a: Array<{ merit: number }>) => i === 0 || l.merit > a[i - 1].merit));
  check("ladder names are the approved set", server.LADDER.map((l: { name: string }) => l.name).join() === "Ensign,Vanguard,Tribune,Praetor,Legate,Sovereign");
  check("tierForMerit boundaries", [0, 9, 10, 29, 30, 69, 70, 149, 150, 299, 300, 5000].map((m) => server.tierForMerit(m)).join() === "0,0,1,1,2,2,3,3,4,4,5,5");
  check("unlockedTrails grows with tier and starts at hull", server.unlockedTrails(0).join() === "hull" && server.unlockedTrails(5).length === 6);
  check("trail tiers fit the ladder", server.TRAILS.every((t: { tier: number }) => t.tier >= 0 && t.tier < server.LADDER.length));
}

process.exit(failures === 0 ? (console.log("\nALL PASS"), 0) : (console.log(`\n${failures} FAILED`), 1));
