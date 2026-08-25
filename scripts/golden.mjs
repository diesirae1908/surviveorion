/**
 * Phase B acceptance: harvest + plan the day43 fixture, render every eligible
 * format to out/golden/. Never writes out/approved/.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";

import { FIXTURES_DIR, GOLDEN_DIR } from "../src/paths.mjs";
import { tryHarvestDay43 } from "../src/harvest.mjs";
import { formatCutPlansForLog } from "../src/plan.mjs";
import { renderEdit } from "../src/edit.mjs";

const result = await tryHarvestDay43(FIXTURES_DIR);
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

console.log("day43 CutPlans (isFirstOfUtcDay=true):");
console.log(formatCutPlansForLog(result.plans));

await mkdir(GOLDEN_DIR, { recursive: true });

for (const plan of result.plans) {
  const outputPath = path.join(GOLDEN_DIR, `${plan.format}.mp4`);
  console.log(`\nrendering ${plan.format} -> ${outputPath}`);
  try {
    await renderEdit({
      plan,
      record: result.record,
      outputPath,
    });
  } catch (err) {
    const e = /** @type {Error & { stderr?: string }} */ (err);
    console.error(`ffmpeg failed for ${plan.format}: ${e.message}`);
    if (e.stderr) console.error(e.stderr.slice(-4000));
    process.exit(1);
  }
  console.log(`wrote ${outputPath}`);
}

console.log("\ngolden done. Nothing moved to out/approved/.");
