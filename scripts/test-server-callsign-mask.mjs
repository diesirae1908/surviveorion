/**
 * Display-time callsign masking: a stored blocked callsign (legacy row, no DB
 * write) must come out masked on every public board route, and a masked
 * pilot must not be reachable by the original text.
 * Run: node scripts/test-server-callsign-mask.mjs
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orion-mask-"));
const dbPath = path.join(tmp, "orion.db");
process.env.ORION_DB = dbPath;

const store = await import("../server/db.mjs");
const { patrolDateStr } = await import("../server/patrolDate.mjs");
const { sanitizeCallsignForDisplay } = await import("../server/nickname.mjs");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const BAD = "Suck my nuts dev";
const GOOD = "CleanPilot";
const today = patrolDateStr();

const bad = store.createUser({ callsign: BAD, country: "CA" });
const good = store.createUser({ callsign: GOOD, country: "CA" });
const badToken = crypto.randomBytes(32).toString("hex");
const goodToken = crypto.randomBytes(32).toString("hex");
store.createSession(bad.id, badToken);
store.createSession(good.id, goodToken);
for (const u of [bad, good]) {
  store.insertScore(u.id, { score: 5000, timeSurvived: 60, kills: 10, maxMultiplier: 3, mode: "desktop", gameMode: "classic" });
  store.insertScore(u.id, { score: 4000, timeSurvived: 50, kills: 8, maxMultiplier: 3, mode: "desktop", gameMode: "classic", dailyDate: today });
}
// wingmates, so the friends routes carry the blocked callsign
store.requestFriend(bad.id, good.id);
store.acceptFriend(good.id, bad.id);
// a shared arena
const arena = store.createArena(good.id, "Mask Test", "MASKT1");
store.joinArena(arena.id, bad.id);
store.db.close();

const MASK = sanitizeCallsignForDisplay(BAD);

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
    s.on("error", reject);
  });
}

const port = await freePort();
const child = spawn(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server", "index.mjs")], {
  env: { ...process.env, ORION_DB: dbPath, PORT: String(port), ORION_SERVE_DIST: "", ORION_PREMIUM_SANDBOX: "" },
  stdio: ["ignore", "pipe", "pipe"],
});

function waitForListen() {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server start timeout")), 8000);
    let buf = "";
    child.stdout.on("data", (c) => {
      buf += c.toString();
      if (buf.includes("Orion server on")) {
        clearTimeout(t);
        resolve();
      }
    });
    child.stderr.on("data", (c) => {
      buf += c.toString();
    });
    child.on("exit", (code) => {
      clearTimeout(t);
      reject(new Error(`server exited ${code}: ${buf}`));
    });
  });
}

try {
  await waitForListen();
  const origin = `http://127.0.0.1:${port}`;
  const get = async (p, token) => {
    const res = await fetch(origin + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text || "{}") };
  };
  const post = async (p, token, payload) => {
    const res = await fetch(origin + p, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text || "{}") };
  };

  // every board route, as the clean pilot (a different viewer than the owner)
  const routes = [
    "/api/leaderboard/world?mode=desktop",
    "/api/leaderboard/daily?mode=desktop",
    "/api/leaderboard/daily?mode=all",
    `/api/arenas/${arena.code}/leaderboard?mode=desktop`,
    "/api/friends",
    "/api/friends/leaderboard?mode=desktop",
    `/api/friends/leaderboard?date=${today}`,
    "/api/friends/activity",
  ];
  for (const r of routes) {
    const out = await get(r, goodToken);
    check(`${r} responds 200`, out.status === 200, `status ${out.status}`);
    check(`${r} never carries the stored callsign`, !out.text.includes(BAD), out.text.slice(0, 160));
    check(`${r} carries the stable alias`, out.text.includes(MASK) || r.includes("activity"), "");
  }
  const anon = await get("/api/leaderboard/world?mode=desktop");
  check("world board masks for anonymous viewers", !anon.text.includes(BAD) && anon.text.includes(MASK));
  check("clean callsigns stay visible", anon.text.includes(GOOD));

  // profile lookup: original text of a masked name is a 404 for others
  const byOriginal = await get(`/api/players/${encodeURIComponent(BAD)}`, goodToken);
  check("masked pilot is not found by original text", byOriginal.status === 404, `status ${byOriginal.status}`);
  const byOriginalAnon = await get(`/api/players/${encodeURIComponent(BAD)}`);
  check("masked pilot is not found by original text (anonymous)", byOriginalAnon.status === 404);
  const ownProfile = await get(`/api/players/${encodeURIComponent(BAD)}`, badToken);
  check("owner still resolves own profile", ownProfile.status === 200);
  const cleanProfile = await get(`/api/players/${GOOD}`, badToken);
  check("clean pilot profile still resolves", cleanProfile.status === 200 && cleanProfile.body.callsign === GOOD);
  const friendByOriginal = await post("/api/friends/request", goodToken, { callsign: BAD });
  check("friend request by masked original text is a 404", friendByOriginal.status === 404, `status ${friendByOriginal.status}`);

  // owner view unchanged: they see (and can change) their real callsign
  const me = await get("/api/me", badToken);
  check("/api/me still shows the owner their own callsign", me.body.user?.callsign === BAD);
} finally {
  child.kill();
}

if (failures > 0) {
  console.error(`\n${failures} callsign-mask check(s) FAILED.`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED: callsign masking on boards, friends, arenas, profile lookup.");
