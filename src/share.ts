// Share card for the daily-only site: a Wordle-style pasteable text block.
// Native share sheet on phones, clipboard on desktop.

import { COPY } from "./challenge";
import { MEDAL_EMOJI, MEDAL_LABEL, type MedalTier } from "./medals";
import { isNativeApp, isNativePlay, nativeShare, postNativeShare } from "./native";
import { patrolDateStr } from "./patrolDate";
import { DAILY_MAX_ATTEMPTS } from "./save";
import type { TraceBox, TracePath } from "./flightTrace";
import { MEDAL_WORD_COLOR, shareCardV2Model, drawShareCardV2, STORY_HEIGHT } from "./shareCardV2";

export { MEDAL_WORD_COLOR };

/**
 * Day the daily site went live, that date is Daily/Patrol #1. Reused as the
 * Patrol # epoch too (same feature, same numbering, no separate epoch), and
 * as the earliest date the patrol history calendar will ever show as a real
 * (rather than "before launch") day.
 */
export const DAILY_EPOCH_UTC = Date.UTC(2026, 6, 14);

/** DAILY_EPOCH_UTC as a 'YYYY-MM-DD' string, for date-string comparisons. */
export const DAILY_EPOCH_DATE = new Date(DAILY_EPOCH_UTC).toISOString().slice(0, 10);

const MS_PER_DAY = 86_400_000;

/** Daily Patrol number for the current patrol date (same boundary as the seed). */
export function dailyNumber(date = new Date()): number {
  const dateStr = patrolDateStr(date);
  const [y, m, d] = dateStr.split("-").map(Number);
  const today = Date.UTC(y, m - 1, d);
  return Math.round((today - DAILY_EPOCH_UTC) / MS_PER_DAY) + 1;
}

export interface ShareStats {
  dayNumber: number;
  score: number;
  /** Seconds survived. */
  time: number;
  maxMultiplier: number;
  /** Daily board rank, if known (signed-in runs only). */
  rank: number | null;
  /** 1-based attempt number the result came from. */
  attempt: number;
  /** Today's mutator name(s), e.g. ["RED ALERT"] or ["BLACKOUT", "GIANTS"] on Sundays. */
  mutatorNames?: string[];
  /** Best-of-day medal, or null if no tier reached yet. */
  medal?: MedalTier | null;
  /** This card came from a ?mutator= preview run: not scored, not on any board. */
  preview?: boolean;
  /** Share card v2 inputs (WS-S draws them; absent = not drawn). */
  trace?: TracePath;
  kills?: number;
  grazes?: number;
  /** "Rammed by a Lancer at 1:12" style line (resultView causeText). */
  causeLabel?: string;
  /** ui.result params resolved by the caller (preview flags included). Absent = v1 card, square only. */
  resultParams?: { shareV2?: boolean; stories?: boolean } | null;
  /** Challenge link for this share (WS-2 mints it). Absent = the plain surviveorion.com last line. */
  challengeUrl?: string | null;
  /**
   * This run against a challenger (WS-5 fills it from the challenge result model).
   * `delta` = this run minus the challenger's score (positive: ahead). `targetScore` is the
   * challenger's score. Text and the v2 card only; the v1 card ignores it.
   */
  versus?: { callsign: string; delta: number; targetScore: number } | null;
}


/** Card format: the square card or the 1080x1920 story (story needs `ui.result.stories`, else it renders square). */
export type ShareFormat = "square" | "story";

/** Box the share trace is fitted into (box units; WS-S may change it when it draws the trace). */
export const SHARE_TRACE_BOX: TraceBox = { x: 0, y: 0, w: 1000, h: 1000 };

export const SHARE_URL = "https://surviveorion.com";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function loadMedalSvg(tier: MedalTier): Promise<HTMLImageElement | null> {
  return loadImage(`/medals/${tier}.svg`);
}

/** The last share-text line: the plain site URL, or the challenge line when a link is present (copy: COPY in challenge.ts). */
export function shareLastLine(s: ShareStats): string {
  const url = s.challengeUrl;
  if (!url) return SHARE_URL;
  const v = s.versus;
  if (!v) return COPY.shareChallenger(url);
  if (v.delta > 0) return COPY.shareBackWin(v.callsign, v.targetScore, url);
  if (v.delta === 0) return COPY.shareBackTie(v.callsign, url);
  return COPY.shareBackLose(v.callsign, -v.delta, url);
}

export function buildShareText(s: ShareStats): string {
  const mins = Math.floor(s.time / 60);
  const secs = Math.floor(s.time % 60).toString().padStart(2, "0");
  const line = [
    `⏱ ${mins}:${secs}`,
    `${Math.floor(s.score).toLocaleString()} pts`,
    `×${s.maxMultiplier.toFixed(1)} peak`,
  ];
  if (s.rank !== null) line.push(`🏆 #${s.rank} today`);
  const medalLine = s.medal ? `${MEDAL_EMOJI[s.medal]} ${MEDAL_LABEL[s.medal]}` : null;
  return [
    `ORION Patrol #${s.dayNumber}`,
    s.preview ? "PREVIEW (not scored, not submitted)" : null,
    s.mutatorNames && s.mutatorNames.length > 0 ? s.mutatorNames.join(" + ") : null,
    line.join("  ·  "),
    medalLine,
    s.preview ? null : `attempt ${Math.min(s.attempt, DAILY_MAX_ATTEMPTS)}/${DAILY_MAX_ATTEMPTS}`,
    shareLastLine(s),
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** True when this device can share a PNG file (native app, or the Web Share API with files). Stories need it. */
export function canShareFiles(): boolean {
  if (isNativePlay() || isNativeApp()) return true;
  try {
    if (typeof navigator === "undefined" || typeof navigator.canShare !== "function" || typeof File === "undefined") return false;
    return navigator.canShare({ files: [new File([""], "orion-patrol.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

export type ShareOutcome = "shared" | "copied" | "failed";

// Share card layout. Rows used to sit at a fixed 130 px pitch, so six rows ran
// to y=1074, past the frame (1024) and the footer (966). The pitch now comes
// from the row count so every card ends above ROWS_BOTTOM_MAX.
const CARD_SIZE = 1080;
const ROWS_TOP = 360;
/** Lowest pixel any row may touch: clear of the footer text at y=966. */
export const SHARE_ROWS_BOTTOM_MAX = 930;
const ROW_PITCH_MAX = 130;
/** Below this pitch a row (label + value) would collide with the next one. */
export const SHARE_ROW_PITCH_MIN = 92;

export interface ShareRowLayout {
  /** Label baseline per row. */
  ys: number[];
  pitch: number;
  /** Value baseline offset from the label baseline. */
  valueDy: number;
  /** Value font size in px. */
  valueSize: number;
  /** Lowest pixel any row touches (value baseline plus descender). */
  bottom: number;
}

/** Row positions for 1 to 6 rows (more are squeezed the same way). */
export function shareRowLayout(count: number): ShareRowLayout {
  const n = Math.max(1, count);
  const compact = n > 4;
  const valueDy = compact ? 54 : 64;
  const valueSize = compact ? 48 : 56;
  const descent = 12;
  const lastMax = SHARE_ROWS_BOTTOM_MAX - valueDy - descent;
  const pitch = n === 1 ? ROW_PITCH_MAX : Math.min(ROW_PITCH_MAX, Math.floor((lastMax - ROWS_TOP) / (n - 1)));
  const ys = Array.from({ length: n }, (_, i) => ROWS_TOP + pitch * i);
  return { ys, pitch, valueDy, valueSize, bottom: ys[n - 1] + valueDy + descent };
}

/** The ORION mark drawn with canvas paths (fallback when the SVG will not load). */
export function drawOrionMarkPaths(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const k = size / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 10;
  // four ring segments, centered at (50,50), radius 37, 45-degree gaps
  for (let i = 0; i < 4; i++) {
    const mid = (-Math.PI / 2) + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(50, 50, 37, mid - Math.PI / 4 + 0.13, mid + Math.PI / 4 - 0.13);
    ctx.stroke();
  }
  ctx.fillStyle = "#c41e3a";
  ctx.beginPath();
  ctx.arc(50, 50, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface ShareCardAssets {
  medalImg: CanvasImageSource | null;
  /** ORION mark image; null draws the canvas-path fallback. */
  markImg: CanvasImageSource | null;
}

/** Paint the card. Pure drawing so tests can run it against a recording context. */
export function drawShareCard(ctx: CanvasRenderingContext2D, s: ShareStats, assets: ShareCardAssets): void {
  const size = CARD_SIZE;
  const bg = ctx.createRadialGradient(size / 2, size / 2, 40, size / 2, size / 2, size * 0.78);
  bg.addColorStop(0, "#12121e");
  bg.addColorStop(1, "#0a0a12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#2a2a3a";
  ctx.lineWidth = 3;
  ctx.strokeRect(56, 56, 968, 968);

  const gold = ctx.createLinearGradient(112, 0, 112, 200);
  gold.addColorStop(0, "#ffee88");
  gold.addColorStop(0.55, "#ffd700");
  gold.addColorStop(1, "#cc8800");

  // mark in the slot left of the wordmark (x 112..226)
  const MARK_X = 112;
  const MARK_Y = 126;
  const MARK_SIZE = 92;
  if (assets.markImg) ctx.drawImage(assets.markImg, MARK_X, MARK_Y, MARK_SIZE, MARK_SIZE);
  else drawOrionMarkPaths(ctx, MARK_X, MARK_Y, MARK_SIZE);

  ctx.fillStyle = gold;
  ctx.font = "700 72px Rajdhani, system-ui, sans-serif";
  ctx.fillText("ORION", 226, 190);
  ctx.fillStyle = "#8a7a55";
  ctx.font = "600 28px Rajdhani, system-ui, sans-serif";
  ctx.fillText(`DAILY PATROL No. ${s.dayNumber}`, 226, 232);

  const mins = Math.floor(s.time / 60);
  const secs = Math.floor(s.time % 60).toString().padStart(2, "0");
  const lines: Array<[string, string, string]> = [
    ["SCORE", Math.floor(s.score).toLocaleString(), "#ffd700"],
    ["SURVIVED", `${mins}:${secs}`, "#fff7e0"],
    ["PEAK", `×${s.maxMultiplier.toFixed(1)}`, "#fff7e0"],
  ];
  if (s.rank !== null) lines.push(["RANK", `#${s.rank} today`, "#fff7e0"]);
  if (s.medal) lines.push(["MEDAL", MEDAL_LABEL[s.medal], MEDAL_WORD_COLOR[s.medal]]);
  if (s.mutatorNames && s.mutatorNames.length > 0) {
    lines.push(["TODAY'S MUTATOR", s.mutatorNames.join(" + "), "#ff4455"]);
  }

  const layout = shareRowLayout(lines.length);
  const medalSize = layout.valueSize;
  lines.forEach(([label, value, color], i) => {
    const y = layout.ys[i];
    ctx.fillStyle = "#8a7a55";
    ctx.font = "600 28px Rajdhani, system-ui, sans-serif";
    ctx.fillText(label, 112, y);
    ctx.fillStyle = color;
    ctx.font = `700 ${layout.valueSize}px Rajdhani, system-ui, sans-serif`;
    if (label === "MEDAL" && assets.medalImg) {
      ctx.drawImage(assets.medalImg, 112, y + 16, medalSize, medalSize);
      ctx.fillText(value, 112 + medalSize + 16, y + layout.valueDy);
    } else {
      ctx.fillText(value, 112, y + layout.valueDy);
    }
  });

  ctx.fillStyle = "#8a7a55";
  ctx.font = "600 28px Rajdhani, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("surviveorion.com", 968, 966);
  ctx.textAlign = "left";
}

/** True when this run may draw the v2 card (`ui.result.shareV2`). */
export function useShareV2(s: ShareStats): boolean {
  return s.resultParams?.shareV2 === true;
}

/** The format actually drawn: stories only with `ui.result.stories` (and v2 art), else square. */
export function effectiveShareFormat(s: ShareStats, format: ShareFormat): ShareFormat {
  return format === "story" && s.resultParams?.stories === true && useShareV2(s) ? "story" : "square";
}

/** Brand-kit share card as a PNG blob: 1080 square, or 1080x1920 for Stories (v2 only). */
export async function renderShareCardPng(s: ShareStats, format: ShareFormat = "square"): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const v2 = useShareV2(s);
  const fmt = effectiveShareFormat(s, format);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_SIZE;
  canvas.height = v2 && fmt === "story" ? STORY_HEIGHT : CARD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (v2) {
    try {
      await document.fonts?.load("700 64px Rajdhani");
      await document.fonts?.load("600 22px Rajdhani");
    } catch {
      /* system fallback font */
    }
  }
  const [medalImg, markImg] = await Promise.all([
    s.medal ? loadMedalSvg(s.medal) : Promise.resolve(null),
    loadImage("/orion-mark.svg"),
  ]);
  if (v2) drawShareCardV2(ctx, shareCardV2Model(s, fmt), { medalImg, markImg, markFallback: drawOrionMarkPaths });
  else drawShareCard(ctx, s, { medalImg, markImg });
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/**
 * Native share sheet where it makes sense (phones), clipboard otherwise.
 * A user-cancelled share sheet still counts as "shared" — no error toast.
 */
async function pngToBase64(png: Blob | null | undefined): Promise<string | null> {
  if (!png) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(png);
  });
}

export async function shareText(
  text: string,
  preferNative: boolean,
  png?: Blob | null,
  url: string = SHARE_URL,
): Promise<ShareOutcome> {
  if (isNativePlay()) {
    postNativeShare(text, await pngToBase64(png));
    return "shared";
  }
  if (isNativeApp()) {
    const ok = await nativeShare(text, png);
    if (ok) return "shared";
  }
  if (preferNative && typeof navigator.share === "function") {
    try {
      const files =
        png && typeof File !== "undefined"
          ? [new File([png], "orion-patrol.png", { type: "image/png" })]
          : undefined;
      if (files && navigator.canShare?.({ files })) {
        await navigator.share({ text, url, files });
      } else {
        await navigator.share({ text, url });
      }
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

export async function sharePatrol(
  stats: ShareStats,
  preferNative: boolean,
  format: ShareFormat = "square",
): Promise<ShareOutcome> {
  const text = buildShareText(stats);
  const png = await renderShareCardPng(stats, format);
  return shareText(text, preferNative, png, stats.challengeUrl || SHARE_URL);
}
