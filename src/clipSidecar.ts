// Local clip sidecar: a JSON file that ships next to a downloaded run
// recording so Lucas can caption / cut social clips without re-watching.
// Same privacy stance as the clip itself (recorder.ts): built entirely from
// in-memory run data, offered as a download, never uploaded, never persisted,
// no callsign or user id.
//
// Recording buffers / bitrate / duration stay in recorder.ts and are not
// touched from here. This module only names files and shapes metadata.

import type { GameMode } from "./config";
import type { ClosestCall } from "./highlights";
import { medalForScore, medalThresholdsFor, type MedalTier } from "./medals";
import type { Mutator } from "./mutators";
import { utcDateString } from "./save";
import { dailyNumber } from "./share";

export interface ClipSidecarGraze {
  time: number;
  clearance: number;
}

export interface ClipSidecar {
  day: number;
  mutatorIds: string[];
  mutatorNames: string[];
  score: number;
  medal: MedalTier | null;
  survivalTime: number;
  closestCall: ClosestCall | null;
  topGrazes: ClipSidecarGraze[];
}

export interface ClipSidecarInput {
  score: number;
  survivalTime: number;
  closestCall: ClosestCall | null;
  topGrazes: ClosestCall[];
  mutators: Mutator[];
  /** Daily Patrol (including preview). Fullgame Classic/Iron Rain are false. */
  daily: boolean;
  gameMode: GameMode;
  /** Override "now" for tests; production leaves this unset. */
  now?: Date;
}

function copyCall(call: ClosestCall): ClosestCall {
  return { time: call.time, x: call.x, y: call.y, clearance: call.clearance };
}

/** This-run medal vs the supplied mutators' thresholds; null if none or no tier. */
export function sidecarMedal(score: number, mutators: Mutator[]): MedalTier | null {
  if (mutators.length === 0) return null;
  return medalForScore(Math.floor(score), medalThresholdsFor(mutators));
}

export function buildClipSidecar(input: ClipSidecarInput): ClipSidecar {
  return {
    day: dailyNumber(input.now),
    mutatorIds: input.mutators.map((m) => m.id),
    mutatorNames: input.mutators.map((m) => m.name),
    score: Math.floor(input.score),
    medal: sidecarMedal(input.score, input.mutators),
    survivalTime: input.survivalTime,
    closestCall: input.closestCall ? copyCall(input.closestCall) : null,
    topGrazes: input.topGrazes.map((g) => ({ time: g.time, clearance: g.clearance })),
  };
}

/** Filename slot for the day's mutator(s), or the fullgame mode, or `none`. */
export function clipSidecarMutatorSlot(input: Pick<ClipSidecarInput, "daily" | "mutators" | "gameMode">): string {
  if (!input.daily) return input.gameMode;
  if (input.mutators.length === 0) return "none";
  return input.mutators.map((m) => m.id).join("+");
}

/**
 * `orion_<YYYY-MM-DD>_day<N>_<mutator-id>_<score>`
 * Sunday doubles join ids with `+`. Empty daily mutators use `none`.
 * Non-daily /fullgame runs put `classic` / `ironrain` in the mutator slot.
 */
export function clipSidecarBasename(input: ClipSidecarInput): string {
  const date = utcDateString(input.now);
  const day = dailyNumber(input.now);
  const slot = clipSidecarMutatorSlot(input);
  const score = Math.floor(input.score);
  return `orion_${date}_day${day}_${slot}_${score}`;
}

/**
 * iPhone / iPad / iPod, plus iPadOS that reports as Macintosh but has touch.
 * Conservative: if this is true, do not rely on a second programmatic
 * download in the same click (iOS Safari often swallows it).
 */
export function isIosWebKit(
  nav?: Pick<Navigator, "userAgent" | "maxTouchPoints"> | { userAgent: string; maxTouchPoints: number },
): boolean {
  const n = nav ?? (typeof navigator === "undefined" ? undefined : navigator);
  if (!n) return false;
  const ua = n.userAgent;
  if (/iP(hone|ad|od)/.test(ua)) return true;
  if (/Macintosh/.test(ua) && n.maxTouchPoints > 1) return true;
  return false;
}
