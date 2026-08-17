// Nickname filter regression check, tsx style (matches sim-test.ts:
// manual assertions, no test framework, ALL CHECKS PASSED / exit code).
//
// Exercises BOTH implementations (client TS + authoritative server mjs)
// against the same fixture list, so a drift between the two mirrors fails
// loudly instead of silently.
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

// Names that must be allowed (real, ordinary callsigns).
const ALLOWED = [
  "Ace",
  "Luciano",
  "Sky Pilot",
  "V0rtex",
  "R2D2",
  "Jean-Luc",
  "Anna-Marie",
  "Cassidy",
  "Assassin99",
  "Sussex",
  "Bookworm",
  "Rossco",
  "Classic_Pilot",
  "Passionate",
  "Grasshopper",
  "Bass Cannon",
  "night owl",
  "xX_Comet_Xx",
  "007Agent",
  // 2026-08-16 review pass: real words/names that a flat substring filter
  // wrongly caught (dick/rape/rapist/pedo/spic/isis/cock as fragments).
  "Dickson",
  "Dickinson",
  "Grapefruit",
  "Drape",
  "Therapist",
  "Torpedo",
  "Crisis",
  "Narcissism",
  "Spice",
  "Spicy",
  "Despicable",
  "Hancock",
  "Peacock",
  "Cockpit",
  "Shuttlecock",
  // "nigger" collapsing to "niger" used to false-positive real country/
  // demonym names — the letter-floor regex fixes this without an exception.
  "Nigeria",
  "Nigerian",
  "Niger",
];

// Names that must be blocked, including the exact leaderboard examples that
// motivated this pass, and deliberate evasion variants of each.
const BLOCKED = [
  "Trump is a pedo",
  "chapo grelo",
  "fuck you",
  "F.U.C.K",
  "f u c k",
  "fuuuuck",
  "FuCk",
  "sh1t head",
  "a55hole",
  "n1gger",
  "pedo bear",
  "kys loser",
  "hitler2",
  "nazi_pilot",
  // 2026-08-16 review pass: the ambiguous roots above must still block as a
  // standalone word (bare, spaced-phrase, or leet/elongated single token).
  "pedo",
  "rapist",
  "isis",
  "dick",
  "spic",
  "cock",
  "u r a rapist",
  "long live isis",
  "p3d0",
  "peeeedo",
  // the exact defamation construction, including with every separator
  // removed (the phrase tier must still catch this without any spaces).
  "Trump.is.a.pedo",
  "trumpisapedo",
  "heisarapist",
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

// Rejection messages: short, non-empty, and drawn from the pool (never blank).
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

// Normalization sanity: case/punctuation/space evasion collapse to the same
// token. Elongation ("fuuuuck") deliberately does NOT collapse to "fuck"
// here anymore (see server/nickname.mjs's "niger"/"Nigeria" note) — it's
// still caught, but by the per-term letter-floor regex at match time, not
// by normalizeForFilter shrinking the string. That's covered by the
// "fuuuuck" entry in BLOCKED above instead of an equality check here.
const normVariants = ["fuck", "FUCK", "f-u-c-k", "f u c k"];
const normalized = new Set(normVariants.map((v) => client.normalizeForFilter(v)));
if (normalized.size !== 1) {
  failures++;
  console.error(`FAIL normalization variants diverged: ${[...normalized].join(", ")}`);
}

// Client/server parity check specifically for the tokenizing tier: make
// sure both implementations agree on every ALLOWED/BLOCKED case above (the
// loops already check this per-name, this just documents the intent).

if (failures > 0) {
  console.error(`\n${failures} nickname filter check(s) FAILED.`);
  process.exit(1);
}
console.log(`ALL CHECKS PASSED: ${ALLOWED.length + BLOCKED.length} names x 2 implementations, messages, normalization.`);
