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
    mode TEXT NOT NULL DEFAULT 'desktop',
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

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    callsign TEXT,
    email TEXT,
    message TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  -- Every finished run (signed-in or anonymous), for analytics only:
  -- leaderboards keep reading the scores table.
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    score INTEGER NOT NULL,
    time_survived REAL NOT NULL,
    kills INTEGER NOT NULL,
    max_multiplier REAL NOT NULL,
    mode TEXT NOT NULL DEFAULT 'desktop',
    platform TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at);

  -- Anonymous visit beacons (first-party traffic stats for /admin): one row
  -- per browser session. ip_hash is a truncated SHA-256 — no raw IPs stored.
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY,
    ip_hash TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT '',
    ref TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at);

  -- Earned badges (see server/badges.mjs for the definitions).
  CREATE TABLE IF NOT EXISTS badges (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL,
    earned_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, badge_id)
  );

  -- Friendships: one row per pair, created by the requester. status is
  -- 'pending' until the addressee accepts.
  CREATE TABLE IF NOT EXISTS friends (
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (requester_id, addressee_id)
  );
  CREATE INDEX IF NOT EXISTS idx_friends_addressee ON friends(addressee_id, status);
`);

// Migration for databases created before Clerk support.
try {
  db.exec(`ALTER TABLE users ADD COLUMN clerk_sub TEXT`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk ON users(clerk_sub)`);
} catch {
  // column already exists
}

// Migration for guest device lock: passwordless (guest) accounts carry a
// hashed device secret. Reclaiming a guest callsign requires the matching
// secret; pre-migration guests (NULL hash) get one bound on their next
// successful reclaim (first device wins).
try {
  db.exec(`ALTER TABLE users ADD COLUMN guest_secret_hash TEXT`);
} catch {
  // column already exists
}

// Migration for databases created before tilt controls (per-mode leaderboards).
try {
  db.exec(`ALTER TABLE scores ADD COLUMN mode TEXT NOT NULL DEFAULT 'classic'`);
} catch {
  // column already exists
}

// Migration for Daily Patrol: daily runs carry the UTC date they were flown
// on ('YYYY-MM-DD'); NULL = a normal run. Daily runs still count toward the
// all-time boards — the date column only scopes the daily board.
try {
  db.exec(`ALTER TABLE scores ADD COLUMN daily_date TEXT`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scores_daily ON scores(daily_date, mode)`);
} catch {
  // column already exists
}

// Migration for game modes (Classic / Iron Rain). game_mode is a separate
// column from mode (platform) — every board is scoped by both. Pre-modes rows
// were all Classic, which the DEFAULT covers.
try {
  db.exec(`ALTER TABLE scores ADD COLUMN game_mode TEXT NOT NULL DEFAULT 'classic'`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scores_gamemode ON scores(game_mode, mode)`);
} catch {
  // column already exists
}
try {
  db.exec(`ALTER TABLE runs ADD COLUMN game_mode TEXT NOT NULL DEFAULT 'classic'`);
} catch {
  // column already exists
}

// One-time migration to platform-based boards (desktop / touch / tilt). The
// old modes were flight-physics tags ('classic' = inertia, 'tilt' = direct
// control); inertia is a flavor setting now, so old rows are refiled by the
// platform they were played on, using the runs telemetry (same user, same
// score, logged within 2s). Old tilt can't be told apart from touch stick
// retroactively — old phone runs land on the touch board. Guarded by
// user_version because 'tilt' stays a valid mode with a new meaning.
if ((db.prepare("PRAGMA user_version").get()?.user_version ?? 0) < 1) {
  db.exec(`
    UPDATE scores SET mode = CASE WHEN EXISTS (
      SELECT 1 FROM runs r
      WHERE r.user_id = scores.user_id AND r.score = scores.score
        AND ABS(r.created_at - scores.created_at) < 2000 AND r.platform = 'touch'
    ) THEN 'touch' ELSE 'desktop' END
    WHERE mode IN ('classic', 'tilt');

    UPDATE runs SET mode = CASE WHEN platform = 'touch' THEN 'touch' ELSE 'desktop' END
    WHERE mode IN ('classic', 'tilt');

    PRAGMA user_version = 1;
  `);
}

// --- users / sessions ---

export function createUser({
  callsign,
  passSalt = null,
  passHash = null,
  googleSub = null,
  clerkSub = null,
  country = "",
  guestSecretHash = null,
}) {
  const r = db
    .prepare(
      `INSERT INTO users (callsign, callsign_lower, pass_salt, pass_hash, google_sub, clerk_sub, country, guest_secret_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(callsign, callsign.toLowerCase(), passSalt, passHash, googleSub, clerkSub, country, guestSecretHash, Date.now());
  return getUserById(r.lastInsertRowid);
}

export const getUserById = (id) => db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
export const getUserByCallsign = (callsign) =>
  db.prepare(`SELECT * FROM users WHERE callsign_lower = ?`).get(callsign.toLowerCase());
export const getUserByGoogleSub = (sub) =>
  db.prepare(`SELECT * FROM users WHERE google_sub = ?`).get(sub);
export const getUserByClerkSub = (sub) =>
  db.prepare(`SELECT * FROM users WHERE clerk_sub = ?`).get(sub);

export function updateUser(id, { callsign, country, passSalt, passHash }) {
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
  if (passSalt !== undefined && passHash !== undefined) {
    db.prepare(`UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?`).run(
      passSalt,
      passHash,
      id,
    );
  }
  return getUserById(id);
}

/** Bind a guest device secret to a pre-migration guest account (one-time). */
export function setGuestSecretHash(id, hash) {
  db.prepare(`UPDATE users SET guest_secret_hash = ? WHERE id = ?`).run(hash, id);
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

/** Drop expired sessions (they're already invisible to reads; this reclaims space). */
export const purgeExpiredSessions = () =>
  db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(Date.now());

// --- scores ---

export function insertScore(userId, { score, timeSurvived, kills, maxMultiplier, mode, gameMode, dailyDate = null }) {
  db.prepare(
    `INSERT INTO scores (user_id, score, time_survived, kills, max_multiplier, mode, game_mode, daily_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, score, timeSurvived, kills, maxMultiplier, mode ?? "desktop", gameMode ?? "classic", dailyDate, Date.now());
}

export const getUserBest = (userId, mode = "desktop", gameMode = "classic") =>
  db
    .prepare(`SELECT MAX(score) AS best FROM scores WHERE user_id = ? AND mode = ? AND game_mode = ?`)
    .get(userId, mode, gameMode)?.best ?? 0;

/** Daily runs already filed by a user on a given UTC date (server-side attempt budget). */
export const countDailyScores = (userId, dailyDate) =>
  db
    .prepare(`SELECT COUNT(*) AS c FROM scores WHERE user_id = ? AND daily_date = ?`)
    .get(userId, dailyDate).c;

/** Best daily-run score for one user on a given UTC date (dailies are Classic). */
export const getUserDailyBest = (userId, mode, dailyDate) =>
  db
    .prepare(
      `SELECT MAX(score) AS best FROM scores WHERE user_id = ? AND mode = ? AND daily_date = ?`,
    )
    .get(userId, mode, dailyDate)?.best ?? 0;

/**
 * Best score per user, ranked. Scoped by board mode (platform) and game mode
 * (Classic / Iron Rain); optional country/arena, or a Daily Patrol date
 * (daily runs only, that UTC day — dailies are always Classic).
 */
export function leaderboard({ country = null, arenaId = null, mode = "desktop", gameMode = "classic", dailyDate = null, limit = 100 }) {
  const joins = arenaId ? `JOIN arena_members am ON am.user_id = u.id AND am.arena_id = ?` : "";
  const daily = dailyDate ? `AND s.daily_date = ?` : "";
  const where = country ? `WHERE u.country = ?` : "";
  const params = [
    mode,
    gameMode,
    ...(dailyDate ? [dailyDate] : []),
    ...(arenaId ? [arenaId] : []),
    ...(country ? [country] : []),
    limit,
  ];
  return db
    .prepare(
      `SELECT u.id AS userId, u.callsign, u.country,
              MAX(s.score) AS best, COUNT(s.id) AS runs,
              MAX(s.time_survived) AS bestTime
       FROM users u
       JOIN scores s ON s.user_id = u.id AND s.mode = ? AND s.game_mode = ? ${daily}
       ${joins} ${where}
       GROUP BY u.id
       ORDER BY best DESC, MIN(s.created_at) ASC
       LIMIT ?`,
    )
    .all(...params);
}

/** 1-based rank of a user's best within a scope (null if no scores). */
export function rankOf(userId, { country = null, arenaId = null, mode = "desktop", gameMode = "classic", dailyDate = null }) {
  const best = dailyDate
    ? getUserDailyBest(userId, mode, dailyDate)
    : getUserBest(userId, mode, gameMode);
  if (!best) return null;
  const joins = arenaId ? `JOIN arena_members am ON am.user_id = u.id AND am.arena_id = ?` : "";
  const daily = dailyDate ? `AND s.daily_date = ?` : "";
  const where = country ? `AND u.country = ?` : "";
  const params = [
    mode,
    gameMode,
    ...(dailyDate ? [dailyDate] : []),
    ...(arenaId ? [arenaId] : []),
    ...(country ? [country] : []),
    best,
  ];
  const row = db
    .prepare(
      `SELECT COUNT(*) AS ahead FROM (
         SELECT u.id, MAX(s.score) AS b FROM users u
         JOIN scores s ON s.user_id = u.id AND s.mode = ? AND s.game_mode = ? ${daily}
         ${joins}
         WHERE 1=1 ${where}
         GROUP BY u.id
       ) WHERE b > ?`,
    )
    .get(...params);
  return (row?.ahead ?? 0) + 1;
}

/**
 * The pilot directly above a user on the world board for a mode —
 * the gap-to-goal target shown on the game-over screen.
 */
export function nextAbove(userId, mode = "desktop", gameMode = "classic") {
  const best = getUserBest(userId, mode, gameMode);
  if (!best) return null;
  return (
    db
      .prepare(
        `SELECT u.callsign, MAX(s.score) AS score
         FROM users u JOIN scores s ON s.user_id = u.id AND s.mode = ? AND s.game_mode = ?
         WHERE u.id != ?
         GROUP BY u.id
         HAVING score > ?
         ORDER BY score ASC
         LIMIT 1`,
      )
      .get(mode, gameMode, userId, best) ?? null
  );
}

/** Nearest wingmate above a user on the world board (friendly rivalry hook). */
export function nextWingmateAbove(userId, mode = "desktop", gameMode = "classic") {
  const best = getUserBest(userId, mode, gameMode);
  if (!best) return null;
  const ids = friendIdsOf(userId);
  if (ids.length === 0) return null;
  const marks = ids.map(() => "?").join(",");
  return (
    db
      .prepare(
        `SELECT u.callsign, MAX(s.score) AS score
         FROM users u JOIN scores s ON s.user_id = u.id AND s.mode = ? AND s.game_mode = ?
         WHERE u.id IN (${marks})
         GROUP BY u.id
         HAVING score > ?
         ORDER BY score ASC
         LIMIT 1`,
      )
      .get(mode, gameMode, ...ids, best) ?? null
  );
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

// --- friends ---

/** The friendship row between two users, whichever direction it was created. */
export const getFriendship = (a, b) =>
  db
    .prepare(
      `SELECT * FROM friends
       WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    )
    .get(a, b, b, a) ?? null;

export function requestFriend(fromId, toId) {
  db.prepare(
    `INSERT OR IGNORE INTO friends (requester_id, addressee_id, status, created_at)
     VALUES (?, ?, 'pending', ?)`,
  ).run(fromId, toId, Date.now());
}

/** Accept a pending request sent *to* userId. Returns true if one existed. */
export function acceptFriend(userId, requesterId) {
  const r = db
    .prepare(
      `UPDATE friends SET status = 'accepted'
       WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'`,
    )
    .run(requesterId, userId);
  return r.changes > 0;
}

/** Remove a friendship or request in either direction (decline/cancel/unfriend). */
export function removeFriend(userId, otherId) {
  db.prepare(
    `DELETE FROM friends
     WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
  ).run(userId, otherId, otherId, userId);
}

/** Ids of accepted friends. */
export function friendIdsOf(userId) {
  return db
    .prepare(
      `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS id
       FROM friends
       WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`,
    )
    .all(userId, userId, userId)
    .map((r) => r.id);
}

/** Accepted friends with overall best and last-flown time. */
export function friendsOf(userId) {
  return db
    .prepare(
      `SELECT u.callsign, u.country,
              COALESCE((SELECT MAX(score) FROM scores WHERE user_id = u.id), 0) AS best,
              (SELECT MAX(created_at) FROM scores WHERE user_id = u.id) AS lastRunAt
       FROM friends f
       JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
       WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
       ORDER BY lastRunAt DESC NULLS LAST`,
    )
    .all(userId, userId, userId);
}

/** Pending requests: incoming (to accept) and outgoing (sent, waiting). */
export function friendRequests(userId) {
  const incoming = db
    .prepare(
      `SELECT u.callsign, u.country, f.created_at AS createdAt
       FROM friends f JOIN users u ON u.id = f.requester_id
       WHERE f.addressee_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
    )
    .all(userId);
  const outgoing = db
    .prepare(
      `SELECT u.callsign, u.country, f.created_at AS createdAt
       FROM friends f JOIN users u ON u.id = f.addressee_id
       WHERE f.requester_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
    )
    .all(userId);
  return { incoming, outgoing };
}

export const pendingFriendCount = (userId) =>
  db
    .prepare(`SELECT COUNT(*) AS c FROM friends WHERE addressee_id = ? AND status = 'pending'`)
    .get(userId).c;

/** Best score per pilot among the user and their friends, ranked. */
export function friendsLeaderboard(userId, mode = "desktop", gameMode = "classic") {
  const ids = [userId, ...friendIdsOf(userId)];
  const marks = ids.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT u.id AS userId, u.callsign, u.country,
              MAX(s.score) AS best, COUNT(s.id) AS runs,
              MAX(s.time_survived) AS bestTime
       FROM users u
       JOIN scores s ON s.user_id = u.id AND s.mode = ? AND s.game_mode = ?
       WHERE u.id IN (${marks})
       GROUP BY u.id
       ORDER BY best DESC, MIN(s.created_at) ASC`,
    )
    .all(mode, gameMode, ...ids);
}

/** Recent runs by friends (activity feed). */
export function friendActivity(userId, limit = 20) {
  const ids = friendIdsOf(userId);
  if (ids.length === 0) return [];
  const marks = ids.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT u.callsign, u.country, s.score, s.time_survived AS timeSurvived,
              s.kills, s.mode, s.created_at AS createdAt
       FROM scores s JOIN users u ON u.id = s.user_id
       WHERE s.user_id IN (${marks})
       ORDER BY s.created_at DESC
       LIMIT ?`,
    )
    .all(...ids, limit);
}

// --- feedback ---

export function addFeedback({ userId = null, callsign = null, email = null, message, context = "" }) {
  db.prepare(
    `INSERT INTO feedback (user_id, callsign, email, message, context, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, callsign, email, message, context, Date.now());
}

export function listFeedback(limit = 100) {
  return db
    .prepare(
      `SELECT id, callsign, email, message, context, created_at AS createdAt
       FROM feedback ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit);
}

// --- visits (anonymous traffic beacons; admin dashboard only) ---

export function addVisit({ ipHash, country = "", ref = "", path = "", platform = "" }) {
  db.prepare(
    `INSERT INTO visits (ip_hash, country, ref, path, platform, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(ipHash, country, ref, path, platform, Date.now());
}

/** Traffic overview for the admin dashboard. */
export function trafficStats() {
  const now = Date.now();
  const day = 24 * 3600 * 1000;

  const window = (since) =>
    db
      .prepare(
        `SELECT COUNT(*) AS visits, COUNT(DISTINCT ip_hash) AS uniques
         FROM visits WHERE created_at > ?`,
      )
      .get(since);

  const perDay = db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') AS day,
              COUNT(*) AS visits, COUNT(DISTINCT ip_hash) AS uniques
       FROM visits GROUP BY day ORDER BY day DESC LIMIT 14`,
    )
    .all();

  const top = (column, since) =>
    db
      .prepare(
        `SELECT ${column} AS k, COUNT(*) AS visits, COUNT(DISTINCT ip_hash) AS uniques
         FROM visits WHERE created_at > ? AND ${column} != ''
         GROUP BY ${column} ORDER BY visits DESC LIMIT 12`,
      )
      .all(since);

  return {
    today: window(now - day),
    week: window(now - 7 * day),
    total: window(0),
    perDay,
    countries: top("country", now - 14 * day),
    referrers: top("ref", now - 14 * day),
    platforms: top("platform", now - 14 * day),
    paths: top("path", now - 14 * day),
  };
}

// --- runs (analytics telemetry; leaderboards use the scores table) ---

export function insertRun(userId, { score, timeSurvived, kills, maxMultiplier, mode, gameMode, platform }) {
  db.prepare(
    `INSERT INTO runs (user_id, score, time_survived, kills, max_multiplier, mode, game_mode, platform, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    score,
    timeSurvived,
    kills,
    maxMultiplier,
    mode ?? "desktop",
    gameMode ?? "classic",
    platform ?? "",
    Date.now(),
  );
}

/** Nth-percentile of a runs column (0..1), by sorted offset. */
function runPercentile(column, p, total) {
  if (!total) return 0;
  const offset = Math.min(total - 1, Math.max(0, Math.floor((total - 1) * p)));
  return (
    db.prepare(`SELECT ${column} AS v FROM runs ORDER BY ${column} LIMIT 1 OFFSET ?`).get(offset)
      ?.v ?? 0
  );
}

/** Everything the admin dashboard shows, in one call. */
export function adminStats() {
  const now = Date.now();
  const day = 24 * 3600 * 1000;

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS runs,
              COUNT(DISTINCT user_id) AS signedInPlayers,
              SUM(user_id IS NULL) AS anonRuns,
              AVG(time_survived) AS avgTime,
              MIN(time_survived) AS minTime,
              MAX(time_survived) AS maxTime,
              AVG(score) AS avgScore,
              MIN(score) AS minScore,
              MAX(score) AS maxScore,
              AVG(kills) AS avgKills,
              AVG(max_multiplier) AS avgMaxMultiplier,
              MAX(max_multiplier) AS bestMultiplier
       FROM runs`,
    )
    .get();
  const n = totals.runs ?? 0;

  const bucket = (lo, hi) =>
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM runs WHERE time_survived >= ? AND time_survived < ?`,
      )
      .get(lo, hi).c;

  const perDay = db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS runs,
              COUNT(DISTINCT user_id) AS players
       FROM runs GROUP BY day ORDER BY day DESC LIMIT 14`,
    )
    .all();

  const modeSplit = db
    .prepare(`SELECT mode, COUNT(*) AS runs FROM runs GROUP BY mode`)
    .all();
  const platformSplit = db
    .prepare(`SELECT platform, COUNT(*) AS runs FROM runs GROUP BY platform`)
    .all();
  const gameModeSplit = db
    .prepare(`SELECT game_mode AS gameMode, COUNT(*) AS runs FROM runs GROUP BY game_mode`)
    .all();

  const users = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(created_at > ?) AS newToday,
              SUM(created_at > ?) AS newThisWeek
       FROM users`,
    )
    .get(now - day, now - 7 * day);

  const returning = db
    .prepare(
      `SELECT COUNT(*) AS c FROM (
         SELECT user_id FROM runs WHERE user_id IS NOT NULL
         GROUP BY user_id HAVING COUNT(*) > 1
       )`,
    )
    .get().c;

  const community = {
    feedback: db.prepare(`SELECT COUNT(*) AS c FROM feedback`).get().c,
    feedbackWithEmail: db
      .prepare(`SELECT COUNT(*) AS c FROM feedback WHERE email IS NOT NULL`)
      .get().c,
    arenas: db.prepare(`SELECT COUNT(*) AS c FROM arenas`).get().c,
    badgesAwarded: db.prepare(`SELECT COUNT(*) AS c FROM badges`).get().c,
    badgeCounts: db
      .prepare(`SELECT badge_id AS badge, COUNT(*) AS holders FROM badges GROUP BY badge_id ORDER BY holders DESC`)
      .all(),
  };

  return {
    users: { ...users, returningPlayers: returning },
    traffic: trafficStats(),
    runs: {
      total: n,
      anonymous: totals.anonRuns ?? 0,
      signedInPlayers: totals.signedInPlayers ?? 0,
      perDay,
      modeSplit,
      platformSplit,
      gameModeSplit,
    },
    gameLength: {
      avg: totals.avgTime ?? 0,
      median: runPercentile("time_survived", 0.5, n),
      min: totals.minTime ?? 0,
      max: totals.maxTime ?? 0,
      buckets: {
        "under 30s": bucket(0, 30),
        "30-60s": bucket(30, 60),
        "1-2m": bucket(60, 120),
        "2-5m": bucket(120, 300),
        "5m+": bucket(300, Number.MAX_SAFE_INTEGER),
      },
    },
    score: {
      avg: totals.avgScore ?? 0,
      median: runPercentile("score", 0.5, n),
      p90: runPercentile("score", 0.9, n),
      p99: runPercentile("score", 0.99, n),
      min: totals.minScore ?? 0,
      max: totals.maxScore ?? 0,
    },
    combat: {
      avgKills: totals.avgKills ?? 0,
      killsPerMinute:
        totals.avgTime > 0 ? (totals.avgKills ?? 0) / (totals.avgTime / 60) : 0,
      avgMaxMultiplier: totals.avgMaxMultiplier ?? 0,
      bestMultiplier: totals.bestMultiplier ?? 0,
    },
    community,
  };
}

// --- badges ---

/** Award a badge; returns true if it was newly earned. */
export function awardBadge(userId, badgeId) {
  const r = db
    .prepare(`INSERT OR IGNORE INTO badges (user_id, badge_id, earned_at) VALUES (?, ?, ?)`)
    .run(userId, badgeId, Date.now());
  return r.changes > 0;
}

export const userBadges = (userId) =>
  db
    .prepare(`SELECT badge_id AS id, earned_at AS earnedAt FROM badges WHERE user_id = ? ORDER BY earned_at`)
    .all(userId);

/** Last N ranked runs, oldest first (profile score-history graph). */
export function scoreHistory(userId, limit = 40) {
  return db
    .prepare(
      `SELECT score, mode, created_at AS createdAt
       FROM scores WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, limit)
    .reverse();
}

/** Career aggregates used by cumulative badges and public profiles. */
export function userCareer(userId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS runs,
              COALESCE(SUM(kills), 0) AS totalKills,
              COALESCE(SUM(time_survived), 0) AS totalTime,
              COALESCE(MAX(time_survived), 0) AS bestTime,
              COALESCE(MAX(kills), 0) AS bestKills,
              COALESCE(MAX(score), 0) AS bestScore,
              COALESCE(MAX(max_multiplier), 0) AS bestMultiplier
       FROM scores WHERE user_id = ?`,
    )
    .get(userId);
}
