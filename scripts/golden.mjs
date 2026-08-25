/**
 * Render the three locked day43 presets into out/golden/.
 * Never writes out/approved/. No fallback to edit.mjs.
 */

import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { FIXTURES_DIR, GOLDEN_DIR } from "../src/paths.mjs";
import { tryHarvestDay43 } from "../src/harvest.mjs";
import { LOCKED_FORMATS } from "../src/presets.mjs";
import { renderPreset } from "../src/preset-runner.mjs";

const dry = process.argv.includes("--dry");

const result = await tryHarvestDay43(FIXTURES_DIR);
if (!result.ok) {
  const webm = path.join(FIXTURES_DIR, "orion_2026-08-25_day43_arsenal_3490380.webm");
  try {
    await stat(webm);
  } catch {
    console.error(
      `Missing day43 webm at ${webm}. Copy it into fixtures/ (do not synthesize footage).`
    );
    process.exit(1);
  }
  console.error(result.error);
  process.exit(1);
}

await mkdir(GOLDEN_DIR, { recursive: true });

for (const format of LOCKED_FORMATS) {
  const outputPath = path.join(GOLDEN_DIR, `${format}.mp4`);
  console.log(`\n${dry ? "dry" : "render"} ${format} -> ${outputPath}`);
  const built = await renderPreset({
    format,
    record: result.record,
    outputPath,
    dry,
  });
  console.log(built.plan);
  if (!dry) console.log(`wrote ${outputPath}`);
}

console.log("\ngolden done. Nothing moved to out/approved/.");
