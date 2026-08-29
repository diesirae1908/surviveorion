/**
 * On-video caption helpers (Phase B v2). Beat text lives in beats.mjs / HOOKS.md.
 * Platform caption files are Phase C.
 */

import { readFileSync } from "node:fs";

import {
  FIRST_COMMENT,
  assertDiscovery,
  ensureCaptionKeywords,
  ensureYoutubeDescription,
  firstComment,
  searchableTitle,
} from "./discovery.mjs";
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
export function fitFontSize(lines, maxWidth = 1000, start = 96) {
  let size = start;
  while (size > 48) {
    if (lines.every((line) => estimateRajdhaniWidth(line, size) <= maxWidth)) {
      return size;
    }
    size -= 2;
  }
  return 48;
}

/**
 * @param {import('./plan.mjs').FormatId} format
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @param {{ graze?: { clearance: number } }} [extras]
 */
export function videoCaption(format, sidecar, extras = {}) {
  const mutator = sidecar.mutatorNames[0] || "PATROL";

  /** @type {string[]} */
  let lines = [];
  if (format === "THE_BOARD") {
    lines = [`${formatScore(sidecar.score)}. one life.`];
  } else if (format === "TODAYS_PATROL") {
    lines = [`${mutator} DAY`];
  } else if (format === "CLOSE_CALL") {
    const pct = extras.graze
      ? (extras.graze.clearance * 100).toFixed(1)
      : "0.0";
    lines = Number(pct) <= 8
      ? [`${pct}% FROM DEATH`]
      : [`DEATH MISSED BY`, `${pct}%`];
  } else if (format === "SPACE_DUST") {
    lines = [`day ${sidecar.day}: ${Math.round(sidecar.survivalTime)} SECONDS`];
  } else {
    throw new Error(`Unknown format for caption: ${format}`);
  }

  lines = lines.filter(Boolean).slice(0, 2);
  const joined = lines.join("\n");
  assertCaptionVoice(joined, `${format} caption`);
  return {
    lines,
    mutatorNames: sidecar.mutatorNames,
    fontSize: fitFontSize(lines, 1000, 96),
  };
}

export const TAG_BANK = [
  "#arcadegame",
  "#indiegame",
  "#browsergame",
  "#dailychallenge",
  "#dodge",
  "#gamingmemes",
  "#satisfying",
  "#closecall",
];

/**
 * Deterministic 4-6 tags from the bank plus a mutator tag. Never the whole bank.
 * @param {number} day
 * @param {string} [mutatorId]
 */
export function rotateTags(day, mutatorId) {
  const extra = mutatorId ? [`#${String(mutatorId).replace(/[^a-z0-9]+/gi, "")}`] : [];
  const bank = [...TAG_BANK, ...extra];
  const count = 4 + (Math.abs(day) % 3);
  const start = Math.abs(day) % bank.length;
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < count; i++) {
    const tag = bank[(start + i) % bank.length];
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

/**
 * Platform caption files for locked presets (and v2 formats).
 * @param {string} format
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @param {{ suggestedSound?: string }} [extras]
 */
export function platformCaptions(format, sidecar, extras = {}) {
  const mutator = sidecar.mutatorNames[0] || "PATROL";
  const subline = sublineFor(sidecar.mutatorIds[0]);
  const score = formatScore(sidecar.score);
  const tags = rotateTags(sidecar.day, sidecar.mutatorIds[0]);
  const tagLine = tags.join(" ");

  let tiktok;
  let instagram;
  let youtubeTitle;
  let youtubeDescription;
  let suggestedSound = extras.suggestedSound ?? "";

  if (format === "WASTED") {
    tiktok = `Day ${sidecar.day} ${mutator}: flying too close to the stars. Same seed as everyone else. Link in bio.\n\n${tagLine}`;
    instagram = tiktok;
    youtubeTitle = searchableTitle(format, sidecar);
    youtubeDescription = `Day ${sidecar.day} ${mutator}. He flew too close to the stars.\nSame seed as everyone else. Three attempts. Free in your browser.`;
  } else if (format === "NEW_BEST") {
    tiktok = `${score} on Day ${sidecar.day}. New best. Same seed as everyone else. That is the whole point.\n\n${tagLine}`;
    instagram = tiktok;
    youtubeTitle = searchableTitle(format, sidecar);
    youtubeDescription = `${score} on Day ${sidecar.day}. New best. Same seed as everyone else. That is the whole point.\nFree in your browser.`;
    suggestedSound = extras.suggestedSound ?? "Celebration";
  } else if (format === "PATROL" || format === "TODAYS_PATROL") {
    const brief = subline ? `${subline} ` : "";
    tiktok = `Today every pilot on earth flies ${mutator}: ${brief}Three attempts. Free, in your browser.\n\n${tagLine}`;
    instagram = tiktok;
    youtubeTitle = searchableTitle(format, sidecar);
    youtubeDescription = `Today every pilot on earth flies ${mutator}: ${brief}Three attempts. Free, in your browser.`;
  } else if (format === "THE_BOARD") {
    tiktok = `${score} on Day ${sidecar.day}. Same seed as everyone else. That is the whole point.\n\n${tagLine}`;
    instagram = tiktok;
    youtubeTitle = searchableTitle(format, sidecar);
    youtubeDescription = `${score} on Day ${sidecar.day}. Same seed as everyone else. That is the whole point.`;
  } else if (format === "CLOSE_CALL") {
    tiktok = `Day ${sidecar.day}, ${mutator}. Could you dodge it? Link in bio.\n\n${tagLine}`;
    instagram = tiktok;
    youtubeTitle = searchableTitle(format, sidecar);
    youtubeDescription = `Day ${sidecar.day} ${mutator}. Could you dodge it?`;
  } else if (format === "SPACE_DUST") {
    tiktok = `Day ${sidecar.day} attempt: ${Math.round(sidecar.survivalTime)}s. The daily patrol is undefeated.\n\n${tagLine}`;
    instagram = tiktok;
    youtubeTitle = searchableTitle(format, sidecar);
    youtubeDescription = `Day ${sidecar.day} attempt: ${Math.round(sidecar.survivalTime)}s. The daily patrol is undefeated.`;
  } else {
    throw new Error(`Unknown format for platform captions: ${format}`);
  }

  tiktok = ensureCaptionKeywords(tiktok);
  instagram = ensureCaptionKeywords(instagram);
  youtubeDescription = ensureYoutubeDescription(youtubeDescription, { tags });
  const youtubeBody = `${youtubeTitle}\n\n${youtubeDescription}`;
  assertCaptionVoice(tiktok, `${format} tiktok`);
  assertCaptionVoice(instagram, `${format} instagram`);
  assertCaptionVoice(youtubeTitle, `${format} youtube title`);
  assertCaptionVoice(youtubeDescription, `${format} youtube description`);
  assertDiscovery(youtubeDescription, { youtube: true, label: `${format} youtube description` });
  if (!youtubeDescription.trimEnd().endsWith("surviveorion.com")) {
    throw new Error(`${format} YouTube description must end with surviveorion.com`);
  }

  return {
    tiktok,
    instagram,
    youtube: youtubeBody,
    youtubeTitle,
    youtubeDescription,
    tags,
    firstComment: firstComment(),
    suggestedSound,
  };
}

export function tiktokManualManifest(captions) {
  const sound = captions.suggestedSound
    ? `Suggested sound: ${captions.suggestedSound}`
    : "Suggested sound: none (audio is baked).";
  const text = [
    "TikTok v1: no API. Open TikTok on the phone and attach this clip.",
    "",
    sound,
    "",
    "Caption:",
    captions.tiktok,
    "",
    "Pin this comment (link in comments survives when the bio link is hidden):",
    captions.firstComment || FIRST_COMMENT,
    "",
    "Steps: open TikTok -> + -> upload video.mp4 -> paste caption -> attach the suggested sound if any -> post -> pin the first comment.",
  ].join("\n");
  assertCaptionVoice(text, "tiktok manual");
  return text;
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
