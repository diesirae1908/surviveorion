import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { PRESETS, REPO_ROOT } from "../src/paths.mjs";
import {
  fillNewBestBoardHtml,
  parseHudBestText,
  resolvePrevBest,
} from "../src/newbest-board.mjs";
import { parseSidecarFile } from "../src/sidecar.mjs";

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

describe("NEW BEST board", () => {
  it("fills sidecar/HUD numbers with thousands separators and no leftover tokens", async () => {
    const template = await readFile(PRESETS.newBestBoardTemplate, "utf8");
    const html = fillNewBestBoardHtml(template, {
      score: 3490380,
      prevBest: 3246228,
      day: 43,
      mutator: "ARSENAL",
    });
    assert.match(html, />3,490,380</);
    assert.match(html, /<s>3,246,228<\/s>/);
    assert.match(html, /DAY 43/);
    assert.match(html, /ARSENAL/);
    assert.equal(html.includes("{{"), false);
    assert.equal(html.includes("\u2014"), false);
  });

  it("missing prev-best fails loud for non-fixture clips", async () => {
    await assert.rejects(
      () =>
        resolvePrevBest({
          sidecar: { ...day43Sidecar, score: 100 },
          videoPath: null,
          basename: "orion_2026-08-20_day1_starfall_150",
        }),
      /PREV_BEST|bestScore/
    );
    assert.equal(
      await resolvePrevBest({
        sidecar: { ...day43Sidecar, bestScore: 111 },
        videoPath: null,
        basename: "orion_2026-08-20_day1_starfall_150",
      }),
      111
    );
  });

  it("fill without prevBest fails loud and never invents a number", () => {
    assert.throws(
      () =>
        fillNewBestBoardHtml("<div>{{SCORE}} {{PREV_BEST}} {{DAY}} {{MUTATOR}}</div>", {
          score: 100,
          prevBest: undefined,
          day: 1,
          mutator: "PIT",
        }),
      /PREV_BEST/
    );
  });

  it("parses HUD BEST text from a crop OCR dump", () => {
    assert.equal(parseHudBestText("1\nx1.0\nBEST 3,246,228"), 3246228);
    assert.equal(parseHudBestText("no best here"), null);
  });

  it("day43 sidecar bestScore is the HUD-verified previous best", async () => {
    const text = await readFile(
      path.join(REPO_ROOT, "fixtures/orion_2026-08-25_day43_arsenal_3490380.json"),
      "utf8"
    );
    const { sidecar } = parseSidecarFile(text, "orion_2026-08-25_day43_arsenal_3490380.json");
    assert.equal(sidecar.bestScore, 3246228);
    assert.equal(
      await resolvePrevBest({
        sidecar,
        videoPath: null,
        basename: "orion_2026-08-25_day43_arsenal_3490380",
      }),
      3246228
    );
  });

  it("renderer source does not hardcode a previous-best constant", async () => {
    const src = await readFile(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/newbest-board.mjs"),
      "utf8"
    );
    assert.equal(src.includes("3246228"), false);
    assert.equal(src.includes("3,246,228"), false);
  });
});
