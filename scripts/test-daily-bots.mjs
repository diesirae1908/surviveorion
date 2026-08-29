/**
 * Virtual Daily Patrol bot scores: determinism, blocklist safety, time gating.
 * Run: node scripts/test-daily-bots.mjs
 */
process.env.ORION_DB = ":memory:";

const {
  DAILY_BOT_COUNTRIES,
  dailyBotCount,
  allDailyBotsForDate,
  visibleDailyBots,
  generateGamePseudo,
  isUsableGamePseudo,
  hashString,
} = await import("../server/dailyBots.mjs");
const { dailyLeaderboardCombinedWithBots } = await import("../server/dailyBoard.mjs");
const { isNicknameBlocked, BLOCKED_CALLSIGN_PSEUDONYMS } = await import("../server/nickname.mjs");
const { patrolDayStartMs } = await import("../server/patrolDate.mjs");

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const DATE_A = "2026-09-15";
const DATE_B = "2026-09-16";
const dayStartA = patrolDayStartMs(DATE_A);
const endDayA = dayStartA + 86_399_000;

const SAMPLE_DATES = [DATE_A, DATE_B, "2026-10-01", "2026-11-20", "2026-08-29"];
const generated = SAMPLE_DATES.flatMap((d) => allDailyBotsForDate(d));
const names = generated.map((b) => b.callsign);

// --- generator hygiene ---
{
  const CALLSIGN_RE = /^[A-Za-z0-9_\- ]{3,20}$/;
  let blocked = 0;
  const shapeFail = [];
  for (const name of names) {
    if (isNicknameBlocked(name)) blocked++;
    if (!CALLSIGN_RE.test(name)) shapeFail.push(name);
  }
  check("every generated callsign passes the nickname blocklist", blocked === 0, `blocked=${blocked}`);
  check("every generated callsign matches CALLSIGN_RE", shapeFail.length === 0, shapeFail.slice(0, 3).join(","));

  const folded = names.map((n) => n.toLowerCase());
  check("generated callsigns are unique ignoring case, per day", SAMPLE_DATES.every((d) => {
    const dayNames = allDailyBotsForDate(d).map((b) => b.callsign.toLowerCase());
    return new Set(dayNames).size === dayNames.length;
  }));

  const live = new Set(["trip", "jarsco", "luciano", "l33x", "bellend", "haribro", "luciux"]);
  const liveHit = folded.filter((n) => live.has(n));
  check("generator does not reuse live real callsigns", liveHit.length === 0, liveHit.join(","));

  const pseudonymSet = new Set(BLOCKED_CALLSIGN_PSEUDONYMS.map((n) => n.toLowerCase()));
  check("generator does not emit blocked-name pseudonyms", folded.every((n) => !pseudonymSet.has(n)));

  const twoWord = names.filter((n) => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(n));
  const withDigit = names.filter((n) => /\d/.test(n));
  const allCaps = names.filter((n) => /^[A-Z0-9_ -]{3,20}$/.test(n) && /[A-Z]/.test(n) && n === n.toUpperCase());
  const allLower = names.filter((n) => n === n.toLowerCase() && /[a-z]/.test(n));
  const hyphenated = names.filter((n) => n.includes("-"));
  const firstNameish = names.filter((n) => /^[A-Z][a-z]{2,7}$/.test(n));
  check("mix includes two-word callsigns", twoWord.length >= 5, String(twoWord.length));
  check("mix includes digit handles", withDigit.length >= 5, String(withDigit.length));
  check("mix includes ALL CAPS", allCaps.length >= 5, String(allCaps.length));
  check("mix includes lowercase", allLower.length >= 5, String(allLower.length));
  check("mix includes Dofus hyphen mashes", hyphenated.length >= 1, String(hyphenated.length));
  check("mix includes normal first names", firstNameish.length >= 5, String(firstNameish.length));
  check("countries are ISO codes", generated.every((b) => DAILY_BOT_COUNTRIES.includes(b.country)));
  const countries = new Set(generated.map((b) => b.country));
  check("sample spans many countries", countries.size >= 10, String(countries.size));
}

// --- generator itself is usable and rejects junk ---
{
  const used = new Set();
  const rng = mulberry32(hashString("preview-pseudos"));
  const batch = [];
  for (let i = 0; i < 80; i++) batch.push(generateGamePseudo(rng, used));
  check("generateGamePseudo can mint a large unique batch", batch.length === 80 && used.size === 80);
  check("isUsableGamePseudo rejects a reserved live name", !isUsableGamePseudo("Trip", new Set()));
  check("isUsableGamePseudo accepts a Dofus-style mash", isUsableGamePseudo("Xelorix", new Set()));
}

// --- count 20–40 ---
{
  for (const d of SAMPLE_DATES) {
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
console.log("Sample board (2026-08-29):", allDailyBotsForDate("2026-08-29").map((b) => b.callsign).join(", "));
console.log("Sample board (2026-09-15):", allDailyBotsForDate("2026-09-15").map((b) => b.callsign).join(", "));
