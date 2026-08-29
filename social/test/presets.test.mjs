import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DAY43_BASE } from "../src/paths.mjs";
import {
  LETTERBOX_VF,
  assertNewBestEligible,
  letterboxFilter,
  pickEligiblePresets,
  requirePresetInputs,
  wastedSourceTimes,
} from "../src/presets.mjs";
import { buildPresetSteps, renderPreset } from "../src/preset-runner.mjs";

const day43Sidecar = {
  day: 43,
  mutatorIds: ["arsenal"],
  mutatorNames: ["ARSENAL"],
  score: 3490380,
  medal: "gold",
  survivalTime: 270,
  closestCall: null,
  topGrazes: [],
};

describe("locked presets", () => {
  it("letterbox fits day43 2904x1656 in 1080x1920 with black bars", () => {
    const vf = letterboxFilter(2904, 1656, DAY43_BASE);
    assert.equal(
      vf,
      "scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"
    );
    assert.equal(vf, LETTERBOX_VF);
    assert.doesNotMatch(vf, /#0a0a12/);
    assert.throws(() => letterboxFilter(0, 0, DAY43_BASE), /Cannot map source dims/);
  });

  it("locked presets letterbox gameplay and never zoompan", () => {
    const record = {
      basename: DAY43_BASE,
      videoPath: "/tmp/orion-social-missing-clip.webm",
      sidecar: day43Sidecar,
      probe: { width: 2904, height: 1656, duration: 319.9, fps: 24, hasAudio: false },
    };
    for (const format of ["WASTED", "PATROL", "NEW_BEST"]) {
      const steps = buildPresetSteps(format, record, "/tmp/orion-social-should-not-write.mp4", {
        workDir: "/tmp/orion-social-letterbox-test",
      });
      const joined = steps.flatMap((s) => s.args || []).join("\n");
      assert.doesNotMatch(joined, /zoompan/);
      assert.match(joined, /scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2/);
      assert.match(joined, /pad=1080:1920:\(ow-iw\)\/2:\(oh-ih\)\/2:black/);
      if (format === "NEW_BEST") {
        const board = steps.find((s) => s.label === "newbest-board");
        assert.ok(board);
        assert.match(board.args.join(" "), /scale=1080:1920,fps=24/);
      }
    }
  });

  it("day43 WASTED times stay locked at 312.6 / 317.1 / 318.5", () => {
    const t = wastedSourceTimes(319.9167, DAY43_BASE);
    assert.equal(t.approach, 312.6);
    assert.equal(t.freeze, 317.1);
    assert.equal(t.slam, 318.5);
  });

  it("fails loud on missing video", async () => {
    const record = {
      basename: DAY43_BASE,
      videoPath: "/tmp/orion-social-missing-clip.webm",
      sidecar: day43Sidecar,
      probe: { width: 2904, height: 1656, duration: 319.9, fps: 24, hasAudio: false },
    };
    await assert.rejects(() => requirePresetInputs("WASTED", record), /Missing video/);
    await assert.rejects(
      () =>
        renderPreset({
          format: "WASTED",
          record,
          outputPath: "/tmp/orion-social-should-not-write.mp4",
          dry: true,
        }),
      /Missing video/
    );
  });

  it("NEW BEST without bestScore fails for non-day43 clips", () => {
    assert.throws(
      () =>
        assertNewBestEligible(
          { ...day43Sidecar, score: 100 },
          "orion_2026-08-20_day1_starfall_150"
        ),
      /bestScore/
    );
    assert.doesNotThrow(() => assertNewBestEligible(day43Sidecar, DAY43_BASE));
  });

  it("picks WASTED + PATROL + NEW_BEST on day43 first-of-day", () => {
    const formats = pickEligiblePresets(
      {
        basename: DAY43_BASE,
        sidecar: day43Sidecar,
        probe: { width: 2904, height: 1656, duration: 319.9, fps: 24, hasAudio: false },
      },
      { isFirstOfUtcDay: true }
    );
    assert.deepEqual(formats, ["WASTED", "PATROL", "NEW_BEST"]);
  });
});
