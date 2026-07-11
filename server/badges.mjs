// Badge definitions and award logic. Display metadata (names, icons,
// descriptions) lives client-side in src/badges.ts — keep the IDs in sync.

/**
 * Each check sees:
 *   run    — the just-submitted run { score, timeSurvived, kills, maxMultiplier, mode }
 *   career — cumulative aggregates AFTER this run { runs, totalKills, totalTime }
 *   worldRank — 1-based world rank of the player's best in this mode
 */
const CHECKS = {
  // --- easy: most pilots see these in their first session ---
  first_flight: ({ career }) => career.runs >= 1,
  space_dust: ({ run }) => run.timeSurvived < 10,
  blooded: ({ run }) => run.kills >= 50,
  staying_alive: ({ run }) => run.timeSurvived >= 120,
  // debriefed is awarded from the feedback route, never from a run
  debriefed: () => false,

  // --- medium ---
  centurion: ({ run }) => run.kills >= 250,
  five_alive: ({ run }) => run.timeSurvived >= 300,
  millionaire: ({ run }) => run.score >= 1_000_000,
  // x10 is the multiplier cap (SCORING.multiplierMax) — this is "hit the cap"
  chain_reaction: ({ run }) => run.maxMultiplier >= 10,
  pacifist: ({ run }) => run.timeSurvived >= 90 && run.kills === 0,

  // --- rare ---
  swarm_reaper: ({ run }) => run.kills >= 1000,
  decade: ({ run }) => run.timeSurvived >= 600,
  ten_million: ({ run }) => run.score >= 10_000_000,
  galaxys_finest: ({ worldRank }) => worldRank === 1,

  // --- cumulative grinds ---
  veteran: ({ career }) => career.runs >= 100,
  harvester: ({ career }) => career.totalKills >= 10_000,
  ironclad: ({ career }) => career.totalTime >= 3600,
};

export const BADGE_IDS = Object.keys(CHECKS);

/** Badge ids this run qualifies for (already-earned filtering happens in the DB). */
export function qualifyingBadges(run, career, worldRank) {
  const ctx = { run, career, worldRank };
  return BADGE_IDS.filter((id) => CHECKS[id](ctx));
}
