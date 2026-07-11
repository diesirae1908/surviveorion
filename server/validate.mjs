// Server-side sanity checks on submitted runs. Mirrors the caps in
// src/config.ts SCORING — keep the two in sync. This is honest-effort
// anti-cheat: it rejects impossible runs, not sophisticated forgeries.

const SURVIVAL_PER_SEC = 5; // survivalPointsPerSecond
const DANGER_PER_MINUTE = 0.5; // dangerPerMinute (uncapped linear danger pay)
const MULT_MAX = 10; // multiplierMax
const KILL_POINTS = 40; // killPoints
// Max per-kill scale: a pulse kill (x2) on a frozen drone (x1.5) stacks to x3.
const MAX_KILL_SCALE = 3; // pulsePointsScale * frozenPointsScale
const CHAIN_EVERY = 5; // chainBonusEvery
const CHAIN_POINTS = 100; // chainBonusPoints
const PULSE_MULTI_POINTS = 150; // pulseMultiKillPoints (paid per kill past the threshold)
const MAX_KILLS_PER_SEC = 10; // generous physical ceiling
const MAX_TIME_SECONDS = 4 * 3600;

// Board modes (one leaderboard each): desktop keyboard, phone touch stick,
// phone tilt. Scoring config is identical across them, so the ceiling math
// below applies unchanged.
export const MODES = ["desktop", "touch", "tilt"];

/** Returns an error string, or null if the run passes sanity checks. */
export function validateRun({ score, timeSurvived, kills, maxMultiplier, mode }) {
  if (!MODES.includes(mode)) return "unknown mode";
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
  const ceiling = (survivalMax + killMax + chainMax + pulseMultiMax) * 1.1 + 100;

  if (score > ceiling) return "score exceeds possible ceiling";
  return null;
}
