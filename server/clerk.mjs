// Clerk identity integration, zero dependencies.
// The session JWT from clerk-js is verified locally against the instance's
// JWKS (public keys); the secret key is only used to fetch the user's profile
// (name/email) when creating their Orion account.

import crypto from "node:crypto";

const PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY ?? "";
const SECRET_KEY = process.env.CLERK_SECRET_KEY ?? "";

export const clerkPublishableKey = () => PUBLISHABLE_KEY;
export const clerkEnabled = () => PUBLISHABLE_KEY !== "";

/** The instance's Frontend API domain is base64-encoded in the publishable key. */
export function clerkFrontendApi() {
  const b64 = PUBLISHABLE_KEY.replace(/^pk_(test|live)_/, "");
  try {
    return Buffer.from(b64, "base64").toString("utf8").replace(/\$$/, "");
  } catch {
    return "";
  }
}

let jwks = null;
let jwksFetchedAt = 0;

async function getJwks() {
  if (!jwks || Date.now() - jwksFetchedAt > 3600_000) {
    const res = await fetch(`https://${clerkFrontendApi()}/.well-known/jwks.json`);
    if (!res.ok) throw new Error("jwks fetch failed");
    jwks = await res.json();
    jwksFetchedAt = Date.now();
  }
  return jwks;
}

/** Verify a Clerk session JWT (RS256). Returns the payload or null. */
export async function verifyClerkToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());

    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    if (payload.iss !== `https://${clerkFrontendApi()}`) return null;

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
    return ok ? payload : null;
  } catch {
    return null;
  }
}

/** Fetch name/email from the Clerk Backend API (for the initial callsign). */
export async function clerkUserProfile(userId) {
  if (!SECRET_KEY) return null;
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${SECRET_KEY}` },
    });
    if (!res.ok) return null;
    const u = await res.json();
    const email = u.email_addresses?.[0]?.email_address ?? null;
    const name =
      [u.first_name, u.last_name].filter(Boolean).join(" ") ||
      u.username ||
      email?.split("@")[0] ||
      null;
    return { name, email };
  } catch {
    return null;
  }
}
