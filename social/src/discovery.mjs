/**
 * Discovery process for IG / TikTok / YouTube Shorts.
 * New channels get almost no browse impressions until the platform can
 * categorize the clip. Searchable title, keyword first line, tags, #Shorts,
 * madeForKids=false, and a pinned-comment CTA are the parts we can lock in code.
 */

const EM_DASH = /\u2014|\u2013/;

export const KEYWORD_LINE =
  "Daily dodge game. Same seed, three attempts, free in the browser.";

export const FIRST_COMMENT =
  "Fly today's patrol free: https://surviveorion.com\nSame seed as every other pilot. Three attempts.";

export const YOUTUBE_ALWAYS_HASHTAGS = ["#Shorts", "#indiegame", "#browsergame"];

export const YOUTUBE_TAG_WORDS = [
  "orion",
  "surviveorion",
  "daily dodge game",
  "browser game",
  "indie game",
  "arcade game",
  "shorts",
];

/**
 * @param {string} text
 */
export function hasSearchPhrase(text) {
  return /dodge|browser game|indie game|surviveorion|orion|swarm/i.test(String(text));
}

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 */
export function mutatorLabel(sidecar) {
  const names = (sidecar.mutatorNames || []).filter(Boolean);
  return names.length ? names.join(" + ") : "PATROL";
}

/**
 * Title people can actually search. Format identity stays, search phrase is required.
 * @param {string} format
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 */
export function searchableTitle(format, sidecar) {
  const mutator = mutatorLabel(sidecar);
  const score = Math.floor(Number(sidecar.score) || 0).toLocaleString("en-US");
  const secs = Math.round(Number(sidecar.survivalTime) || 0);
  /** @type {string} */
  let title;
  if (format === "WASTED") title = `WASTED on ${mutator} day | daily dodge game`;
  else if (format === "NEW_BEST") title = `${score} new best | daily dodge game`;
  else if (format === "PATROL" || format === "TODAYS_PATROL") {
    title = `${mutator} day | daily dodge game`;
  } else if (format === "THE_BOARD") title = `${score} on the board | daily dodge game`;
  else if (format === "CLOSE_CALL") title = `Close call on ${mutator} day | daily dodge game`;
  else if (format === "SPACE_DUST") title = `Space dust in ${secs}s | daily dodge game`;
  else title = `${mutator} | daily dodge game`;
  return clampTitle(title);
}

/**
 * If a calendar title already names Orion / dodge / patrol, keep it.
 * Otherwise append the search phrase.
 * @param {string} title
 */
export function ensureSearchableTitle(title) {
  const raw = String(title ?? "").trim();
  if (!raw) return "ORION | daily dodge game";
  if (hasSearchPhrase(raw)) return clampTitle(raw);
  return clampTitle(`${raw} | daily dodge game`);
}

/**
 * @param {string} title
 */
export function clampTitle(title) {
  const t = String(title).replace(EM_DASH, "-").trim();
  if (t.length <= 100) return t;
  return `${t.slice(0, 99).trimEnd()}`;
}

/**
 * @param {string} caption
 */
export function ensureCaptionKeywords(caption) {
  const text = String(caption ?? "").trim();
  if (!text) return KEYWORD_LINE;
  if (hasSearchPhrase(text)) return text;
  const parts = text.split(/\n\n+/);
  const last = parts[parts.length - 1] || "";
  if (/^#/.test(last.trim())) {
    parts.splice(parts.length - 1, 0, KEYWORD_LINE);
    return parts.join("\n\n");
  }
  return `${text}\n\n${KEYWORD_LINE}`;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function hashtagsIn(text) {
  return [...String(text).matchAll(/#[a-zA-Z][\w]*/g)].map((m) => m[0]);
}

/**
 * @param {string[]} tags
 */
export function uniqueHashtags(tags) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const raw of tags) {
    const tag = String(raw || "").trim();
    if (!tag.startsWith("#")) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * @param {string} text
 * @param {string[]} tags
 */
export function ensureHashtagLine(text, tags) {
  let out = String(text ?? "").trimEnd();
  const missing = uniqueHashtags(tags).filter((tag) => {
    const re = new RegExp(`${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return !re.test(out);
  });
  if (!missing.length) return out;
  return out ? `${out}\n\n${missing.join(" ")}` : missing.join(" ");
}

/**
 * YouTube description: hook, what it is, tags including #Shorts, surviveorion.com last.
 * @param {string} text
 * @param {{ tags?: string[] }} [opts]
 */
export function ensureYoutubeDescription(text, opts = {}) {
  let out = String(text ?? "").trim();
  const tags = uniqueHashtags([...(opts.tags || []), ...YOUTUBE_ALWAYS_HASHTAGS]);
  if (!hasSearchPhrase(out)) {
    out = out ? `${out}\n\n${KEYWORD_LINE}` : KEYWORD_LINE;
  }
  if (!/surviveorion\.com/i.test(out)) {
    out = `${out}\n\nPlay: https://surviveorion.com`;
  }
  out = ensureHashtagLine(out, tags);
  if (!out.trimEnd().endsWith("surviveorion.com")) {
    out = `${out.trimEnd()}\n\nsurviveorion.com`;
  }
  if (EM_DASH.test(out)) {
    throw new Error("YouTube description contains an em/en dash");
  }
  return out;
}

/**
 * @param {string[]} hashtags
 */
export function youtubeTags(hashtags = []) {
  const fromHash = hashtags.map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean);
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const tag of [...YOUTUBE_TAG_WORDS, ...fromHash]) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 15) break;
  }
  return out;
}

/**
 * Buffer YoutubePostMetadataInput. madeForKids must be explicit false
 * or YouTube can hide the Short from the regular feed.
 * @param {{ title: string, privacy?: "public" | "unlisted" | "private" }} opts
 */
export function youtubeBufferMetadata({ title, privacy = "public" }) {
  return {
    title: clampTitle(title),
    categoryId: "20",
    madeForKids: false,
    license: "youtube",
    embeddable: true,
    notifySubscribers: true,
    isAiGenerated: false,
    privacy,
  };
}

export function tiktokBufferMetadata() {
  return { isAiGenerated: false };
}

/**
 * Direct YouTube Data API videos.insert body.
 * @param {{
 *   title: string,
 *   description: string,
 *   tags?: string[],
 *   privacy?: string,
 * }} opts
 */
export function youtubeInsertBody({ title, description, tags = [], privacy = "public" }) {
  return {
    snippet: {
      title: clampTitle(title),
      description,
      tags: youtubeTags(tags),
      categoryId: "20",
      defaultLanguage: "en",
      defaultAudioLanguage: "en",
    },
    status: {
      privacyStatus: privacy,
      selfDeclaredMadeForKids: false,
      embeddable: true,
      license: "youtube",
      publicStatsViewable: true,
    },
  };
}

export function firstComment() {
  return FIRST_COMMENT;
}

/**
 * @param {string} text
 * @param {{ youtube?: boolean, label?: string }} [opts]
 */
export function assertDiscovery(text, opts = {}) {
  const label = opts.label || "copy";
  if (EM_DASH.test(String(text))) {
    throw new Error(`${label} contains an em/en dash`);
  }
  if (opts.youtube) {
    if (!/#Shorts\b/i.test(text)) {
      throw new Error(`${label} is missing #Shorts`);
    }
    if (!/surviveorion\.com/i.test(text)) {
      throw new Error(`${label} is missing surviveorion.com`);
    }
    if (!hasSearchPhrase(text)) {
      throw new Error(`${label} has no searchable phrase (dodge / browser / Orion)`);
    }
  }
}
