// Local clip sidecar: a JSON file that ships next to a downloaded run
// recording so Lucas can caption / cut social clips without re-watching.
// Built entirely from in-memory run data. No callsign or user id. Offered as
// a local download, and (Lucas-only) POSTed with the video to /api/clip-inbox.
//
// Recording buffers / bitrate / duration stay in recorder.ts and are not
// touched from here. This module only names files and shapes metadata.

import type { GameMode } from "./config";
import type { ClosestCall } from "./highlights";
import { medalForScore, medalThresholdsFor, type MedalTier } from "./medals";
import type { Mutator } from "./mutators";
import { patrolDayString } from "./save";
import { dailyNumber } from "./share";

export interface ClipSidecarPower {
  id: string;
  name: string;
  time: number;
}

export type ClipSidecarEvent =
  | { type: "mutator"; time: number; ids: string[]; names: string[] }
  | { type: "power"; time: number; id: string; name: string }
  | { type: "death"; time: number; score: number };

export interface ClipSidecarGraze {
  time: number;
  clearance: number;
}

/** `[t, x, y]` ship sample in world units. t is world.time (seconds). */
export type ClipSidecarTrackSample = [number, number, number];

/** 2 Hz (every 0.5s of world time). 720 entries = 6 min, matches RECORDING_MAX_SECONDS. */
export const CLIP_TRACK_INTERVAL = 0.5;
export const CLIP_TRACK_CAP = 720;

export interface ClipSidecar {
  day: number;
  mutatorIds: string[];
  mutatorNames: string[];
  score: number;
  medal: MedalTier | null;
  survivalTime: number;
  /** Same as survivalTime: world.time at death, named for cutters. */
  deathTime: number;
  closestCall: ClosestCall | null;
  topGrazes: ClipSidecarGraze[];
  powers: ClipSidecarPower[];
  events: ClipSidecarEvent[];
  track: ClipSidecarTrackSample[];
  arena: { w: number; h: number };
  view: { w: number; h: number };
}

export interface ClipSidecarInput {
  score: number;
  survivalTime: number;
  closestCall: ClosestCall | null;
  topGrazes: ClosestCall[];
  track: ClipSidecarTrackSample[];
  arena: { w: number; h: number };
  view: { w: number; h: number };
  mutators: Mutator[];
  /** Daily Patrol (including preview). Fullgame Classic/Iron Rain are false. */
  daily: boolean;
  gameMode: GameMode;
  /** Power pickups this run, in world.time order. */
  powers?: ClipSidecarPower[];
  /** Override "now" for tests / rehearsal dates; production today leaves this unset. */
  now?: Date;
}

function copyCall(call: ClosestCall): ClosestCall {
  return { time: call.time, x: call.x, y: call.y, clearance: call.clearance };
}

export function roundTrackCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Append one `[t, x, y]` sample when world time has reached the next 0.5s
 * mark, capped at CLIP_TRACK_CAP. Mutates `track` in place. Reads the
 * supplied time/position only; no RNG, no schedule streams.
 */
export function sampleShipTrack(
  track: ClipSidecarTrackSample[],
  time: number,
  x: number,
  y: number,
): void {
  if (track.length >= CLIP_TRACK_CAP) return;
  const due = track.length * CLIP_TRACK_INTERVAL;
  if (time + 1e-9 < due) return;
  track.push([roundTrackCoord(time), roundTrackCoord(x), roundTrackCoord(y)]);
}

/** This-run medal vs the supplied mutators' thresholds; null if none or no tier. */
export function sidecarMedal(score: number, mutators: Mutator[]): MedalTier | null {
  if (mutators.length === 0) return null;
  return medalForScore(Math.floor(score), medalThresholdsFor(mutators));
}

export function buildClipSidecar(input: ClipSidecarInput): ClipSidecar {
  const score = Math.floor(input.score);
  const mutatorIds = input.mutators.map((m) => m.id);
  const mutatorNames = input.mutators.map((m) => m.name);
  const powers = (input.powers ?? []).map((p) => ({ id: p.id, name: p.name, time: p.time }));
  const events: ClipSidecarEvent[] = [];
  if (mutatorIds.length > 0) {
    events.push({ type: "mutator", time: 0, ids: mutatorIds.slice(), names: mutatorNames.slice() });
  }
  for (const p of powers) events.push({ type: "power", time: p.time, id: p.id, name: p.name });
  events.push({ type: "death", time: input.survivalTime, score });
  return {
    day: dailyNumber(input.now),
    mutatorIds,
    mutatorNames,
    score,
    medal: sidecarMedal(input.score, input.mutators),
    survivalTime: input.survivalTime,
    deathTime: input.survivalTime,
    closestCall: input.closestCall ? copyCall(input.closestCall) : null,
    topGrazes: input.topGrazes.map((g) => ({ time: g.time, clearance: g.clearance })),
    powers,
    events,
    track: input.track.map((p) => [p[0], p[1], p[2]] as ClipSidecarTrackSample),
    arena: { w: input.arena.w, h: input.arena.h },
    view: { w: input.view.w, h: input.view.h },
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
  const date = patrolDayString(input.now);
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

/**
 * Desktop Chrome / Chromium (not iOS WebKit, not Android, not Edge or Opera).
 * Kept for tests; the dual-download Save JSON path is retired.
 */
export function isDesktopChrome(
  nav?: Pick<Navigator, "userAgent" | "maxTouchPoints"> | { userAgent: string; maxTouchPoints: number },
): boolean {
  const n = nav ?? (typeof navigator === "undefined" ? undefined : navigator);
  if (!n) return false;
  if (isIosWebKit(n)) return false;
  const ua = n.userAgent;
  if (/Android/.test(ua)) return false;
  if (/Mobile/.test(ua)) return false;
  if (/Edg\//.test(ua)) return false;
  if (/OPR\//.test(ua)) return false;
  if (!/Chrome\//.test(ua)) return false;
  return true;
}
