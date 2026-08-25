import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  harvestDirectory,
  tryHarvestDay43,
  ffprobeVideo,
} from "../src/harvest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(__dirname);
const DAY43_WEBM = path.join(
  REPO_ROOT,
  "fixtures",
  "orion_2026-08-25_day43_arsenal_3490380.webm"
);

describe("harvest", () => {
  it("warns and skips unpaired video without crashing batch", async () => {
    const dir = path.join(tmpdir(), `orion-harvest-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(path.join(dir, "lonely.webm"), "not-a-real-video");
      const { records, warnings } = await harvestDirectory(dir);
      assert.equal(records.length, 0);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /Unpaired file skipped.*lonely\.webm/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("harvests the real day43 pair with isFirstOfUtcDay", async () => {
    const result = await tryHarvestDay43(path.join(REPO_ROOT, "fixtures"));
    if (!result.ok) {
      if (/Missing video/.test(result.error ?? "")) return;
      throw new Error(result.error);
    }
    assert.equal(result.record.sidecar.score, 3490380);
    assert.deepEqual(result.record.sidecar.topGrazes, []);
    assert.equal(result.record.sidecar.closestCall, null);
    assert.deepEqual(
      result.plans.map((p) => p.format),
      ["THE_BOARD", "TODAYS_PATROL"]
    );
  });

  it("ffprobes day43 webm when present locally", async () => {
    let probe;
    try {
      probe = await ffprobeVideo(DAY43_WEBM);
    } catch {
      return; // video not copied locally in CI
    }
    assert.ok(probe.width > 0);
    assert.ok(probe.height > 0);
    assert.ok(probe.duration > 60);
    assert.ok(probe.fps > 0);
  });
});
