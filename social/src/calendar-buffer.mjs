/**
 * Map publishing-calendar rows to Buffer createPost payloads.
 * Does not post. Does not delete. Hosting the clip is the caller's job.
 */

import {
  ensureCaptionKeywords,
  ensureSearchableTitle,
  ensureYoutubeDescription,
  firstComment,
  hashtagsIn,
  tiktokBufferMetadata,
  uniqueHashtags,
  youtubeBufferMetadata,
} from "./discovery.mjs";

const EM_DASH = /\u2014|\u2013/;

/**
 * @param {string | Date} date
 * @param {Date} [now]
 * @returns {{ mode: "addToQueue" | "customScheduled", dueAt?: string }}
 */
export function scheduleForDate(date, now = new Date()) {
  const day = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  const todayPt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (day > todayPt) {
    return { mode: "customScheduled", dueAt: nineAmPtIso(day) };
  }
  return { mode: "addToQueue" };
}

/** 09:00 America/Los_Angeles on YYYY-MM-DD, as UTC ISO. */
export function nineAmPtIso(day) {
  for (const offset of ["-07:00", "-08:00"]) {
    const d = new Date(`${day}T09:00:00${offset}`);
    const ptDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const ptHour = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(d);
    if (ptDay === day && ptHour === "09") return d.toISOString();
  }
  throw new Error(`could not resolve 09:00 PT for ${day}`);
}

/**
 * @param {string} caption
 * @param {string | null | undefined} tags
 */
export function joinCaption(caption, tags) {
  const cap = String(caption ?? "").trim();
  const tag = String(tags ?? "").trim();
  const text = tag ? `${cap}\n\n${tag}` : cap;
  if (EM_DASH.test(text)) {
    throw new Error("caption contains an em/en dash");
  }
  return text;
}

/**
 * @param {object} post
 * @param {object} opts
 * @param {string} opts.mediaBase public https origin, no trailing slash
 * @param {Record<string, string>} opts.channelIds
 * @param {Date} [opts.now]
 */
export function bufferJobsForPost(post, { mediaBase, channelIds, now = new Date() }) {
  if (post.postStatus !== "Approved") {
    return [];
  }
  if (post.assetStatus !== "Linked" || !post.asset) {
    throw new Error(`approved post ${post.date} ${post.title} has no linked asset`);
  }
  if (!/^https:\/\//.test(mediaBase)) {
    throw new Error(`mediaBase must be https, got ${mediaBase}`);
  }
  const hostedAsset = String(post.asset).replace(/\.mov$/i, ".mp4");
  const mediaUrl = `${mediaBase.replace(/\/$/, "")}/${encodeURIComponent(hostedAsset)}`;
  const { mode, dueAt } = scheduleForDate(post.date, now);
  const ig = ensureCaptionKeywords(joinCaption(post.igCaption, post.igTags));
  const ttTags = post.ttTags || post.igTags;
  const tt = ensureCaptionKeywords(joinCaption(post.ttCaption, ttTags));
  const youtubeTitle = ensureSearchableTitle(String(post.ytTitle ?? "").trim());
  const ytTags = uniqueHashtags([
    ...hashtagsIn(String(post.ytDescription ?? "")),
    ...hashtagsIn(String(post.igTags ?? "")),
  ]);
  const yt = ensureYoutubeDescription(String(post.ytDescription ?? "").trim(), { tags: ytTags });
  if (EM_DASH.test(yt) || EM_DASH.test(youtubeTitle)) {
    throw new Error(`YouTube copy contains an em/en dash: ${post.title}`);
  }

  const base = { mediaUrl, mode, dueAt, channelIds };
  return [
    { channel: "instagram", text: ig, ...base },
    { channel: "tiktok", text: tt, tiktokMetadata: tiktokBufferMetadata(), ...base },
    {
      channel: "youtube",
      text: yt,
      youtubeTitle,
      youtubeMetadata: youtubeBufferMetadata({ title: youtubeTitle }),
      firstComment: firstComment(),
      ...base,
    },
  ];
}

/**
 * @param {{ posts: object[] }} calendar
 * @param {object} opts
 */
export function bufferJobsForCalendar(calendar, opts) {
  const jobs = [];
  for (const post of calendar.posts ?? []) {
    jobs.push(...bufferJobsForPost(post, opts));
  }
  return jobs;
}
