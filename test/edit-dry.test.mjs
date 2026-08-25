import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { buildFfmpegCommand, formatCommand, slowMoSegments } from "../src/edit.mjs";

const sidecar = {
  day: 1,
  mutatorIds: ["arsenal"],
  mutatorNames: ["ARSENAL"],
  score: 100,
  medal: null,
  survivalTime: 60,
  closestCall: null,
  topGrazes: [],
};

describe("edit --dry CLOSE CALL", () => {
  it("slow-mo splits into three segments", () => {
    const segs = slowMoSegments(
      { start: 4, end: 14 },
      { start: 9.6, end: 10.6, rate: 0.5 }
    );
    assert.equal(segs.length, 3);
    assert.deepEqual(segs[1], { start: 9.6, end: 10.6, rate: 0.5 });
  });

  it("filtergraph contains trim, setpts, concat", () => {
    const { filterComplex, args } = buildFfmpegCommand({
      plan: {
        format: "CLOSE_CALL",
        sourceBasename: "demo",
        cut: { start: 4, end: 14 },
        slowMo: { start: 9.6, end: 10.6, rate: 0.5 },
        graze: { time: 10, clearance: 0.05 },
      },
      record: {
        videoPath: "/tmp/demo.webm",
        sidecar,
        probe: { width: 1920, height: 1080, duration: 60, fps: 30, hasAudio: true },
        filename: { date: "2026-08-25" },
      },
      outputPath: "/tmp/close-call.mp4",
    });

    assert.match(filterComplex, /trim/);
    assert.match(filterComplex, /setpts/);
    assert.match(filterComplex, /concat/);
    assert.match(filterComplex, /atempo=0\.5/);
    assert.ok(args.includes("-filter_complex"));
    const printed = formatCommand(args);
    assert.match(printed, /^ffmpeg /);
    assert.ok(!path.isAbsolute(printed) || printed.includes("ffmpeg"));
  });
});
