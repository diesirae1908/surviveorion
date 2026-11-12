/**
 * Switch registry, server side: admin routes, day-boundary rule, append-only
 * storage, materialized params, creator preview visibility, ruleset stamp.
 * Spawns the real server on a temp SQLite file (like test-guest-reclaim.mjs).
 * Run: node scripts/test-server-flags.mjs
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orion-flags-"));
const dbPath = path.join(tmp, "orion.db");
process.env.ORION_DB = dbPath;
process.env.CLIP_INBOX_CALLSIGN = "CrewPilot";
const ADMIN_KEY = "test-admin-key-" + crypto.randomBytes(6).toString("hex");

const store = await import("../server/db.mjs");
const { patrolDateStr } = await import("../server/patrolDate.mjs");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const addDays = (d, n) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
};
const today = patrolDateStr();
const tomorrow = addDays(today, 1);

const crew = store.createUser({ callsign: "CrewPilot", country: "CA" });
const crewTok = crypto.randomBytes(24).toString("hex");
store.createSession(crew.id, crewTok);
const other = store.createUser({ callsign: "OtherPilot", country: "CA" });
const otherTok = crypto.randomBytes(24).toString("hex");
store.createSession(other.id, otherTok);

check("no update or delete path exists in the store for flag rows", !Object.keys(store).some((k) => /(update|delete|remove|purge).*(flag|creator)/i.test(k)));
// mismatch counter: 1 matching, 1 differing, 1 old bundle (NULL) on one daily date
const base = { score: 10, timeSurvived: 5, kills: 1, maxMultiplier: 1, mode: "desktop", gameMode: "classic", dailyDate: "2026-11-01" };
store.insertScore(other.id, { ...base, ruleset: "base" });
store.insertScore(other.id, { ...base, ruleset: "overdrive@1#aaaaaaaa" });
store.insertScore(other.id, { ...base, ruleset: null });
const mm = store.rulesetMismatchForDay("2026-11-01", "base");
check("rulesetMismatchForDay counts a differing id and NULL (old bundle), reports NULL apart", mm.total === 3 && mm.mismatch === 2 && mm.legacy === 1, JSON.stringify(mm));

// ruleset health (generation stamp): a +g suffix never makes a matching id a mismatch;
// a Phase 1 stamp (no suffix) is stale only against a day that needs generation 2.
const flagsMod = await import("../server/flags.mjs");
const d2 = addDays(today, 5);
for (const rs of ["overdrive@9#aaaaaaaa", "overdrive@9#aaaaaaaa+g2", null]) store.insertScore(other.id, { ...base, dailyDate: d2, ruleset: rs });
const h2 = store.rulesetHealthForDay(d2, "overdrive@9#aaaaaaaa", 2);
check("health: Phase 1 stamp is stale on a gen-2 day, +g2 and null are not; +g2 matches the id", h2.total === 3 && h2.stale === 1 && h2.legacy === 1 && h2.mismatch === 1, JSON.stringify(h2));
const h1 = store.rulesetHealthForDay(d2, "overdrive@9#aaaaaaaa", 1);
check("health: nothing is stale on a gen-1 day", h1.stale === 0 && h1.mismatch === 1, JSON.stringify(h1));
check("parseStamp: suffix, no suffix, null, junk", (() => {
  const a = flagsMod.parseStamp("overdrive@4#cafe0001+g2");
  const b = flagsMod.parseStamp("overdrive@4#cafe0001");
  return a.base === "overdrive@4#cafe0001" && a.gen === 2 && b.gen === 1 && b.base === "overdrive@4#cafe0001" && flagsMod.parseStamp(null) === null && flagsMod.parseStamp("base").gen === 1;
})());
{
  const reg = flagsMod.loadRegistry();
  const dp = reg.flags.overdrive.default.params;
  const withForm = (name, extra = {}) => ({ ...dp, forms: { ...dp.forms, [name]: { ...dp.forms[name], on: true, ...extra } } });
  check("requiredGenForParams: defaults and old rows need 1", flagsMod.requiredGenForParams(dp) === 1);
  check("requiredGenForParams: a gen-2 form on needs 2; an off form does not", flagsMod.requiredGenForParams(withForm("arc")) === 2 && flagsMod.requiredGenForParams(withForm("vortex")) === 2 && flagsMod.requiredGenForParams({ ...dp, forms: { ...dp.forms, arc: { ...dp.forms.arc, radiusScale: 2 } } }) === 1);
  check("requiredGenForParams: alwaysHotScale above 1 needs 2", flagsMod.requiredGenForParams({ ...dp, alwaysHotScale: 1.2 }) === 2 && flagsMod.requiredGenForParams({ ...dp, alwaysHotScale: 1 }) === 1);
  const rep = flagsMod.materializeParamsReport(reg.flags.overdrive, { chargePerGraze: 5, forms: { pulse: { fanCount: 99 } }, hotRadius: 2 });
  check("materializeParamsReport lists each clamp and nothing else", rep.clamped.length === 2 && rep.clamped.some((c) => c.path === "chargePerGraze" && c.given === 5 && c.stored === 0.5) && rep.clamped.some((c) => c.path === "forms.pulse.fanCount" && c.given === 99 && c.stored === 5) && rep.params.hotRadius === 2);
  check("materializeParams keeps its return shape (params only)", JSON.stringify(flagsMod.materializeParams(reg.flags.overdrive, {})) === JSON.stringify(dp));
}
store.db.close();

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
    s.on("error", reject);
  });

async function startServer(extraEnv = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(here, "..", "server", "index.mjs")], {
    env: { ...process.env, ORION_DB: dbPath, PORT: String(port), ORION_SERVE_DIST: "", ORION_ADMIN_KEY: ADMIN_KEY, ORION_FLAGS_SAME_DAY: "", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server start timeout")), 8000);
    let buf = "";
    child.stdout.on("data", (c) => {
      buf += c.toString();
      if (buf.includes("Orion server on")) {
        clearTimeout(t);
        resolve();
      }
    });
    child.stderr.on("data", (c) => (buf += c.toString()));
    child.on("exit", (code) => {
      clearTimeout(t);
      reject(new Error(`server exited ${code}: ${buf}`));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const call = async (method, url, { body, token, admin } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (admin) headers.Authorization = `Bearer ${ADMIN_KEY}`;
    else if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(origin + url, { method, headers, body: body && method !== "GET" ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { child, call };
}

const peek = async (sql, ...args) => {
  const { DatabaseSync } = await import("node:sqlite");
  const d = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return d.prepare(sql).all(...args);
  } finally {
    d.close();
  }
};

let srv;
try {
  srv = await startServer();
  const { call } = srv;

  // --- 404 without Bearer ---
  for (const [m, u] of [["GET", "/api/admin/flags"], ["POST", "/api/admin/flags"], ["POST", "/api/admin/creator-preview"]]) {
    const r = await call(m, u, { body: {} });
    check(`${m} ${u} is 404 without Bearer`, r.status === 404);
  }
  check("a player session is not admin", (await call("GET", "/api/admin/flags", { token: crewTok })).status === 404);

  // --- definitions + empty state ---
  const g0 = await call("GET", "/api/admin/flags", { admin: true });
  check("admin GET lists the seven switches", g0.status === 200 && Object.keys(g0.body.flags).length === 7 && g0.body.flags["ui.challenge"]?.kind === "client" && "ui.lobby" in g0.body.flags && "orders" in g0.body.flags);
  check("admin GET carries capsSince for overdrive (gen 2 paths) and {} for others", g0.body.flags.overdrive.capsSince["forms.arc"] === 2 && g0.body.flags.overdrive.capsSince.alwaysHotScale === 2 && Object.keys(g0.body.flags["ui.hud"].capsSince).length === 0);
  check("new switches: ui.lobby is client, orders is gameplay/meta", g0.body.flags["ui.lobby"].kind === "client" && g0.body.flags.orders.kind === "gameplay" && g0.body.flags.orders.area === "meta");
  check("sameDayBypass is false on a production-mode server", g0.body.sameDayBypass === false);
  check("all seven resolve off today and tomorrow", Object.values(g0.body.flags).every((f) => !f.today.enabled && !f.tomorrow.enabled));

  // --- day-boundary rule ---
  const od = { key: "overdrive", enabled: true, note: "t" };
  const rToday = await call("POST", "/api/admin/flags", { admin: true, body: { ...od, effectiveFrom: today, params: {} } });
  check("same-day gameplay row is refused", rToday.status === 400 && /scheduled ahead|on or after/.test(rToday.body.error ?? ""), JSON.stringify(rToday.body));
  const rTom = await call("POST", "/api/admin/flags", { admin: true, body: { ...od, effectiveFrom: tomorrow, params: { chargePerGraze: 5, bogus: 1, forms: { pulse: { fanCount: 99, nope: 2 } } } } });
  check("gameplay row for tomorrow is accepted", rTom.status === 200 && rTom.body.ok === true, JSON.stringify(rTom.body));
  check("the save response lists what was clamped", (rTom.body.row?.clamped ?? []).some((c) => c.path === "chargePerGraze" && c.given === 5 && c.stored === 0.5) && rTom.body.row.clamped.some((c) => c.path === "forms.pulse.fanCount" && c.given === 99 && c.stored === 5));
  const p = rTom.body.row?.params;
  check("params materialized: clamped, unknown dropped, defaults merged", p && p.chargePerGraze === 0.5 && p.bogus === undefined && p.forms.pulse.fanCount === 5 && p.forms.pulse.nope === undefined && p.forms.shield.refund === 0.5 && p.drainDelay === 3);
  const rows = await peek(`SELECT * FROM flag_versions WHERE key = 'overdrive'`);
  check("stored row holds the full materialized params and an 8-hex hash", rows.length === 1 && /^[0-9a-f]{8}$/.test(rows[0].params_hash) && JSON.parse(rows[0].params).forms.missiles.count === 12 && rows[0].actor === "admin");
  // orders: gameplay-kind, so same-day ON is refused in production mode, tomorrow works
  const ordToday = await call("POST", "/api/admin/flags", { admin: true, body: { key: "orders", enabled: true, effectiveFrom: today, params: {} } });
  check("orders same-day ON is refused in production mode", ordToday.status === 400, JSON.stringify(ordToday.body));
  const ordTom = await call("POST", "/api/admin/flags", { admin: true, body: { key: "orders", enabled: true, effectiveFrom: tomorrow, params: { meritHard: 99, pool: { "survive-30": { target: 5 } } } } });
  check("orders row for tomorrow is accepted and clamped to its bounds", ordTom.status === 200 && ordTom.body.row.params.meritHard === 20 && ordTom.body.row.params.pool["survive-30"].target === 15 && ordTom.body.row.params.pool["kills-250"].target === 250, JSON.stringify(ordTom.body));
  const rClient = await call("POST", "/api/admin/flags", { admin: true, body: { key: "ui.hud", enabled: true, effectiveFrom: today, params: { killPopMinChain: 500 } } });
  check("client row may start today (clamped)", rClient.status === 200 && rClient.body.row.params.killPopMinChain === 20);
  const rBadType = await call("POST", "/api/admin/flags", { admin: true, body: { key: "ui.hud", enabled: true, effectiveFrom: today, params: { chainBar: "yes" } } });
  check("wrong param type is refused", rBadType.status === 400);
  const rUnknown = await call("POST", "/api/admin/flags", { admin: true, body: { key: "nope", enabled: true, effectiveFrom: today } });
  check("unknown key is refused", rUnknown.status === 400);
  const rBadDate = await call("POST", "/api/admin/flags", { admin: true, body: { key: "ui.hud", enabled: true, effectiveFrom: "2026-02-30" } });
  check("impossible date is refused", rBadDate.status === 400);
  const rPast = await call("POST", "/api/admin/flags", { admin: true, body: { key: "ui.hud", enabled: false, effectiveFrom: addDays(today, -3) } });
  check("a past start date is refused", rPast.status === 400);

  // --- append-only: no update/delete routes ---
  check("PUT and DELETE on flags are 404", (await call("PUT", "/api/admin/flags", { admin: true, body: {} })).status === 404 && (await call("DELETE", "/api/admin/flags", { admin: true })).status === 404);
  const g1 = await call("GET", "/api/admin/flags", { admin: true });
  check("admin view: ui.hud on today, overdrive on tomorrow, history newest first", g1.body.flags["ui.hud"].today.enabled && !g1.body.flags.overdrive.today.enabled && g1.body.flags.overdrive.tomorrow.enabled && g1.body.flags.overdrive.history[0].id === rows[0].id);

  // --- /api/config features ---
  const cfg = await call("GET", "/api/config");
  const feats = cfg.body.features;
  check("/api/config has features with versions", feats && feats.schema === 1 && feats.today === today && feats.flags.overdrive.versions.length === 1 && feats.flags.overdrive.versions[0].from === tomorrow && feats.flags["ui.hud"].kind === "client");
  check("features rows are self-contained (hash + full params)", feats.flags.overdrive.versions[0].hash === rows[0].params_hash && feats.flags.overdrive.versions[0].params.forms.freeze.chainMax === 12);

  // --- creator preview ---
  const meBefore = await call("GET", "/api/me", { token: crewTok });
  check("/api/me has no creatorPreview when none is armed", meBefore.status === 200 && meBefore.body.creatorPreview === undefined);
  const badHours = await call("POST", "/api/admin/creator-preview", { admin: true, body: { flags: { overdrive: { enabled: true } }, hours: 13 } });
  check("hours above 12 are refused", badHours.status === 400);
  const arm = await call("POST", "/api/admin/creator-preview", { admin: true, body: { flags: { overdrive: { enabled: true } }, hours: 2, note: "t" } });
  check("arming appends a row", arm.status === 200 && arm.body.creatorPreview.expiresAt > Date.now());
  const meCrew = await call("GET", "/api/me", { token: crewTok });
  check("allowlisted account sees creatorPreview with materialized params", meCrew.body.creatorPreview?.flags.overdrive.enabled === true && meCrew.body.creatorPreview.flags.overdrive.params.chargePerGraze === 0.15);
  const meOther = await call("GET", "/api/me", { token: otherTok });
  check("other accounts never see it", meOther.status === 200 && meOther.body.creatorPreview === undefined);
  check("creator preview never changes /api/config for everyone", JSON.stringify((await call("GET", "/api/config")).body.features.flags.overdrive.versions.map((v) => v.from)) === JSON.stringify([tomorrow]));
  await call("POST", "/api/admin/creator-preview", { admin: true, body: { disarm: true } });
  const meDis = await call("GET", "/api/me", { token: crewTok });
  check("disarm appends an expired row and hides it", meDis.body.creatorPreview === undefined);
  const cpRows = await peek(`SELECT id FROM creator_preview`);
  check("creator preview rows are only ever appended", cpRows.length === 2);

  // --- ruleset stamp ---
  const goodRun = { score: 100, timeSurvived: 30, kills: 5, maxMultiplier: 2, mode: "desktop", platform: "desktop" };
  const s1 = await call("POST", "/api/scores", { token: otherTok, body: { ...goodRun, ruleset: "base", odHot: 3, odFires: 2 } });
  check("score with ruleset is accepted", s1.status === 200, JSON.stringify(s1.body));
  const s2 = await call("POST", "/api/scores", { token: otherTok, body: { ...goodRun, ruleset: "BAD VALUE!", odHot: -4, odFires: 99999 } });
  check("score with a malformed stamp is still accepted", s2.status === 200, JSON.stringify(s2.body));
  const r1 = await call("POST", "/api/runs", { body: { ...goodRun, ruleset: "overdrive@4#cafe0001", odHot: 1, odFires: 7 } });
  check("anonymous run with ruleset is accepted", r1.status === 200, JSON.stringify(r1.body));
  const sc = await peek(`SELECT ruleset FROM scores WHERE daily_date IS NULL ORDER BY id`);
  check("scores.ruleset written; malformed stamp stored as NULL", sc.length === 2 && sc[0].ruleset === "base" && sc[1].ruleset === null);
  const rn = await peek(`SELECT ruleset, od_hot, od_fires FROM runs ORDER BY id`);
  check("runs.ruleset / od_hot / od_fires written; out-of-range counts NULL", rn.length === 3 && rn[0].ruleset === "base" && rn[0].od_hot === 3 && rn[0].od_fires === 2 && rn[1].ruleset === null && rn[1].od_hot === null && rn[1].od_fires === null && rn[2].ruleset === "overdrive@4#cafe0001" && rn[2].od_fires === 7);

  const s3 = await call("POST", "/api/scores", { token: otherTok, body: { ...goodRun, ruleset: "overdrive@4#cafe0001+g2" } });
  const s4 = await call("POST", "/api/scores", { token: otherTok, body: { ...goodRun, ruleset: "overdrive@4#cafe0001" } });
  check("scores with a +g2 stamp and a Phase 1 stamp are both accepted", s3.status === 200 && s4.status === 200, JSON.stringify([s3.body, s4.body]));
  const gen2Row = await call("POST", "/api/admin/flags", { admin: true, body: { key: "overdrive", enabled: true, effectiveFrom: addDays(today, 5), params: { forms: { arc: { on: true } } }, note: "gen 2 day" } });
  check("a gen-2 overdrive row for a future day is accepted", gen2Row.status === 200, JSON.stringify(gen2Row.body));
  const stGen = await call("GET", `/api/admin/stats?date=${addDays(today, 5)}`, { admin: true });
  check("day report: requiredGen 2 and staleBundle counts the Phase 1 stamp only", stGen.status === 200 && stGen.body.day?.requiredGen === 2 && stGen.body.day?.staleBundle === 1 && stGen.body.day?.rulesetLegacy === 1, JSON.stringify([stGen.body.day?.requiredGen, stGen.body.day?.staleBundle, stGen.body.day?.rulesetLegacy]));
  const stGen1 = await call("GET", `/api/admin/stats?date=${tomorrow}`, { admin: true });
  check("day report: a default-params overdrive day needs generation 1", stGen1.status === 200 && stGen1.body.day?.requiredGen === 1 && stGen1.body.day?.staleBundle === 0, JSON.stringify([stGen1.body.day?.requiredGen, stGen1.body.day?.staleBundle]));
  // --- day report mismatch counter ---
  // --- emergency off: a gameplay row that turns a switch OFF may start today ---
  // an orders emergency off is allowed and flagged, but does not mark the board as mixed-rules
  const ordEm = await call("POST", "/api/admin/flags", { admin: true, body: { key: "orders", enabled: false, effectiveFrom: today, params: {}, note: "orders glitch" } });
  check("orders emergency off today is accepted and flagged emergency", ordEm.status === 200 && ordEm.body.row.emergency === true, JSON.stringify(ordEm.body));
  const stOrd = await call("GET", `/api/admin/stats?date=${today}`, { admin: true });
  check("an orders emergency row does not set day.emergencyOff", stOrd.status === 200 && stOrd.body.day?.emergencyOff === false, JSON.stringify(stOrd.body.day?.emergencyOff));
  const odOn = { key: "overdrive", enabled: true, effectiveFrom: today, params: {}, note: "turn on today" };
  const eOnRefused = await call("POST", "/api/admin/flags", { admin: true, body: odOn });
  check("turning a gameplay switch ON the same day stays refused", eOnRefused.status === 400);
  const eNoNote = await call("POST", "/api/admin/flags", { admin: true, body: { key: "overdrive", enabled: false, effectiveFrom: today, params: {} } });
  check("emergency off without a reason note is refused", eNoNote.status === 400 && /reason/.test(eNoNote.body.error ?? ""), JSON.stringify(eNoNote.body));
  const eOk = await call("POST", "/api/admin/flags", { admin: true, body: { key: "overdrive", enabled: false, effectiveFrom: today, params: {}, note: "bad kill rate" } });
  check("emergency off today is accepted in production mode and flagged", eOk.status === 200 && eOk.body.row.emergency === true, JSON.stringify(eOk.body));
  const eRows = await peek(`SELECT emergency, note FROM flag_versions WHERE id = ?`, eOk.body.row?.id ?? -1);
  check("emergency flag and note stored", eRows.length === 1 && eRows[0].emergency === 1 && eRows[0].note === "bad kill rate");
  const nonEm = await peek(`SELECT COUNT(*) AS c FROM flag_versions WHERE emergency = 1 AND key = 'overdrive'`);
  check("ordinary rows are not flagged emergency", nonEm[0].c === 1);
  const gE = await call("GET", "/api/admin/flags", { admin: true });
  check("admin history shows the emergency row", gE.body.flags.overdrive.history.some((r) => r.emergency === true && r.from === today));
  const st = await call("GET", `/api/admin/stats?date=${today}`, { admin: true });
  check("admin day report: 200, numeric rulesetMismatch, emergencyOff true", st.status === 200 && typeof st.body.day?.rulesetMismatch === "number" && st.body.day.emergencyOff === true, JSON.stringify(st.body.day?.rulesetMismatch));
} catch (e) {
  check("test run completed", false, String(e?.stack ?? e));
} finally {
  srv?.child.kill();
}

// --- staging bypass ---
let srv2;
try {
  srv2 = await startServer({ ORION_FLAGS_SAME_DAY: "1" });
  const g = await srv2.call("GET", "/api/admin/flags", { admin: true });
  check("ORION_FLAGS_SAME_DAY is reported as sameDayBypass", g.status === 200 && g.body.sameDayBypass === true);
  const r = await srv2.call("POST", "/api/admin/flags", { admin: true, body: { key: "overdrive", enabled: true, effectiveFrom: today, params: {} } });
  check("same-day gameplay row allowed under the bypass", r.status === 200, JSON.stringify(r.body));
  const cfg = await srv2.call("GET", "/api/config");
  check("a row effective today now resolves on the server", cfg.body.features.flags.overdrive.versions.some((v) => v.from === today));
} catch (e) {
  check("bypass run completed", false, String(e?.stack ?? e));
} finally {
  srv2?.child.kill();
}

process.exit(failures === 0 ? (console.log("\nALL PASS"), 0) : (console.log(`\n${failures} FAILED`), 1));
