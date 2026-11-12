// Challenge links (ui.challenge): client model. Pure helpers plus tiny storage
// wrappers; no network, no DOM, no world access. api.ts does the fetches and
// main.ts / ui.ts wire the results (WS-5).
//
// The link carries no score: the server resolves it from the daily rows, and
// every number shown here came from a resolve response, never from the URL.
// Nothing in this file touches the run: no rand() draws, no scoring.
//
// Copy lives in COPY below (Mission Control in game, The Log for previews).
// Lucas edits only that table. "challenge" is a verb only, no exclamation
// marks, no dashes (test-no-em-dash sweeps this file).

import type { ChallengeParams } from "./flags";

// --- wire types (contract: server/challenge.mjs routes) ---

export type ChallengeStatus = "live" | "expired";

/** `GET /api/challenge/:code` body when the layer is on and the code resolves. */
export interface ChallengeResolveResponse {
  active: boolean;
  status?: ChallengeStatus;
  self?: boolean;
  callsign?: string;
  score?: number;
  patrolDate?: string;
  patrolNumber?: number;
}

/** `POST /api/challenge` body. `active:false` when the switch is off. */
export interface ChallengeMintResponse {
  active: boolean;
  code?: string;
  url?: string;
  patrolDate?: string;
  patrolNumber?: number;
  score?: number;
}

export const CHALLENGE_STEPS = ["shared", "opened", "opened_new", "flew", "beat", "lost", "back"] as const;
export type ChallengeStep = (typeof CHALLENGE_STEPS)[number];

/** A resolved challenger the friend is flying against. */
export interface ChallengeTarget {
  code: string;
  callsign: string;
  score: number;
  patrolDate: string;
  patrolNumber: number;
  status: ChallengeStatus;
  /** The viewer is the challenger: no banner, no target. */
  self: boolean;
}

// --- copy table ---

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

export const COPY = {
  bannerLive: (who: string, score: number) => `${who} flew ${fmt(score)} on today's patrol. Beat it.`,
  bannerExpired: (who: string, score: number, patrolNumber: number) =>
    `${who} flew ${fmt(score)} on Patrol #${patrolNumber}. That patrol is closed. Fly today's and send yours back.`,
  bannerAhead: (who: string, gap: number) => `You're ${fmt(gap)} ahead of ${who} today.`,
  bannerBehind: (who: string, gap: number) => `${who} leads by ${fmt(gap)}. Next patrol at 12:00 AM PT.`,
  bannerTie: (who: string) => `Dead even with ${who} today. Next patrol at 12:00 AM PT.`,
  firstFlightEnd: (who: string, score: number) => `Next: beat ${who}'s ${fmt(score)}.`,
  chipBehind: (who: string, gap: number) => `VS ${who} +${fmt(gap)}`,
  chipAhead: (who: string, gap: number) => `PAST ${who} ▲${fmt(gap)}`,
  resultWin: (who: string, margin: number) => `You beat ${who} by ${fmt(margin)}.`,
  resultLose: (who: string, short: number) => `${who} holds. ${fmt(short)} short.`,
  resultTie: (who: string) => `Dead even with ${who}.`,
  buttonWin: (who: string) => `Challenge ${who} back`,
  buttonLose: (who: string) => `Send ${who} your run`,
  buttonUnnamed: "Name your callsign to send it",
  shareChallenger: (url: string) => `Beat it: ${url}`,
  shareBackWin: (who: string, score: number, url: string) => `Beat ${who}'s ${fmt(score)}. Your move: ${url}`,
  shareBackLose: (who: string, gap: number, url: string) => `${who} is ${fmt(gap)} ahead. Beat me: ${url}`,
  shareBackTie: (who: string, url: string) => `Dead even with ${who}. Beat me: ${url}`,
  ogTitleLive: (who: string, score: number, patrolNumber: number) =>
    `Beat ${who}'s ${fmt(score)} on ORION Patrol #${patrolNumber}`,
  ogTitleExpired: (who: string, score: number, patrolNumber: number) =>
    `${who} flew ${fmt(score)} on ORION Patrol #${patrolNumber}`,
  ogDescLive: "Same run for every pilot today. Three attempts. Free in your browser.",
  ogDescExpired:
    "That patrol is closed. Today's is open: same run for every pilot, three attempts, free in your browser.",
} as const;

// --- path parsing ---

const PATH_RE = /^\/c\/([0-9A-Za-z]{7})\/?$/;

/** The challenge code (upper-cased, codes are case-insensitive) or null. */
export function parseChallengePath(pathname: string): string | null {
  const m = PATH_RE.exec(pathname);
  return m ? m[1].toUpperCase() : null;
}

// --- storage (injectable so tests need no DOM) ---

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const CONTEXT_KEY = "orion.challenge";
/** A stashed arrival is dropped after a day (a stale tab must not resurrect it). */
export const CONTEXT_MAX_AGE_MS = 24 * 3600 * 1000;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Remember the code from the arrival URL for this browser session. */
export function storeChallengeContext(store: KV, code: string, now = Date.now()): void {
  safe(() => store.setItem(CONTEXT_KEY, JSON.stringify({ code, at: now })), undefined);
}

export function loadChallengeContext(store: KV, now = Date.now()): string | null {
  return safe(() => {
    const raw = store.getItem(CONTEXT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { code?: unknown; at?: unknown };
    if (typeof v.code !== "string" || typeof v.at !== "number") return null;
    if (!/^[0-9A-Z]{7}$/.test(v.code)) return null;
    if (now - v.at > CONTEXT_MAX_AGE_MS || v.at > now + 60_000) return null;
    return v.code;
  }, null);
}

const MINT_KEY_PREFIX = "orion.challenge.mint.";

/** Cached own link URL for a patrol date (prefetched so share never waits). */
export function loadMintedUrl(store: KV, patrolDate: string): string | null {
  return safe(() => {
    const v = store.getItem(MINT_KEY_PREFIX + patrolDate);
    return v && /^https:\/\/[^\s]+\/c\/[0-9A-Za-z]{7}$/.test(v) ? v : null;
  }, null);
}

export function saveMintedUrl(store: KV, patrolDate: string, url: string): void {
  safe(() => store.setItem(MINT_KEY_PREFIX + patrolDate, url), undefined);
}

// --- event dedupe ---

/** `opened` dedupes per session (sessionStorage); every other step per device (localStorage). */
export function eventDedupeKey(step: ChallengeStep, code: string): string {
  return `orion.challenge.ev.${step}.${code.toUpperCase()}`;
}

/**
 * True the first time a step is seen for a code in the given store, and marks
 * it. Callers pass sessionStorage for opened/opened_new, localStorage for the
 * rest (see eventStoreScope). Storage failure returns false: a counter is
 * vanity, so it is never worth a retry loop.
 */
export function claimEvent(store: KV, step: ChallengeStep, code: string): boolean {
  return safe(() => {
    const k = eventDedupeKey(step, code);
    if (store.getItem(k)) return false;
    store.setItem(k, "1");
    return true;
  }, false);
}

export function eventStoreScope(step: ChallengeStep): "session" | "device" {
  return step === "opened" || step === "opened_new" ? "session" : "device";
}

// --- resolve normalization ---

/** Turn a resolve response into a target, or null (inactive, malformed, or no usable score). */
export function targetFromResolve(code: string, r: ChallengeResolveResponse | null | undefined): ChallengeTarget | null {
  if (!r || r.active !== true) return null;
  if (r.status !== "live" && r.status !== "expired") return null;
  if (typeof r.callsign !== "string" || !r.callsign) return null;
  if (typeof r.score !== "number" || !Number.isFinite(r.score) || r.score < 0) return null;
  if (typeof r.patrolDate !== "string" || typeof r.patrolNumber !== "number") return null;
  return {
    code: code.toUpperCase(),
    callsign: r.callsign,
    score: Math.round(r.score),
    patrolDate: r.patrolDate,
    patrolNumber: r.patrolNumber,
    status: r.status,
    self: r.self === true,
  };
}

/** A target the pace chip may use: live, not the viewer's own, and the pace switch on. */
export function paceTargetFor(
  target: ChallengeTarget | null,
  params: ChallengeParams | null,
): { callsign: string; score: number } | null {
  if (!target || !params || params.paceTarget !== true) return null;
  if (target.status !== "live" || target.self) return null;
  return { callsign: target.callsign, score: target.score };
}

// --- banner ---

export interface BannerContext {
  params: ChallengeParams | null;
  /** Attempts the pilot has left today (null: unknown). */
  attemptsLeft?: number | null;
  /** The pilot's own best daily score today, if any. */
  dayBest?: number | null;
}

export interface BannerModel {
  text: string;
  /** `live` banners point at the LAUNCH button; `info` ones are statements. */
  kind: "live" | "expired" | "ahead" | "behind" | "tie";
}

export function bannerModel(target: ChallengeTarget | null, ctx: BannerContext): BannerModel | null {
  if (!target || target.self) return null;
  if (!ctx.params || ctx.params.lobbyBanner !== true) return null;
  const who = target.callsign;
  if (target.status === "expired") {
    return { text: COPY.bannerExpired(who, target.score, target.patrolNumber), kind: "expired" };
  }
  const spent = ctx.attemptsLeft === 0 && typeof ctx.dayBest === "number";
  if (spent) {
    const best = ctx.dayBest as number;
    if (best > target.score) return { text: COPY.bannerAhead(who, best - target.score), kind: "ahead" };
    if (best === target.score) return { text: COPY.bannerTie(who), kind: "tie" };
    return { text: COPY.bannerBehind(who, target.score - best), kind: "behind" };
  }
  return { text: COPY.bannerLive(who, target.score), kind: "live" };
}

/** The line on the First Flight end modal, or null. Live targets only. */
export function firstFlightLine(target: ChallengeTarget | null, params: ChallengeParams | null): string | null {
  if (!target || target.self || target.status !== "live") return null;
  if (!params || params.lobbyBanner !== true) return null;
  return COPY.firstFlightEnd(target.callsign, target.score);
}

// --- result ---

export interface ResultContext {
  params: ChallengeParams | null;
  preview?: boolean;
  archive?: boolean;
  training?: boolean;
  firstFlight?: boolean;
  /** Pilot has no callsign yet: the button opens the guest prompt. */
  unnamed?: boolean;
  /** The pilot's own minted link for today, if already cached. */
  url?: string | null;
}

export interface ChallengeResultModel {
  line: string;
  tone: "win" | "lose";
  /** Null when `challengeBack` is off (no button). */
  buttonLabel: string | null;
  /** The button needs a callsign first (open the existing guest prompt). */
  needsName: boolean;
  /** Extra share text line, or null when the pilot's link is not minted yet. */
  shareText: string | null;
  /** Result for the event counters. */
  outcome: "beat" | "lost";
}

/** A tie counts as a loss and reads "Dead even with X.". */
export function challengeResultModel(
  runScore: number,
  target: ChallengeTarget | null,
  ctx: ResultContext,
): ChallengeResultModel | null {
  if (!target || target.self || target.status !== "live") return null;
  if (!ctx.params || ctx.params.resultLine !== true) return null;
  if (ctx.preview || ctx.archive || ctx.training || ctx.firstFlight) return null;
  if (!Number.isFinite(runScore)) return null;
  const who = target.callsign;
  const win = runScore > target.score;
  const tie = runScore === target.score;
  const line = win
    ? COPY.resultWin(who, runScore - target.score)
    : tie
      ? COPY.resultTie(who)
      : COPY.resultLose(who, target.score - runScore);
  const back = ctx.params.challengeBack === true;
  const buttonLabel = !back ? null : ctx.unnamed ? COPY.buttonUnnamed : win ? COPY.buttonWin(who) : COPY.buttonLose(who);
  const url = back ? (ctx.url ?? null) : null;
  const shareText = !url
    ? null
    : win
      ? COPY.shareBackWin(who, target.score, url)
      : tie
        ? COPY.shareBackTie(who, url)
        : COPY.shareBackLose(who, target.score - runScore, url);
  return { line, tone: win ? "win" : "lose", buttonLabel, needsName: back && !!ctx.unnamed, shareText, outcome: win ? "beat" : "lost" };
}

/** Last share-text line for a challenger (replaces `surviveorion.com`); null when no cached link or `mint` off. */
export function challengerShareLine(url: string | null | undefined, params: ChallengeParams | null): string | null {
  if (!url || !params || params.mint !== true) return null;
  return COPY.shareChallenger(url);
}

/** Signed gap for the share card versus row: positive when ahead of the target. */
export function versusFor(runScore: number, target: ChallengeTarget | null, params: ChallengeParams | null): { callsign: string; gap: number } | null {
  if (!target || target.self || target.status !== "live") return null;
  if (!params || params.resultLine !== true) return null;
  return { callsign: target.callsign, gap: runScore - target.score };
}
