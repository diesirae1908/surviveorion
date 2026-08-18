/**
 * Regression coverage for the patrol history calendar's server-side query
 * and date validation (no HTTP server, no real DB file: ORION_DB is set to
 * an in-memory SQLite instance before server/db.mjs is imported).
 * Run: node scripts/test-server-daily-history.mjs
 */
process.env.ORION_DB = ":memory:";

const { db, createUser, dailyHistoryForUser } = await import("../server/db.mjs");
const { isValidUtcDateStr } = await import("../server/dateUtils.mjs");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

/** Bypasses insertScore() (which always stamps created_at = Date.now()) so
 * tie-break ordering can be tested deterministically. */
function insertRawScore({ userId, score, timeSurvived, mode = "desktop", gameMode = "classic", dailyDate, createdAt }) {
  db.prepare(
    `INSERT INTO scores (user_id, score, time_survived, kills, max_multiplier, mode, game_mode, daily_date, created_at)
     VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?)`,
  ).run(userId, score, timeSurvived, mode, gameMode, dailyDate, createdAt);
}

const alice = createUser({ callsign: "Alice" });
const bob = createUser({ callsign: "Bob" });

// --- dailyHistoryForUser: one deterministic run per user/day ---

// The bug: MAX(score) and MAX(time_survived) computed independently can
// each come from a different run. Here the higher-score run is the EARLIER,
// SHORTER one; the old query would report this score alongside the other
// run's (longer) time, a pairing that never actually happened.
insertRawScore({ userId: alice.id, score: 5000, timeSurvived: 90, dailyDate: "2026-08-10", createdAt: 1000 });
insertRawScore({ userId: alice.id, score: 3000, timeSurvived: 200, dailyDate: "2026-08-10", createdAt: 2000 });

let rows = dailyHistoryForUser(alice.id, { from: "2026-08-10", to: "2026-08-10" });
check(
  "best/bestTime come from the same (highest-score) run, not independent MAX()es",
  rows[0]?.best === 5000 && rows[0]?.bestTime === 90,
  `best=${rows[0]?.best} bestTime=${rows[0]?.bestTime} (expected best=5000 bestTime=90)`,
);
check("runs count reflects every qualifying run that day", rows[0]?.runs === 2, `runs=${rows[0]?.runs}`);

// Tie-break on equal scores: earliest created_at wins, matching
// dailyLeaderboardCombined's existing convention elsewhere in this file.
insertRawScore({ userId: bob.id, score: 4000, timeSurvived: 50, dailyDate: "2026-08-11", createdAt: 5000 });
insertRawScore({ userId: bob.id, score: 4000, timeSurvived: 120, dailyDate: "2026-08-11", createdAt: 3000 });
rows = dailyHistoryForUser(bob.id, { from: "2026-08-11", to: "2026-08-11" });
check(
  "equal-score tie-break picks the earliest created_at run",
  rows[0]?.bestTime === 120,
  `bestTime=${rows[0]?.bestTime} (expected 120, the earlier of the two tied runs)`,
);

// Dailies are always Classic: an Iron Rain run the same day must not leak in.
insertRawScore({ userId: alice.id, score: 9999, timeSurvived: 999, gameMode: "ironrain", dailyDate: "2026-08-10", createdAt: 1500 });
rows = dailyHistoryForUser(alice.id, { from: "2026-08-10", to: "2026-08-10" });
check(
  "Iron Rain runs are excluded from daily history",
  rows[0]?.best === 5000 && rows[0]?.runs === 2,
  `best=${rows[0]?.best} runs=${rows[0]?.runs}`,
);

// Rank is computed across every pilot's best that day, not just this user's rows.
insertRawScore({ userId: bob.id, score: 6000, timeSurvived: 80, dailyDate: "2026-08-10", createdAt: 4000 });
const bobDay = dailyHistoryForUser(bob.id, { from: "2026-08-10", to: "2026-08-10" });
check("the day's top score ranks #1", bobDay[0]?.rank === 1, `rank=${bobDay[0]?.rank}`);
const aliceDay = dailyHistoryForUser(alice.id, { from: "2026-08-10", to: "2026-08-10" });
check(
  "a second pilot beating that score the same day drops the first to #2",
  aliceDay[0]?.rank === 2,
  `rank=${aliceDay[0]?.rank}`,
);

// A day with nothing completed is simply absent, not a zero-value row: the
// caller (src/dailyHistory.ts) treats "missing" as "missed" and a present
// row with a real score as "completed" - conflating them would misreport.
rows = dailyHistoryForUser(alice.id, { from: "2026-08-12", to: "2026-08-12" });
check("a day with no completed run for this user returns no row at all", rows.length === 0, `rows=${rows.length}`);

// --- isValidUtcDateStr: strict UTC calendar-date validation ---

check("accepts an ordinary valid date", isValidUtcDateStr("2026-08-16"));
check("accepts Feb 29 on a leap year", isValidUtcDateStr("2028-02-29"));
check("rejects Feb 29 on a non-leap year", !isValidUtcDateStr("2026-02-29"));
check("rejects Feb 30 (day overflow into March)", !isValidUtcDateStr("2026-02-30"));
check("rejects month 13", !isValidUtcDateStr("2026-13-01"));
check("rejects month 00", !isValidUtcDateStr("2026-00-10"));
check("rejects day 32", !isValidUtcDateStr("2026-08-32"));
check("rejects day 00", !isValidUtcDateStr("2026-08-00"));
check("rejects a slash-separated date", !isValidUtcDateStr("2026/08/16"));
check("rejects a date with no separators", !isValidUtcDateStr("20260816"));
check("rejects an empty string", !isValidUtcDateStr(""));
check("rejects trailing garbage after a valid date", !isValidUtcDateStr("2026-08-16x"));
check("rejects a non-numeric month segment", !isValidUtcDateStr("2026-0x-16"));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
