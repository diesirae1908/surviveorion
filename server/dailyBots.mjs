// Virtual Daily Patrol board fillers: deterministic per patrol date, no DB rows.
// Generated at board-read time so the combined daily board never looks empty
// early in the patrol day. Bots merge into rankings and gap-to-goal targets but
// never touch wingmates, analytics, or persisted stats.

import { isNicknameBlocked, BLOCKED_CALLSIGN_PSEUDONYMS } from "./nickname.mjs";
import { patrolDayStartMs } from "./patrolDate.mjs";

/** FNV-1a 32-bit — matches src/math.ts hashString. */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mixed-format fillers so the public board does not read as one generator.
 * Format + country travel together (Kenji stays JP, not a random Polish flag).
 * Must not overlap BLOCKED_CALLSIGN_PSEUDONYMS or live real callsigns.
 */
export const DAILY_BOT_PILOTS = [
  { callsign: "Mira", country: "ES" },
  { callsign: "Kenji", country: "JP" },
  { callsign: "Priya", country: "IN" },
  { callsign: "Mateo", country: "MX" },
  { callsign: "Anika", country: "DE" },
  { callsign: "Tomas", country: "PL" },
  { callsign: "Yara", country: "BR" },
  { callsign: "Niko", country: "FI" },
  { callsign: "Aisha", country: "EG" },
  { callsign: "Pavel", country: "CZ" },
  { callsign: "Ren", country: "KR" },
  { callsign: "Hugo", country: "FR" },
  { callsign: "Elise", country: "NL" },
  { callsign: "Omar", country: "EG" },
  { callsign: "Chiara", country: "IT" },
  { callsign: "Wouter", country: "BE" },
  { callsign: "Jonas", country: "SE" },
  { callsign: "Lina", country: "NO" },
  { callsign: "Ines", country: "PT" },
  { callsign: "Thabo", country: "ZA" },
  { callsign: "jules", country: "FR" },
  { callsign: "nico", country: "IT" },
  { callsign: "ravi", country: "IN" },
  { callsign: "marco", country: "BR" },
  { callsign: "tess", country: "GB" },
  { callsign: "kai", country: "US" },
  { callsign: "lea", country: "FR" },
  { callsign: "sven", country: "SE" },
  { callsign: "ivy", country: "GB" },
  { callsign: "Driftfox", country: "US" },
  { callsign: "Patchwork", country: "CA" },
  { callsign: "Wardencraft", country: "GB" },
  { callsign: "Glint", country: "AU" },
  { callsign: "Beacon", country: "US" },
  { callsign: "Onyx", country: "CA" },
  { callsign: "Quill", country: "GB" },
  { callsign: "Skipper", country: "IE" },
  { callsign: "Finch", country: "NZ" },
  { callsign: "Lark", country: "AU" },
  { callsign: "Reef", country: "AU" },
  { callsign: "Nova Ranger", country: "GB" },
  { callsign: "Quiet Burn", country: "US" },
  { callsign: "Pulse Skipper", country: "DE" },
  { callsign: "Kestrel Wing", country: "IE" },
  { callsign: "Canyon Drift", country: "US" },
  { callsign: "Dusk Tracer", country: "PL" },
  { callsign: "Vapor Trace", country: "SE" },
  { callsign: "Yarrow Dash", country: "NL" },
  { callsign: "Talon Vector", country: "DE" },
  { callsign: "Rim Runner", country: "US" },
  { callsign: "drift", country: "US" },
  { callsign: "ember", country: "CA" },
  { callsign: "fox", country: "GB" },
  { callsign: "byte", country: "US" },
  { callsign: "nimbus", country: "AU" },
  { callsign: "keel", country: "NZ" },
  { callsign: "kade7", country: "US" },
  { callsign: "rex9", country: "GB" },
  { callsign: "vox88", country: "US" },
  { callsign: "millie2", country: "CA" },
];

export const DAILY_BOT_CALLSIGNS = DAILY_BOT_PILOTS.map((p) => p.callsign);

const BOT_MODES = ["desktop", "touch", "tilt"];

/** Hash-picked bot count for a patrol date (20–40 inclusive). */
export function dailyBotCount(dailyDate) {
  const rng = mulberry32(hashString(`orion-daily-bots-count-${dailyDate}`));
  return 20 + Math.floor(rng() * 21);
}

/** Plausible score curve, slightly shifted per bot/day hash. */
function botScore(rng) {
  const r = rng();
  if (r < 0.55) return Math.floor(3000 + rng() * 57000);
  if (r < 0.82) return Math.floor(60000 + rng() * 90000);
  if (r < 0.96) return Math.floor(150000 + rng() * 130000);
  if (r < 0.995) return Math.floor(280000 + rng() * 20000);
  return Math.floor(300000 + rng() * 30000);
}

/**
 * All bots scheduled for a patrol day (including not-yet-arrived). Each bot
 * carries `_submitAt` for merge tie-breaks and time-gating at read time.
 */
export function allDailyBotsForDate(dailyDate) {
  const count = dailyBotCount(dailyDate);
  const dayStart = patrolDayStartMs(dailyDate);
  const daySpan = 86_400_000;

  const rng = mulberry32(hashString(`orion-daily-bots-names-${dailyDate}`));
  const indices = DAILY_BOT_PILOTS.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const bots = [];
  for (let i = 0; i < count; i++) {
    const botRng = mulberry32(hashString(`orion-daily-bot-${dailyDate}-${i}`));
    const submitFrac = botRng();
    const submitAt = dayStart + Math.floor(submitFrac * (daySpan - 1));
    const pilot = DAILY_BOT_PILOTS[indices[i]];
    bots.push({
      userId: `bot:${dailyDate}:${i}`,
      callsign: pilot.callsign,
      country: pilot.country,
      best: botScore(botRng),
      runs: 1,
      bestTime: 60 + Math.floor(botRng() * 420),
      mode: BOT_MODES[Math.floor(botRng() * BOT_MODES.length)],
      virtual: true,
      _submitAt: submitAt,
    });
  }
  return bots;
}

/** Bots whose hash-seeded submit time has passed (patrol day fills in over time). */
export function visibleDailyBots(dailyDate, nowMs = Date.now()) {
  return allDailyBotsForDate(dailyDate).filter((b) => b._submitAt <= nowMs);
}
