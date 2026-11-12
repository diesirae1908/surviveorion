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

const { createUser, insertScore, deleteUser, getUserById, getUserBest, insertOrderCompletion, meritForUser, ordersDoneForDay, mintChallenge, getChallenge, db } = await import(
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

// Daily Orders: completions are per-user and must go with the account.
assert.ok(insertOrderCompletion(user.id, { dailyDate: "2026-09-11", orderId: "kills-25", tier: 1, merit: 1, paramsHash: "h1" }));
assert.ok(insertOrderCompletion(user.id, { dailyDate: "2026-09-11", orderId: "chain-5", tier: 2, merit: 2, paramsHash: "h1" }));
assert.equal(insertOrderCompletion(user.id, { dailyDate: "2026-09-11", orderId: "chain-5", tier: 2, merit: 9, paramsHash: "h2" }), false);
assert.equal(meritForUser(user.id), 3);
assert.deepEqual(ordersDoneForDay(user.id, "2026-09-11"), ["kills-25", "chain-5"]);

// Challenge links: per-user rows must go with the account (their /c/ code goes dead).
const linkCode = mintChallenge(user.id, "2026-09-11", () => "DEL0TEST");
assert.equal(getChallenge(linkCode)?.userId, user.id);

deleteUser(user.id);
assert.equal(getChallenge(linkCode), undefined);
assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM challenge_links WHERE user_id = ?`).get(user.id).c, 0);
assert.equal(getUserById(user.id), undefined);
assert.equal(getUserBest(user.id, "touch", "classic"), 0);
assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM order_completions WHERE user_id = ?`).get(user.id).c, 0);
assert.equal(meritForUser(user.id), 0);
assert.deepEqual(ordersDoneForDay(user.id, "2026-09-11"), []);

// A new account reusing the freed id (SQLite rowid reuse) starts at merit 0.
const next = createUser({ callsign: "Reuser", country: "CA", passSalt: "s", passHash: "h" });
assert.equal(meritForUser(next.id), 0);
assert.deepEqual(ordersDoneForDay(next.id, "2026-09-11"), []);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("PASS  DELETE user cascades scores, order completions and challenge links (daily budget / rate limits unchanged)");
