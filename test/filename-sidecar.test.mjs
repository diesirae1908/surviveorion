import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseFilename } from "../src/filename.mjs";
import { parseSidecarFile } from "../src/sidecar.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

async function loadSidecar(name) {
  const basename = `${name}.json`;
  const text = await readFile(path.join(FIXTURES, basename), "utf8");
  return parseSidecarFile(text, basename);
}

describe("filename parsing", () => {
  it("parses a daily patrol filename", () => {
    const parsed = parseFilename("orion_2026-08-25_day43_arsenal_3490380.webm");
    assert.equal(parsed.date, "2026-08-25");
    assert.equal(parsed.day, 43);
    assert.equal(parsed.mutatorSlot, "arsenal");
    assert.deepEqual(parsed.mutatorIds, ["arsenal"]);
    assert.equal(parsed.score, 3490380);
    assert.equal(parsed.ext, "webm");
  });

  it("parses Sunday double mutator slot", () => {
    const parsed = parseFilename("orion_2026-08-24_day42_arsenal+starfall_50000.mp4");
    assert.deepEqual(parsed.mutatorIds, ["arsenal", "starfall"]);
    assert.equal(parsed.mutatorSlot, "arsenal+starfall");
  });

  it("parses fullgame classic slot", () => {
    const parsed = parseFilename("orion_2026-08-24_day0_classic_1500000.webm");
    assert.deepEqual(parsed.mutatorIds, []);
    assert.equal(parsed.mutatorSlot, "classic");
  });

  it("fails loudly on contract mismatch", () => {
    assert.throws(
      () => parseFilename("orion_bad_name.webm"),
      /Filename contract mismatch/
    );
  });
});

describe("sidecar parsing", () => {
  it("loads and validates the 8s death fixture", async () => {
    const { filename, sidecar } = await loadSidecar(
      "orion_2026-08-20_day1_starfall_150"
    );
    assert.equal(filename.day, 1);
    assert.equal(sidecar.survivalTime, 8);
    assert.equal(sidecar.score, 150);
  });

  it("loads Sunday double fixture", async () => {
    const { filename, sidecar } = await loadSidecar(
      "orion_2026-08-24_day42_arsenal+starfall_50000"
    );
    assert.deepEqual(sidecar.mutatorIds, ["arsenal", "starfall"]);
    assert.equal(filename.mutatorSlot, "arsenal+starfall");
  });

  it("loads fullgame classic fixture", async () => {
    const { sidecar } = await loadSidecar("orion_2026-08-24_day0_classic_1500000");
    assert.deepEqual(sidecar.mutatorIds, []);
    assert.equal(sidecar.medal, "gold");
  });

  it("rejects filename/sidecar score drift", async () => {
    const text = await readFile(
      path.join(FIXTURES, "orion_2026-08-20_day1_starfall_150.json"),
      "utf8"
    );
    assert.throws(
      () => parseSidecarFile(text, "orion_2026-08-20_day1_starfall_999.json"),
      /Filename\/sidecar drift/
    );
  });
});
