// Challenge links (`ui.challenge` switch): /c/<code> shares a pilot's daily
// score for one patrol day. Pure handlers, same pattern as paywall.mjs: the
// caller injects the store, the rate limiter, the masking function and the
// resolved switch, so every rule here is testable without a server.
//
// The link row stores NO score. The score is read from the pilot's daily
// rows at request time (store.challengeScore), never from the client.

/** Crockford base32: no I, L, O, U. */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 7;

/** Client step name -> counter column on challenge_links. */
export const CHALLENGE_STEPS = Object.freeze({
  shared: "shares",
  opened: "opens",
  opened_new: "opens_new",
  flew: "flights",
  beat: "beats",
  lost: "losses",
  back: "backs",
});

export const MINT_RATE_MAX = 10;
export const RESOLVE_RATE_MAX = 60;
export const EVENT_RATE_MAX = 30;
export const OG_RATE_MAX = 60;

export const OG_START = "<!-- og:start -->";
export const OG_END = "<!-- og:end -->";
export const DEFAULT_ORIGIN = "https://surviveorion.com";
const OG_IMAGE = "https://surviveorion.com/og.png";

/** `n` random Crockford characters from 5 random bits each (35 bits for 7). */
export function newCode(randomBytes, length = CODE_LENGTH) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] & 31];
  return out;
}

/** Upper-cased code when it is 7 Crockford characters, else null. */
export function normalizeCode(raw) {
  if (typeof raw !== "string" || raw.length !== CODE_LENGTH) return null;
  const up = raw.toUpperCase();
  for (const ch of up) if (!CODE_ALPHABET.includes(ch)) return null;
  return up;
}

// Patrol #1 = 2026-07-14. Parity with src/share.ts dailyNumber is pinned by test.
const EPOCH_UTC = Date.UTC(2026, 6, 14);
export function patrolNumberFor(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr ?? "");
  if (!m) return null;
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((day - EPOCH_UTC) / 86_400_000) + 1;
}

export const challengeUrl = (origin, code) => `${origin}/c/${code}`;

/**
 * Normalize a resolved `ui.challenge` flag into `{ on, param(name) }`.
 * Sub-switches read `=== true`, so a param missing from an older row is OFF.
 * `resolved` is the flags.resolveFlag result (or null).
 */
export function challengeSwitch(resolved) {
  const on = !!(resolved && resolved.enabled);
  const params = on && resolved.params && typeof resolved.params === "object" ? resolved.params : {};
  return { on, param: (name) => on && params[name] === true };
}

/** POST /api/challenge. */
export function handleMint({ user, sw, patrolDate, rateLimit, store, randomBytes, origin }) {
  if (!sw.on || !sw.param("mint")) return { status: 200, json: { active: false } };
  if (!user) return { status: 401, json: { error: "sign in required" } };
  if (!rateLimit(`challenge-mint:${user.id}`, MINT_RATE_MAX)) {
    return { status: 429, json: { error: "slow down" } };
  }
  const score = store.challengeScore(user.id, patrolDate);
  if (!score) return { status: 409, json: { error: "no daily score today" } };
  const code = store.mintChallenge(user.id, patrolDate, () => newCode(randomBytes));
  return {
    status: 200,
    json: {
      active: true,
      code,
      url: challengeUrl(origin, code),
      patrolDate,
      patrolNumber: patrolNumberFor(patrolDate),
      score,
    },
  };
}

/** The link plus the challenger's live score, or null (unknown code / no score). */
function loadLink(store, code) {
  const link = code ? store.getChallenge(code) : null;
  if (!link) return null;
  const score = store.challengeScore(link.userId, link.patrolDate);
  if (!score) return null;
  return { link, score };
}

/** GET /api/challenge/:code. `sanitize` is the board routes' sanitizeEntry. */
export function handleResolve({ rawCode, viewer, ip, sw, today, rateLimit, store, sanitize }) {
  if (!sw.on) return { status: 200, json: { active: false } };
  if (!rateLimit(`challenge-get:${ip}`, RESOLVE_RATE_MAX)) {
    return { status: 429, json: { error: "slow down" } };
  }
  const found = loadLink(store, normalizeCode(rawCode));
  if (!found) return { status: 404, json: { error: "not found" } };
  const { link, score } = found;
  return {
    status: 200,
    json: {
      active: true,
      status: link.patrolDate === today ? "live" : "expired",
      self: !!viewer && viewer.id === link.userId,
      callsign: sanitize({ callsign: link.callsign }).callsign,
      score,
      patrolDate: link.patrolDate,
      patrolNumber: patrolNumberFor(link.patrolDate),
    },
  };
}

/** POST /api/challenge/:code/event. Counters are vanity and approximate. */
export function handleEvent({ rawCode, body, ip, sw, rateLimit, store }) {
  if (!rateLimit(`challenge-event:${ip}`, EVENT_RATE_MAX)) {
    return { status: 429, json: { error: "slow down" } };
  }
  if (!sw.on) return { status: 200, json: { ok: true } };
  const step = body && typeof body === "object" ? body.step : undefined;
  if (typeof step !== "string" || !Object.hasOwn(CHALLENGE_STEPS, step)) {
    return { status: 400, json: { error: "invalid step" } };
  }
  const code = normalizeCode(rawCode);
  if (code) store.bumpChallenge(code, CHALLENGE_STEPS[step]);
  return { status: 200, json: { ok: true } };
}

const fmtScore = (n) => Number(n).toLocaleString("en-US");

/**
 * Link-preview copy for /c/<code>, or null when the plain page should be
 * served (switch or ogMeta off, rate limited, unknown code, no score).
 */
export function challengeOgFor({ rawCode, ip, sw, today, rateLimit, store, sanitize, origin }) {
  if (!sw.on || !sw.param("ogMeta")) return null;
  if (!rateLimit(`challenge-og:${ip}`, OG_RATE_MAX)) return null;
  const code = normalizeCode(rawCode);
  const found = loadLink(store, code);
  if (!found) return null;
  const { link, score } = found;
  const name = sanitize({ callsign: link.callsign }).callsign;
  const num = patrolNumberFor(link.patrolDate);
  const live = link.patrolDate === today;
  return {
    title: live
      ? `Beat ${name}'s ${fmtScore(score)} on ORION Patrol #${num}`
      : `${name} flew ${fmtScore(score)} on ORION Patrol #${num}`,
    description: live
      ? "Same run for every pilot today. Three attempts. Free in your browser."
      : "That patrol is closed. Today's is open: same run for every pilot, three attempts, free in your browser.",
    url: challengeUrl(origin, code),
  };
}

export const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Replacement head block (between the og markers). Every value escaped. */
export function challengeOgBlock({ title, description, url }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  return [
    OG_START,
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${escapeHtml(DEFAULT_ORIGIN)}/" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="ORION" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    OG_END,
  ].join("\n    ");
}

/** Swap the og block in `html`. Fail-safe: a missing marker returns `html` untouched. */
export function withOgBlock(html, block) {
  const a = html.indexOf(OG_START);
  const b = html.indexOf(OG_END);
  if (a < 0 || b < a) return html;
  return html.slice(0, a) + block + html.slice(b + OG_END.length);
}
