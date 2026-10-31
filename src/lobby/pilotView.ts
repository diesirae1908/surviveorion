// Pilot dossier (lobby v3 PILOT tab, owner: WS-P).
//
// `pilotDossierModel` is pure (no DOM, no network, no clock): everything the
// screen shows is derived from `PilotDossierData`, so it is tested in node
// (scripts/test-pilot-view.ts). `buildPilotDossier` only maps a model to
// elements. Styles: src/styles/pilot.css (imported by main.ts).
//
// The ladder (rank, Merit bar, trail picker) is WS-O2's: `ladder` is null here
// and the model leaves a `ladderSlot` the O2 branch fills.

import type { DailyHistoryEntry, PlayerProfile } from "../api";
import { BADGES, TIER_LABEL, type BadgeProgressStats } from "../badges";
import { countryFlag } from "../countries";
import { dayInfoFor, daysInMonth, leadingPadding, utcDateStr } from "../dailyHistory";
import { medalForScore, medalThresholdsForDate, MEDAL_LABEL, type MedalTier } from "../medals";
import type { DailyDayLog } from "../save";

/** Weeks start on Sunday here, same as the Patrol Calendar grid (leadingPadding). */
const DOW_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;
/** Streak lookback cap (days). The history fetch covers at most this window. */
export const STREAK_LOOKBACK_DAYS = 400;

export interface PilotMenuRow {
  id: string;
  label: string;
  run: () => void;
  notif?: boolean;
  visible: boolean;
}

export interface PilotDossierData {
  /** A session with a callsign (guest accounts included). */
  signedIn: boolean;
  /** No account at all: the ghost dossier. */
  guest: boolean;
  callsign: string | null;
  country: string;
  joinedAt: number | null;
  /** Patrol date today, PT, 'YYYY-MM-DD'. */
  today: string;
  /** Earliest real patrol date for this pilot (dayInfoFor `epochDate`). */
  epochDate: string;
  /** Server history for this pilot (signed in). Covers the current month and the streak window. */
  history: DailyHistoryEntry[];
  /** This device's local patrol log. */
  local: DailyDayLog[];
  /** Today's best score on this device, if a run finished today. */
  todayBestScore: number | null;
  /** Pilot profile (badges + career bests). Null while loading, offline, or for a guest. */
  profile: PlayerProfile | null;
  /** The server fetches are still in flight. */
  loading: boolean;
  /** Hamburger destinations (ui.lobbyMenuRows). */
  menuRows: PilotMenuRow[];
  /** Today's Gold Patrol upsell rule, resolved by the caller. */
  goldPlate: { show: boolean; priceLabel: string | null };
  /** Gold Patrol / admin: past days can be flown. Free: past days with no result read as locked. */
  canFlyArchive: boolean;
  /** WS-O2 fills this (tier, Merit, trails). Null until then. */
  ladder: null;
}

export type PilotMetal = MedalTier | "none";

export type PilotCellKind = "pad" | "medal" | "flown" | "attempted" | "missed" | "locked" | "future" | "empty";

export interface PilotCell {
  date: string | null;
  day: number | null;
  kind: PilotCellKind;
  medal: MedalTier | null;
  /** Ringed. */
  today: boolean;
  label: string;
}

export interface PilotBadgeItem {
  id: string;
  name: string;
  icon: string;
  locked: boolean;
  /** Tap detail: description (earned) or "how to get it" plus progress (locked). */
  detail: string;
}

export interface PilotDossierModel {
  mode: "ghost" | "filled";
  loading: boolean;
  callsign: string;
  flag: string;
  insignia: { metal: PilotMetal; caption: string };
  stats: Array<{ id: "streak" | "patrols" | "bestRank"; value: string; label: string }>;
  /** Reserved for WS-O2 (tier name, Merit bar, trail picker). Always null in WS-P. */
  ladderSlot: null;
  flightLog: { title: string; dow: readonly string[]; cells: PilotCell[]; monthKey: string };
  goldPlate: { title: string; sub: string; go: string } | null;
  /** Ghost only: the sign-in call to action. */
  signIn: { text: string; button: string } | null;
  badges: {
    state: "ready" | "ghost" | "unavailable";
    title: string;
    items: PilotBadgeItem[];
    hint: string;
  };
  rows: PilotMenuRow[];
  /** Signed in: an "Account and callsign" row (callsign, country, password, sign out, delete). */
  accountRow: boolean;
}

export interface PilotDossierCallbacks {
  /** Tap a day in the flight log: open the Patrol Calendar on that day. */
  onPatrolCalendar: (date: string) => void;
  onGoldPlate: () => void;
  onSignIn: () => void;
  onAccount: () => void;
}

const MEDAL_RANK: Record<MedalTier, number> = { gold: 3, silver: 2, copper: 1 };

function monthName(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1))
    .toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })
    .toUpperCase();
}

function dayLabel(date: string, what: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const m = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${m} ${d.getUTCDate()}, ${what}, open calendar`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Per-date resolver shared by the grid and the streak. */
function dayResolver(data: PilotDossierData): (date: string) => ReturnType<typeof dayInfoFor> {
  const server = new Map(data.history.map((e) => [e.date, e]));
  const local = new Map(data.local.map((d) => [d.date, d]));
  return (date) =>
    dayInfoFor(date, {
      today: data.today,
      epochDate: data.epochDate,
      signedIn: data.signedIn,
      local: local.get(date) ?? null,
      server: server.get(date) ?? null,
    });
}

function isFlown(status: string): boolean {
  return status === "completed" || status === "completed-local-only";
}

/** Consecutive flown patrol days ending yesterday, plus today when today is flown. */
function streakDays(data: PilotDossierData): { n: number; capped: boolean } {
  const resolve = dayResolver(data);
  let n = data.todayBestScore != null ? 1 : 0;
  let capped = false;
  for (let i = 1; i <= STREAK_LOOKBACK_DAYS; i++) {
    const date = addDays(data.today, -i);
    if (date < data.epochDate) break;
    if (!isFlown(resolve(date).status)) break;
    n += 1;
    if (i === STREAK_LOOKBACK_DAYS) capped = true;
  }
  return { n, capped };
}

function flightLog(data: PilotDossierData): PilotDossierModel["flightLog"] {
  const [y, m] = data.today.split("-").map(Number);
  const year = y;
  const month = m - 1;
  const resolve = dayResolver(data);
  const cells: PilotCell[] = [];
  for (let i = 0; i < leadingPadding(year, month); i++) {
    cells.push({ date: null, day: null, kind: "pad", medal: null, today: false, label: "" });
  }
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const date = utcDateStr(year, month, d);
    const info = resolve(date);
    const isToday = date === data.today;
    let kind: PilotCellKind;
    let medal: MedalTier | null = null;
    let what = "no run";
    if (isToday) {
      if (data.todayBestScore != null) {
        medal = medalForScore(data.todayBestScore, medalThresholdsForDate(new Date(`${date}T00:00:00.000Z`)));
        kind = medal ? "medal" : "flown";
        what = medal ? `${MEDAL_LABEL[medal]} medal` : "flown";
      } else {
        kind = "empty";
        what = "today";
      }
    } else if (info.status === "future") {
      kind = "future";
      what = "upcoming";
    } else if (isFlown(info.status)) {
      medal = info.medal ?? null;
      kind = medal ? "medal" : "flown";
      what = medal ? `${MEDAL_LABEL[medal]} medal` : "flown";
    } else if (info.status === "before-launch") {
      kind = "empty";
    } else if (!data.canFlyArchive) {
      // a past day with no result that this pilot cannot fly: dimmed emblem, never an upsell each
      kind = "locked";
      what = "locked, Gold Patrol";
    } else if (info.status === "attempted") {
      kind = "attempted";
      what = "attempted";
    } else if (info.status === "missed") {
      kind = "missed";
      what = "missed";
    } else {
      kind = "empty";
    }
    cells.push({ date, day: d, kind, medal, today: isToday, label: dayLabel(date, what) });
  }
  return {
    title: `FLIGHT LOG · ${monthName(year, month)}`,
    dow: DOW_LETTERS,
    cells,
    monthKey: `${year}-${String(m).padStart(2, "0")}`,
  };
}

function bestMedalOf(cells: PilotCell[]): MedalTier | null {
  let best: MedalTier | null = null;
  for (const c of cells) {
    if (c.medal && (!best || MEDAL_RANK[c.medal] > MEDAL_RANK[best])) best = c.medal;
  }
  return best;
}

function badgeStats(p: PlayerProfile): BadgeProgressStats {
  return {
    runs: p.runs,
    totalKills: p.totalKills,
    totalTime: p.totalTime,
    bestTime: p.bestTime,
    bestKills: p.bestKills,
    bestScore: p.bestScore,
    bestMultiplier: p.bestMultiplier,
  };
}

function badgesModel(data: PilotDossierData, ghost: boolean): PilotDossierModel["badges"] {
  const total = BADGES.length;
  if (!ghost && !data.profile) {
    return {
      state: "unavailable",
      title: "BADGES",
      items: [],
      hint: data.loading ? "Loading badges." : "Badges load when patrol command is reachable.",
    };
  }
  const earned = new Set((data.profile?.badges ?? []).map((b) => b.id));
  const stats = data.profile ? badgeStats(data.profile) : null;
  const items: PilotBadgeItem[] = BADGES.map((b) => {
    const has = earned.has(b.id);
    const progress = !has && stats && b.progress ? b.progress(stats) : null;
    return {
      id: b.id,
      name: b.name,
      icon: b.icon,
      locked: !has,
      detail: has
        ? `${b.name}: ${b.desc} (${TIER_LABEL[b.tier]})`
        : `Locked: ${b.desc}${progress ? ` (${progress.label})` : ""}`,
    };
  });
  // earned first, display order kept inside each group
  items.sort((a, b) => Number(a.locked) - Number(b.locked));
  const n = items.filter((i) => !i.locked).length;
  return { state: ghost ? "ghost" : "ready", title: `BADGES · ${n} OF ${total}`, items, hint: "Tap a badge for details." };
}

/** Pure view model for the dossier. Always returns a model (the old stub returned null). */
export function pilotDossierModel(data: PilotDossierData): PilotDossierModel {
  const ghost = data.guest || !data.signedIn;
  const log = flightLog(data);
  const metal: PilotMetal = ghost ? "none" : (bestMedalOf(log.cells) ?? "none");
  const month = monthName(Number(data.today.slice(0, 4)), Number(data.today.slice(5, 7)) - 1);
  const caption = ghost
    ? "SIGN IN TO KEEP YOUR RANK"
    : metal === "none"
      ? `NO MEDAL YET · ${month}`
      : `${MEDAL_LABEL[metal].toUpperCase()} MEDAL · ${month}`;

  let stats: PilotDossierModel["stats"];
  if (ghost) {
    stats = [
      { id: "streak", value: "--", label: "DAY STREAK" },
      { id: "patrols", value: "--", label: "PATROLS" },
      { id: "bestRank", value: "--", label: "BEST RANK" },
    ];
  } else {
    const streak = streakDays(data);
    const ranks = data.history.map((e) => e.rank).filter((r): r is number => typeof r === "number" && r > 0);
    stats = [
      { id: "streak", value: `${streak.n}${streak.capped ? "+" : ""}`, label: "DAY STREAK" },
      { id: "patrols", value: String(data.history.length), label: "PATROLS" },
      { id: "bestRank", value: ranks.length ? `#${Math.min(...ranks)}` : "--", label: "BEST RANK" },
    ];
  }

  return {
    mode: ghost ? "ghost" : "filled",
    loading: data.loading,
    callsign: ghost ? "GUEST PILOT" : (data.callsign ?? "PILOT"),
    flag: !ghost && data.country ? countryFlag(data.country) : "",
    insignia: { metal, caption },
    stats,
    ladderSlot: null,
    flightLog: log,
    goldPlate: data.goldPlate.show
      ? { title: "GOLD PATROL", sub: "Keep flying today. Unlimited runs.", go: data.goldPlate.priceLabel ?? "" }
      : null,
    signIn: ghost ? { text: "Sign in to keep your rank", button: "SIGN IN" } : null,
    badges: badgesModel(data, ghost),
    rows: data.menuRows.filter((r) => r.visible),
    accountRow: !ghost,
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Hex shield with chevrons; the metal comes from CSS (`data-metal`). */
function insigniaSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "-50 -56 100 112");
  svg.setAttribute("class", "pd-insignia-svg");
  svg.setAttribute("aria-hidden", "true");
  const hex = document.createElementNS(SVG_NS, "path");
  hex.setAttribute("d", "M0,-52 L45,-26 L45,26 L0,52 L-45,26 L-45,-26 Z");
  hex.setAttribute("class", "pd-hex");
  const gem = document.createElementNS(SVG_NS, "path");
  gem.setAttribute("d", "M0,-30 L22,0 L0,30 L-22,0 Z");
  gem.setAttribute("class", "pd-gem");
  const chevron = document.createElementNS(SVG_NS, "path");
  chevron.setAttribute("d", "M-22,34 L0,44 L22,34");
  chevron.setAttribute("class", "pd-chevron");
  svg.append(hex, gem, chevron);
  return svg;
}

function badgeHex(item: PilotBadgeItem, detail: HTMLElement): HTMLElement {
  const b = el("button", `pd-badge${item.locked ? " locked" : ""}`);
  b.type = "button";
  const hex = el("span", "pd-badge-hex", item.locked ? "?" : item.icon);
  b.append(hex, el("span", "pd-badge-name", item.name));
  b.addEventListener("click", () => {
    detail.textContent = item.detail;
  });
  return b;
}

/** Map a model to elements. Appended inside the tab screen (showCustomScreen). */
export function buildPilotDossier(model: PilotDossierModel | null, cb: PilotDossierCallbacks): HTMLElement {
  const root = el("div", "pd");
  if (!model) return root;
  root.dataset.mode = model.mode;
  if (model.loading) root.classList.add("loading");

  root.append(el("div", "pd-kicker", "PILOT DOSSIER"));

  const ins = el("div", "pd-insignia");
  ins.dataset.metal = model.insignia.metal;
  ins.append(insigniaSvg());
  root.append(ins);

  const name = el("div", "pd-name");
  name.append(el("span", "pd-callsign", model.callsign));
  if (model.flag) name.append(el("span", "pd-flag", model.flag));
  root.append(name);
  root.append(el("div", "pd-caption", model.insignia.caption));

  const stats = el("div", "pd-stats");
  for (const s of model.stats) {
    const cell = el("div", "pd-stat chamfer");
    cell.append(el("div", "pd-stat-v", s.value), el("div", "pd-stat-l", s.label));
    stats.append(cell);
  }
  root.append(stats);

  if (model.signIn) {
    const btn = el("button", "pd-signin chamfer", model.signIn.button);
    btn.type = "button";
    btn.setAttribute("aria-label", model.signIn.text);
    btn.addEventListener("click", () => cb.onSignIn());
    root.append(el("div", "pd-signin-text", model.signIn.text), btn);
  }

  // WS-O2 mounts the ladder section here (insignia tier, Merit bar, trail picker).
  const ladder = el("div", "pd-ladder-slot");
  ladder.id = "pd-ladder-slot";
  root.append(ladder);

  const log = el("div", "pd-log chamfer");
  log.append(el("div", "pd-log-title", model.flightLog.title));
  const grid = el("div", "pd-grid");
  for (const d of model.flightLog.dow) grid.append(el("span", "pd-dow", d));
  for (const c of model.flightLog.cells) {
    if (c.kind === "pad" || !c.date) {
      grid.append(el("span", "pd-cell pad"));
      continue;
    }
    const date = c.date;
    const cell = el("button", `pd-cell ${c.kind}${c.medal ? ` ${c.medal}` : ""}${c.today ? " today" : ""}`);
    cell.type = "button";
    cell.setAttribute("aria-label", c.label);
    cell.addEventListener("click", () => cb.onPatrolCalendar(date));
    grid.append(cell);
  }
  log.append(grid);
  root.append(log);

  if (model.goldPlate) {
    const plate = el("button", "lobby-upsell chamfer pd-gold");
    plate.type = "button";
    const t = el("span", "t");
    const b = el("b", "", model.goldPlate.title);
    t.append(b, document.createElement("br"), document.createTextNode(model.goldPlate.sub));
    const go = el("span", "go", model.goldPlate.go ? `${model.goldPlate.go} ›` : "›");
    plate.append(t, go);
    plate.addEventListener("click", () => cb.onGoldPlate());
    root.append(plate);
  }

  const badges = el("div", "pd-badges");
  badges.append(el("div", "pd-section", model.badges.title));
  if (model.badges.items.length > 0) {
    const detail = el("div", "pd-badge-detail", model.badges.hint);
    const grid2 = el("div", "pd-badge-grid");
    for (const it of model.badges.items) grid2.append(badgeHex(it, detail));
    badges.append(grid2, detail);
  } else {
    badges.append(el("div", "pd-badge-detail", model.badges.hint));
  }
  root.append(badges);

  const rows = el("div", "pd-rows");
  const addRow = (label: string, run: () => void, notif?: boolean): void => {
    const r = el("button", "pd-row chamfer");
    r.type = "button";
    r.append(el("span", "pd-row-label", label));
    if (notif) r.append(el("span", "notif-dot"));
    r.append(el("span", "pd-row-chev", "›"));
    r.addEventListener("click", run);
    rows.append(r);
  };
  for (const r of model.rows) addRow(r.label, r.run, r.notif);
  if (model.accountRow) addRow("Account and callsign", () => cb.onAccount());
  root.append(rows);
  return root;
}
