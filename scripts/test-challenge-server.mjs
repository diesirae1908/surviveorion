/**
 * Challenge links, server side (WS-1). Pure pieces first, then the real server
 * on a temp SQLite file with a temp dist/ holding the repo's index.html.
 * Covers: mint idempotent per pilot per day, 409 without a daily score, 401
 * signed out, resolve live / expired / self / unknown, masked blocked
 * callsign, switch off (every route inactive, /c/ bytes identical to /),
 * sub-switches, OG escaping and fail-safe, HEAD parity, event allowlist,
 * counters + admin day slice, rate limits.
 * Run: node scripts/test-challenge-server.mjs
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orion-challenge-"));
const dbPath = path.join(tmp, "orion.db");
const distDir = path.join(tmp, "dist");
fs.mkdirSync(distDir);
const INDEX_SRC = fs.readFileSync(path.join(root, "index.html"), "utf8");
fs.writeFileSync(path.join(distDir, "index.html"), INDEX_SRC);
process.env.ORION_DB = dbPath;
const ADMIN_KEY = "test-admin-key-" + crypto.randomBytes(6).toString("hex");
const ORIGIN = "https://dev.example.test";

const store = await import("../server/db.mjs");
const ch = await import("../server/challenge.mjs");
const { patrolDateStr } = await import("../server/patrolDate.mjs");
const { sanitizeCallsignForDisplay } = await import("../server/nickname.mjs");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const addDays = (d, n) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
};
const today = patrolDateStr();
const yesterday = addDays(today, -1);

// ---------- pure pieces ----------

check("alphabet is Crockford base32 (32 chars, no I L O U)", ch.CODE_ALPHABET.length === 32 && !/[ILOU]/.test(ch.CODE_ALPHABET) && new Set(ch.CODE_ALPHABET).size === 32);
{
  const codes = new Set();
  let ok = true;
  for (let i = 0; i < 500; i++) {
    const c = ch.newCode(crypto.randomBytes);
    if (c.length !== 7 || [...c].some((x) => !ch.CODE_ALPHABET.includes(x))) ok = false;
    codes.add(c);
  }
  check("newCode makes 7 Crockford characters, no repeats in 500", ok && codes.size === 500);
}
check("newCode uses the low 5 bits of each byte", ch.newCode(() => Uint8Array.from([0, 1, 31, 32, 33, 255, 8])) === "01Z01Z8");
check("normalizeCode is case-insensitive and strict", ch.normalizeCode("7kq2mxa") === "7KQ2MXA" && ch.normalizeCode("7KQ2MX") === null && ch.normalizeCode("7KQ2MXAB") === null && ch.normalizeCode("7KQ2MXI") === null && ch.normalizeCode("7KQ2MX!") === null && ch.normalizeCode(undefined) === null);
check("patrolNumberFor: epoch is #1", ch.patrolNumberFor("2026-07-14") === 1);
check("patrolNumberFor: known dates incl. both DST boundaries", ch.patrolNumberFor("2026-07-15") === 2 && ch.patrolNumberFor("2026-11-01") === 111 && ch.patrolNumberFor("2026-11-02") === 112 && ch.patrolNumberFor("2026-11-12") === 122 && ch.patrolNumberFor("2027-03-14") === 244 && ch.patrolNumberFor("2027-03-15") === 245);
check("patrolNumberFor: junk is null", ch.patrolNumberFor("nope") === null && ch.patrolNumberFor(undefined) === null);
check("challengeSwitch: off for null, disabled, and a missing param", !ch.challengeSwitch(null).on && !ch.challengeSwitch({ enabled: false, params: { mint: true } }).param("mint") && ch.challengeSwitch({ enabled: true, params: { mint: true } }).param("mint") && !ch.challengeSwitch({ enabled: true, params: {} }).param("ogMeta") && !ch.challengeSwitch({ enabled: true, params: { ogMeta: "true" } }).param("ogMeta"));
{
  const evil = { title: `<script>"x"&'</script>`, description: `a"b<c>&d'`, url: `https://x.test/c/AAAAAAA?"><img>` };
  const block = ch.challengeOgBlock(evil);
  check("OG block escapes <, >, quote, apostrophe and & in every value", !/<script|<img|<c>/.test(block) && block.includes("&lt;script&gt;&quot;x&quot;&amp;&#39;&lt;/script&gt;") && block.includes('content="a&quot;b&lt;c&gt;&amp;d&#39;"') && block.includes("&quot;&gt;&lt;img&gt;"));
  check("OG block keeps og:image 1200x630 and the canonical at the root", block.includes('content="https://surviveorion.com/og.png"') && block.includes('og:image:width" content="1200"') && block.includes('href="https://surviveorion.com/"'));
  const page = ch.withOgBlock(INDEX_SRC, block);
  check("withOgBlock swaps the block and keeps the rest of the page", page.includes("&lt;script&gt;") && !page.includes("ORION: a daily survival patrol") && page.includes('<canvas id="game">') && page.includes("</head>"));
  const noEnd = INDEX_SRC.replace(ch.OG_END, "");
  const noStart = INDEX_SRC.replace(ch.OG_START, "");
  const reversed = INDEX_SRC.replace(ch.OG_START, "@@").replace(ch.OG_END, ch.OG_START).replace("@@", ch.OG_END);
  check("withOgBlock is fail-safe: a missing or reversed marker returns the page untouched", ch.withOgBlock(noEnd, block) === noEnd && ch.withOgBlock(noStart, block) === noStart && ch.withOgBlock(reversed, block) === reversed);
}
check("index.html has both markers exactly once", INDEX_SRC.split(ch.OG_START).length === 2 && INDEX_SRC.split(ch.OG_END).length === 2 && INDEX_SRC.indexOf(ch.OG_START) < INDEX_SRC.indexOf("og:title") && INDEX_SRC.indexOf(ch.OG_END) > INDEX_SRC.indexOf("twitter:image"));
{
  const builtIndex = path.join(root, "dist", "index.html");
  if (fs.existsSync(builtIndex)) {
    const built = fs.readFileSync(builtIndex, "utf8");
    check("dist/index.html (built) still has both markers", built.includes(ch.OG_START) && built.includes(ch.OG_END));
  }
}

// ---------- seed (through the store, not the API) ----------

const mkUser = (callsign) => {
  const u = store.createUser({ callsign, country: "CA" });
  const token = crypto.randomBytes(24).toString("hex");
  store.createSession(u.id, token);
  return { id: u.id, token, callsign };
};
const fly = (u, score, date) =>
  store.insertScore(u.id, { score, timeSurvived: 60, kills: 10, maxMultiplier: 3, mode: "desktop", gameMode: "classic", dailyDate: date });
const BAD = "Suck my nuts dev";
const glint = mkUser("GLINT");
const noScore = mkUser("NoScoreYet");
const bad = mkUser(BAD);
const oldPilot = mkUser("YesterdayPilot");
const minter = mkUser("MintSpam");
const viewer = mkUser("Viewer");
fly(glint, 1000, today);
fly(glint, 1463185, today);
fly(glint, 900, yesterday);
fly(bad, 5000, today);
fly(oldPilot, 7777, yesterday);
fly(minter, 10, today);
// links minted through the store: expired, challenger with no score, blocked callsign
const EXPIRED = store.mintChallenge(oldPilot.id, yesterday, () => "EXP1RED");
const NOSCORE = store.mintChallenge(noScore.id, today, () => "N0SC0RE");
const BADCODE = store.mintChallenge(bad.id, today, () => "BADB0Y5");
// the store stays open: one later check adds a score while the server runs

const MASK = sanitizeCallsignForDisplay(BAD);
check("fixture: the blocked callsign really masks", MASK !== BAD);

// ---------- server ----------

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
    s.on("error", reject);
  });

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(root, "server", "index.mjs")], {
    env: {
      ...process.env,
      ORION_DB: dbPath,
      PORT: String(port),
      ORION_SERVE_DIST: "1",
      ORION_DIST: distDir,
      ORION_PUBLIC_ORIGIN: ORIGIN + "/",
      ORION_ADMIN_KEY: ADMIN_KEY,
      ORION_FLAGS_SAME_DAY: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server start timeout")), 8000);
    let buf = "";
    child.stdout.on("data", (c) => {
      buf += c.toString();
      if (buf.includes("Orion server on")) {
        clearTimeout(t);
        resolve();
      }
    });
    child.stderr.on("data", (c) => (buf += c.toString()));
    child.on("exit", (code) => {
      clearTimeout(t);
      reject(new Error(`server exited ${code}: ${buf}`));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const call = async (method, url, { body, token, admin } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (admin) headers.Authorization = `Bearer ${ADMIN_KEY}`;
    else if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(origin + url, { method, headers, body: body !== undefined && method !== "GET" && method !== "HEAD" ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const page = async (method, url) => {
    const res = await fetch(origin + url, { method });
    return { status: res.status, headers: res.headers, text: await res.text() };
  };
  return { child, call, page };
}

const peek = async (sql, ...args) => {
  const { DatabaseSync } = await import("node:sqlite");
  const d = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return d.prepare(sql).all(...args);
  } finally {
    d.close();
  }
};

let srv;
try {
  srv = await startServer();
  const { call, page } = srv;
  const setSwitch = (enabled, params = {}) =>
    call("POST", "/api/admin/flags", { admin: true, body: { key: "ui.challenge", enabled, effectiveFrom: today, params, note: "test" } });

  // --- switch default off: everything inactive, bytes identical ---
  const home = await page("GET", "/");
  check("fixture: / serves the built page", home.status === 200 && home.text === INDEX_SRC);
  const off1 = await call("POST", "/api/challenge", { token: glint.token });
  check("OFF (default): mint answers {active:false} and writes nothing", off1.status === 200 && off1.body.active === false && (await peek(`SELECT COUNT(*) AS c FROM challenge_links WHERE user_id = ?`, glint.id))[0].c === 0);
  const offR = await call("GET", `/api/challenge/${BADCODE}`);
  check("OFF: resolve answers {active:false}", offR.status === 200 && offR.body.active === false && !("callsign" in offR.body));
  const offE = await call("POST", `/api/challenge/${BADCODE}/event`, { body: { step: "opened" } });
  check("OFF: events are dropped with 200 {ok:true}", offE.status === 200 && offE.body.ok === true && (await peek(`SELECT opens FROM challenge_links WHERE code = ?`, BADCODE))[0].opens === 0);
  const offP = await page("GET", `/c/${BADCODE}`);
  check("OFF: /c/<code> is byte-identical to /", offP.status === 200 && offP.text === home.text && offP.headers.get("content-type") === "text/html");

  // --- switch ON ---
  const on = await setSwitch(true);
  check("admin ON row for today is accepted (client kind, same-day)", on.status === 200 && on.body.ok === true, JSON.stringify(on.body));
  check("the row stores all six sub-switches true", on.body.row && Object.keys(on.body.row.params).length === 6 && Object.values(on.body.row.params).every((v) => v === true));

  const anon = await call("POST", "/api/challenge");
  check("signed out: mint is 401", anon.status === 401);
  const noSc = await call("POST", "/api/challenge", { token: noScore.token });
  check("no daily score today: mint is 409", noSc.status === 409 && noSc.body.error === "no daily score today");
  const m1 = await call("POST", "/api/challenge", { token: glint.token });
  const m2 = await call("POST", "/api/challenge", { token: glint.token });
  const CODE = m1.body.code;
  check("mint returns code, url, date, number and the best daily score", m1.status === 200 && m1.body.active === true && /^[0-9A-HJKMNP-TV-Z]{7}$/.test(CODE) && m1.body.url === `${ORIGIN}/c/${CODE}` && m1.body.patrolDate === today && m1.body.patrolNumber === ch.patrolNumberFor(today) && m1.body.score === 1463185, JSON.stringify(m1.body));
  check("mint is idempotent per pilot per day (same code, one row)", m2.body.code === CODE && (await peek(`SELECT COUNT(*) AS c FROM challenge_links WHERE user_id = ?`, glint.id))[0].c === 1);
  check("the link row stores no score and no callsign", Object.keys((await peek(`SELECT * FROM challenge_links WHERE code = ?`, CODE))[0]).every((k) => !/score|callsign/.test(k)));

  // resolve
  const rLive = await call("GET", `/api/challenge/${CODE.toLowerCase()}`);
  check("resolve live (lowercase code works): callsign, score, date, number, no extras", rLive.status === 200 && rLive.body.active === true && rLive.body.status === "live" && rLive.body.self === false && rLive.body.callsign === "GLINT" && rLive.body.score === 1463185 && rLive.body.patrolDate === today && rLive.body.patrolNumber === ch.patrolNumberFor(today) && Object.keys(rLive.body).sort().join() === "active,callsign,patrolDate,patrolNumber,score,self,status", JSON.stringify(rLive.body));
  check("resolve never leaks the user id, country or rank", !/userId|user_id|country|rank/i.test(JSON.stringify(rLive.body)));
  check("resolve self: true only for the challenger's own session", (await call("GET", `/api/challenge/${CODE}`, { token: glint.token })).body.self === true && (await call("GET", `/api/challenge/${CODE}`, { token: viewer.token })).body.self === false);
  const rExp = await call("GET", `/api/challenge/${EXPIRED}`);
  check("resolve expired: status expired with the old date and score", rExp.status === 200 && rExp.body.status === "expired" && rExp.body.patrolDate === yesterday && rExp.body.score === 7777 && rExp.body.patrolNumber === ch.patrolNumberFor(yesterday), JSON.stringify(rExp.body));
  check("resolve unknown code, malformed code, and challenger without a score: 404", (await call("GET", "/api/challenge/ZZZZZZZ")).status === 404 && (await call("GET", "/api/challenge/short")).status === 404 && (await call("GET", `/api/challenge/${NOSCORE}`)).status === 404);
  const rBad = await call("GET", `/api/challenge/${BADCODE}`);
  check("blocked legacy callsign comes back masked", rBad.status === 200 && rBad.body.callsign === MASK && !JSON.stringify(rBad.body).includes(BAD), rBad.body.callsign);
  const hiPage = await call("GET", "/api/challenge/");
  check("no code at all is not a route match", hiPage.status === 404);

  // score is live, not frozen into the link
  fly(glint, 1500000, today);
  check("resolve reads the live best daily score", (await call("GET", `/api/challenge/${CODE}`)).body.score === 1500000);

  // /c/ page
  const pLive = await page("GET", `/c/${CODE}`);
  check("/c/<code> live: 200 html with GLINT's number in og:title and the challenge og:url", pLive.status === 200 && pLive.headers.get("content-type") === "text/html" && pLive.headers.get("cache-control") === "no-cache" && pLive.text.includes(`<meta property="og:title" content="Beat GLINT&#39;s 1,500,000 on ORION Patrol #${ch.patrolNumberFor(today)}" />`) && pLive.text.includes(`og:url" content="${ORIGIN}/c/${CODE}"`));
  check("/c/<code>: rest of the page is the same app shell, and / is untouched", pLive.text.includes('<script type="module" src="/src/main.ts">') && (await page("GET", "/")).text === home.text);
  check("Content-Length matches the body", Number(pLive.headers.get("content-length")) === Buffer.byteLength(pLive.text));
  const pTrail = await page("GET", `/c/${CODE.toLowerCase()}/`);
  check("/c/<code>/ (trailing slash, lowercase) works too", pTrail.text.includes("Beat GLINT"));
  const pExp = await page("GET", `/c/${EXPIRED}`);
  check("expired code: title says flew, description says the patrol is closed", pExp.text.includes(`YesterdayPilot flew 7,777 on ORION Patrol #${ch.patrolNumberFor(yesterday)}`) && pExp.text.includes("That patrol is closed."));
  const pBad = await page("GET", `/c/${BADCODE}`);
  check("/c/ page masks a blocked callsign everywhere", pBad.text.includes(`Beat ${MASK}&#39;s 5,000`) && !pBad.text.includes(BAD));
  for (const [label, url] of [["unknown code", "/c/ZZZZZZZ"], ["no-score challenger", `/c/${NOSCORE}`], ["wrong length", "/c/ABC"], ["bad characters", "/c/ILOU123"]]) {
    const r = await page("GET", url);
    check(`/c/ ${label}: never a 404, serves the plain page`, r.status === 200 && r.text === home.text);
  }
  const head = await page("HEAD", `/c/${CODE}`);
  check("HEAD /c/<code>: same headers as GET, empty body", head.status === 200 && head.text === "" && head.headers.get("content-type") === pLive.headers.get("content-type") && head.headers.get("content-length") === pLive.headers.get("content-length") && head.headers.get("cache-control") === "no-cache");

  // events
  const ev = async (step, code = CODE) => call("POST", `/api/challenge/${code}/event`, { body: { step } });
  const stepCols = { shared: "shares", opened: "opens", opened_new: "opens_new", flew: "flights", beat: "beats", lost: "losses", back: "backs" };
  let evOk = true;
  for (const step of Object.keys(stepCols)) evOk = evOk && (await ev(step)).status === 200;
  const row = (await peek(`SELECT * FROM challenge_links WHERE code = ?`, CODE))[0];
  check("each event step bumps exactly its own counter by one", evOk && Object.values(stepCols).every((c) => row[c] === 1));
  const bogus = await ev("hacked");
  const noBody = await call("POST", `/api/challenge/${CODE}/event`, { body: {} });
  check("unknown or missing step is rejected 400 and writes nothing", bogus.status === 400 && noBody.status === 400 && (await peek(`SELECT opens FROM challenge_links WHERE code = ?`, CODE))[0].opens === 1);
  const unk = await ev("opened", "ZZZZZZZ");
  check("event for an unknown code is 200 and writes nothing", unk.status === 200 && unk.body.ok === true && (await peek(`SELECT SUM(opens) AS s FROM challenge_links`))[0].s === 1);
  await ev("opened", CODE.toLowerCase());
  check("event accepts a lowercase code", (await peek(`SELECT opens FROM challenge_links WHERE code = ?`, CODE))[0].opens === 2);

  // admin day slice
  const stats = await call("GET", "/api/admin/stats", { admin: true });
  const c = stats.body.day?.challenge;
  check("admin stats day slice carries the challenge counters", stats.status === 200 && c && c.on === true && c.minted === 3 && c.shared === 1 && c.opened === 2 && c.openedNew === 1 && c.flew === 1 && c.beat === 1 && c.lost === 1 && c.back === 1 && c.patrolNumber === ch.patrolNumberFor(today), JSON.stringify(c));

  // sub-switches: any piece can be turned off alone
  await setSwitch(true, { mint: false });
  const noMint = await call("POST", "/api/challenge", { token: glint.token });
  check("mint=false: no new links, resolve still works", noMint.body.active === false && (await call("GET", `/api/challenge/${CODE}`)).body.active === true);
  await setSwitch(true, { ogMeta: false });
  check("ogMeta=false: /c/ serves the plain page, mint works again", (await page("GET", `/c/${CODE}`)).text === home.text && (await call("POST", "/api/challenge", { token: glint.token })).body.code === CODE);
  await setSwitch(true, { lobbyBanner: false });
  check("a client-only sub-switch off leaves the server layer as is", (await page("GET", `/c/${CODE}`)).text.includes("Beat GLINT"));

  // emergency off
  await setSwitch(false);
  const offR2 = await call("GET", `/api/challenge/${CODE}`);
  const offP2 = await page("GET", `/c/${CODE}`);
  check("OFF row (emergency path): resolve inactive, /c/ plain, mint inactive, events dropped", offR2.body.active === false && offP2.text === home.text && (await call("POST", "/api/challenge", { token: glint.token })).body.active === false && (await ev("shared")).status === 200 && (await peek(`SELECT shares FROM challenge_links WHERE code = ?`, CODE))[0].shares === 1);
  check("OFF: the admin day slice reports off but keeps the counters", (await call("GET", "/api/admin/stats", { admin: true })).body.day.challenge.on === false);

  // rate limits (last: they exhaust per-IP buckets)
  await setSwitch(true);
  const mintCodes = [];
  let mintRes;
  for (let i = 0; i < 11; i++) {
    mintRes = await call("POST", "/api/challenge", { token: minter.token });
    mintCodes.push(mintRes.status);
  }
  check("mint limit: 10 per minute per pilot, the 11th is 429", mintCodes.slice(0, 10).every((s) => s === 200) && mintCodes[10] === 429, mintCodes.join());
  check("mint limit is per pilot (another pilot is unaffected)", (await call("POST", "/api/challenge", { token: glint.token })).status === 200);

  let evStatuses = [];
  for (let i = 0; i < 40; i++) evStatuses.push((await ev("opened")).status);
  const first429 = evStatuses.indexOf(429);
  check("event limit: 30 per minute per IP, then 429", first429 > 0 && first429 <= 30 && evStatuses.slice(first429).every((s) => s === 429), `first 429 at ${first429}`);

  let resStatuses = [];
  for (let i = 0; i < 70; i++) resStatuses.push((await call("GET", `/api/challenge/${CODE}`)).status);
  const r429 = resStatuses.indexOf(429);
  check("resolve limit: 60 per minute per IP, then 429", r429 > 0 && r429 <= 60 && resStatuses.slice(r429).every((s) => s === 429), `first 429 at ${r429}`);

  let pageStatuses = [];
  let lastPlain = true;
  for (let i = 0; i < 70; i++) {
    const r = await page("GET", `/c/${CODE}`);
    pageStatuses.push(r.status);
    if (i >= 65) lastPlain = lastPlain && r.text === home.text;
  }
  check("/c/ over its limit never 429s a human: still 200, falls back to the plain page", pageStatuses.every((s) => s === 200) && lastPlain);
} finally {
  if (srv) srv.child.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll challenge server checks passed");
