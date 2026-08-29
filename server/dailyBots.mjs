// Virtual Daily Patrol board fillers: deterministic per patrol date, no DB rows.
// Generated at board-read time so the combined daily board never looks empty
// early in the patrol day. Bots merge into rankings and gap-to-goal targets but
// never touch wingmates, analytics, or persisted stats.
//
// Melting pot: each day is a shuffled quota of real first names, typos, ALL
// CAPS, lowercase, digit handles, Dofus syllable mashes, two-word sci-fi
// labels, and real-word pairs that do not make sense together.

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

const CALLSIGN_RE = /^[A-Za-z0-9_\- ]{3,20}$/;

export const CALLSIGN_STYLES = [
  "normal",
  "typo",
  "caps",
  "lower",
  "digits",
  "dofus",
  "twoWord",
  "nonsense",
  "oneWord",
];

const FIRST_NAMES = [
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
  { callsign: "Jules", country: "FR" },
  { callsign: "Nico", country: "IT" },
  { callsign: "Ravi", country: "IN" },
  { callsign: "Marco", country: "BR" },
  { callsign: "Tess", country: "GB" },
  { callsign: "Kai", country: "US" },
  { callsign: "Lea", country: "FR" },
  { callsign: "Sven", country: "SE" },
  { callsign: "Ivy", country: "GB" },
  { callsign: "Elena", country: "ES" },
  { callsign: "Sofia", country: "IT" },
  { callsign: "Luca", country: "IT" },
  { callsign: "Nora", country: "DE" },
  { callsign: "Amir", country: "EG" },
  { callsign: "Soren", country: "DK" },
  { callsign: "Pia", country: "NO" },
  { callsign: "Theo", country: "FR" },
  { callsign: "Mila", country: "NL" },
  { callsign: "Ryo", country: "JP" },
  { callsign: "Aya", country: "JP" },
  { callsign: "Cleo", country: "GR" },
  { callsign: "Dario", country: "IT" },
  { callsign: "Farid", country: "MA" },
  { callsign: "Hana", country: "CZ" },
  { callsign: "Jade", country: "GB" },
  { callsign: "Koen", country: "NL" },
  { callsign: "Nabil", country: "MA" },
  { callsign: "Oona", country: "FI" },
  { callsign: "Quinn", country: "US" },
  { callsign: "Sami", country: "FI" },
];

const ONE_WORD = [
  "Driftfox", "Patchwork", "Wardencraft", "Glint", "Beacon", "Onyx",
  "Quill", "Skipper", "Finch", "Lark", "Reef", "Ember", "Nimbus",
  "Keel", "Nova", "Pulse", "Talon", "Vapor", "Dusk", "Yarrow",
  "Byte", "Orca", "Piston", "Wick", "Halo", "Brine", "Cinder",
];

const SCI_LEFT = [
  "Nova", "Quiet", "Pulse", "Kestrel", "Canyon", "Dusk", "Vapor",
  "Yarrow", "Talon", "Rim", "Meteor", "Solar", "Ion", "Drift", "Ash",
];
const SCI_RIGHT = [
  "Ranger", "Burn", "Skipper", "Wing", "Drift", "Tracer", "Trace",
  "Dash", "Vector", "Runner", "Courier", "Patch", "Falcon", "Sparrow",
];

const ODD_LEFT = [
  "Velvet", "Humble", "Soft", "Orange", "Bronze", "Paper", "Gentle",
  "Dusty", "Rapid", "Silver", "Frozen", "Modest", "Hollow", "Warm",
  "Lucky", "Crooked", "Honest", "Idle", "Brisk", "Plain",
];
const ODD_RIGHT = [
  "Spoon", "Brick", "Ladder", "Anchor", "Potato", "Kettle", "Comet",
  "Hammer", "Piano", "Onion", "Elbow", "Wallet", "Rocket", "Button",
  "Socket", "Pebble", "Magnet", "Harbor", "Blanket", "Turnip",
];

const START = [
  "al", "an", "ar", "az", "el", "en", "er", "ez",
  "il", "ir", "ol", "or", "ul", "ur",
  "xa", "xe", "xi", "za", "zo",
  "ka", "ke", "ko", "ma", "me", "mi",
  "na", "ne", "ra", "re", "ri",
  "sa", "se", "so", "ta", "te", "to",
  "va", "ve", "vo", "ya", "ye",
];

const MID = [
  "al", "el", "il", "ol",
  "an", "en", "in", "on",
  "ar", "er", "or",
  "ix", "ax",
];

const END = [
  "an", "en", "in", "on",
  "el", "il", "ol",
  "ix", "ax", "ox",
  "as", "is", "os",
  "or", "iel", "um",
  "ette", "ine",
];

const SYL = [
  "ka", "zu", "mi", "ro", "ta", "li", "ne", "xo", "ra", "vu",
  "shi", "ko", "na", "ri", "te", "lu", "za", "mo", "ki", "re",
  "ya", "to", "su", "me", "no", "ha", "yo", "xe", "vo",
  "ze", "tha", "lo", "vi", "ry",
];

export const DAILY_BOT_COUNTRIES = [
  "US", "CA", "GB", "FR", "DE", "ES", "IT", "NL", "BE", "SE",
  "NO", "FI", "PL", "CZ", "PT", "IE", "AU", "NZ", "JP", "KR",
  "IN", "BR", "MX", "EG", "ZA", "DK", "GR", "MA",
];

const RESERVED_LIVE = new Set([
  "trip", "jarsco", "luciano", "l33x", "bellend", "haribro", "luciux",
]);

const PSEUDONYM_FOLD = new Set(BLOCKED_CALLSIGN_PSEUDONYMS.map((n) => n.toLowerCase()));

const UGLY = /kkk|sex|cum|fag|nazi|kys|dic|cok|fux|fuk/;

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function shuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function titlePart(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function stylesForCount(rng, count) {
  const bag = [];
  while (bag.length < count) bag.push(...CALLSIGN_STYLES);
  return shuffle(rng, bag).slice(0, count);
}

function pickFirst(rng) {
  return pick(rng, FIRST_NAMES);
}

function pairFrom(rng, left, right) {
  for (let i = 0; i < 8; i++) {
    const a = pick(rng, left);
    const b = pick(rng, right);
    if (a.toLowerCase() === b.toLowerCase()) continue;
    const name = `${a} ${b}`;
    if (name.length >= 5 && name.length <= 20) return name;
  }
  return `${left[0]} ${right[0]}`;
}

function typoName(rng, raw) {
  if (raw.length < 3) return raw;
  const i = Math.max(1, Math.floor(rng() * raw.length));
  const kind = rng();
  let out;
  if (kind < 0.34) out = raw.slice(0, i) + raw[i] + raw.slice(i);
  else if (kind < 0.67 && i < raw.length - 1) {
    out = raw.slice(0, i) + raw[i + 1] + raw[i] + raw.slice(i + 2);
  } else if (raw.length > 4) {
    out = raw.slice(0, i) + raw.slice(i + 1);
  } else {
    out = raw.slice(0, i) + raw[i] + raw.slice(i);
  }
  return out.length >= 4 ? out : raw.slice(0, i) + raw[i] + raw.slice(i);
}

function rollAnkamaPart(rng) {
  const start = pick(rng, START);
  let mid = pick(rng, MID);
  const startTail = start[start.length - 1];
  if (mid[0] === startTail && "aeiou".includes(startTail)) mid = pick(rng, MID);
  let end = pick(rng, END);
  if (end === mid) end = pick(rng, END);
  return start + mid + end;
}

function rollSyllableMash(rng) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    let syl = pick(rng, SYL);
    if (syl === parts[parts.length - 1]) syl = pick(rng, SYL);
    parts.push(syl);
  }
  return parts.join("");
}

function rollDofus(rng) {
  if (rng() < 0.18) {
    const a = rollAnkamaPart(rng);
    const b = rollAnkamaPart(rng);
    if (a.length >= 5 && b.length >= 5 && a !== b) {
      const joined = `${titlePart(a)}-${titlePart(b)}`;
      if (joined.length <= 20) return joined;
    }
    return titlePart(a);
  }
  if (rng() < 0.4) return titlePart(rollSyllableMash(rng));
  return titlePart(rollAnkamaPart(rng));
}

function withDigits(rng, base) {
  const n = rng() < 0.55 ? Math.floor(rng() * 10) : 10 + Math.floor(rng() * 90);
  const glue = rng() < 0.2 ? "_" : "";
  const name = `${base}${glue}${n}`;
  return name.length <= 20 ? name : `${base}${n % 10}`;
}

function rollStyle(rng, style) {
  if (style === "normal") return pickFirst(rng).callsign;
  if (style === "typo") {
    const base = rng() < 0.7 ? pickFirst(rng).callsign : pick(rng, ONE_WORD);
    return typoName(rng, base);
  }
  if (style === "caps") {
    const base = rng() < 0.55 ? pickFirst(rng).callsign : pick(rng, ONE_WORD);
    return base.toUpperCase();
  }
  if (style === "lower") {
    const base = rng() < 0.55 ? pickFirst(rng).callsign : pick(rng, ONE_WORD);
    return base.toLowerCase();
  }
  if (style === "digits") {
    const base = rng() < 0.6 ? pickFirst(rng).callsign : pick(rng, ONE_WORD);
    const folded = rng() < 0.45 ? base.toLowerCase() : base;
    return withDigits(rng, folded);
  }
  if (style === "dofus") return rollDofus(rng);
  if (style === "twoWord") return pairFrom(rng, SCI_LEFT, SCI_RIGHT);
  if (style === "nonsense") return pairFrom(rng, ODD_LEFT, ODD_RIGHT);
  if (style === "oneWord") return pick(rng, ONE_WORD);
  return pickFirst(rng).callsign;
}

function countryForName(name, rng) {
  const folded = name.toLowerCase().replace(/[0-9_ -]/g, "");
  const hit = FIRST_NAMES.find((p) => p.callsign.toLowerCase() === folded);
  if (hit) return hit.country;
  return pick(rng, DAILY_BOT_COUNTRIES);
}

export function isUsableGamePseudo(name, used) {
  if (typeof name !== "string") return false;
  if (!CALLSIGN_RE.test(name)) return false;
  if (name.length < 3 || name.length > 20) return false;
  if (/(.)\1\1/.test(name)) return false;
  const folded = name.toLowerCase();
  if (used?.has(folded)) return false;
  if (RESERVED_LIVE.has(folded)) return false;
  if (PSEUDONYM_FOLD.has(folded)) return false;
  if (isNicknameBlocked(name)) return false;
  if (UGLY.test(folded)) return false;
  return true;
}

/** Deterministic melting-pot callsign. Mutates `used` with the folded name. */
export function generateGamePseudo(rng, used = new Set(), style) {
  const order = style
    ? [style, ...shuffle(rng, CALLSIGN_STYLES.filter((s) => s !== style))]
    : shuffle(rng, CALLSIGN_STYLES.slice());
  for (let attempt = 0; attempt < 64; attempt++) {
    const name = rollStyle(rng, order[attempt % order.length]);
    if (!isUsableGamePseudo(name, used)) continue;
    used.add(name.toLowerCase());
    return name;
  }
  for (let i = 0; i < START.length; i++) {
    const name = titlePart(START[i] + END[i % END.length] + "ix");
    if (isUsableGamePseudo(name, used)) {
      used.add(name.toLowerCase());
      return name;
    }
  }
  throw new Error("callsign generator exhausted unique names");
}

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
  const nameRng = mulberry32(hashString(`orion-daily-bots-mix-${dailyDate}`));
  const styles = stylesForCount(nameRng, count);
  const used = new Set();

  const bots = [];
  for (let i = 0; i < count; i++) {
    const botRng = mulberry32(hashString(`orion-daily-bot-${dailyDate}-${i}`));
    const submitFrac = botRng();
    const submitAt = dayStart + Math.floor(submitFrac * (daySpan - 1));
    const callsign = generateGamePseudo(nameRng, used, styles[i]);
    bots.push({
      userId: `bot:${dailyDate}:${i}`,
      callsign,
      country: countryForName(callsign, botRng),
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
