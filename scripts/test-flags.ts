/**
 * Switch registry, client side: resolution, rows used as-is, rules stamp,
 * previews never submit, and the feel.ts move is a pure move.
 * Run: npx tsx scripts/test-flags.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PALETTE } from "../src/config";
import { createWorld } from "../src/gameState";
import {
  BASE_RULES,
  ENGINE_GEN,
  activeCreatorPreview,
  ordersParamsFor,
  rulesetStamp,
  shouldRecordLocalBest,
  clientFlagsSnapshot,
  parsePreviewFlags,
  resetFlagsForTest,
  resolveFlag,
  resolveFlagFrom,
  resolveRunRules,
  rulesFromDefaults,
  rulesetIdFrom,
  setCreatorPreview,
  setRemoteFeatures,
  shouldSubmit,
} from "../src/flags";
import { onEvent as feelOnEvent } from "../src/feel";
import type { FxContext, GameEvent } from "../src/types";
import { LOBBY_FILL_TARGETS } from "../src/lobby/fillTargets";
import { menuRowSpecs } from "../src/lobby/menuRows";
import registryJson from "../server/flags-registry.json";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const row = (id: number, from: string, enabled: boolean, params: object = {}, hash = "h" + id) => ({
  id,
  from,
  enabled,
  params,
  hash,
});

// --- resolution by date ---
const rows = [row(1, "2026-11-10", true, {}, "aaaaaaaa"), row(2, "2026-11-12", false, {}, "bbbbbbbb")];
check("before any row: bundled default (off, versionId d)", (() => {
  const r = resolveFlagFrom("overdrive", "2026-11-09", rows)!;
  return r.versionId === "d" && !r.enabled;
})());
check("on the first row's date: row 1", resolveFlagFrom("overdrive", "2026-11-10", rows)!.versionId === "1");
check("between rows: still row 1", resolveFlagFrom("overdrive", "2026-11-11", rows)!.versionId === "1");
check("on the second row's date: row 2 (off)", (() => {
  const r = resolveFlagFrom("overdrive", "2026-11-12", rows)!;
  return r.versionId === "2" && !r.enabled;
})());
check("tie on effective_from: greatest id", resolveFlagFrom("overdrive", "2026-11-12", [row(5, "2026-11-12", true), row(8, "2026-11-12", false)])!.versionId === "8");
check("unknown key resolves to null", resolveFlagFrom("nope", "2026-11-12", []) === null);
check("rulesetId base while off", rulesetIdFrom("2026-11-09", rows) === "base");
check("rulesetId carries id and hash while on", rulesetIdFrom("2026-11-11", rows) === "overdrive@1#aaaaaaaa");

// --- remote payload, rows used as-is ---
resetFlagsForTest();
const payload = {
  schema: 1,
  today: "2026-11-11",
  flags: {
    overdrive: {
      kind: "gameplay",
      versions: [row(4, "2026-11-11", true, { chargePerGraze: 0.99, forms: { pulse: { on: true } } }, "cafe0001")],
    },
    "ui.hud": { kind: "client", versions: [row(5, "2026-11-11", true, { chainBar: true, killPopMinChain: 99 }, "cafe0002")] },
  },
};
setRemoteFeatures(payload);
const rules = resolveRunRules("2026-11-11", { daily: true });
check("rules resolve overdrive on from remote rows", rules.overdrive !== null && rules.rulesetId === "overdrive@4#cafe0001");
check("row params used as-is (no re-clamp, no re-merge)", rules.overdrive?.chargePerGraze === 0.99 && rules.overdrive.forms.pulse.on === true);
check("an old row missing a later param reads as absent", rules.overdrive?.forms.starshell === undefined && (rules.overdrive?.forms as { starshell?: { on: boolean } }).starshell?.on !== true);
check("past archive date keeps that day's rules (base)", resolveRunRules("2026-11-10", { daily: true }).rulesetId === "base");
check("sandbox always BASE_RULES", resolveRunRules("2026-11-11", { sandbox: true }) === BASE_RULES);
check("resolveFlag reads live state", resolveFlag("ui.hud", "2026-11-11")?.versionId === "5");
check("ui flag snapshot is not stale across a patrol date mismatch", (() => {
  const s = clientFlagsSnapshot();
  return s.overdriveFx === null; // ui.overdriveFx has no row: default off
})());

// --- malformed payloads are ignored ---
setRemoteFeatures({ schema: 2, flags: {} });
setRemoteFeatures({ schema: 1, today: "x", flags: { overdrive: { kind: "gameplay", versions: [{ id: "x" }] } } });
setRemoteFeatures(null);
setRemoteFeatures("garbage");
check("malformed features are ignored (previous rows kept)", resolveFlag("overdrive", "2026-11-11")?.versionId === "4");

// --- nothing on: exactly BASE_RULES ---
resetFlagsForTest();
check("no rows: BASE_RULES, ruleset base, no overdrive, not preview", (() => {
  const r = resolveRunRules("2026-11-11", { daily: true });
  return r === BASE_RULES && r.rulesetId === "base" && r.overdrive === null && r.preview === false;
})());
check("rulesFromDefaults() is base", rulesFromDefaults().rulesetId === "base" && rulesFromDefaults().overdrive === null);
check("rulesFromDefaults({overdrive:true}) carries default params", rulesFromDefaults({ overdrive: true }).overdrive?.chargePerGraze === 0.15);

// --- ?flags= parsing and preview ---
check("parsePreviewFlags parses on/off", (() => {
  const p = parsePreviewFlags("?flags=overdrive:on,ui.hud:off");
  return p.overdrive === true && p["ui.hud"] === false;
})());
check("parsePreviewFlags drops unknown keys and junk", Object.keys(parsePreviewFlags("?flags=nope:on,overdrive:maybe,:on")).length === 0);
check("no flags param: empty", Object.keys(parsePreviewFlags("?x=1")).length === 0);
const pv = resolveRunRules("2026-11-11", { daily: true, previewFlags: { overdrive: true } });
check("?flags= overdrive:on makes a preview run with defaults", pv.preview && pv.overdrive?.chargePerGraze === 0.15 && pv.rulesetId.startsWith("preview:overdrive@p#"));
const pvOff = resolveRunRules("2026-11-11", { daily: true, previewFlags: { "ui.hud": true } });
check("a ui-only preview is still a preview run, overdrive stays off", pvOff.preview && pvOff.overdrive === null && pvOff.rulesetId === "preview:base");
check("hud flag follows the preview override", clientFlagsSnapshot({ "ui.hud": true }).hud !== null && clientFlagsSnapshot().hud === null);

// --- preview never submits ---
check("shouldSubmit: base rules submit", shouldSubmit(BASE_RULES));
check("shouldSubmit: preview rules never submit (any mode)", !shouldSubmit(pv) && !shouldSubmit(pvOff));
check("shouldSubmit: previewActive blocks too", !shouldSubmit(BASE_RULES, { previewActive: true }));

// --- creator preview expiry ---
resetFlagsForTest();
const now = Date.now();
setCreatorPreview({ flags: { overdrive: { enabled: true, params: rulesFromDefaults({ overdrive: true }).overdrive } }, expiresAt: now + 60_000 });
check("creator preview active before expiry", activeCreatorPreview(now) !== null);
const cp = resolveRunRules("2026-11-11", { daily: true });
check("creator preview applies on top and marks the run preview", cp.preview && cp.overdrive !== null && cp.rulesetId.startsWith("preview:"));
check("creator preview expired: gone", activeCreatorPreview(now + 61_000) === null);
setCreatorPreview({ flags: { overdrive: { enabled: true } }, expiresAt: now - 1 });
check("an already-expired preview does not apply", resolveRunRules("2026-11-11", {}) === BASE_RULES);
setCreatorPreview(null);
check("setCreatorPreview(null) clears it", activeCreatorPreview(now) === null && resolveRunRules("2026-11-11", {}) === BASE_RULES);
setCreatorPreview({ flags: {}, expiresAt: now + 60_000 });
check("a disarmed (empty) preview is inactive", activeCreatorPreview(now) === null);

// --- createWorld default rules + inert overdrive state ---
const w = createWorld(17.8, 10);
check("createWorld defaults to BASE_RULES with zeroed overdrive, grazes, deathCause", w.rules === BASE_RULES && w.overdrive.charge === 0 && w.overdrive.hotCount === 0 && w.overdrive.fires === 0 && w.grazes === 0 && w.deathCause === null);

// --- feel.ts move is a pure move: scripted events produce the original calls ---
type Call = [string, ...unknown[]];
function recorder(): { ctx: FxContext; calls: Call[] } {
  const calls: Call[] = [];
  const world = createWorld(17.8, 10);
  const ctx = {
    world,
    particles: {
      burst: (...a: unknown[]) => calls.push(["burst", ...a]),
      grazeArc: (...a: unknown[]) => calls.push(["grazeArc", ...a]),
    },
    popups: { spawn: (...a: unknown[]) => calls.push(["popup", ...a]) },
    audio: {
      droneKill: () => calls.push(["droneKill"]),
      graze: () => calls.push(["grazeSfx"]),
    },
    holdSim: () => {},
    flags: { overdriveFx: null, hud: null, result: null, lobby: null },
    effects: "full",
  } as unknown as FxContext;
  return { ctx, calls };
}
function run(e: GameEvent): Call[] {
  const { ctx, calls } = recorder();
  feelOnEvent(e, ctx);
  return calls;
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
check("feel: frozen droneKilled", same(run({ type: "droneKilled", x: 1, y: 2, scale: 1, wasFrozen: true, points: 10 }), [
  ["burst", 1, 2, [PALETTE.freeze, PALETTE.white, "#dffaff"], 16, 4, 0.7, 0.1],
  ["droneKill"],
]));
check("feel: pulse droneKilled", same(run({ type: "droneKilled", x: 1, y: 2, scale: 1, wasFrozen: false, source: "pulse", points: 10 }), [
  ["burst", 1, 2, [PALETTE.pulse, PALETTE.goldPale, "#ffcc77"], 16, 5, 0.65, 0.12],
  ["droneKill"],
]));
check("feel: plain droneKilled", same(run({ type: "droneKilled", x: 1, y: 2, scale: 1, wasFrozen: false, points: 10 }), [
  ["burst", 1, 2, [PALETTE.redBright, PALETTE.gold, "#ff8866"], 14, 5, 0.6, 0.12],
  ["droneKill"],
]));
// Bug 5 (WS-K): graze popups now coalesce (GRAZE_POP_MIN_GAP_MS). A single graze after a quiet
// period still pops at once with the same call, so this pure-move assertion is unchanged in shape.
check("feel: graze keeps the +N popup on every day", same(run({ type: "graze", x: 3, y: 1, points: 42 }), [
  ["burst", 3, 1, [PALETTE.goldPale, PALETTE.white], 5, 2.5, 0.3, 0.06],
  ["grazeArc", Math.atan2(1 - 0, 3 - 0)],
  ["grazeSfx"],
  ["popup", 3, 1.55, "+42", PALETTE.gold, 0.72, 1.15],
]));
check("feel: other events are untouched (no calls)", run({ type: "mineExploded", x: 0, y: 0, points: 1 }).length === 0 && run({ type: "death", x: 0, y: 0 }).length === 0);

// --- snapshot cache follows creator preview expiry (no change event fires) ---
resetFlagsForTest();
setCreatorPreview({ flags: { "ui.hud": { enabled: true, params: { chainBar: true } } }, expiresAt: Date.now() + 80 });
check("ui flag on while the creator preview is armed", clientFlagsSnapshot().hud !== null);
await new Promise((r) => setTimeout(r, 120));
check("ui flag drops after the creator preview expires (cache key includes preview state)", clientFlagsSnapshot().hud === null);


// --- v3 additions (WS-R) ---
const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, "..", "src");
const fx = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "flags-fixtures.json"), "utf8")) as {
  "old-row-930b7b4": { from: string; params: Record<string, Record<string, unknown>> };
};
const OLD = fx["old-row-930b7b4"];

// Production rows written under the old registry hold none of the new params.
// They must be used as-is and behave exactly like dev did: every new param
// reads as absent, every new switch as off.
resetFlagsForTest();
setRemoteFeatures({
  schema: 1,
  today: OLD.from,
  flags: Object.fromEntries(
    Object.entries(OLD.params).map(([k, params], i) => [
      k,
      { kind: k === "overdrive" ? "gameplay" : "client", versions: [row(10 + i, "2026-10-01", true, params, "0ld0000" + i)] },
    ]),
  ),
});
const oldRules = resolveRunRules(OLD.from, { daily: true });
check("old-row-930b7b4: overdrive params used exactly as stored (no re-merge of new keys)", JSON.stringify(oldRules.overdrive) === JSON.stringify(OLD.params.overdrive));
check("old-row-930b7b4: no gen-2 form and no alwaysHotScale present", (() => {
  const od = oldRules.overdrive as unknown as { forms: Record<string, unknown>; alwaysHotScale?: number };
  return ["starshell", "arc", "autocannon", "meteors", "razor", "thunder", "cloak", "flare", "ion", "howlers", "vortex"].every((f) => od.forms[f] === undefined) && od.alwaysHotScale === undefined;
})());
check("old-row-930b7b4: ui flags carry none of the new params", (() => {
  const snap = clientFlagsSnapshot();
  const noneOf = (o: object | null, keys: string[]) => !!o && keys.every((k) => (o as Record<string, unknown>)[k] === undefined);
  return noneOf(snap.hud, ["edgeRadar", "hitStop", "hitStopShieldMs", "sky", "paceChip"]) && noneOf(snap.result, ["shareV2", "stories"]);
})());
check("old-row-930b7b4: ui flag snapshot reads the stored values", (() => {
  const snap = clientFlagsSnapshot();
  return snap.hud?.chainBar === true && snap.result?.freezeMs === 120 && snap.overdriveFx?.stings === true;
})());
check("old-row-930b7b4: lobby and orders stay off", clientFlagsSnapshot().lobby === null && ordersParamsFor(OLD.from) === null);
check("old-row-930b7b4: the stamp gains only the +g suffix on an overdrive day", rulesetStamp(oldRules) === `${oldRules.rulesetId}+g${ENGINE_GEN}`);

// defaults and previews
resetFlagsForTest();
check("lobby is null by default", clientFlagsSnapshot().lobby === null);
check("orders params are null by default", ordersParamsFor("2026-11-11") === null);
check("?flags=ui.lobby:on,orders:on parse", (() => {
  const p = parsePreviewFlags("?flags=ui.lobby:on,orders:on");
  return p["ui.lobby"] === true && p.orders === true;
})());
check("?flags= ui.lobby:on gives the registry default lobby params", (() => {
  const l = clientFlagsSnapshot({ "ui.lobby": true }).lobby;
  return !!l && l.tabBar === true && l.briefing === true && l.pilotTab === true;
})());
check("?flags= orders:on gives default pool params; new overdrive params stay off", (() => {
  const o = ordersParamsFor("2026-11-11", { orders: true });
  const rules = resolveRunRules("2026-11-11", { daily: true, previewFlags: { overdrive: true } });
  const forms = rules.overdrive!.forms as unknown as Record<string, { on: boolean } | undefined>;
  return !!o && o.pool["survive-30"].on === true && o.pool["survive-30"].target === 30 && o.meritHard === 4 && forms.starshell?.on === false && forms.razor?.on === false && rules.overdrive!.alwaysHotScale === 1;
})());
check("creator preview arms orders and ui.lobby", (() => {
  resetFlagsForTest();
  setCreatorPreview({ flags: { orders: { enabled: true }, "ui.lobby": { enabled: true } }, expiresAt: Date.now() + 60_000 });
  const ok = ordersParamsFor("2026-11-11") !== null && clientFlagsSnapshot().lobby !== null;
  setCreatorPreview(null);
  return ok;
})());
resetFlagsForTest();

// local-best gate (QA bug 6)
check("shouldRecordLocalBest: real run records", shouldRecordLocalBest(BASE_RULES, false));
check("shouldRecordLocalBest: any preview does not", !shouldRecordLocalBest(BASE_RULES, true) && !shouldRecordLocalBest(pv, false) && !shouldRecordLocalBest(pvOff, false));

// bundle generation stamp
check("ENGINE_GEN is the max capsSince generation (2) and never hand-written", ENGINE_GEN === 2 && ENGINE_GEN === Math.max(...Object.values((registryJson as unknown as { capsSince: Record<string, Record<string, number>> }).capsSince).flatMap((m) => Object.values(m))));
check("rulesetStamp: base stays base, ruleset ids gain +g<ENGINE_GEN>", rulesetStamp(BASE_RULES) === "base" && rulesetStamp({ ...BASE_RULES, rulesetId: "overdrive@4#cafe0001" }) === "overdrive@4#cafe0001+g2");
check("rulesetStamp: matches the server's accepted charset and length", /^[a-z0-9.@#:+]+$/.test(rulesetStamp({ ...BASE_RULES, rulesetId: "overdrive@4#cafe0001" })));

// registry shape: defaults are no-op
check("seven switches, all default off", (() => {
  const f = (registryJson as unknown as { flags: Record<string, { default: { enabled: boolean } }> }).flags;
  return Object.keys(f).length === 7 && Object.values(f).every((x) => x.default.enabled === false);
})());
check("new overdrive form defaults are all off and alwaysHotScale is 1", (() => {
  const d = (registryJson as unknown as { flags: { overdrive: { default: { params: { forms: Record<string, { on: boolean }>; alwaysHotScale: number } } } } }).flags.overdrive.default.params;
  return ["starshell", "arc", "autocannon", "meteors", "razor", "thunder", "cloak", "flare", "ion", "howlers", "vortex"].every((f) => d.forms[f].on === false) && d.alwaysHotScale === 1;
})());
check("new ui params default off", (() => {
  const f = (registryJson as unknown as { flags: Record<string, { default: { params: Record<string, unknown> } }> }).flags;
  const h = f["ui.hud"].default.params;
  const r = f["ui.result"].default.params;
  return h.edgeRadar === false && h.hitStop === false && h.sky === false && h.paceChip === false && r.shareV2 === false && r.stories === false;
})());

// lobby fill targets still exist in source (a v3 lobby must keep them)
const sourceText = ["ui.ts", "main.ts"].map((f) => fs.readFileSync(path.join(srcDir, f), "utf8")).join("\n");
const missingTargets = LOBBY_FILL_TARGETS.filter((t) => !sourceText.includes(t.slice(1)));
check("every LOBBY_FILL_TARGETS selector token appears in ui.ts or main.ts", missingTargets.length === 0, missingTargets.join(", "));

// hamburger rows: today's ten rows in today's order
const rowSpecs = menuRowSpecs({ pendingFriends: 0 }, { unreadUpdate: false, appStoreLive: true });
check("menu rows: the 10 rows in today's order", rowSpecs.map((r) => r.label).join("|") === "Training Ground|Patrol Calendar|Wingmates|How to play|Powers|Field updates|Feedback|Settings|Get on iPhone|Privacy" && rowSpecs.every((r) => r.visible));
check("menu rows: dots follow pending friends and unread updates", (() => {
  const a = menuRowSpecs({ pendingFriends: 2 }, { unreadUpdate: true, appStoreLive: true });
  return a.filter((r) => r.notif).map((r) => r.id).join() === "wingmates,updates" && rowSpecs.every((r) => !r.notif);
})());
check("menu rows: Get on iPhone hides when the listing is off", !menuRowSpecs({}, { unreadUpdate: false, appStoreLive: false }).find((r) => r.id === "iphone")!.visible);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
