/** Daily Patrol civil-day boundary: midnight America/Los_Angeles (PDT/PST). */

export const PATROL_TIMEZONE = "America/Los_Angeles";

/** YYYY-MM-DD civil date for Daily Patrol at `now` (Pacific Time). */
export function patrolDateStr(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PATROL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Milliseconds Pacific Time lags behind UTC at `now` (7h PDT / 8h PST). */
export function patrolOffsetMs(now = Date.now()) {
  const ms = typeof now === "number" ? now : now.getTime();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PATROL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((ms - wallAsUtc) / 60000) * 60000;
}

/** Epoch ms of midnight PT on `dateStr` (YYYY-MM-DD civil label). */
export function patrolDayStartMs(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) throw new Error(`bad patrol date: ${dateStr}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const off = patrolOffsetMs(Date.UTC(y, mo - 1, d, 12, 0, 0));
  return Date.UTC(y, mo - 1, d, 0, 0, 0) + off;
}

function addCivilDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Next Daily Patrol rollover instant (midnight PT after `now`). */
export function nextPatrolMidnight(now = new Date()) {
  const tomorrow = addCivilDays(patrolDateStr(now), 1);
  return new Date(patrolDayStartMs(tomorrow));
}
