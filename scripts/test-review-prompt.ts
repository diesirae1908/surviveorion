/**
 * App Store rating prompt policy (iOS 1.2 WS-A2, switch app.review). Pure node test.
 * Run: npx tsx scripts/test-review-prompt.ts
 */
import { readFileSync } from "node:fs";
import { calmForReview, medalUpgraded, reviewDecision, type ReviewContext } from "../src/reviewPrompt";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const PARAMS = { minSessions: 3, minRunSeconds: 30, onMedal: true, onPersonalBest: true };
/** A run that would ask: session 3, 45 s, first medal of the day, no PB. */
const good: ReviewContext = {
  params: PARAMS,
  shell: true,
  preview: false,
  archive: false,
  training: false,
  refunded: false,
  runSeconds: 45,
  medalBefore: null,
  medalAfter: "copper",
  newPersonalBest: false,
  sessions: 3,
  appVersion: "1.2",
  askedVersion: null,
};
const r = (over: Partial<ReviewContext>) => reviewDecision({ ...good, ...over });

check("baseline: first medal on session 3 asks", r({}).ask && r({}).reason === "medal");
check("switch off (no row): never", (() => { const x = r({ params: null }); return !x.ask && x.reason === "off"; })());
check("not the shell (SwiftUI fallback): web never asks", (() => { const x = r({ shell: false }); return !x.ask && x.reason === "not-shell"; })());
check("preview run: no", (() => { const x = r({ preview: true }); return !x.ask && x.reason === "preview"; })());
check("archive run: no", (() => { const x = r({ archive: true }); return !x.ask && x.reason === "archive"; })());
check("training or first flight: no", (() => { const x = r({ training: true }); return !x.ask && x.reason === "training"; })());
check("refunded run: no", (() => { const x = r({ refunded: true }); return !x.ask && x.reason === "refunded"; })());
check("short death (29.9 s): no", (() => { const x = r({ runSeconds: 29.9 }); return !x.ask && x.reason === "short-run"; })());
check("exactly 30 s counts", r({ runSeconds: 30 }).ask);
check("first session: no", (() => { const x = r({ sessions: 1, newPersonalBest: true }); return !x.ask && x.reason === "early-session"; })());
check("second session still below minSessions 3", !r({ sessions: 2 }).ask);
check("sessions absent (0): no", !r({ sessions: 0 }).ask);
check("already asked for this version: no", (() => { const x = r({ askedVersion: "1.2" }); return !x.ask && x.reason === "already-asked"; })());
check("asked for an older version: asks again", r({ askedVersion: "1.1" }).ask);
check("version unknown: the web guard cannot match, Swift's guard still holds", r({ appVersion: null, askedVersion: "1.2" }).ask);
check("no medal, no PB: no trigger", (() => { const x = r({ medalAfter: null }); return !x.ask && x.reason === "no-trigger"; })());
check("same medal as before (no upgrade): no trigger", !r({ medalBefore: "copper", medalAfter: "copper" }).ask);
check("lower medal than before: no trigger", !r({ medalBefore: "gold", medalAfter: "silver" }).ask);
check("silver after copper is an upgrade", r({ medalBefore: "copper", medalAfter: "silver" }).ask);
check("gold after silver is an upgrade", r({ medalBefore: "silver", medalAfter: "gold" }).ask);
check("second medal same version is blocked by the asked guard", !r({ medalBefore: "copper", medalAfter: "silver", askedVersion: "1.2" }).ask);
check("new personal best alone asks", (() => { const x = r({ medalAfter: null, newPersonalBest: true }); return x.ask && x.reason === "new-pb"; })());
check("medal wins the reason when both hold", r({ newPersonalBest: true }).reason === "medal");
check("onMedal=false ignores medals", !r({ params: { ...PARAMS, onMedal: false } }).ask);
check("onPersonalBest=false ignores a PB alone", !r({ params: { ...PARAMS, onPersonalBest: false }, medalAfter: null, newPersonalBest: true }).ask);
check("onMedal=false but PB holds: new-pb", r({ params: { ...PARAMS, onMedal: false }, newPersonalBest: true }).reason === "new-pb");
check("thresholds come from the row: minRunSeconds 120", !r({ params: { ...PARAMS, minRunSeconds: 120 }, runSeconds: 90 }).ask && r({ params: { ...PARAMS, minRunSeconds: 120 }, runSeconds: 121 }).ask);
check("thresholds come from the row: minSessions 10", !r({ params: { ...PARAMS, minSessions: 10 }, sessions: 9 }).ask && r({ params: { ...PARAMS, minSessions: 10 }, sessions: 10 }).ask);
check("a row missing its keys keeps the defaults (30 s, 3 sessions, both triggers)", r({ params: {} }).ask && !r({ params: {}, sessions: 2 }).ask && !r({ params: {}, runSeconds: 10 }).ask);
check("medalUpgraded: none to none, none to copper, same, higher", !medalUpgraded(null, null) && medalUpgraded(null, "copper") && !medalUpgraded("silver", "silver") && medalUpgraded("silver", "gold"));
check("decision is pure: inputs untouched", (() => { const c = { ...good }; reviewDecision(c); return JSON.stringify(c) === JSON.stringify(good); })());

// calm point: only the lobby, only with a candidate (never the result screen or mid-run)
check("calm: lobby with a candidate", calmForReview("menu", true));
check("calm: no candidate, no ask", !calmForReview("menu", false));
check("not calm: result, playing, paused, gate, intro", ["gameover", "playing", "paused", "gate", "intro", "dying"].every((s) => !calmForReview(s, true)));

// source wiring
const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
check("main: the ask is posted from the lobby repaint only, after a delay, once per candidate", /maybeAskForReview\(\);\s*return;/.test(main) && /type: "requestReview", reason/.test(main) && /reviewCandidate = null/.test(main));
check("main: a candidate is recorded after the result is shown, with the pre-run best-of-day medal", /recordReviewCandidate\(\{\s*medalBefore: resultThresholds \? medalForScore\(dayBestBefore, resultThresholds\)/.test(main));
check("main: never asks while PATROL COMPLETE is up", /ui\.hasPatrolComplete\(\)\) return;\s*const reason/.test(main));
check("main: the asked version is stored in localStorage", /orion\.review\.askedVersion/.test(main));
check("main: a non-qualifying run clears a held candidate (assigned unconditionally)", /reviewCandidate = d\.ask \? d\.reason : null;/.test(main));
check("main: startRun voids a held candidate", /function startRun\(\): void \{\s*reviewCandidate = null;/.test(main));
check("main: the asked version is written only inside the delayed send", /setTimeout\(\(\) => \{[^}]*if \(state !== "menu"\) return;[\s\S]*?setItem\(REVIEW_ASKED_KEY[\s\S]*?type: "requestReview"/.test(main));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall review prompt checks passed");
