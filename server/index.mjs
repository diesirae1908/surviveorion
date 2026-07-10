// Orion community server: accounts, world/arena leaderboards, score submission.
// Zero dependencies — node:http + node:sqlite + node:crypto (Node 22.5+).
//
//   node server/index.mjs            # API on :8787
//   ORION_SERVE_DIST=1 node ...      # also serve the production build (dist/)
//   GOOGLE_CLIENT_ID=... node ...    # enable "Sign in with Google"
//   CLERK_PUBLISHABLE_KEY=pk_... CLERK_SECRET_KEY=sk_...   # enable Clerk sign-in
//
// Environment can also come from server/.env (KEY=value lines, not committed).

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./env.mjs"; // loads server/.env before other modules read process.env
import * as store from "./db.mjs";
import { validateRun } from "./validate.mjs";
import { clerkEnabled, clerkPublishableKey, verifyClerkToken, clerkUserProfile } from "./clerk.mjs";

const PORT = Number(process.env.PORT ?? 8787);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const SERVE_DIST = process.env.ORION_SERVE_DIST === "1";
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const CALLSIGN_RE = /^[A-Za-z0-9_\- ]{3,20}$/;
const COUNTRY_RE = /^([A-Z]{2})?$/;

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

/** Real client IP (Render/other proxies set x-forwarded-for). */
const clientIp = (req) =>
  (req.headers["x-forwarded-for"]?.split(",")[0] ?? req.socket.remoteAddress ?? "?").trim();

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

const hashPassword = (password, salt) =>
  crypto.scryptSync(password, salt, 32).toString("hex");

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
    if (!rateLimit(`reg:${req.socket.remoteAddress}`, 10)) return json(res, 429, { error: "slow down" });
    const { callsign, password, country = "" } = await readBody(req);
    if (typeof callsign !== "string" || !CALLSIGN_RE.test(callsign.trim()))
      return json(res, 400, { error: "callsign must be 3-20 letters, digits, - or _" });
    if (typeof password !== "string" || password.length < 6)
      return json(res, 400, { error: "password must be at least 6 characters" });
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

  "POST /api/auth/login": async (req, res) => {
    if (!rateLimit(`login:${req.socket.remoteAddress}`, 15)) return json(res, 429, { error: "slow down" });
    const { callsign, password } = await readBody(req);
    const user = typeof callsign === "string" ? store.getUserByCallsign(callsign.trim()) : null;
    if (!user?.pass_hash || typeof password !== "string")
      return json(res, 401, { error: "unknown callsign or wrong password" });
    const hash = hashPassword(password, user.pass_salt);
    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.pass_hash)))
      return json(res, 401, { error: "unknown callsign or wrong password" });
    json(res, 200, { token: issueSession(user.id), user: publicUser(user) });
  },

  "POST /api/auth/google": async (req, res) => {
    if (!GOOGLE_CLIENT_ID) return json(res, 400, { error: "google sign-in not configured" });
    if (!rateLimit(`google:${req.socket.remoteAddress}`, 15)) return json(res, 429, { error: "slow down" });
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
    json(res, 200, { user: publicUser(user), best: store.getUserBest(user.id) });
  },

  "PATCH /api/me": async (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    const { callsign, country } = await readBody(req);
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
    json(res, 200, { user: publicUser(store.updateUser(user.id, patch)) });
  },

  "POST /api/scores": async (req, res, user) => {
    if (!user) return json(res, 401, { error: "not signed in" });
    if (!rateLimit(`score:${user.id}`, 6)) return json(res, 429, { error: "too many submissions" });
    const body = await readBody(req);
    const run = {
      score: body.score,
      timeSurvived: body.timeSurvived,
      kills: body.kills,
      maxMultiplier: body.maxMultiplier,
    };
    const err = validateRun(run);
    if (err) return json(res, 422, { error: err });

    store.insertScore(user.id, run);
    json(res, 200, {
      best: store.getUserBest(user.id),
      worldRank: store.rankOf(user.id, {}),
      countryRank: user.country ? store.rankOf(user.id, { country: user.country }) : null,
    });
  },

  "GET /api/leaderboard/world": (req, res, user, url) => {
    const country = url.searchParams.get("country")?.toUpperCase() || null;
    if (country && !/^[A-Z]{2}$/.test(country)) return json(res, 400, { error: "invalid country" });
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    const entries = store.leaderboard({ country, limit });
    const me =
      user && store.getUserBest(user.id)
        ? {
            rank: store.rankOf(user.id, { country }),
            best: store.getUserBest(user.id),
            inScope: !country || user.country === country,
          }
        : null;
    json(res, 200, { entries, me: me?.inScope ? me : null });
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
};

// GET /api/arenas/:code/leaderboard (dynamic segment, handled separately)
function arenaLeaderboard(req, res, user, code) {
  if (!user) return json(res, 401, { error: "not signed in" });
  const arena = store.getArenaByCode(code);
  if (!arena) return json(res, 404, { error: "arena not found" });
  if (!store.isArenaMember(arena.id, user.id)) return json(res, 403, { error: "not a member" });
  const entries = store.leaderboard({ arenaId: arena.id, limit: 100 });
  const me = store.getUserBest(user.id)
    ? { rank: store.rankOf(user.id, { arenaId: arena.id }), best: store.getUserBest(user.id) }
    : null;
  json(res, 200, { arena: { code: arena.code, name: arena.name }, entries, me });
}

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
  try {
    const arenaLb = /^\/api\/arenas\/([A-Za-z0-9]+)\/leaderboard$/.exec(url.pathname);
    if (req.method === "GET" && arenaLb) {
      return arenaLeaderboard(req, res, authUser(req), arenaLb[1]);
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

server.listen(PORT, () => {
  console.log(`Orion server on http://localhost:${PORT}`);
  console.log(`  clerk sign-in:  ${clerkEnabled() ? "enabled" : "disabled (set CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY)"}`);
  console.log(`  google sign-in: ${GOOGLE_CLIENT_ID ? "enabled" : "disabled (set GOOGLE_CLIENT_ID)"}`);
  console.log(`  static dist:    ${SERVE_DIST ? "serving" : "off (set ORION_SERVE_DIST=1)"}`);
});
