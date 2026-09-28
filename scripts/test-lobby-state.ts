/**
 * Headless tests for daily lobby presentation math (no DOM).
 * Run: npx tsx scripts/test-lobby-state.ts
 */
import assert from "node:assert/strict";
import {
  boardNeighborhood,
  currentStreak,
  lobbyPhase,
  nextMedalProgress,
  weekStrip,
  type WeekCell,
} from "../src/lobbyState.ts";
import { glyphSvg } from "../src/mutatorGlyphs.ts";
import type { DailyDayLog } from "../src/save.ts";
import type { MedalThresholds } from "../src/medals.ts";

const T: MedalThresholds = { copper: 45_000, silver: 100_000, gold: 230_000 };
const thresholdsFor = (): MedalThresholds => T;

function phase(
  overrides: Partial<{
    online: boolean;
    preview: boolean;
    unlimitedDaily: boolean;
    attemptsLeft: number;
    maxAttempts: number;
  }>,
  runCount = 3,
) {
  return lobbyPhase(
    {
      online: true,
      attemptsLeft: 3,
      maxAttempts: 3,
      ...overrides,
    },
    runCount,
  );
}

assert.equal(phase({ online: false }), "offline", "offline when the server is down");
assert.equal(phase({ online: false, preview: true }), "unlimited", "preview still paints while offline");
assert.equal(phase({ unlimitedDaily: true, attemptsLeft: 0 }), "unlimited");
assert.equal(phase({ preview: true, attemptsLeft: 0 }), "unlimited");
assert.equal(phase({ attemptsLeft: 3 }), "pre");
assert.equal(phase({ attemptsLeft: 2 }), "mid");
assert.equal(phase({ attemptsLeft: 1 }), "mid");
assert.equal(phase({ attemptsLeft: 0 }), "out");
assert.equal(phase({ attemptsLeft: 3 }, 0), "pre", "first-visit runCount does not change phase");

const board = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15].map((rank) => ({
  rank,
  name: `#${rank}`,
}));

{
  const n = boardNeighborhood(board, 1, 8);
  assert.equal(n.top[0]?.rank, 1);
  assert.equal(n.gap, false);
  assert.equal(n.around.length, 0, "rank 1 stays in the top slice");
}
{
  const n = boardNeighborhood(board, 2, 8);
  assert.ok(n.top.some((r) => r.rank === 2));
  assert.equal(n.gap, false);
  assert.equal(n.around.length, 0, "rank 2 stays in the top slice");
}
{
  const n = boardNeighborhood(board, 14, 8);
  assert.equal(n.top.length, 8);
  assert.equal(n.gap, true, "rank well below N gets a gap");
  assert.deepEqual(
    n.around.map((r) => r.rank),
    [13, 14, 15],
  );
}
{
  const n = boardNeighborhood(board, 9, 8);
  assert.equal(n.gap, false, "rank N+1 sits flush under the top, no gap");
  assert.ok(n.around.some((r) => r.rank === 9));
}
{
  const n = boardNeighborhood(board, null, 8);
  assert.equal(n.top.length, 8);
  assert.equal(n.gap, false);
  assert.equal(n.around.length, 0);
}

const TODAY = "2026-09-27";
const history: DailyDayLog[] = [
  { date: "2026-09-26", attemptsUsed: 2, best: { score: 212_040, time: 120, maxMultiplier: 6, rank: 9, attempt: 1 } },
  { date: "2026-09-25", attemptsUsed: 1, best: { score: 80_000, time: 90, maxMultiplier: 4, rank: 20, attempt: 1 } },
  { date: "2026-09-24", attemptsUsed: 3, best: { score: 40_000, time: 70, maxMultiplier: 3, rank: 30, attempt: 2 } },
  { date: "2026-09-22", attemptsUsed: 0, best: null },
];

{
  const cells = weekStrip(history, TODAY, { used: 0, best: null }, thresholdsFor);
  assert.equal(cells.length, 7);
  assert.equal(cells[6].date, TODAY);
  assert.equal(cells[6].state, "today");
  assert.equal(cells[5].state, "silver", "yesterday 212k is silver vs 100k");
  assert.equal(cells[4].state, "copper");
  assert.equal(cells[3].state, "flown", "score under copper still counts as flown");
  assert.equal(cells[2].state, "missed", "Sep 23 has no local row");
  assert.equal(currentStreak(cells), 3, "open today: streak is yesterday plus two prior flown days");
}

{
  const cells = weekStrip(
    history,
    TODAY,
    { used: 1, best: { score: 187_430, time: 142, maxMultiplier: 7, rank: 14, attempt: 1 } },
    thresholdsFor,
  );
  assert.equal(cells[6].state, "silver", "today's 187k is silver");
  assert.equal(currentStreak(cells), 4, "today flown continues the streak");
}

{
  const broken: WeekCell[] = [
    { date: "2026-09-21", dow: "MON", state: "gold", medal: "gold" },
    { date: "2026-09-22", dow: "TUE", state: "missed", medal: null },
    { date: "2026-09-23", dow: "WED", state: "copper", medal: "copper" },
    { date: "2026-09-24", dow: "THU", state: "flown", medal: null },
    { date: "2026-09-25", dow: "FRI", state: "silver", medal: "silver" },
    { date: "2026-09-26", dow: "SAT", state: "gold", medal: "gold" },
    { date: "2026-09-27", dow: "SUN", state: "today", medal: null },
  ];
  assert.equal(currentStreak(broken), 4, "missed day breaks the earlier gold");
}

{
  const none = nextMedalProgress(0, T);
  assert.equal(none.earned, null);
  assert.equal(none.next, "copper");
  assert.equal(none.remaining, 45_000);
  assert.equal(none.ratio, 0);

  const mid = nextMedalProgress(187_430, T);
  assert.equal(mid.earned, "silver");
  assert.equal(mid.next, "gold");
  assert.equal(mid.remaining, 42_570);
  assert.ok(mid.ratio > 0.6 && mid.ratio < 0.7);

  const gold = nextMedalProgress(230_000, T);
  assert.equal(gold.earned, "gold");
  assert.equal(gold.next, null);
  assert.equal(gold.ratio, 1);
}

{
  const known = glyphSvg("overcharge");
  assert.match(known, /<svg /);
  assert.match(known, /polygon/);
  const unknown = glyphSvg("not-a-real-mutator");
  assert.match(unknown, /<svg /);
  assert.match(unknown, />N</, "fallback glyph uses the first letter");
  assert.notEqual(unknown, known);
}

console.log("lobby-state: all pass");
