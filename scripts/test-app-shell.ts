/**
 * App Store web shell (iOS 1.2 WS-A2): the pure on/off decision, URL params, bridge shapes and
 * the source wiring. Pure node test, no DOM. Run: npx tsx scripts/test-app-shell.ts
 */
import { readFileSync } from "node:fs";
import {
  parseSessionEvent,
  parseShellAppVersion,
  parseShellSessions,
  parseTierEvent,
  shellDecision,
  shellForceAllowed,
  shellForceRequested,
  type ShellDecisionInput,
} from "../src/appShell";
import { appFlags, clientFlagsSnapshot, flagsLoaded, resetFlagsForTest, setRemoteFeatures } from "../src/flags";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const LOBBY = { tabBar: true, briefing: true, pilotTab: true };
const base: ShellDecisionInput = {
  shellVersion: 1,
  flagsLoaded: true,
  appShell: { minShell: 1, briefing: true, pilotTab: true, stories: true },
  lobby: LOBBY,
};
const d = (over: Partial<ShellDecisionInput>) => shellDecision({ ...base, ...over });

// --- decision truth table ---
check("not a shell page: off, not-shell", (() => { const r = d({ shellVersion: null }); return !r.on && r.reason === "not-shell"; })());
check("offline with no cache (flags not loaded): fallback, no-flags", (() => { const r = d({ flagsLoaded: false }); return !r.on && r.reason === "no-flags"; })());
check("no app.shell row (switch off): fallback, switch-off", (() => { const r = d({ appShell: null }); return !r.on && r.reason === "switch-off"; })());
check("app.shell on but ui.lobby off: fallback to SwiftUI, never the old web lobby", (() => { const r = d({ lobby: null }); return !r.on && r.reason === "lobby-off" && r.lobby === null; })());
check("build older than minShell: fallback, old-build", (() => { const r = d({ shellVersion: 1, appShell: { minShell: 2 } }); return !r.on && r.reason === "old-build"; })());
check("build at minShell: on", d({ shellVersion: 2, appShell: { minShell: 2 } }).on);
check("build above minShell: on", d({ shellVersion: 3, appShell: { minShell: 2 } }).on);
check("minShell absent defaults to 1", d({ shellVersion: 1, appShell: {} }).on);
check("on: reason on, lobby params carried, stories allowed", (() => { const r = d({}); return r.on && r.reason === "on" && r.lobby?.tabBar === true && r.stories; })());
check("off decisions carry no lobby and no stories", (() => { const r = d({ appShell: null }); return r.lobby === null && !r.stories; })());
check("app.shell.briefing=false turns the briefing off, ui.lobby alone cannot turn it back on", d({ appShell: { briefing: false } }).lobby?.briefing === false);
check("ui.lobby.briefing=false wins over app.shell.briefing=true", d({ lobby: { ...LOBBY, briefing: false } }).lobby?.briefing === false);
check("app.shell.pilotTab=false turns the dossier off (web profile screen)", d({ appShell: { pilotTab: false } }).lobby?.pilotTab === false);
check("ui.lobby.pilotTab=false wins over app.shell.pilotTab=true", d({ lobby: { ...LOBBY, pilotTab: false } }).lobby?.pilotTab === false);
check("tab bar follows ui.lobby only", d({ lobby: { ...LOBBY, tabBar: false } }).lobby?.tabBar === false);
check("app.shell.stories=false narrows stories", d({ appShell: { stories: false } }).stories === false);
check("params absent read as no extra narrowing", (() => { const r = d({ appShell: {} }); return r.lobby?.briefing === true && r.lobby?.pilotTab === true && r.stories; })());
check("decision does not mutate its inputs", (() => { const l = { ...LOBBY }; d({ lobby: l }); return JSON.stringify(l) === JSON.stringify(LOBBY); })());

// --- URL params ---
check("shellForce: absent, 0 and junk are not requests", !shellForceRequested("") && !shellForceRequested("?shellForce=0") && !shellForceRequested("?shellForce=yes"));
check("shellForce=1 is a request", shellForceRequested("?shell=1&shellForce=1"));
check("force counts only for a server-confirmed crew session", (() => {
  const s = "?shell=1&shellForce=1";
  return (
    shellForceAllowed(s, { clipInbox: true, tier: "free" }) &&
    shellForceAllowed(s, { clipInbox: false, tier: "admin" }) &&
    !shellForceAllowed(s, { clipInbox: false, tier: "free" }) &&
    !shellForceAllowed(s, { clipInbox: false, tier: "premium" })
  );
})());
check("force is never allowed without the param, even for crew", !shellForceAllowed("?shell=1", { clipInbox: true, tier: "admin" }));
check("sessions: number, absent, junk", parseShellSessions("?sessions=7") === 7 && parseShellSessions("") === 0 && parseShellSessions("?sessions=-3") === 0 && parseShellSessions("?sessions=abc") === 0);
check("appv: plain, absent, hostile", parseShellAppVersion("?appv=1.2") === "1.2" && parseShellAppVersion("") === null && parseShellAppVersion("?appv=<script>") === null && parseShellAppVersion("?appv=" + "9".repeat(40)) === null);

// --- native events ---
const ev = (detail: unknown): Event => ({ detail }) as unknown as Event;
check("tier event: booleans only", parseTierEvent(ev({ gold: true })) === true && parseTierEvent(ev({ gold: false })) === false && parseTierEvent(ev({ gold: "true" })) === null && parseTierEvent(ev(null)) === null && parseTierEvent(ev({})) === null);
check("session event: booleans only", parseSessionEvent(ev({ signedIn: true })) === true && parseSessionEvent(ev({ signedIn: false })) === false && parseSessionEvent(ev({ signedIn: 1 })) === null && parseSessionEvent(ev(undefined)) === null);

// --- wiring through the real registry rows ---
const row = (id: number, from: string, enabled: boolean, params: object) => ({ id, from, enabled, params, hash: "h" + id });
const payload = (flags: Record<string, ReturnType<typeof row>[]>) => ({
  schema: 1,
  flags: Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, { versions: v }])),
});
const FROM = "2020-01-01";
const live = (flags: Record<string, ReturnType<typeof row>[]>) => {
  resetFlagsForTest();
  setRemoteFeatures(payload(flags));
  return shellDecision({ shellVersion: 1, flagsLoaded: flagsLoaded(), appShell: appFlags().appShell, lobby: clientFlagsSnapshot().lobby });
};
resetFlagsForTest();
check("no rows and no cache: flagsLoaded false, both app keys off, ClientFlags never carries them", !flagsLoaded() && appFlags().appShell === null && appFlags().appReview === null && !("appShell" in clientFlagsSnapshot()));
check("no app.shell row but ui.lobby on: still fallback (the app never follows ui.lobby alone)", live({ "ui.lobby": [row(1, FROM, true, LOBBY)] }).reason === "switch-off");
check("both rows on: shell on", live({ "ui.lobby": [row(1, FROM, true, LOBBY)], "app.shell": [row(2, FROM, true, { minShell: 1 })] }).on);
check("ui.lobby row switched off: fallback lobby-off", live({ "ui.lobby": [row(1, FROM, false, LOBBY)], "app.shell": [row(2, FROM, true, { minShell: 1 })] }).reason === "lobby-off");
check("app.shell emergency off (later row, disabled): fallback", live({ "ui.lobby": [row(1, FROM, true, LOBBY)], "app.shell": [row(2, FROM, true, {}), row(3, FROM, false, {})] }).reason === "switch-off");
check("old production rows (no app keys at all): fallback, as 1.1", (() => {
  const r = live({ "ui.lobby": [row(1, FROM, true, LOBBY)], overdrive: [row(9, FROM, true, {})] });
  return !r.on;
})());
check("a creator-style force: preview flags give the registry defaults", (() => {
  resetFlagsForTest();
  const p = { "ui.lobby": true, "app.shell": true };
  const r = shellDecision({ shellVersion: 1, flagsLoaded: true, appShell: appFlags(p).appShell, lobby: clientFlagsSnapshot(p).lobby });
  return r.on && r.lobby?.briefing === true;
})());
resetFlagsForTest();

// --- source wiring (no DOM test env) ---
const src = (f: string): string => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const main = src("src/main.ts");
const native = src("src/native.ts");
check("main: shell boots after flagsReady(1500) and posts shellReady or shellFallback", /flagsReady\(SHELL_FLAGS_WAIT_MS\)/.test(main) && /SHELL_FLAGS_WAIT_MS = 1500/.test(main) && /type: "shellReady"/.test(main) && /type: "shellFallback", reason/.test(main));
check("main: shell skips the tap-to-enter gate", /else if \(isShellHost\(\)\) void bootShellHost\(\);\s*else ui\.showIntroGate/.test(main));
check("main: lobby allowed = website or shell on, params from the AND-combined decision", /isShellHost\(\) \? shellState\.on : !isAppBinary\(\)/.test(main) && /isShellHost\(\) \? shellState\.lobby : clientFlagsSnapshot\(PREVIEW_FLAGS\)\.lobby/.test(main));
check("main: briefing context reads the host lobby params", /params: hostLobbyParams\(\),\s*allowed: lobbyHostAllowed\(\)/.test(main));
check("main: stories narrowed by app.shell.stories", /shellState\.stories/.test(main));
check("main: a shell that is off stays blank (Swift owns the screen)", /IS_NATIVE_PLAY \|\| \(isShellHost\(\) && !shellState\.on\)/.test(main));
check("main: shellForce needs the server-confirmed session", /shellForceAllowed\(location\.search, api\)/.test(main));
check("main: native tier and session events are handled", /"orion-native-tier"/.test(main) && /"orion-native-session"/.test(main) && /adoptStoredSession/.test(main) && /setNativeGold\(gold\)/.test(main));
check("main: signedOut is posted on a rejected token, once", /onSessionRejected = \(\) =>/.test(main) && /shellSignedOutPosted/.test(main));
check("main: the app never logs a web visit", /if \(!isAppBinary\(\)\) api\.logVisit/.test(main));
check("main: community sign in / profile route to native Settings in the shell", /community\.nativeAccountRoute = /.test(main) && /type: "openSettings", section/.test(main));
check("main: session export after runs, guest signup and auth change (shell only)", (main.match(/if \(isShellHost\(\)\) exportNativeSession\(\)/g) ?? []).length === 3);
check("native: chrome{playing} goes to the bridge in the shell", /isShellHost\(\)\) \{[^}]*type: "chrome", playing/.test(native));
check("native: shell-only messages are no-ops elsewhere", /export function postShell\(msg: ShellMessage\): void \{\s*if \(!isShellHost\(\)\) return;/.test(native));
check("community: web account screens are bypassed in the shell (no sign out or delete buttons)", /showAuth\(onDone: \(\) => void\): void \{\s*if \(this\.nativeAccountRoute\?\.\("pilot", onDone\)\) return;/.test(src("src/community.ts")) && /showProfile\(\): void \{\s*if \(this\.nativeAccountRoute\?\.\("pilot"\)\) return;/.test(src("src/community.ts")));
check("api: session adoption and rejection hooks exist", /adoptStoredSession\(\)/.test(src("src/api.ts")) && /onSessionRejected/.test(src("src/api.ts")));

// the one new network-free guard: no module added for the shell touches Stripe
check("appShell.ts and reviewPrompt.ts mention no Stripe, checkout or price", !/stripe|checkout|price/i.test(src("src/appShell.ts") + src("src/reviewPrompt.ts")));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall app shell checks passed");
