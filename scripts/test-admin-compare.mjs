/**
 * Same-time admin compare window (15-minute snap + YMD shift).
 * Run: node scripts/test-admin-compare.mjs
 */
import {
  COMPARE_SNAP_MS,
  formatPtClock,
  previousDayCompareUntilMs,
  shiftYmd,
} from "../server/dateUtils.mjs";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const SNAP = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// PDT Aug 31 2026: midnight PT = 07:00 UTC. Yesterday is Aug 30.
const todayStart = Date.parse("2026-08-31T07:00:00.000Z");
const todayEnd = todayStart + 24 * HOUR;
const prevStart = Date.parse("2026-08-30T07:00:00.000Z");

function until(nowMs) {
  return previousDayCompareUntilMs({
    todayStart,
    todayEnd,
    prevStart,
    nowMs,
  });
}

check("snap is 15 minutes", COMPARE_SNAP_MS === SNAP);

check(
  "3:22 PM PT clips yesterday through 3:15 PM PT",
  until(Date.parse("2026-08-31T22:22:00.000Z")) === Date.parse("2026-08-30T22:15:00.000Z"),
);

check(
  "exact 3:15 PM PT mark stays on that mark",
  until(Date.parse("2026-08-31T22:15:00.000Z")) === Date.parse("2026-08-30T22:15:00.000Z"),
);

check(
  "3:14 PM PT still sits on the 3:00 PM mark",
  until(Date.parse("2026-08-31T22:14:59.000Z")) === Date.parse("2026-08-30T22:00:00.000Z"),
);

check(
  "clock before today's PT midnight clamps to yesterday midnight",
  until(todayStart - 1) === prevStart,
);

check(
  "clock past today's PT end clamps to a full previous day",
  until(todayEnd + HOUR) === prevStart + (todayEnd - todayStart),
);

check("shiftYmd walks back one civil day", shiftYmd("2026-08-31", -1) === "2026-08-30");
check("shiftYmd crosses a month boundary", shiftYmd("2026-09-01", -1) === "2026-08-31");
check("shiftYmd crosses a year boundary", shiftYmd("2026-01-01", -1) === "2025-12-31");
check("shiftYmd walks forward", shiftYmd("2026-02-28", 1) === "2026-03-01");

check(
  "through-label is the snapped PT clock, not the live minute",
  formatPtClock(Date.parse("2026-08-30T22:15:00.000Z")) === "3:15 PM PT",
);

if (failures) {
  console.error(`\n${failures} admin-compare check(s) failed`);
  process.exit(1);
}
console.log("\nadmin-compare ok");
