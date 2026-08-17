// Client-side mirror of server/nickname.mjs. Cosmetic only: it exists so an
// obviously-blocked callsign gets an instant in-page message instead of a
// round trip; it is NOT the enforcement point. The server re-checks every
// callsign on register/guest-signup/reclaim/profile-update regardless of
// what this file says, so a hand-crafted request can't bypass the filter.
//
// Keep BLOCKED_TERMS / LEET_MAP / normalizeForFilter in sync with
// server/nickname.mjs (same convention this repo already uses for
// SCORING vs validate.mjs). The two runtimes can't share a module (Vite/TS
// client vs zero-dependency Node ESM server), so this is a deliberate,
// documented duplication rather than an oversight.

const BLOCKED_TERMS = [
  "nigger", "nigga", "faggot", "fag", "chink", "spic", "kike", "tranny",
  "retard", "retarded", "coon", "gook", "wetback", "cripple",
  "fuck", "shit", "cunt", "dick", "pussy", "whore", "slut", "bastard",
  "bitch", "asshole", "motherfucker", "dildo",
  "pedo", "pedophile", "rapist", "rape", "nazi", "hitler", "isis", "terrorist",
  "kys", "suicide", "grelo",
  "porn", "cock", "vagina",
];

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

/** See server/nickname.mjs normalizeForFilter for the full rationale. */
export function normalizeForFilter(raw: string): string {
  const stripped = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  let out = "";
  for (const ch of stripped) out += LEET_MAP[ch] ?? ch;
  out = out.replace(/[^a-z0-9]/g, "");
  out = out.replace(/(.)\1+/g, "$1");
  return out;
}

const NORMALIZED_BLOCKED_TERMS = BLOCKED_TERMS.map((t) => normalizeForFilter(t));

export function isNicknameBlocked(raw: string): boolean {
  if (typeof raw !== "string") return true;
  const normalized = normalizeForFilter(raw);
  if (!normalized) return false;
  if (SAFE_EXCEPTIONS.some((safe) => normalized === safe)) return false;
  return NORMALIZED_BLOCKED_TERMS.some((term) => normalized.includes(term));
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
