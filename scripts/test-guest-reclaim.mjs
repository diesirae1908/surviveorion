/**
 * ORION-SEC-02: pre-lock guest reclaim needs a matching session.
 * Run: node scripts/test-guest-reclaim.mjs
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orion-guest-"));
const dbPath = path.join(tmp, "orion.db");
process.env.ORION_DB = dbPath;

const store = await import("../server/db.mjs");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const legacy = store.createUser({ callsign: "LegacyPilot", country: "CA" });
check("pre-lock guest has null secret", legacy.guest_secret_hash == null);
const sessionToken = crypto.randomBytes(32).toString("hex");
store.createSession(legacy.id, sessionToken);

const other = store.createUser({ callsign: "OtherPilot", country: "US" });
const otherToken = crypto.randomBytes(32).toString("hex");
store.createSession(other.id, otherToken);

const lockedSecret = crypto.randomBytes(32).toString("hex");
const lockedHash = crypto.createHash("sha256").update(lockedSecret).digest("hex");
const locked = store.createUser({
  callsign: "LockedPilot",
  country: "CA",
  guestSecretHash: lockedHash,
});

store.db.close();

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
  env: {
    ...process.env,
    ORION_DB: dbPath,
    PORT: String(port),
    ORION_SERVE_DIST: "",
    ORION_PREMIUM_SANDBOX: "",
  },
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

  async function postGuest({ callsign, country = "CA", guestSecret, token }) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${origin}/api/auth/guest`, {
      method: "POST",
      headers,
      body: JSON.stringify({ callsign, country, guestSecret }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }

  const noSession = await postGuest({ callsign: "LegacyPilot" });
  check(
    "pre-lock guest without session is 409",
    noSession.status === 409 && noSession.body.error === "that callsign is taken, pick another name",
    JSON.stringify(noSession),
  );

  const { DatabaseSync } = await import("node:sqlite");
  const peek = new DatabaseSync(dbPath, { readOnly: true });
  const afterNoSession = peek.prepare(`SELECT guest_secret_hash AS h FROM users WHERE id = ?`).get(legacy.id);
  check("409 does not bind a secret", afterNoSession.h == null);
  peek.close();

  const wrongSession = await postGuest({ callsign: "LegacyPilot", token: otherToken });
  check(
    "pre-lock guest with another user's session is 409",
    wrongSession.status === 409 && wrongSession.body.error === "that callsign is taken, pick another name",
  );

  const withSession = await postGuest({ callsign: "LegacyPilot", token: sessionToken });
  check(
    "pre-lock guest with matching session binds a secret",
    withSession.status === 200 &&
      typeof withSession.body.guestSecret === "string" &&
      withSession.body.guestSecret.length >= 32 &&
      withSession.body.existing === true,
    JSON.stringify(withSession.body),
  );

  const peek2 = new DatabaseSync(dbPath, { readOnly: true });
  const afterBind = peek2.prepare(`SELECT guest_secret_hash AS h FROM users WHERE id = ?`).get(legacy.id);
  check("matching session wrote guest_secret_hash", typeof afterBind.h === "string" && afterBind.h.length === 64);
  peek2.close();

  const second = await postGuest({ callsign: "LegacyPilot", token: sessionToken });
  check(
    "second bind without the new secret is 409",
    second.status === 409 && second.body.error === "that callsign is taken, pick another name",
  );

  const reclaim = await postGuest({
    callsign: "LegacyPilot",
    guestSecret: withSession.body.guestSecret,
  });
  check("reclaim with bound secret is 200", reclaim.status === 200 && reclaim.body.existing === true);

  const lockedOk = await postGuest({ callsign: "LockedPilot", guestSecret: lockedSecret });
  check("locked guest with secret is 200", lockedOk.status === 200 && lockedOk.body.existing === true);

  const lockedNo = await postGuest({ callsign: "LockedPilot" });
  check("locked guest without secret is 409", lockedNo.status === 409);

  const fresh = await postGuest({ callsign: "BrandNewPilot" });
  check(
    "new guest still mints a secret",
    fresh.status === 200 && fresh.body.existing === false && typeof fresh.body.guestSecret === "string",
  );
} finally {
  child.kill("SIGTERM");
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("PASS  pre-lock guest reclaim requires matching session");
