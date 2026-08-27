/**
 * Extract {id, name, subline} from orion-web src/mutators.ts into assets/mutators.json.
 */

import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ASSETS } from "../src/paths.mjs";

const DEFAULT_SRC = path.join(
  os.homedir(),
  "Documents/games/orion-web/src/mutators.ts"
);

const src = process.argv[2] || DEFAULT_SRC;
const ts = await readFile(src, "utf8");
const re =
  /id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"\s*,\s*briefing:\s*"((?:\\.|[^"\\])*)"\s*,\s*subline:\s*"((?:\\.|[^"\\])*)"/g;

/** @type {{ id: string, name: string, subline: string }[]} */
const out = [];
let match;
while ((match = re.exec(ts))) {
  out.push({
    id: match[1],
    name: match[2],
    subline: match[4].replace(/\\"/g, '"'),
  });
}

if (out.length < 20) {
  console.error(`extract-mutators: expected ~22 entries, got ${out.length} from ${src}`);
  process.exit(1);
}

await writeFile(ASSETS.mutators, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${out.length} mutators -> ${ASSETS.mutators}`);
