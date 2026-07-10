// SQLite storage via node:sqlite (built into Node 22.5+, zero dependencies).
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
export const db = new DatabaseSync(process.env.ORION_DB ?? path.join(dir, "orion.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    callsign TEXT NOT NULL,
    callsign_lower TEXT NOT NULL UNIQUE,
    pass_salt TEXT,
    pass_hash TEXT,
    google_sub TEXT UNIQUE,
    clerk_sub TEXT UNIQUE,
    country TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    time_survived REAL NOT NULL,
    kills INTEGER NOT NULL,
    max_multiplier REAL NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id, score DESC);

  CREATE TABLE IF NOT EXISTS arenas (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS arena_members (
    arena_id INTEGER NOT NULL REFERENCES arenas(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (arena_id, user_id)
  );
`);

// Migration for databases created before Clerk support.
try {
  db.exec(`ALTER TABLE users ADD COLUMN clerk_sub TEXT`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk ON users(clerk_sub)`);
} catch {
  // column already exists
}

// --- users / sessions ---

export function createUser({
  callsign,
  passSalt = null,
  passHash = null,
  googleSub = null,
  clerkSub = null,
  country = "",
}) {
  const r = db
    .prepare(
      `INSERT INTO users (callsign, callsign_lower, pass_salt, pass_hash, google_sub, clerk_sub, country, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(callsign, callsign.toLowerCase(), passSalt, passHash, googleSub, clerkSub, country, Date.now());
  return getUserById(r.lastInsertRowid);
}

export const getUserById = (id) => db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
export const getUserByCallsign = (callsign) =>
  db.prepare(`SELECT * FROM users WHERE callsign_lower = ?`).get(callsign.toLowerCase());
export const getUserByGoogleSub = (sub) =>
  db.prepare(`SELECT * FROM users WHERE google_sub = ?`).get(sub);
export const getUserByClerkSub = (sub) =>
  db.prepare(`SELECT * FROM users WHERE clerk_sub = ?`).get(sub);

export function updateUser(id, { callsign, country }) {
  if (callsign !== undefined) {
    db.prepare(`UPDATE users SET callsign = ?, callsign_lower = ? WHERE id = ?`).run(
      callsign,
      callsign.toLowerCase(),
      id,
    );
  }
  if (country !== undefined) {
    db.prepare(`UPDATE users SET country = ? WHERE id = ?`).run(country, id);
  }
  return getUserById(id);
}

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export function createSession(userId, token) {
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
    token,
    userId,
    Date.now() + SESSION_TTL_MS,
  );
}

export function getSessionUser(token) {
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, Date.now());
  return row ?? null;
}

export const deleteSession = (token) => db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);

// --- scores ---

export function insertScore(userId, { score, timeSurvived, kills, maxMultiplier }) {
  db.prepare(
    `INSERT INTO scores (user_id, score, time_survived, kills, max_multiplier, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, score, timeSurvived, kills, maxMultiplier, Date.now());
}

export const getUserBest = (userId) =>
  db.prepare(`SELECT MAX(score) AS best FROM scores WHERE user_id = ?`).get(userId)?.best ?? 0;

/** Best score per user, ranked. Optional country filter and arena scope. */
export function leaderboard({ country = null, arenaId = null, limit = 100 }) {
  const joins = arenaId ? `JOIN arena_members am ON am.user_id = u.id AND am.arena_id = ?` : "";
  const where = country ? `WHERE u.country = ?` : "";
  const params = [...(arenaId ? [arenaId] : []), ...(country ? [country] : []), limit];
  return db
    .prepare(
      `SELECT u.id AS userId, u.callsign, u.country,
              MAX(s.score) AS best, COUNT(s.id) AS runs,
              MAX(s.time_survived) AS bestTime
       FROM users u
       JOIN scores s ON s.user_id = u.id
       ${joins} ${where}
       GROUP BY u.id
       ORDER BY best DESC, MIN(s.created_at) ASC
       LIMIT ?`,
    )
    .all(...params);
}

/** 1-based rank of a user's best within a scope (null if no scores). */
export function rankOf(userId, { country = null, arenaId = null }) {
  const best = getUserBest(userId);
  if (!best) return null;
  const joins = arenaId ? `JOIN arena_members am ON am.user_id = u.id AND am.arena_id = ?` : "";
  const where = country ? `AND u.country = ?` : "";
  const params = [...(arenaId ? [arenaId] : []), ...(country ? [country] : []), best];
  const row = db
    .prepare(
      `SELECT COUNT(*) AS ahead FROM (
         SELECT u.id, MAX(s.score) AS b FROM users u
         JOIN scores s ON s.user_id = u.id
         ${joins}
         WHERE 1=1 ${where}
         GROUP BY u.id
       ) WHERE b > ?`,
    )
    .get(...params);
  return (row?.ahead ?? 0) + 1;
}

// --- arenas ---

export function createArena(ownerId, name, code) {
  const r = db
    .prepare(`INSERT INTO arenas (code, name, owner_id, created_at) VALUES (?, ?, ?, ?)`)
    .run(code, name, ownerId, Date.now());
  db.prepare(`INSERT INTO arena_members (arena_id, user_id, joined_at) VALUES (?, ?, ?)`).run(
    r.lastInsertRowid,
    ownerId,
    Date.now(),
  );
  return getArenaByCode(code);
}

export const getArenaByCode = (code) =>
  db.prepare(`SELECT * FROM arenas WHERE code = ?`).get(code.toUpperCase());

export function joinArena(arenaId, userId) {
  db.prepare(
    `INSERT OR IGNORE INTO arena_members (arena_id, user_id, joined_at) VALUES (?, ?, ?)`,
  ).run(arenaId, userId, Date.now());
}

export const isArenaMember = (arenaId, userId) =>
  !!db
    .prepare(`SELECT 1 FROM arena_members WHERE arena_id = ? AND user_id = ?`)
    .get(arenaId, userId);

export function userArenas(userId) {
  return db
    .prepare(
      `SELECT a.code, a.name, a.owner_id = ? AS isOwner,
              (SELECT COUNT(*) FROM arena_members m WHERE m.arena_id = a.id) AS members
       FROM arenas a
       JOIN arena_members am ON am.arena_id = a.id AND am.user_id = ?
       ORDER BY am.joined_at DESC`,
    )
    .all(userId, userId);
}
