// Client-side mirror of server/nickname.mjs. Cosmetic only: it exists so an
// obviously-blocked callsign gets an instant in-page message instead of a
// round trip; it is NOT the enforcement point. The server re-checks every
// callsign on register/guest-signup/reclaim/profile-update regardless of
// what this file says, so a hand-crafted request can't bypass the filter.
//
// Keep every list/function here in sync with server/nickname.mjs (same
// convention this repo already uses for SCORING vs validate.mjs). The two
// runtimes can't share a module (Vite/TS client vs zero-dependency Node ESM
// server), so this is a deliberate, documented duplication rather than an
// oversight. See server/nickname.mjs for the full three-tier matching
// rationale (SUBSTRING / TOKEN / PHRASE) and the "niger"/"Nigeria" note on
// why elongation uses a per-letter regex floor instead of collapsing.

const SUBSTRING_BLOCKED_TERMS = [
  "nigger", "nigga", "faggot", "fag", "chink", "kike", "tranny",
  "retard", "retarded", "coon", "gook", "wetback", "cripple",
  "fuck", "shit", "cunt", "pussy", "whore", "slut", "bastard",
  "bitch", "asshole", "motherfucker", "dildo",
  "pedophile", "nazi", "hitler", "terrorist", "kys", "suicide",
  "porn", "vagina",
];

const TOKEN_BLOCKED_TERMS = [
  "dick",
  "rape", "raped", "rapes", "raping", "rapist", "rapists",
  "pedo", "pedos",
  "spic", "spics",
  "isis",
  "cock", "cocks",
];

const PHRASE_BLOCKED_SUBSTRINGS = ["is a pedo", "is a pedophile", "is a rapist"];

const SAFE_EXCEPTIONS: string[] = [];

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

function mapChars(raw: string): string {
  const stripped = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  let out = "";
  for (const ch of stripped) out += LEET_MAP[ch] ?? ch;
  return out;
}

/** See server/nickname.mjs normalizeForFilter for the full rationale. */
export function normalizeForFilter(raw: string): string {
  return mapChars(raw).replace(/[^a-z0-9]/g, "");
}

function tokensOf(raw: string): string[] {
  return mapChars(raw).match(/[a-z0-9]+/g) ?? [];
}

function letterFloorSource(term: string): string {
  return [...term].map((ch) => `${ch}+`).join("");
}

const buildSubstringPattern = (term: string) => new RegExp(letterFloorSource(normalizeForFilter(term)));
const buildTokenPattern = (term: string) => new RegExp(`^${letterFloorSource(normalizeForFilter(term))}$`);

const SUBSTRING_PATTERNS = SUBSTRING_BLOCKED_TERMS.map(buildSubstringPattern);
const PHRASE_PATTERNS = PHRASE_BLOCKED_SUBSTRINGS.map(buildSubstringPattern);
const TOKEN_PATTERNS = TOKEN_BLOCKED_TERMS.map(buildTokenPattern);
const NORMALIZED_SAFE_EXCEPTIONS = new Set(SAFE_EXCEPTIONS.map(normalizeForFilter));

export function isNicknameBlocked(raw: string): boolean {
  if (typeof raw !== "string") return true;
  const compact = normalizeForFilter(raw);
  if (!compact) return false;
  if (NORMALIZED_SAFE_EXCEPTIONS.has(compact)) return false;
  if (SUBSTRING_PATTERNS.some((re) => re.test(compact))) return true;
  if (PHRASE_PATTERNS.some((re) => re.test(compact))) return true;
  const tokens = tokensOf(raw);
  return tokens.some((tok) => TOKEN_PATTERNS.some((re) => re.test(tok)));
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
// owner's own callsign view.
const REDACTED_CALLSIGN = "Callsign redacted";

export function sanitizeCallsignForDisplay(raw: string): string {
  if (typeof raw !== "string") return REDACTED_CALLSIGN;
  return isNicknameBlocked(raw) ? REDACTED_CALLSIGN : raw;
}
