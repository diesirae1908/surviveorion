// StoreKit 2 JWS (signed transaction) verify. Zero extra deps.
// ES256 against x5c[0], then walk the x5c chain to bundled Apple Root CA - G3.
// Leaf-only / forged leaves that do not chain to that root fail closed.
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

/**
 * Require x5c to chain to bundled Apple Root CA - G3.
 * Does not fetch intermediates. Leaf-only tokens fail unless the leaf
 * itself is signed by the Apple root (it is not, in StoreKit 2).
 */
export function verifyX5cToAppleRoot(x5c) {
  if (!Array.isArray(x5c) || typeof x5c[0] !== "string") return null;
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
  if (!certTimeOk(root)) return null;

  for (const cert of certs) {
    if (!certTimeOk(cert)) return null;
    if (!looksLikeApple(cert)) return null;
  }

  const leaf = certs[0];
  if (!`${leaf.issuer}`.toLowerCase().includes("apple")) return null;

  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].verify(certs[i + 1].publicKey)) return null;
  }

  const last = certs[certs.length - 1];
  if (last.fingerprint256.toUpperCase() === root.fingerprint256.toUpperCase()) {
    return leaf;
  }
  if (!last.verify(root.publicKey)) return null;
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
  const leaf = verifyX5cToAppleRoot(decoded.header?.x5c);
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
  return {
    productId,
    transactionId: String(payload.transactionId ?? payload.originalTransactionId ?? ""),
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
