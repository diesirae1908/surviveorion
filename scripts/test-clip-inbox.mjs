/**
 * Clip inbox: Lucas-only upload, secret HTTPS list/fetch, consume flag.
 * Run: node scripts/test-clip-inbox.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orion-inbox-"));
process.env.CLIP_INBOX_DIR = tmp;
process.env.CLIP_INBOX_SECRET = "test-secret-32-chars-long-ok-ok";
process.env.CLIP_INBOX_CALLSIGN = "Lucas";
process.env.CLIP_INBOX_GOOGLE_SUB = "google-sub-lucas";

const inbox = await import("../server/clip-inbox.mjs");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const sidecar = {
  day: 48,
  mutatorIds: ["gold-dash"],
  mutatorNames: ["GOLD DASH"],
  score: 12000,
  medal: "copper",
  survivalTime: 41.2,
  deathTime: 41.2,
  closestCall: { time: 12, x: 1, y: 2, clearance: 0.08 },
  topGrazes: [{ time: 12, clearance: 0.08 }],
  powers: [{ id: "pulse", name: "Pulse Shot", time: 8.5 }],
  events: [
    { type: "mutator", time: 0, ids: ["gold-dash"], names: ["GOLD DASH"] },
    { type: "power", time: 8.5, id: "pulse", name: "Pulse Shot" },
    { type: "death", time: 41.2, score: 12000 },
  ],
  track: [[0, 0, 0]],
  arena: { w: 17.8, h: 10 },
  view: { w: 1280, h: 720 },
};
const basename = "orion_2026-08-29_day48_gold-dash_12000";
const video = Buffer.from("webm-fake-bytes-not-a-real-file");

const meta = inbox.savePair({
  basename,
  sidecarJson: JSON.stringify(sidecar),
  video,
  ext: "webm",
});
check("savePair writes pending meta", meta.id === basename && meta.consumed === false);
check("pending lists the pair", inbox.listPending().length === 1);
check("pending id matches", inbox.listPending()[0].id === basename);

const file = inbox.resolveInboxFile(basename, `${basename}.webm`);
check("resolve video", !!file && fs.readFileSync(file).equals(video));
check("reject path traversal", inbox.resolveInboxFile(basename, "../etc/passwd") === null);
check("reject mismatched id", inbox.resolveInboxFile("nope", `${basename}.webm`) === null);

check("stranger cannot upload", inbox.clipInboxAllowed({ callsign: "Pilot", google_sub: "x" }) === false);
check("callsign allowlist", inbox.clipInboxAllowed({ callsign: "Lucas" }) === true);
check("callsign allowlist is case-insensitive", inbox.clipInboxAllowed({ callsign: "LUCAS" }) === true);
check("google_sub allowlist", inbox.clipInboxAllowed({ callsign: "Other", google_sub: "google-sub-lucas" }) === true);
{
  const prevSub = process.env.CLIP_INBOX_GOOGLE_SUB;
  const prevSign = process.env.CLIP_INBOX_CALLSIGN;
  process.env.CLIP_INBOX_GOOGLE_SUB = "";
  process.env.CLIP_INBOX_CALLSIGN = "luciux";
  check("luciux matches LUCIUX", inbox.clipInboxAllowed({ callsign: "LUCIUX" }) === true);
  check("other callsign stays out", inbox.clipInboxAllowed({ callsign: "Haribro" }) === false);
  process.env.CLIP_INBOX_CALLSIGN = "";
  check("empty allowlist is fail-closed", inbox.clipInboxAllowed({ callsign: "LUCIUX", google_sub: "anyone" }) === false);
  process.env.CLIP_INBOX_GOOGLE_SUB = prevSub;
  process.env.CLIP_INBOX_CALLSIGN = prevSign;
}
check("wrong secret rejected", inbox.inboxSecretOk("nope") === false);
check("right secret accepted", inbox.inboxSecretOk("test-secret-32-chars-long-ok-ok") === true);

check("consume moves out of pending", inbox.consumeClip(basename) === true);
check("pending empty after consume", inbox.listPending().length === 0);
check("consumed file still readable", !!inbox.resolveInboxFile(basename, `${basename}.json`));
check("consume never deletes json", fs.existsSync(inbox.resolveInboxFile(basename, `${basename}.json`)));
check("second consume fails", inbox.consumeClip(basename) === false);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (await inbox.handleClipInboxPublic(req, res, url)) return;
  if (req.method === "POST" && url.pathname === "/api/clip-inbox") {
    return inbox.handleClipInboxUpload(req, res, { callsign: "Lucas", google_sub: "google-sub-lucas" });
  }
  res.writeHead(404);
  res.end();
});
server.listen(0);
await once(server, "listening");
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;
const secret = process.env.CLIP_INBOX_SECRET;

const basename2 = "orion_2026-08-30_day49_the-pit_99";
const fd = new FormData();
fd.append("basename", basename2);
fd.append("sidecar", new Blob([JSON.stringify(sidecar)], { type: "application/json" }), `${basename2}.json`);
fd.append("video", new Blob([video], { type: "video/webm" }), `${basename2}.webm`);
const up = await fetch(`${origin}/api/clip-inbox`, { method: "POST", body: fd });
const upJson = await up.json();
check("multipart upload 200", up.status === 200, JSON.stringify(upJson));
check("upload returns id", upJson.id === basename2);

const listed = await (await fetch(`${origin}/clip-inbox/${secret}/`)).json();
check("secret index lists pending", listed.pending?.length === 1 && listed.pending[0].id === basename2);

const wrong = await fetch(`${origin}/clip-inbox/wrong-secret/`);
check("wrong secret 404", wrong.status === 404);

const vidRes = await fetch(`${origin}${listed.pending[0].videoUrl}`);
check("fetch video bytes", vidRes.status === 200 && Buffer.from(await vidRes.arrayBuffer()).equals(video));
check("video content-length", vidRes.headers.get("content-length") === String(video.length));

const consumed = await fetch(`${origin}/clip-inbox/${secret}/consumed`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: basename2 }),
});
const consumedJson = await consumed.json();
check("consume via HTTP", consumed.status === 200 && consumedJson.consumed === true);
const listedAfter = await (await fetch(`${origin}/clip-inbox/${secret}/`)).json();
check("index empty after consume", listedAfter.pending?.length === 0);

const still = await fetch(`${origin}/clip-inbox/${secret}/file/${basename2}.webm`);
check("consumed video still fetchable", still.status === 200);

const strangerServer = http.createServer(async (req, res) => {
  await inbox.handleClipInboxUpload(req, res, { callsign: "Stranger", google_sub: "nope" });
});
strangerServer.listen(0);
await once(strangerServer, "listening");
const sPort = strangerServer.address().port;
const fd2 = new FormData();
fd2.append("basename", "orion_2026-08-31_day50_classic_1");
fd2.append("sidecar", new Blob([JSON.stringify(sidecar)], { type: "application/json" }), "x.json");
fd2.append("video", new Blob([video], { type: "video/webm" }), "x.webm");
const denied = await fetch(`http://127.0.0.1:${sPort}/api/clip-inbox`, { method: "POST", body: fd2 });
check("non-Lucas upload 404", denied.status === 404);

server.close();
strangerServer.close();
fs.rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll clip-inbox checks passed.");
