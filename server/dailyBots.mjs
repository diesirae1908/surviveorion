// Virtual Daily Patrol board fillers: deterministic per UTC date, no DB rows.
// Generated at board-read time so the combined daily board never looks empty
// early in the UTC day. Bots merge into rankings and gap-to-goal targets but
// never touch wingmates, analytics, or persisted stats.

import { isNicknameBlocked, BLOCKED_CALLSIGN_PSEUDONYMS } from "./nickname.mjs";

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

/** ~60 pilot-flavored bot names — must not overlap BLOCKED_CALLSIGN_PSEUDONYMS. */
export const DAILY_BOT_CALLSIGNS = [
  "Vector Nine",
  "Slipstream Fox",
  "Drift Courier",
  "Nova Ranger",
  "Patchwork Ace",
  "Relay Pilot",
  "Horizon Lark",
  "Kestrel Wing",
  "Meridian Six",
  "Outrun Delta",
  "Pulse Skipper",
  "Quiet Burn",
  "Rim Runner",
  "Signal Hawk",
  "Tactical Sparrow",
  "Uplink Seven",
  "Waypoint Ghost",
  "Zenith Tracer",
  "Apex Courier",
  "Binary Kite",
  "Cinder Pilot",
  "Dockside Nine",
  "Echo Vector",
  "Flare Nomad",
  "Glint Runner",
  "Halo Scout",
  "Ion Shepherd",
  "Jetstream Lark",
  "Kepler Dash",
  "Lumen Drifter",
  "Meteor Courier",
  "Nimbus Ace",
  "Orbital Finch",
  "Parallax One",
  "Quill Pilot",
  "Raptor Relay",
  "Stellar Skipper",
  "Talon Vector",
  "Umbra Wing",
  "Vapor Trace",
  "Wardencraft",
  "Xenon Pilot",
  "Yarrow Dash",
  "Zephyr Nine",
  "Afterburn Lark",
  "Beacon Courier",
  "Canyon Drift",
  "Dusk Tracer",
  "Ember Relay",
  "Falcon Patch",
  "Gale Runner",
  "Harbor Wing",
  "Interlude Six",
  "Javelin Ace",
  "Keel Scout",
  "Lateral Nine",
  "Mistral Dash",
  "Night Courier",
  "Onyx Vector",
  "Pioneer Lark",
];

const BOT_COUNTRIES = [
  "US",
  "CA",
  "GB",
  "DE",
  "FR",
  "AU",
  "JP",
  "BR",
  "NL",
  "SE",
  "NO",
  "IT",
  "ES",
  "PL",
  "NZ",
  "IN",
  "MX",
  "KR",
  "IE",
  "CH",
];
const BOT_MODES = ["desktop", "touch", "tilt"];

/** Hash-picked bot count for a UTC date (20–40 inclusive). */
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
  if (r < 0.99) return Math.floor(280000 + rng() * 20000);
  return Math.floor(300000 + rng() * 80000);
}

/**
 * All bots scheduled for a UTC day (including not-yet-arrived). Each bot
 * carries `_submitAt` for merge tie-breaks and time-gating at read time.
 */
export function allDailyBotsForDate(dailyDate) {
  const count = dailyBotCount(dailyDate);
  const dayStart = Date.parse(`${dailyDate}T00:00:00.000Z`);
  const daySpan = 86_400_000;

  const rng = mulberry32(hashString(`orion-daily-bots-names-${dailyDate}`));
  const indices = DAILY_BOT_CALLSIGNS.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const bots = [];
  for (let i = 0; i < count; i++) {
    const botRng = mulberry32(hashString(`orion-daily-bot-${dailyDate}-${i}`));
    const submitFrac = botRng();
    const submitAt = dayStart + Math.floor(submitFrac * (daySpan - 1));
    bots.push({
      userId: `bot:${dailyDate}:${i}`,
      callsign: DAILY_BOT_CALLSIGNS[indices[i]],
      country: BOT_COUNTRIES[Math.floor(botRng() * BOT_COUNTRIES.length)],
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

/** Bots whose hash-seeded submit time has passed (UTC day fills in over time). */
export function visibleDailyBots(dailyDate, nowMs = Date.now()) {
  return allDailyBotsForDate(dailyDate).filter((b) => b._submitAt <= nowMs);
}
