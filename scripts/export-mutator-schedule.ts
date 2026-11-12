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
 *
 * Overlay days (see "overlay selection" in src/mutators.ts): the day's entry
 * stays the LEGACY pick (what older bundles and the switch-off state fly, so
 * older native readers keep showing it) and gains additive flat
 * `overlayId` / `overlayName` / `overlaySubline` strings naming the entry that replaces it while `mutators.overlay` is on.
 * The server decides per date which one to publish and validates against both.
 */
import fs from "node:fs";
import path from "node:path";
import { legacyMutatorsForDate, overlayEntryForDate } from "../src/mutators.ts";
import { MUTATORS_START_DATE } from "../src/mutators.ts";

const UNTIL = "2027-12-31";
// Flat string fields on purpose: the shipped iOS app decodes this file as [String: [[String: String]]],
// so a nested object (or any non-string value) would make every bundled schedule fail to decode.
type Row = { name: string; subline: string; overlayId?: string; overlayName?: string; overlaySubline?: string };
const out: Record<string, Row[]> = {};

function addCivilDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

let d = MUTATORS_START_DATE;
while (d <= UNTIL) {
  const rows: Row[] = legacyMutatorsForDate(d).map((m) => ({ name: m.name, subline: m.subline }));
  const ov = overlayEntryForDate(d);
  if (ov && rows.length > 0) Object.assign(rows[0], { overlayId: ov.id, overlayName: ov.name, overlaySubline: ov.subline });
  out[d] = rows;
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
