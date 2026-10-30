// Switch registry, client side. Same resolution algorithm as server/flags.mjs
// (pinned by scripts/test-flag-parity.ts), like patrolDate.ts / patrolDate.mjs.
//
// Rules for the run are resolved ONCE, in startRun(), from the run's patrol
// date, so a board never mixes rules and past-day replays keep that day's
// rules. Rows from the server are self-contained (params fully materialized at
// write time): this file uses them as-is and never re-merges or re-clamps.
// A param added in a later bundle must have a no-op default and be read only
// when present (`params.forms.starshell?.on === true`).

import registry from "../server/flags-registry.json";
import { nextPatrolMidnight, patrolDateStr } from "./patrolDate";

// --- types ---

/** A tunable form entry: `on` plus numeric/boolean knobs. */
export type FormParams = { on: boolean } & Record<string, number | boolean>;

/** OVERDRIVE rules, exactly the registry's `overdrive` params. */
export interface OverdriveParams {
  chargePerGraze: number;
  razorClearance: number;
  razorGrazeScale: number;
  outerClearance: number;
  outerGrazeScale: number;
  chargePerKill: number;
  maxKillChargePerSec: number;
  killChargeLockout: number;
  drainDelay: number;
  drainPerSec: number;
  hotDroneSpeedScale: number;
  hotRadius: number;
  hotMaxSeconds: number;
  burstRadius: number;
  mutatorHooks: boolean;
  forms: {
    pulse: { on: boolean; fanCount: number; fanSpreadDeg: number };
    shield: { on: boolean; radiusScale: number; refund: number };
    freeze: { on: boolean; radiusScale: number; chainRadius: number; chainMax: number };
    magnet: { on: boolean; maxPull: number };
    shockwave: { on: boolean; echoDelay: number; echoScale: number };
    missiles: { on: boolean; count: number; maxAlive: number };
    /** Phase 1b entries: absent in older rows, read only when present. */
    starshell?: FormParams;
    arc?: FormParams;
    autocannon?: FormParams;
    meteors?: FormParams;
  };
}
export type OverdriveRules = OverdriveParams;

export interface RunRules {
  rulesetId: string;
  overdrive: OverdriveRules | null;
  /** Unscored: a `?flags=` or creator preview run. Never submits. */
  preview: boolean;
}

export interface OverdriveFxParams {
  heatTint: boolean;
  formPopup: boolean;
  stings: boolean;
}
export interface HudParams {
  chainBar: boolean;
  pops: boolean;
  vignette: boolean;
  stickFade: boolean;
  killPopMinChain: number;
  vignetteMaxAlpha: number;
  /** Phase 1b entries, read only when present. */
  bezel?: boolean;
  edgeRadar?: boolean;
  hitStop?: boolean;
  hitStopShieldMs?: number;
}
export interface ResultParams {
  deathMoment: boolean;
  resultV2: boolean;
  freezeMs: number;
  shareV2?: boolean;
}

/** The three presentation flags for today. null = off. */
export interface ClientFlags {
  overdriveFx: OverdriveFxParams | null;
  hud: HudParams | null;
  result: ResultParams | null;
}

export interface FlagRow {
  id: number;
  from: string;
  enabled: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any;
  hash: string;
}

export interface ResolvedFlag {
  versionId: string;
  enabled: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any;
  hash: string;
}

export interface FeaturesPayload {
  schema: number;
  today: string;
  flags: Record<string, { kind: string; versions: FlagRow[] }>;
}

interface PreviewFlag {
  enabled: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;
}
export interface CreatorPreviewPayload {
  flags: Record<string, PreviewFlag>;
  expiresAt: number;
}

export interface RunRulesContext {
  daily?: boolean;
  training?: boolean;
  gameMode?: string;
  sandbox?: boolean;
  /** `?flags=` result from parsePreviewFlags (only pass it when the gate is open). */
  previewFlags?: Record<string, boolean>;
}

// --- registry views ---

type RegistryFlag = {
  kind: string;
  area: string;
  default: { enabled: boolean; params: unknown };
  bounds: Record<string, [number, number]>;
};
const REGISTRY = registry as unknown as { schema: number; flags: Record<string, RegistryFlag> };

export const FLAG_KEYS: string[] = Object.keys(REGISTRY.flags);

const defaultParams = (key: string): unknown => REGISTRY.flags[key]?.default.params;

/** Rules while every switch is off: what the game was before the registry. */
export const BASE_RULES: RunRules = Object.freeze({
  rulesetId: "base",
  overdrive: null,
  preview: false,
}) as RunRules;

/** Build rules from bundled defaults plus overrides (tests, tools, `?flags=`). */
export function rulesFromDefaults(overrides: Record<string, boolean> = {}): RunRules {
  const on = overrides.overdrive ?? REGISTRY.flags.overdrive.default.enabled;
  return {
    rulesetId: on ? "overdrive@d#default" : "base",
    overdrive: on ? (structuredClone(defaultParams("overdrive")) as OverdriveRules) : null,
    preview: false,
  };
}

// --- pure resolution (mirrors server/flags.mjs resolveFlag / rulesetIdFor) ---

/**
 * Greatest `from <= date`, ties by greatest id. No row: the bundled default,
 * versionId "d". Returns null for an unknown key.
 */
export function resolveFlagFrom(key: string, date: string, rows: FlagRow[] | undefined): ResolvedFlag | null {
  let best: FlagRow | null = null;
  for (const r of rows ?? []) {
    if (r.from > date) continue;
    if (!best || r.from > best.from || (r.from === best.from && r.id > best.id)) best = r;
  }
  if (best) return { versionId: String(best.id), enabled: !!best.enabled, params: best.params, hash: best.hash };
  const def = REGISTRY.flags[key];
  if (!def) return null;
  return { versionId: "d", enabled: !!def.default.enabled, params: def.default.params, hash: "default" };
}

/** `"base"` while overdrive resolves off, else `overdrive@<id>#<hash>`. */
export function rulesetIdFrom(date: string, overdriveRows: FlagRow[] | undefined): string {
  const r = resolveFlagFrom("overdrive", date, overdriveRows);
  if (!r || !r.enabled) return "base";
  return `overdrive@${r.versionId}#${r.hash}`;
}

// --- remote state ---

const CACHE_KEY = "orion.flags.v1";
const CACHE_FRESH_MS = 24 * 3600 * 1000;

let remote: FeaturesPayload | null = null;
let remoteFetchedAt = 0;
let creatorPreview: CreatorPreviewPayload | null = null;
let waited = false;
let snapshotCache: { date: string; stamp: number; cp: boolean; flags: ClientFlags } | null = null;
let todayCache: { date: string; until: number } | null = null;

/** Today's patrol date, recomputed only after the next PT midnight (the formatter is costly per frame). */
function patrolToday(): string {
  const now = Date.now();
  if (!todayCache || now >= todayCache.until) {
    const d = new Date(now);
    todayCache = { date: patrolDateStr(d), until: nextPatrolMidnight(d).getTime() };
  }
  return todayCache.date;
}
let stamp = 0;
const waiters: Array<() => void> = [];
const listeners: Array<() => void> = [];

function validRow(r: unknown): r is FlagRow {
  const o = r as FlagRow;
  return (
    !!o &&
    typeof o.id === "number" &&
    typeof o.from === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(o.from) &&
    typeof o.enabled === "boolean" &&
    !!o.params &&
    typeof o.params === "object" &&
    typeof o.hash === "string"
  );
}

function validPayload(p: unknown): p is FeaturesPayload {
  const o = p as FeaturesPayload;
  if (!o || typeof o !== "object" || o.schema !== 1 || typeof o.flags !== "object" || !o.flags) return false;
  for (const f of Object.values(o.flags)) {
    if (!f || !Array.isArray(f.versions) || !f.versions.every(validRow)) return false;
  }
  return true;
}

function changed(): void {
  stamp++;
  snapshotCache = null;
  for (const fn of listeners) fn();
}

/** Subscribe to remote/preview changes (main re-syncs its preview state). */
export function onFlagsChange(fn: () => void): void {
  listeners.push(fn);
}

function loadCache(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const j = JSON.parse(raw) as { fetchedAt?: number; payload?: unknown };
    if (j && typeof j.fetchedAt === "number" && validPayload(j.payload)) {
      remote = j.payload;
      remoteFetchedAt = j.fetchedAt;
    }
  } catch {
    // unreadable cache: ignore, defaults apply
  }
}
if (typeof localStorage !== "undefined") loadCache();

/** Store a `features` block from GET /api/config. Malformed payloads are ignored. */
export function setRemoteFeatures(payload: unknown): void {
  if (!validPayload(payload)) return;
  remote = payload;
  remoteFetchedAt = Date.now();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: remoteFetchedAt, payload }));
  } catch {
    // storage full or unavailable
  }
  changed();
  for (const w of waiters.splice(0)) w();
}

/** True when a fresh (under 24 h) copy of the rows is in memory. */
function flagsFresh(): boolean {
  return remote !== null && Date.now() - remoteFetchedAt < CACHE_FRESH_MS;
}

/** Whether a launch should wait for flags first (stale or no cache, not yet waited). */
export function flagsNeedWait(): boolean {
  return !waited && !flagsFresh();
}

/** Resolve when fresh rows are in, or after `timeoutMs`, whichever comes first. Never rejects. */
export function flagsReady(timeoutMs: number): Promise<void> {
  if (flagsFresh()) {
    waited = true;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const done = (): void => {
      waited = true;
      resolve();
    };
    waiters.push(done);
    setTimeout(() => {
      const i = waiters.indexOf(done);
      if (i >= 0) waiters.splice(i, 1);
      done();
    }, timeoutMs);
  });
}

/** Creator preview from GET /api/me; null clears it. Applied only while unexpired. */
export function setCreatorPreview(p: unknown): void {
  const o = p as CreatorPreviewPayload | null;
  if (o && typeof o === "object" && typeof o.expiresAt === "number" && o.flags && typeof o.flags === "object") {
    creatorPreview = o;
  } else {
    creatorPreview = null;
  }
  changed();
}

/** The armed creator preview, or null when none or expired. */
export function activeCreatorPreview(now = Date.now()): CreatorPreviewPayload | null {
  if (!creatorPreview || creatorPreview.expiresAt <= now) return null;
  return Object.keys(creatorPreview.flags).length > 0 ? creatorPreview : null;
}

/** `?flags=overdrive:on,ui.hud:off` to `{ overdrive: true, "ui.hud": false }`. Unknown keys dropped. */
export function parsePreviewFlags(search: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const raw = new URLSearchParams(search).get("flags");
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const [k, v] = part.trim().split(":");
    if (!k || !REGISTRY.flags[k]) continue;
    if (v === "on" || v === "off") out[k] = v === "on";
  }
  return out;
}

// --- resolution against live state ---

/** One flag for a patrol date from the remote rows (bundled default when none). */
export function resolveFlag(key: string, patrolDate: string): ResolvedFlag | null {
  return resolveFlagFrom(key, patrolDate, remote?.flags[key]?.versions);
}

/** The effective flag after previews. `previewed` is true when a preview changed it. */
function effectiveFlag(
  key: string,
  patrolDate: string,
  previewFlags: Record<string, boolean> | undefined,
): { flag: ResolvedFlag; previewed: boolean } | null {
  const base = resolveFlag(key, patrolDate);
  if (!base) return null;
  let flag = base;
  let previewed = false;
  const cp = activeCreatorPreview();
  const cpFlag = cp?.flags[key];
  if (cpFlag && typeof cpFlag.enabled === "boolean") {
    flag = {
      versionId: "p",
      enabled: cpFlag.enabled,
      params: cpFlag.params ?? defaultParams(key),
      hash: "preview",
    };
    previewed = true;
  }
  if (previewFlags && key in previewFlags) {
    const useRow = flag.versionId !== "d" && flag.versionId !== "p";
    flag = {
      versionId: "p",
      enabled: previewFlags[key],
      params: useRow ? flag.params : defaultParams(key),
      hash: "preview",
    };
    previewed = true;
  }
  return { flag, previewed };
}

/**
 * Rules for a run, resolved once at startRun. The tutorial sandbox is always
 * BASE_RULES. Any active preview (creator or `?flags=`) makes the run an
 * unscored preview, prefixed `preview:`.
 */
export function resolveRunRules(patrolDate: string, ctx: RunRulesContext = {}): RunRules {
  if (ctx.sandbox) return BASE_RULES;
  const od = effectiveFlag("overdrive", patrolDate, ctx.previewFlags);
  const anyPreview =
    activeCreatorPreview() !== null || Object.keys(ctx.previewFlags ?? {}).length > 0;
  const on = !!od && od.flag.enabled;
  const baseId = on && od ? `overdrive@${od.flag.versionId}#${od.flag.hash}` : "base";
  if (!on && !anyPreview) return BASE_RULES;
  return {
    rulesetId: anyPreview ? `preview:${baseId}` : baseId,
    overdrive: on && od ? (structuredClone(od.flag.params) as OverdriveRules) : null,
    preview: anyPreview,
  };
}

/** True when a finished run may be sent to the server. Pure, so tests can pin it. */
export function shouldSubmit(rules: RunRules, opts: { previewActive?: boolean } = {}): boolean {
  return !rules.preview && !opts.previewActive;
}

/** The three `ui.*` flags for today, cached per patrol date until flags change. */
export function clientFlagsSnapshot(preview?: Record<string, boolean>): ClientFlags {
  const previewFlags = preview && Object.keys(preview).length > 0 ? preview : undefined;
  const today = patrolToday();
  const cp = activeCreatorPreview() !== null; // flips on expiry with no change event
  if (!previewFlags && snapshotCache && snapshotCache.date === today && snapshotCache.stamp === stamp && snapshotCache.cp === cp) {
    return snapshotCache.flags;
  }
  const pick = <T>(key: string): T | null => {
    const e = effectiveFlag(key, today, previewFlags);
    return e && e.flag.enabled ? (e.flag.params as T) : null;
  };
  const flags: ClientFlags = {
    overdriveFx: pick<OverdriveFxParams>("ui.overdriveFx"),
    hud: pick<HudParams>("ui.hud"),
    result: pick<ResultParams>("ui.result"),
  };
  if (!previewFlags) snapshotCache = { date: today, stamp, cp, flags };
  return flags;
}

/** Test seam: drop all remote and preview state. */
export function resetFlagsForTest(): void {
  remote = null;
  remoteFetchedAt = 0;
  creatorPreview = null;
  waited = false;
  snapshotCache = null;
  todayCache = null;
  stamp++;
}
