// Sign in with Apple: verify the identity JWT against Apple's JWKS.
// Zero dependencies (same RS256 path as clerk.mjs).

import crypto from "node:crypto";

const APPLE_ISS = "https://appleid.apple.com";
const APPLE_AUD = "com.surviveorion.app";

let jwks = null;
let jwksFetchedAt = 0;

async function getJwks() {
  if (!jwks || Date.now() - jwksFetchedAt > 3600_000) {
    const res = await fetch("https://appleid.apple.com/auth/keys");
    if (!res.ok) throw new Error("apple jwks fetch failed");
    jwks = await res.json();
    jwksFetchedAt = Date.now();
  }
  return jwks;
}

/** Verify an Apple identity token. Returns { sub, email, name? } or null. */
export async function verifyAppleToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());

    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    if (payload.iss !== APPLE_ISS) return null;
    if (payload.aud !== APPLE_AUD) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;

    const keys = (await getJwks()).keys ?? [];
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
    const ok = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], "base64url"),
    );
    if (!ok) return null;
    return { sub: payload.sub, email: payload.email ?? null };
  } catch {
    return null;
  }
}
