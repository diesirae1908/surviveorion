// Game-over rank slot regression check, tsx style (matches sim-test.ts /
// test-nickname.ts: manual assertions, no test framework).
//
// Covers `deriveGameOverRank`, the pure decision logic behind the
// simplified end-of-game rank slot (one primary rank + a 2-row mini
// comparison board instead of a dense "Daily #N · World #N · Country #N ·
// N points to pass X" sentence). Deliberately DOM-free so the actual bug
// (a literal "World rank #null" when a run had no rank yet) is testable
// with plain objects.
//
//   npx tsx scripts/test-gameover-rank.ts

import { deriveGameOverRank, type GameOverRankInput } from "../src/ui";

let failures = 0;

function check(label: string, cond: boolean): void {
  if (!cond) {
    failures++;
    console.error(`FAIL ${label}`);
  }
}

function rankOpts(overrides: Partial<{ isDaily: boolean; callsign: string; country: string; runScore: number }> = {}) {
  return {
    isDaily: false,
    callsign: "Ace",
    country: "us",
    runScore: 5000,
    ...overrides,
  };
}

function baseInput(overrides: Partial<GameOverRankInput> = {}): GameOverRankInput {
  return {
    best: 5000,
    worldRank: 42,
    countryRank: 7,
    dailyRank: null,
    nextAbove: null,
    nextWingmate: null,
    ...overrides,
  };
}

// --- Bug fix: a 0-point run has no rank yet (rankOf returns null), the old
// code printed a literal "World rank #null". primaryRank must be null, not
// coerced into a bogus number, so the renderer can omit the line entirely. ---
{
  const r = deriveGameOverRank(baseInput({ best: 0, worldRank: null, countryRank: null }), {
    ...rankOpts({ runScore: 0, callsign: "Rookie", country: "us" }),
  });
  check("no-rank run: primaryRank is null, not a stringified null", r.primaryRank === null);
  check("no-rank run: country omitted (no countryRank)", r.country === null);
}

// --- Single primary rank: daily runs lead with Daily Patrol rank (matches
// TODAY'S BOARD), not both Daily AND World stacked together. ---
{
  const r = deriveGameOverRank(baseInput({ dailyRank: 3, worldRank: 42 }), {
    ...rankOpts({ isDaily: true, country: "ca" }),
  });
  check("daily run: primary label is Daily Patrol", r.primaryLabel === "Daily Patrol");
  check("daily run: primary rank is the daily rank, not world", r.primaryRank === 3);
}

{
  const r = deriveGameOverRank(baseInput({ dailyRank: null, worldRank: 42 }), rankOpts({ country: "ca" }));
  check("non-daily run: primary label is World rank", r.primaryLabel === "World rank");
  check("non-daily run: primary rank is the world rank", r.primaryRank === 42);
}

// --- Country rank: only surfaced when both a country and a rank exist. ---
{
  const withCountry = deriveGameOverRank(baseInput({ countryRank: 7 }), rankOpts({ country: "fr" }));
  check("country rank present + known country: shown", withCountry.country?.rank === 7 && withCountry.country?.code === "fr");

  const noCountrySet = deriveGameOverRank(baseInput({ countryRank: 7 }), rankOpts({ country: "" }));
  check("country rank present but no country set: omitted", noCountrySet.country === null);
}

// --- Target (gap-to-goal): wingmate takes priority over a stranger; no
// target at all once you're already ahead of both (avoid a bogus "beat
// yourself" row). ---
{
  const wingmateAhead = deriveGameOverRank(
    baseInput({ best: 100, nextAbove: { callsign: "Stranger", score: 150 }, nextWingmate: { callsign: "Buddy", score: 120 } }),
    rankOpts({ runScore: 100 }),
  );
  check("wingmate preferred over stranger", wingmateAhead.target?.callsign === "Buddy");
  check("wingmate flagged isWingmate", wingmateAhead.target?.isWingmate === true);

  const strangerOnly = deriveGameOverRank(
    baseInput({ best: 100, nextAbove: { callsign: "Stranger", score: 150 }, nextWingmate: null }),
    rankOpts({ runScore: 100 }),
  );
  check("stranger target when no wingmate", strangerOnly.target?.callsign === "Stranger");
  check("stranger target not flagged isWingmate", strangerOnly.target?.isWingmate === false);

  const alreadyAhead = deriveGameOverRank(
    baseInput({ best: 200, nextAbove: { callsign: "Stranger", score: 150 }, nextWingmate: null }),
    rankOpts({ runScore: 200 }),
  );
  check("no target once you're already ahead of the candidate", alreadyAhead.target === null);

  const tied = deriveGameOverRank(
    baseInput({ best: 150, nextAbove: { callsign: "Stranger", score: 150 }, nextWingmate: null }),
    rankOpts({ runScore: 150 }),
  );
  check("no target on an exact tie (nothing left to catch)", tied.target === null);
}

// --- me: carries this run's score (not the board best) plus callsign/country
// for the pinned own-row. Callsign is masked if blocked. ---
{
  const r = deriveGameOverRank(baseInput({ best: 9000 }), rankOpts({ runScore: 777, callsign: "Voyager", country: "jp" }));
  check("me.callsign passthrough for a clean callsign", r.me.callsign === "Voyager");
  check("me.score is this run, not the board best", r.me.score === 777);
  check("me.country passthrough", r.me.country === "jp");
}
{
  const r = deriveGameOverRank(baseInput({ best: 9000 }), rankOpts({ runScore: 4200, callsign: "Voyager" }));
  check("me.score stays on this run when best is higher", r.me.score === 4200);
}
{
  const r = deriveGameOverRank(baseInput({ best: 1200 }), {
    ...rankOpts({ runScore: 1200, callsign: "trump rapes kids" }),
  });
  check("me.callsign is a fun pseudonym for a blocked legacy callsign", r.me.callsign !== "trump rapes kids");
  check("me.callsign is not the old static redaction string", r.me.callsign !== "Callsign redacted");
  check("me.score still passes through for a blocked callsign", r.me.score === 1200);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("ALL CHECKS PASSED: game-over rank slot (null-rank bug, single primary rank, country rank, wingmate/stranger/no target, this-run score on me row, callsign masking).");
}
