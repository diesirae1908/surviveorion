/**
 * Host predicate (web / play / shell) and the billing source guards (iOS 1.2 WS-A1).
 * Pure node test, no DOM. Run: npx tsx scripts/test-app-host.ts
 *
 * The website (no `shell` param, no native bridge) must keep today's value for every gate;
 * the app binary (play page or web shell) must never reach a Stripe surface.
 */
import { readFileSync } from "node:fs";
import {
  apiBase,
  appHost,
  classifyAppHost,
  isAppBinary,
  isShellHost,
  nativeGold,
  parseNativeShell,
  postNativePremium,
  setNativeGold,
} from "../src/native.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- parseNativeShell ---
check("shell: absent", parseNativeShell("") === null && parseNativeShell("?fullgame=1") === null);
check("shell: 1", parseNativeShell("?shell=1&appv=1.2") === 1);
check("shell: 12", parseNativeShell("?shell=12") === 12);
check("shell: junk and zero are not a shell", ["?shell=", "?shell=0", "?shell=abc", "?shell=1.5", "?shell=-1", "?shell=100"].every((q) => parseNativeShell(q) === null));

// --- classifyAppHost truth table: search x bridge x capacitor ---
const rows: [string, string, boolean, boolean, "web" | "play" | "shell"][] = [
  ["website", "", false, false, "web"],
  ["website fullgame", "?fullgame=1", false, false, "web"],
  ["website with a pasted ?shell=1 (no bridge)", "?shell=1", false, false, "web"],
  ["website preview params", "?mutator=nova&flags=x", false, false, "web"],
  ["play daily", "?nativePlay=daily", true, false, "play"],
  ["play training", "?nativePlay=training&goldPatrol=1", true, false, "play"],
  ["play without a bridge still play (1.1 behaviour)", "?nativePlay=daily", false, false, "play"],
  ["shell", "?shell=1&appv=1.2&sessions=3", true, false, "shell"],
  ["shell force + gold", "?shell=1&shellForce=1&goldPatrol=1", true, false, "shell"],
  ["play wins over shell", "?nativePlay=daily&shell=1", true, false, "play"],
  ["bridge but no shell param is the website", "", true, false, "web"],
  ["legacy Capacitor counts as play", "", false, true, "play"],
];
check("classify: capacitor: origin without params is the app, not the website", classifyAppHost("", true, false, true) === "play");
check("classify: capacitor: origin with ?shell= is the shell", classifyAppHost("?shell=1", false, false, true) === "shell");
check("classify: https origin with a bridge and no params stays web", classifyAppHost("", true, false, false) === "web");
for (const [name, search, bridge, cap, want] of rows) {
  check(`classify: ${name}`, classifyAppHost(search, bridge, cap) === want, `${classifyAppHost(search, bridge, cap)}`);
}

// --- the runtime predicate against stubbed globals ---
type G = { location?: unknown; window?: unknown };
const g = globalThis as unknown as G;
const posts: unknown[] = [];
function setHost(search: string, bridge: boolean, protocol = "https:"): void {
  g.location = { search, protocol };
  g.window = bridge ? { webkit: { messageHandlers: { orion: { postMessage: (m: unknown) => posts.push(m) } } } } : {};
  setNativeGold(null);
}

setHost("", false);
check("web: appHost web", appHost() === "web");
check("web: not an app binary, not a shell", !isAppBinary() && !isShellHost());
check("web: apiBase is same-origin", apiBase() === "");
check("web: nativeGold false", nativeGold() === false);
setHost("?goldPatrol=1", false);
check("web: ?goldPatrol=1 on the website does nothing", nativeGold() === false);
setHost("?shell=1&goldPatrol=1", false);
check("web: pasted ?shell=1 stays web, no gold, no posts", appHost() === "web" && !nativeGold());
posts.length = 0;
postNativePremium();
check("web: postNativePremium is a no-op", posts.length === 0);

setHost("?nativePlay=daily&goldPatrol=1", true);
check("play: host + app binary", appHost() === "play" && isAppBinary() && !isShellHost());
check("play: apiBase is the live origin", apiBase() === "https://surviveorion.com");
check("play: URL gold hint", nativeGold() === true);
setNativeGold(false);
check("play: a pushed tier overrides the URL hint", nativeGold() === false);
posts.length = 0;
postNativePremium("calendar");
check("play: premium posts to the bridge", posts.length === 1 && (posts[0] as { type: string }).type === "premium");

setHost("?shell=1&appv=1.2&sessions=2", true, "capacitor:");
check("shell: host + app binary + shell", appHost() === "shell" && isAppBinary() && isShellHost());
check("shell: apiBase is the live origin", apiBase() === "https://surviveorion.com");
check("shell: no gold until native says so", nativeGold() === false);
setNativeGold(true);
check("shell: pushed tier gold", nativeGold() === true);
posts.length = 0;
postNativePremium("calendar");
check("shell: premium posts to the bridge", posts.length === 1 && (posts[0] as { type: string }).type === "premium");
setHost("?shell=1", false, "capacitor:");
check("shell: capacitor origin alone counts as a bridge", appHost() === "shell");

// --- source guards (the money path) ---
const src = (f: string): string => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const main = src("src/main.ts");
const api = src("src/api.ts");
const ui = src("src/ui.ts");
const community = src("src/community.ts");

/** Body of `function name(...) {...}` up to the next top-level closing brace. */
function body(code: string, signature: RegExp): string {
  const m = signature.exec(code);
  if (!m) return "";
  const start = m.index;
  const end = code.indexOf("\n}\n", start);
  return code.slice(start, end === -1 ? undefined : end + 3);
}

const BILLING_FUNCS: [string, RegExp][] = [
  ["webStripeBillingAvailable", /function webStripeBillingAvailable\(/],
  ["goldOfferAvailable", /function goldOfferAvailable\(/],
  ["trackPaywall", /function trackPaywall\(/],
  ["startStripeCheckout", /async function startStripeCheckout\(/],
  ["startStripePortal", /async function startStripePortal\(/],
  ["openWebGoldPatrolPaywall", /function openWebGoldPatrolPaywall\(/],
  ["openGoldPatrol", /function openGoldPatrol\(/],
  ["manageGoldPatrol", /function manageGoldPatrol\(/],
  ["challengeAllowed", /function challengeAllowed\(/],
];
for (const [name, sig] of BILLING_FUNCS) {
  const b = body(main, sig);
  check(`guard: ${name} exists`, b.length > 0);
  check(`guard: ${name} reads the host predicate, not isNativeApp/IS_NATIVE_PLAY`, !/isNativeApp\(|IS_NATIVE_PLAY/.test(b));
}
check("guard: startStripeCheckout refuses in the app", /isAppBinary\(\)\) throw/.test(body(main, /async function startStripeCheckout\(/)));
check("guard: startStripePortal refuses in the app", /isAppBinary\(\)\) throw/.test(body(main, /async function startStripePortal\(/)));
check("guard: api.startStripeCheckout refuses in the app", /async startStripeCheckout[^}]*isAppBinary\(\)\) throw/.test(api));
check("guard: api.openStripePortal refuses in the app", /async openStripePortal[^}]*isAppBinary\(\)\) throw/.test(api));
check("guard: challengeAllowed excludes the whole app binary", /!isAppBinary\(\)/.test(body(main, /function challengeAllowed\(/)));

// Callers: the router is the only entry to the web paywall; the portal has one caller; checkout has two.
const count = (code: string, re: RegExp): number => (code.match(re) ?? []).length;
check("callers: openWebGoldPatrolPaywall is called only by the router", count(main, /openWebGoldPatrolPaywall\(/g) === 2, `${count(main, /openWebGoldPatrolPaywall\(/g)} (definition + router)`);
check("callers: startStripePortal is called only by manageGoldPatrol", count(main, /startStripePortal\(/g) === 2);
check("callers: startStripeCheckout is the paywall runCheckout + the ui callback + definition", count(main, /startStripeCheckout\(/g) === 5, `${count(main, /startStripeCheckout\(/g)}`);
check("callers: no module outside main/api names the Stripe entry points", !/startStripeCheckout|openStripePortal|startStripePortal/.test(ui + community + src("src/share.ts") + src("src/native.ts")));
check("callers: location.assign only in the two guarded Stripe functions", count(main, /location\.assign\(/g) === 2);
check("no isNativeApp() left in a billing condition in main.ts", !/(webStripeBilling|stripeBilling|showWebGoldPatrol|showGoldPatrolCta)[^;\n]*isNativeApp\(/.test(main));
check("community: web gold + google gate on the host predicate", /!isAppBinary\(\) && this\.api\.stripeBilling/.test(community) && /googleClientId\) && !isAppBinary\(\)/.test(community));
check("ui: App Store CTA hidden in the app (no APP_STORE_LIVE const left)", !/\bAPP_STORE_LIVE\b/.test(ui) && /APP_STORE_LISTING_LIVE && !isAppBinary\(\)/.test(ui));
check("ui: lobby upsell has no required price", !/info\.showWebGoldPatrol && info\.goldPatrolPrices &&/.test(ui));
check("main: lobby info prices only on the website", /goldPatrolPrices: webStripeBillingAvailable\(\)/.test(main));
check("main: every Gold entry goes through openGoldPatrol", count(main, /openGoldPatrol\(/g) >= 5);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall app host checks passed");
