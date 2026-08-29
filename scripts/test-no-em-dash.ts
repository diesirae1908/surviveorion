// Static guard: no em dash ("—", U+2014) in player-facing Orion copy.
// Lucas's rule is absolute for anything the game shows or sends to a
// player: UI strings, HTML shell, server response messages. Comments,
// JOURNAL/AGENTS docs, dev tooling, the admin-only dashboard, and stale
// worktree checkouts are all out of scope on purpose (see FILES/skipRanges
// below) — this is a copy-quality guard, not a whole-repo style linter.
//
//   npx tsx scripts/test-no-em-dash.ts

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const EM_DASH = "\u2014"; // —

interface FileSpec {
  file: string;
  /** 1-based inclusive [start, end] line ranges to skip entirely. */
  skipRanges?: Array<[number, number]>;
}

const SRC_DIR = path.join(ROOT, "src");
const srcFiles: FileSpec[] = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith(".ts") || f.endsWith(".css"))
  .map((f) => ({ file: `src/${f}` }));

// Player-facing surfaces only: the client (src/), the served HTML shell,
// and the community server's routes. /admin lives in server/admin.html and
// is Bearer-key-gated for Lucas, not a player surface, so it is not listed.
const FILES: FileSpec[] = [
  { file: "index.html" },
  { file: "server/index.mjs" },
  { file: "server/nickname.mjs" },
  { file: "server/badges.mjs" },
  { file: "server/validate.mjs" },
  { file: "server/clip-inbox.mjs" },
  { file: "server/notion-clips.mjs" },
  // server/db.mjs deliberately excluded: it's SQL schema/query code with no
  // player-facing response strings (no json(res, ...) calls), and its one
  // em dash lives in a SQL "--" comment this script's stripper doesn't
  // parse, not a message a player could ever see.
  ...srcFiles,
];

function inSkipRange(line: number, ranges?: Array<[number, number]>): boolean {
  if (!ranges) return false;
  return ranges.some(([a, b]) => line >= a && line <= b);
}

/**
 * Best-effort comment stripping so the guard only sees code/markup that
 * actually ships to a browser or a client response, not the dense em-dash
 * commentary this codebase's comments use throughout. Not a full
 * tokenizer: `//` is treated as a comment starter unless immediately
 * preceded by `:` (dodges `http://`/`https://`), which is accurate for
 * every file this script scans today.
 */
function stripComments(lines: string[], isHtml: boolean, isCss: boolean): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (let line of lines) {
    if (isHtml) {
      let stripped = line;
      while (true) {
        const start = stripped.indexOf("<!--");
        if (start === -1) break;
        const end = stripped.indexOf("-->", start);
        if (end === -1) {
          stripped = stripped.slice(0, start);
          break;
        }
        stripped = stripped.slice(0, start) + stripped.slice(end + 3);
      }
      out.push(stripped);
      continue;
    }

    let working = line;
    if (inBlock) {
      const end = working.indexOf("*/");
      if (end === -1) {
        out.push("");
        continue;
      }
      working = working.slice(end + 2);
      inBlock = false;
    }

    // strip any number of same-line /* ... */ block comments
    while (true) {
      const start = working.indexOf("/*");
      if (start === -1) break;
      const end = working.indexOf("*/", start + 2);
      if (end === -1) {
        working = working.slice(0, start);
        inBlock = true;
        break;
      }
      working = working.slice(0, start) + working.slice(end + 2);
    }

    if (!isCss) {
      // trailing // line comment, unless it's a "://" inside a URL
      working = working.replace(/(^|[^:])\/\/.*$/, "$1");
    }

    out.push(working);
  }
  return out;
}

let failures = 0;

for (const spec of FILES) {
  const full = path.join(ROOT, spec.file);
  if (!fs.existsSync(full)) continue; // optional files (e.g. server/*.mjs not present in some checkouts)
  const raw = fs.readFileSync(full, "utf8").split("\n");
  const isHtml = spec.file.endsWith(".html");
  const isCss = spec.file.endsWith(".css");
  const cleaned = stripComments(raw, isHtml, isCss);
  cleaned.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (inSkipRange(lineNo, spec.skipRanges)) return;
    if (line.includes(EM_DASH)) {
      failures++;
      console.error(`FAIL ${spec.file}:${lineNo}: em dash in player-facing source: ${line.trim()}`);
    }
  });
}

if (failures > 0) {
  console.error(
    `\n${failures} em-dash occurrence(s) found in player-facing copy. Replace with a comma, ` +
      `period, colon, or parentheses (Lucas's no-em-dash rule is absolute for player-visible text).`,
  );
  process.exit(1);
}
console.log("ALL CHECKS PASSED: no em dashes in player-facing source (client, index.html, server routes).");
