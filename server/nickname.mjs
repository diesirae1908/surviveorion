// Authoritative callsign content filter. This is the source of truth: every
// route that creates or changes a callsign (register, guest signup, guest
// reclaim, PATCH /me, Google/Clerk auto-naming) must call isNicknameBlocked
// before the name is written to the DB. CALLSIGN_RE in index.mjs only checks
// shape (length/charset); this checks content.
//
// Mirrored client-side in src/nickname.ts for instant cosmetic feedback (no
// round-trip needed for the obvious cases), keep the two normalize/blocklist
// implementations in sync, same convention as SCORING/validate.mjs. The
// client copy is NOT trusted: a hand-crafted request still has to clear this
// file's isNicknameBlocked to reach the DB.
//
// Scope: a curated list of slurs, explicit profanity, and harassment/defamation
// -prone terms (the kind of thing that gets a leaderboard screenshotted for
// the wrong reasons, "so-and-so is a pedo" etc.), not a general-purpose
// swear filter. Deliberately excludes short/ambiguous fragments ("ass", "sex")
// that collide with common legitimate words (Cassidy, assassin, Sussex...).
// Short (3-char minimum) real names should essentially never false-positive;
// if one does, extend the SAFE_EXCEPTIONS list rather than trimming BLOCKED_TERMS.

const BLOCKED_TERMS = [
  // slurs
  "nigger", "nigga", "faggot", "fag", "chink", "spic", "kike", "tranny",
  "retard", "retarded", "coon", "gook", "wetback", "cripple",
  // explicit profanity
  "fuck", "shit", "cunt", "dick", "pussy", "whore", "slut", "bastard",
  "bitch", "asshole", "motherfucker", "dildo",
  // harassment / defamation-prone (targets real people, incites, or doxxes)
  "pedo", "pedophile", "rapist", "rape", "nazi", "hitler", "isis", "terrorist",
  "kys", "suicide", "grelo",
  // sexual content not covered above
  "porn", "cock", "vagina",
];

// Legitimate names/words that would otherwise collide with a BLOCKED_TERMS
// substring after normalization, checked before the block list so they
// always pass. Keep this list short; it exists to document real false
// positives we've hit, not as a general escape hatch.
const SAFE_EXCEPTIONS = [];

// Leetspeak / lookalike substitutions, applied before the block check.
const LEET_MAP = {
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

/**
 * Canonical form used only for the blocklist check (never for storage/display):
 * lowercase, strip diacritics, map leetspeak, drop every non a-z0-9 character
 * (kills spaces/punctuation evasion like "f u.c-k"), then collapse every run
 * of a repeated character down to 1 (kills elongation evasion like
 * "fuuuuck", "sh...it", or double-letter evasion like "fuuck"). The blocklist
 * terms themselves are run through this same function below, so a term with
 * a natural double letter (e.g. "nigger") still matches correctly.
 */
export function normalizeForFilter(raw) {
  const stripped = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .toLowerCase();
  let out = "";
  for (const ch of stripped) out += LEET_MAP[ch] ?? ch;
  out = out.replace(/[^a-z0-9]/g, "");
  out = out.replace(/(.)\1+/g, "$1");
  return out;
}

// Normalized once at load time so the collapse rule above is applied
// identically to input and blocklist, regardless of how aggressive it is.
const NORMALIZED_BLOCKED_TERMS = BLOCKED_TERMS.map((t) => normalizeForFilter(t));

export function isNicknameBlocked(raw) {
  if (typeof raw !== "string") return true;
  const normalized = normalizeForFilter(raw);
  if (!normalized) return false;
  if (SAFE_EXCEPTIONS.some((safe) => normalized === safe)) return false;
  return NORMALIZED_BLOCKED_TERMS.some((term) => normalized.includes(term));
}

// Short, in-world, lightly snarky. Randomized so it doesn't read like a
// canned legal notice. Keep them compact: this fills a small error slot.
const REJECTION_MESSAGES = [
  "Command flagged that callsign. Try one that survives daylight.",
  "HQ bounced that one. Something a squadron won't wince at, pilot.",
  "Negative, pilot. That callsign won't clear flight review.",
  "Even the drones have better manners. Pick a new callsign.",
  "That callsign just got grounded before liftoff. Try another.",
  "Flight review says no. Wear a callsign you'd want on the record.",
];

export function pickRejectionMessage() {
  return REJECTION_MESSAGES[Math.floor(Math.random() * REJECTION_MESSAGES.length)];
}

// Display-time backstop: isNicknameBlocked already stops new/renamed
// callsigns from reaching the DB, but it shipped after some accounts already
// existed with a prohibited callsign (or a future policy update could widen
// BLOCKED_TERMS and catch names that were previously allowed). Those rows
// stay in the DB untouched — no account is renamed automatically, no data is
// mutated here — but every response that shows a callsign to OTHER players
// (leaderboards, public profiles, friends lists, gap-to-goal) runs it through
// this first, so a flagged name can't sit on a public board while its owner
// hasn't renamed yet. The account owner's own view of their own callsign
// (login/register/GET /api/me) is deliberately NOT filtered through this —
// see publicUser() in index.mjs — so they can still see the exact name they
// need to change.
const REDACTED_CALLSIGN = "Callsign redacted";

export function sanitizeCallsignForDisplay(raw) {
  if (typeof raw !== "string") return REDACTED_CALLSIGN;
  return isNicknameBlocked(raw) ? REDACTED_CALLSIGN : raw;
}
