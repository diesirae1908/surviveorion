// StoreKit 2 JWS (signed transaction) verify. Zero extra deps.
// ES256 against x5c[0], then walk the x5c chain to bundled Apple Root CA - G3.
// Leaf and intermediate must carry Apple's StoreKit marker OIDs; any other
// Apple-issued cert under Root G3 (Apple Pay, WWDR app signing, etc.) fails.
// Unverified transaction ids are never trusted unless ORION_PREMIUM_SANDBOX=1.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PREMIUM_PRODUCTS } from "./tier.mjs";

const BUNDLE_ID = "com.surviveorion.app";
const APPLE_ROOT_FINGERPRINT =
  "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79";
const OK_ENVIRONMENTS = new Set(["", "Production", "Sandbox", "Xcode"]);
/** Gold Patrol is monthly or yearly; reject "expires in 2100" forgeries. */
export const MAX_ENTITLEMENT_MS = 400 * 24 * 60 * 60 * 1000;

// Apple marker OIDs as DER TLV (tag 0x06 + length 0x0A + 10-byte value).
// leaf 1.2.840.113635.100.6.11.1 ; intermediate 1.2.840.113635.100.6.2.1
const LEAF_OID_TLV = Buffer.from("060a2a864886f76364060b01", "hex");
const INTERMEDIATE_OID_TLV = Buffer.from("060a2a864886f76364060201", "hex");

const rootPem = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "certs", "AppleRootCA-G3.pem"),
);

function appleRoot() {
  const root = new crypto.X509Certificate(rootPem);
  if (root.fingerprint256.toUpperCase() !== APPLE_ROOT_FINGERPRINT) {
    throw new Error("Apple Root CA - G3 fingerprint mismatch");
  }
  return root;
}

function pemFromX5c(b64) {
  const lines = String(b64).match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

function certTimeOk(cert, now = Date.now()) {
  const from = Date.parse(cert.validFrom);
  const to = Date.parse(cert.validTo);
  return Number.isFinite(from) && Number.isFinite(to) && from <= now && now <= to;
}

function looksLikeApple(cert) {
  return `${cert.issuer}\n${cert.subject}`.toLowerCase().includes("apple");
}

function certHasOidTlv(cert, tlv) {
  const raw = cert.raw;
  if (!Buffer.isBuffer(raw) || raw.length < tlv.length) return false;
  return raw.includes(tlv);
}

function isEcP256(key) {
  if (!key || key.asymmetricKeyType !== "ec") return false;
  const curve = key.asymmetricKeyDetails?.namedCurve;
  if (!curve) return true;
  return curve === "prime256v1" || curve === "P-256" || curve === "secp256r1";
}

/**
 * Require x5c length 2 (leaf + intermediate) or 3 (leaf + intermediate + root).
 * Last cert of a 3-chain must be the bundled Apple Root CA - G3. Length-2
 * chains (root omitted, which StoreKit often does) must have the intermediate
 * signed by that root. Marker OIDs and intermediate CA bit are required.
 */
export function verifyX5cToAppleRoot(x5c, atMs = Date.now()) {
  if (!Array.isArray(x5c) || (x5c.length !== 2 && x5c.length !== 3)) return null;
  if (typeof x5c[0] !== "string") return null;
  let certs;
  try {
    certs = x5c.map((b64) => {
      if (typeof b64 !== "string" || !b64) return null;
      return new crypto.X509Certificate(pemFromX5c(b64));
    });
  } catch {
    return null;
  }
  if (certs.some((c) => !c)) return null;

  let root;
  try {
    root = appleRoot();
  } catch {
    return null;
  }
  if (!certTimeOk(root, atMs) || !certTimeOk(root, Date.now())) return null;

  for (const cert of certs) {
    if (!certTimeOk(cert, atMs)) return null;
    if (!certTimeOk(cert, Date.now())) return null;
    if (!looksLikeApple(cert)) return null;
  }

  const leaf = certs[0];
  const intermediate = certs[1];
  if (!`${leaf.issuer}`.toLowerCase().includes("apple")) return null;
  if (!isEcP256(leaf.publicKey)) return null;
  if (!certHasOidTlv(leaf, LEAF_OID_TLV)) return null;
  if (!certHasOidTlv(intermediate, INTERMEDIATE_OID_TLV)) return null;
  if (!intermediate.ca) return null;

  if (!leaf.verify(intermediate.publicKey)) return null;

  const last = certs[certs.length - 1];
  if (certs.length === 3) {
    if (last.fingerprint256.toUpperCase() !== root.fingerprint256.toUpperCase()) return null;
    if (!intermediate.verify(last.publicKey)) return null;
  } else if (!last.verify(root.publicKey)) {
    return null;
  }
  return leaf;
}

export function decodeJws(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return { header, payload, parts };
  } catch {
    return null;
  }
}

/** Verify ES256 JWS using the x5c chain to Apple Root CA - G3. */
export function verifyStoreKitJws(token) {
  const decoded = decodeJws(token);
  if (!decoded) return null;
  if (decoded.header?.alg !== "ES256") return null;
  const signedAt = Number(decoded.payload?.signedDate);
  const atMs = Number.isFinite(signedAt) && signedAt > 0 ? signedAt : Date.now();
  const leaf = verifyX5cToAppleRoot(decoded.header?.x5c, atMs);
  if (!leaf) return null;
  try {
    const ok = crypto.verify(
      "SHA256",
      Buffer.from(`${decoded.parts[0]}.${decoded.parts[1]}`),
      { key: leaf.publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(decoded.parts[2], "base64url"),
    );
    if (!ok) return null;
    return decoded.payload;
  } catch {
    return null;
  }
}

export function entitlementFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.revocationDate) return null;
  const productId = payload.productId;
  const bundleId = payload.bundleId;
  if (bundleId && bundleId !== BUNDLE_ID) return null;
  if (!PREMIUM_PRODUCTS.has(productId)) return null;
  const env = payload.environment ?? "";
  if (!OK_ENVIRONMENTS.has(env)) return null;
  const expires = Number(payload.expiresDate || 0);
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  const start = Number(payload.purchaseDate || payload.signedDate || Date.now());
  if (!Number.isFinite(start) || expires > start + MAX_ENTITLEMENT_MS) return null;
  const originalTransactionId = String(
    payload.originalTransactionId ?? payload.transactionId ?? "",
  );
  const rawToken = payload.appAccountToken;
  return {
    productId,
    transactionId: String(payload.transactionId ?? payload.originalTransactionId ?? ""),
    originalTransactionId,
    appAccountToken: rawToken ? String(rawToken) : null,
    expiresDate: expires,
    environment: env,
  };
}

export function verifyPremiumTransaction(signedTransaction) {
  const payload = verifyStoreKitJws(signedTransaction);
  if (!payload) return { ok: false, reason: "VERIFY_FAILED" };
  const ent = entitlementFromPayload(payload);
  if (!ent) return { ok: false, reason: "NOT_ENTITLED" };
  return { ok: true, entitlement: ent };
}

export function sandboxTrustAllowed() {
  return process.env.ORION_PREMIUM_SANDBOX === "1";
}
