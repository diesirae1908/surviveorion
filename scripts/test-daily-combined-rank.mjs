/**
 * Regression coverage for the 2026-08-18 combined-daily-rank bug: Lucas's
 * screenshot showed the lobby's "today's leader" hint (desktop-only daily
 * board) naming a DIFFERENT, LOWER-scoring pilot than TODAY'S BOARD #1
 * (the combined-across-devices daily board), and the game-over screen's
 * `dailyRank`/`nextAbove` could do the same thing, since score-submit was
 * computing them on the per-device daily board / world all-time board
 * instead of the combined daily board. See JOURNAL.md and server/db.mjs's
 * `nextAboveCombinedDaily` doc comment for the fix.
 *
 * No HTTP server, no real DB file: ORION_DB is set to an in-memory SQLite
 * instance before server/db.mjs is imported (same pattern as
 * test-server-daily-history.mjs).
 * Run: node scripts/test-daily-combined-rank.mjs
 */
process.env.ORION_DB = ":memory:";

const {
  db,
  createUser,
  dailyLeaderboardCombined,
  dailyRankCombined,
  rankOf,
  nextAbove,
  nextAboveCombinedDaily,
  nextWingmateAboveCombinedDaily,
  requestFriend,
  acceptFriend,
} = await import("../server/db.mjs");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

/** Bypasses insertScore's Date.now() stamp so tie-break ordering is deterministic. */
function insertRawScore({ userId, score, mode = "desktop", gameMode = "classic", dailyDate = null, createdAt }) {
  db.prepare(
    `INSERT INTO scores (user_id, score, time_survived, kills, max_multiplier, mode, game_mode, daily_date, created_at)
     VALUES (?, ?, 60, 10, 2, ?, ?, ?, ?)`,
  ).run(userId, score, mode, gameMode, dailyDate, createdAt);
}

// --- reproduce the exact screenshot shape ---
// Lucaccino: phone (touch), 1,014,630, the true combined leader.
// Butt sniffer: desktop, 627,124, the desktop-only leader (what the buggy
// hint/rank showed instead).
// A third, lower-scoring desktop pilot ("Rookie") is the one submitting a
// Daily Patrol run and reading dailyRank/nextAbove back, the field Lucas
// saw chasing the wrong name on the game-over screen.
const DATE = "2026-08-18";
const lucaccino = createUser({ callsign: "Lucaccino" });
const buttSniffer = createUser({ callsign: "Butt sniffer" });
const rookie = createUser({ callsign: "Rookie" });

insertRawScore({ userId: lucaccino.id, score: 1_014_630, mode: "touch", dailyDate: DATE, createdAt: 1000 });
insertRawScore({ userId: buttSniffer.id, score: 627_124, mode: "desktop", dailyDate: DATE, createdAt: 2000 });
insertRawScore({ userId: rookie.id, score: 50_000, mode: "desktop", dailyDate: DATE, createdAt: 3000 });

// --- TODAY'S BOARD / lobby hint data source: the combined board's #1 must
// be the phone score, not the desktop-only leader. ---
{
  const combined = dailyLeaderboardCombined({ dailyDate: DATE, limit: 50 });
  check(
    "combined daily board #1 is the phone score (1,014,630), not desktop",
    combined[0]?.userId === lucaccino.id && combined[0]?.best === 1_014_630,
    `top=${combined[0]?.callsign} ${combined[0]?.best}`,
  );
}

// --- Sanity: the OLD per-device desktop board's #1 is genuinely different
// (this is what fillDailyHint used to read, confirms the bug is real, not
// hypothetical). ---
{
  const desktopOnly = rankOf(buttSniffer.id, { mode: "desktop", dailyDate: DATE });
  check(
    "desktop-only board: Butt sniffer ranks #1 on desktop alone (the old, wrong hint source)",
    desktopOnly === 1,
  );
}

// --- Game-over dailyRank: Rookie's rank must be computed on the combined
// board (3rd, behind both Lucaccino and Butt sniffer), not the per-device
// desktop board (where Rookie would rank 2nd, behind only Butt sniffer). ---
{
  const combinedRank = dailyRankCombined(rookie.id, DATE);
  check(
    "dailyRank (combined): Rookie ranks #3 on the combined board",
    combinedRank?.rank === 3,
    `rank=${combinedRank?.rank}`,
  );
  const perDeviceRank = rankOf(rookie.id, { mode: "desktop", dailyDate: DATE });
  check(
    "sanity: the OLD per-device rank would have said #2 (wrong board)",
    perDeviceRank === 2,
  );
}

// --- Game-over nextAbove (gap-to-goal): the nearest target must be found
// across EVERY device on today's board. A closer phone score sitting
// between Rookie and the desktop leader must win, the OLD per-device
// nextAbove(mode='desktop') can never see a touch-mode row at all, so it
// would skip straight past it to the farther desktop name. ---
{
  const phoneChaser = createUser({ callsign: "PhoneChaser" });
  insertRawScore({ userId: phoneChaser.id, score: 100_000, mode: "touch", dailyDate: DATE, createdAt: 3500 });

  const target = nextAboveCombinedDaily(rookie.id, DATE);
  check(
    "nextAbove (combined daily): nearest target found across devices (phone), not the desktop-only leader",
    target?.callsign === "PhoneChaser" && target?.score === 100_000,
    `target=${target?.callsign} ${target?.score}`,
  );

  const perDeviceTarget = nextAbove(rookie.id, "desktop", "classic");
  check(
    "sanity: the OLD per-device/world nextAbove can't see the phone score at all",
    perDeviceTarget?.callsign !== "PhoneChaser",
    `target=${perDeviceTarget?.callsign} ${perDeviceTarget?.score}`,
  );
}

// --- World all-time nextAbove must stay untouched for non-daily context,
// confirms this fix didn't change world-board semantics. Fresh users, no
// daily_date at all, so nothing here overlaps the daily setup above. ---
{
  const worldLow = createUser({ callsign: "WorldLow" });
  const worldHigh = createUser({ callsign: "WorldHigh" });
  insertRawScore({ userId: worldLow.id, score: 10_000, mode: "desktop", gameMode: "classic", createdAt: 4000 });
  insertRawScore({ userId: worldHigh.id, score: 20_000, mode: "desktop", gameMode: "classic", createdAt: 4100 });
  const worldTarget = nextAbove(worldLow.id, "desktop", "classic");
  check(
    "world all-time nextAbove (non-daily) is untouched by this fix",
    worldTarget?.callsign === "WorldHigh" && worldTarget?.score === 20_000,
    `target=${worldTarget?.callsign} ${worldTarget?.score}`,
  );
}

// --- No daily run at all today -> combined nextAbove/rank are null, not a
// stale or bogus value. ---
{
  const bench = createUser({ callsign: "Bench" });
  check("nextAboveCombinedDaily is null with no daily run today", nextAboveCombinedDaily(bench.id, DATE) === null);
  check("dailyRankCombined is null with no daily run today", dailyRankCombined(bench.id, DATE) === null);
}

// --- Wingmate variant follows the same combined scoping (not exercised by
// the screenshot itself, but the same class of bug, see AGENTS.md's
// "wingmate preferred" gap-to-goal note). ---
{
  requestFriend(rookie.id, lucaccino.id);
  acceptFriend(lucaccino.id, rookie.id);
  const wingTarget = nextWingmateAboveCombinedDaily(rookie.id, DATE);
  check(
    "wingmate variant also resolves on the combined daily board",
    wingTarget?.callsign === "Lucaccino" && wingTarget?.score === 1_014_630,
    `target=${wingTarget?.callsign} ${wingTarget?.score}`,
  );
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
