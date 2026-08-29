import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { buildBeatSheet } from "../src/beats.mjs";
import { precomputeCropPath } from "../src/crop.mjs";
import {
  atempoFor,
  buildFfmpegCommand,
  formatCommand,
  sourceTimeAt,
} from "../src/edit.mjs";

const sidecar = {
  day: 10,
  mutatorIds: ["pit"],
  mutatorNames: ["THE PIT"],
  score: 8000,
  medal: null,
  survivalTime: 45,
  closestCall: { time: 10.5, x: 1, y: 2, clearance: 0.05 },
  topGrazes: [{ time: 10.5, clearance: 0.05 }],
};

describe("edit --dry v2", () => {
  it("atempo stays inside ffmpeg's 0.5-2 range", () => {
    assert.equal(atempoFor(0.45), 0.5);
    assert.equal(atempoFor(1.25), 1.25);
  });

  it("filtergraph letterboxes full playfield, no crop/zoompan, no fade-out", () => {
    const graze = { time: 10.5, clearance: 0.05, x: 1, y: 2 };
    const sheet = buildBeatSheet("CLOSE_CALL", sidecar, 50, { graze });
    const cropPath = precomputeCropPath({
      duration: 9,
      sourceW: 1920,
      sourceH: 1080,
      graze,
      punches: sheet.punches,
      shakes: sheet.shakes,
    });
    const { filterComplex, args, cropMode } = buildFfmpegCommand({
      plan: {
        format: "CLOSE_CALL",
        sourceBasename: "demo",
        cut: { start: 4.5, end: 14.5 },
        graze,
        beats: sheet.beats,
        sheetDuration: sheet.duration,
      },
      record: {
        videoPath: "/tmp/demo.webm",
        sidecar,
        probe: { width: 1920, height: 1080, duration: 50, fps: 30, hasAudio: true },
        filename: { date: "2026-08-21" },
      },
      outputPath: "/tmp/close-call.mp4",
      cropCmdPath: "/tmp/crop.cmd",
      assPath: "/tmp/close-call.ass",
      useLibass: false,
      overlayFiles: { captions: [], memes: [], sfxHits: [] },
      sourceW: 1920,
      sourceH: 1080,
      cropPath,
      sheet,
    });

    assert.doesNotMatch(filterComplex, /crop=/);
    assert.doesNotMatch(filterComplex, /sendcmd=/);
    assert.doesNotMatch(filterComplex, /zoompan/);
    assert.match(
      filterComplex,
      /scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:\(ow-iw\)\/2:\(oh-ih\)\/2:black/
    );
    assert.match(filterComplex, /tpad=stop_mode=clone/);
    assert.doesNotMatch(filterComplex, /xfade/);
    assert.match(filterComplex, /trim/);
    assert.match(filterComplex, /setpts/);
    assert.match(filterComplex, /concat/);
    assert.equal(cropMode, "v2.0");
    assert.ok(args.includes("-filter_complex"));
    assert.match(formatCommand(args), /^ffmpeg /);
    assert.ok(sourceTimeAt(sheet.beats, 0.1) > 0);
  });
});
