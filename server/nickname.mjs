// Authoritative callsign content filter. This is the source of truth: every
// route that creates or changes a callsign (register, guest signup, guest
// reclaim, PATCH /me, Google/Clerk auto-naming) must call isNicknameBlocked
// before the name is written to the DB. CALLSIGN_RE in index.mjs only checks
// shape (length/charset); this checks content.
//
// Mirrored client-side in src/nickname.ts for instant cosmetic feedback (no
// round-trip needed for the obvious cases), keep the two implementations in
// sync, same convention as SCORING/validate.mjs. The client copy is NOT
// trusted: a hand-crafted request still has to clear this file's
// isNicknameBlocked to reach the DB.
//
// Scope: a curated list of slurs, explicit profanity, and harassment/
// defamation-prone terms (the kind of thing that gets a leaderboard
// screenshotted for the wrong reasons, "so-and-so is a pedo" etc.), not a
// general-purpose swear filter.
//
// THREE MATCHING TIERS (2026-08-16 review pass — see JOURNAL.md). A single
// flat "block if this string appears anywhere" substring check is what
// caused real false positives: "dick" inside "Dickson", "rape" inside
// "grapefruit"/"drape", "rapist" inside "therapist", "pedo" inside
// "torpedo", "spic" inside "spice"/"despicable", "isis" inside "crisis"/
// "narcissism", "cock" inside "peacock"/"hancock"/"cockpit". The fix is not
// a growing SAFE_EXCEPTIONS list (that's whack-a-mole and never converges);
// it's categorizing each term by how safe it is as a bare substring:
//
// 1. SUBSTRING_BLOCKED_TERMS — high-confidence terms with no realistic
//    legitimate collision (slurs, explicit profanity, hateful ideology).
//    Matched anywhere in the fully-compacted name (spaces/punctuation
//    stripped), so "f u.c-k" / "n1gg3r" / spaced-out evasion all still hit.
// 2. TOKEN_BLOCKED_TERMS — ambiguous roots that ARE substrings of common
//    real words/names (dick, rape*, pedo*, spic*, isis, cock*). Matched
//    only as a COMPLETE normalized word (split on the original spaces/
//    punctuation), so "Dickson"/"grapefruit"/"therapist"/"torpedo"/
//    "crisis"/"despicable"/"cockpit" all pass, while bare "pedo", "u are a
//    rapist", or "Trump is a pedo" (each already a standalone word/token)
//    still get blocked.
// 3. PHRASE_BLOCKED_SUBSTRINGS — the specific "<name> is a <accusation>"
//    defamation construction (the motivating case: a leaderboard name
//    accusing a real person of being a pedophile/rapist) checked as a
//    substring of the fully-compacted name. This exists so the tier-2
//    words above still catch the accusation even if every space is
//    deliberately removed ("trumpisapedo") — no legitimate single word
//    ever contains "isapedo" or "isarapist".
//
// Elongation/leetspeak evasion ("fuuuuck", "n1gg3r", "sh!t") is handled by
// building each term into a regex that requires ONE OR MORE of each of the
// term's own letters in sequence, rather than by collapsing repeated
// letters in the input. Collapsing was tried first and rejected: it
// shrinks "nigger" to "niger", which then matches "Nigeria"/"Nigerian" —
// exactly the same class of bug as the token issues above, just hiding
// inside the normalization step instead of the blocklist. The regex floor
// requires the SAME repeat count the term naturally has (e.g. "nigger"
// needs >=2 consecutive g's), so "Nigeria" (one g) no longer matches, while
// "niggger" (elongated, 3+ g's) still does.
//
// Real names/words should essentially never false-positive under this
// scheme; if one still does, prefer moving the offending term to the
// TOKEN or PHRASE tier (or narrowing it) over adding a SAFE_EXCEPTIONS
// entry — the exceptions list is a last resort, kept empty on purpose.

const SUBSTRING_BLOCKED_TERMS = [
  // slurs (no realistic legitimate-word collision)
  "nigger", "nigga", "faggot", "fag", "chink", "kike", "tranny",
  "retard", "retarded", "coon", "gook", "wetback", "cripple",
  // explicit profanity
  "fuck", "shit", "cunt", "pussy", "whore", "slut", "bastard",
  "bitch", "asshole", "motherfucker", "dildo",
  // harassment / hateful ideology (long/specific enough to be substring-safe)
  "pedophile", "nazi", "hitler", "terrorist", "kys", "suicide",
  // sexual content not covered above
  "porn", "vagina",
];

// Ambiguous roots: real slurs/profanity/accusations, but also substrings of
// common English words/names (see the tier explanation above). Blocked only
// as a complete normalized word — i.e. the entire token between two
// separators (or the entire name, if there are none) — never mid-word.
const TOKEN_BLOCKED_TERMS = [
  "dick",
  "rape", "raped", "rapes", "raping", "rapist", "rapists",
  "pedo", "pedos",
  "spic", "spics",
  "isis",
  "cock", "cocks",
];

// The defamation sentence this filter exists to catch ("<name> is a
// pedo(phile)/rapist"), checked as a substring of the fully-compacted name
// so it still lands even with every space/punctuation mark stripped
// ("trumpisapedo"). Deliberately narrow: only the exact accusation phrase,
// not "is a" alone.
const PHRASE_BLOCKED_SUBSTRINGS = ["is a pedo", "is a pedophile", "is a rapist"];

// Legitimate names/words that would otherwise collide with a blocked term,
// checked (as a whole-name match) before every tier below so they always
// pass. Kept empty on purpose — see the tier explanation above for why a
// growing list here is the wrong fix; extend a tier or narrow a term
// instead. Only use this for a genuine one-off that doesn't fit any tier.
const SAFE_EXCEPTIONS = [];

// Leetspeak / lookalike substitutions, applied before every match below.
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

/** Lowercase, strip diacritics, map leetspeak lookalikes. Keeps separators. */
function mapChars(raw) {
  const stripped = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .toLowerCase();
  let out = "";
  for (const ch of stripped) out += LEET_MAP[ch] ?? ch;
  return out;
}

/**
 * Canonical compacted form used for the SUBSTRING/PHRASE tiers and the
 * SAFE_EXCEPTIONS check (never for storage/display): mapChars() with every
 * non a-z0-9 character removed. This is what kills spaces/punctuation
 * evasion like "f u.c-k" — there is no separator left to hide behind.
 */
export function normalizeForFilter(raw) {
  return mapChars(raw).replace(/[^a-z0-9]/g, "");
}

/**
 * The name split into its original words (mapChars() applied, but split on
 * runs of non a-z0-9 instead of deleting them) — used for the TOKEN tier so
 * "Trump is a pedo" is 4 words, not one glued blob. A name with no
 * separators at all (e.g. "torpedo") is just one token: itself.
 */
function tokensOf(raw) {
  return mapChars(raw).match(/[a-z0-9]+/g) ?? [];
}

/**
 * Regex requiring one-or-more of each of the term's own letters in
 * sequence: catches elongation ("fuuuuck") and the term's own natural
 * double letters ("nigger") as a floor, without shrinking the term into a
 * shorter substring that collides with something else (see the module
 * comment re: "niger"/"Nigeria"). `term` must already be normalizeForFilter
 * output (a-z0-9 only), so no regex-escaping is needed.
 */
function letterFloorSource(term) {
  return [...term].map((ch) => `${ch}+`).join("");
}

const buildSubstringPattern = (term) => new RegExp(letterFloorSource(normalizeForFilter(term)));
const buildTokenPattern = (term) => new RegExp(`^${letterFloorSource(normalizeForFilter(term))}$`);

const SUBSTRING_PATTERNS = SUBSTRING_BLOCKED_TERMS.map(buildSubstringPattern);
const PHRASE_PATTERNS = PHRASE_BLOCKED_SUBSTRINGS.map(buildSubstringPattern);
const TOKEN_PATTERNS = TOKEN_BLOCKED_TERMS.map(buildTokenPattern);
const NORMALIZED_SAFE_EXCEPTIONS = new Set(SAFE_EXCEPTIONS.map(normalizeForFilter));

export function isNicknameBlocked(raw) {
  if (typeof raw !== "string") return true;
  const compact = normalizeForFilter(raw);
  if (!compact) return false;
  if (NORMALIZED_SAFE_EXCEPTIONS.has(compact)) return false;
  if (SUBSTRING_PATTERNS.some((re) => re.test(compact))) return true;
  if (PHRASE_PATTERNS.some((re) => re.test(compact))) return true;
  const tokens = tokensOf(raw);
  return tokens.some((tok) => TOKEN_PATTERNS.some((re) => re.test(tok)));
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
// the blocklists and catch names that were previously allowed). Those rows
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
