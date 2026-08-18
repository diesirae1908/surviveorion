/**
 * Headless unit tests for the patrol history calendar's day-status logic
 * (no DOM needed). Run: npx tsx scripts/test-daily-history.ts
 */
import {
  dayInfoFor,
  daysInMonth,
  leadingPadding,
  maxDateStr,
  monthLabel,
  nextMonthOf,
  prevMonthOf,
  utcDateStr,
  type DayInfoOpts,
} from "../src/dailyHistory";
import type { DailyDayLog } from "../src/save";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const TODAY = "2026-08-20";
const EPOCH = "2026-07-14";

function opts(overrides: Partial<DayInfoOpts> = {}): DayInfoOpts {
  return {
    today: TODAY,
    epochDate: EPOCH,
    signedIn: false,
    local: null,
    server: null,
    ...overrides,
  };
}

// --- basic date boundaries: future / today / before-launch ---

check("a day after today is 'future'", dayInfoFor("2026-08-21", opts()).status === "future");
check("today is 'today'", dayInfoFor(TODAY, opts()).status === "today");
check(
  "a day before the epoch is 'before-launch'",
  dayInfoFor("2026-07-01", opts()).status === "before-launch",
);
check(
  "the epoch day itself is not 'before-launch'",
  dayInfoFor(EPOCH, opts()).status !== "before-launch",
);

// --- signed-out: local log is the only source of truth ---

{
  const withBest: DailyDayLog = { date: "2026-08-15", attemptsUsed: 2, best: { score: 4200, time: 95, rank: null } };
  const info = dayInfoFor("2026-08-15", opts({ local: withBest }));
  check("signed-out + local best -> completed-local-only", info.status === "completed-local-only");
  check("signed-out completed-local-only carries the score", info.score === 4200);
  check(
    "signed-out completed-local-only has no sourceConflict (nothing to conflict with)",
    !info.sourceConflict,
  );
}

{
  const attemptedOnly: DailyDayLog = { date: "2026-08-15", attemptsUsed: 1, best: null };
  check(
    "signed-out + attempts spent, no best -> attempted",
    dayInfoFor("2026-08-15", opts({ local: attemptedOnly })).status === "attempted",
  );
}

{
  const zeroAttempts: DailyDayLog = { date: "2026-08-15", attemptsUsed: 0, best: null };
  check(
    "signed-out + a log entry with zero attempts -> missed",
    dayInfoFor("2026-08-15", opts({ local: zeroAttempts })).status === "missed",
  );
}

check(
  "signed-out + no local record at all -> untracked",
  dayInfoFor("2026-08-15", opts({ local: null })).status === "untracked",
);

// --- signed-in: server is authoritative once it has an opinion ---

{
  const server = { date: "2026-08-15", best: 5000, bestTime: 120, runs: 1, rank: 3 };
  const info = dayInfoFor("2026-08-15", opts({ signedIn: true, server }));
  check("signed-in + server entry -> completed", info.status === "completed");
  check("signed-in completed carries the server's rank", info.rank === 3);
}

check(
  "signed-in + server silence + no local record -> missed (server is authoritative)",
  dayInfoFor("2026-08-15", opts({ signedIn: true, server: null, local: null })).status === "missed",
);

{
  const attemptedOnly: DailyDayLog = { date: "2026-08-15", attemptsUsed: 1, best: null };
  check(
    "signed-in + server silence + local attempt -> attempted",
    dayInfoFor("2026-08-15", opts({ signedIn: true, server: null, local: attemptedOnly })).status === "attempted",
  );
}

{
  // flown before linking this device to the account, or a submission that
  // never reached the server: local remembers a result the account can't see
  const local: DailyDayLog = { date: "2026-08-15", attemptsUsed: 1, best: { score: 3000, time: 60, rank: null } };
  const info = dayInfoFor("2026-08-15", opts({ signedIn: true, server: null, local }));
  check(
    "signed-in + server silence + local best -> completed-local-only, flagged as a conflict",
    info.status === "completed-local-only" && info.sourceConflict === true,
  );
}

{
  // both sources agree: no conflict flag even though a local best exists
  const server = { date: "2026-08-15", best: 5000, bestTime: 120, runs: 1, rank: 3 };
  const local: DailyDayLog = { date: "2026-08-15", attemptsUsed: 1, best: { score: 5000, time: 120, rank: 3 } };
  const info = dayInfoFor("2026-08-15", opts({ signedIn: true, server, local }));
  check("signed-in + matching local and server -> no sourceConflict", !info.sourceConflict);
}

{
  // local and server disagree (e.g. a later, unsynced run beat the server's
  // number): the server's number wins for display, but the mismatch is flagged
  const server = { date: "2026-08-15", best: 5000, bestTime: 120, runs: 1, rank: 3 };
  const local: DailyDayLog = { date: "2026-08-15", attemptsUsed: 2, best: { score: 6100, time: 140, rank: null } };
  const info = dayInfoFor("2026-08-15", opts({ signedIn: true, server, local }));
  check("signed-in + local/server mismatch -> server's score wins", info.score === 5000);
  check("signed-in + local/server mismatch -> flagged as a conflict", info.sourceConflict === true);
}

// --- mutators always resolve regardless of status (the FOMO payoff) ---

check(
  "a missed day still reports its mutator(s)",
  dayInfoFor("2026-08-15", opts({ signedIn: true, server: null, local: null })).mutators.length > 0,
);
check(
  "a future day carries no mutators to leak (nothing decided yet)",
  dayInfoFor("2026-08-21", opts()).mutators.length === 0,
);

// --- calendar grid math ---

check("daysInMonth: August 2026 has 31 days", daysInMonth(2026, 7) === 31);
check("daysInMonth: February 2028 (leap) has 29 days", daysInMonth(2028, 1) === 29);
check("daysInMonth: February 2026 (non-leap) has 28 days", daysInMonth(2026, 1) === 28);

check(
  "utcDateStr round-trips into the expected ISO date",
  utcDateStr(2026, 7, 20) === "2026-08-20",
);

check(
  "leadingPadding matches the weekday of the 1st (Aug 1 2026 is a Saturday)",
  leadingPadding(2026, 7) === 6,
);

check("maxDateStr picks the later of two dates", maxDateStr("2026-07-14", "2026-08-01") === "2026-08-01");
check("maxDateStr is order-independent", maxDateStr("2026-08-01", "2026-07-14") === "2026-08-01");

check(
  "prevMonthOf steps back a month within a year",
  JSON.stringify(prevMonthOf({ year: 2026, month: 7 })) === JSON.stringify({ year: 2026, month: 6 }),
);
check(
  "prevMonthOf wraps across a year boundary",
  JSON.stringify(prevMonthOf({ year: 2026, month: 0 })) === JSON.stringify({ year: 2025, month: 11 }),
);
check(
  "nextMonthOf steps forward a month within a year",
  JSON.stringify(nextMonthOf({ year: 2026, month: 7 })) === JSON.stringify({ year: 2026, month: 8 }),
);
check(
  "nextMonthOf wraps across a year boundary",
  JSON.stringify(nextMonthOf({ year: 2026, month: 11 })) === JSON.stringify({ year: 2027, month: 0 }),
);

check(
  "monthLabel reads as a plain month/year string",
  monthLabel(2026, 7) === "AUGUST 2026",
);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
