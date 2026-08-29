// Lucas-only clip inbox: game POSTs a webm+json pair, Grok fetches over HTTPS.
// Bytes live on the Render persistent disk at /data (same volume as SQLite).
// Never deletes files: consume moves pending -> consumed.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLIP_INBOX_MAX_BYTES = 40 * 1024 * 1024;
const BASENAME_RE = /^orion_\d{4}-\d{2}-\d{2}_day\d+_[A-Za-z0-9+\-]+_\d+$/;
const FILE_RE = /^orion_\d{4}-\d{2}-\d{2}_day\d+_[A-Za-z0-9+\-]+_\d+\.(webm|mp4|json)$/;

export function inboxRoot() {
  if (process.env.CLIP_INBOX_DIR) return process.env.CLIP_INBOX_DIR;
  const db = process.env.ORION_DB ?? "";
  if (db.startsWith("/data/")) return "/data/clip-inbox";
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "clip-inbox-data");
}

export function clipInboxAllowed(user) {
  if (!user) return false;
  const sub = process.env.CLIP_INBOX_GOOGLE_SUB ?? "";
  const callsign = process.env.CLIP_INBOX_CALLSIGN ?? "";
  if (sub && user.google_sub && user.google_sub === sub) return true;
  if (callsign && typeof user.callsign === "string" && user.callsign.toLowerCase() === callsign.toLowerCase())
    return true;
  return false;
}

export function inboxSecretOk(given) {
  const want = process.env.CLIP_INBOX_SECRET ?? "";
  if (!want || typeof given !== "string" || given.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

function pendingDir() {
  return path.join(inboxRoot(), "pending");
}
function consumedDir() {
  return path.join(inboxRoot(), "consumed");
}

export function ensureInboxDirs() {
  fs.mkdirSync(pendingDir(), { recursive: true });
  fs.mkdirSync(consumedDir(), { recursive: true });
}

function entryDir(kind, id) {
  const root = kind === "consumed" ? consumedDir() : pendingDir();
  return path.join(root, id);
}

export function listPending() {
  ensureInboxDirs();
  const ids = fs.readdirSync(pendingDir()).filter((n) => !n.startsWith("."));
  const pending = [];
  for (const id of ids) {
    const metaPath = path.join(pendingDir(), id, "meta.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (meta.consumed) continue;
      pending.push(meta);
    } catch {
      /* skip corrupt */
    }
  }
  pending.sort((a, b) => String(a.uploadedAt).localeCompare(String(b.uploadedAt)));
  return pending;
}

export function consumeClip(id) {
  if (!BASENAME_RE.test(id)) return false;
  const from = entryDir("pending", id);
  const to = entryDir("consumed", id);
  if (!fs.existsSync(from)) return false;
  ensureInboxDirs();
  if (fs.existsSync(to)) return false;
  const metaPath = path.join(from, "meta.json");
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    meta.consumed = true;
    meta.consumedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
  fs.renameSync(from, to);
  return true;
}

export function resolveInboxFile(id, filename) {
  if (!BASENAME_RE.test(id) || !FILE_RE.test(filename)) return null;
  if (!filename.startsWith(`${id}.`)) return null;
  for (const kind of ["pending", "consumed"]) {
    const file = path.join(entryDir(kind, id), filename);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
  });
  res.end(data);
}

export function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function indexOfBuf(buf, needle, from) {
  return buf.indexOf(needle, from);
}

/** Minimal multipart parser for basename + sidecar + video parts. */
export function parseMultipart(buf, contentType) {
  const bm = /boundary=(?:"([^"]+)"|([^;,\s]+))/i.exec(contentType || "");
  if (!bm) throw new Error("missing multipart boundary");
  const boundary = bm[1] || bm[2];
  const delim = Buffer.from(`\r\n--${boundary}`);
  const headDelim = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = 0;
  if (buf.subarray(0, headDelim.length).equals(headDelim)) start = 0;
  else {
    const i = indexOfBuf(buf, headDelim, 0);
    if (i < 0) throw new Error("invalid multipart");
    start = i;
  }
  const body = Buffer.concat([Buffer.from("\r\n"), buf.subarray(start)]);
  let pos = 0;
  while (pos < body.length) {
    const at = indexOfBuf(body, delim, pos);
    if (at < 0) break;
    const next = indexOfBuf(body, delim, at + delim.length);
    const chunk = next < 0 ? body.subarray(at + delim.length) : body.subarray(at + delim.length, next);
    pos = next < 0 ? body.length : next;
    if (chunk.subarray(0, 2).toString() === "--") break;
    const split = indexOfBuf(chunk, Buffer.from("\r\n\r\n"), 0);
    if (split < 0) continue;
    const header = chunk.subarray(0, split).toString("utf8");
    let data = chunk.subarray(split + 4);
    if (data.length >= 2 && data.subarray(data.length - 2).toString() === "\r\n") {
      data = data.subarray(0, data.length - 2);
    }
    const nameM = /name="([^"]+)"/.exec(header);
    if (!nameM) continue;
    const fileM = /filename="([^"]*)"/.exec(header);
    parts.push({ name: nameM[1], filename: fileM?.[1] ?? "", data });
  }
  return parts;
}

export function savePair({ basename, sidecarJson, video, ext }) {
  if (!BASENAME_RE.test(basename)) throw new Error("invalid basename");
  if (ext !== "webm" && ext !== "mp4") throw new Error("invalid video type");
  let sidecar;
  try {
    sidecar = JSON.parse(sidecarJson);
  } catch {
    throw new Error("invalid sidecar");
  }
  if (!sidecar || typeof sidecar !== "object") throw new Error("invalid sidecar");
  ensureInboxDirs();
  const dir = entryDir("pending", basename);
  fs.mkdirSync(dir, { recursive: true });
  const videoName = `${basename}.${ext}`;
  const jsonName = `${basename}.json`;
  fs.writeFileSync(path.join(dir, jsonName), JSON.stringify(sidecar));
  fs.writeFileSync(path.join(dir, videoName), video);
  const meta = {
    id: basename,
    video: videoName,
    json: jsonName,
    bytes: video.length,
    ext,
    uploadedAt: new Date().toISOString(),
    consumed: false,
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  return meta;
}

function serveFile(req, res, file) {
  const stat = fs.statSync(file);
  const ext = path.extname(file);
  const mime =
    ext === ".webm" ? "video/webm" : ext === ".mp4" ? "video/mp4" : ext === ".json" ? "application/json" : "application/octet-stream";
  const lastModified = stat.mtime.toUTCString();
  res.writeHead(200, {
    "Content-Type": mime,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Last-Modified": lastModified,
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

/**
 * Secret fetch/consume routes: /clip-inbox/:secret/...
 * Returns true if this request was handled.
 */
export async function handleClipInboxPublic(req, res, url) {
  const listM = /^\/clip-inbox\/([^/]+)\/?$/.exec(url.pathname);
  const fileM = /^\/clip-inbox\/([^/]+)\/file\/([^/]+)$/.exec(url.pathname);
  const consumedM = /^\/clip-inbox\/([^/]+)\/consumed$/.exec(url.pathname);
  if (!listM && !fileM && !consumedM) return false;

  const secret = (listM || fileM || consumedM)[1];
  if (!inboxSecretOk(secret)) {
    json(res, 404, { error: "not found" });
    return true;
  }

  if (listM && (req.method === "GET" || req.method === "HEAD")) {
    const pending = listPending().map((m) => ({
      id: m.id,
      videoUrl: `/clip-inbox/${secret}/file/${m.video}`,
      jsonUrl: `/clip-inbox/${secret}/file/${m.json}`,
      bytes: m.bytes,
      uploadedAt: m.uploadedAt,
      consumed: false,
    }));
    json(res, 200, { pending });
    return true;
  }

  if (fileM && (req.method === "GET" || req.method === "HEAD")) {
    const filename = fileM[2];
    const id = filename.replace(/\.(webm|mp4|json)$/, "");
    const file = resolveInboxFile(id, filename);
    if (!file) {
      json(res, 404, { error: "not found" });
      return true;
    }
    serveFile(req, res, file);
    return true;
  }

  if (consumedM && req.method === "POST") {
    let body = {};
    try {
      const raw = await readRawBody(req, 64 * 1024);
      body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    } catch {
      json(res, 400, { error: "invalid json" });
      return true;
    }
    const id = body.id;
    if (typeof id !== "string" || !consumeClip(id)) {
      json(res, 400, { error: "cannot consume" });
      return true;
    }
    json(res, 200, { ok: true, id, consumed: true });
    return true;
  }

  json(res, 405, { error: "method not allowed" });
  return true;
}

/** POST /api/clip-inbox (session + allowlist already checked by caller). */
export async function handleClipInboxUpload(req, res, user) {
  if (!clipInboxAllowed(user)) {
    json(res, 404, { error: "not found" });
    return;
  }
  const ct = String(req.headers["content-type"] ?? "");
  if (!ct.toLowerCase().includes("multipart/form-data")) {
    json(res, 400, { error: "expected multipart" });
    return;
  }
  let buf;
  try {
    buf = await readRawBody(req, CLIP_INBOX_MAX_BYTES);
  } catch (e) {
    json(res, e?.message === "body too large" ? 413 : 400, { error: e?.message ?? "bad request" });
    return;
  }
  let parts;
  try {
    parts = parseMultipart(buf, ct);
  } catch (e) {
    json(res, 400, { error: e?.message ?? "invalid multipart" });
    return;
  }
  const basenamePart = parts.find((p) => p.name === "basename");
  const sidecarPart = parts.find((p) => p.name === "sidecar");
  const videoPart = parts.find((p) => p.name === "video");
  if (!basenamePart || !sidecarPart || !videoPart) {
    json(res, 400, { error: "need basename, sidecar, and video" });
    return;
  }
  const basename = basenamePart.data.toString("utf8").trim();
  const filename = videoPart.filename || "";
  const ext = filename.toLowerCase().endsWith(".mp4") ? "mp4" : "webm";
  try {
    const meta = savePair({
      basename,
      sidecarJson: sidecarPart.data.toString("utf8"),
      video: videoPart.data,
      ext,
    });
    json(res, 200, { ok: true, id: meta.id, bytes: meta.bytes });
  } catch (e) {
    json(res, 400, { error: e?.message ?? "save failed" });
  }
}
