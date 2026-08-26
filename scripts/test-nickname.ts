// Callsign moderation regression check, tsx style (matches sim-test.ts:
// manual assertions, no test framework, ALL CHECKS PASSED / exit code).
//
// Exercises BOTH implementations (client TS + authoritative server mjs)
// against the same fixture list, so a drift between the two mirrors fails
// loudly instead of silently. Also exercises the display-time sanitization
// backstop (sanitizeCallsignForDisplay) that masks legacy blocked rows on
// public boards without touching the DB.
//
//   npx tsx scripts/test-nickname.ts

import * as client from "../src/nickname";
// tsx transpiles-and-runs without type-checking imports, so pulling in the
// zero-dependency server ESM module here is safe even though it has no types.
import * as server from "../server/nickname.mjs";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failures++;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Names that must be allowed: real, ordinary callsigns — including several
// deliberate false-positive tripwires (words that contain a blocked term's
// letters as a substring, or that collide with a term's post-normalization
// form) to guard against overreaching matching.
const ALLOWED = [
  "Ace",
  "Luciano",
  "Sky Pilot",
  "V0rtex",
  "R2D2",
  "Jean-Luc",
  "Anna-Marie",
  "Cassidy", // "ass"-adjacent but "ass" itself is intentionally not blocked
  "Assassin99",
  "Sussex", // contains "sex" (not a blocked term)
  "Bookworm", // natural double letter, sanity check
  "Rossco", // natural double letter "ss"
  "Classic_Pilot",
  "Passionate", // contains "ass"
  "Grasshopper", // contains "ass"
  "Bass Cannon", // contains "ass"
  "night owl",
  "xX_Comet_Xx",
  "007Agent",
  "Constantine", // must NOT collapse "coon" -> "con" and false-positive this
  "Falcon", // same "con" tripwire
  "Icon", // same "con" tripwire
  "Reconnaissance", // same "con" tripwire, also has doubled letters
  "Nigeria", // must NOT collapse "nigger" -> "niger" and false-positive this
  "Nigerian",
  "Niger",
  "Cockpit", // "cock" deliberately excluded — thematic, common word
  "Analyst", // "anal" deliberately excluded — extremely common prefix
  "Analog",
  "Pediatrician", // must not false-positive against "pedo"
  "TopGunAce",
  // exact SAFE_EXCEPTIONS entries: real words that DO contain a blocked
  // term's letters as a substring, whitelisted by exact normalized match
  "Scunthorpe",
  "Grape",
  "Grapes",
  "Grapefruit",
  "Grapevine",
  "Drape",
  "Drapes",
  "Drapery",
  "Therapist",
  "Therapists",
  "Despicable",
  "Conspicuous",
  "Retardant",
  "scunthorpe", // case-insensitive match against the exception list
  "GRAPE",
  // 2026-08-18 tripwires: the SHORT COMPONENTS of the new taunt compounds
  // must stay allowed, only the specific compound is blocked, not the
  // common word it's built from (see server/nickname.mjs's skipped-terms
  // note for why "butt"/"nuts"/"redact" are deliberately not on the list).
  "Buttercup",
  "Buttons",
  "Butte",
  "Abbott",
  "Peanuts",
  "Walnuts",
  "Doughnuts",
  "Nutshell",
  "Redactor",
  "Redacted",
];

// Names that must be blocked, including the exact leaderboard examples that
// motivated this pass, and deliberate obfuscation variants of each
// (case, spacing/punctuation, leetspeak, character elongation).
const BLOCKED = [
  // exact motivating cases
  "Trump is a pedo",
  "trump rapes kids",
  "TRUMP RAPES KIDS",
  // profanity + obfuscation variants
  "fuck you",
  "F.U.C.K",
  "f u c k",
  "fuuuuck",
  "ffuck",
  "FuCk",
  "sh1t head",
  "a55hole",
  // slurs + obfuscation (including elongation of the slur's OWN doubled letter)
  "n1gger",
  "n-i-g-g-e-r",
  "niggger", // extra-elongated double letter, must still match
  "f4ggot",
  // harassment / defamation accusations
  "pedo bear",
  "p3do",
  "is a rapist",
  "child molester",
  // hateful ideology
  "kys loser",
  "hitler2",
  "nazi_pilot",
  "true nazi",
  // spacing/punctuation evasion of a multi-word phrase
  "kill.yourself",
  "k i l l y o u r s e l f",
  // 2026-08-18: the exact leaderboard names from Lucas's screenshot that
  // evaded the 2026-08-17 filter, plus obfuscation variants.
  "Butt sniffer",
  "buttsniffer",
  "Butt Sniff",
  "BUTT SNIFFER",
  "b.u.t.t s.n.i.f.f.e.r",
  "Redact deeze nuts",
  "redactdeeznuts",
  "deez nuts",
  "Deez Nutz",
];

for (const name of ALLOWED) {
  check(`client allows "${name}"`, client.isNicknameBlocked(name), false);
  check(`server allows "${name}"`, server.isNicknameBlocked(name), false);
}

for (const name of BLOCKED) {
  check(`client blocks "${name}"`, client.isNicknameBlocked(name), true);
  check(`server blocks "${name}"`, server.isNicknameBlocked(name), true);
}

// Non-string input (malformed request bodies) must never slip through.
check("client blocks non-string", client.isNicknameBlocked(null as unknown as string), true);
check("server blocks non-string", server.isNicknameBlocked(null as unknown as string), true);
check("client blocks undefined", client.isNicknameBlocked(undefined as unknown as string), true);
check("server blocks undefined", server.isNicknameBlocked(undefined as unknown as string), true);

// Rejection messages: short, non-empty, drawn from the pool (never blank),
// and never echo the rejected text back (no reflected-content risk).
for (let i = 0; i < 20; i++) {
  const msg = client.pickRejectionMessage();
  if (!msg || msg.length > 80) {
    failures++;
    console.error(`FAIL client rejection message unusable: ${JSON.stringify(msg)}`);
  }
  const smsg = server.pickRejectionMessage();
  if (!smsg || smsg.length > 80) {
    failures++;
    console.error(`FAIL server rejection message unusable: ${JSON.stringify(smsg)}`);
  }
}

// Elongation tolerance: any number of repeats of a blocked term's own
// letters must still be caught, without needing the two runtimes to agree
// on a single canonical normalized string (see buildTermPattern rationale).
for (const variant of ["fuck", "FUCK", "f-u-c-k", "f u c k", "ffuck", "fuuck", "fuuuuck"]) {
  check(`client blocks elongation variant "${variant}"`, client.isNicknameBlocked(variant), true);
  check(`server blocks elongation variant "${variant}"`, server.isNicknameBlocked(variant), true);
}
check(
  "server/client normalization match",
  server.normalizeForFilter("F.U.C.K!!"),
  client.normalizeForFilter("F.U.C.K!!"),
);

// --- display-time sanitization (legacy-row backstop) ---

const blockedLegacy = "trump rapes kids";
const clientPseudonym = client.sanitizeCallsignForDisplay(blockedLegacy);
const serverPseudonym = server.sanitizeCallsignForDisplay(blockedLegacy);

check(
  "client/server blocked-pseudonym lists match",
  JSON.stringify(client.BLOCKED_CALLSIGN_PSEUDONYMS),
  JSON.stringify(server.BLOCKED_CALLSIGN_PSEUDONYMS),
);
check("client/server blocked pseudonym match", clientPseudonym, serverPseudonym);
check("blocked pseudonym is deterministic on the client", client.sanitizeCallsignForDisplay(blockedLegacy), clientPseudonym);
check("blocked pseudonym is not the old static string", clientPseudonym !== "Callsign redacted", true);
check("blocked pseudonym is not the raw callsign", clientPseudonym !== blockedLegacy, true);

check(
  "client sanitizes a blocked legacy callsign",
  client.sanitizeCallsignForDisplay(blockedLegacy),
  clientPseudonym,
);
check(
  "server sanitizes a blocked legacy callsign",
  server.sanitizeCallsignForDisplay(blockedLegacy),
  serverPseudonym,
);
check("client leaves a clean callsign untouched", client.sanitizeCallsignForDisplay("Ace"), "Ace");
check("server leaves a clean callsign untouched", server.sanitizeCallsignForDisplay("Ace"), "Ace");
const malformedClientPseudonym = client.sanitizeCallsignForDisplay(null as unknown as string);
const malformedServerPseudonym = server.sanitizeCallsignForDisplay(null as unknown as string);
check(
  "client/server malformed-input pseudonym match",
  malformedClientPseudonym,
  malformedServerPseudonym,
);
check(
  "client sanitizes non-string to a pseudonym",
  client.BLOCKED_CALLSIGN_PSEUDONYMS.includes(malformedClientPseudonym as never),
  true,
);
check(
  "server sanitizes non-string to a pseudonym",
  server.BLOCKED_CALLSIGN_PSEUDONYMS.includes(malformedServerPseudonym),
  true,
);
check(
  "client sanitizes undefined like null",
  client.sanitizeCallsignForDisplay(undefined as unknown as string),
  malformedClientPseudonym,
);
check(
  "server sanitizes undefined like null",
  server.sanitizeCallsignForDisplay(undefined as unknown as string),
  malformedServerPseudonym,
);
check(
  "clean empty string stays empty (not a blocked legacy row)",
  client.sanitizeCallsignForDisplay(""),
  "",
);

// --- sanitizePinnedRow (2026-08-17 review finding): client-built "pinned
// me" rows (fillDailyBoard, community.ts's renderBoard) assemble their own
// row from the account's raw callsign, bypassing the server's sanitizeEntry
// pass that only covers `entries` it returns itself. This reproduces the
// exact leak: a blocked legacy callsign must come out redacted, everything
// else on the row must pass through untouched. ---

check(
  "sanitizePinnedRow redacts a blocked legacy callsign",
  client.sanitizePinnedRow({ callsign: "trump rapes kids", rank: 12, score: 4200, isMe: true }).callsign,
  clientPseudonym,
);
check(
  "sanitizePinnedRow preserves non-callsign fields on a blocked row",
  JSON.stringify(client.sanitizePinnedRow({ callsign: "trump rapes kids", rank: 12, score: 4200, isMe: true })),
  JSON.stringify({ callsign: clientPseudonym, rank: 12, score: 4200, isMe: true }),
);
check(
  "sanitizePinnedRow leaves a clean callsign's row untouched",
  JSON.stringify(client.sanitizePinnedRow({ callsign: "Ace", rank: 3, score: 9001 })),
  JSON.stringify({ callsign: "Ace", rank: 3, score: 9001 }),
);

// --- player-facing copy: no em dashes (U+2014) in string literals ---
{
  const fs = await import("node:fs");
  const path = await import("node:path");
  const ROOT = new URL("..", import.meta.url).pathname;
  const files = [
    "src/main.ts",
    "src/ui.ts",
    "src/config.ts",
    "src/community.ts",
    "src/tutorial.ts",
    "src/share.ts",
    "src/badges.ts",
    "src/mutators.ts",
  ];
  const offenders: string[] = [];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
      if (/["'`][^"'`]*—/.test(line)) offenders.push(`${rel}: ${line.trim()}`);
    }
  }
  const serverText = fs.readFileSync(path.join(ROOT, "server/index.mjs"), "utf8");
  for (const line of serverText.split("\n")) {
    if (!line.includes("error:")) continue;
    if (/["'`][^"'`]*—/.test(line)) offenders.push(`server/index.mjs: ${line.trim()}`);
  }
  if (offenders.length > 0) {
    failures += offenders.length;
    for (const o of offenders) console.error(`FAIL em dash in player copy: ${o}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} nickname filter check(s) FAILED.`);
  process.exit(1);
}
console.log(
  `ALL CHECKS PASSED: ${ALLOWED.length + BLOCKED.length} names x 2 implementations, ` +
    `messages, elongation tolerance, pseudonym list parity, display sanitization, pinned-row masking, em-dash sweep.`,
);
