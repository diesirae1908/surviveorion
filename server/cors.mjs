/**
 * Tight CORS allowlist for the native shell (Capacitor / future Android).
 * Web clients stay same-origin and never need these headers.
 * Do not add * and do not change rate limits or the daily attempt budget.
 */

export const APP_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "https://localhost",
  "http://localhost",
]);

/** Echo the request Origin only when it is an allowlisted native shell. */
export function allowedAppOrigin(origin) {
  if (typeof origin !== "string" || !origin) return null;
  return APP_ORIGINS.has(origin) ? origin : null;
}

export function applyCors(req, res) {
  const allowed = allowedAppOrigin(req.headers.origin);
  if (!allowed) return false;
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
  return true;
}

export function isCorsPreflight(req) {
  return req.method === "OPTIONS" && !!allowedAppOrigin(req.headers.origin);
}
