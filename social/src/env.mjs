/**
 * Load env files without adding a dotenv dependency.
 * Existing process.env wins. Later files only fill missing keys.
 *
 * Buffer token lives OUTSIDE git:
 *   1. ~/.config/orion-social/buffer.env  (canonical vault, chmod 600)
 *   2. social/.env                        (gitignored working copy)
 * Never commit a real BUFFER_ACCESS_TOKEN. GitHub Actions secrets are
 * write-only and cannot be read back by a local Cursor session.
 */

import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "./paths.mjs";

export const BUFFER_VAULT_PATH = path.join(
  homedir(),
  ".config",
  "orion-social",
  "buffer.env",
);

/**
 * @param {string} text
 */
export function applyEnvText(text) {
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

/**
 * @param {string} file
 */
function applyEnvFile(file) {
  try {
    applyEnvText(readFileSync(file, "utf8"));
  } catch {
    // missing vault or .env is fine
  }
}

/**
 * @param {string} [repoRoot]
 * @param {string} [vaultPath]
 */
export function loadEnv(repoRoot = REPO_ROOT, vaultPath = BUFFER_VAULT_PATH) {
  applyEnvFile(vaultPath);
  applyEnvFile(path.join(repoRoot, ".env"));
}

export function envPrivacy() {
  return String(process.env.DEFAULT_PRIVACY ?? "").trim();
}
