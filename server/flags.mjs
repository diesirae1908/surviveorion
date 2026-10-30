// Switch registry: definitions, resolution, and the append-only version store
// glue. The resolution algorithm (resolveFlag / rulesetIdFor) is mirrored in
// src/flags.ts and pinned by scripts/test-flag-parity.ts; change both together.
//
// Rows are never updated or deleted. A "change" is a new row. Params are
// materialized (defaults merged, unknown dropped, clamped) at write time and
// stored whole, so a client or an old bundle never re-derives them.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { isValidUtcDateStr } from "./dateUtils.mjs";
import * as store from "./db.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Gameplay rows must start after today's patrol date (scheduled ahead). */
export const GAMEPLAY_MIN_LEAD_DAYS = 1;
/** Creator preview ceiling, hours. */
export const CREATOR_PREVIEW_MAX_HOURS = 12;

let registryCache = null;

/** Parsed `flags-registry.json` (cached). */
export function loadRegistry() {
  if (!registryCache) {
    registryCache = JSON.parse(fs.readFileSync(path.join(dir, "flags-registry.json"), "utf8"));
  }
  return registryCache;
}

/** Staging only: lets gameplay rows start today. */
export const sameDayBypass = () => process.env.ORION_FLAGS_SAME_DAY === "1";

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Merge `params` over the definition's defaults: unknown keys dropped, numbers
 * clamped to the dotted-path bounds, types must match the default's type.
 * Throws an Error with a readable message on a type mismatch.
 */
export function materializeParams(def, params) {
  const bounds = def.bounds ?? {};
  const walk = (defaults, given, prefix) => {
    const out = {};
    for (const k of Object.keys(defaults)) {
      const p = prefix ? `${prefix}.${k}` : k;
      const dv = defaults[k];
      const gv = isPlainObject(given) ? given[k] : undefined;
      if (isPlainObject(dv)) {
        out[k] = walk(dv, gv, p);
      } else if (gv === undefined) {
        out[k] = dv;
      } else if (typeof dv === "number") {
        if (typeof gv !== "number" || !Number.isFinite(gv)) throw new Error(`param ${p} must be a number`);
        const b = bounds[p];
        out[k] = b ? Math.min(b[1], Math.max(b[0], gv)) : gv;
      } else if (typeof dv === "boolean") {
        if (typeof gv !== "boolean") throw new Error(`param ${p} must be true or false`);
        out[k] = gv;
      } else {
        out[k] = dv;
      }
    }
    return out;
  };
  return walk(def.default.params, params, "");
}

/** Canonical JSON: keys sorted at every depth. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (isPlainObject(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** First 8 hex of sha256(canonical JSON of params). */
export const paramsHash = (params) =>
  crypto.createHash("sha256").update(canonicalJson(params)).digest("hex").slice(0, 8);

/**
 * Resolve one flag for a patrol date. `rows` are normalized
 * `{ id, from, enabled, params, hash }`. Greatest `from <= dateStr`, ties by
 * greatest id. No row: the bundled default with versionId "d".
 */
export function resolveFlag(key, dateStr, rows, registry = loadRegistry()) {
  let best = null;
  for (const r of rows ?? []) {
    if (r.from > dateStr) continue;
    if (!best || r.from > best.from || (r.from === best.from && r.id > best.id)) best = r;
  }
  if (best) {
    return { versionId: String(best.id), enabled: !!best.enabled, params: best.params, hash: best.hash };
  }
  const def = registry.flags[key];
  if (!def) return null;
  return { versionId: "d", enabled: !!def.default.enabled, params: def.default.params, hash: "default" };
}

/** `"base"` while overdrive resolves off, else `overdrive@<id>#<hash>`. */
export function rulesetIdFor(dateStr, overdriveRows, registry = loadRegistry()) {
  const r = resolveFlag("overdrive", dateStr, overdriveRows, registry);
  if (!r || !r.enabled) return "base";
  return `overdrive@${r.versionId}#${r.hash}`;
}

/** DB row to the normalized shape shared with the client. */
const normalizeRow = (r) => ({
  id: r.id,
  from: r.effective_from,
  enabled: !!r.enabled,
  params: JSON.parse(r.params),
  hash: r.params_hash,
  emergency: !!r.emergency,
});

/** True when an emergency-off row starts on `dateStr` (that day's board mixes rules). */
export const emergencyOffOn = (dateStr) =>
  store.listFlagVersions().some((r) => r.emergency && r.effective_from === dateStr);

/** Normalized rows for one key from the store. */
export const rowsForKey = (key) => store.listFlagVersions(key).map(normalizeRow);

/** Ruleset id the server expects for a daily_date. */
export const serverRulesetFor = (dateStr) => rulesetIdFor(dateStr, rowsForKey("overdrive"));

/** The `features` block of GET /api/config. */
export function publicFeatures(todayStr) {
  const registry = loadRegistry();
  const flags = {};
  for (const [key, def] of Object.entries(registry.flags)) {
    flags[key] = { kind: def.kind, versions: rowsForKey(key) };
  }
  return { schema: registry.schema, today: todayStr, flags };
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Validate and append one version row. Throws Error (message safe to show an
 * admin) on any problem. Returns the stored row (normalized plus metadata).
 */
export function addFlagVersion(input, todayStr, now = Date.now()) {
  const registry = loadRegistry();
  const { key, effectiveFrom, enabled, params, note, actor } = input ?? {};
  const def = typeof key === "string" ? registry.flags[key] : undefined;
  if (!def) throw new Error("unknown flag key");
  if (typeof effectiveFrom !== "string" || !isValidUtcDateStr(effectiveFrom)) {
    throw new Error("effectiveFrom must be a valid YYYY-MM-DD patrol date");
  }
  if (typeof enabled !== "boolean") throw new Error("enabled must be true or false");
  // Emergency off (Lucas: every switch can be turned off): a gameplay row that
  // turns a switch OFF may start today, with a reason note. Turning ON the same
  // day stays refused (unless the staging bypass is set).
  const cleanNote = typeof note === "string" ? note.trim().slice(0, 500) : "";
  const emergency = def.kind === "gameplay" && enabled === false && effectiveFrom === todayStr;
  if (emergency && cleanNote.length < 3) throw new Error("emergency off needs a reason note");
  if (def.kind === "gameplay" && !emergency) {
    const earliest = sameDayBypass() ? todayStr : addDays(todayStr, GAMEPLAY_MIN_LEAD_DAYS);
    if (effectiveFrom < earliest) {
      throw new Error(
        `gameplay rows must start on or after ${earliest} (scheduled ahead). Only a row that turns a switch OFF may start today.`,
      );
    }
  } else if (def.kind !== "gameplay" && effectiveFrom < todayStr) {
    throw new Error(`rows cannot start before today (${todayStr})`);
  }
  const materialized = materializeParams(def, params);
  const hash = paramsHash(materialized);
  const id = store.insertFlagVersion({
    key,
    effectiveFrom,
    enabled,
    params: JSON.stringify(materialized),
    paramsHash: hash,
    note: cleanNote || null,
    emergency,
    actor: String(actor ?? "admin").slice(0, 80),
    createdAt: now,
  });
  return { id, key, from: effectiveFrom, enabled, params: materialized, hash, note: cleanNote || null, emergency };
}

/**
 * Arm creator preview: `flags` is `{ key: { enabled, params? } }`. Appends a
 * row; the newest row wins. Max CREATOR_PREVIEW_MAX_HOURS.
 */
export function armCreatorPreview({ flags, hours, note, actor }, now = Date.now()) {
  const registry = loadRegistry();
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 1 || hours > CREATOR_PREVIEW_MAX_HOURS) {
    throw new Error(`hours must be between 1 and ${CREATOR_PREVIEW_MAX_HOURS}`);
  }
  if (!isPlainObject(flags) || Object.keys(flags).length === 0) throw new Error("pick at least one switch");
  const out = {};
  for (const [key, v] of Object.entries(flags)) {
    const def = registry.flags[key];
    if (!def) throw new Error(`unknown flag key: ${key}`);
    if (!isPlainObject(v) || typeof v.enabled !== "boolean") throw new Error(`flag ${key} needs enabled true/false`);
    out[key] = { enabled: v.enabled, params: materializeParams(def, v.params) };
  }
  const expiresAt = now + Math.round(hours * 3600 * 1000);
  const id = store.insertCreatorPreview({
    flags: JSON.stringify(out),
    expiresAt,
    actor: String(actor ?? "admin").slice(0, 80),
    note: typeof note === "string" ? note.slice(0, 500) : null,
    createdAt: now,
  });
  return { id, flags: out, expiresAt };
}

/** Disarm: append a row that expires immediately. */
export function disarmCreatorPreview(actor, now = Date.now()) {
  store.insertCreatorPreview({
    flags: "{}",
    expiresAt: now,
    actor: String(actor ?? "admin").slice(0, 80),
    note: "disarm",
    createdAt: now,
  });
}

/** The armed preview, or null when none/expired/disarmed. */
export function activeCreatorPreview(now = Date.now()) {
  const row = store.latestCreatorPreview();
  if (!row || row.expires_at <= now) return null;
  const flags = JSON.parse(row.flags);
  if (Object.keys(flags).length === 0) return null;
  return { flags, expiresAt: row.expires_at };
}

/** GET /api/admin/flags body. */
export function adminFlagsView(todayStr, now = Date.now()) {
  const registry = loadRegistry();
  const tomorrow = addDays(todayStr, 1);
  const flags = {};
  for (const [key, def] of Object.entries(registry.flags)) {
    const rows = rowsForKey(key);
    const meta = new Map(store.listFlagVersions(key).map((r) => [r.id, r]));
    const view = (d) => {
      const r = resolveFlag(key, d, rows, registry);
      return { versionId: r.versionId, enabled: r.enabled, hash: r.hash };
    };
    flags[key] = {
      kind: def.kind,
      area: def.area,
      description: def.description,
      default: def.default,
      bounds: def.bounds,
      today: view(todayStr),
      tomorrow: view(tomorrow),
      next: rows.find((r) => r.from > tomorrow) ?? null,
      history: rows
        .map((r) => ({ ...r, note: meta.get(r.id)?.note ?? null, actor: meta.get(r.id)?.actor ?? null }))
        .reverse(),
    };
  }
  return {
    schema: registry.schema,
    today: todayStr,
    sameDayBypass: sameDayBypass(),
    minLeadDays: GAMEPLAY_MIN_LEAD_DAYS,
    flags,
    creatorPreview: activeCreatorPreview(now),
  };
}
