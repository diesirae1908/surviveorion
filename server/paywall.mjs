// Web Gold Patrol paywall funnel (anonymous beacon). Native / StoreKit stays out.

export const PAYWALL_SOURCES = new Set([
  "calendar_unlock",
  "archive_day",
  "guest_activate",
  "wingmates",
  "lobby_upsell",
  "patrol_complete",
  "settings",
  "gameover",
]);

export const PAYWALL_STEPS = new Set([
  "open",
  "plan_monthly",
  "plan_yearly",
  "auth_prompt",
  "checkout_redirect",
  "checkout_error",
  "dismiss",
]);

export const BILLING_EVENT_KINDS = new Set(["checkout_created", "checkout_completed"]);

/** Same ballpark as POST /api/visit (30) with headroom for a short funnel burst. */
export const PAYWALL_RATE_MAX = 60;

export function parsePaywallBody(body) {
  if (!body || typeof body !== "object") return { error: "invalid source" };
  if (!PAYWALL_SOURCES.has(body.source)) return { error: "invalid source" };
  if (!PAYWALL_STEPS.has(body.step)) return { error: "invalid step" };
  return { source: body.source, step: body.step };
}

/**
 * Pure handler for POST /api/paywall. Rate limit, allowlist, then insert.
 * Checkout prices and entitlement are not touched here.
 */
export function handlePaywallPost({
  body,
  ip,
  signedIn,
  deviceHash,
  patrolDate,
  rateLimit,
  addEvent,
}) {
  if (!rateLimit(`paywall:${ip}`, PAYWALL_RATE_MAX)) {
    return { status: 429, json: { error: "slow down" } };
  }
  const parsed = parsePaywallBody(body);
  if (parsed.error) return { status: 400, json: { error: parsed.error } };
  addEvent({
    source: parsed.source,
    step: parsed.step,
    signedIn: !!signedIn,
    deviceHash: deviceHash ?? null,
    patrolDate,
  });
  return { status: 200, json: { ok: true } };
}
