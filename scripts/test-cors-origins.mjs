/**
 * Native-shell CORS allowlist: capacitor://localhost in, random origins out.
 * Does not change rate limits or the daily attempt budget.
 */
import assert from "node:assert/strict";
import { allowedAppOrigin, applyCors, isCorsPreflight, APP_ORIGINS } from "../server/cors.mjs";

assert.equal(allowedAppOrigin("capacitor://localhost"), "capacitor://localhost");
assert.equal(allowedAppOrigin("ionic://localhost"), "ionic://localhost");
assert.equal(allowedAppOrigin("https://localhost"), "https://localhost");
assert.equal(allowedAppOrigin("http://localhost"), "http://localhost");
assert.equal(allowedAppOrigin("https://surviveorion.com"), null);
assert.equal(allowedAppOrigin("http://localhost:5173"), null);
assert.equal(allowedAppOrigin("https://evil.example"), null);
assert.equal(allowedAppOrigin(""), null);
assert.equal(allowedAppOrigin(undefined), null);
assert.ok(APP_ORIGINS.has("capacitor://localhost"));
assert.ok(!APP_ORIGINS.has("*"));

const headers = {};
const res = {
  setHeader(k, v) {
    headers[k] = v;
  },
};
assert.equal(applyCors({ headers: { origin: "capacitor://localhost" } }, res), true);
assert.equal(headers["Access-Control-Allow-Origin"], "capacitor://localhost");
assert.equal(headers["Access-Control-Allow-Headers"], "Authorization, Content-Type");
assert.match(headers["Access-Control-Allow-Methods"], /DELETE/);

const denied = {};
const res2 = {
  setHeader(k, v) {
    denied[k] = v;
  },
};
assert.equal(applyCors({ headers: { origin: "https://evil.example" } }, res2), false);
assert.equal(denied["Access-Control-Allow-Origin"], undefined);

assert.equal(
  isCorsPreflight({ method: "OPTIONS", headers: { origin: "capacitor://localhost" } }),
  true,
);
assert.equal(
  isCorsPreflight({ method: "GET", headers: { origin: "capacitor://localhost" } }),
  false,
);
assert.equal(isCorsPreflight({ method: "OPTIONS", headers: { origin: "https://evil.example" } }), false);

console.log("PASS  native CORS allowlist (capacitor://localhost only, no wildcard)");
