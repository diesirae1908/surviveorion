/**
 * One-time YouTube OAuth bootstrap. Prints the consent URL.
 * Do not run this against Google from the pipeline. Lucas runs it locally once.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadEnv } from "./env.mjs";
import { REPO_ROOT } from "./paths.mjs";

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];

export function consentUrlFromClient(client, { redirectUri = "http://127.0.0.1:53682" } = {}) {
  const installed = client.installed || client.web;
  if (!installed?.client_id) {
    throw new Error("auth/google-client.json missing client_id");
  }
  const params = new URLSearchParams({
    client_id: installed.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function upsertEnvToken(repoRoot, key, value) {
  const envPath = path.join(repoRoot, ".env");
  let text = "";
  try {
    text = await readFile(envPath, "utf8");
  } catch {
    text = "";
  }
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) {
    text = text.replace(re, `${key}=${value}`);
  } else {
    text = `${text.trimEnd()}\n${key}=${value}\n`;
  }
  await writeFile(envPath, text);
}

async function main(argv) {
  loadEnv();
  const clientPath = path.join(REPO_ROOT, process.env.YT_CLIENT_JSON || "auth/google-client.json");
  let raw;
  try {
    raw = JSON.parse(await readFile(clientPath, "utf8"));
  } catch {
    console.error(`Put the Desktop OAuth client JSON at ${clientPath} (see AUTH.md).`);
    process.exit(1);
  }
  const url = consentUrlFromClient(raw);
  console.log("Open this consent URL, approve as the @SurviveOrion owner, then paste the code:\n");
  console.log(url);
  if (argv.includes("--print-url")) return;

  console.log("\nThis script would exchange the code and write YT_REFRESH_TOKEN to .env.");
  console.log("Not exchanging in this run. Follow AUTH.md when you are ready.");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main(process.argv.slice(2));
}
