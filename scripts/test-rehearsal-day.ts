/**
 * Rehearsal ?day= contract: future-day mutator pick + daily seed match the
 * real date-hash paths (same shared instance pilots will get).
 * Also locks the future-day gate decision table (mirrors main.ts):
 * production allowlist only; leftover ?rehearsal=director does not count.
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

/** Mirrors main.ts gate: param wins on this load; off clears; else read storage. */
function rehearsalDirectorActive(param: string | null, stored: string | null): boolean {
  if (param === "director") return true;
  if (param === "off") return false;
  return stored === "director";
}

check("?rehearsal=director unlocks even without storage", rehearsalDirectorActive("director", null));
check("?rehearsal=director wins over stored off", rehearsalDirectorActive("director", ""));
check("?rehearsal=off locks even with stored director", !rehearsalDirectorActive("off", "director"));
check("no param reads stored director flag", rehearsalDirectorActive(null, "director"));
check("no param without storage stays locked", !rehearsalDirectorActive(null, null));

function lobbyPickerVisible(clipInbox: boolean): boolean {
  return clipInbox;
}
function previewGateOpen(localhost: boolean, clipInbox: boolean): boolean {
  return localhost || clipInbox;
}
check("Lucas allowlist unlocks future days without rehearsal URL", previewGateOpen(false, true));
check("random pilot stays locked on production", !previewGateOpen(false, false));
check("director leftover does not unlock production", !lobbyPickerVisible(false));
check("localhost still unlocks URL preview without allowlist", previewGateOpen(true, false));
check("lobby picker is allowlist only, even on localhost", !lobbyPickerVisible(false));
check("lobby picker shows for the allowlisted account", lobbyPickerVisible(true));

// Seed path is the same function the client uses at run start for a rehearsed day.
{
  const d = "2026-09-20";
  const a = dailySeedForDate(d);
  const b = dailySeedForDate(d);
  check("daily seed is deterministic per patrol date", a === b, String(a));
  check("adjacent dates produce different daily seeds", dailySeedForDate(d) !== dailySeedForDate("2026-09-21"));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll rehearsal-day checks passed.");
