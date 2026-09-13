/**
 * In-run Daily music beds by mutator style. Audio-only: does not touch
 * mutator math. Run: npx tsx scripts/test-mutator-music.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_GAME_TRACK,
  GAMEOVER_TRACK,
  PATROL_COMPLETE_TRACK,
  TRAINING_TRACK,
  MUTATOR_GAME_TRACK,
  musicBedForActiveMutators,
  musicBedForMutator,
  musicBedForMutators,
} from "../src/audio.ts";
import {
  MUTATOR_POOL,
  clearActiveMutators,
  getMutatorById,
  setActiveMutators,
} from "../src/mutators.ts";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const MUSIC = path.join(ROOT, "public/music");

/** Spec from the 2026-09-12 brief, hardcoded so the map cannot silently drift. */
const SPEC: Record<string, string> = {
  blackout: "quietfog.mp3",
  "cloak-day": "quietfog.mp3",
  singularity: "quietfog.mp3",
  "the-flood": "imperial-swarm.mp3",
  "hunting-party": "imperial-swarm.mp3",
  "red-alert": "imperial-swarm.mp3",
  "ram-raid": "imperial-swarm.mp3",
  menagerie: "imperial-swarm.mp3",
  "year-of-the-serpent": "imperial-swarm.mp3",
  "graze-protocol": "imperial-swarm.mp3",
  "howlers-day": "imperial-swarm.mp3",
  giants: "imperial-swarm.mp3",
  "solar-wind": "imperial-tempest.mp3",
  "iron-barrage": "imperial-tempest.mp3",
  overcharge: "imperial-tempest.mp3",
  "demolition-day": "imperial-tempest.mp3",
  starfall: "imperial-tempest.mp3",
  "ion-day": "imperial-tempest.mp3",
  minefield: "imperial-tempest.mp3",
  "cryo-winter": "frost-and-thunder.mp3",
  "thunder-day": "frost-and-thunder.mp3",
  "the-lighthouse": "radiant-beam.mp3",
  "gold-dash": "radiant-beam.mp3",
  "razor-day": "radiant-beam.mp3",
  "lancer-doctrine": "radiant-beam.mp3",
  arsenal: "radiant-beam.mp3",
  "bait-shot": "radiant-beam.mp3",
};

const DEFAULT_IDS = ["great-wall", "wheelhouse", "the-pit", "titanfall", "magnetic-field"];

assert.equal(musicBedForMutator("the-lighthouse"), "radiant-beam.mp3");
assert.equal(musicBedForMutator("cryo-winter"), "frost-and-thunder.mp3");
assert.equal(musicBedForMutator("great-wall"), DEFAULT_GAME_TRACK);
assert.equal(musicBedForMutator(undefined), DEFAULT_GAME_TRACK);
assert.equal(musicBedForMutator(null), DEFAULT_GAME_TRACK);
assert.equal(musicBedForMutator("not-a-mutator"), DEFAULT_GAME_TRACK);
assert.equal(musicBedForMutators([]), DEFAULT_GAME_TRACK);
assert.equal(musicBedForMutators(["the-lighthouse", "great-wall"]), "radiant-beam.mp3");
assert.equal(musicBedForMutators(["great-wall", "the-lighthouse"]), DEFAULT_GAME_TRACK);

for (const [id, file] of Object.entries(SPEC)) {
  assert.equal(musicBedForMutator(id), file, id);
  assert.equal(MUTATOR_GAME_TRACK[id], file, `map ${id}`);
}

for (const id of DEFAULT_IDS) {
  assert.equal(musicBedForMutator(id), DEFAULT_GAME_TRACK, id);
}

const stale = Object.keys(MUTATOR_GAME_TRACK).filter((id) => !MUTATOR_POOL.some((m) => m.id === id));
assert.deepEqual(stale, [], `stale map keys: ${stale.join(",")}`);

for (const m of MUTATOR_POOL) {
  const want = SPEC[m.id] ?? DEFAULT_GAME_TRACK;
  assert.equal(musicBedForMutator(m.id), want, m.id);
}

const beds = new Set<string>([DEFAULT_GAME_TRACK, ...Object.values(SPEC)]);
for (const file of beds) {
  assert.equal(fs.existsSync(path.join(MUSIC, file)), true, `missing ${file}`);
}

assert.equal(GAMEOVER_TRACK, "imperial-procession.mp3");
assert.equal(fs.existsSync(path.join(MUSIC, GAMEOVER_TRACK)), true, `missing ${GAMEOVER_TRACK}`);
assert.equal(TRAINING_TRACK, "training-ground.mp3");
assert.equal(fs.existsSync(path.join(MUSIC, TRAINING_TRACK)), true, `missing ${TRAINING_TRACK}`);
assert.equal(PATROL_COMPLETE_TRACK, "patrol-complete.mp3");
assert.equal(fs.existsSync(path.join(MUSIC, PATROL_COMPLETE_TRACK)), true, `missing ${PATROL_COMPLETE_TRACK}`);

const lighthouse = getMutatorById("the-lighthouse");
const wall = getMutatorById("great-wall");
const cryo = getMutatorById("cryo-winter");
assert.ok(lighthouse && wall && cryo);

clearActiveMutators();
assert.equal(musicBedForActiveMutators(), DEFAULT_GAME_TRACK);

setActiveMutators([lighthouse], "2026-09-12");
assert.equal(musicBedForActiveMutators(), "radiant-beam.mp3");

setActiveMutators([cryo], "2026-09-12");
assert.equal(musicBedForActiveMutators(), "frost-and-thunder.mp3");

setActiveMutators([wall], "2026-09-12");
assert.equal(musicBedForActiveMutators(), DEFAULT_GAME_TRACK);

setActiveMutators([lighthouse, wall], "2026-09-13");
assert.equal(musicBedForActiveMutators(), "radiant-beam.mp3");

clearActiveMutators();
assert.equal(musicBedForActiveMutators(), DEFAULT_GAME_TRACK);

console.log(`PASS  mutator music map (${MUTATOR_POOL.length} pool ids, ${Object.keys(SPEC).length} mapped)`);
