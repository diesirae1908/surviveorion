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
  check("admin GET lists the four switches", g0.status === 200 && Object.keys(g0.body.flags).length === 4);
  check("sameDayBypass is false on a production-mode server", g0.body.sameDayBypass === false);
  check("all four resolve off today and tomorrow", Object.values(g0.body.flags).every((f) => !f.today.enabled && !f.tomorrow.enabled));

  // --- day-boundary rule ---
  const od = { key: "overdrive", enabled: true, note: "t" };
  const rToday = await call("POST", "/api/admin/flags", { admin: true, body: { ...od, effectiveFrom: today, params: {} } });
  check("same-day gameplay row is refused", rToday.status === 400 && /scheduled ahead|on or after/.test(rToday.body.error ?? ""), JSON.stringify(rToday.body));
  const rTom = await call("POST", "/api/admin/flags", { admin: true, body: { ...od, effectiveFrom: tomorrow, params: { chargePerGraze: 5, bogus: 1, forms: { pulse: { fanCount: 99, nope: 2 } } } } });
  check("gameplay row for tomorrow is accepted", rTom.status === 200 && rTom.body.ok === true, JSON.stringify(rTom.body));
  const p = rTom.body.row?.params;
  check("params materialized: clamped, unknown dropped, defaults merged", p && p.chargePerGraze === 0.5 && p.bogus === undefined && p.forms.pulse.fanCount === 5 && p.forms.pulse.nope === undefined && p.forms.shield.refund === 0.5 && p.drainDelay === 3);
  const rows = await peek(`SELECT * FROM flag_versions WHERE key = 'overdrive'`);
  check("stored row holds the full materialized params and an 8-hex hash", rows.length === 1 && /^[0-9a-f]{8}$/.test(rows[0].params_hash) && JSON.parse(rows[0].params).forms.missiles.count === 12 && rows[0].actor === "admin");
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
  check("allowlisted account sees creatorPreview with materialized params", meCrew.body.creatorPreview?.flags.overdrive.enabled === true && meCrew.body.creatorPreview.flags.overdrive.params.chargePerGraze === 0.12);
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

  // --- day report mismatch counter ---
  const st = await call("GET", `/api/admin/stats?date=${today}`, { admin: true });
  check("admin day report carries rulesetMismatch", st.status === 200 && typeof st.body.day.rulesetMismatch === "number" || st.body.day?.rulesetMismatch === null, JSON.stringify(st.body.day?.rulesetMismatch));
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
