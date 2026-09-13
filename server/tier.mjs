// Account tier: free / premium / admin.
// Admin is allowlist (clip-inbox) or users.role='admin'. Admin implies Premium.

import { clipInboxAllowed } from "./clip-inbox.mjs";
import { isValidUtcDateStr } from "./dateUtils.mjs";

export const PREMIUM_PRODUCTS = new Set([
  "com.surviveorion.app.premium.monthly",
  "com.surviveorion.app.premium.yearly",
]);

export function userTier(user) {
  if (!user) {
    return { tier: "free", admin: false, premiumActive: false, clipInbox: false };
  }
  const clipInbox = clipInboxAllowed(user);
  const role = typeof user.role === "string" ? user.role.toLowerCase() : "free";
  const until = Number(user.premium_until || 0);
  const premiumUntilActive = Number.isFinite(until) && until > Date.now();
  const admin = clipInbox || role === "admin";
  const premiumActive = admin || premiumUntilActive || role === "premium";
  const tier = admin ? "admin" : premiumActive ? "premium" : "free";
  return { tier, admin, premiumActive, clipInbox };
}

/**
 * Daily score date for POST /api/scores.
 * Today always allowed (existing 3-attempt rules apply later).
 * Past dates require premium/admin. Future dates require admin.
 */
export function resolveDailySubmit(body, user, today) {
  if (body?.daily !== true) return { dailyDate: null };
  const raw = body.dailyDate;
  const requested =
    typeof raw === "string" && isValidUtcDateStr(raw) ? raw : today;
  const t = userTier(user);
  if (requested < today && !t.premiumActive) {
    return {
      error: {
        status: 403,
        error: "Gold Patrol required to file a past-day score.",
        code: "PREMIUM_REQUIRED",
      },
    };
  }
  if (requested > today && !t.admin) {
    return {
      error: {
        status: 403,
        error: "Crew rehearsal only",
        code: "CREW_REQUIRED",
      },
    };
  }
  return { dailyDate: requested };
}

export function addCivilDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Clamp a mutator catalog range so free/premium never see future names. */
export function clampMutatorRange({ from, to, today, admin, horizon = 14 }) {
  if (!isValidUtcDateStr(from) || !isValidUtcDateStr(to) || from > to) {
    return { error: "invalid date range" };
  }
  const maxTo = admin ? addCivilDays(today, horizon) : today;
  const clampedTo = to > maxTo ? maxTo : to;
  if (from > clampedTo) return { from, to: clampedTo, empty: true };
  return { from, to: clampedTo, empty: false };
}
