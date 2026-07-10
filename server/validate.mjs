// Server-side sanity checks on submitted runs. Mirrors the caps in
// src/config.ts SCORING — keep the two in sync. This is honest-effort
// anti-cheat: it rejects impossible runs, not sophisticated forgeries.

const SURVIVAL_CAP_PER_SEC = 20; // survivalPointsCap
const MULT_MAX = 10; // multiplierMax
const KILL_POINTS = 40; // killPoints
const CHAIN_EVERY = 5; // chainBonusEvery
const CHAIN_POINTS = 100; // chainBonusPoints
const MAX_KILLS_PER_SEC = 10; // generous physical ceiling
const MAX_TIME_SECONDS = 4 * 3600;

/** Returns an error string, or null if the run passes sanity checks. */
export function validateRun({ score, timeSurvived, kills, maxMultiplier }) {
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
  // whole time, every kill at max multiplier, every chain bonus banked.
  const survivalMax = timeSurvived * SURVIVAL_CAP_PER_SEC * MULT_MAX;
  const killMax = kills * KILL_POINTS * MULT_MAX;
  const chains = Math.floor(kills / CHAIN_EVERY);
  const chainMax = ((chains * (chains + 1)) / 2) * CHAIN_POINTS * MULT_MAX;
  const ceiling = (survivalMax + killMax + chainMax) * 1.1 + 100;

  if (score > ceiling) return "score exceeds possible ceiling";
  return null;
}
