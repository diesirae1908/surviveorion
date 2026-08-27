/**
 * Pacific Time patrol-day helpers (client + server must agree).
 * Run: npx tsx scripts/test-patrol-date.ts
 */
import {
  nextPatrolMidnight,
  patrolDateStr,
  patrolDayStartMs,
} from "../src/patrolDate";
import {
  nextPatrolMidnight as nextPatrolMidnightServer,
  patrolDateStr as patrolDateStrServer,
  patrolDayStartMs as patrolDayStartMsServer,
} from "../server/patrolDate.mjs";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const iso = (d: Date) => d.toISOString();

// --- civil date from instant (PDT cases, Aug 2026) ---
check(
  "9 PM PDT Aug 26 is still Aug 26",
  patrolDateStr(new Date("2026-08-27T04:00:00.000Z")) === "2026-08-26",
);
check(
  "midnight PDT Aug 27 is Aug 27",
  patrolDateStr(new Date("2026-08-27T07:00:00.000Z")) === "2026-08-27",
);
check(
  "11:59:59 AM PDT Aug 26 is Aug 26",
  patrolDateStr(new Date("2026-08-26T18:59:59.000Z")) === "2026-08-26",
);

// --- PST (Dec 2026) ---
check(
  "7:59:59 UTC Dec 15 is still Dec 14 PST",
  patrolDateStr(new Date("2026-12-15T07:59:59.000Z")) === "2026-12-14",
);
check(
  "8:00:00 UTC Dec 15 is Dec 15 PST",
  patrolDateStr(new Date("2026-12-15T08:00:00.000Z")) === "2026-12-15",
);

// --- next midnight ---
check(
  "next midnight from 9 PM PDT Aug 26",
  iso(nextPatrolMidnight(new Date("2026-08-27T04:00:00.000Z"))) === "2026-08-27T07:00:00.000Z",
);

// --- day window anchor ---
check(
  "patrolDayStartMs for Aug 27 PDT",
  patrolDayStartMs("2026-08-27") === Date.parse("2026-08-27T07:00:00.000Z"),
);

// --- client/server parity on sample instants ---
const samples = [
  "2026-08-27T04:00:00.000Z",
  "2026-08-27T07:00:00.000Z",
  "2026-12-15T07:59:59.000Z",
  "2026-12-15T08:00:00.000Z",
];
for (const s of samples) {
  const d = new Date(s);
  check(
    `client/server patrolDateStr agree at ${s}`,
    patrolDateStr(d) === patrolDateStrServer(d),
  );
  check(
    `client/server nextPatrolMidnight agree at ${s}`,
    nextPatrolMidnight(d).getTime() === nextPatrolMidnightServer(d).getTime(),
  );
}
check(
  "client/server patrolDayStartMs agree for 2026-08-27",
  patrolDayStartMs("2026-08-27") === patrolDayStartMsServer("2026-08-27"),
);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
