/**
 * Load repo .env without adding a dotenv dependency.
 * Existing process.env wins.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "./paths.mjs";

/**
 * @param {string} [repoRoot]
 */
export function loadEnv(repoRoot = REPO_ROOT) {
  const file = path.join(repoRoot, ".env");
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

export function envPrivacy() {
  return String(process.env.DEFAULT_PRIVACY ?? "").trim();
}
