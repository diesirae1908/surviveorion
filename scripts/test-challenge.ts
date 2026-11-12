/**
 * Challenge links, client model (src/challenge.ts, ui.challenge params in src/flags.ts).
 * Run: npx tsx scripts/test-challenge.ts
 */
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import {
  COPY,
  CONTEXT_MAX_AGE_MS,
  bannerModel,
  challengeResultModel,
  challengerShareLine,
  claimEvent,
  eventDedupeKey,
  eventStoreScope,
  firstFlightLine,
  loadChallengeContext,
  loadMintedUrl,
  paceTargetFor,
  parseChallengePath,
  saveMintedUrl,
  storeChallengeContext,
  targetFromResolve,
  versusFor,
  type ChallengeTarget,
  type KV,
} from "../src/challenge";
import { clientFlagsSnapshot, resetFlagsForTest, setRemoteFeatures, type ChallengeParams } from "../src/flags";
import { dailyNumber } from "../src/share";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const memStore = (): KV & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};

const ON: ChallengeParams = {
  mint: true,
  lobbyBanner: true,
  paceTarget: true,
  resultLine: true,
  challengeBack: true,
  ogMeta: true,
};
const off = (k: keyof ChallengeParams): ChallengeParams => ({ ...ON, [k]: false });

const T: ChallengeTarget = {
  code: "7KQ2MXA",
  callsign: "GLINT",
  score: 1_463_185,
  patrolDate: "2026-11-12",
  patrolNumber: 122,
  status: "live",
  self: false,
};

// --- path parsing ---
check("parse basic", parseChallengePath("/c/7KQ2MXA") === "7KQ2MXA");
check("parse lower-case is upper-cased", parseChallengePath("/c/7kq2mxa") === "7KQ2MXA");
check("parse trailing slash", parseChallengePath("/c/7KQ2MXA/") === "7KQ2MXA");
check("parse too short", parseChallengePath("/c/7KQ2MX") === null);
check("parse too long", parseChallengePath("/c/7KQ2MXAB") === null);
check("parse /c/ alone", parseChallengePath("/c/") === null && parseChallengePath("/c") === null);
check("parse /fullgame", parseChallengePath("/fullgame") === null);
check("parse /fullgame/c/CODE is not a challenge", parseChallengePath("/fullgame/c/7KQ2MXA") === null);
check("parse extra segment", parseChallengePath("/c/7KQ2MXA/x") === null);
check("parse punctuation", parseChallengePath("/c/7KQ2-XA") === null);
check("parse root", parseChallengePath("/") === null);

// --- session context ---
{
  const s = memStore();
  storeChallengeContext(s, "7KQ2MXA", 1000);
  check("context round trip", loadChallengeContext(s, 2000) === "7KQ2MXA");
  check("context expires", loadChallengeContext(s, 1000 + CONTEXT_MAX_AGE_MS + 1) === null);
  s.setItem("orion.challenge", "{not json");
  check("context bad json is null", loadChallengeContext(s, 2000) === null);
  s.setItem("orion.challenge", JSON.stringify({ code: "<script>", at: 1000 }));
  check("context rejects a malformed code", loadChallengeContext(s, 2000) === null);
  const throwing: KV = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  storeChallengeContext(throwing, "7KQ2MXA");
  check("storage that throws never throws out", loadChallengeContext(throwing) === null);
}

// --- mint cache per patrol date ---
{
  const s = memStore();
  check("mint cache empty", loadMintedUrl(s, "2026-11-12") === null);
  saveMintedUrl(s, "2026-11-12", "https://surviveorion.com/c/9P4RTVW");
  check("mint cache hit", loadMintedUrl(s, "2026-11-12") === "https://surviveorion.com/c/9P4RTVW");
  check("mint cache is per date", loadMintedUrl(s, "2026-11-13") === null);
  s.setItem("orion.challenge.mint.2026-11-14", "javascript:alert(1)");
  check("mint cache rejects a non-link value", loadMintedUrl(s, "2026-11-14") === null);
}

// --- event dedupe ---
{
  const s = memStore();
  check("dedupe key shape", eventDedupeKey("beat", "7kq2mxa") === "orion.challenge.ev.beat.7KQ2MXA");
  check("first claim true", claimEvent(s, "beat", "7KQ2MXA"));
  check("second claim false", !claimEvent(s, "beat", "7kq2mxa"));
  check("other step independent", claimEvent(s, "lost", "7KQ2MXA"));
  check("other code independent", claimEvent(s, "beat", "9P4RTVW"));
  check("opened scopes to session", eventStoreScope("opened") === "session" && eventStoreScope("opened_new") === "session");
  check("others scope to device", (["shared", "flew", "beat", "lost", "back"] as const).every((x) => eventStoreScope(x) === "device"));
  const throwing: KV = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  check("claim on throwing storage is false", !claimEvent(throwing, "beat", "7KQ2MXA"));
}

// --- resolve normalization ---
{
  const live = { active: true, status: "live" as const, self: false, callsign: "GLINT", score: 1_463_185, patrolDate: "2026-11-12", patrolNumber: 122 };
  const t = targetFromResolve("7kq2mxa", live);
  check("resolve live", !!t && t.code === "7KQ2MXA" && t.status === "live" && t.score === 1_463_185 && !t.self);
  check("resolve inactive", targetFromResolve("7KQ2MXA", { active: false }) === null);
  check("resolve null", targetFromResolve("7KQ2MXA", null) === null);
  check("resolve missing score", targetFromResolve("7KQ2MXA", { ...live, score: undefined }) === null);
  check("resolve negative score", targetFromResolve("7KQ2MXA", { ...live, score: -5 }) === null);
  check("resolve bad status", targetFromResolve("7KQ2MXA", { ...live, status: "weird" as never }) === null);
  check("resolve self", targetFromResolve("7KQ2MXA", { ...live, self: true })?.self === true);
  check("resolve expired", targetFromResolve("7KQ2MXA", { ...live, status: "expired" })?.status === "expired");
}

// --- banner ---
{
  const live = bannerModel(T, { params: ON });
  check("banner live copy", live?.kind === "live" && live.text === "GLINT flew 1,463,185 on today's patrol. Beat it.", live?.text);
  const exp = bannerModel({ ...T, status: "expired" }, { params: ON });
  check(
    "banner expired copy",
    exp?.kind === "expired" &&
      exp.text === "GLINT flew 1,463,185 on Patrol #122. That patrol is closed. Fly today's and send yours back.",
    exp?.text,
  );
  check("banner self is null", bannerModel({ ...T, self: true }, { params: ON }) === null);
  check("banner no target is null", bannerModel(null, { params: ON }) === null);
  check("banner param off is null", bannerModel(T, { params: off("lobbyBanner") }) === null);
  check("banner switch off is null", bannerModel(T, { params: null }) === null);
  const ahead = bannerModel(T, { params: ON, attemptsLeft: 0, dayBest: T.score + 2100 });
  check("banner attempts used, ahead", ahead?.kind === "ahead" && ahead.text === "You're 2,100 ahead of GLINT today.", ahead?.text);
  const behind = bannerModel(T, { params: ON, attemptsLeft: 0, dayBest: T.score - 1204 });
  check(
    "banner attempts used, behind",
    behind?.kind === "behind" && behind.text === "GLINT leads by 1,204. Next patrol at 12:00 AM PT.",
    behind?.text,
  );
  const tie = bannerModel(T, { params: ON, attemptsLeft: 0, dayBest: T.score });
  check("banner attempts used, tie", tie?.kind === "tie");
  check("banner attempts left keeps live", bannerModel(T, { params: ON, attemptsLeft: 2, dayBest: 5 })?.kind === "live");
  check("banner attempts used without a best keeps live", bannerModel(T, { params: ON, attemptsLeft: 0, dayBest: null })?.kind === "live");
  check("expired ignores attempts", bannerModel({ ...T, status: "expired" }, { params: ON, attemptsLeft: 0, dayBest: 9 })?.kind === "expired");
  check("first flight line", firstFlightLine(T, ON) === "Next: beat GLINT's 1,463,185.");
  check("first flight line skips expired and self", firstFlightLine({ ...T, status: "expired" }, ON) === null && firstFlightLine({ ...T, self: true }, ON) === null);
  check("first flight line follows the banner param", firstFlightLine(T, off("lobbyBanner")) === null);
}

// --- result model ---
{
  const url = "https://surviveorion.com/c/9P4RTVW";
  const win = challengeResultModel(T.score + 12_480, T, { params: ON, url });
  check("result win line", win?.line === "You beat GLINT by 12,480." && win.tone === "win" && win.outcome === "beat", win?.line);
  check("result win button", win?.buttonLabel === "Challenge GLINT back");
  check("result win share text", win?.shareText === `Beat GLINT's 1,463,185. Your move: ${url}`, win?.shareText ?? "");
  const lose = challengeResultModel(T.score - 1204, T, { params: ON, url });
  check("result lose line", lose?.line === "GLINT holds. 1,204 short." && lose.tone === "lose" && lose.outcome === "lost", lose?.line);
  check("result lose button", lose?.buttonLabel === "Send GLINT your run");
  check("result lose share text", lose?.shareText === `GLINT is 1,204 ahead. Beat me: ${url}`, lose?.shareText ?? "");
  const tie = challengeResultModel(T.score, T, { params: ON });
  check("result tie reads Dead even and counts as a loss", tie?.line === "Dead even with GLINT." && tie.tone === "lose" && tie.outcome === "lost", tie?.line);
  const unnamed = challengeResultModel(T.score + 1, T, { params: ON, unnamed: true, url: null });
  check("result unnamed button opens the guest prompt", unnamed?.buttonLabel === "Name your callsign to send it" && unnamed.needsName && unnamed.shareText === null);
  check("result without a cached link has no share text", challengeResultModel(T.score + 1, T, { params: ON })?.shareText === null);
  check("result null: no target", challengeResultModel(5, null, { params: ON }) === null);
  check("result null: expired", challengeResultModel(5, { ...T, status: "expired" }, { params: ON }) === null);
  check("result null: self", challengeResultModel(5, { ...T, self: true }, { params: ON }) === null);
  check("result null: preview", challengeResultModel(5, T, { params: ON, preview: true }) === null);
  check("result null: archive", challengeResultModel(5, T, { params: ON, archive: true }) === null);
  check("result null: training", challengeResultModel(5, T, { params: ON, training: true }) === null);
  check("result null: first flight", challengeResultModel(5, T, { params: ON, firstFlight: true }) === null);
  check("result null: resultLine off", challengeResultModel(5, T, { params: off("resultLine") }) === null);
  check("result null: switch off", challengeResultModel(5, T, { params: null }) === null);
  const noBack = challengeResultModel(T.score + 1, T, { params: off("challengeBack"), url });
  check("challengeBack off: line stays, no button, no share text", !!noBack && noBack.buttonLabel === null && noBack.shareText === null && !noBack.needsName);
}

// --- share + pace + versus helpers ---
{
  const url = "https://surviveorion.com/c/7KQ2MXA";
  check("challenger share line", challengerShareLine(url, ON) === `Beat it: ${url}`);
  check("challenger share line: no link", challengerShareLine(null, ON) === null);
  check("challenger share line: mint off", challengerShareLine(url, off("mint")) === null);
  check("challenger share line: switch off", challengerShareLine(url, null) === null);
  check("pace target", JSON.stringify(paceTargetFor(T, ON)) === JSON.stringify({ callsign: "GLINT", score: 1_463_185 }));
  check("pace target off cases", paceTargetFor(T, off("paceTarget")) === null && paceTargetFor(T, null) === null && paceTargetFor(null, ON) === null);
  check("pace target skips expired and self", paceTargetFor({ ...T, status: "expired" }, ON) === null && paceTargetFor({ ...T, self: true }, ON) === null);
  check("versus ahead", versusFor(T.score + 12_480, T, ON)?.gap === 12_480);
  check("versus behind is negative", versusFor(T.score - 1204, T, ON)?.gap === -1204);
  check("versus null cases", versusFor(1, T, null) === null && versusFor(1, { ...T, status: "expired" }, ON) === null && versusFor(1, T, off("resultLine")) === null);
}

// --- copy table: no dashes, no exclamation, challenge only as a verb, no arena ---
{
  const sample: string[] = [];
  const who = "GLINT";
  for (const v of Object.values(COPY)) {
    if (typeof v === "string") sample.push(v);
    else {
      const args = (v as (...a: unknown[]) => string).length;
      sample.push(args === 1 ? (v as (a: string) => string)(who) : args === 2 ? (v as (a: string, b: number) => string)(who, 1234) : args === 3 ? (v as (a: string, b: number, c: string | number) => string)(who, 1234, 122) : "");
    }
  }
  check("copy table sampled", sample.length === Object.keys(COPY).length && sample.every((s) => s.length > 0));
  check("copy has no em or en dash", sample.every((s) => !/[—–]/.test(s)));
  check("copy has no exclamation marks", sample.every((s) => !s.includes("!")));
  check("copy never says arena or no gun", sample.every((s) => !/arena|no gun/i.test(s)));
  check("challenge is only used as a verb", sample.every((s) => !/\ba challenge\b|\bchallenges\b|\bthe challenge\b|\bchallenge link\b/i.test(s)));
  const src = readFileSync(new URL("../src/challenge.ts", import.meta.url), "utf8");
  check("source file has no em or en dash", !/[—–]/.test(src));
}

// --- flags wiring ---
{
  resetFlagsForTest();
  check("ClientFlags.challenge exists and is off by default", clientFlagsSnapshot().challenge === null);
  void setRemoteFeatures;
}

// --- patrol number parity (client dailyNumber vs the epoch, and vs the server twin when present) ---
{
  const cases: Array<[string, number]> = [
    ["2026-07-14T12:00:00Z", 1],
    ["2026-11-12T20:00:00Z", 122],
    // Fall back (Nov 1 2026, 02:00 PDT -> 01:00 PST): Nov 1 is #111 on both sides of the shift.
    ["2026-11-01T07:30:00Z", 111],
    ["2026-11-02T07:59:00Z", 111],
    ["2026-11-02T08:00:00Z", 112],
    // Spring forward (Mar 14 2027): Mar 13 23:30 PST is still Mar 13, Mar 14 00:00 PST is Mar 14.
    ["2027-03-14T07:59:00Z", dailyNumber(new Date("2027-03-13T20:00:00Z"))],
    ["2027-03-14T08:00:00Z", dailyNumber(new Date("2027-03-13T20:00:00Z")) + 1],
  ];
  for (const [iso, want] of cases) check(`dailyNumber ${iso}`, dailyNumber(new Date(iso)) === want, `got ${dailyNumber(new Date(iso))}`);
  const serverPath = new URL("../server/challenge.mjs", import.meta.url);
  if (existsSync(serverPath)) {
    const mod = (await import(serverPath.href)) as { patrolNumberFor?: (d: string) => number };
    if (typeof mod.patrolNumberFor === "function") {
      const pf = mod.patrolNumberFor;
      const dates = ["2026-07-14", "2026-11-01", "2026-11-02", "2027-03-13", "2027-03-14", "2028-02-29"];
      for (const d of dates) {
        const instant = new Date(`${d}T20:00:00Z`); // noon-ish PT, same patrol date
        check(`server patrolNumberFor ${d} equals client dailyNumber`, pf(d) === dailyNumber(instant), `${pf(d)} vs ${dailyNumber(instant)}`);
      }
    } else {
      console.log("SKIP  server/challenge.mjs has no patrolNumberFor yet (WS-1)");
    }
  } else {
    console.log("SKIP  server/challenge.mjs not present in this worktree (WS-1); parity runs after merge");
  }
}

// --- WS-5: one copy home, tie everywhere, and "switch off = nothing" for every pure piece main.ts calls ---
{
  const url = "https://surviveorion.com/c/9P4RTVW";
  const share = readFileSync(new URL("../src/share.ts", import.meta.url), "utf8");
  check("share.ts holds no challenge copy of its own", !share.includes("CHALLENGE_SHARE_COPY") && !/Your move|Beat me|Beat it/.test(share));
  check("tie share line reads Dead even", COPY.shareBackTie("GLINT", url) === `Dead even with GLINT. Beat me: ${url}`);
  const tie = challengeResultModel(T.score, T, { params: ON, url });
  check("tie result: line, share text and outcome agree", tie?.line === "Dead even with GLINT." && tie.shareText === COPY.shareBackTie("GLINT", url) && tie.outcome === "lost", tie?.shareText ?? "");
  const lose = challengeResultModel(T.score - 5, T, { params: ON, url });
  check("loss share text keeps the gap", lose?.shareText === COPY.shareBackLose("GLINT", 5, url), lose?.shareText ?? "");
  check("tie versus gap is exactly zero", versusFor(T.score, T, ON)?.gap === 0);

  // switch off (no row): every pure piece main.ts and ui.ts call yields nothing
  const offAll: Array<[string, unknown]> = [
    ["bannerModel", bannerModel(T, { params: null, attemptsLeft: 0, dayBest: 1 })],
    ["firstFlightLine", firstFlightLine(T, null)],
    ["paceTargetFor", paceTargetFor(T, null)],
    ["challengeResultModel", challengeResultModel(1, T, { params: null, url })],
    ["challengerShareLine", challengerShareLine(url, null)],
    ["versusFor", versusFor(1, T, null)],
  ];
  for (const [name, v] of offAll) check(`switch off: ${name} is null`, v === null);
  resetFlagsForTest();
  check("no row: clientFlagsSnapshot().challenge is null", clientFlagsSnapshot().challenge === null);
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall challenge checks passed");
