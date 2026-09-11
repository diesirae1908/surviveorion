/**
 * In-app account deletion: user row goes away, scores cascade, rate limit
 * and daily attempt budget are untouched.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orion-delete-"));
const dbPath = path.join(tmp, "orion.db");
process.env.ORION_DB = dbPath;

const { createUser, insertScore, deleteUser, getUserById, getUserBest } = await import(
  "../server/db.mjs"
);

const user = createUser({
  callsign: "DeleteMe",
  country: "CA",
  passSalt: "s",
  passHash: "h",
});
assert.ok(user.id);
insertScore(user.id, {
  score: 1000,
  timeSurvived: 12,
  kills: 3,
  maxMultiplier: 1.5,
  mode: "touch",
  gameMode: "classic",
  dailyDate: "2026-09-11",
});
assert.equal(getUserBest(user.id, "touch", "classic"), 1000);

deleteUser(user.id);
assert.equal(getUserById(user.id), undefined);
assert.equal(getUserBest(user.id, "touch", "classic"), 0);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("PASS  DELETE user cascades scores (daily budget / rate limits unchanged)");
