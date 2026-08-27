import fs from "node:fs";
import path from "node:path";

export const STATIC_MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

export function isStaticMethod(method) {
  return method === "GET" || method === "HEAD";
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Serve a file from `dist`. HEAD returns the same headers as GET with no body.
 * Content-Length is always set so fetchers (Buffer, crawlers) can read the URL.
 */
export function serveStatic(req, res, pathname, dist) {
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let file = path.join(dist, safe);
  if (!file.startsWith(dist)) return json(res, 403, { error: "forbidden" });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  if (!fs.existsSync(file)) return json(res, 404, { error: "not found (run npm run build)" });

  const ext = path.extname(file);
  const stat = fs.statSync(file);
  const isAsset = /^[/\\]?assets[/\\]/.test(safe);
  const cacheControl = isAsset
    ? "public, max-age=31536000, immutable"
    : ext === ".html"
      ? "no-cache"
      : "public, max-age=3600";

  const lastModified = stat.mtime.toUTCString();
  if (req.headers["if-modified-since"] === lastModified) {
    res.writeHead(304, { "Cache-Control": cacheControl, "Last-Modified": lastModified });
    return res.end();
  }
  res.writeHead(200, {
    "Content-Type": STATIC_MIME[ext] ?? "application/octet-stream",
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
    "Last-Modified": lastModified,
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}
