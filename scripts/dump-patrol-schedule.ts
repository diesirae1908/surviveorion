/** Print live Daily Patrol picks as JSON for the publishing calendar sync. */
import { getMutatorsForDateStr } from "../src/mutators.ts";
import { DAILY_EPOCH_UTC } from "../src/share.ts";

const MS_PER_DAY = 86_400_000;

function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - DAILY_EPOCH_UTC) / MS_PER_DAY) + 1;
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const from = process.argv[2] ?? "2026-08-29";
const days = Number(process.argv[3] ?? "14");
const out = [];
for (let i = 0; i < days; i++) {
  const date = addDays(from, i);
  const picks = getMutatorsForDateStr(date);
  out.push({
    date,
    dayNumber: dayNumber(date),
    names: picks.map((p) => p.name),
    ids: picks.map((p) => p.id),
    briefings: picks.map((p) => p.briefing),
    sublines: picks.map((p) => p.subline),
  });
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
