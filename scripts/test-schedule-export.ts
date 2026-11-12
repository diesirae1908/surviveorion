/**
 * The committed schedule export (server/mutator-schedule.json and its iOS copy)
 * against the live selection code, plus the server helpers that read it.
 * Run: npx tsx scripts/test-schedule-export.ts (wired into `npm test`).
 *
 * Guards: the export is never stale (regenerate with
 * `npx tsx scripts/export-mutator-schedule.ts`); the legacy pick stays each
 * day's primary row (older native readers keep showing it); overlay days add only
 * flat STRING fields (the shipped iOS decoder is [String: [[String: String]]], so
 * a nested object would break every bundled schedule); the validation ceiling
 * uses the union of the legacy and overlay names.
 */
import fs from "node:fs";
import { legacyMutatorsForDate, MUTATORS_START_DATE, overlayEntryForDate } from "../src/mutators";
import { publishedRows, unionMutatorNames } from "../server/patrol-schedule.mjs";
import { grazeLimits } from "../server/validate.mjs";
import frozen from "./mutator-snapshot-overlay.json";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

type Row = Record<string, unknown> & { name: string; subline: string };
const serverPath = new URL("../server/mutator-schedule.json", import.meta.url);
const iosPath = new URL("../ios/App/App/Resources/mutator-schedule.json", import.meta.url);
const schedule = JSON.parse(fs.readFileSync(serverPath, "utf8")) as Record<string, Row[]>;
const FROZEN = frozen as Record<string, [string, string]>;

check("the server and iOS copies are byte-identical", fs.readFileSync(serverPath, "utf8") === fs.readFileSync(iosPath, "utf8"));

const dates: string[] = [];
for (let t = Date.parse(`${MUTATORS_START_DATE}T00:00:00Z`); t <= Date.parse("2027-12-31T00:00:00Z"); t += 86400000) {
  dates.push(new Date(t).toISOString().slice(0, 10));
}
check("every date from the start through 2027-12-31 is exported", dates.every((d) => Array.isArray(schedule[d])) && Object.keys(schedule).length === dates.length);

const stale = dates.filter((d) => {
  const live = legacyMutatorsForDate(d);
  const rows = schedule[d] ?? [];
  return rows.length !== live.length || live.some((m, k) => rows[k].name !== m.name || rows[k].subline !== m.subline);
});
check("the export is not stale: every day's rows are the legacy pick, names and sublines", stale.length === 0, `${stale.length} stale, e.g. ${stale.slice(0, 3).join(",")}`);

check(
  "every exported value is a string (the iOS decoder is [String: [[String: String]]])",
  dates.every((d) => schedule[d].every((r) => Object.values(r).every((v) => typeof v === "string"))),
);

const overlayDays = dates.filter((d) => schedule[d][0]?.overlayId !== undefined);
check("overlay days in the export are exactly the frozen overlay dates", JSON.stringify(overlayDays) === JSON.stringify(Object.keys(FROZEN)), `${overlayDays.length}`);
check(
  "an overlay day carries the entry's id, name and subline on the first (legacy) row, one row, never a Sunday",
  overlayDays.every((d) => {
    const e = overlayEntryForDate(d)!;
    const r = schedule[d];
    return r.length === 1 && r[0].overlayId === e.id && r[0].overlayName === e.name && r[0].overlaySubline === e.subline && new Date(`${d}T00:00:00Z`).getUTCDay() !== 0;
  }),
);
check("no other day carries an overlay field", dates.every((d) => overlayDays.includes(d) || schedule[d].every((r) => !Object.keys(r).some((k) => k.startsWith("overlay")))));

// the server helpers
const d0 = overlayDays[0];
check("union names: the legacy pick plus the overlay name", JSON.stringify(unionMutatorNames(schedule[d0])) === JSON.stringify([schedule[d0][0].name, "THE PASSAGE"]), JSON.stringify(unionMutatorNames(schedule[d0])));
check("union names: an ordinary day and a Sunday are unchanged, an unknown day is null", (() => {
  const plain = dates.find((d) => !overlayDays.includes(d) && schedule[d].length === 1)!;
  const sunday = dates.find((d) => schedule[d].length === 2)!;
  return JSON.stringify(unionMutatorNames(schedule[plain])) === JSON.stringify(schedule[plain].map((r) => r.name)) && unionMutatorNames(schedule[sunday]).length === 2 && unionMutatorNames(undefined) === null;
})());
check("published rows: switch on gives the overlay entry, switch off gives the legacy rows untouched", (() => {
  const on = publishedRows(schedule[d0], (id) => id === "twin-orbs");
  const off = publishedRows(schedule[d0], () => false);
  const other = publishedRows(schedule[d0], (id) => id === "another-entry");
  return on.length === 1 && on[0].name === "THE PASSAGE" && on[0].subline === schedule[d0][0].overlaySubline && off === schedule[d0] && other === schedule[d0];
})());
check("published rows: an ordinary day ignores the switch", (() => {
  const plain = dates.find((d) => !overlayDays.includes(d))!;
  return publishedRows(schedule[plain], () => true) === schedule[plain];
})());

// the graze ceiling is the worse of the two days, so a legit run from either bundle passes
check(
  "graze ceiling on an overlay day is the legacy day's ceiling (THE PASSAGE has no graze scale)",
  overlayDays.every((d) => JSON.stringify(grazeLimits(unionMutatorNames(schedule[d]))) === JSON.stringify(grazeLimits(schedule[d].map((r) => r.name)))),
);
check("graze ceiling: a GRAZE PROTOCOL legacy day under an overlay keeps the 8x ceiling", (() => {
  const synthetic = [{ name: "GRAZE PROTOCOL", subline: "", overlayId: "twin-orbs", overlayName: "THE PASSAGE", overlaySubline: "" }];
  const union = grazeLimits(unionMutatorNames(synthetic));
  const legacy = grazeLimits(["GRAZE PROTOCOL"]);
  const ordinary = grazeLimits(["BLACKOUT"]);
  return JSON.stringify(union) === JSON.stringify(legacy) && union.points > ordinary.points && union.perSec > ordinary.perSec;
})());

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
if (failures > 0) process.exit(1);
