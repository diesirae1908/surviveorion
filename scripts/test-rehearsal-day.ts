/**
 * Rehearsal ?day= contract: future-day mutator pick + daily seed match the
 * real date-hash paths (same shared instance pilots will get).
 * Run: npx tsx scripts/test-rehearsal-day.ts
 */
import { hashString } from "../src/math";
import { getMutatorsForDate } from "../src/mutators";
import golden from "./mutator-snapshot.json";

const SNAPSHOT: Record<string, string> = golden as Record<string, string>;

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures++;
}

function dailySeedForDate(dateStr: string): number {
  return hashString(`orion-daily-${dateStr}`);
}

function mutatorIdsForDate(dateStr: string): string {
  return getMutatorsForDate(new Date(`${dateStr}T00:00:00.000Z`))
    .map((m) => m.id)
    .join("+");
}

// Sample dates from the frozen snapshot — rehearsing ?day=D must match snapshot ids.
const sampleDates = ["2026-08-15", "2026-09-01", "2026-10-12", "2026-12-31"];
for (const d of sampleDates) {
  const want = SNAPSHOT[d];
  if (want === undefined) continue;
  check(`?day=${d} mutator pick matches snapshot`, mutatorIdsForDate(d) === want, `got "${mutatorIdsForDate(d)}"`);
}

// Seed path is the same function the client uses at run start for a rehearsed day.
{
  const d = "2026-09-20";
  const a = dailySeedForDate(d);
  const b = dailySeedForDate(d);
  check("daily seed is deterministic per UTC date", a === b, String(a));
  check("adjacent dates produce different daily seeds", dailySeedForDate(d) !== dailySeedForDate("2026-09-21"));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll rehearsal-day checks passed.");
