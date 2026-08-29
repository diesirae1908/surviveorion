/**
 * Virtual Daily Patrol bot scores: determinism, blocklist safety, time gating.
 * Run: node scripts/test-daily-bots.mjs
 */
process.env.ORION_DB = ":memory:";

const {
  DAILY_BOT_CALLSIGNS,
  dailyBotCount,
  allDailyBotsForDate,
  visibleDailyBots,
} = await import("../server/dailyBots.mjs");
const { dailyLeaderboardCombinedWithBots } = await import("../server/dailyBoard.mjs");
const { isNicknameBlocked, BLOCKED_CALLSIGN_PSEUDONYMS } = await import("../server/nickname.mjs");
const { patrolDayStartMs } = await import("../server/patrolDate.mjs");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const DATE_A = "2026-09-15";
const DATE_B = "2026-09-16";
const dayStartA = patrolDayStartMs(DATE_A);
const midDayA = dayStartA + 43_200_000;
const endDayA = dayStartA + 86_399_000;

// --- pool hygiene ---
{
  const pseudonymSet = new Set(BLOCKED_CALLSIGN_PSEUDONYMS.map((n) => n.toLowerCase()));
  let blocked = 0;
  let overlap = 0;
  for (const name of DAILY_BOT_CALLSIGNS) {
    if (isNicknameBlocked(name)) blocked++;
    if (pseudonymSet.has(name.toLowerCase())) overlap++;
  }
  check("every bot callsign passes the nickname blocklist", blocked === 0, `blocked=${blocked}`);
  check("bot pool does not overlap blocked-name pseudonyms", overlap === 0, `overlap=${overlap}`);
  check("bot pool has ~60 names", DAILY_BOT_CALLSIGNS.length >= 55 && DAILY_BOT_CALLSIGNS.length <= 65);
}

// --- count 20–40 ---
{
  for (const d of [DATE_A, DATE_B, "2026-10-01", "2026-11-20"]) {
    const n = dailyBotCount(d);
    check(`bot count for ${d} is 20–40`, n >= 20 && n <= 40, String(n));
  }
}

// --- determinism + adjacent dates differ ---
{
  const a1 = allDailyBotsForDate(DATE_A).map((b) => `${b.callsign}:${b.best}`);
  const a2 = allDailyBotsForDate(DATE_A).map((b) => `${b.callsign}:${b.best}`);
  check("same date yields identical bot set", a1.join("|") === a2.join("|"));
  const b1 = allDailyBotsForDate(DATE_B).map((b) => `${b.callsign}:${b.best}`);
  check("adjacent dates produce different bot sets", a1.join("|") !== b1.join("|"));
}

// --- time gating: early patrol morning < evening ---
{
  const early = visibleDailyBots(DATE_A, dayStartA + 3_600_000);
  const evening = visibleDailyBots(DATE_A, endDayA);
  check("early patrol day shows fewer bots than end of day", early.length < evening.length, `${early.length} vs ${evening.length}`);
  check("end of patrol day shows the full scheduled field", evening.length === dailyBotCount(DATE_A));
}

// --- merged board includes bots with no real scores ---
{
  const board = dailyLeaderboardCombinedWithBots({ dailyDate: DATE_A, limit: 50, nowMs: endDayA });
  check("combined board with no real pilots still has bots", board.length >= 20, `rows=${board.length}`);
  check("combined board tops out at limit", board.length <= 50);
}

// --- public wire shape: no bot userId leaks (matches publicBoardEntry in index.mjs) ---
{
  const toPublic = (e) => {
    const { userId: _u, ...rest } = e;
    if (rest.virtual) rest.virtual = true;
    return rest;
  };
  const board = dailyLeaderboardCombinedWithBots({ dailyDate: DATE_A, limit: 50, nowMs: endDayA }).map(toPublic);
  const wire = JSON.stringify(board);
  const botIdLeak = wire.match(/bot:[^"]+/);
  check("public board JSON has no bot: userId values", !botIdLeak, botIdLeak?.[0] ?? "");
  check(
    "public board rows omit userId",
    board.every((e) => !("userId" in e)),
  );
  check(
    "ghost rows keep virtual:true so the lobby can skip a profile click",
    board.some((e) => e.virtual === true),
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll daily-bot checks passed.");
