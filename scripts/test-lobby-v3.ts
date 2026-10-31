/**
 * Lobby v3 + tab bar, model level (no DOM). Real DOM checks are QA Playwright's job.
 * Run: npx tsx scripts/test-lobby-v3.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LobbyParams } from "../src/flags";
import { tierName } from "../src/ladder";
import { LOBBY_FILL_TARGETS } from "../src/lobby/fillTargets";
import {
  CHIP_MAX,
  aheadLabel,
  boardV3Model,
  chipsFor,
  closesInLabel,
  isDesktop,
  kickerDate,
  lobbyV3Model,
  metalWordFor,
  nameSizePx,
  type BoardRowLite,
  type LobbyV3Env,
  type LobbyV3Info,
} from "../src/lobby/lobbyV3";
import { menuRowSpecs } from "../src/lobby/menuRows";
import { TAB_ORDER, pilotTarget, tabBarModel } from "../src/lobby/tabBar";
import { MUTATOR_POOL, getMutatorsForDateStr } from "../src/mutators";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const uiSource = fs.readFileSync(path.join(srcDir, "ui.ts"), "utf8");
const cssSource = fs.readFileSync(path.join(srcDir, "styles", "lobby.css"), "utf8");

const ON: LobbyParams = { tabBar: true, briefing: true, pilotTab: true };
const NO_BAR: LobbyParams = { tabBar: false, briefing: true, pilotTab: false };
const THRESH = { copper: 60_000, silver: 130_000, gold: 300_000 };
const ENV: LobbyV3Env = { width: 390, streak: 7, phase: "pre", patrolDate: "2026-10-29" };
const one = MUTATOR_POOL.find((m) => m.name === "OVERCHARGE")!;
const info = (over: Partial<LobbyV3Info> = {}): LobbyV3Info => ({
  dayNumber: 108,
  callsign: "NovaFox",
  online: true,
  mutators: [one],
  best: { score: 150_000 },
  medalThresholds: THRESH,
  ...over,
});

// ---- model ----
check("no params: no model (today's lobby)", lobbyV3Model(info(), null, ENV) === null);
const m = lobbyV3Model(info(), ON, ENV)!;
check("sections in order, board when online", m.sections.join(",") === "header,hero,launch,board,flightLog,orders");
check("offline: no board section", !lobbyV3Model(info({ online: false }), ON, ENV)!.sections.includes("board"));
check("fillTargets contains every LOBBY_FILL_TARGETS selector", LOBBY_FILL_TARGETS.every((t) => m.fillTargets.includes(t)));
check("header: callsign, metal word from today's best, streak", m.header.callsign === "NovaFox" && m.header.metalWord === "SILVER" && m.header.streakLabel === "7 DAY STREAK");
check("header: guest has no callsign, no medal says PILOT", (() => {
  const g = lobbyV3Model(info({ callsign: undefined, best: null }), ON, ENV)!;
  return g.header.callsign === null && g.header.metalWord === "PILOT";
})());
check("header word: no medal shows the ladder tier name, a medal still wins", metalWordFor(null, THRESH, 0) === "ENSIGN" && metalWordFor({ score: 10 }, THRESH, 2) === tierName(2).toUpperCase() && metalWordFor({ score: 300_000 }, THRESH, 2) === "GOLD" && metalWordFor(null, THRESH) === "PILOT" && metalWordFor(null, THRESH, null) === "PILOT");
check("metal word: gold, copper, below copper", metalWordFor({ score: 300_000 }, THRESH) === "GOLD" && metalWordFor({ score: 60_000 }, THRESH) === "COPPER" && metalWordFor({ score: 10 }, THRESH) === "PILOT");
check("kicker: patrol number and PT date", m.hero.kicker === "PATROL #108 · THU OCT 29", m.hero.kicker);
check("hero: single mutator has a briefing line, 2 chips, 160 px emblem", m.hero.line === one.briefing && m.hero.chips.length === 2 && m.hero.emblemPx === 160 && !m.hero.double);
check("hero: classic patrol has no mutators and no chips", (() => {
  const c = lobbyV3Model(info({ mutators: [] }), ON, ENV)!;
  return c.hero.classic && c.hero.chips.length === 0 && c.hero.line === null;
})());
check("hero: Sunday double = one chip each, smaller emblems, no single line", (() => {
  const d = lobbyV3Model(info({ mutators: [MUTATOR_POOL[0], MUTATOR_POOL[2]] }), ON, ENV)!;
  return d.hero.double && d.hero.chips.length === 2 && d.hero.emblemPx < 160 && d.hero.line === null && d.hero.mutators.every((x) => x.nameSizePx <= 28);
})());
check("desktop flag at 900 px", !isDesktop(899) && isDesktop(900) && lobbyV3Model(info(), ON, { ...ENV, width: 1440 })!.desktop);
check("hamburger is hidden only when tabBar AND pilotTab (all 4 combos)", [[true, true, false], [true, false, true], [false, true, true], [false, false, true]].every(([tb, pt, ham]) => {
  const mm = lobbyV3Model(info(), { tabBar: tb, briefing: true, pilotTab: pt }, ENV)!;
  return mm.tabBar === tb && mm.hamburger === ham;
}));
check("name size: short 46, mid 40, long 32 (2-line safe)", nameSizePx("OVERCHARGE", false) === 46 && nameSizePx("GRAZE PROTOCOL", false) === 40 && nameSizePx("YEAR OF THE SERPENT", false) === 32);

// ---- chips over every mutator ----
const badChips: string[] = [];
for (const mu of MUTATOR_POOL) {
  const chips = chipsFor(mu);
  if (chips.length < 1 || chips.length > 2) badChips.push(`${mu.name}: ${chips.length} chips`);
  for (const c of chips) {
    if (c.length === 0 || c.length > CHIP_MAX) badChips.push(`${mu.name}: "${c}" (${c.length})`);
    if (c !== c.toUpperCase()) badChips.push(`${mu.name}: not uppercase`);
  }
  if (new Set(chips).size !== chips.length) badChips.push(`${mu.name}: duplicate chips`);
}
check(`chips: every one of ${MUTATOR_POOL.length} mutators gives 1-2 non-empty chips of <= ${CHIP_MAX} chars`, badChips.length === 0, badChips.join("; "));
check("chips: blank source falls back to the name", chipsFor({ id: "x", name: "Test Day", briefing: "", subline: "", hudRule: "" })[0] === "TEST DAY");
check("chips: never an ellipsis, never a trailing period", MUTATOR_POOL.flatMap((mu) => chipsFor(mu)).every((c) => !c.includes("…") && !c.includes("...") && !c.endsWith(".")));
check("chips: never end on a dangling word", MUTATOR_POOL.flatMap((mu) => chipsFor(mu)).every((c) => !/ (A|AN|THE|IS|OF|TO|AFTER|AND|OR|AT|IN|ON)$/.test(c)));
check("chips: every chip is a whole phrase taken from the rule line", MUTATOR_POOL.every((mu) => chipsFor(mu).every((c) => mu.hudRule.toUpperCase().includes(c) || c === mu.name.toUpperCase())));
// every date over two years: single and Sunday pair chips fit and are never cut
const dateChipBad: string[] = [];
for (let d = 0; d < 730; d++) {
  const dt = new Date(Date.UTC(2026, 0, 1 + d, 12));
  const ds = dt.toISOString().slice(0, 10);
  const ms = getMutatorsForDateStr(ds);
  const chips = ms.length > 1 ? ms.map((x) => chipsFor(x)[0]) : ms[0] ? chipsFor(ms[0]) : [];
  for (const c of chips) if (!c || c.length > CHIP_MAX || c.includes("…")) dateChipBad.push(`${ds}: "${c}"`);
}
check("chips: 730 days incl. Sunday pairs all fit 22 chars with no ellipsis", dateChipBad.length === 0, dateChipBad.slice(0, 3).join("; "));

// ---- closes label, ahead label ----
check("closes label H:MM:SS", closesInLabel(11 * 3600_000 + 42 * 60_000 + 10_000) === "11:42:10" && closesInLabel(-5) === "0:00:00" && closesInLabel(59_999) === "0:00:59");
check("ahead label: k for thousands, never 0", aheadLabel(68_644) === "69k" && aheadLabel(640) === "640" && aheadLabel(0) === "1");
check("kicker date from a PT date", kickerDate("2026-11-01") === "SUN NOV 1" && kickerDate("nope") === "");

// ---- board model ----
const row = (rank: number, callsign: string, score: number, isMe = false): BoardRowLite => ({ rank, callsign, country: "CA", score, isMe });
const board = [row(1, "Nova Drift", 155_717), row(2, "Tatezu", 134_375), row(3, "Glint", 129_848), row(4, "Kes", 110_000), row(5, "Orb", 98_000), row(9, "NovaFox", 61_204, true), row(8, "Rho", 70_000)];
const bm = boardV3Model(board, 9, 61_204, false);
check("board: podium left=2, leader=1, right=3", bm.podium.map((p) => `${p.slot}:${p.row.rank}`).join(",") === "left:2,leader:1,right:3");
check("board: you row outside the podium, tag, best", bm.you?.rank === 9 && bm.youTag === "YOU #9" && bm.yourBest === 61_204);
check("board: next wingmate above and the gap", bm.ahead?.callsign === "Rho" && bm.ahead.points === 70_000 - 61_204);
check("board: gap is omitted when the rank above is not on the board", boardV3Model(board.filter((r) => r.rank !== 8), 9, 61_204, false).ahead === null);
check("board: top 3 pilot has no extra row and no gap above rank 1", (() => {
  const t = boardV3Model([row(1, "NovaFox", 155_717, true), row(2, "Tatezu", 134_375)], 1, 155_717, false);
  return t.you === null && t.ahead === null && t.podium.length === 2;
})());
check("board: unranked pilot gets no tag and no you row", (() => {
  const u = boardV3Model(board.filter((r) => !r.isMe), null, null, false);
  return u.youTag === null && u.you === null && u.yourBest === null;
})());
check("board: guest tag says WOULD BE", boardV3Model(board, 9, 61_204, true).youTag === "WOULD BE #9");
check("board: empty board gives an empty podium", boardV3Model([], null, null, true).podium.length === 0);

// ---- tab bar ----
check("tab model: lobby flag absent or tabBar off = no tabs", tabBarModel("patrol", null).length === 0 && tabBarModel("patrol", NO_BAR).length === 0);
check("tab model: PATROL, BOARD, WINGMATES, PILOT in order", tabBarModel("patrol", ON).map((t) => t.label).join(",") === "PATROL,BOARD,WINGMATES,PILOT" && TAB_ORDER.length === 4);
check("tab model: exactly the active tab is flagged", tabBarModel("board", ON).filter((t) => t.active).map((t) => t.id).join() === "board");
check("tab model: pilotTab picks the dossier, off picks today's profile", pilotTarget(ON) === "dossier" && pilotTarget(NO_BAR) === "profile" && pilotTarget(null) === "profile");

// ---- reachability with the tab bar on ----
const rows = menuRowSpecs({ pendingFriends: 0 }, { unreadUpdate: false, appStoreLive: true });
const launchSlab = new Set(["training"]);
const tabIds = new Set(["wingmates"]);
const pilotRows = new Set(rows.filter((r) => r.visible).map((r) => r.id));
check("every lobbyMenuRows id is reachable with the tab bar on (Pilot rows, launch slab or a tab)", rows.every((r) => pilotRows.has(r.id) || launchSlab.has(r.id) || tabIds.has(r.id)));
check("launch slab carries a Training Ground link wired to onTraining", /v3-train[\s\S]{0,200}onTraining/.test(uiSource));

// ---- gates in source ----
check("showDailyLobby gates v3 on params AND lobbyAllowed()", /showDailyLobby\(info: DailyLobbyInfo\): void \{\s*if \(this\.lobbyParams && this\.lobbyAllowed\(\)\) return this\.showDailyLobbyV3\(info\);/.test(uiSource));
check("ui.ts uses model.hamburger for the hamburger", /if \(model\.hamburger\) \{\s*const lobbyTier/.test(uiSource));
check("v3 falls back to today's lobby when the model is null", /if \(!model \|\| !params\) return this\.showDailyLobbyCurrent\(info\);/.test(uiSource));
check("v3 root is div.screen.menu.daily-lobby.lobby-v3", /screen menu daily-lobby lobby-v3/.test(uiSource));
check("every fill target still emitted by ui.ts (ids and classes)", LOBBY_FILL_TARGETS.filter((t) => t !== "#daily-hint" && t !== "#daily-board-search" && t !== "#daily-lobby-board").every((t) => uiSource.includes(t.slice(1))));
check("paintUpdatePill prefers the PILOT tab dot", uiSource.includes(`".tab-pilot .update-pill"`));
check("lobby.css scopes layout under .lobby-v3 and never styles .lobby-v2", !cssSource.includes("lobby-v2") && /\.lobby-v3/.test(cssSource));
check("tab bar is 56 px with 44 px targets", /height: 56px/.test(cssSource) && /min-height: 44px/.test(cssSource));
check("no em dash in the new files", !fs.readFileSync(path.join(srcDir, "lobby", "lobbyV3.ts"), "utf8").includes("—") && !cssSource.includes("—"));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll lobby v3 checks passed");
