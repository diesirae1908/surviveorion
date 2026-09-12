// StoreKit 2 JWS (signed transaction) verify. Zero extra deps.
// Uses the x5c leaf on the JWS and checks the issuer looks like Apple.
// Not the full App Store Server Library chain. Production still requires
// a verified signature. Unverified transaction ids are never trusted unless
// ORION_PREMIUM_SANDBOX=1 is set (dev/QA only).

import crypto from "node:crypto";
import { PREMIUM_PRODUCTS } from "./tier.mjs";

const BUNDLE_ID = "com.surviveorion.app";

function pemFromX5c(b64) {
  const lines = String(b64).match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
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

/** Verify ES256 JWS using header.x5c[0]. Returns payload or null. */
export function verifyStoreKitJws(token) {
  const decoded = decodeJws(token);
  if (!decoded) return null;
  const x5c = decoded.header?.x5c;
  if (!Array.isArray(x5c) || typeof x5c[0] !== "string") return null;
  try {
    const certPem = pemFromX5c(x5c[0]);
    const cert = new crypto.X509Certificate(certPem);
    const issuer = `${cert.issuer}`.toLowerCase();
    if (!issuer.includes("apple")) return null;
    const key = cert.publicKey;
    const ok = crypto.verify(
      "SHA256",
      Buffer.from(`${decoded.parts[0]}.${decoded.parts[1]}`),
      { key, dsaEncoding: "ieee-p1363" },
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
  const productId = payload.productId;
  const bundleId = payload.bundleId;
  if (bundleId && bundleId !== BUNDLE_ID) return null;
  if (!PREMIUM_PRODUCTS.has(productId)) return null;
  const expires = Number(payload.expiresDate || 0);
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  return {
    productId,
    transactionId: String(payload.transactionId ?? payload.originalTransactionId ?? ""),
    expiresDate: expires,
    environment: payload.environment ?? "",
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
