/**
 * Daily Orders + Pilot Ladder, server side (WS-O1). Spawns the real server on
 * a temp SQLite file. Covers: attempts 1 to 3 credit and a 4th does not;
 * archive / Classic / anonymous / non-today never earn; implausible counters
 * are rejected (score still 200); duplicates ignored; merit at award time;
 * cosmetics gate; board rows and the profile carry `ladder` while `rank`
 * keeps its shape; the switch off adds no new field anywhere.
 * Run: node scripts/test-server-orders.mjs
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orion-orders-"));
const dbPath = path.join(tmp, "orion.db");
process.env.ORION_DB = dbPath;
const ADMIN_KEY = "test-admin-key-" + crypto.randomBytes(6).toString("hex");

const store = await import("../server/db.mjs");
const { patrolDateStr } = await import("../server/patrolDate.mjs");
const lib = await import("../server/orders.mjs");

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
const yesterday = addDays(today, -1);

const mkUser = (callsign, role) => {
  const u = store.createUser({ callsign, country: "CA" });
  if (role) store.setUserRole(u.id, role);
  const token = crypto.randomBytes(24).toString("hex");
  store.createSession(u.id, token);
  return { id: u.id, token, callsign };
};
const freeP = mkUser("FreePilot");
const freeQ = mkUser("FreeQ");
const goldP = mkUser("GoldPilot", "admin");

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
    s.on("error", reject);
  });

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(here, "..", "server", "index.mjs")], {
    env: { ...process.env, ORION_DB: dbPath, PORT: String(port), ORION_SERVE_DIST: "", ORION_ADMIN_KEY: ADMIN_KEY, ORION_FLAGS_SAME_DAY: "1" },
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

const run = (over = {}) => ({
  score: 100,
  timeSurvived: 20,
  kills: 10,
  maxMultiplier: 2,
  mode: "desktop",
  daily: true,
  ...over,
});
const NEW_KEYS = ["ladder", "cosmetics", "ordersToday", "orders"];
const hasNew = (o) => NEW_KEYS.some((k) => k in (o ?? {}));

// The pool the test flies: one entry per tier, low targets.
//   easy survive-30 (15 s), medium graze-40 (20 grazes), hard kills-250 (120 kills)
const onlyPool = (extra = {}) => {
  const ids = lib.ORDER_CATALOG.map((o) => o.id);
  const pool = Object.fromEntries(ids.map((id) => [id, { on: false }]));
  pool["survive-30"] = { on: true, target: 15 };
  pool["graze-40"] = { on: true, target: 20 };
  pool["kills-250"] = { on: true, target: 120 };
  return { meritEasy: 5, meritMedium: 10, meritHard: 20, pool, ...extra };
};

let srv;
try {
  srv = await startServer();
  const { call } = srv;

  // ---- switch OFF (fresh registry default): no new fields anywhere ----
  const off1 = await call("POST", "/api/scores", { token: freeP.token, body: run({ orderStats: { grazes: 30 } }) });
  check("orders off: score 200 and no `orders` field", off1.status === 200 && !("orders" in off1.body), JSON.stringify(off1.body));
  const offMe = await call("GET", "/api/me", { token: freeP.token });
  check("orders off: /api/me has no ladder, cosmetics or ordersToday", offMe.status === 200 && !hasNew(offMe.body));
  const offBoard = await call("GET", "/api/leaderboard/daily?mode=all");
  check("orders off: board rows carry no ladder", offBoard.status === 200 && offBoard.body.entries.length > 0 && offBoard.body.entries.every((e) => !("ladder" in e)));
  const offProf = await call("GET", `/api/players/${freeP.callsign}`);
  check("orders off: profile has no ladder", offProf.status === 200 && !("ladder" in offProf.body));
  const offPatch = await call("PATCH", "/api/me", { token: freeP.token, body: { cosmetics: { trail: "hull" } } });
  check("orders off: cosmetics PATCH refused", offPatch.status === 400);
  check("orders off: nothing credited", (await peek(`SELECT COUNT(*) AS c FROM order_completions`))[0].c === 0);
  // FreePilot has now filed 1 daily score today; reset the budget by using fresh users below.

  // ---- switch ON ----
  const row = (params) => ({ key: "orders", enabled: true, effectiveFrom: today, params });
  const post1 = await call("POST", "/api/admin/flags", { admin: true, body: row(onlyPool()) });
  check("orders row accepted for today (staging bypass)", post1.status === 200, JSON.stringify(post1.body));

  // Q (free): attempts 1 and 2 fly short, attempt 3 completes everything.
  const q1 = await call("POST", "/api/scores", { token: freeQ.token, body: run({ timeSurvived: 5, kills: 2, orderStats: { grazes: 1 } }) });
  check("on: block present with nothing done on a short run", q1.status === 200 && q1.body.orders && q1.body.orders.done.length === 0 && q1.body.orders.new.length === 0 && q1.body.orders.ladder.merit === 0 && q1.body.orders.ladder.tier === 0, JSON.stringify(q1.body.orders));
  const q2 = await call("POST", "/api/scores", { token: freeQ.token, body: run({ timeSurvived: 5, kills: 2 }) });
  check("on: attempt 2 credits nothing", q2.status === 200 && q2.body.orders.done.length === 0);
  const q3 = await call("POST", "/api/scores", { token: freeQ.token, body: run({ timeSurvived: 30, kills: 150, orderStats: { grazes: 25 } }) });
  check("attempt 3 credits all three orders", q3.status === 200 && q3.body.orders.new.length === 3 && q3.body.orders.ladder.merit === 35, JSON.stringify(q3.body.orders));
  check("merit 35 is tier 2 (Tribune), tierUp true", q3.body.orders.ladder.tier === 2 && q3.body.orders.ladder.tierUp === true);
  const q4 = await call("POST", "/api/scores", { token: freeQ.token, body: run({ timeSurvived: 30, kills: 150, orderStats: { grazes: 25 } }) });
  check("free pilot's 4th daily score is blocked (429), as before", q4.status === 429);
  const meQ = await call("GET", "/api/me", { token: freeQ.token });
  check("/api/me: ladder, cosmetics and ordersToday", meQ.body.ladder?.merit === 35 && meQ.body.ladder.tier === 2 && meQ.body.ordersToday?.date === today && meQ.body.ordersToday.done.length === 3 && typeof meQ.body.cosmetics === "object");

  // G (Gold/admin, unlimited attempts): attempts 1-3 fail the hard order, the 4th meets it and does NOT credit.
  for (let i = 0; i < 3; i++) await call("POST", "/api/scores", { token: goldP.token, body: run({ timeSurvived: 5, kills: 2 }) });
  const g4 = await call("POST", "/api/scores", { token: goldP.token, body: run({ timeSurvived: 30, kills: 150, orderStats: { grazes: 25 } }) });
  check("4th attempt of a Gold pilot is accepted but earns no orders", g4.status === 200 && g4.body.orders.new.length === 0 && g4.body.orders.done.length === 0);
  check("same Free = Gold: attempts 1-3 credit for Gold too", await (async () => {
    const g = mkUser("GoldTwo", "admin");
    const r = await call("POST", "/api/scores", { token: g.token, body: run({ timeSurvived: 30, kills: 150, orderStats: { grazes: 25 } }) });
    return r.body.orders?.new.length === 3;
  })());

  // Not credited: archive, Classic, anonymous, non-today dailyDate.
  const arch = mkUser("ArchivePilot", "admin");
  const a1 = await call("POST", "/api/scores", { token: arch.token, body: run({ dailyDate: yesterday, timeSurvived: 30, kills: 150, orderStats: { grazes: 25 } }) });
  check("archive (yesterday) daily: 200, no orders block, nothing credited", a1.status === 200 && !("orders" in a1.body));
  const c1 = await call("POST", "/api/scores", { token: arch.token, body: run({ daily: false, timeSurvived: 30, kills: 150, orderStats: { grazes: 25 } }) });
  check("Classic run: no orders block", c1.status === 200 && !("orders" in c1.body));
  const anon = await call("POST", "/api/scores", { body: run({ timeSurvived: 30, kills: 150 }) });
  check("anonymous score: 401, never credited", anon.status === 401);
  const anonRun = await call("POST", "/api/runs", { body: run({ timeSurvived: 30, kills: 150, orderStats: { grazes: 25 } }) });
  check("anonymous /api/runs accepts and ignores orderStats", anonRun.status === 200);
  check("archive pilot earned nothing", (await peek(`SELECT COUNT(*) AS c FROM order_completions WHERE user_id = ?`, arch.id))[0].c === 0);

  // Implausible and missing counters.
  const bad = mkUser("BadCounters");
  const b1 = await call("POST", "/api/scores", { token: bad.token, body: run({ timeSurvived: 20, kills: 2, orderStats: { grazes: 99999 } }) });
  check("implausible grazes: score 200, graze order not credited", b1.status === 200 && !b1.body.orders.done.includes("graze-40"));
  const b2 = await call("POST", "/api/scores", { token: bad.token, body: run({ timeSurvived: 20, kills: 2, orderStats: { grazes: -5 } }) });
  check("negative grazes: rejected, score 200", b2.status === 200 && !b2.body.orders.done.includes("graze-40"));
  const b3 = await call("POST", "/api/scores", { token: bad.token, body: run({ timeSurvived: 20, kills: 2 }) });
  check("missing counters never complete a graze order", b3.status === 200 && !b3.body.orders.done.includes("graze-40"));
  const rej = await peek(`SELECT COUNT(*) AS c FROM order_rejects WHERE daily_date = ?`, today);
  check("two rejected counters were counted", rej[0].c === 2, String(rej[0].c));
  const stats = await call("GET", `/api/admin/stats?date=${today}`, { admin: true });
  check("admin day report: orders picks, completions and rejected", stats.status === 200 && stats.body.day.orders?.on === true && stats.body.day.orders.picks.length === 3 && stats.body.day.orders.rejected === 2 && stats.body.day.orders.completions["kills-250"] >= 1, JSON.stringify(stats.body.day?.orders));

  // Duplicates ignored: a second qualifying run on another attempt adds nothing.
  const dup = mkUser("DupPilot");
  const d1 = await call("POST", "/api/scores", { token: dup.token, body: run({ timeSurvived: 30, kills: 150, orderStats: { grazes: 25 } }) });
  const d2 = await call("POST", "/api/scores", { token: dup.token, body: run({ timeSurvived: 30, kills: 150, orderStats: { grazes: 25 } }) });
  check("duplicate completion ignored; merit unchanged", d1.body.orders.new.length === 3 && d2.body.orders.new.length === 0 && d2.body.orders.ladder.merit === 35 && d2.body.orders.done.length === 3);

  // Merit is the value at award time.
  const early = mkUser("EarlyPilot");
  await call("POST", "/api/scores", { token: early.token, body: run({ timeSurvived: 5, kills: 2 }) });
  const post2 = await call("POST", "/api/admin/flags", { admin: true, body: row(onlyPool({ meritEasy: 1 })) });
  check("second row same day accepted (bypass)", post2.status === 200);
  const e1 = await call("POST", "/api/scores", { token: early.token, body: run({ timeSurvived: 20, kills: 2 }) });
  check("after the merit change an easy completion pays the new value", e1.body.orders.ladder.merit === 1, JSON.stringify(e1.body.orders));
  const keep = await call("GET", "/api/me", { token: freeQ.token });
  check("earlier completions keep their award-time merit (35, not recomputed)", keep.body.ladder.merit === 35);
  const mer = await peek(`SELECT order_id, merit FROM order_completions WHERE user_id = ? ORDER BY order_id`, freeQ.id);
  check("stored merit per row is the value at award time", mer.length === 3 && mer.find((r) => r.order_id === "survive-30").merit === 5);

  // Cosmetics gate (Q is tier 2).
  const eq1 = await call("PATCH", "/api/me", { token: freeQ.token, body: { cosmetics: { trail: "starlight" } } });
  check("unlocked trail equips", eq1.status === 200 && eq1.body.cosmetics.trail === "starlight");
  const eq2 = await call("PATCH", "/api/me", { token: freeQ.token, body: { cosmetics: { trail: "comet" } } });
  check("locked trail is 400", eq2.status === 400);
  const eq3 = await call("PATCH", "/api/me", { token: freeQ.token, body: { cosmetics: { trail: "nope" } } });
  check("unknown trail is 400", eq3.status === 400);
  const eq4 = await call("PATCH", "/api/me", { token: early.token, body: { cosmetics: { trail: "flare" } } });
  check("tier 0 pilot cannot equip tier 1 trail", eq4.status === 400);
  const meQ2 = await call("GET", "/api/me", { token: freeQ.token });
  check("equipped trail shows in /api/me", meQ2.body.cosmetics.trail === "starlight");
  const eq5 = await call("PATCH", "/api/me", { token: freeQ.token, body: { cosmetics: { trail: null } } });
  check("trail null resets to default", eq5.status === 200 && eq5.body.cosmetics.trail === null);

  // Boards and profile.
  const board = await call("GET", "/api/leaderboard/daily?mode=all");
  const rowQ = board.body.entries.find((e) => e.callsign === "FreeQ");
  check("combined board row carries ladder.tier", rowQ?.ladder?.tier === 2, JSON.stringify(rowQ));
  check("bots carry no ladder; no userId leaks", board.body.entries.filter((e) => e.virtual).every((e) => !("ladder" in e)) && board.body.entries.every((e) => !("userId" in e)));
  const boardQ = await call("GET", "/api/leaderboard/daily?mode=all", { token: freeQ.token });
  check("board `me.rank` keeps its shape", typeof boardQ.body.me?.rank === "number" && typeof boardQ.body.me.best === "number" && !("ladder" in boardQ.body.me));
  const boardDev = await call("GET", "/api/leaderboard/daily?mode=desktop");
  check("per-device daily board rows carry ladder too", boardDev.body.entries.some((e) => e.callsign === "FreeQ" && e.ladder?.tier === 2));
  const prof = await call("GET", `/api/players/FreeQ`);
  check("profile: ladder.tier added, `rank` stays the per-mode object", prof.body.ladder?.tier === 2 && typeof prof.body.rank === "object" && "desktop" in prof.body.rank && "touch" in prof.body.rank && "tilt" in prof.body.rank);

  // Turning an entry off on a future date changes only that date.
  const tomorrow = addDays(today, 1);
  const pool2 = onlyPool();
  const futureRow = await call("POST", "/api/admin/flags", { admin: true, body: { key: "orders", enabled: true, effectiveFrom: tomorrow, params: { ...pool2, pool: { ...pool2.pool, "kills-250": { on: false } } } } });
  check("future row accepted", futureRow.status === 200, JSON.stringify(futureRow.body));
  const stT = await call("GET", `/api/admin/stats?date=${tomorrow}`, { admin: true });
  const stN = await call("GET", `/api/admin/stats?date=${today}`, { admin: true });
  check("tomorrow lost its hard pick; today keeps it", stT.body.day.orders.picks.length === 2 && stN.body.day.orders.picks.length === 3);
} catch (e) {
  check("test run completed", false, String(e?.stack ?? e));
} finally {
  srv?.child.kill();
}

process.exit(failures === 0 ? (console.log("\nALL PASS"), 0) : (console.log(`\n${failures} FAILED`), 1));
