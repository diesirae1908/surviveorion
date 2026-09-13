/**
 * StoreKit 2 JWS chain verify: forged Apple-looking leaf must fail.
 * Run: node scripts/test-apple-iap.mjs
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  verifyStoreKitJws,
  verifyPremiumTransaction,
  verifyX5cToAppleRoot,
  entitlementFromPayload,
  sandboxTrustAllowed,
} from "../server/apple-iap.mjs";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orion-iap-"));
const keyPath = path.join(dir, "leaf.key");
const certPath = path.join(dir, "leaf.crt");
const gen = spawnSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "ec",
    "-pkeyopt",
    "ec_paramgen_curve:prime256v1",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "2",
    "-nodes",
    "-subj",
    "/CN=Apple Inc/OU=Apple Certification Authority/O=Apple Inc/C=US",
  ],
  { encoding: "utf8" },
);
check("openssl forged leaf", gen.status === 0, gen.stderr);

const der = spawnSync("openssl", ["x509", "-in", certPath, "-outform", "DER"], {
  encoding: "buffer",
});
check("openssl der export", der.status === 0);
const x5cLeaf = Buffer.from(der.stdout).toString("base64");
const keyPem = fs.readFileSync(keyPath, "utf8");

function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function signJws(header, payload) {
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = crypto.sign("SHA256", Buffer.from(signingInput), {
    key: keyPem,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${sig.toString("base64url")}`;
}

const goodPayload = {
  productId: "com.surviveorion.app.premium.monthly",
  bundleId: "com.surviveorion.app",
  expiresDate: Date.now() + 86_400_000,
  environment: "Production",
  transactionId: "forged-tx",
};

const forged = signJws({ alg: "ES256", x5c: [x5cLeaf] }, goodPayload);
check("forged leaf-only JWS is rejected", verifyStoreKitJws(forged) === null);
check(
  "verifyPremiumTransaction fails closed",
  verifyPremiumTransaction(forged).ok === false &&
    verifyPremiumTransaction(forged).reason === "VERIFY_FAILED",
);
check("verifyX5cToAppleRoot rejects forged leaf", verifyX5cToAppleRoot([x5cLeaf]) === null);
check("verifyX5cToAppleRoot rejects empty", verifyX5cToAppleRoot([]) === null);
check("verifyX5cToAppleRoot rejects junk", verifyX5cToAppleRoot(["not-a-cert"]) === null);

const ent = entitlementFromPayload(goodPayload);
check("entitlement accepts known monthly product", ent?.productId === goodPayload.productId);

check(
  "entitlement rejects unknown product",
  entitlementFromPayload({ ...goodPayload, productId: "com.other.app.premium" }) === null,
);
check(
  "entitlement rejects expired",
  entitlementFromPayload({ ...goodPayload, expiresDate: Date.now() - 1000 }) === null,
);
check(
  "entitlement rejects bad environment",
  entitlementFromPayload({ ...goodPayload, environment: "ForgedLab" }) === null,
);
check(
  "entitlement rejects revoked",
  entitlementFromPayload({ ...goodPayload, revocationDate: Date.now() }) === null,
);
check(
  "entitlement rejects wrong bundle",
  entitlementFromPayload({ ...goodPayload, bundleId: "com.other.app" }) === null,
);

const prev = process.env.ORION_PREMIUM_SANDBOX;
delete process.env.ORION_PREMIUM_SANDBOX;
check("sandbox flag off by default", sandboxTrustAllowed() === false);
process.env.ORION_PREMIUM_SANDBOX = "1";
check("sandbox flag honors ORION_PREMIUM_SANDBOX=1", sandboxTrustAllowed() === true);
if (prev === undefined) delete process.env.ORION_PREMIUM_SANDBOX;
else process.env.ORION_PREMIUM_SANDBOX = prev;

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("PASS  apple IAP chain reject + entitlement checks");
