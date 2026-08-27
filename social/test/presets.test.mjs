import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DAY43_BASE } from "../src/paths.mjs";
import {
  assertNewBestEligible,
  pickEligiblePresets,
  requirePresetInputs,
  voidPadSpec,
  wastedSourceTimes,
} from "../src/presets.mjs";
import { renderPreset } from "../src/preset-runner.mjs";

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
  it("Void pad maps day43 2904x1656 to 2904x5164 y=1754", () => {
    const pad = voidPadSpec(2904, 1656, DAY43_BASE);
    assert.equal(pad.padW, 2904);
    assert.equal(pad.padH, 5164);
    assert.equal(pad.padY, 1754);
    assert.equal(pad.yCenter, 2582);
    assert.match(pad.filter, /#0a0a12/);
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
