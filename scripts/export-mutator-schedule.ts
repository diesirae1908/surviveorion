/**
 * Precompute Daily Patrol mutator name + subline for the iOS Home screen.
 * Uses the live selection functions so the app never reimplements the hash.
 */
import fs from "node:fs";
import path from "node:path";
import { getMutatorsForDateStr } from "../src/mutators.ts";
import { MUTATORS_START_DATE } from "../src/mutators.ts";

const UNTIL = "2027-12-31";
const out: Record<string, Array<{ name: string; subline: string }>> = {};

function addCivilDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

let d = MUTATORS_START_DATE;
while (d <= UNTIL) {
  out[d] = getMutatorsForDateStr(d).map((m) => ({ name: m.name, subline: m.subline }));
  d = addCivilDays(d, 1);
}

const dest = path.resolve(
  new URL(".", import.meta.url).pathname,
  "../ios/App/App/Resources/mutator-schedule.json",
);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${Object.keys(out).length} days to ${dest}`);
