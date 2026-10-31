// Lobby v3 view model (owner: WS-L). Pure: no DOM, no ui.ts import, so every
// rule here is testable in node. ui.ts `showDailyLobbyV3` maps the model to
// elements with the existing builders.

import type { LobbyParams } from "../flags";
import type { LobbyPhase } from "../lobbyState";
import { MEDAL_LABEL, medalForScore, type MedalThresholds, type MedalTier } from "../medals";
import { LOBBY_FILL_TARGETS } from "./fillTargets";

/** The four lobby tabs. */
export type LobbyTab = "patrol" | "board" | "wingmates" | "pilot";

/** Chip text limit (characters, ellipsis included). */
export const CHIP_MAX = 24;
/** Desktop layout starts at this viewport width. */
export const DESKTOP_MIN_PX = 900;

/** The slice of a mutator the lobby reads. */
export interface LobbyV3Mutator {
  id: string;
  name: string;
  briefing: string;
  subline: string;
  hudRule: string;
}

/** The slice of `DailyLobbyInfo` the model reads (structural, so no ui.ts import). */
export interface LobbyV3Info {
  dayNumber: number;
  callsign?: string;
  online: boolean;
  preview?: boolean;
  mutators: LobbyV3Mutator[];
  best: { score: number } | null;
  medalThresholds?: MedalThresholds;
}

export interface LobbyV3Env {
  /** Viewport width in px (layout switches at DESKTOP_MIN_PX). */
  width: number;
  /** Consecutive flown days from `currentStreak(weekStrip(...))`. */
  streak: number;
  phase: LobbyPhase;
  /** PT patrol date `YYYY-MM-DD` (kicker). */
  patrolDate: string;
}

export type LobbySection = "header" | "hero" | "launch" | "board" | "flightLog" | "orders";

export interface LobbyV3Model {
  /** Sections in render order. `board` only when the community server is up. */
  sections: LobbySection[];
  desktop: boolean;
  /** The tab bar replaces the hamburger. */
  tabBar: boolean;
  header: {
    callsign: string | null;
    /** Metal word from today's best medal (until the ladder ships), else "PILOT". */
    metalWord: string;
    streak: number;
    streakLabel: string;
  };
  hero: {
    kicker: string;
    /** One entry per mutator (Sunday doubles two). Empty = classic patrol. */
    mutators: { id: string; name: string; nameSizePx: number }[];
    /** The one-line briefing (single mutator only). */
    line: string | null;
    chips: string[];
    classic: boolean;
    emblemPx: number;
    /** Sunday: "SAME RUN FOR EVERY PILOT TODAY" is not shown here, only in the briefing. */
    double: boolean;
  };
  /** Every DOM hook the async fillers write into (superset of LOBBY_FILL_TARGETS). */
  fillTargets: string[];
}

export function isDesktop(width: number): boolean {
  return width >= DESKTOP_MIN_PX;
}

const DANGLERS = new Set(["A", "AN", "THE", "IS", "ARE", "OF", "TO", "AT", "IN", "ON", "AND", "OR", "BUT", "FOR", "WITH", "AS", "AFTER", "THAN", "THEN", "BY", "FROM"]);

/** Truncate to `max` characters on a word boundary (never ending on a dangling word), ellipsis included. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  const words = (sp >= 8 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, "").split(" ");
  while (words.length > 1 && DANGLERS.has(words[words.length - 1].toUpperCase())) words.pop();
  return `${words.join(" ")}\u2026`;
}

/** First sentence, then its first clause, uppercased and clipped. Never empty ("" only when the source is blank). */
export function firstClause(text: string, max = CHIP_MAX): string {
  const sentence = text.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  const clause = sentence.split(/[,;:]/)[0] ?? sentence;
  const clean = clause.replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
  return clip(clean.toUpperCase(), max);
}

/** Sentences of a line, trimmed, trailing punctuation dropped, uppercased. */
function sentencesOf(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((t) => t.replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim().toUpperCase())
    .filter((t) => t.length > 0);
}

/** First clause (split at , ; :) of the first sentence, uppercased, unclipped. */
function rawClause(text: string): string {
  const first = sentencesOf(text)[0] ?? "";
  return (first.split(/[,;:]/)[0] ?? first).trim();
}

const CHIP_MIN = 8;
const fits = (t: string): boolean => t.length >= CHIP_MIN && t.length <= CHIP_MAX;
const overlaps = (a: string, b: string): boolean => a === b || a.startsWith(b) || b.startsWith(a);

/**
 * Hero chips for one mutator, max 24 characters each, never an empty list.
 * First: the subline's first clause, else the one-line rule's first sentence
 * (whichever fits whole), else the subline clause clipped on a word. Second:
 * a rule sentence that fits whole and does not repeat the first. Falls back to
 * the mutator name.
 */
export function chipsFor(m: LobbyV3Mutator): string[] {
  const rule = sentencesOf(m.hudRule);
  const sub = rawClause(m.subline);
  const first = [sub, rule[0] ?? "", rawClause(m.hudRule)].find(fits) ?? clip([sub, rule[0] ?? "", rawClause(m.hudRule)].filter((t) => t.length >= CHIP_MIN).sort((x, y) => x.length - y.length)[0] ?? "", CHIP_MAX);
  const out: string[] = first ? [first] : [];
  const second = [rule[rule.length - 1] ?? "", rule[0] ?? "", rule[1] ?? ""].find(
    (t) => fits(t) && (!first || !overlaps(t, first)),
  );
  if (second) out.push(second);
  if (out.length === 0) out.push(clip(m.name.toUpperCase(), CHIP_MAX));
  return out;
}

/** Name size in px: 46 for short names, smaller so long ones keep to two lines at 360 px. */
export function nameSizePx(name: string, double: boolean): number {
  if (double) return name.length > 12 ? 24 : 28;
  if (name.length <= 10) return 46;
  if (name.length <= 14) return 40;
  return 32;
}

/** "THU OCT 29" from a PT patrol date. */
export function kickerDate(patrolDate: string): string {
  const d = new Date(`${patrolDate}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "";
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${wd} ${md}`.toUpperCase();
}

export function metalWordFor(best: { score: number } | null, thresholds?: MedalThresholds): string {
  if (!best || !thresholds) return "PILOT";
  const tier: MedalTier | null = medalForScore(best.score, thresholds);
  return tier ? MEDAL_LABEL[tier] : "PILOT";
}

/** `H:MM:SS` until the patrol closes. */
export function closesInLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "68k" style gap, never "0". */
export function aheadLabel(points: number): string {
  const p = Math.max(1, Math.round(points));
  return p >= 1000 ? `${Math.round(p / 1000)}k` : String(p);
}

/**
 * The lobby v3 model. Null when the flag params are absent (the caller then
 * paints today's lobby).
 */
export function lobbyV3Model(info: LobbyV3Info, params: LobbyParams | null, env: LobbyV3Env): LobbyV3Model | null {
  if (!params) return null;
  const desktop = isDesktop(env.width);
  const double = info.mutators.length > 1;
  const first = info.mutators[0] ?? null;
  const sections: LobbySection[] = ["header", "hero", "launch"];
  if (info.online) sections.push("board");
  sections.push("flightLog", "orders");
  return {
    sections,
    desktop,
    tabBar: params.tabBar,
    header: {
      callsign: info.callsign ?? null,
      metalWord: metalWordFor(info.best, info.medalThresholds),
      streak: env.streak,
      streakLabel: `${env.streak} DAY STREAK`,
    },
    hero: {
      kicker: `PATROL #${info.dayNumber} · ${kickerDate(env.patrolDate)}`,
      mutators: info.mutators.map((m) => ({ id: m.id, name: m.name, nameSizePx: nameSizePx(m.name, double) })),
      line: first && !double ? first.briefing : null,
      chips: double ? info.mutators.map((m) => chipsFor(m)[0]) : first ? chipsFor(first) : [],
      classic: info.mutators.length === 0,
      emblemPx: double ? 112 : 160,
      double,
    },
    fillTargets: [...LOBBY_FILL_TARGETS],
  };
}

// ---- Board card (podium + you + "X is N ahead") ----

export interface BoardRowLite {
  rank: number;
  callsign: string;
  country: string;
  score: number;
  isMe: boolean;
  virtual?: boolean;
}

export interface PodiumSlot {
  slot: "leader" | "left" | "right";
  row: BoardRowLite;
}

export interface BoardV3Model {
  podium: PodiumSlot[];
  /** Your row when you are outside the top 3, else null. */
  you: BoardRowLite | null;
  /** "Your best today" score line (null when there is no best). */
  yourBest: number | null;
  /** The wingmate directly above you and the gap, when known. */
  ahead: { callsign: string; points: number } | null;
  /** "YOU #14" for the card head, null when unranked. */
  youTag: string | null;
}

/** Podium (rank 1 center, 2 left, 3 right), your row, and the next wingmate above. */
export function boardV3Model(
  rows: BoardRowLite[],
  meRank: number | null,
  myScore: number | null,
  guest: boolean,
): BoardV3Model {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const pick = (rank: number): BoardRowLite | undefined => sorted.find((r) => r.rank === rank);
  const podium: PodiumSlot[] = [];
  const r2 = pick(2);
  const r1 = pick(1);
  const r3 = pick(3);
  if (r2) podium.push({ slot: "left", row: r2 });
  if (r1) podium.push({ slot: "leader", row: r1 });
  if (r3) podium.push({ slot: "right", row: r3 });
  const me = meRank === null ? null : (sorted.find((r) => r.rank === meRank && r.isMe) ?? sorted.find((r) => r.isMe) ?? null);
  const you = me && me.rank > 3 ? me : null;
  const score = myScore ?? me?.score ?? null;
  let ahead: BoardV3Model["ahead"] = null;
  if (meRank !== null && meRank > 1 && score !== null) {
    const above = pick(meRank - 1);
    if (above && above.score > score) ahead = { callsign: above.callsign, points: above.score - score };
  }
  const youTag = meRank === null ? null : guest ? `WOULD BE #${meRank}` : `YOU #${meRank}`;
  return { podium, you, yourBest: score, ahead, youTag };
}
