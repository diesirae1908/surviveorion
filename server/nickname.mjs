// Authoritative callsign content filter. This is the source of truth: every
// route that creates or changes a callsign (register, guest signup, guest
// reclaim, PATCH /me, Google/Clerk auto-naming) calls isNicknameBlocked
// before the name is written to the DB. CALLSIGN_RE in index.mjs only checks
// shape (length/charset); this checks content.
//
// Mirrored client-side in src/nickname.ts for instant cosmetic feedback (no
// round-trip needed for the obvious cases) — keep BLOCKED_TERMS,
// SAFE_EXCEPTIONS, LEET_MAP and the matching logic in sync, same convention
// as SCORING/validate.mjs. The client copy is NOT trusted: a hand-crafted
// request still has to clear this file's isNicknameBlocked to reach the DB.
//
// Scope: slurs, explicit profanity, and harassment/defamation-prone phrases
// (the kind of thing that gets a leaderboard screenshotted for the wrong
// reasons — "X is a pedo", "X rapes kids") — not a general-purpose swear
// filter. Deliberately excludes short/ambiguous fragments ("ass", "sex",
// "hell", "cock", "anal") that collide with extremely common legitimate
// words (assassin, Sussex, shell, cockpit, analyst...). Real names and
// ordinary words should essentially never false-positive; if one does,
// extend SAFE_EXCEPTIONS rather than trimming BLOCKED_TERMS.

const BLOCKED_TERMS = [
  // slurs (racial, ethnic, homophobic, transphobic, ableist)
  "nigger", "nigga", "faggot", "fag", "chink", "spic", "kike", "tranny",
  "retard", "retarded", "coon", "gook", "wetback", "beaner", "paki",
  // explicit profanity / sexual vocabulary
  "fuck", "shit", "cunt", "dick", "pussy", "whore", "slut", "bastard",
  "bitch", "asshole", "motherfucker", "dildo", "porn", "vagina", "blowjob",
  "cumshot",
  // harassment / defamation-prone accusations (targets real people — the
  // exact motivating cases: "X is a pedo", "X rapes kids")
  "pedo", "pedophile", "paedophile", "rapist", "rape", "raper", "molester",
  "molests", "incest",
  // hateful ideology / extremism
  "nazi", "hitler", "isis", "terrorist", "kkk", "genocide",
  // self-harm / harassment incitement
  "kys", "kill yourself", "suicide",
  // 2026-08-18: scatological/sexual compounds and redaction-feature
  // mockery that evaded the filter above (Lucas's screenshot: "Butt
  // sniffer" and "Redact deeze nuts" both live on the leaderboard). These
  // are deliberately whole COMPOUNDS, not their common short components
  // ("butt", "nuts", "redact" all stay OFF the list: see the skipped-terms
  // note below), so the collision surface with ordinary words/names is
  // effectively zero.
  "buttsniff", "deeznuts", "deezenuts", "deeznutz", "deezenutz",
];

// Deliberately NOT added, even though they're part of the taunts above:
//  - "butt": collides with extremely common words (button, buttercup,
//    butte, Abbott...). Only the specific compound ("buttsniff") is
//    blocked.
//  - "nuts": an ordinary word on its own (peanuts, walnuts, doughnuts,
//    nutshell...), not inherently offensive.
//  - "redact": the taunt mocks the redaction FEATURE, but the word itself
//    is completely legitimate (Redactor is a real word/agent-noun), the
//    exact kind of guessy overreach this filter's design avoids. Only the
//    "deez nuts" mockery half of that callsign is blocked.

// Legitimate words/names that would otherwise collide with a BLOCKED_TERMS
// substring, checked (as a whole-string match) before the block list so they
// always pass. Two different collision shapes land here:
//  - Terms with NO natural doubled letter (rape, cunt, spic) can't use the
//    doubled-letter floor trick below, so their known common-word collisions
//    (grape, Scunthorpe, despicable...) need an explicit exception.
//  - Kept short and documented: these exist because we hit a real false
//    positive, not as a general escape hatch.
const SAFE_EXCEPTIONS = [
  "Scunthorpe", // contains "cunt"
  "Grape", "Grapes", "Grapefruit", "Grapevine", // contain "rape"
  "Drape", "Drapes", "Drapery", // contain "rape"
  "Therapist", "Therapists", // contain "rapist"
  "Despicable", "Conspicuous", // contain "spic"
  "Retardant", // contains "retard" (fire retardant)
];

// Leetspeak / lookalike-character substitutions, applied before the block
// check so "n1gg3r", "a55hole", "$hit" etc. still match.
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
 * Canonical form for comparison (never for storage/display): lowercase,
 * strip diacritics, map leetspeak lookalikes, then drop every non-a-z0-9
 * character. That last step is what kills spacing/punctuation evasion
 * ("f u.c-k", "p-e-d-o", "kill.yourself") — it also folds a multi-word
 * BLOCKED_TERMS entry like "kill yourself" down to one token, matched the
 * same way as everything else. Does NOT collapse repeated letters — see
 * isTermPresent below for why that's handled per-term instead.
 */
export function normalizeForFilter(raw) {
  const stripped = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // combining diacritics
    .toLowerCase();
  let out = "";
  for (const ch of stripped) out += LEET_MAP[ch] ?? ch;
  return out.replace(/[^a-z0-9]/g, "");
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/;
const escapeRegexChar = (ch) => (REGEX_SPECIAL.test(ch) ? `\\${ch}` : ch);

/**
 * Builds a regex matching `term` with each of its own letters repeated
 * one-or-more times, so "fuck" also matches "fuuuck" / "ffuck" (elongation
 * evasion) while the term's OWN natural doubled letters (the "oo" in
 * "coon", the second "g" in "nigger") stay a floor requirement.
 *
 * This is deliberately NOT "collapse every repeated run down to one letter,
 * then substring-match" — that approach was tried and rejected: collapsing
 * "coon" the same way normalizes it down to "con", which then substring-
 * matches an enormous number of innocent words (Constantine, falcon, icon,
 * second, reconnaissance...); collapsing "nigger" normalizes it down to
 * "niger", which then matches "Nigeria"/"Nigerian". Requiring each term's
 * own repeat count as a floor (via `char+` per letter) catches every
 * elongation variant of the term itself without ever shrinking a term into
 * a shorter, more common one.
 */
function buildTermPattern(term) {
  const normalized = normalizeForFilter(term);
  const pattern = [...normalized].map((ch) => `${escapeRegexChar(ch)}+`).join("");
  return new RegExp(pattern);
}

const BLOCKED_PATTERNS = BLOCKED_TERMS.map(buildTermPattern);
const NORMALIZED_SAFE_EXCEPTIONS = new Set(SAFE_EXCEPTIONS.map(normalizeForFilter));

export function isNicknameBlocked(raw) {
  if (typeof raw !== "string") return true;
  const normalized = normalizeForFilter(raw);
  if (!normalized) return false;
  if (NORMALIZED_SAFE_EXCEPTIONS.has(normalized)) return false;
  return BLOCKED_PATTERNS.some((re) => re.test(normalized));
}

// Short, in-world, lightly snarky, and deliberately generic — never echoes
// back what was typed or why (no free-form policy explanation that could
// itself get contested). Randomized so it doesn't read like a canned legal
// notice; fills a small error slot.
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

// Display-time backstop: isNicknameBlocked above stops a new or renamed
// callsign from ever reaching the DB, but it shipped after some accounts
// already existed with a prohibited callsign (and a future BLOCKED_TERMS
// addition could always retroactively catch a name that was previously
// allowed). Those rows stay in the DB completely untouched here — no
// rename, no mutation — but every response that shows a callsign to OTHER
// players (leaderboards, public profiles, friends lists, gap-to-goal) is
// expected to route it through this first, so a flagged legacy name can't
// sit on a public board while its owner hasn't renamed. Deliberately NOT
// applied to the account owner's own view of their own callsign (see
// publicUser() in index.mjs) — they need to see the real value to know it
// needs changing.
const REDACTED_CALLSIGN = "Callsign redacted";

export function sanitizeCallsignForDisplay(raw) {
  if (typeof raw !== "string") return REDACTED_CALLSIGN;
  return isNicknameBlocked(raw) ? REDACTED_CALLSIGN : raw;
}
