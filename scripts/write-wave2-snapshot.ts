import { writeFileSync } from "node:fs";
import { getMutatorsForDate, WAVE2_AVAILABLE_FROM } from "../src/mutators";

const end = "2026-12-31";
const out: Record<string, string> = {};
let d = WAVE2_AVAILABLE_FROM;
while (d <= end) {
  out[d] = getMutatorsForDate(new Date(`${d}T00:00:00Z`))
    .map((m) => m.id)
    .join("+");
  const [y, m, day] = d.split("-").map(Number);
  d = new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
}
writeFileSync(
  new URL("./mutator-snapshot-wave2.json", import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(`wrote ${Object.keys(out).length} wave2 dates`);
