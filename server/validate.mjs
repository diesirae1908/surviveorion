// Server-side sanity checks on submitted runs. Mirrors the caps in
// src/config.ts SCORING — keep the two in sync. This is honest-effort
// anti-cheat: it rejects impossible runs, not sophisticated forgeries.

const SURVIVAL_PER_SEC = 2; // survivalPointsPerSecond
const DANGER_PER_MINUTE = 0.25; // dangerPerMinute (uncapped linear danger pay)
const MULT_MAX = 10; // multiplierMax
const KILL_POINTS = 15; // killPoints
// Max per-kill scale: a pulse kill (x2) on a frozen drone (x1.5) stacks to x3.
const MAX_KILL_SCALE = 3; // pulsePointsScale * frozenPointsScale
const CHAIN_EVERY = 5; // chainBonusEvery
const CHAIN_POINTS = 40; // chainBonusPoints
const PULSE_MULTI_POINTS = 60; // pulseMultiKillPoints (paid per kill past the threshold)
const GRAZE_BASE_POINTS = 10; // grazePoints
// Baseline graze ceiling for every run: grazePoints * 1.5 (HUNTING PARTY 1.5x)
// and 8 grazes/s (per-drone 1.5s cooldown in practice). These are floors: the
// per-day mutator math below only ever raises them, never tightens them.
const GRAZE_POINTS_FLOOR_SCALE = 1.5;
const MAX_GRAZES_PER_SEC = 8; // generous ceiling (per-drone 1.5s cooldown in practice)

// Graze scales of the mutators that carry any, keyed by mutator NAME (the key
// server/mutator-schedule.json carries). Server runtime cannot import src/
// (Dockerfile copies only dist/ and server/), so this is a mirror of
// grazePointsScale / grazeCooldownScale in src/mutators.ts. Parity is enforced
// by scripts/test-graze-ceiling.ts; update both together.
//   points: multiplies graze pay. cooldown: multiplies the per-drone graze
//   cooldown (rate ceiling scales by 1/cooldown). Band x2 on GRAZE PROTOCOL is
//   deliberately not modelled: bandwidth only adds drones in range, and the
//   rate is already bounded by the 8/s generous base times 1/0.45 = ~17.8/s.
//   No bot in sim-test.ts measures a graze peak, so the rate is derived from
//   the cooldown, not measured.
export const MUTATOR_GRAZE_SCALES = {
  "HUNTING PARTY": { points: 1.5, cooldown: 1 },
  "GRAZE PROTOCOL": { points: 8, cooldown: 0.45 },
};

/**
 * Graze ceiling factors for a set of active mutator names (a Daily's mutators
 * from the schedule; Sunday pairs multiply, like scaleOf on the client).
 * `null`/undefined/unknown-name input means "no reliable day": use the worst
 * case over the whole pool so nothing legit is rejected.
 */
export function grazeLimits(mutatorNames) {
  let pointsScale = 1;
  let cooldownScale = 1;
  const known =
    Array.isArray(mutatorNames) && mutatorNames.length > 0 && mutatorNames.length <= 2;
  if (known) {
    for (const name of mutatorNames) {
      const g = MUTATOR_GRAZE_SCALES[name];
      if (!g) continue;
      pointsScale *= g.points;
      cooldownScale *= g.cooldown;
    }
  } else {
    // Pool worst case: the two largest point scales could pair up on a Sunday.
    const pts = Object.values(MUTATOR_GRAZE_SCALES).map((g) => g.points).sort((a, b) => b - a);
    pointsScale = (pts[0] ?? 1) * (pts[1] ?? 1);
    cooldownScale = Math.min(...Object.values(MUTATOR_GRAZE_SCALES).map((g) => g.cooldown));
  }
  return {
    points: GRAZE_BASE_POINTS * Math.max(GRAZE_POINTS_FLOOR_SCALE, pointsScale),
    perSec: MAX_GRAZES_PER_SEC / Math.min(1, cooldownScale),
  };
}
// Generous physical ceiling. Ambient spawn rate reaches ~8/s late, but the
// late-growth pass (2026-08-11) keeps creature and plateau mutator days
// escalating past minute 3, so a max-throughput observer at m8-10 can
// legitimately sustain ~11-16 kills/s. 12 was rejecting real skilled runs.
const MAX_KILLS_PER_SEC = 20;
const MAX_TIME_SECONDS = 4 * 3600;

// Board modes (one leaderboard each): desktop keyboard, phone touch stick,
// phone tilt. Scoring config is identical across them, so the ceiling math
// below applies unchanged.
export const MODES = ["desktop", "touch", "tilt"];

// Game modes (Classic / Iron Rain) — separate boards, same scoring config,
// so the ceiling math below applies to both.
export const GAME_MODES = ["classic", "ironrain"];

/**
 * Returns an error string, or null if the run passes sanity checks.
 * `mutatorNames`: the Daily's mutator names for graze scaling (see
 * grazeLimits); omit/null for Classic, Iron Rain, anonymous runs, or a Daily
 * whose date is not in the schedule (all use the pool worst case).
 */
export function validateRun({ score, timeSurvived, kills, maxMultiplier, mode, gameMode = "classic", mutatorNames = null }) {
  if (!MODES.includes(mode)) return "unknown mode";
  if (!GAME_MODES.includes(gameMode)) return "unknown game mode";
  if (![score, timeSurvived, kills, maxMultiplier].every((v) => typeof v === "number" && Number.isFinite(v))) {
    return "malformed run";
  }
  if (score < 0 || kills < 0 || !Number.isInteger(score) || !Number.isInteger(kills)) {
    return "malformed run";
  }
  if (timeSurvived < 3) return "run too short";
  if (timeSurvived > MAX_TIME_SECONDS) return "run too long";
  if (maxMultiplier < 1 || maxMultiplier > MULT_MAX) return "impossible multiplier";
  if (kills > timeSurvived * MAX_KILLS_PER_SEC) return "impossible kill rate";

  // Upper bound on what this run could have scored: max survival pay the
  // whole time, every kill a max-scaled skill kill at max multiplier and
  // end-of-run danger factor, every chain bonus banked, and every kill also
  // paying the pulse multi-kill bonus.
  // Survival with linear danger pay: integral of 5*(1 + t/120) dt
  const survivalMax =
    SURVIVAL_PER_SEC *
    (timeSurvived + (timeSurvived * timeSurvived * DANGER_PER_MINUTE) / 120) *
    MULT_MAX;
  const dangerEnd = 1 + (timeSurvived / 60) * DANGER_PER_MINUTE;
  const killMax = kills * KILL_POINTS * MAX_KILL_SCALE * MULT_MAX * dangerEnd;
  const chains = Math.floor(kills / CHAIN_EVERY);
  const chainMax = ((chains * (chains + 1)) / 2) * CHAIN_POINTS * MULT_MAX;
  const pulseMultiMax = kills * PULSE_MULTI_POINTS * MULT_MAX;
  // Graze pay: bounded by a generous max graze rate over the whole run at max
  // multiplier and end-of-run danger (mirrors registerGraze in scoring.ts).
  const graze = grazeLimits(mutatorNames);
  const grazeMax = timeSurvived * graze.perSec * graze.points * MULT_MAX * dangerEnd;
  const ceiling = (survivalMax + killMax + chainMax + pulseMultiMax + grazeMax) * 1.1 + 100;

  if (score > ceiling) return "score exceeds possible ceiling";
  return null;
}
