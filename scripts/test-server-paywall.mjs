/**
 * Web Gold Patrol paywall funnel: allowlist, rate limit, additive migration,
 * stats aggregation. In-memory SQLite. Checkout/entitlement untouched.
 * Run: node scripts/test-server-paywall.mjs
 */
process.env.ORION_DB = ":memory:";

import http from "node:http";
import { once } from "node:events";

const {
  db,
  hashDeviceId,
  addPaywallEvent,
  addBillingEvent,
  adminStats,
  adminStatsForDay,
  paywallStatsForDay,
  paywallStatsAllTime,
  paywallStatsLast7,
} = await import("../server/db.mjs");
const {
  parsePaywallBody,
  handlePaywallPost,
  PAYWALL_SOURCES,
  PAYWALL_STEPS,
  PAYWALL_RATE_MAX,
} = await import("../server/paywall.mjs");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const ID_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const ID_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const HASH_A = hashDeviceId(ID_A);
const HASH_B = hashDeviceId(ID_B);
const today = "2026-09-27";
const weekAgo = "2026-09-21";
const older = "2026-09-01";

function rateLimitFactory() {
  const buckets = new Map();
  return function rateLimit(key, maxPerMinute) {
    const now = Date.now();
    const bucket = buckets.get(key)?.filter((t) => now - t < 60_000) ?? [];
    if (bucket.length >= maxPerMinute) return false;
    bucket.push(now);
    buckets.set(key, bucket);
    return true;
  };
}

// --- allowlist ---

check("open is a valid step", PAYWALL_STEPS.has("open"));
check("calendar_unlock is a valid source", PAYWALL_SOURCES.has("calendar_unlock"));
check("guest_activate is a valid source", PAYWALL_SOURCES.has("guest_activate"));
check("wingmates is a valid source", PAYWALL_SOURCES.has("wingmates"));
check("archive_day is a valid source", PAYWALL_SOURCES.has("archive_day"));
check("parse rejects missing body", parsePaywallBody(null).error === "invalid source");
check(
  "parse rejects unknown source",
  parsePaywallBody({ source: "evil", step: "open" }).error === "invalid source",
);
check(
  "parse rejects unknown step",
  parsePaywallBody({ source: "wingmates", step: "paid" }).error === "invalid step",
);
check(
  "parse accepts allowlisted pair",
  parsePaywallBody({ source: "lobby_upsell", step: "open" }).source === "lobby_upsell" &&
    parsePaywallBody({ source: "lobby_upsell", step: "open" }).step === "open",
);
check("db insert rejects unknown source", addPaywallEvent({ source: "nope", step: "open", patrolDate: today }) === false);
check("db insert rejects unknown step", addPaywallEvent({ source: "wingmates", step: "nope", patrolDate: today }) === false);
check("billing insert rejects unknown kind", addBillingEvent("refund", today) === false);

const emptyCount = db.prepare(`SELECT COUNT(*) AS c FROM paywall_events`).get().c;
check("rejected inserts did not write rows", emptyCount === 0);

// --- handler allowlist + rate limit ---

const rateLimit = rateLimitFactory();
const inserted = [];
function captureEvent(row) {
  inserted.push(row);
  addPaywallEvent(row);
}

let r = handlePaywallPost({
  body: { source: "hack", step: "open" },
  ip: "1.1.1.1",
  signedIn: false,
  deviceHash: HASH_A,
  patrolDate: today,
  rateLimit,
  addEvent: captureEvent,
});
check("handler 400 on bad source", r.status === 400 && r.json.error === "invalid source");
check("handler 400 did not insert", inserted.length === 0);

r = handlePaywallPost({
  body: { source: "guest_activate", step: "open" },
  ip: "1.1.1.1",
  signedIn: false,
  deviceHash: HASH_A,
  patrolDate: today,
  rateLimit,
  addEvent: captureEvent,
});
check("handler 200 on valid event", r.status === 200 && r.json.ok === true);
check("handler stored source and step", inserted[0]?.source === "guest_activate" && inserted[0]?.step === "open");
check("handler stored guest signedIn=false", inserted[0]?.signedIn === false);

r = handlePaywallPost({
  body: { source: "settings", step: "plan_yearly" },
  ip: "9.9.9.9",
  signedIn: true,
  deviceHash: HASH_B,
  patrolDate: today,
  rateLimit,
  addEvent: captureEvent,
});
check("handler stores signed-in true", r.status === 200 && inserted[1]?.signedIn === true);

const burstLimit = rateLimitFactory();
let limited = 0;
let allowed = 0;
for (let i = 0; i < PAYWALL_RATE_MAX + 5; i++) {
  const out = handlePaywallPost({
    body: { source: "lobby_upsell", step: "open" },
    ip: "8.8.8.8",
    signedIn: false,
    deviceHash: HASH_A,
    patrolDate: today,
    rateLimit: burstLimit,
    addEvent: captureEvent,
  });
  if (out.status === 429) limited++;
  if (out.status === 200) allowed++;
}
check(
  "rate limit allows PAYWALL_RATE_MAX then 429",
  allowed === PAYWALL_RATE_MAX && limited === 5,
  `allowed=${allowed} limited=${limited} max=${PAYWALL_RATE_MAX}`,
);

// --- HTTP integration (same handler + real rateLimit) ---

const httpLimit = rateLimitFactory();
const httpServer = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/api/paywall") {
    res.writeHead(404);
    res.end();
    return;
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body = {};
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const out = handlePaywallPost({
      body,
      ip: req.socket.remoteAddress ?? "http-test",
      signedIn: false,
      deviceHash: hashDeviceId(body.deviceId),
      patrolDate: today,
      rateLimit: httpLimit,
      addEvent: addPaywallEvent,
    });
    const data = JSON.stringify(out.json);
    res.writeHead(out.status, { "Content-Type": "application/json" });
    res.end(data);
  });
});
await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
const { port } = httpServer.address();

async function postPaywall(payload) {
  const res = await fetch(`http://127.0.0.1:${port}/api/paywall`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, json: await res.json() };
}

const httpOk = await postPaywall({
  source: "wingmates",
  step: "open",
  deviceId: ID_A,
});
check("HTTP 200 valid paywall post", httpOk.status === 200 && httpOk.json.ok === true);

const httpBad = await postPaywall({ source: "not-a-source", step: "open" });
check("HTTP 400 unknown source", httpBad.status === 400 && httpBad.json.error === "invalid source");

const httpBadStep = await postPaywall({ source: "wingmates", step: "purchase" });
check("HTTP 400 unknown step", httpBadStep.status === 400 && httpBadStep.json.error === "invalid step");

httpServer.close();
await once(httpServer, "close");

// --- migration idempotency ---

const ddl = `
  CREATE TABLE IF NOT EXISTS paywall_events (
    id INTEGER PRIMARY KEY,
    patrol_date TEXT NOT NULL,
    source TEXT NOT NULL,
    step TEXT NOT NULL,
    signed_in INTEGER NOT NULL DEFAULT 0,
    device_hash TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS billing_events (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    patrol_date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`;
const beforeCols = db.prepare(`PRAGMA table_info(paywall_events)`).all().map((c) => c.name).join(",");
db.exec(ddl);
db.exec(ddl);
const afterCols = db.prepare(`PRAGMA table_info(paywall_events)`).all().map((c) => c.name).join(",");
check("migration CREATE TABLE IF NOT EXISTS is idempotent", beforeCols === afterCols && beforeCols.includes("patrol_date"));
check(
  "paywall_events columns are additive",
  beforeCols.split(",").includes("device_hash") && beforeCols.split(",").includes("signed_in"),
);

const beforeRows = db.prepare(`SELECT COUNT(*) AS c FROM paywall_events`).get().c;
addPaywallEvent({
  source: "calendar_unlock",
  step: "open",
  signedIn: false,
  deviceHash: HASH_A,
  patrolDate: today,
});
const afterRows = db.prepare(`SELECT COUNT(*) AS c FROM paywall_events`).get().c;
check("insert still works after re-running migration", afterRows === beforeRows + 1);

// --- stats aggregation ---

addPaywallEvent({
  source: "guest_activate",
  step: "open",
  signedIn: false,
  deviceHash: HASH_A,
  patrolDate: today,
});
addPaywallEvent({
  source: "guest_activate",
  step: "plan_monthly",
  signedIn: false,
  deviceHash: HASH_A,
  patrolDate: today,
});
addPaywallEvent({
  source: "lobby_upsell",
  step: "open",
  signedIn: true,
  deviceHash: HASH_B,
  patrolDate: today,
});
addPaywallEvent({
  source: "settings",
  step: "open",
  signedIn: true,
  deviceHash: HASH_B,
  patrolDate: weekAgo,
});
addPaywallEvent({
  source: "gameover",
  step: "open",
  signedIn: false,
  deviceHash: HASH_A,
  patrolDate: older,
});
addBillingEvent("checkout_created", today);
addBillingEvent("checkout_completed", today);
addBillingEvent("checkout_created", older);

const day = adminStatsForDay(today);
check("day paywall block exists", !!day.paywall);
check(
  "day unique open devices is 2 (A and B)",
  day.paywall.uniqueOpenDevices === 2,
  `unique=${day.paywall.uniqueOpenDevices}`,
);
check(
  "day signed-in opens is 1 (B lobby)",
  day.paywall.signedInOpens === 1,
  `signedIn=${day.paywall.signedInOpens}`,
);
check(
  "day guest opens counts unsigned opens today",
  day.paywall.guestOpens >= 2,
  `guest=${day.paywall.guestOpens}`,
);
check("day byStep.open is at least 3", (day.paywall.byStep.open ?? 0) >= 3, `open=${day.paywall.byStep.open}`);
check("day bySource.guest_activate present", (day.paywall.bySource.guest_activate ?? 0) >= 2);
check("day checkoutCreated is 1", day.paywall.checkoutCreated === 1, `created=${day.paywall.checkoutCreated}`);
check(
  "day checkoutCompleted is 1",
  day.paywall.checkoutCompleted === 1,
  `completed=${day.paywall.checkoutCompleted}`,
);
check("today settings is plan_yearly only (week-ago open excluded)", (day.paywall.bySource.settings ?? 0) === 1);
const last7 = paywallStatsLast7(today);
check("last7 includes week-ago settings open plus today plan", (last7.bySource.settings ?? 0) === 2);
check("last7 excludes older-than-7 gameover", !last7.bySource.gameover);
check("last7 checkoutCreated is 1 (today only)", last7.checkoutCreated === 1);

const all = paywallStatsAllTime();
check("all-time includes older gameover", (all.bySource.gameover ?? 0) === 1);
check("all-time checkoutCreated is 2", all.checkoutCreated === 2);
check("all-time checkoutCompleted is 1", all.checkoutCompleted === 1);

const rolled = adminStats();
check("adminStats paywall.allTime exists", !!rolled.paywall?.allTime);
check("adminStats paywall.last7 exists", !!rolled.paywall?.last7);
check(
  "adminStats allTime unique devices >= 2",
  rolled.paywall.allTime.uniqueOpenDevices >= 2,
);

const empty = adminStatsForDay("2026-01-01");
check(
  "empty day paywall is zeros",
  empty.paywall.uniqueOpenDevices === 0 &&
    empty.paywall.signedInOpens === 0 &&
    empty.paywall.guestOpens === 0 &&
    empty.paywall.checkoutCreated === 0 &&
    Object.keys(empty.paywall.byStep).length === 0,
);

const storedRaw = db
  .prepare(`SELECT COUNT(*) AS c FROM paywall_events WHERE device_hash = ?`)
  .get(ID_A).c;
check("raw device UUID is never stored on paywall_events", storedRaw === 0);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
