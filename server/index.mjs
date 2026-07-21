// Orion community server: accounts, world/arena leaderboards, score submission.
// Zero dependencies — node:http + node:sqlite + node:crypto (Node 22.5+).
//
//   node server/index.mjs            # API on :8787
//   ORION_SERVE_DIST=1 node ...      # also serve the production build (dist/)
//   GOOGLE_CLIENT_ID=... node ...    # enable "Sign in with Google"
//   CLERK_PUBLISHABLE_KEY=pk_... CLERK_SECRET_KEY=sk_...   # enable Clerk sign-in
//   ORION_ADMIN_KEY=...              # unlock /admin dashboard + /api/admin/*
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
import { qualifyingBadges } from "./badges.mjs";
import { clerkEnabled, clerkPublishableKey, verifyClerkToken, clerkUserProfile } from "./clerk.mjs";

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
/** Daily Patrol attempts per UTC day — keep in sync with DAILY_MAX_ATTEMPTS in src/save.ts. */
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

/** Today's UTC date, 'YYYY-MM-DD' — the Daily Patrol board key. */
const utcDate = () => new Date().toISOString().slice(0, 10);

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

function uniqueCallsign(base) {
  let name = base.replace(/[^A-Za-z0-9_\- ]/g, "").slice(0, 16).trim() || "Pilot";
  if (name.length < 3) name = `Pilot ${name}`.trim();
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
      if (existing.pass_hash || existing.google_sub || existing.clerk_sub)
        return json(res, 409, { error: "that callsign belongs to a registered pilot" });
      if (existing.guest_secret_hash) {
        if (!guestSecretMatches(guestSecret, existing.guest_secret_hash))
          return json(res, 409, { error: "that callsign is taken — pick another name" });
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
    });
  },

  "PATCH /api/me": async (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    const { callsign, country, password } = await readBody(req);
    const patch = {};
    if (callsign !== undefined) {
      if (typeof callsign !== "string" || !CALLSIGN_RE.test(callsign.trim()))
        return json(res, 400, { error: "invalid callsign" });
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
    const dailyDate = body.daily === true ? utcDate() : null;
    // The 3-attempts-per-day budget is enforced HERE, not just in the client's
    // localStorage — a forged client can't flood the daily board. (Refunded
    // <15s deaths never submit as daily, so legit players can't hit this.)
    if (dailyDate && store.countDailyScores(user.id, dailyDate) >= DAILY_MAX_ATTEMPTS)
      return json(res, 429, { error: "daily attempt limit reached — next patrol at UTC midnight" });

    store.insertScore(user.id, { ...run, dailyDate });
    store.insertRun(user.id, { ...run, platform: cleanPlatform(body.platform) });

    const worldRank = store.rankOf(user.id, { mode: run.mode, gameMode });
    // badge sweep: qualifying badges the pilot doesn't have yet
    const career = store.userCareer(user.id);
    const newBadges = qualifyingBadges(run, career, worldRank).filter((id) =>
      store.awardBadge(user.id, id),
    );

    json(res, 200, {
      best: store.getUserBest(user.id, run.mode, gameMode),
      worldRank,
      countryRank: user.country
        ? store.rankOf(user.id, { country: user.country, mode: run.mode, gameMode })
        : null,
      dailyRank: dailyDate ? store.rankOf(user.id, { mode: run.mode, dailyDate }) : null,
      // gap-to-goal targets for the game-over screen (same game mode's board)
      nextAbove: store.nextAbove(user.id, run.mode, gameMode),
      nextWingmate: store.nextWingmateAbove(user.id, run.mode, gameMode),
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
    const entries = store.leaderboard({ country, mode, gameMode, limit });
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

  // Daily Patrol: best daily-run score per pilot for today's UTC date.
  // The board resets naturally when the date rolls over.
  "GET /api/leaderboard/daily": (req, res, user, url) => {
    const mode = url.searchParams.get("mode") ?? "desktop";
    if (!MODES.includes(mode)) return json(res, 400, { error: "invalid mode" });
    const dailyDate = utcDate();
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    const entries = store.leaderboard({ mode, dailyDate, limit });
    const myBest = user ? store.getUserDailyBest(user.id, mode, dailyDate) : 0;
    const me = myBest
      ? { rank: store.rankOf(user.id, { mode, dailyDate }), best: myBest }
      : null;
    json(res, 200, { date: dailyDate, entries, me });
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
    json(res, 200, { friends: store.friendsOf(user.id), incoming, outgoing });
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
    json(res, 200, { entries: store.friendsLeaderboard(user.id, mode, gameMode), me: null });
  },

  "GET /api/friends/activity": (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    json(res, 200, { activity: store.friendActivity(user.id, 20) });
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

  "GET /api/admin/stats": (req, res) => {
    if (!isAdmin(req)) return json(res, 404, { error: "not found" });
    json(res, 200, store.adminStats());
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
    callsign: target.callsign,
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
  const entries = store.leaderboard({ arenaId: arena.id, mode, gameMode, limit: 100 });
  const me = store.getUserBest(user.id, mode, gameMode)
    ? {
        rank: store.rankOf(user.id, { arenaId: arena.id, mode, gameMode }),
        best: store.getUserBest(user.id, mode, gameMode),
      }
    : null;
  json(res, 200, { arena: { code: arena.code, name: arena.name }, entries, me });
}

// --- admin dashboard (single self-contained page; data via /api/admin/*) ---

const ADMIN_PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>ORION mission control</title>
<style>
  body { margin: 0 auto; padding: 24px; max-width: 1100px; background: #08080f; color: #ffee88;
         font: 14px/1.5 Georgia, serif; }
  h1 { color: #ffd700; letter-spacing: .3em; font-size: 18px; text-transform: uppercase; }
  h2 { color: #ffd700; letter-spacing: .15em; font-size: 13px; text-transform: uppercase;
       border-bottom: 1px solid rgba(170,136,68,.4); padding-bottom: 6px; margin: 30px 0 12px; }
  h3 { color: #8a7a55; letter-spacing: .1em; font-size: 11px; text-transform: uppercase; margin: 14px 0 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .stat { background: rgba(26,26,42,.6); border: 1px solid rgba(170,136,68,.35);
          padding: 10px 14px; border-radius: 4px; }
  .stat .v { color: #ffd700; font-size: 22px; }
  .stat .k { color: #8a7a55; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
  .row2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px 28px;
          align-items: start; }
  .panel { min-width: 0; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border-bottom: 1px solid rgba(170,136,68,.2); padding: 6px 10px; text-align: left;
           vertical-align: top; }
  th { color: #8a7a55; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
  input { background: rgba(26,26,42,.85); border: 1px solid #aa8844; color: #ffee88;
          font: inherit; padding: 10px 14px; width: 280px; }
  button { background: #ffd700; border: 0; color: #08080f; font: inherit; padding: 10px 22px;
           cursor: pointer; margin-left: 8px; }
  .err { color: #ff4455; margin-top: 10px; }
  .muted { color: #8a7a55; }
  pre { white-space: pre-wrap; margin: 0; font: 12px/1.5 monospace; }
  /* horizontal bar lists */
  .hbar-row { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
  .hbar-label { width: 150px; flex: none; text-align: right; font-size: 13px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hbar-track { flex: 1; background: rgba(26,26,42,.6); border-radius: 3px; height: 17px; overflow: hidden; }
  .hbar-fill { height: 100%; background: linear-gradient(90deg, #aa8844, #ffd700); border-radius: 3px;
               box-shadow: 0 0 10px rgba(255,215,0,.2); }
  .hbar-val { width: 90px; flex: none; font-size: 12px; color: #ffd700; }
  /* per-day column charts */
  .colchart { display: flex; align-items: stretch; gap: 4px; height: 150px; margin-top: 6px; }
  .colwrap { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .colval { font-size: 10px; color: #ffd700; text-align: center; height: 16px; }
  .colstack { flex: 1; position: relative; }
  .colstack .b, .colstack .a { position: absolute; bottom: 0; left: 12%; width: 76%; border-radius: 2px 2px 0 0; }
  .colstack .b { background: rgba(196,30,58,.5); }
  .colstack .a { background: linear-gradient(180deg, #ffee88, #cc8800); box-shadow: 0 0 8px rgba(255,215,0,.25); }
  .collabel { font-size: 9px; color: #8a7a55; text-align: center; padding-top: 4px;
              white-space: nowrap; overflow: hidden; }
  .legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px; color: #8a7a55; margin: 8px 0 2px; }
  .chip { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
  /* stacked split bar */
  .split { display: flex; height: 18px; border-radius: 3px; overflow: hidden; background: rgba(26,26,42,.6); }
  .split div { min-width: 2px; }
</style>
</head>
<body>
<h1>Orion mission control</h1>
<div id="gate">
  <p class="muted">Enter the admin key to load analytics.</p>
  <input id="key" type="password" placeholder="admin key" autofocus>
  <button onclick="go()">Open</button>
  <div id="gate-err" class="err"></div>
</div>
<div id="dash" style="display:none"></div>
<script>
const fmt = (n, d = 0) => n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
const secs = (s) => s == null ? "—" : s >= 60 ? Math.floor(s / 60) + "m " + Math.round(s % 60) + "s" : Math.round(s) + "s";
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const stat = (k, v) => '<div class="stat"><div class="v">' + v + '</div><div class="k">' + k + "</div></div>";
const flag = (cc) => /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : "";
const GOLD = "#ffd700", RED = "rgba(196,30,58,.75)", BLUE = "#7fb8d4", BRONZE = "#aa8844";

/** Horizontal bar list: rows = [{ label, value, val (display) }]. */
function hbars(rows, empty) {
  if (!rows.length) return '<div class="muted">' + empty + "</div>";
  const max = Math.max.apply(null, rows.map((r) => r.value).concat([1]));
  return rows.map((r) =>
    '<div class="hbar-row"><div class="hbar-label">' + r.label + "</div>" +
    '<div class="hbar-track"><div class="hbar-fill" style="width:' + Math.max(1.5, (r.value / max) * 100).toFixed(1) + '%"></div></div>' +
    '<div class="hbar-val">' + r.val + "</div></div>",
  ).join("");
}

/** Per-day columns, oldest → newest. days = [{ day, a (gold), b (dim red) }]. */
function colchart(days, aName, bName) {
  if (!days.length) return '<div class="muted">nothing yet</div>';
  const max = Math.max.apply(null, days.map((d) => Math.max(d.a, d.b)).concat([1]));
  const cols = days.map((d) => {
    const title = esc(d.day + " — " + fmt(d.b) + " " + bName + ", " + fmt(d.a) + " " + aName);
    return '<div class="colwrap" title="' + title + '">' +
      '<div class="colval">' + (d.b || "") + "</div>" +
      '<div class="colstack">' +
        '<div class="b" style="height:' + ((d.b / max) * 100).toFixed(1) + '%"></div>' +
        '<div class="a" style="height:' + ((d.a / max) * 100).toFixed(1) + '%"></div>' +
      "</div>" +
      '<div class="collabel">' + d.day.slice(5).replace("-", "/") + "</div>" +
    "</div>";
  }).join("");
  return '<div class="legend"><span><span class="chip" style="background:linear-gradient(180deg,#ffee88,#cc8800)"></span>' +
    aName + '</span><span><span class="chip" style="background:rgba(196,30,58,.5)"></span>' + bName + "</span></div>" +
    '<div class="colchart">' + cols + "</div>";
}

/** One stacked 100% bar + legend. parts = [{ label, value }]. */
function splitBar(parts) {
  const COLORS = [GOLD, RED, BLUE, BRONZE, "#8888cc"];
  parts = parts.filter((p) => p.value > 0);
  if (!parts.length) return '<div class="muted">nothing yet</div>';
  const total = parts.reduce((s, p) => s + p.value, 0);
  return '<div class="split">' +
    parts.map((p, i) => '<div style="width:' + ((p.value / total) * 100).toFixed(1) + "%;background:" +
      COLORS[i % COLORS.length] + '" title="' + esc(p.label) + ": " + fmt(p.value) + '"></div>').join("") +
    "</div><div class='legend'>" +
    parts.map((p, i) => '<span><span class="chip" style="background:' + COLORS[i % COLORS.length] + '"></span>' +
      esc(p.label) + " · " + fmt(p.value) + " (" + Math.round((p.value / total) * 100) + "%)</span>").join("") +
    "</div>";
}

async function go() {
  const key = document.getElementById("key").value.trim();
  const auth = { headers: { Authorization: "Bearer " + key } };
  const sRes = await fetch("/api/admin/stats", auth);
  if (!sRes.ok) { document.getElementById("gate-err").textContent = "Wrong key (or ORION_ADMIN_KEY unset)."; return; }
  const s = await sRes.json();
  const fb = (await (await fetch("/api/admin/feedback", auth)).json()).feedback ?? [];
  localStorage.setItem("orion.adminKey", key);
  document.getElementById("gate").style.display = "none";
  const d = document.getElementById("dash");
  d.style.display = "";
  const t = s.traffic ?? null;
  d.innerHTML =
    (t ? (
    "<h2>Traffic</h2><div class='grid'>" +
      stat("visitors today", fmt(t.today.uniques)) +
      stat("visits today", fmt(t.today.visits)) +
      stat("visitors (7 days)", fmt(t.week.uniques)) +
      stat("visits (7 days)", fmt(t.week.visits)) +
      stat("visitors all-time", fmt(t.total.uniques)) +
      stat("visits all-time", fmt(t.total.visits)) +
    "</div>" +
    "<h3>Visits per day (last 14)</h3>" +
      colchart(t.perDay.slice().reverse().map((v) => ({ day: v.day, a: v.uniques, b: v.visits })), "visitors", "visits") +
    "<div class='row2'>" +
      "<div class='panel'><h3>Countries (14d)</h3>" +
        hbars(t.countries.map((c) => ({ label: flag(c.k) + " " + esc(c.k), value: c.uniques, val: fmt(c.uniques) + " visitors" })), "nothing yet") +
      "</div>" +
      "<div class='panel'><h3>Referrers (14d)</h3>" +
        hbars(t.referrers.map((r) => ({ label: esc(r.k), value: r.uniques, val: fmt(r.uniques) + " visitors" })), "direct visits only so far") +
      "</div>" +
      "<div class='panel'><h3>Site face (14d)</h3>" +
        splitBar(t.paths.map((p) => ({ label: p.k === "fullgame" ? "full game" : "daily", value: p.visits }))) +
      "</div>" +
      "<div class='panel'><h3>Devices (14d)</h3>" +
        splitBar(t.platforms.map((p) => ({ label: p.k === "touch" ? "phone" : p.k, value: p.visits }))) +
      "</div>" +
    "</div>"
    ) : "") +
    "<h2>Pilots</h2><div class='grid'>" +
      stat("registered pilots", fmt(s.users.total)) +
      stat("new this week", fmt(s.users.newThisWeek)) +
      stat("new today", fmt(s.users.newToday)) +
      stat("returning (&gt;1 run)", fmt(s.users.returningPlayers)) +
    "</div>" +
    "<h2>Runs</h2><div class='grid'>" +
      stat("total runs", fmt(s.runs.total)) +
      stat("anonymous runs", fmt(s.runs.anonymous)) +
      stat("signed-in players", fmt(s.runs.signedInPlayers)) +
    "</div>" +
    "<h3>Runs per day (last 14)</h3>" +
      colchart(s.runs.perDay.slice().reverse().map((r) => ({ day: r.day, a: r.players, b: r.runs })), "signed-in players", "runs") +
    "<div class='row2'>" +
      "<div class='panel'><h3>Boards</h3>" +
        splitBar(s.runs.modeSplit.map((m) => ({ label: m.mode, value: m.runs }))) +
      "</div>" +
      "<div class='panel'><h3>Game modes</h3>" +
        splitBar((s.runs.gameModeSplit ?? []).map((g) => ({ label: g.gameMode || "classic", value: g.runs }))) +
      "</div>" +
    "</div>" +
    "<div class='row2'>" +
      "<div class='panel'><h2>Game length</h2><div class='grid'>" +
        stat("average", secs(s.gameLength.avg)) +
        stat("median", secs(s.gameLength.median)) +
        stat("longest", secs(s.gameLength.max)) +
      "</div><h3>Distribution</h3>" +
        hbars(Object.entries(s.gameLength.buckets).map(([k, v]) => ({ label: esc(k), value: v, val: fmt(v) + " runs" })), "nothing yet") +
      "</div>" +
      "<div class='panel'><h2>Score</h2><div class='grid'>" +
        stat("average", fmt(s.score.avg)) + stat("median", fmt(s.score.median)) +
        stat("p90", fmt(s.score.p90)) + stat("p99", fmt(s.score.p99)) +
        stat("best", fmt(s.score.max)) +
      "</div>" +
      "<h2>Combat</h2><div class='grid'>" +
        stat("avg kills / run", fmt(s.combat.avgKills, 1)) +
        stat("kills / minute", fmt(s.combat.killsPerMinute, 1)) +
        stat("avg peak multiplier", "x" + fmt(s.combat.avgMaxMultiplier, 1)) +
        stat("best multiplier", "x" + fmt(s.combat.bestMultiplier, 1)) +
      "</div></div>" +
    "</div>" +
    "<h2>Community</h2><div class='grid'>" +
      stat("feedback reports", fmt(s.community.feedback)) +
      stat("with email", fmt(s.community.feedbackWithEmail)) +
      stat("arenas", fmt(s.community.arenas)) +
      stat("badges awarded", fmt(s.community.badgesAwarded)) +
    "</div>" +
    "<h3>Badge holders</h3>" +
      hbars(s.community.badgeCounts.map((b) => ({ label: esc(b.badge), value: b.holders, val: fmt(b.holders) + " pilots" })), "no badges earned yet") +
    "<h2>Recent feedback</h2><table><tr><th>when</th><th>pilot</th><th>email</th><th>message</th></tr>" +
      fb.map((f) => "<tr><td class='muted'>" + new Date(f.createdAt).toLocaleString() + "</td><td>" +
        esc(f.callsign ?? "anon") + "</td><td>" + esc(f.email ?? "") + "</td><td><pre>" +
        esc(f.message) + "</pre><span class='muted'>" + esc(f.context) + "</span></td></tr>").join("") +
    "</table>";
}
const saved = localStorage.getItem("orion.adminKey");
if (saved) { document.getElementById("key").value = saved; go(); }
document.getElementById("key").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
</script>
</body>
</html>`;

// --- static file serving (production single-process mode) ---

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function serveStatic(req, res, pathname) {
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let file = path.join(DIST, safe);
  if (!file.startsWith(DIST)) return json(res, 403, { error: "forbidden" });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  if (!fs.existsSync(file)) return json(res, 404, { error: "not found (run npm run build)" });
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

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
    if (!url.pathname.startsWith("/api/") && SERVE_DIST && req.method === "GET") {
      return serveStatic(req, res, url.pathname);
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
