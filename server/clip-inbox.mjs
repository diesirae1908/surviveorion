// Lucas-only clip inbox: game POSTs a webm+json pair, Grok fetches over HTTPS.
// Bytes live on the Render persistent disk at /data (same volume as SQLite).
// Never deletes files: consume moves pending -> consumed.
// Grok uploads finished cuts to POST /clip-inbox/<secret>/cuts; those are
// served at unlisted /clip-cuts/<id>/cut.mp4 and pushed to Notion Clips.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clipFormatName, pushCutToNotion } from "./notion-clips.mjs";

export const CLIP_INBOX_MAX_BYTES = 40 * 1024 * 1024;
export const CLIP_POSTER_MAX_BYTES = 2 * 1024 * 1024;
export const CUT_ID_RE = /^[0-9a-f]{32}$/;
const BASENAME_RE = /^orion_\d{4}-\d{2}-\d{2}_day\d+_[A-Za-z0-9+\-]+_\d+$/;
const FILE_RE = /^orion_\d{4}-\d{2}-\d{2}_day\d+_[A-Za-z0-9+\-]+_\d+\.(webm|mp4|json)$/;
const CUT_PUBLIC_FILE_RE = /^(cut\.(mp4|webm)|poster\.(jpg|jpeg|png|webp))$/;

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
function cutsDir() {
  return path.join(inboxRoot(), "cuts");
}

export function ensureInboxDirs() {
  fs.mkdirSync(pendingDir(), { recursive: true });
  fs.mkdirSync(consumedDir(), { recursive: true });
  fs.mkdirSync(cutsDir(), { recursive: true });
}

export function cutOrigin(req, env = process.env) {
  if (env.ORION_PUBLIC_ORIGIN) return String(env.ORION_PUBLIC_ORIGIN).replace(/\/$/, "");
  const host = req?.headers?.host;
  if (host) {
    const proto = String(req.headers["x-forwarded-proto"] || "http")
      .split(",")[0]
      .trim();
    return `${proto}://${host}`;
  }
  return "https://surviveorion.com";
}

function patrolDateFromSource(sourceId) {
  const m = /^orion_(\d{4}-\d{2}-\d{2})_/.exec(sourceId || "");
  return m ? m[1] : "";
}

export function saveCut({
  name,
  format,
  mutator,
  sourceId,
  notes,
  patrolDate,
  video,
  videoExt,
  poster,
  posterExt,
  origin,
}) {
  if (videoExt !== "mp4" && videoExt !== "webm") throw new Error("invalid video type");
  if (!Buffer.isBuffer(video) || video.length < 32) throw new Error("invalid video");
  if (video.length > CLIP_INBOX_MAX_BYTES) throw new Error("body too large");
  if (poster) {
    if (!Buffer.isBuffer(poster) || poster.length < 8) throw new Error("invalid poster");
    if (poster.length > CLIP_POSTER_MAX_BYTES) throw new Error("poster too large");
    if (!["jpg", "jpeg", "png", "webp"].includes(posterExt)) throw new Error("invalid poster type");
  }
  const id = crypto.randomBytes(16).toString("hex");
  const formatName = clipFormatName(format);
  const source = typeof sourceId === "string" && BASENAME_RE.test(sourceId) ? sourceId : "";
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(String(patrolDate || "")) ? String(patrolDate) : patrolDateFromSource(source);
  const title = String(name || "").replace(/\s+/g, " ").trim().slice(0, 80) || `${formatName} cut`;
  ensureInboxDirs();
  const dir = path.join(cutsDir(), id);
  fs.mkdirSync(dir, { recursive: true });
  const videoName = `cut.${videoExt}`;
  fs.writeFileSync(path.join(dir, videoName), video);
  let posterName = "";
  if (poster) {
    posterName = `poster.${posterExt === "jpeg" ? "jpg" : posterExt}`;
    fs.writeFileSync(path.join(dir, posterName), poster);
  }
  const base = String(origin || "https://surviveorion.com").replace(/\/$/, "");
  const meta = {
    id,
    name: title,
    format: formatName,
    mutator: String(mutator || "").trim().slice(0, 200),
    sourceId: source,
    notes: String(notes || "").trim().slice(0, 2000),
    patrolDate: date,
    video: videoName,
    poster: posterName,
    bytes: video.length,
    uploadedAt: new Date().toISOString(),
    videoUrl: `${base}/clip-cuts/${id}/${videoName}`,
    posterUrl: posterName ? `${base}/clip-cuts/${id}/${posterName}` : "",
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  return meta;
}

export function listCuts() {
  ensureInboxDirs();
  const ids = fs.readdirSync(cutsDir()).filter((n) => CUT_ID_RE.test(n));
  const cuts = [];
  for (const id of ids) {
    const metaPath = path.join(cutsDir(), id, "meta.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      cuts.push(JSON.parse(fs.readFileSync(metaPath, "utf8")));
    } catch {
      /* skip corrupt */
    }
  }
  cuts.sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
  return cuts;
}

export function resolveCutFile(id, filename) {
  if (!CUT_ID_RE.test(id) || !CUT_PUBLIC_FILE_RE.test(filename)) return null;
  const file = path.join(cutsDir(), id, filename);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  if (filename === "poster.jpg") {
    const jpeg = path.join(cutsDir(), id, "poster.jpeg");
    if (fs.existsSync(jpeg) && fs.statSync(jpeg).isFile()) return jpeg;
  }
  return null;
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
    ext === ".webm"
      ? "video/webm"
      : ext === ".mp4"
        ? "video/mp4"
        : ext === ".json"
          ? "application/json"
          : ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".jpg" || ext === ".jpeg"
                ? "image/jpeg"
                : "application/octet-stream";
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
export async function handleClipCutsPublic(req, res, url) {
  if (url.pathname === "/clip-cuts" || url.pathname === "/clip-cuts/") {
    json(res, 404, { error: "not found" });
    return true;
  }
  const fileM = /^\/clip-cuts\/([0-9a-f]{32})\/([^/]+)$/.exec(url.pathname);
  if (!fileM) return false;
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return true;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    json(res, 405, { error: "method not allowed" });
    return true;
  }
  const file = resolveCutFile(fileM[1], fileM[2]);
  if (!file) {
    json(res, 404, { error: "not found" });
    return true;
  }
  res.removeHeader("X-Frame-Options");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  serveFile(req, res, file);
  return true;
}

async function handleCutUpload(req, res, origin) {
  const ct = String(req.headers["content-type"] ?? "");
  if (!ct.toLowerCase().includes("multipart/form-data")) {
    json(res, 400, { error: "expected multipart" });
    return;
  }
  let buf;
  try {
    buf = await readRawBody(req, CLIP_INBOX_MAX_BYTES + CLIP_POSTER_MAX_BYTES + 64 * 1024);
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
  const text = (name) => {
    const p = parts.find((x) => x.name === name);
    return p ? p.data.toString("utf8").trim() : "";
  };
  const videoPart = parts.find((p) => p.name === "video");
  if (!videoPart) {
    json(res, 400, { error: "need video" });
    return;
  }
  const filename = (videoPart.filename || "").toLowerCase();
  const videoExt = filename.endsWith(".webm") ? "webm" : "mp4";
  const posterPart = parts.find((p) => p.name === "poster");
  let poster = null;
  let posterExt = "";
  if (posterPart && posterPart.data.length) {
    const pf = (posterPart.filename || "").toLowerCase();
    posterExt = pf.endsWith(".png") ? "png" : pf.endsWith(".webp") ? "webp" : pf.endsWith(".jpeg") ? "jpeg" : "jpg";
    poster = posterPart.data;
  }
  try {
    const meta = saveCut({
      name: text("name"),
      format: text("format"),
      mutator: text("mutator"),
      sourceId: text("sourceId"),
      notes: text("notes"),
      patrolDate: text("patrolDate"),
      video: videoPart.data,
      videoExt,
      poster,
      posterExt,
      origin,
    });
    let notion = { skipped: true };
    try {
      notion = await pushCutToNotion(meta);
    } catch (err) {
      console.error("notion clip push failed", err?.message || err);
    }
    json(res, 200, {
      ok: true,
      id: meta.id,
      videoUrl: meta.videoUrl,
      posterUrl: meta.posterUrl || null,
      notionPageId: notion.id ?? null,
      notionSkipped: Boolean(notion.skipped),
    });
  } catch (e) {
    json(res, 400, { error: e?.message ?? "save failed" });
  }
}

export async function handleClipInboxPublic(req, res, url) {
  const listM = /^\/clip-inbox\/([^/]+)\/?$/.exec(url.pathname);
  const fileM = /^\/clip-inbox\/([^/]+)\/file\/([^/]+)$/.exec(url.pathname);
  const consumedM = /^\/clip-inbox\/([^/]+)\/consumed$/.exec(url.pathname);
  const cutsM = /^\/clip-inbox\/([^/]+)\/cuts\/?$/.exec(url.pathname);
  if (!listM && !fileM && !consumedM && !cutsM) return false;

  const secret = (listM || fileM || consumedM || cutsM)[1];
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

  if (cutsM && (req.method === "GET" || req.method === "HEAD")) {
    const cuts = listCuts().map((m) => ({
      id: m.id,
      name: m.name,
      format: m.format,
      mutator: m.mutator,
      sourceId: m.sourceId,
      videoUrl: m.videoUrl,
      posterUrl: m.posterUrl || null,
      bytes: m.bytes,
      uploadedAt: m.uploadedAt,
    }));
    json(res, 200, { cuts });
    return true;
  }

  if (cutsM && req.method === "POST") {
    await handleCutUpload(req, res, cutOrigin(req));
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
