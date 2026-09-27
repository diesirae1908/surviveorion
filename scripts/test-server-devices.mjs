/**
 * Privacy-safe device retention (OR-21): hashed UUID, visit_days, d1 cohort,
 * first vs later run medians. In-memory SQLite, same pattern as
 * test-server-daily-history.mjs.
 * Run: node scripts/test-server-devices.mjs
 */
process.env.ORION_DB = ":memory:";

const {
  db,
  hashDeviceId,
  addVisit,
  insertRun,
  getDevice,
  upsertDevice,
  adminStatsForDay,
  ptDateBounds,
} = await import("../server/db.mjs");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const ID_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const ID_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const ID_C = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee3";
const ID_D = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee4";
const HASH_A = hashDeviceId(ID_A);
const HASH_B = hashDeviceId(ID_B);
const HASH_C = hashDeviceId(ID_C);
const HASH_D = hashDeviceId(ID_D);

const today = "2026-09-27";
const yesterday = "2026-09-26";
const weekAgo = "2026-09-20";
const todayBounds = ptDateBounds(today);
const yBounds = ptDateBounds(yesterday);
const wBounds = ptDateBounds(weekAgo);
const tMid = todayBounds.start + 12 * 3600 * 1000;
const yMid = yBounds.start + 12 * 3600 * 1000;
const wMid = wBounds.start + 12 * 3600 * 1000;

// --- hashing ---

check("hashDeviceId is 16 hex chars", /^[0-9a-f]{16}$/.test(HASH_A), `hash=${HASH_A}`);
check("hashDeviceId is not the raw UUID", HASH_A !== ID_A && !ID_A.includes(HASH_A));
check("missing deviceId hashes to null", hashDeviceId(undefined) == null && hashDeviceId(null) == null);
check("garbage deviceId hashes to null", hashDeviceId("not-a-uuid") == null);
check("IP-like strings are rejected", hashDeviceId("1.2.3.4") == null);

// --- visit_days ---

addVisit({ ipHash: "aaaa", deviceHash: HASH_A, at: yMid });
let row = getDevice(HASH_A);
check("first visit creates a device", !!row, `row=${JSON.stringify(row)}`);
check("first visit sets visit_days to 1", row?.visitDays === 1, `visitDays=${row?.visitDays}`);
check("first_seen and last_seen match the visit", row?.firstSeen === yMid && row?.lastSeen === yMid);

addVisit({ ipHash: "aaaa", deviceHash: HASH_A, at: yMid + 3600 * 1000 });
row = getDevice(HASH_A);
check(
  "second visit same PT day does not bump visit_days",
  row?.visitDays === 1,
  `visitDays=${row?.visitDays}`,
);
check("same-day visit updates last_seen", row?.lastSeen === yMid + 3600 * 1000);
check("same-day visit keeps first_seen", row?.firstSeen === yMid);

addVisit({ ipHash: "aaaa", deviceHash: HASH_A, at: tMid });
row = getDevice(HASH_A);
check("next PT day bumps visit_days", row?.visitDays === 2, `visitDays=${row?.visitDays}`);
check("next-day visit updates last_seen", row?.lastSeen === tMid);

// --- missing deviceId (old web clients, iOS 1.0) ---

const beforeDevices = db.prepare(`SELECT COUNT(*) AS c FROM devices`).get().c;
addVisit({ ipHash: "bbbb", path: "daily", at: tMid });
insertRun(null, {
  score: 100,
  timeSurvived: 20,
  kills: 1,
  maxMultiplier: 1,
  mode: "desktop",
  gameMode: "classic",
  platform: "desktop",
  at: tMid,
});
const afterDevices = db.prepare(`SELECT COUNT(*) AS c FROM devices`).get().c;
const anonRun = db.prepare(`SELECT device_hash AS h, run_index AS i, score FROM runs ORDER BY id DESC LIMIT 1`).get();
check("visit without deviceId does not create a device", afterDevices === beforeDevices);
check("run without deviceId stores null hash and null run_index", anonRun?.h == null && anonRun?.i == null);
check("run without deviceId still stores the score", anonRun?.score === 100);

const storedRaw = db
  .prepare(
    `SELECT COUNT(*) AS c FROM visits WHERE ip_hash = ? OR device_hash = ?
     UNION ALL SELECT COUNT(*) AS c FROM runs WHERE device_hash = ?
     UNION ALL SELECT COUNT(*) AS c FROM devices WHERE device_hash = ?`,
  )
  .all(ID_A, ID_A, ID_A, ID_A)
  .reduce((s, r) => s + r.c, 0);
check("raw device UUID is never stored", storedRaw === 0, `hits=${storedRaw}`);

// --- d1 / d7 cohort on three synthetic devices ---
// A: first seen yesterday, returned today (already above).
// B: first seen yesterday, did not return.
// C: first seen today (new).
// D: first seen 7 days ago, returned today (d7).

addVisit({ ipHash: "b", deviceHash: HASH_B, at: yMid });
addVisit({ ipHash: "c", deviceHash: HASH_C, at: tMid });
addVisit({ ipHash: "d", deviceHash: HASH_D, at: wMid });
addVisit({ ipHash: "d", deviceHash: HASH_D, at: tMid });

const day = adminStatsForDay(today);
check("newDevices counts first-seen today (C)", day.retention.newDevices === 1, `new=${day.retention.newDevices}`);
check(
  "returningDevices counts A and D (first seen before today, active today)",
  day.retention.returningDevices === 2,
  `returning=${day.retention.returningDevices}`,
);
check(
  "d1Return is 1/2 (A returned, B did not; C is not in the yesterday cohort)",
  day.retention.d1Return === 0.5,
  `d1=${day.retention.d1Return}`,
);
check(
  "d7Return is 1 (D first seen 7 days ago and visited today)",
  day.retention.d7Return === 1,
  `d7=${day.retention.d7Return}`,
);

// --- first vs later run medians (run_index 0 vs > 0); NULL index excluded ---

insertRun(null, {
  score: 10,
  timeSurvived: 10,
  kills: 0,
  maxMultiplier: 1,
  mode: "desktop",
  gameMode: "classic",
  platform: "desktop",
  deviceHash: HASH_C,
  runIndex: 0,
  at: tMid,
});
insertRun(null, {
  score: 20,
  timeSurvived: 30,
  kills: 0,
  maxMultiplier: 1,
  mode: "desktop",
  gameMode: "classic",
  platform: "desktop",
  deviceHash: HASH_C,
  runIndex: 0,
  at: tMid + 1,
});
insertRun(null, {
  score: 50,
  timeSurvived: 80,
  kills: 0,
  maxMultiplier: 1,
  mode: "desktop",
  gameMode: "classic",
  platform: "desktop",
  deviceHash: HASH_A,
  runIndex: 2,
  at: tMid + 2,
});
insertRun(null, {
  score: 60,
  timeSurvived: 120,
  kills: 0,
  maxMultiplier: 1,
  mode: "desktop",
  gameMode: "classic",
  platform: "desktop",
  deviceHash: HASH_A,
  runIndex: 3,
  at: tMid + 3,
});
// NULL run_index already inserted above (time 20); must not pull first/later medians.

const day2 = adminStatsForDay(today);
check(
  "firstRunMedian uses run_index 0 only (10 and 30 → 10)",
  day2.gameLength.firstRunMedian === 10,
  `first=${day2.gameLength.firstRunMedian}`,
);
check(
  "laterRunMedian uses run_index > 0 only (80 and 120 → 80)",
  day2.gameLength.laterRunMedian === 80,
  `later=${day2.gameLength.laterRunMedian}`,
);

// --- empty / other-day slice still returns the new keys ---

const empty = adminStatsForDay("2026-08-01");
check("empty day still has retention keys at zero", empty.retention.returningDevices === 0 && empty.retention.newDevices === 0 && empty.retention.d1Return === 0 && empty.retention.d7Return === 0);
check("empty day first/later medians are 0", empty.gameLength.firstRunMedian === 0 && empty.gameLength.laterRunMedian === 0);

// --- idempotent additive schema (safe to re-run at boot on prod SQLite) ---

let migrateOk = true;
try {
  db.exec(`ALTER TABLE visits ADD COLUMN device_hash TEXT`);
  migrateOk = false;
} catch {
  // duplicate column, expected on a second boot
}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      device_hash TEXT PRIMARY KEY,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      visit_days INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_visits_device ON visits(device_hash);
    CREATE INDEX IF NOT EXISTS idx_runs_device ON runs(device_hash);
  `);
} catch {
  migrateOk = false;
}
check("second-boot CREATE TABLE/INDEX IF NOT EXISTS is a no-op", migrateOk);
check("duplicate ALTER TABLE ADD COLUMN is caught (existing DBs)", migrateOk);

upsertDevice(HASH_A, tMid);
check("upsert of an existing hash does not reset visit_days", getDevice(HASH_A)?.visitDays === 2);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
