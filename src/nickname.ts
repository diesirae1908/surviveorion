// Client-side mirror of server/nickname.mjs. Cosmetic only: it exists so an
// obviously-blocked callsign gets an instant in-page message instead of a
// round trip; it is NOT the enforcement point. The server re-checks every
// callsign on register/guest-signup/reclaim/profile-update regardless of
// what this file says, so a hand-crafted request can't bypass the filter.
//
// Keep BLOCKED_TERMS / SAFE_EXCEPTIONS / LEET_MAP / the matching logic in
// sync with server/nickname.mjs (same convention this repo already uses for
// SCORING vs validate.mjs — the two runtimes can't share a module, Vite/TS
// client vs zero-dependency Node ESM server, so this is a deliberate,
// documented duplication rather than an oversight). See server/nickname.mjs
// for the full rationale behind the term list and the matching approach.

const BLOCKED_TERMS = [
  "nigger", "nigga", "faggot", "fag", "chink", "spic", "kike", "tranny",
  "retard", "retarded", "coon", "gook", "wetback", "beaner", "paki",
  "fuck", "shit", "cunt", "dick", "pussy", "whore", "slut", "bastard",
  "bitch", "asshole", "motherfucker", "dildo", "porn", "vagina", "blowjob",
  "cumshot",
  "pedo", "pedophile", "paedophile", "rapist", "rape", "raper", "molester",
  "molests", "incest",
  "nazi", "hitler", "isis", "terrorist", "kkk", "genocide",
  "kys", "kill yourself", "suicide",
  // 2026-08-18: scatological/sexual compounds + redaction-feature mockery
  // (see server/nickname.mjs for the full rationale and the skipped-terms
  // note: "butt"/"nuts"/"redact" deliberately stay off the list).
  "buttsniff", "deeznuts", "deezenuts", "deeznutz", "deezenutz",
];

const SAFE_EXCEPTIONS: string[] = [
  "Scunthorpe",
  "Grape", "Grapes", "Grapefruit", "Grapevine",
  "Drape", "Drapes", "Drapery",
  "Therapist", "Therapists",
  "Despicable", "Conspicuous",
  "Retardant",
];

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "2": "z",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "+": "t",
  "!": "i",
  "|": "i",
};

/** See server/nickname.mjs normalizeForFilter for the full rationale. */
export function normalizeForFilter(raw: string): string {
  const stripped = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  let out = "";
  for (const ch of stripped) out += LEET_MAP[ch] ?? ch;
  return out.replace(/[^a-z0-9]/g, "");
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/;
const escapeRegexChar = (ch: string): string => (REGEX_SPECIAL.test(ch) ? `\\${ch}` : ch);

/** See server/nickname.mjs buildTermPattern for the full rationale. */
function buildTermPattern(term: string): RegExp {
  const normalized = normalizeForFilter(term);
  const pattern = [...normalized].map((ch) => `${escapeRegexChar(ch)}+`).join("");
  return new RegExp(pattern);
}

const BLOCKED_PATTERNS = BLOCKED_TERMS.map(buildTermPattern);
const NORMALIZED_SAFE_EXCEPTIONS = new Set(SAFE_EXCEPTIONS.map(normalizeForFilter));

export function isNicknameBlocked(raw: string): boolean {
  if (typeof raw !== "string") return true;
  const normalized = normalizeForFilter(raw);
  if (!normalized) return false;
  if (NORMALIZED_SAFE_EXCEPTIONS.has(normalized)) return false;
  return BLOCKED_PATTERNS.some((re) => re.test(normalized));
}

const REJECTION_MESSAGES = [
  "Command flagged that callsign. Try one that survives daylight.",
  "HQ bounced that one. Something a squadron won't wince at, pilot.",
  "Negative, pilot. That callsign won't clear flight review.",
  "Even the drones have better manners. Pick a new callsign.",
  "That callsign just got grounded before liftoff. Try another.",
  "Flight review says no. Wear a callsign you'd want on the record.",
];

export function pickRejectionMessage(): string {
  return REJECTION_MESSAGES[Math.floor(Math.random() * REJECTION_MESSAGES.length)]!;
}

// See server/nickname.mjs sanitizeCallsignForDisplay for the full rationale:
// a display-time backstop for legacy rows, never applied to the account
// owner's own callsign view. Blocked names map to a deterministic fun
// pseudonym (FNV-1a over the raw callsign) — keep BLOCKED_CALLSIGN_PSEUDONYMS
// and fnv1aCallsign in lockstep with server/nickname.mjs.
export const BLOCKED_CALLSIGN_PSEUDONYMS = [
  "Dusty Comet",
  "Space Cadet 7",
  "Captain Void",
  "Orbit Gremlin",
  "Rogue Meteor",
  "Moon Moth",
  "Solar Windbag",
  "Nebula Nobody",
  "Asteroid Ace",
  "Cosmic Turnip",
  "Star Muffin",
  "Zero G Hero",
  "Drifting Pickle",
  "Warp Snail",
  "Galaxy Goose",
  "Photon Phantom",
  "Quasar Quokka",
  "Belt Runner",
  "Redacted Comet",
  "Anonymous Nova",
  "Pluto Apologist",
  "Comet Chaser",
  "Stray Satellite",
  "Major Moonbeam",
] as const;

/** FNV-1a 32-bit hash — must match server/nickname.mjs fnv1aCallsign exactly. */
function fnv1aCallsign(raw: string): number {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function blockedCallsignPseudonym(raw: string): string {
  return BLOCKED_CALLSIGN_PSEUDONYMS[fnv1aCallsign(raw) % BLOCKED_CALLSIGN_PSEUDONYMS.length]!;
}

export function sanitizeCallsignForDisplay(raw: string): string {
  if (typeof raw !== "string") return blockedCallsignPseudonym("");
  return isNicknameBlocked(raw) ? blockedCallsignPseudonym(raw) : raw;
}

/**
 * Sanitizes the callsign on a client-built "pinned me" row before it reaches
 * a leaderboard-shaped display (2026-08-17 review finding: `fillDailyBoard`
 * and `community.ts`'s `renderBoard` both build their pinned "me" row from
 * the account's own raw callsign, since the server can only sanitize the
 * `entries` it returns, not a row the client assembles locally afterward).
 * Every such row is a shareable, screenshot-prone surface (a daily-board
 * pin, a world/arena/squadron board pin, the game-over rank comparison),
 * so it needs the same masking the server applies everywhere else a
 * callsign reaches the public eye. Never applied to the account owner's own
 * private views of their own callsign (profile edit field, the menu's
 * "signed in as" indicator): those need the real value, same carve-out as
 * sanitizeCallsignForDisplay above.
 */
export function sanitizePinnedRow<T extends { callsign: string }>(row: T): T {
  return { ...row, callsign: sanitizeCallsignForDisplay(row.callsign) };
}
