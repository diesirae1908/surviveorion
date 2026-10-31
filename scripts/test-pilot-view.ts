/**
 * Pilot dossier view model (WS-P). Pure node test, no DOM.
 * Run: npx tsx scripts/test-pilot-view.ts
 */
import type { DailyHistoryEntry, PlayerProfile } from "../src/api";
import { BADGES } from "../src/badges";
import { medalThresholdsForDate } from "../src/medals";
import { pilotDossierModel, type PilotDossierData, type PilotMenuRow } from "../src/lobby/pilotView";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const TODAY = "2026-10-20"; // a Tuesday
const th = (d: string) => medalThresholdsForDate(new Date(`${d}T00:00:00.000Z`));
const entry = (date: string, best: number, rank: number | null = 5): DailyHistoryEntry => ({
  date,
  best,
  bestTime: 90,
  runs: 1,
  rank,
});

const gold = (d: string) => th(d).gold + 1;
const silver = (d: string) => th(d).silver + 1;
const copper = (d: string) => th(d).copper + 1;

// Oct 14..19 flown (6-day streak), Oct 12 flown below copper, Oct 13 missed, Oct 1 gold, Oct 2 silver, Oct 3 copper.
const history: DailyHistoryEntry[] = [
  entry("2026-10-01", gold("2026-10-01"), 3),
  entry("2026-10-02", silver("2026-10-02"), 11),
  entry("2026-10-03", copper("2026-10-03"), 40),
  entry("2026-10-12", 1000, null),
  entry("2026-10-14", silver("2026-10-14")),
  entry("2026-10-15", silver("2026-10-15")),
  entry("2026-10-16", silver("2026-10-16")),
  entry("2026-10-17", copper("2026-10-17")),
  entry("2026-10-18", copper("2026-10-18")),
  entry("2026-10-19", copper("2026-10-19")),
];

const rows: PilotMenuRow[] = [
  { id: "training", label: "Training Ground", run: () => {}, visible: true },
  { id: "calendar", label: "Patrol Calendar", run: () => {}, visible: true },
  { id: "wingmates", label: "Wingmates", run: () => {}, notif: true, visible: true },
  { id: "iphone", label: "Get on iPhone", run: () => {}, visible: false },
  { id: "privacy", label: "Privacy", run: () => {}, visible: true },
];

const profile = {
  callsign: "NovaFox",
  country: "CA",
  joinedAt: 0,
  runs: 12,
  totalKills: 300,
  totalTime: 900,
  bestTime: 130,
  bestKills: 60,
  bestScore: 400000,
  bestMultiplier: 5,
  badges: [{ id: BADGES[0].id, earnedAt: 1 }, { id: BADGES[2].id, earnedAt: 2 }],
} as unknown as PlayerProfile;

const base: PilotDossierData = {
  signedIn: true,
  guest: false,
  callsign: "NovaFox",
  country: "CA",
  joinedAt: Date.parse("2026-09-01T00:00:00Z"),
  today: TODAY,
  epochDate: "2026-09-01",
  history,
  local: [],
  todayBestScore: null,
  profile,
  loading: false,
  menuRows: rows,
  goldPlate: { show: false, priceLabel: null },
  canFlyArchive: true,
  ladder: null,
};

// --- filled dossier ---
const m = pilotDossierModel(base);
check("filled mode", m.mode === "filled");
check("callsign + flag", m.callsign === "NovaFox" && m.flag.length > 0);
const stat = (id: string) => m.stats.find((s) => s.id === id)?.value;
check("patrols flown = history rows", stat("patrols") === String(history.length), String(stat("patrols")));
check("best rank = lowest non-null", stat("bestRank") === "#3", String(stat("bestRank")));
check("streak counts back from yesterday (Oct 14..19)", stat("streak") === "6", String(stat("streak")));

const cell = (date: string) => m.flightLog.cells.find((c) => c.date === date)!;
check("medal dots: gold/silver/copper", cell("2026-10-01").medal === "gold" && cell("2026-10-02").medal === "silver" && cell("2026-10-03").medal === "copper");
check("flown below copper is a plain dot", cell("2026-10-12").kind === "flown" && cell("2026-10-12").medal === null);
check("missed past day (can fly archive)", cell("2026-10-13").kind === "missed");
check("today is ringed, only today", cell(TODAY).today && m.flightLog.cells.filter((c) => c.today).length === 1);
check("today with no run is empty", cell(TODAY).kind === "empty");
check("future days are future", cell("2026-10-25").kind === "future");
check("month title", m.flightLog.title === "FLIGHT LOG · OCTOBER", m.flightLog.title);
const days = m.flightLog.cells.filter((c) => c.day !== null);
check("31 day cells", days.length === 31);
check("Oct 1 2026 is a Thursday (4 pad cells, Sunday start)", m.flightLog.cells.filter((c) => c.kind === "pad").length === 4);
check("insignia metal = best medal this month", m.insignia.metal === "gold" && m.insignia.caption.includes("GOLD"), m.insignia.caption);
check("ladder slot stays null (WS-O2)", m.ladderSlot === null);

// today's best colors today's cell and extends the streak
const mt = pilotDossierModel({ ...base, todayBestScore: gold(TODAY) });
check("today flown: medal on the ringed cell", mt.flightLog.cells.find((c) => c.date === TODAY)!.medal === "gold");
check("today flown extends streak to 7", mt.stats[0].value === "7", mt.stats[0].value);

// streak breaks on a gap
const gap = pilotDossierModel({ ...base, history: history.filter((e) => e.date !== "2026-10-17") });
check("streak breaks at a missed day", gap.stats[0].value === "2", gap.stats[0].value);

// Gold-locked past days (free pilot): dimmed, medals still shown
const free = pilotDossierModel({ ...base, canFlyArchive: false });
const fc = (d: string) => free.flightLog.cells.find((c) => c.date === d)!;
check("free: past day with no result is locked", fc("2026-10-13").kind === "locked");
check("free: past day with a medal keeps its medal", fc("2026-10-01").kind === "medal");

// --- badges ---
check("badges: earned count in title", m.badges.title === `BADGES · 2 OF ${BADGES.length}`, m.badges.title);
check("badges: earned first", !m.badges.items[0].locked && !m.badges.items[1].locked && m.badges.items[2].locked);
check("badges: all present once", m.badges.items.length === BADGES.length && new Set(m.badges.items.map((b) => b.id)).size === BADGES.length);
const lockedWithProgress = m.badges.items.find((b) => b.locked && b.detail.includes("/"));
check("badges: locked detail carries a hint (and progress when countable)", m.badges.items.filter((b) => b.locked).every((b) => b.detail.startsWith("Locked: ")) && !!lockedWithProgress);
const noProfile = pilotDossierModel({ ...base, profile: null });
check("badges: unavailable without a profile", noProfile.badges.state === "unavailable" && noProfile.badges.items.length === 0);

// --- Gold plate exactly once, only when the rule says so ---
check("gold plate absent when rule is off", m.goldPlate === null);
const gp = pilotDossierModel({ ...base, goldPlate: { show: true, priceLabel: "$1.99" } });
check("gold plate present once with today's copy", !!gp.goldPlate && gp.goldPlate.title === "GOLD PATROL" && gp.goldPlate.sub === "Keep flying today. Unlimited runs." && gp.goldPlate.go === "$1.99");

// --- menu rows: every visible hamburger row, nothing else dropped ---
check("menu rows: all visible rows present in order", m.rows.map((r) => r.id).join(",") === "training,calendar,wingmates,privacy", m.rows.map((r) => r.id).join(","));
check("menu rows: hidden row stays hidden", !m.rows.some((r) => r.id === "iphone"));
check("menu rows: notif dot carried", m.rows.find((r) => r.id === "wingmates")?.notif === true);
check("account row for a signed-in pilot", m.accountRow === true);

// --- guest ghost ---
const g = pilotDossierModel({ ...base, signedIn: false, guest: true, callsign: null, country: "", history: [], profile: null });
check("guest: ghost mode", g.mode === "ghost");
check("guest: sign-in prompt with the copy-batch line", g.signIn?.text === "Sign in to keep your rank");
check("guest: ghost stats", g.stats.every((s) => s.value === "--"));
check("guest: no medal metal, no account row", g.insignia.metal === "none" && g.accountRow === false);
check("guest: badges as silhouettes", g.badges.state === "ghost" && g.badges.items.every((b) => b.locked) && g.badges.title === `BADGES · 0 OF ${BADGES.length}`);
check("guest: menu rows still all reachable", g.rows.length === 4);
check("signed-in has no sign-in prompt", m.signIn === null);

// --- old-state parity: a row with only today's local best draws a guest log from this device ---
const local = pilotDossierModel({
  ...base,
  signedIn: false,
  guest: true,
  history: [],
  local: [{ date: "2026-10-18", attemptsUsed: 1, best: { score: silver("2026-10-18"), time: 80, rank: null } }],
});
check("guest: this device's local log still paints", local.flightLog.cells.find((c) => c.date === "2026-10-18")!.medal === "silver");

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll pilot view checks passed.");
