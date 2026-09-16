/**
 * Device classification + web gate helpers. Hard phone landing is disabled;
 * shouldShowPhoneLanding is always false. Run: npx tsx scripts/test-web-gate.ts
 */
import assert from "node:assert/strict";
import {
  classifyDevice,
  hasWebOverride,
  queryFlag,
  shouldShowPhoneLanding,
  WEB_OVERRIDE_KEY,
} from "../src/webGate.ts";

assert.equal(queryFlag("?web=1", "web", "1"), true);
assert.equal(queryFlag("web=1", "web", "1"), true);
assert.equal(queryFlag("?foo=1", "web", "1"), false);
assert.equal(hasWebOverride("?web=1", false), true);
assert.equal(hasWebOverride("", true), true);
assert.equal(hasWebOverride("", false), false);
assert.equal(WEB_OVERRIDE_KEY, "orion_web_override");

assert.equal(classifyDevice({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", coarsePointer: true, innerWidth: 390 }), "phone");
assert.equal(classifyDevice({ ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36", coarsePointer: true, innerWidth: 412 }), "phone");
assert.equal(classifyDevice({ ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", coarsePointer: true, innerWidth: 1024 }), "tablet");
assert.equal(classifyDevice({ ua: "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 Safari/537.36", coarsePointer: true, innerWidth: 900 }), "tablet");
assert.equal(classifyDevice({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", coarsePointer: false, innerWidth: 1440 }), "desktop");
assert.equal(classifyDevice({ ua: "UnusualBot/1.0", coarsePointer: true, innerWidth: 390 }), "phone");
assert.equal(classifyDevice({ ua: "UnusualBot/1.0", coarsePointer: true, innerWidth: 800 }), "tablet");

const iphone = {
  search: "",
  ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  protocol: "https:",
  nativePlay: false,
  nativeApp: false,
  coarsePointer: true,
  innerWidth: 390,
};

assert.equal(shouldShowPhoneLanding(iphone), false, "phones get lobby, not hard landing");
assert.equal(shouldShowPhoneLanding({ ...iphone, search: "?web=1" }), false);
assert.equal(shouldShowPhoneLanding({ ...iphone, sessionOverride: true }), false);
assert.equal(shouldShowPhoneLanding({ ...iphone, nativePlay: true }), false);
assert.equal(shouldShowPhoneLanding({ ...iphone, nativeApp: true }), false);
assert.equal(shouldShowPhoneLanding({ ...iphone, protocol: "capacitor:" }), false);
assert.equal(shouldShowPhoneLanding({ ...iphone, protocol: "ionic:" }), false);
assert.equal(shouldShowPhoneLanding({ ...iphone, search: "?nativePlay=daily" }), false);
assert.equal(shouldShowPhoneLanding({ ...iphone, search: "?nativePlay=training" }), false);

assert.equal(
  shouldShowPhoneLanding({
    ...iphone,
    ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
    innerWidth: 1024,
  }),
  false,
);

assert.equal(
  shouldShowPhoneLanding({
    search: "",
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    protocol: "https:",
    nativePlay: false,
    nativeApp: false,
    coarsePointer: false,
    innerWidth: 1440,
  }),
  false,
);

console.log("PASS  web gate (device class; phone landing disabled)");
