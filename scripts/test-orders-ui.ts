/**
 * Orders UI + Pilot Ladder + trail cosmetics (WS-O2). Pure node test, no DOM.
 * Run: npx tsx scripts/test-orders-ui.ts
 */
import { readFileSync } from "node:fs";
import { ordersPanelModel } from "../src/lobby/ordersPanel";
import { ordersBlockModel } from "../src/resultView";
import {
  LADDER,
  TRAILS,
  ORDERS_UI_COPY,
  ladderChipHtml,
  ladderNameHtml,
  ladderModel,
  insigniaMarkup,
  tierForMerit,
  trailPickerModel,
  unlockedTrails,
} from "../src/ladder";
import { ShipWake, TRAIL_COSMETICS, equippedTrail, trailCosmeticFor } from "../src/cosmetics";
import { pilotDossierModel, type PilotDossierData } from "../src/lobby/pilotView";
import { ordersViewModel, type OrdersView } from "../src/orders";
import * as serverOrders from "../server/orders.mjs";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- a view with the three orders ---
const params = {
  meritEasy: 1,
  meritMedium: 2,
  meritHard: 4,
  pool: Object.fromEntries(
    ["survive-30", "graze-15", "kills-25", "chain-5", "graze-40", "survive-60", "hot-2", "survive-120", "chain-9", "kills-250", "fires-4"].map((id) => [id, { on: true, target: 10 }]),
  ),
} as unknown as Parameters<typeof ordersViewModel>[1];
const DATE = "2026-11-02";
const view = (done: string[] | null): OrdersView => ordersViewModel(DATE, params, true, done);
const ids = view([]).orders.map((o) => o.id);

// --- orders panel ---
check("panel null without a view", ordersPanelModel(null) === null);
check("panel null with no orders", ordersPanelModel({ date: DATE, orders: [], signedOut: false }) === null);
const p0 = ordersPanelModel(view([]))!;
check("panel 0 of 3", p0.rows.length === 3 && p0.progress === "0 OF 3 DONE" && p0.rows.every((r) => !r.done));
check("panel rows are difficulty 1,2,3", p0.rows.map((r) => r.difficulty).join() === "1,2,3");
check("panel merit tags 1/2/4", p0.rows.map((r) => r.merit).join() === "+1 MERIT,+2 MERIT,+4 MERIT");
check("panel footer", p0.footer === "Same orders for every pilot today" && p0.signIn === null);
for (let n = 1; n <= 3; n++) {
  const m = ordersPanelModel(view(ids.slice(0, n)))!;
  check(`panel ${n} of 3 done`, m.progress === `${n} OF 3 DONE` && m.rows.filter((r) => r.done).length === n);
}
const out = ordersPanelModel(view(null))!;
check("signed out: read-only plate", out.progress === null && out.signIn === "Sign in to earn Merit" && out.rows.every((r) => !r.done));
check("signed out ignores done ids", ordersPanelModel({ ...view(ids), signedOut: true })!.rows.every((r) => !r.done));

// --- result block ---
check("result block: nothing without data", ordersBlockModel(null, null, null) === null);
check("result block: no new order, no tier-up", ordersBlockModel(view(ids), [], { tier: 1, tierUp: false }) === null);
check("result block: unknown id ignored", ordersBlockModel(view([]), ["nope"], null) === null);
const rb = ordersBlockModel(view([ids[0]]), [ids[0]], { tier: 1, tierUp: false })!;
check("result block: one completed order", rb.rows.length === 1 && rb.rows[0].label === "ORDER COMPLETE" && rb.rows[0].merit === "+1 MERIT" && rb.tierUp === null);
const rb2 = ordersBlockModel(view(ids), ids, { tier: 2, tierUp: true })!;
check("result block: three orders and tier-up", rb2.rows.length === 3 && rb2.tierUp === "PROMOTED TO TRIBUNE");
check("result block: tier-up alone", ordersBlockModel(null, [], { tier: 1, tierUp: true })?.tierUp === "PROMOTED TO VANGUARD");

// --- ladder ---
check("ladder is the shared constant", JSON.stringify(LADDER) === JSON.stringify(serverOrders.LADDER) && JSON.stringify(TRAILS) === JSON.stringify(serverOrders.TRAILS));
check("ladder names approved", LADDER.map((l) => l.name).join() === "Ensign,Vanguard,Tribune,Praetor,Legate,Sovereign");
let parity = true;
for (const m of [0, 1, 9, 10, 29, 30, 69, 70, 149, 150, 299, 300, 5000]) {
  if (tierForMerit(m) !== serverOrders.tierForMerit(m)) parity = false;
}
for (let t = 0; t < LADDER.length; t++) if (unlockedTrails(t).join() !== serverOrders.unlockedTrails(t).join()) parity = false;
check("tierForMerit and unlockedTrails match the server", parity);
const l0 = ladderModel(0);
check("ladder 0 merit", l0.tier === 0 && l0.name === "Ensign" && l0.next?.name === "Vanguard" && l0.toNext === 10 && l0.progress === 0 && l0.barText === "0 / 10 TO VANGUARD");
const l12 = ladderModel(12);
check("ladder 12 merit", l12.tier === 1 && l12.toNext === 18 && Math.abs(l12.progress - 0.1) < 1e-9 && l12.barText === "12 / 30 TO TRIBUNE");
const lt = ladderModel(300);
check("ladder top", lt.tier === 5 && lt.next === null && lt.progress === 1 && lt.barText === "300 MERIT · TOP OF THE LADDER");
check("ladder tolerates junk", ladderModel(NaN).tier === 0 && ladderModel(-5).merit === 0 && ladderModel(1e9).tier === 5);
check("ladder progress stays 0..1", [0, 5, 10, 11, 29, 30, 99, 299].every((m) => { const p = ladderModel(m).progress; return p >= 0 && p <= 1; }));

// --- trail picker locks ---
const pick0 = trailPickerModel(0, null);
check("tier 0: only Hull Gold open and equipped", pick0.filter((t) => !t.locked).map((t) => t.id).join() === "hull" && pick0[0].equipped);
check("locked trails name the tier that unlocks them", pick0.find((t) => t.id === "comet")!.hint === "Unlocks at Sovereign" && pick0.find((t) => t.id === "flare")!.unlockName === "Vanguard");
const pick2 = trailPickerModel(2, "starlight");
check("tier 2: three open, starlight equipped", pick2.filter((t) => !t.locked).length === 3 && pick2.find((t) => t.id === "starlight")!.equipped && !pick2[0].equipped);
check("a locked equipped id falls back to Hull Gold", trailPickerModel(1, "comet").find((t) => t.equipped)?.id === "hull");
check("top tier opens every trail", trailPickerModel(5, "comet").every((t) => !t.locked) && trailPickerModel(5, "comet").find((t) => t.id === "comet")!.equipped);

// --- cosmetics: what drawTrail draws ---
check("default and unknown ids draw nothing extra", trailCosmeticFor(null) === null && trailCosmeticFor("hull") === null && trailCosmeticFor("zzz") === null);
check("equipped trail needs its tier", equippedTrail("comet", 4) === null && equippedTrail("comet", 5)?.id === "comet" && equippedTrail("flare", 1)?.id === "flare" && equippedTrail("flare", 0) === null);
check("a stale unknown trail never draws", equippedTrail("twin", 4)?.style === "twin" && equippedTrail("nope", 5) === null);
const trailIds = TRAILS.map((t) => t.id).filter((id) => id !== "hull");
check("every catalog trail has a style (and only those)", trailIds.every((id) => TRAIL_COSMETICS[id]) && Object.keys(TRAIL_COSMETICS).length === trailIds.length);
const hexRgb = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
check("no red trail colors (red is the swarm)", Object.values(TRAIL_COSMETICS).every((t) => { const [r, g, b] = hexRgb(t.color); return g >= r * 0.8 && b <= g; }));
check("insignia and chips never use red", Array.from({ length: 6 }, (_, t) => insigniaMarkup(t) + ladderChipHtml(t)).every((m) => !/#(c41e3a|ff4455|7a1020)/i.test(m)));
const wake = new ShipWake();
for (let i = 0; i < 40; i++) wake.push(i * 0.1, 0, 0, i * 0.02);
wake.prune(0.78, 0.3);
check("wake keeps only recent points", wake.count > 0 && Array.from({ length: wake.count }, (_, i) => wake.at(i)).every((p) => 0.78 - p.t <= 0.3));
wake.push(0, 0, 0, 0.0); // clock went backwards (new run)
check("wake restarts when the clock goes backwards", wake.count === 1);
wake.push(50, 50, 0, 0.5); // a long jump (respawn)
check("wake restarts on a teleport", wake.count === 1);
{
  // fixed ring: never grows past MAX, oldest first, slots are reused (no per-push allocation)
  const ring = new ShipWake();
  const first = ring.at(0);
  for (let i = 0; i < ShipWake.MAX * 3; i++) ring.push(i * 0.01, 0, 0, i * 0.02);
  const ts = Array.from({ length: ring.count }, (_, i) => ring.at(i).t);
  check("wake ring is capped at MAX and ordered oldest first", ring.count === ShipWake.MAX && ts.every((t, i) => i === 0 || t > ts[i - 1]));
  check("wake ring reuses its slots", Array.from({ length: ShipWake.MAX }, (_, i) => ring.at(i)).includes(first));
}

// --- board chips ---
check("name+chip cell: chip outside the truncating name span", ladderNameHtml("Zed", 3).startsWith('<span class="lad-row"><span class="lad-nm">Zed</span><i class="lad-chip"'));
check("name cell without a chip is the bare name", ladderNameHtml("Zed", undefined) === "Zed" && ladderNameHtml("Zed", 0) === "Zed");
check("board row without ladder renders as today", ladderChipHtml(undefined) === "" && ladderChipHtml(null) === "" && ladderChipHtml(Number.NaN) === "");
check("Ensign shows no chip", ladderChipHtml(0) === "");
check("chip carries the tier name", ladderChipHtml(3).includes('aria-label="Praetor"') && ladderChipHtml(5).includes("Sovereign"));
check("chip chevron count follows the tier", (ladderChipHtml(4).match(/<path/g) ?? []).length === 4);

// --- dossier ladder slot ---
const base: PilotDossierData = {
  signedIn: true,
  guest: false,
  callsign: "NovaFox",
  country: "CA",
  joinedAt: 1,
  today: "2026-11-02",
  epochDate: "2026-10-01",
  history: [],
  local: [],
  todayBestScore: null,
  profile: null,
  loading: false,
  menuRows: [],
  goldPlate: { show: false, priceLabel: null },
  canFlyArchive: false,
  ladder: null,
};
check("dossier: no ladder section while orders is off", pilotDossierModel(base).ladderSlot === null);
const withLadder = pilotDossierModel({ ...base, ladder: { merit: 12, equippedTrail: "flare" } }).ladderSlot!;
check("dossier: tier, bar, creed and trails", withLadder.name === "VANGUARD" && withLadder.bar.text === "12 / 30 TO TRIBUNE" && withLadder.creed === "EARNED BY FLYING, NOT BUYING" && withLadder.trails.length === 6);
check("dossier: equipped trail marked", withLadder.trails.find((t) => t.id === "flare")!.equipped === true);
check("dossier: guest never sees the ladder", pilotDossierModel({ ...base, guest: true, signedIn: false, ladder: { merit: 12, equippedTrail: null } }).ladderSlot === null);

// --- copy lives in one table, no em dashes, no banned words ---
const allCopy = Object.values(ORDERS_UI_COPY).join(" ");
check("copy has no em or en dashes", !new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`).test(allCopy));
check("copy avoids banned words", !/\barena\b|no gun/i.test(allCopy));

// --- source guards ---
const src = (f: string): string => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const FORBID = /\b(rand|scheduleRand|randRange|scheduleRange)\s*\(/;
for (const f of ["src/ladder.ts", "src/cosmetics.ts", "src/lobby/ordersPanel.ts", "src/resultView.ts", "src/lobby/pilotView.ts"]) {
  check(`${f}: no seeded draws`, !FORBID.test(src(f)));
}
check("render: wake lanes are constants, no per-frame array literals", !/const lanes = trail\.style === "twin" \? \[/.test(src("src/render.ts")));
check("pilot trail picker: no hardcoded hull id, one save at a time", !/"hull"/.test(src("src/lobby/pilotView.ts")) && /saving/.test(src("src/lobby/pilotView.ts")));
check("ladder.ts and cosmetics.ts import no sim state", !/from "\.\/(gameState|world|enemies)"/.test(src("src/ladder.ts") + src("src/cosmetics.ts")));
check("the orders UI never names a field `rank`", !/\brank\s*:/.test(src("src/ladder.ts") + src("src/cosmetics.ts") + src("src/lobby/ordersPanel.ts")));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall orders UI checks passed");
