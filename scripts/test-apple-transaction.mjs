/**
 * ORION-SEC-03: one Apple originalTransactionId unlocks one Orion account.
 * Run: node scripts/test-apple-transaction.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.ORION_DB = ":memory:";

const store = await import("../server/db.mjs");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const a = store.createUser({ callsign: "AppleA" });
const b = store.createUser({ callsign: "AppleB" });
const first = store.claimAppleOriginalTransaction("orig-tx-1", a.id);
check("first claim succeeds", first.ok === true);
const renew = store.claimAppleOriginalTransaction("orig-tx-1", a.id);
check("same user renewal succeeds", renew.ok === true);
const stolen = store.claimAppleOriginalTransaction("orig-tx-1", b.id);
check("second account is TRANSACTION_IN_USE", stolen.ok === false && stolen.code === "TRANSACTION_IN_USE");
check(
  "empty original id is rejected",
  store.claimAppleOriginalTransaction("", a.id).code === "MISSING_TRANSACTION",
);
const tokenA = store.ensureAppleAccountToken(a.id);
const tokenA2 = store.ensureAppleAccountToken(a.id);
check("apple account token is a uuid", /^[0-9a-f-]{36}$/i.test(tokenA));
check("apple account token is stable", tokenA === tokenA2);
check("other user gets a different token", store.ensureAppleAccountToken(b.id) !== tokenA);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orion-apple-tx-"));
const dbPath = path.join(tmp, "orion.db");

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
    ORION_PREMIUM_SANDBOX: "1",
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

  async function guest(callsign) {
    const res = await fetch(`${origin}/api/auth/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callsign, country: "CA" }),
    });
    const body = await res.json();
    if (res.status !== 200) throw new Error(`guest ${callsign} ${res.status} ${JSON.stringify(body)}`);
    return body.token;
  }

  const tokA = await guest("TxPilotA");
  const tokB = await guest("TxPilotB");
  const payload = {
    productId: "com.surviveorion.app.premium.monthly",
    expiresDate: Date.now() + 30 * 86_400_000,
    transactionId: "tx-shared",
    originalTransactionId: "orig-shared",
  };

  async function postPremium(token, extra = {}) {
    const res = await fetch(`${origin}/api/me/premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...payload, ...extra }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  const firstHttp = await postPremium(tokA);
  check(
    "user A applying a sandbox transaction is 200",
    firstHttp.status === 200 && firstHttp.body.ok === true && firstHttp.body.premiumActive === true,
    JSON.stringify(firstHttp),
  );

  const replay = await postPremium(tokB);
  check(
    "user B replaying the same originalTransactionId is 409",
    replay.status === 409 && replay.body.code === "TRANSACTION_IN_USE",
    JSON.stringify(replay),
  );

  const renewHttp = await postPremium(tokA, { expiresDate: Date.now() + 60 * 86_400_000 });
  check(
    "user A renewal with the same originalTransactionId is 200",
    renewHttp.status === 200 && renewHttp.body.ok === true,
    JSON.stringify(renewHttp),
  );
} finally {
  child.kill("SIGTERM");
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("PASS  Apple originalTransactionId is bound to one account");
