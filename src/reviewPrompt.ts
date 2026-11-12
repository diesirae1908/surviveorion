/**
 * App Store rating prompt policy (iOS 1.2, switch `app.review`). Pure: no DOM, node-tested.
 * The web side only decides whether a run is a good moment to ASK; the dialog itself, the
 * per-version guard and Apple's own cap live in Swift (`requestReview` bridge message).
 *
 * Rule, all must hold: switch on; this is the app shell; not a preview, archive, training,
 * First Flight or refunded run; the run lasted >= minRunSeconds; it earned today's first medal
 * or a medal upgrade (onMedal) or a new personal best (onPersonalBest); the app has been
 * opened >= minSessions times; not already asked for this app version. The ask itself fires at
 * the next calm point (the lobby repaint after BASE), never on the result screen or mid-run.
 */

import type { AppReviewParams } from "./flags";
import type { MedalTier } from "./medals";

export type ReviewReason =
  | "medal"
  | "new-pb"
  | "off"
  | "not-shell"
  | "preview"
  | "archive"
  | "training"
  | "refunded"
  | "short-run"
  | "early-session"
  | "already-asked"
  | "no-trigger";

export interface ReviewContext {
  /** app.review params; null = switch off. */
  params: AppReviewParams | null;
  /** Only the web shell asks; the SwiftUI fallback path is Swift's. */
  shell: boolean;
  preview: boolean;
  archive: boolean;
  /** Training Ground or First Flight. */
  training: boolean;
  refunded: boolean;
  runSeconds: number;
  /** Best-of-day medal before this run, and after it. */
  medalBefore: MedalTier | null;
  medalAfter: MedalTier | null;
  newPersonalBest: boolean;
  /** Foreground launches of the app (`sessions=`). */
  sessions: number;
  /** App version (`appv=`) and the version the web last asked for. */
  appVersion: string | null;
  askedVersion: string | null;
}

export interface ReviewDecision {
  /** True = hold a candidate and ask at the next calm point. */
  ask: boolean;
  reason: ReviewReason;
}

const MEDAL_RANK: Record<MedalTier, number> = { copper: 1, silver: 2, gold: 3 };

/** First medal of the day, or a higher one than before this run. */
export function medalUpgraded(before: MedalTier | null, after: MedalTier | null): boolean {
  if (!after) return false;
  return !before || MEDAL_RANK[after] > MEDAL_RANK[before];
}

const no = (reason: ReviewReason): ReviewDecision => ({ ask: false, reason });

export function reviewDecision(c: ReviewContext): ReviewDecision {
  if (!c.params) return no("off");
  if (!c.shell) return no("not-shell");
  if (c.preview) return no("preview");
  if (c.archive) return no("archive");
  if (c.training) return no("training");
  if (c.refunded) return no("refunded");
  if (c.runSeconds < (c.params.minRunSeconds ?? 30)) return no("short-run");
  if (c.sessions < (c.params.minSessions ?? 3)) return no("early-session");
  if (c.appVersion !== null && c.askedVersion === c.appVersion) return no("already-asked");
  if (c.params.onMedal !== false && medalUpgraded(c.medalBefore, c.medalAfter)) return { ask: true, reason: "medal" };
  if (c.params.onPersonalBest !== false && c.newPersonalBest) return { ask: true, reason: "new-pb" };
  return no("no-trigger");
}

/** Calm point: the lobby is up, nothing is running or open. Pure so the gate is pinned in a test. */
export function calmForReview(state: string, hasCandidate: boolean): boolean {
  return hasCandidate && state === "menu";
}
