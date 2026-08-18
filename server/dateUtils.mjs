// Small, dependency-free date helpers split out of index.mjs so they can be
// unit-tested (scripts/test-server-daily-history.mjs) without importing the
// whole server module, which opens a DB connection and starts listening as
// a side effect of import.

const DATE_STR_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Strict UTC calendar-date check for a 'YYYY-MM-DD' string. The regex shape
 * alone accepts calendar-impossible strings like 2026-02-30 or 2026-13-01,
 * and Date.parse() isn't a safe follow-up either (engines vary on whether
 * out-of-range components overflow into the next month/day or come back as
 * NaN). Round-tripping through Date.UTC and reading the fields back is the
 * only check that can't be fooled either way: an overflowing day rolls the
 * UTC date into a different month, which then fails the read-back compare.
 */
export function isValidUtcDateStr(s) {
  const m = DATE_STR_RE.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const asDate = new Date(Date.UTC(year, month - 1, day));
  return (
    asDate.getUTCFullYear() === year &&
    asDate.getUTCMonth() === month - 1 &&
    asDate.getUTCDate() === day
  );
}
