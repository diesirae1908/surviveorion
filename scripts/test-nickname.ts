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

// Normalization sanity: elongation/leet/spacing collapse to the same token.
const normVariants = ["fuck", "FUCK", "f-u-c-k", "f u c k", "fuuck", "fuuuuck"];
const normalized = new Set(normVariants.map((v) => client.normalizeForFilter(v)));
if (normalized.size !== 1) {
  failures++;
  console.error(`FAIL normalization variants diverged: ${[...normalized].join(", ")}`);
}

if (failures > 0) {
  console.error(`\n${failures} nickname filter check(s) FAILED.`);
  process.exit(1);
}
console.log(`ALL CHECKS PASSED: ${ALLOWED.length + BLOCKED.length} names x 2 implementations, messages, normalization.`);
