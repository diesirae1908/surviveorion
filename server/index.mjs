// Orion community server: accounts, world/arena leaderboards, score submission.
// Zero dependencies — node:http + node:sqlite + node:crypto (Node 22.5+).
//
//   node server/index.mjs            # API on :8787
//   ORION_SERVE_DIST=1 node ...      # also serve the production build (dist/)
//   GOOGLE_CLIENT_ID=... node ...    # enable "Sign in with Google"
//   CLERK_PUBLISHABLE_KEY=pk_... CLERK_SECRET_KEY=sk_...   # enable Clerk sign-in
//   ORION_ADMIN_KEY=...              # unlock /admin dashboard + /api/admin/*
//   CLIP_INBOX_SECRET=...            # Grok fetch URL /clip-inbox/<secret>/
//   CLIP_INBOX_GOOGLE_SUB=...        # Lucas-only upload + future-day rehearsal
//   CLIP_INBOX_CALLSIGN=...          # optional callsign allowlist fallback
//   CLIP_INBOX_DIR=...               # override disk path (default /data/clip-inbox)
//   NOTION_TOKEN=...                 # optional: Grok cuts + (later) feedback -> Notion
//   NOTION_CLIPS_DATABASE_ID=...     # optional override; default is Praetor Lab Clips
//
// Environment can also come from server/.env (KEY=value lines, not committed).

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./env.mjs"; // loads server/.env before other modules read process.env
import * as store from "./db.mjs";
import { validateRun, MODES, GAME_MODES } from "./validate.mjs";
import { isNicknameBlocked, pickRejectionMessage, sanitizeCallsignForDisplay } from "./nickname.mjs";
import { qualifyingBadges } from "./badges.mjs";
import { isValidUtcDateStr } from "./dateUtils.mjs";
import {
  dailyLeaderboardCombinedWithBots,
  dailyRankCombinedWithBots,
  nextAboveCombinedDailyWithBots,
} from "./dailyBoard.mjs";
import { clerkEnabled, clerkPublishableKey, verifyClerkToken, clerkUserProfile } from "./clerk.mjs";
import { patrolDateStr } from "./patrolDate.mjs";
import { isStaticMethod, serveStatic } from "./serve-static.mjs";
import { clipInboxAllowed, handleClipInboxPublic, handleClipInboxUpload, handleClipCutsPublic } from "./clip-inbox.mjs";

const PORT = Number(process.env.PORT ?? 8787);
// The Google OAuth client id is public by design (it ships to every browser),
// so the production one doubles as the default — override via env if needed.
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ??
  "846475365993-b9nmm32pqp6pinlkm9sm3cspthvsuceq.apps.googleusercontent.com";
const SERVE_DIST = process.env.ORION_SERVE_DIST === "1";
// Set ORION_ADMIN_KEY to unlock /admin + /api/admin/* (analytics, feedback).
const ADMIN_KEY = process.env.ORION_ADMIN_KEY ?? "";
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const CALLSIGN_RE = /^[A-Za-z0-9_\- ]{3,20}$/;
const COUNTRY_RE = /^([A-Z]{2})?$/;
/** Daily Patrol attempts per Pacific day — keep in sync with DAILY_MAX_ATTEMPTS in src/save.ts. */
const DAILY_MAX_ATTEMPTS = 3;

// --- tiny helpers ---

const json = (res, status, body) => {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 64 * 1024) reject(new Error("body too large"));
      else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {});
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });

const authUser = (req) => {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  return m ? store.getSessionUser(m[1]) : null;
};

/**
 * Real client IP, spoof-resistant. Cloudflare (which fronts Render) always
 * overwrites cf-connecting-ip at its edge — unlike X-Forwarded-For (or
 * true-client-ip on non-Enterprise zones), a client can't forge it. Failing
 * that, take the RIGHTMOST X-Forwarded-For hop (appended by the proxy in
 * front of us; earlier entries are client-controlled), then the raw socket.
 */
function clientIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  if (cf) return String(cf).trim();
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const hops = String(xff).split(",");
    return hops[hops.length - 1].trim();
  }
  return req.socket.remoteAddress ?? "?";
}

const cleanPlatform = (p) => (["touch", "desktop"].includes(p) ? p : "");

/** Today's patrol date, 'YYYY-MM-DD' (America/Los_Angeles) — the Daily Patrol board key. */
const patrolToday = () => patrolDateStr();

/**
 * Board mode from a submitted run. Boards are per platform: desktop keyboard,
 * phone touch stick, phone tilt. Older clients tagged runs by flight physics
 * ('classic' = inertia, 'tilt' = direct control) — coerce those to the
 * platform they were played on until every cached bundle rolls over.
 */
function boardMode(body) {
  const mode = body.mode ?? "desktop";
  if (MODES.includes(mode)) return mode;
  return cleanPlatform(body.platform) === "touch" ? "touch" : "desktop";
}

/** Game mode from a submitted run; older clients send none → Classic. */
const bodyGameMode = (body) =>
  GAME_MODES.includes(body.gameMode) ? body.gameMode : "classic";

/** Game mode from a leaderboard query (?gameMode=); null = invalid. */
function queryGameMode(url) {
  const gm = url.searchParams.get("gameMode") ?? "classic";
  return GAME_MODES.includes(gm) ? gm : null;
}

/**
 * Admin key check: Bearer header only (a ?key= param would leak the secret
 * into access logs and browser history). 404s when no key is set.
 */
const isAdmin = (req) => {
  if (!ADMIN_KEY) return false;
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  const given = m?.[1] ?? "";
  return given.length === ADMIN_KEY.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(ADMIN_KEY));
};

// --- rate limiting (in-memory, per key) ---

const buckets = new Map();
function rateLimit(key, maxPerMinute) {
  const now = Date.now();
  const bucket = buckets.get(key)?.filter((t) => now - t < 60_000) ?? [];
  if (bucket.length >= maxPerMinute) return false;
  bucket.push(now);
  buckets.set(key, bucket);
  return true;
}

// --- auth primitives ---

// scrypt work scales with input size — cap passwords so a huge one can't
// stall the event loop. Anything longer than this is rejected up front.
const MAX_PASSWORD_LENGTH = 200;

const hashPassword = (password, salt) =>
  crypto.scryptSync(password, salt, 32).toString("hex");

/**
 * Guest device secrets: a 256-bit random value handed out once at guest
 * creation and stored hashed (plain SHA-256 is fine — the secret is random,
 * not a human password, so there's nothing to brute-force).
 */
const newGuestSecret = () => crypto.randomBytes(32).toString("hex");
const hashGuestSecret = (secret) =>
  crypto.createHash("sha256").update(secret).digest("hex");
const guestSecretMatches = (secret, storedHash) => {
  if (typeof secret !== "string" || !storedHash) return false;
  const given = Buffer.from(hashGuestSecret(secret));
  const stored = Buffer.from(storedHash);
  return given.length === stored.length && crypto.timingSafeEqual(given, stored);
};

function issueSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  store.createSession(userId, token);
  return token;
}

const publicUser = (u) => ({ callsign: u.callsign, country: u.country });

/**
 * Public-facing display filter: applied at every response boundary that
 * shows OTHER players' callsigns (leaderboards, profiles, friends,
 * gap-to-goal). isNicknameBlocked already stops a new/renamed callsign from
 * reaching the DB, but this catches legacy rows that predate the filter (or
 * a future BLOCKED_TERMS addition) — no rename, no DB write, just a masked
 * label for anyone other than the account owner. Deliberately NOT applied to
 * publicUser(): the account owner needs to see their own real callsign.
 */
const sanitizeEntry = (e) => (e ? { ...e, callsign: sanitizeCallsignForDisplay(e.callsign) } : e);
/** Drop server-only merge metadata before any leaderboard row reaches a client.
 * `virtual` stays on Daily Patrol ghost rows so the lobby can skip a profile
 * click (those callsigns are not accounts). userId never leaves the server. */
const publicBoardEntry = (e) => {
  const { virtual, userId: _u, ...rest } = e;
  const out = sanitizeEntry(rest);
  if (virtual) out.virtual = true;
  return out;
};
const sanitizeEntries = (list) => list.map(publicBoardEntry);

/** Admin-only: today's (or a picked day's) public board, split real vs filler. */
function adminDayBoard(dailyDate) {
  const entries = sanitizeEntries(
    dailyLeaderboardCombinedWithBots({ dailyDate, limit: 100 }),
  );
  const realPilots = entries.filter((e) => !e.virtual).length;
  return {
    realPilots,
    fillerBots: entries.length - realPilots,
    entries,
  };
}

/** Shift a YYYY-MM-DD calendar date by N days (UTC date math; PT labels are already dates). */
function shiftYmd(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Slim previous-day snapshot so the dashboard can show % vs the prior PT day. */
function adminPreviousDay(dateStr) {
  const prev = store.adminStatsForDay(shiftYmd(dateStr, -1));
  if (!prev) return null;
  const board = adminDayBoard(prev.date);
  return {
    date: prev.date,
    traffic: { uniques: prev.traffic.uniques, visits: prev.traffic.visits },
    users: { new: prev.users.new },
    runs: {
      total: prev.runs.total,
      signedInPlayers: prev.runs.signedInPlayers,
      anonymous: prev.runs.anonymous,
    },
    board: { realPilots: board.realPilots, fillerBots: board.fillerBots },
    gameLength: { avg: prev.gameLength.avg, median: prev.gameLength.median, max: prev.gameLength.max },
    score: { avg: prev.score.avg, median: prev.score.median, max: prev.score.max },
    combat: { avgKills: prev.combat.avgKills, bestMultiplier: prev.combat.bestMultiplier },
  };
}

/**
 * Auto-naming for Google/Clerk signups: the display name comes from a
 * third-party profile, not typed by hand, so there's no error slot to bounce
 * it back to. A blocked name (their real profile name tripped the filter,
 * rare, but a Google display name is fully player-controlled) just falls
 * back to the generic "Pilot" base instead of landing on the boards as-is;
 * the pilot can pick a real callsign afterward from their profile.
 */
function uniqueCallsign(base) {
  let name = base.replace(/[^A-Za-z0-9_\- ]/g, "").slice(0, 16).trim() || "Pilot";
  if (name.length < 3) name = `Pilot ${name}`.trim();
  if (isNicknameBlocked(name)) name = "Pilot";
  if (!store.getUserByCallsign(name)) return name;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${name} ${i}`.slice(0, 20);
    if (!store.getUserByCallsign(candidate)) return candidate;
  }
  return `Pilot ${crypto.randomInt(1e6)}`;
}

async function verifyGoogleToken(idToken) {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );
  if (!res.ok) return null;
  const info = await res.json();
  if (info.aud !== GOOGLE_CLIENT_ID) return null;
  return info; // { sub, email, name, ... }
}

const arenaCode = () => {
  // unambiguous alphabet (no 0/O, 1/I)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(6), (b) => chars[b % chars.length]).join("");
};

// --- routes ---

const routes = {
  "GET /api/config": (req, res) => {
    json(res, 200, { googleClientId: GOOGLE_CLIENT_ID, clerkPublishableKey: clerkPublishableKey() });
  },

  "POST /api/auth/register": async (req, res) => {
    if (!rateLimit(`reg:${clientIp(req)}`, 10)) return json(res, 429, { error: "slow down" });
    const { callsign, password, country = "" } = await readBody(req);
    if (typeof callsign !== "string" || !CALLSIGN_RE.test(callsign.trim()))
      return json(res, 400, { error: "callsign must be 3-20 letters, digits, - or _" });
    if (isNicknameBlocked(callsign.trim())) return json(res, 400, { error: pickRejectionMessage() });
    if (typeof password !== "string" || password.length < 6 || password.length > MAX_PASSWORD_LENGTH)
      return json(res, 400, { error: "password must be 6-200 characters" });
    if (typeof country !== "string" || !COUNTRY_RE.test(country))
      return json(res, 400, { error: "invalid country" });
    if (store.getUserByCallsign(callsign.trim()))
      return json(res, 409, { error: "callsign already taken" });

    const salt = crypto.randomBytes(16).toString("hex");
    const user = store.createUser({
      callsign: callsign.trim(),
      passSalt: salt,
      passHash: hashPassword(password, salt),
      country,
    });
    json(res, 200, { token: issueSession(user.id), user: publicUser(user) });
  },

  // Quick save from the game-over screen: a name is enough to get on the
  // boards. Creates a real (passwordless) account — the device stays signed
  // in, and a password can be added later from the profile screen.
  // Guest accounts are DEVICE-LOCKED: creation hands the client a random
  // secret (kept in localStorage), and reclaiming an existing guest callsign
  // requires that secret — a stranger typing the same name gets a 409, not
  // that pilot's session. Guests created before the lock (no stored hash)
  // are grandfathered: the next successful reclaim binds a secret to them
  // (first device wins). Names protected by a password, Google, or Clerk
  // stay locked to their owner as before.
  "POST /api/auth/guest": async (req, res) => {
    if (!rateLimit(`guest:${clientIp(req)}`, 10)) return json(res, 429, { error: "slow down" });
    const { callsign, country = "", guestSecret } = await readBody(req);
    if (typeof callsign !== "string" || !CALLSIGN_RE.test(callsign.trim()))
      return json(res, 400, { error: "callsign must be 3-20 letters, digits, - or _" });
    if (typeof country !== "string" || !COUNTRY_RE.test(country))
      return json(res, 400, { error: "invalid country" });

    const existing = store.getUserByCallsign(callsign.trim());
    if (existing) {
      // Reclaiming an already-existing account, not creating or renaming
      // one — the nickname filter deliberately does NOT run on this branch.
      // A legacy account predating the filter (or a future blocklist
      // addition) must stay reachable by its own device secret; that
      // callsign is already masked from everyone else via
      // sanitizeCallsignForDisplay at every public read boundary.
      if (existing.pass_hash || existing.google_sub || existing.clerk_sub)
        return json(res, 409, { error: "that callsign belongs to a registered pilot" });
      if (existing.guest_secret_hash) {
        if (!guestSecretMatches(guestSecret, existing.guest_secret_hash))
          return json(res, 409, { error: "that callsign is taken, pick another name" });
        return json(res, 200, {
          token: issueSession(existing.id),
          user: publicUser(existing),
          existing: true,
        });
      }
      // pre-lock guest: bind a device secret now (first device to come back wins)
      const secret = newGuestSecret();
      store.setGuestSecretHash(existing.id, hashGuestSecret(secret));
      return json(res, 200, {
        token: issueSession(existing.id),
        user: publicUser(existing),
        existing: true,
        guestSecret: secret,
      });
    }

    // New account: this IS a callsign creation, so the filter applies here.
    if (isNicknameBlocked(callsign.trim())) return json(res, 400, { error: pickRejectionMessage() });
    const secret = newGuestSecret();
    const user = store.createUser({
      callsign: callsign.trim(),
      country,
      guestSecretHash: hashGuestSecret(secret),
    });
    json(res, 200, {
      token: issueSession(user.id),
      user: publicUser(user),
      existing: false,
      guestSecret: secret,
    });
  },

  "POST /api/auth/login": async (req, res) => {
    if (!rateLimit(`login:${clientIp(req)}`, 15)) return json(res, 429, { error: "slow down" });
    const { callsign, password } = await readBody(req);
    const user = typeof callsign === "string" ? store.getUserByCallsign(callsign.trim()) : null;
    if (!user?.pass_hash || typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH)
      return json(res, 401, { error: "unknown callsign or wrong password" });
    const hash = hashPassword(password, user.pass_salt);
    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.pass_hash)))
      return json(res, 401, { error: "unknown callsign or wrong password" });
    json(res, 200, { token: issueSession(user.id), user: publicUser(user) });
  },

  "POST /api/auth/google": async (req, res) => {
    if (!GOOGLE_CLIENT_ID) return json(res, 400, { error: "google sign-in not configured" });
    if (!rateLimit(`google:${clientIp(req)}`, 15)) return json(res, 429, { error: "slow down" });
    const { idToken, country = "" } = await readBody(req);
    if (typeof idToken !== "string") return json(res, 400, { error: "missing idToken" });
    const info = await verifyGoogleToken(idToken);
    if (!info?.sub) return json(res, 401, { error: "google token rejected" });

    let user = store.getUserByGoogleSub(info.sub);
    let isNew = false;
    if (!user) {
      isNew = true;
      const base = info.name || info.email?.split("@")[0] || "Pilot";
      user = store.createUser({
        callsign: uniqueCallsign(base),
        googleSub: info.sub,
        country: COUNTRY_RE.test(country) ? country : "",
      });
    }
    json(res, 200, { token: issueSession(user.id), user: publicUser(user), isNew });
  },

  "POST /api/auth/clerk": async (req, res) => {
    if (!clerkEnabled()) return json(res, 400, { error: "clerk sign-in not configured" });
    if (!rateLimit(`clerk:${clientIp(req)}`, 15)) return json(res, 429, { error: "slow down" });
    const { sessionToken, country = "" } = await readBody(req);
    if (typeof sessionToken !== "string") return json(res, 400, { error: "missing sessionToken" });
    const payload = await verifyClerkToken(sessionToken);
    if (!payload?.sub) return json(res, 401, { error: "clerk token rejected" });

    let user = store.getUserByClerkSub(payload.sub);
    let isNew = false;
    if (!user) {
      isNew = true;
      const profile = await clerkUserProfile(payload.sub);
      user = store.createUser({
        callsign: uniqueCallsign(profile?.name || "Pilot"),
        clerkSub: payload.sub,
        country: COUNTRY_RE.test(country) ? country : "",
      });
    }
    json(res, 200, { token: issueSession(user.id), user: publicUser(user), isNew });
  },

  "POST /api/auth/logout": async (req, res) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
    if (m) store.deleteSession(m[1]);
    json(res, 200, { ok: true });
  },

  "GET /api/me": (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    json(res, 200, {
      user: publicUser(user),
      best: store.getUserBest(user.id),
      pendingFriends: store.pendingFriendCount(user.id),
      // guest accounts have no password yet — the profile screen offers to set one
      hasPassword: !!user.pass_hash,
      // patrol history calendar: bounds how far back "missed" can honestly
      // apply for this account (see src/dailyHistory.ts).
      joinedAt: user.created_at,
      clipInbox: clipInboxAllowed(user),
    });
  },

  "PATCH /api/me": async (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    const { callsign, country, password } = await readBody(req);
    const patch = {};
    if (callsign !== undefined) {
      if (typeof callsign !== "string" || !CALLSIGN_RE.test(callsign.trim()))
        return json(res, 400, { error: "invalid callsign" });
      if (isNicknameBlocked(callsign.trim())) return json(res, 400, { error: pickRejectionMessage() });
      const existing = store.getUserByCallsign(callsign.trim());
      if (existing && existing.id !== user.id) return json(res, 409, { error: "callsign already taken" });
      patch.callsign = callsign.trim();
    }
    if (country !== undefined) {
      if (typeof country !== "string" || !COUNTRY_RE.test(country))
        return json(res, 400, { error: "invalid country" });
      patch.country = country;
    }
    // Guest-account upgrade: set a password once so the pilot can sign in
    // elsewhere. Accounts that already have one keep it (no change flow yet).
    if (password !== undefined) {
      if (user.pass_hash) return json(res, 400, { error: "password already set" });
      if (typeof password !== "string" || password.length < 6 || password.length > MAX_PASSWORD_LENGTH)
        return json(res, 400, { error: "password must be 6-200 characters" });
      patch.passSalt = crypto.randomBytes(16).toString("hex");
      patch.passHash = hashPassword(password, patch.passSalt);
    }
    json(res, 200, { user: publicUser(store.updateUser(user.id, patch)) });
  },

  "POST /api/scores": async (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    if (!rateLimit(`score:${user.id}`, 6)) return json(res, 429, { error: "too many submissions" });
    const body = await readBody(req);
    // Daily Patrol is always Classic — the server enforces it.
    const gameMode = body.daily === true ? "classic" : bodyGameMode(body);
    const run = {
      score: body.score,
      timeSurvived: body.timeSurvived,
      kills: body.kills,
      maxMultiplier: body.maxMultiplier,
      mode: boardMode(body),
      gameMode,
    };
    const err = validateRun(run);
    if (err) return json(res, 422, { error: err });

    // Daily Patrol: the server stamps the date itself (clients can't file
    // scores onto past/future boards). Daily runs count all-time too.
    const dailyDate = body.daily === true ? patrolToday() : null;
    // The 3-attempts-per-day budget is enforced HERE, not just in the client's
    // localStorage — a forged client can't flood the daily board. (Refunded
    // <15s deaths never submit as daily, so legit players can't hit this.)
    if (dailyDate && store.countDailyScores(user.id, dailyDate) >= DAILY_MAX_ATTEMPTS)
      return json(res, 429, { error: "daily attempt limit reached, next patrol at midnight Pacific" });

    store.insertScore(user.id, { ...run, dailyDate });
    store.insertRun(user.id, { ...run, platform: cleanPlatform(body.platform) });

    const worldRank = store.rankOf(user.id, { mode: run.mode, gameMode });
    // badge sweep: qualifying badges the pilot doesn't have yet
    const career = store.userCareer(user.id);
    const newBadges = qualifyingBadges(run, career, worldRank).filter((id) =>
      store.awardBadge(user.id, id),
    );

    // Daily Patrol's rank and gap-to-goal target are the COMBINED daily
    // board (every device merged, same ranking TODAY'S BOARD and the lobby
    // hint use), not the per-device daily rank, and not the world all-time
    // board. Fixes a 2026-08-18 bug where a desktop pilot's game-over screen
    // chased their own device's daily-leader/world-leader, a different (and
    // lower) score than the actual combined-board leader. Classic and Iron
    // Rain (dailyDate is null for both) are untouched: they keep the world
    // all-time board below, per-device as before.
    json(res, 200, {
      best: store.getUserBest(user.id, run.mode, gameMode),
      worldRank,
      countryRank: user.country
        ? store.rankOf(user.id, { country: user.country, mode: run.mode, gameMode })
        : null,
      dailyRank: dailyDate
        ? (dailyRankCombinedWithBots(user.id, dailyDate)?.rank ?? null)
        : null,
      nextAbove: sanitizeEntry(
        dailyDate
          ? nextAboveCombinedDailyWithBots(user.id, dailyDate)
          : store.nextAbove(user.id, run.mode, gameMode),
      ),
      nextWingmate: sanitizeEntry(
        dailyDate
          ? store.nextWingmateAboveCombinedDaily(user.id, dailyDate)
          : store.nextWingmateAbove(user.id, run.mode, gameMode),
      ),
      newBadges,
    });
  },

  // Anonymous visit beacon (one per browser session, fired at boot): powers
  // the Traffic section on /admin. First-party and cookie-less — the IP is
  // stored only as a truncated hash for unique-visitor counting. Country
  // comes from Cloudflare's cf-ipcountry edge header when present, falling
  // back to the client's locale/timezone guess.
  "POST /api/visit": async (req, res) => {
    const ip = clientIp(req);
    if (!rateLimit(`visit:${ip}`, 30)) return json(res, 429, { error: "slow down" });
    const body = await readBody(req);
    const headerCountry = String(req.headers["cf-ipcountry"] ?? "").toUpperCase();
    const clientCountry =
      typeof body.country === "string" && /^[A-Z]{2}$/.test(body.country) ? body.country : "";
    let ref = "";
    try {
      if (typeof body.ref === "string" && body.ref) ref = new URL(body.ref).hostname.slice(0, 100);
    } catch {
      // unparsable referrer — drop it
    }
    store.addVisit({
      ipHash: crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16),
      country: /^[A-Z]{2}$/.test(headerCountry) ? headerCountry : clientCountry,
      ref,
      path: body.path === "fullgame" ? "fullgame" : "daily",
      platform: cleanPlatform(body.platform),
    });
    json(res, 200, { ok: true });
  },

  // Anonymous run telemetry (signed-in runs are logged via POST /api/scores).
  // Analytics only — never touches the leaderboards.
  "POST /api/runs": async (req, res) => {
    if (!rateLimit(`runs:${clientIp(req)}`, 10)) return json(res, 429, { error: "slow down" });
    const body = await readBody(req);
    const run = {
      score: body.score,
      timeSurvived: body.timeSurvived,
      kills: body.kills,
      maxMultiplier: body.maxMultiplier,
      mode: boardMode(body),
      gameMode: bodyGameMode(body),
    };
    const err = validateRun(run);
    if (err) return json(res, 422, { error: err });
    store.insertRun(null, { ...run, platform: cleanPlatform(body.platform) });
    json(res, 200, { ok: true });
  },

  "GET /api/leaderboard/world": (req, res, user, url) => {
    const country = url.searchParams.get("country")?.toUpperCase() || null;
    if (country && !/^[A-Z]{2}$/.test(country)) return json(res, 400, { error: "invalid country" });
    const mode = url.searchParams.get("mode") ?? "desktop";
    if (!MODES.includes(mode)) return json(res, 400, { error: "invalid mode" });
    const gameMode = queryGameMode(url);
    if (!gameMode) return json(res, 400, { error: "invalid game mode" });
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    const entries = sanitizeEntries(store.leaderboard({ country, mode, gameMode, limit }));
    const me =
      user && store.getUserBest(user.id, mode, gameMode)
        ? {
            rank: store.rankOf(user.id, { country, mode, gameMode }),
            best: store.getUserBest(user.id, mode, gameMode),
            inScope: !country || user.country === country,
          }
        : null;
    json(res, 200, { entries, me: me?.inScope ? me : null });
  },

  // Daily Patrol: best daily-run score per pilot for today's patrol date.
  // The board resets naturally when the date rolls over. mode=all merges
  // every device into one ranking (the daily-only lobby's inline board);
  // per-device mode still powers the /fullgame Leaderboard screen's tabs.
  "GET /api/leaderboard/daily": (req, res, user, url) => {
    const mode = url.searchParams.get("mode") ?? "desktop";
    const dailyDate = patrolToday();
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    if (mode === "all") {
      const entries = sanitizeEntries(dailyLeaderboardCombinedWithBots({ dailyDate, limit }));
      const me = user ? dailyRankCombinedWithBots(user.id, dailyDate) : null;
      return json(res, 200, { date: dailyDate, entries, me });
    }
    if (!MODES.includes(mode)) return json(res, 400, { error: "invalid mode" });
    const entries = sanitizeEntries(store.leaderboard({ mode, dailyDate, limit }));
    const myBest = user ? store.getUserDailyBest(user.id, mode, dailyDate) : 0;
    const me = myBest
      ? { rank: store.rankOf(user.id, { mode, dailyDate }), best: myBest }
      : null;
    json(res, 200, { date: dailyDate, entries, me });
  },

  // Patrol history calendar: one pilot's own completed-run record over a
  // bounded date range (a month at a time from the client). Signed-in only,
  // since a signed-out pilot's history lives entirely on their device (see
  // src/dailyHistory.ts for why the server can't help there anyway).
  "GET /api/me/daily-history": (req, res, user, url) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!isValidUtcDateStr(from) || !isValidUtcDateStr(to) || from > to)
      return json(res, 400, { error: "invalid date range" });
    // cap the span so a forged query can't force a full-table scan. Both
    // strings are already confirmed valid calendar dates above, so
    // Date.parse() here can't return NaN.
    const spanDays = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (spanDays > 62) return json(res, 400, { error: "range too wide (max 62 days)" });
    // the client can't know the future, so clamp instead of rejecting it:
    // the current month's range naturally runs past today
    const clampedTo = to > patrolToday() ? patrolToday() : to;
    json(res, 200, { entries: store.dailyHistoryForUser(user.id, { from, to: clampedTo }) });
  },

  "POST /api/arenas": async (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    if (!rateLimit(`arena:${user.id}`, 5)) return json(res, 429, { error: "slow down" });
    const { name } = await readBody(req);
    if (typeof name !== "string" || name.trim().length < 3 || name.trim().length > 30)
      return json(res, 400, { error: "arena name must be 3-30 characters" });
    let code = arenaCode();
    while (store.getArenaByCode(code)) code = arenaCode();
    const arena = store.createArena(user.id, name.trim(), code);
    json(res, 200, { arena: { code: arena.code, name: arena.name } });
  },

  "POST /api/arenas/join": async (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    const { code } = await readBody(req);
    if (typeof code !== "string") return json(res, 400, { error: "missing code" });
    const arena = store.getArenaByCode(code.trim());
    if (!arena) return json(res, 404, { error: "no arena with that code" });
    store.joinArena(arena.id, user.id);
    json(res, 200, { arena: { code: arena.code, name: arena.name } });
  },

  "GET /api/arenas": (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    json(res, 200, { arenas: store.userArenas(user.id) });
  },

  // --- friends ---

  "GET /api/friends": (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    const { incoming, outgoing } = store.friendRequests(user.id);
    json(res, 200, {
      friends: sanitizeEntries(store.friendsOf(user.id)),
      incoming: sanitizeEntries(incoming),
      outgoing: sanitizeEntries(outgoing),
    });
  },

  "POST /api/friends/request": async (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    if (!rateLimit(`friendreq:${user.id}`, 10)) return json(res, 429, { error: "slow down" });
    const { callsign } = await readBody(req);
    if (typeof callsign !== "string") return json(res, 400, { error: "missing callsign" });
    const target = store.getUserByCallsign(callsign.trim());
    if (!target) return json(res, 404, { error: "no pilot with that callsign" });
    if (target.id === user.id) return json(res, 400, { error: "that's you, pilot" });

    const existing = store.getFriendship(user.id, target.id);
    if (existing?.status === "accepted") return json(res, 409, { error: "already wingmates" });
    if (existing?.requester_id === user.id) return json(res, 409, { error: "request already sent" });
    if (existing) {
      // they already asked us — treat the request as an accept
      store.acceptFriend(user.id, target.id);
      return json(res, 200, { status: "accepted" });
    }
    store.requestFriend(user.id, target.id);
    json(res, 200, { status: "pending" });
  },

  "POST /api/friends/accept": async (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    const { callsign } = await readBody(req);
    const target = typeof callsign === "string" ? store.getUserByCallsign(callsign.trim()) : null;
    if (!target || !store.acceptFriend(user.id, target.id))
      return json(res, 404, { error: "no pending request from that pilot" });
    json(res, 200, { ok: true });
  },

  // Decline an incoming request, cancel an outgoing one, or unfriend.
  "POST /api/friends/remove": async (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    const { callsign } = await readBody(req);
    const target = typeof callsign === "string" ? store.getUserByCallsign(callsign.trim()) : null;
    if (!target) return json(res, 404, { error: "pilot not found" });
    store.removeFriend(user.id, target.id);
    json(res, 200, { ok: true });
  },

  "GET /api/friends/leaderboard": (req, res, user, url) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    const mode = url.searchParams.get("mode") ?? "desktop";
    if (!MODES.includes(mode)) return json(res, 400, { error: "invalid mode" });
    const gameMode = queryGameMode(url);
    if (!gameMode) return json(res, 400, { error: "invalid game mode" });
    json(res, 200, { entries: sanitizeEntries(store.friendsLeaderboard(user.id, mode, gameMode)), me: null });
  },

  "GET /api/friends/activity": (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    json(res, 200, { activity: sanitizeEntries(store.friendActivity(user.id, 20)) });
  },

  "POST /api/clip-inbox": async (req, res, user) => {
    // Operator backfill: same Bearer as /admin, not a player session.
    if (isAdmin(req)) {
      if (!rateLimit("clip-inbox:admin", 8)) {
        return json(res, 429, { error: "too many uploads, try again in a minute" });
      }
      const callsign = process.env.CLIP_INBOX_CALLSIGN || "luciux";
      return handleClipInboxUpload(req, res, { callsign });
    }
    if (!user) return json(res, 401, { error: "not signed in" });
    if (!rateLimit(`clip-inbox:${user.id}`, 8)) {
      return json(res, 429, { error: "too many uploads, try again in a minute" });
    }
    return handleClipInboxUpload(req, res, user);
  },

  // Player feedback (works signed-in or anonymous; email is optional so we
  // can reach back out with follow-ups / rewards).
  "POST /api/feedback": async (req, res, user) => {
    if (!rateLimit(`feedback:${clientIp(req)}`, 4)) {
      return json(res, 429, { error: "too much feedback at once, try again in a minute" });
    }
    const body = await readBody(req);
    const message = String(body.message ?? "").trim();
    if (message.length < 3) return json(res, 400, { error: "tell us a little more" });
    if (message.length > 2000) return json(res, 400, { error: "message too long (2000 chars max)" });
    const email = String(body.email ?? "").trim();
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) {
      return json(res, 400, { error: "that email doesn't look right" });
    }
    const context = String(body.context ?? "").slice(0, 500);
    store.addFeedback({
      userId: user?.id ?? null,
      callsign: user?.callsign ?? null,
      email: email || null,
      message,
      context,
    });
    // signed-in reporters earn the DEBRIEFED badge
    const newBadges = user && store.awardBadge(user.id, "debriefed") ? ["debriefed"] : [];
    json(res, 200, { ok: true, newBadges });
  },

  // --- admin (requires ORION_ADMIN_KEY) ---

  "GET /api/admin/stats": (req, res, user, url) => {
    if (!isAdmin(req)) return json(res, 404, { error: "not found" });
    const dateParam = url.searchParams.get("date");
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return json(res, 400, { error: "invalid date" });
    }
    // `day` is the date-selector slice (defaults to today, PT); everything
    // else here is the existing all-time / rolling dashboard, unchanged.
    const day = store.adminStatsForDay(dateParam || undefined);
    if (dateParam && !day) return json(res, 400, { error: "invalid date" });
    if (day) {
      day.board = adminDayBoard(day.date);
      day.previous = adminPreviousDay(day.date);
    }
    json(res, 200, { ...store.adminStats(), day });
  },

  "GET /api/admin/feedback": (req, res) => {
    if (!isAdmin(req)) return json(res, 404, { error: "not found" });
    json(res, 200, { feedback: store.listFeedback(200) });
  },

  "GET /admin": (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/html",
      // the dashboard is a single inline-script page that only talks to /api
      "Content-Security-Policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
        "connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; " +
        "frame-ancestors 'none'",
    });
    res.end(ADMIN_PAGE);
  },
};

// GET /api/players/:callsign — public pilot profile (stats + badges).
// When the viewer is signed in, includes their friendship with this pilot.
function playerProfile(req, res, user, callsign) {
  const target = store.getUserByCallsign(callsign);
  if (!target) return json(res, 404, { error: "pilot not found" });
  const career = store.userCareer(target.id);

  let friendship = null;
  if (user && user.id !== target.id) {
    const f = store.getFriendship(user.id, target.id);
    friendship = !f
      ? "none"
      : f.status === "accepted"
        ? "friends"
        : f.requester_id === user.id
          ? "outgoing"
          : "incoming";
  }

  // Classic keeps the legacy best/rank shape; Iron Rain rides alongside and
  // is only included once the pilot has actually flown it.
  const ironBest = {
    desktop: store.getUserBest(target.id, "desktop", "ironrain"),
    touch: store.getUserBest(target.id, "touch", "ironrain"),
    tilt: store.getUserBest(target.id, "tilt", "ironrain"),
  };
  const hasIronRain = ironBest.desktop > 0 || ironBest.touch > 0 || ironBest.tilt > 0;

  json(res, 200, {
    callsign: sanitizeCallsignForDisplay(target.callsign),
    country: target.country,
    joinedAt: target.created_at,
    best: {
      desktop: store.getUserBest(target.id, "desktop"),
      touch: store.getUserBest(target.id, "touch"),
      tilt: store.getUserBest(target.id, "tilt"),
    },
    rank: {
      desktop: store.rankOf(target.id, { mode: "desktop" }),
      touch: store.rankOf(target.id, { mode: "touch" }),
      tilt: store.rankOf(target.id, { mode: "tilt" }),
    },
    ironRain: hasIronRain
      ? {
          best: ironBest,
          rank: {
            desktop: store.rankOf(target.id, { mode: "desktop", gameMode: "ironrain" }),
            touch: store.rankOf(target.id, { mode: "touch", gameMode: "ironrain" }),
            tilt: store.rankOf(target.id, { mode: "tilt", gameMode: "ironrain" }),
          },
        }
      : null,
    runs: career.runs,
    totalKills: career.totalKills,
    totalTime: career.totalTime,
    bestTime: career.bestTime,
    // single-run career bests (locked-badge progress display)
    bestKills: career.bestKills,
    bestScore: career.bestScore,
    bestMultiplier: career.bestMultiplier,
    history: store.scoreHistory(target.id, 40),
    badges: store.userBadges(target.id),
    friendship,
  });
}

// GET /api/arenas/:code/leaderboard (dynamic segment, handled separately)
function arenaLeaderboard(req, res, user, code, url) {
  if (!user) return json(res, 401, { error: "not signed in" });
  const arena = store.getArenaByCode(code);
  if (!arena) return json(res, 404, { error: "arena not found" });
  if (!store.isArenaMember(arena.id, user.id)) return json(res, 403, { error: "not a member" });
  const mode = url.searchParams.get("mode") ?? "desktop";
  if (!MODES.includes(mode)) return json(res, 400, { error: "invalid mode" });
  const gameMode = queryGameMode(url);
  if (!gameMode) return json(res, 400, { error: "invalid game mode" });
  const entries = sanitizeEntries(store.leaderboard({ arenaId: arena.id, mode, gameMode, limit: 100 }));
  const me = store.getUserBest(user.id, mode, gameMode)
    ? {
        rank: store.rankOf(user.id, { arenaId: arena.id, mode, gameMode }),
        best: store.getUserBest(user.id, mode, gameMode),
      }
    : null;
  json(res, 200, { arena: { code: arena.code, name: arena.name }, entries, me });
}

// --- admin dashboard (self-contained HTML; data via /api/admin/*) ---

const ADMIN_PAGE = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "admin.html"),
  "utf8",
);

// --- server ---

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  // baseline security headers on every response
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  try {
    const arenaLb = /^\/api\/arenas\/([A-Za-z0-9]+)\/leaderboard$/.exec(url.pathname);
    if (req.method === "GET" && arenaLb) {
      return arenaLeaderboard(req, res, authUser(req), arenaLb[1], url);
    }
    const player = /^\/api\/players\/([^/]+)$/.exec(url.pathname);
    if (req.method === "GET" && player) {
      return playerProfile(req, res, authUser(req), decodeURIComponent(player[1]));
    }
    const handler = routes[`${req.method} ${url.pathname}`];
    if (handler) return await handler(req, res, authUser(req), url);
    if (await handleClipInboxPublic(req, res, url)) return;
    if (await handleClipCutsPublic(req, res, url)) return;
    if (!url.pathname.startsWith("/api/") && SERVE_DIST && isStaticMethod(req.method)) {
      return serveStatic(req, res, url.pathname, DIST);
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 400, { error: e?.message ?? "bad request" });
  }
});

// Expired sessions are invisible to reads but still take up rows — sweep
// them on boot and once a day so the table doesn't grow forever.
store.purgeExpiredSessions();
setInterval(() => store.purgeExpiredSessions(), 24 * 3600 * 1000).unref();

server.listen(PORT, () => {
  console.log(`Orion server on http://localhost:${PORT}`);
  console.log(`  clerk sign-in:  ${clerkEnabled() ? "enabled" : "disabled (set CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY)"}`);
  console.log(`  google sign-in: ${GOOGLE_CLIENT_ID ? "enabled" : "disabled (set GOOGLE_CLIENT_ID)"}`);
  console.log(`  static dist:    ${SERVE_DIST ? "serving" : "off (set ORION_SERVE_DIST=1)"}`);
});
