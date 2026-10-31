/**
 * Client/server switch-registry parity (like test-patrol-date.ts): shared
 * fixtures run through src/flags.ts and server/flags.mjs must agree on the
 * resolved flag and the ruleset id. Also pins config.ts OVERDRIVE to the
 * registry defaults and that every flag key referenced in src/ exists.
 * Run: npx tsx scripts/test-flag-parity.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.ORION_DB = ":memory:"; // server/flags.mjs imports the store

import { OVERDRIVE } from "../src/config";
import { resolveFlagFrom, rulesetIdFrom, type FlagRow } from "../src/flags";

const server = await import("../server/flags.mjs");

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "flags-fixtures.json"), "utf8")) as {
  cases: Array<{
    name: string;
    date: string;
    rows: FlagRow[];
    expect: { overdrive: { versionId: string; enabled: boolean }; rulesetId: string };
  }>;
};

for (const c of fixtures.cases) {
  const cl = resolveFlagFrom("overdrive", c.date, c.rows)!;
  const sv = server.resolveFlag("overdrive", c.date, c.rows)!;
  check(`${c.name}: client resolves as expected`, cl.versionId === c.expect.overdrive.versionId && cl.enabled === c.expect.overdrive.enabled);
  check(`${c.name}: server resolves as expected`, sv.versionId === c.expect.overdrive.versionId && sv.enabled === c.expect.overdrive.enabled);
  check(`${c.name}: client and server params and hash identical`, JSON.stringify(cl.params) === JSON.stringify(sv.params) && cl.hash === sv.hash);
  const clId = rulesetIdFrom(c.date, c.rows);
  const svId = server.rulesetIdFor(c.date, c.rows);
  check(`${c.name}: rulesetId ${c.expect.rulesetId}`, clId === c.expect.rulesetId && svId === c.expect.rulesetId, `${clId} / ${svId}`);
}

// every registry key resolves the same way on both sides with no rows
const registry = server.loadRegistry();
for (const key of Object.keys(registry.flags)) {
  const cl = resolveFlagFrom(key, "2026-11-10", [])!;
  const sv = server.resolveFlag(key, "2026-11-10", [])!;
  check(`${key}: default resolution identical`, cl.versionId === sv.versionId && cl.enabled === sv.enabled && JSON.stringify(cl.params) === JSON.stringify(sv.params));
}

// the default-on id is the same literal on both sides (never ships on by default)
check("default-on ruleset id literal matches", (() => {
  const reg = JSON.parse(JSON.stringify(registry));
  reg.flags.overdrive.default.enabled = true;
  return server.rulesetIdFor("2026-11-10", [], reg) === "overdrive@d#default";
})());

// config.ts OVERDRIVE is the registry default, nothing else
check("config.ts OVERDRIVE equals registry defaults", JSON.stringify(OVERDRIVE) === JSON.stringify(registry.flags.overdrive.default.params));
check("materializing empty params gives the defaults", JSON.stringify(server.materializeParams(registry.flags.overdrive, {})) === JSON.stringify(registry.flags.overdrive.default.params));
check("all six switches default off", Object.values(registry.flags).every((f) => (f as { default: { enabled: boolean } }).default.enabled === false) && Object.keys(registry.flags).length === 6);

// old production rows (fixture old-row-930b7b4) resolve identically on both sides and are used as stored
const oldFx = (JSON.parse(fs.readFileSync(path.join(here, "fixtures", "flags-fixtures.json"), "utf8")) as { "old-row-930b7b4": { params: Record<string, unknown> } })["old-row-930b7b4"];
for (const [key, params] of Object.entries(oldFx.params)) {
  const oldRows: FlagRow[] = [{ id: 1, from: "2026-10-31", enabled: true, hash: "0ld00000", params }];
  const cl = resolveFlagFrom(key, "2026-11-01", oldRows)!;
  const sv = server.resolveFlag(key, "2026-11-01", oldRows)!;
  check(`old-row-930b7b4 ${key}: client and server use the stored params as-is`, JSON.stringify(cl.params) === JSON.stringify(params) && JSON.stringify(sv.params) === JSON.stringify(params));
}
check("old-row-930b7b4 overdrive needs generation 1 on the server", server.requiredGenForParams(oldFx.params.overdrive) === 1);

// capsSince: every listed path exists in the registry defaults and is a no-op there
const caps = registry.capsSince?.overdrive ?? {};
const getPath = (o: unknown, dotted: string): unknown => dotted.split(".").reduce((x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined), o);
const defOd = registry.flags.overdrive.default.params;
check("every capsSince path exists in the overdrive defaults", Object.keys(caps).every((p) => getPath(defOd, p) !== undefined), Object.keys(caps).filter((p) => getPath(defOd, p) === undefined).join(", "));
check("every capsSince path is a no-op by default (defaults need generation 1)", server.requiredGenForParams(defOd) === 1);

// every flag key referenced in src/ exists in the registry
const keys = new Set(Object.keys(registry.flags));
const files: string[] = [];
(function walk(d: string): void {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.ts$/.test(e.name)) files.push(p);
  }
})(path.join(here, "..", "src"));
const missing: string[] = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\b(?:resolveFlag|resolveFlagFrom|effectiveFlag)\(\s*"([^"]+)"/g)) {
    if (!keys.has(m[1])) missing.push(`${path.basename(f)}:${m[1]}`);
  }
  for (const m of src.matchAll(/["'](ui\.[A-Za-z]+)["']/g)) {
    if (!keys.has(m[1])) missing.push(`${path.basename(f)}:${m[1]}`);
  }
}
check("every flag key referenced in src/ exists in the registry", missing.length === 0, missing.join(", "));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
