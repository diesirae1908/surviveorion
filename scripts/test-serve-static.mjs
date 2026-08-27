/**
 * Static HEAD/GET headers for Buffer (and any other URL fetcher).
 * Run: node scripts/test-serve-static.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isStaticMethod, serveStatic } from "../server/serve-static.mjs";

function mockRes() {
  return {
    status: 0,
    headers: {},
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body ?? "";
    },
  };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orion-static-"));
const dist = path.resolve(tmp, "dist");
fs.mkdirSync(path.join(dist, "social-drafts"), { recursive: true });
const clip = path.join(dist, "social-drafts", "clip.mp4");
fs.writeFileSync(clip, Buffer.from("fake-mp4-bytes"));

assert.equal(isStaticMethod("GET"), true);
assert.equal(isStaticMethod("HEAD"), true);
assert.equal(isStaticMethod("POST"), false);

const head = mockRes();
serveStatic({ method: "HEAD", headers: {} }, head, "/social-drafts/clip.mp4", dist);
assert.equal(head.status, 200, "HEAD must not 404");
assert.equal(head.headers["Content-Type"], "video/mp4");
assert.equal(head.headers["Content-Length"], 14);
assert.equal(head.body, "", "HEAD has no body");

const get = mockRes();
let piped = false;
const origCreate = fs.createReadStream;
fs.createReadStream = (file) => {
  piped = file === clip;
  return { pipe(res) { res.end("piped"); } };
};
try {
  serveStatic({ method: "GET", headers: {} }, get, "/social-drafts/clip.mp4", dist);
} finally {
  fs.createReadStream = origCreate;
}
assert.equal(get.status, 200);
assert.equal(get.headers["Content-Length"], 14);
assert.equal(piped, true);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("PASS  static HEAD and GET set Content-Length");
