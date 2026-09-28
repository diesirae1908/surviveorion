/**
 * StoreKit 2 JWS chain verify: forged Apple-looking certs must fail,
 * including chains that reach Apple Root CA G3 without StoreKit OIDs.
 * Run: node scripts/test-apple-iap.mjs
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyStoreKitJws,
  verifyPremiumTransaction,
  verifyX5cToAppleRoot,
  entitlementFromPayload,
  sandboxTrustAllowed,
  MAX_ENTITLEMENT_MS,
} from "../server/apple-iap.mjs";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orion-iap-"));
function openssl(args, opts = {}) {
  return spawnSync("openssl", args, { encoding: "utf8", ...opts });
}

const keyPath = path.join(dir, "leaf.key");
const certPath = path.join(dir, "leaf.crt");
const gen = openssl([
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
]);
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

function signJws(header, payload, pem = keyPem) {
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = crypto.sign("SHA256", Buffer.from(signingInput), {
    key: pem,
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
  originalTransactionId: "forged-orig",
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

const intKey = path.join(dir, "int.key");
const intCrt = path.join(dir, "int.crt");
const intGen = openssl([
  "req",
  "-x509",
  "-newkey",
  "ec",
  "-pkeyopt",
  "ec_paramgen_curve:prime256v1",
  "-keyout",
  intKey,
  "-out",
  intCrt,
  "-days",
  "2",
  "-nodes",
  "-subj",
  "/CN=Apple Inc/OU=Apple Certification Authority/O=Apple Inc/C=US",
  "-addext",
  "basicConstraints=critical,CA:TRUE",
  "-addext",
  "1.2.840.113635.100.6.2.1=DER:05:00",
]);
check("openssl intermediate CA", intGen.status === 0, intGen.stderr);

const leafCsr = path.join(dir, "leaf.csr");
const leafSigned = path.join(dir, "leaf-signed.crt");
const leafExt = path.join(dir, "leaf.ext");
const leafNoOidExt = path.join(dir, "leaf-noid.ext");
fs.writeFileSync(leafExt, "1.2.840.113635.100.6.11.1=DER:05:00\n");
fs.writeFileSync(leafNoOidExt, "basicConstraints=CA:FALSE\n");
const csr = openssl([
  "req",
  "-new",
  "-newkey",
  "ec",
  "-pkeyopt",
  "ec_paramgen_curve:prime256v1",
  "-keyout",
  path.join(dir, "leaf2.key"),
  "-out",
  leafCsr,
  "-nodes",
  "-subj",
  "/CN=Apple Inc/O=Apple Inc/C=US",
]);
check("openssl leaf csr", csr.status === 0, csr.stderr);

const signLeaf = openssl([
  "x509",
  "-req",
  "-in",
  leafCsr,
  "-CA",
  intCrt,
  "-CAkey",
  intKey,
  "-CAcreateserial",
  "-out",
  leafSigned,
  "-days",
  "2",
  "-extfile",
  leafExt,
]);
check("openssl sign leaf with StoreKit OID", signLeaf.status === 0, signLeaf.stderr);

const signLeafNoOid = openssl([
  "x509",
  "-req",
  "-in",
  leafCsr,
  "-CA",
  intCrt,
  "-CAkey",
  intKey,
  "-CAcreateserial",
  "-out",
  path.join(dir, "leaf-noid.crt"),
  "-days",
  "2",
  "-extfile",
  leafNoOidExt,
]);
check("openssl sign leaf without StoreKit OID", signLeafNoOid.status === 0, signLeafNoOid.stderr);

function derB64(pemPath) {
  check(`der exists ${path.basename(pemPath)}`, fs.existsSync(pemPath));
  const out = spawnSync("openssl", ["x509", "-in", pemPath, "-outform", "DER"], {
    encoding: "buffer",
  });
  check(`der export ${path.basename(pemPath)}`, out.status === 0);
  return Buffer.from(out.stdout).toString("base64");
}

const rootPemPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "server",
  "certs",
  "AppleRootCA-G3.pem",
);
const appleRootB64 = derB64(rootPemPath);
const intB64 = derB64(intCrt);
const leafWithOidB64 = derB64(leafSigned);
const leafNoOidB64 = derB64(path.join(dir, "leaf-noid.crt"));

check(
  "3-chain ending at Apple root but leaf missing 6.11.1 OID is rejected",
  verifyX5cToAppleRoot([leafNoOidB64, intB64, appleRootB64]) === null,
);
check(
  "3-chain under a self-made intermediate (not Apple-signed) is rejected",
  verifyX5cToAppleRoot([leafWithOidB64, intB64, appleRootB64]) === null,
);
check(
  "2-chain under a test root is rejected",
  verifyX5cToAppleRoot([leafWithOidB64, intB64]) === null,
);

const leaf2Pem = fs.readFileSync(path.join(dir, "leaf2.key"), "utf8");
const chainedForged = signJws(
  { alg: "ES256", x5c: [leafWithOidB64, intB64, appleRootB64] },
  goodPayload,
  leaf2Pem,
);
check("JWS chained under a test CA (not Apple-signed) is rejected", verifyStoreKitJws(chainedForged) === null);

const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const signingInput = `${b64urlJson({ alg: "RS256", x5c: [x5cLeaf] })}.${b64urlJson(goodPayload)}`;
const rsaSig = crypto.sign("SHA256", Buffer.from(signingInput), rsa.privateKey);
const rs256 = `${signingInput}.${rsaSig.toString("base64url")}`;
check("alg RS256 is rejected", verifyStoreKitJws(rs256) === null);

const ent = entitlementFromPayload(goodPayload);
check("entitlement accepts known monthly product", ent?.productId === goodPayload.productId);
check("entitlement returns originalTransactionId", ent?.originalTransactionId === "forged-orig");
check("entitlement appAccountToken is null when absent", ent?.appAccountToken === null);
check(
  "entitlement returns appAccountToken when present",
  entitlementFromPayload({ ...goodPayload, appAccountToken: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" })
    ?.appAccountToken === "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
);

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
check(
  "entitlement rejects expiresDate 10 years out",
  entitlementFromPayload({
    ...goodPayload,
    purchaseDate: Date.now(),
    expiresDate: Date.now() + 10 * 365 * 86_400_000,
  }) === null,
);
check(
  "entitlement allows yearly window under 400 days",
  !!entitlementFromPayload({
    ...goodPayload,
    purchaseDate: Date.now(),
    expiresDate: Date.now() + 370 * 86_400_000,
  }),
);
check("MAX_ENTITLEMENT_MS is 400 days", MAX_ENTITLEMENT_MS === 400 * 86_400_000);

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
