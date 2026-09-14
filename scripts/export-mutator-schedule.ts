/**
 * Precompute Daily Patrol mutator name + subline for the iOS Home screen
 * (bundled in the app) and for the community server's GET /api/patrol-mutators
 * (bundled in the Docker image via `COPY server ./server`, see ../Dockerfile).
 * Uses the live selection functions so neither copy reimplements the hash.
 *
 * Both copies must stay in sync: server/index.mjs's loadMutatorSchedule()
 * only ever finds the iOS Resources copy on a local checkout (relative
 * `../ios/...` path), never inside the production container, which has no
 * ios/ directory at all. Without server/mutator-schedule.json, every date
 * silently falls back to the "CLASSIC" placeholder for any signed-in client
 * (native Patrol Calendar via the server call), even though the local,
 * bundled iOS copy shows the real name. Run this script after any mutator
 * schedule change and commit both output files.
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

const dests = [
  path.resolve(new URL(".", import.meta.url).pathname, "../ios/App/App/Resources/mutator-schedule.json"),
  path.resolve(new URL(".", import.meta.url).pathname, "../server/mutator-schedule.json"),
];
for (const dest of dests) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(`wrote ${Object.keys(out).length} days to ${dest}`);
}
