/**
 * On-video caption burn-in (Phase B). Platform caption files are Phase C.
 */

import { readFileSync } from "node:fs";

import { ASSETS } from "./paths.mjs";

const EM_DASH = "\u2014";

/** @type {{ id: string, name: string, subline: string }[] | null} */
let mutatorCache = null;

/**
 * @param {string} text
 * @param {string} [label]
 */
export function assertNoEmDash(text, label = "caption") {
  if (String(text).includes(EM_DASH)) {
    throw new Error(`${label} contains an em dash (U+2014)`);
  }
}

/**
 * @param {string} text
 * @param {string} [label]
 */
export function assertCaptionVoice(text, label = "caption") {
  assertNoEmDash(text, label);
  const bangs = (String(text).match(/!/g) || []).length;
  if (bangs > 1) {
    throw new Error(`${label} has more than one !`);
  }
}

/**
 * @param {number} n
 */
export function formatScore(n) {
  return Math.floor(n).toLocaleString("en-US");
}

/**
 * Short score for endcard TAG. 3490380 -> 3.49M
 * @param {number} n
 */
export function formatScoreShort(n) {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const raw = m >= 10 ? m.toFixed(1) : m.toFixed(2);
    return `${raw.replace(/\.?0+$/, "")}M`;
  }
  if (n >= 1000) {
    const k = n / 1000;
    const raw = n >= 10_000 ? k.toFixed(0) : k.toFixed(1);
    return `${raw.replace(/\.0$/, "")}K`;
  }
  return String(Math.floor(n));
}

/**
 * @returns {{ id: string, name: string, subline: string }[]}
 */
export function loadMutators() {
  if (mutatorCache) return mutatorCache;
  try {
    mutatorCache = JSON.parse(readFileSync(ASSETS.mutators, "utf8"));
  } catch {
    mutatorCache = [];
  }
  return mutatorCache;
}

/**
 * @param {string} [id]
 */
export function sublineFor(id) {
  if (!id) return "";
  return loadMutators().find((m) => m.id === id)?.subline ?? "";
}

/**
 * Rough Rajdhani 700 advance, used to overlay Alarm mutator names.
 * @param {string} text
 * @param {number} fontSize
 */
export function estimateRajdhaniWidth(text, fontSize) {
  let w = 0;
  for (const ch of text) {
    if (ch === " ") w += 0.28;
    else if (".:,;!'%".includes(ch)) w += 0.32;
    else if ("Il1".includes(ch)) w += 0.32;
    else if (ch >= "A" && ch <= "Z") w += 0.58;
    else w += 0.48;
  }
  return w * fontSize;
}

/**
 * @param {string[]} lines
 * @param {number} [maxWidth]
 */
export function fitFontSize(lines, maxWidth = 1000) {
  let size = 38;
  while (size > 22) {
    if (lines.every((line) => estimateRajdhaniWidth(line, size) <= maxWidth)) {
      return size;
    }
    size -= 1;
  }
  return 22;
}

/**
 * @param {import('./plan.mjs').FormatId} format
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @param {{ graze?: { clearance: number } }} [extras]
 */
export function videoCaption(format, sidecar, extras = {}) {
  const mutator = sidecar.mutatorNames[0] || "";
  const subline = sublineFor(sidecar.mutatorIds[0]);

  /** @type {string[]} */
  let lines = [];
  if (format === "THE_BOARD") {
    lines = [
      `${formatScore(sidecar.score)} on Day ${sidecar.day}.`,
      "Same seed as everyone else. That is the whole point.",
    ];
  } else if (format === "TODAYS_PATROL") {
    lines = [
      `Today every pilot on earth flies ${mutator}:`,
      subline,
    ];
  } else if (format === "CLOSE_CALL") {
    const pct = extras.graze
      ? Math.max(0, Math.round(extras.graze.clearance * 100))
      : 0;
    lines = [
      `${pct}% of a hull between him and deletion.`,
      `Day ${sidecar.day}${mutator ? `, ${mutator}` : ""}.`,
    ];
  } else if (format === "SPACE_DUST") {
    lines = [
      `Day ${sidecar.day} attempt: ${Math.round(sidecar.survivalTime)}s.`,
      "The daily patrol is undefeated.",
    ];
  } else {
    throw new Error(`Unknown format for caption: ${format}`);
  }

  lines = lines.filter(Boolean).slice(0, 2);
  const joined = lines.join("\n");
  assertCaptionVoice(joined, `${format} caption`);
  return {
    lines,
    mutatorNames: sidecar.mutatorNames,
    fontSize: fitFontSize(lines),
  };
}

/**
 * Mission Control endcard slots. Deterministic from the sidecar, no grazes invented.
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 */
export function endcardCopy(sidecar) {
  const hook1 = `DAY ${sidecar.day}`;
  const hook2 = sidecar.mutatorNames[0] || "PATROL";
  const tag = formatScoreShort(sidecar.score);
  assertNoEmDash(hook1, "HOOK_LINE1");
  assertNoEmDash(hook2, "HOOK_LINE2");
  assertNoEmDash(tag, "TAG");
  return { hook1, hook2, tag };
}
