// Ruleset stamp parsing, shared by server/flags.mjs and server/db.mjs (kept
// import-free so the two never import each other in a cycle).

/**
 * Split a submitted ruleset stamp into `{ base, gen }`. A bundle stamps
 * `<rulesetId>+g<ENGINE_GEN>`; no suffix means generation 1 (a Phase 1 bundle).
 * null/empty input gives null (a pre-registry bundle).
 */
export function parseStamp(ruleset) {
  if (typeof ruleset !== "string" || ruleset.length === 0) return null;
  const m = /^(.*)\+g(\d{1,3})$/.exec(ruleset);
  return m ? { base: m[1], gen: Number(m[2]) } : { base: ruleset, gen: 1 };
}
