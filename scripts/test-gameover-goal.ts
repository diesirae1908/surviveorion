/**
 * Game-over goal line + guest provisional rank. DOM-free.
 * Run: npx tsx scripts/test-gameover-goal.ts
 */
import assert from "node:assert/strict";
import { goalLine, guestRankLine, provisionalRank } from "../src/gameOverGoal.ts";
import type { MedalThresholds } from "../src/medals.ts";

const copper45k: MedalThresholds = { copper: 45_000, silver: 100_000, gold: 200_000 };

{
  const r = provisionalRank(100, []);
  assert.equal(r.rank, 1);
  assert.equal(r.total, 1);
}

{
  const board = [
    { callsign: "Ace", score: 100 },
    { callsign: "Bea", score: 50 },
  ];
  const tied = provisionalRank(50, board);
  assert.equal(tied.rank, 3, "ties rank below everyone at or above this score");
  assert.equal(tied.total, 3);
  const mid = provisionalRank(75, board);
  assert.equal(mid.rank, 2);
  assert.equal(mid.total, 3);
  const top = provisionalRank(200, board);
  assert.equal(top.rank, 1);
  assert.equal(top.total, 3);
}

assert.equal(
  guestRankLine({ score: 10, board: [], signedIn: false, refunded: true }),
  null,
  "refunded runs get no rank",
);
assert.equal(
  guestRankLine({ score: 10, board: [], signedIn: true, refunded: false }),
  null,
  "signed-in runs do not use the would-be line",
);
assert.equal(
  guestRankLine({ score: 10, board: [], signedIn: false, refunded: false }),
  "Would be #1 of 1 today",
);

{
  const board = [{ callsign: "Chiara", score: 12_340 }];
  assert.equal(
    goalLine(653, copper45k, board, 653),
    "Next up: Chiara, 12,340",
    "653 vs copper 45k gives a board target",
  );
}

assert.equal(
  goalLine(30_000, copper45k, [{ callsign: "Chiara", score: 12_340 }], 30_000),
  "15,000 pts to COPPER",
  "30k vs copper 45k gives the medal hint",
);

assert.equal(
  goalLine(200_000, copper45k, [], 200_000),
  null,
  "gold earned gives null",
);

assert.equal(
  goalLine(653, copper45k, [], 653),
  "Beat your best today: 653",
  "no one above on the board falls back to own best",
);

console.log("PASS  game-over goal line + provisional rank");
