/**
 * Phase B v2 acceptance: day43 THE BOARD + TODAY'S PATROL, plus one
 * synthetic CLOSE CALL from test/fixtures (day10 pit graze) over the
 * day43 video. Never writes out/approved/.
 */

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { FIXTURES_DIR, GOLDEN_DIR, REPO_ROOT } from "../src/paths.mjs";
import { tryHarvestDay43 } from "../src/harvest.mjs";
import { buildCutPlans, formatCutPlansForLog } from "../src/plan.mjs";
import { parseSidecarFile } from "../src/sidecar.mjs";
import { renderEdit } from "../src/edit.mjs";

const MAX_FFMPEG_TRIES = 2;

async function renderOnce(label, plan, record, outputPath) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_FFMPEG_TRIES; attempt++) {
    try {
      const built = await renderEdit({ plan, record, outputPath });
      return built;
    } catch (err) {
      lastErr = err;
      console.error(`ffmpeg attempt ${attempt} failed for ${label}: ${err.message}`);
      if (err.stderr) console.error(String(err.stderr).slice(-4000));
      if (attempt >= MAX_FFMPEG_TRIES) {
        const cmd = err.args ? ["ffmpeg", ...err.args].join(" ") : "(no argv)";
        console.error("STOP after two ffmpeg failures.");
        console.error("command:", cmd.slice(0, 2000));
        process.exit(1);
      }
    }
  }
  throw lastErr;
}

const result = await tryHarvestDay43(FIXTURES_DIR);
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

console.log("day43 CutPlans (isFirstOfUtcDay=true):");
console.log(formatCutPlansForLog(result.plans));
console.log("day43 topGrazes:", result.record.sidecar.topGrazes);
console.log("day43 closestCall:", result.record.sidecar.closestCall);

await mkdir(GOLDEN_DIR, { recursive: true });

for (const plan of result.plans) {
  const outputPath = path.join(GOLDEN_DIR, `${plan.format}.mp4`);
  console.log(`\nrendering ${plan.format} -> ${outputPath}`);
  const built = await renderOnce(plan.format, plan, result.record, outputPath);
  console.log(`wrote ${outputPath} crop=${built.cropMode} libass=${built.useLibass}`);
}

const day10Path = path.join(
  REPO_ROOT,
  "test/fixtures/orion_2026-08-21_day10_pit_8000.json"
);
const { sidecar: day10 } = parseSidecarFile(
  await readFile(day10Path, "utf8"),
  "orion_2026-08-21_day10_pit_8000.json"
);
const closePlans = buildCutPlans({
  sourceBasename: "orion_2026-08-21_day10_pit_8000",
  sidecar: day10,
  duration: result.record.probe.duration,
  isFirstOfUtcDay: false,
}).filter((p) => p.format === "CLOSE_CALL");

if (!closePlans.length) {
  console.error("day10 fixture produced no CLOSE CALL");
  process.exit(1);
}

const closePlan = closePlans[0];
const closeOut = path.join(GOLDEN_DIR, "CLOSE_CALL.mp4");
console.log("\nsynthetic CLOSE CALL from day10 pit over day43 video:");
console.log(formatCutPlansForLog([closePlan]));
const closeRecord = {
  ...result.record,
  sidecar: day10,
  basename: "orion_2026-08-21_day10_pit_8000",
};
const closeBuilt = await renderOnce("CLOSE_CALL", closePlan, closeRecord, closeOut);
console.log(`wrote ${closeOut} crop=${closeBuilt.cropMode} libass=${closeBuilt.useLibass}`);

console.log("\ngolden done. Nothing moved to out/approved/.");
