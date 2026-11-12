// Share card v2 (ui.result.shareV2): the run's flight trace is the picture, the
// score is the hero, the medal insignia and the mutator sit on top. One layout
// serves the 1080 square (feeds) and the 1080x1920 story; the story keeps every
// element out of Instagram's top 250 px and bottom 300 px UI zones.
//
// shareCardV2Model is pure (numbers and strings, no canvas, no DOM) so node
// tests can check every box against the frame and the safe zones.
// drawShareCardV2 only maps a model to canvas calls.

import { MEDAL_LABEL, type MedalTier } from "./medals";
import type { ShareStats } from "./share";

export const CARD_W = 1080;
export const SQUARE_H = 1080;
export const STORY_HEIGHT = 1920;
/** Story UI zones (px) that must stay empty of anything important. */
export const STORY_SAFE = { top: 250, bottom: 300 } as const;
/** Side and (square) top/bottom margin. */
export const SHARE_MARGIN = 72;

/** Medal word colors (brand tokens `--orion-medal-*`; gold is the brand gold). */
export const MEDAL_WORD_COLOR: Record<MedalTier, string> = {
  gold: "#ffd700",
  silver: "#d7d7d7",
  copper: "#cd7f32",
};

const BRONZE = "#aa8844";
const FLARE = "#fff7e0";
const RED = "#ff4455";
const GOLD = "#ffd700";
/** Rajdhani caps and digits run about 0.56 em; the estimate is deliberately a little wide. */
const EM = 0.56;
const FONT = "Rajdhani, system-ui, sans-serif";
/** Largest scale-up a short trace gets, so a tiny flight is not blown up into a blob. */
const TRACE_MAX_SCALE = 2.2;
/** Room kept around the trace for the impact burst and the line glow. */
const TRACE_PAD = 56;

export type ShareCardFormat = "square" | "story";

export interface V2Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface V2Text {
  text: string;
  x: number;
  /** Baseline. */
  y: number;
  size: number;
  weight: number;
  color: string;
  align: "left" | "right" | "center";
  /** letter-spacing in px */
  spacing: number;
}

export interface ShareCardV2Model {
  format: ShareCardFormat;
  w: number;
  h: number;
  /** Rows of content must sit inside [contentTop, contentBottom]. */
  contentTop: number;
  contentBottom: number;
  mark: V2Box;
  wordmark: V2Text;
  /** Patrol line, then the mutator in red. Same baseline; `y`, `size`, `spacing` shared. */
  sub: { x: number; y: number; size: number; spacing: number; parts: Array<{ text: string; color: string }> };
  trace: {
    box: V2Box;
    /** Trace points in card pixels (null: no run trace, draw the big ORION mark). */
    points: Array<[number, number]> | null;
    death: [number, number] | null;
    markBox: V2Box | null;
  };
  scoreLabel: V2Text;
  score: V2Text;
  /** Max width the score may use before the draw step shrinks it. */
  scoreMaxW: number;
  medal: { tier: MedalTier; box: V2Box; word: V2Text } | null;
  cause: V2Text | null;
  /** "VS GLINT  +12,480" row under the score. Only present when the run has a versus. */
  versus?: V2Text;
  rule: { y: number; x1: number; x2: number };
  stats: Array<{ label: V2Text; value: V2Text }>;
  footer: V2Text;
  /** Estimated extent of every drawn thing (for tests). */
  boxes: V2Box[];
  /** Deterministic star field seed. */
  seed: number;
}

/** Estimated advance width of caps/digit text. */
export function estTextWidth(text: string, size: number, spacing = 0): number {
  return text.length * (size * EM + spacing);
}

/** Cut `text` with an ellipsis so its estimated width stays within `maxW`. */
export function fitTextTo(text: string, size: number, spacing: number, maxW: number): string {
  if (estTextWidth(text, size, spacing) <= maxW) return text;
  const per = size * EM + spacing;
  const n = Math.max(1, Math.floor(maxW / per) - 1);
  return `${text.slice(0, n).trimEnd()}…`;
}

/** Uniform fit of `points` into `box` (centered, scale capped). Returns the mapped points. */
export function fitTracePoints(
  points: ReadonlyArray<[number, number]>,
  box: { x: number; y: number; w: number; h: number },
  pad = TRACE_PAD,
): Array<[number, number]> {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const aw = Math.max(1, box.w - pad * 2);
  const ah = Math.max(1, box.h - pad * 2);
  const k = Math.min(aw / bw, ah / bh, TRACE_MAX_SCALE);
  const ox = box.x + box.w / 2 - ((minX + maxX) / 2) * k;
  const oy = box.y + box.h / 2 - ((minY + maxY) / 2) * k;
  return points.map(([x, y]) => [x * k + ox, y * k + oy] as [number, number]);
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function shareCardV2Model(s: ShareStats, format: ShareCardFormat): ShareCardV2Model {
  const story = format === "story";
  const k = story ? 1.15 : 1;
  const w = CARD_W;
  const h = story ? STORY_HEIGHT : SQUARE_H;
  const M = SHARE_MARGIN;
  const top = story ? STORY_SAFE.top : M;
  const bottom = story ? h - STORY_SAFE.bottom : h - M;
  const boxes: V2Box[] = [];
  const text = (t: Partial<V2Text> & { text: string; x: number; y: number; size: number }): V2Text => ({
    weight: 700,
    color: FLARE,
    align: "left",
    spacing: 0,
    ...t,
  });
  const addTextBox = (id: string, t: V2Text): void => {
    const tw = estTextWidth(t.text, t.size, t.spacing);
    const x = t.align === "left" ? t.x : t.align === "right" ? t.x - tw : t.x - tw / 2;
    boxes.push({ id, x, y: t.y - t.size * 0.8, w: tw, h: t.size * 1.0 });
  };

  // --- header: mark, wordmark, patrol line + mutator ---
  const markSize = Math.round(84 * k);
  const mark: V2Box = { id: "mark", x: M, y: top, w: markSize, h: markSize };
  boxes.push(mark);
  const wmX = M + markSize + 22;
  const wmSize = Math.round(64 * k);
  const wordmark = text({
    text: "ORION",
    x: wmX,
    y: top + Math.round(markSize * 0.62),
    size: wmSize,
    color: GOLD,
    spacing: 10,
  });
  addTextBox("wordmark", wordmark);
  const subSize = Math.round(22 * k);
  const subSpacing = 4;
  const subY = top + Math.round(markSize * 0.94);
  const patrol = `DAILY PATROL No. ${s.dayNumber}`;
  const subMaxW = w - M - wmX;
  const mutators = s.mutatorNames && s.mutatorNames.length > 0 ? s.mutatorNames.join(" + ").toUpperCase() : "";
  const previewTag = s.preview ? "PREVIEW" : "";
  const parts: Array<{ text: string; color: string }> = [{ text: patrol, color: BRONZE }];
  let used = estTextWidth(patrol, subSize, subSpacing);
  const sep = " · ";
  if (mutators) {
    const room = subMaxW - used - estTextWidth(sep, subSize, subSpacing) - (previewTag ? estTextWidth(sep + previewTag, subSize, subSpacing) : 0);
    const m = fitTextTo(mutators, subSize, subSpacing, Math.max(60, room));
    parts.push({ text: sep, color: BRONZE }, { text: m, color: RED });
    used += estTextWidth(sep + m, subSize, subSpacing);
  }
  if (previewTag) {
    parts.push({ text: sep + previewTag, color: BRONZE });
    used += estTextWidth(sep + previewTag, subSize, subSpacing);
  }
  boxes.push({ id: "sub", x: wmX, y: subY - subSize * 0.8, w: used, h: subSize });
  const headerBottom = top + markSize;

  // --- stats row (bottom up) ---
  const valueSize = Math.round(52 * k);
  const labelSize = Math.round(20 * k);
  const valueBase = bottom - 12;
  const labelBase = valueBase - valueSize - 8;
  const rowTop = labelBase - labelSize;
  const footerSize = Math.round(22 * k);
  const footer = text({
    text: "surviveorion.com",
    x: w - M,
    y: valueBase,
    size: footerSize,
    color: BRONZE,
    weight: 600,
    align: "right",
    spacing: 3,
  });
  addTextBox("footer", footer);
  const footerW = estTextWidth(footer.text, footerSize, 3);

  const cols: Array<[string, string]> = [
    ["SURVIVED", fmtClock(s.time)],
    ["PEAK", `×${s.maxMultiplier.toFixed(1)}`],
  ];
  if (s.rank !== null) cols.push(["RANK", `#${s.rank.toLocaleString("en-US")}`]);
  else if ((s.kills ?? 0) > 0) cols.push(["KILLS", String(s.kills)]);
  const colGap = 44;
  const colsMaxW = w - 2 * M - footerW - 36;
  let vSize = valueSize;
  const colWidths = (vs: number): number[] =>
    cols.map(([l, v]) => Math.max(estTextWidth(l, labelSize, 4), estTextWidth(v, vs)));
  while (vSize > 30 && colWidths(vSize).reduce((a, b) => a + b, 0) + colGap * (cols.length - 1) > colsMaxW) vSize -= 2;
  const cw = colWidths(vSize);
  let cx = M;
  const stats = cols.map(([l, v], i) => {
    const label = text({ text: l, x: cx, y: labelBase, size: labelSize, color: BRONZE, weight: 600, spacing: 4 });
    const value = text({ text: v, x: cx, y: valueBase, size: vSize, color: FLARE });
    addTextBox(`label-${l}`, label);
    addTextBox(`value-${l}`, value);
    cx += cw[i] + colGap;
    return { label, value };
  });
  const rule = { y: rowTop - 18, x1: M, x2: w - M };

  // --- cause line ---
  const causeSize = Math.round(26 * k);
  let cause: V2Text | null = null;
  let causeTop = rowTop - 18;
  if (s.causeLabel) {
    const t = fitTextTo(s.causeLabel, causeSize, 0, w - 2 * M);
    cause = text({ text: t, x: M, y: rowTop - 18 - Math.round(26 * k), size: causeSize, color: "#c8bfa8", weight: 600 });
    addTextBox("cause", cause);
    causeTop = cause.y - causeSize;
  }

  // --- versus row (challenge): sits between the score and the cause line ---
  let versus: V2Text | undefined;
  if (s.versus) {
    const vsSize = Math.round(30 * k);
    const d = Math.round(s.versus.delta);
    const gap = `${d >= 0 ? "+" : "-"}${Math.abs(d).toLocaleString("en-US")}`;
    const tail = `  ${gap}`;
    const name = fitTextTo(`VS ${s.versus.callsign.toUpperCase()}`, vsSize, 3, w - 2 * M - estTextWidth(tail, vsSize, 3));
    versus = text({
      text: `${name}${tail}`,
      x: M,
      y: causeTop - Math.round(22 * k),
      size: vsSize,
      color: d >= 0 ? GOLD : RED,
      weight: 600,
      spacing: 3,
    });
    addTextBox("versus", versus);
    causeTop = versus.y - vsSize;
  }

  // --- score hero + medal ---
  const medalSize = s.medal ? Math.round(150 * k) : 0;
  const scoreMaxW = w - 2 * M - (s.medal ? medalSize + 28 : 0);
  const scoreText = Math.floor(s.score).toLocaleString("en-US");
  let scoreSize = Math.round(200 * k);
  while (scoreSize > 80 && estTextWidth(scoreText, scoreSize) > scoreMaxW) scoreSize -= 4;
  const scoreBase = causeTop - 40;
  const score = text({ text: scoreText, x: M, y: scoreBase, size: scoreSize, color: GOLD });
  boxes.push({ id: "score", x: M, y: scoreBase - scoreSize * 0.74, w: estTextWidth(scoreText, scoreSize), h: scoreSize * 0.74 + scoreSize * 0.18 });
  const scoreLabelSize = Math.round(22 * k);
  const scoreLabel = text({
    text: "SCORE",
    x: M,
    y: Math.round(scoreBase - scoreSize * 0.74 - 18),
    size: scoreLabelSize,
    color: BRONZE,
    weight: 600,
    spacing: 6,
  });
  addTextBox("scoreLabel", scoreLabel);

  let medal: ShareCardV2Model["medal"] = null;
  if (s.medal) {
    const wordSize = Math.round(28 * k);
    const wordY = scoreBase;
    const box: V2Box = { id: "medal", x: w - M - medalSize, y: wordY - wordSize - 22 - medalSize, w: medalSize, h: medalSize };
    const word = text({
      text: MEDAL_LABEL[s.medal].toUpperCase(),
      x: box.x + medalSize / 2,
      y: wordY,
      size: wordSize,
      color: MEDAL_WORD_COLOR[s.medal],
      align: "center",
      spacing: 5,
    });
    boxes.push(box);
    addTextBox("medalWord", word);
    medal = { tier: s.medal, box, word };
  }

  // --- the picture: flight trace (or the big mark for a lobby share) ---
  const traceTop = headerBottom + (story ? 40 : 28);
  const traceBottom = story ? scoreLabel.y - 40 : scoreBase - scoreSize * 0.32;
  const traceBox: V2Box = { id: "trace", x: M, y: traceTop, w: w - 2 * M, h: Math.max(120, traceBottom - traceTop) };
  let points: Array<[number, number]> | null = null;
  let death: [number, number] | null = null;
  let markBox: V2Box | null = null;
  const tp = s.trace;
  const raw: Array<[number, number]> = tp ? tp.points.map((p) => [p[0], p[1]] as [number, number]) : [];
  if (tp && raw.length >= 2) {
    const fitted = fitTracePoints(raw, traceBox);
    points = fitted;
    if (tp.death) {
      // the death point is the last appended point (appendDeathPoint)
      death = fitted[fitted.length - 1];
    }
  } else {
    const ms = Math.min(traceBox.h, traceBox.w, Math.round(380 * k));
    markBox = { id: "bigmark", x: w / 2 - ms / 2, y: traceBox.y + (traceBox.h - ms) / 2, w: ms, h: ms };
    boxes.push(markBox);
  }

  return {
    format,
    w,
    h,
    contentTop: top,
    contentBottom: bottom,
    mark,
    wordmark,
    sub: { x: wmX, y: subY, size: subSize, spacing: subSpacing, parts },
    trace: { box: traceBox, points, death, markBox },
    scoreLabel,
    score,
    scoreMaxW,
    medal,
    cause,
    ...(versus ? { versus } : {}),
    rule,
    stats,
    footer,
    boxes,
    seed: s.dayNumber * 2654435761,
  };
}

// --- drawing ---

export interface ShareCardV2Assets {
  medalImg: CanvasImageSource | null;
  markImg: CanvasImageSource | null;
  /** Canvas-path ORION mark for when the SVG will not load. */
  markFallback: (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => void;
}

function setFont(ctx: CanvasRenderingContext2D, t: V2Text, size = t.size): void {
  ctx.font = `${t.weight} ${size}px ${FONT}`;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${t.spacing}px`;
  ctx.textAlign = t.align;
  ctx.fillStyle = t.color;
}

function drawText(ctx: CanvasRenderingContext2D, t: V2Text): void {
  setFont(ctx, t);
  ctx.fillText(t.text, t.x, t.y);
}

/** Deterministic 0..1 hash (own tiny generator: the game's seeded streams are never touched). */
function hash01(seed: number, i: number): number {
  let x = (seed + i * 374761393) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return ((x >>> 0) % 100000) / 100000;
}

function drawBackdrop(ctx: CanvasRenderingContext2D, m: ShareCardV2Model): void {
  const { w, h } = m;
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, w, h);
  // warm impact glow where the run ended (or high left for a lobby share)
  const gx = m.trace.death ? m.trace.death[0] : w * 0.36;
  const gy = m.trace.death ? m.trace.death[1] : h * 0.25;
  const red = ctx.createRadialGradient(gx, gy, 10, gx, gy, h * 0.58);
  red.addColorStop(0, "rgba(196,30,58,0.34)");
  red.addColorStop(1, "rgba(196,30,58,0)");
  ctx.fillStyle = red;
  ctx.fillRect(0, 0, w, h);
  const gold = ctx.createRadialGradient(w * 0.88, h * 0.98, 10, w * 0.88, h * 0.98, h * 0.5);
  gold.addColorStop(0, "rgba(255,215,0,0.13)");
  gold.addColorStop(1, "rgba(255,215,0,0)");
  ctx.fillStyle = gold;
  ctx.fillRect(0, 0, w, h);
  // faint star field
  for (let i = 0; i < 70; i++) {
    const x = hash01(m.seed, i * 3) * w;
    const y = hash01(m.seed, i * 3 + 1) * h;
    const r = 0.8 + hash01(m.seed, i * 3 + 2) * 1.6;
    ctx.fillStyle = `rgba(255,247,224,${(0.12 + hash01(m.seed, i * 7 + 5) * 0.32).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // edge vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

function tracePath(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
}

function drawTrace(ctx: CanvasRenderingContext2D, m: ShareCardV2Model, assets: ShareCardV2Assets): void {
  const k = m.format === "story" ? 1.15 : 1;
  const pts = m.trace.points;
  if (!pts) {
    const b = m.trace.markBox;
    if (!b) return;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.shadowColor = "rgba(255,215,0,0.45)";
    ctx.shadowBlur = 50;
    if (assets.markImg) ctx.drawImage(assets.markImg, b.x, b.y, b.w, b.h);
    else assets.markFallback(ctx, b.x, b.y, b.w);
    ctx.restore();
    return;
  }
  const [sx, sy] = pts[0];
  const [ex, ey] = pts[pts.length - 1];
  const grad = ctx.createLinearGradient(sx, sy, ex, ey);
  grad.addColorStop(0, "rgba(204,136,0,0.35)");
  grad.addColorStop(0.55, "#ffd700");
  grad.addColorStop(1, "#ffee88");
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  tracePath(ctx, pts);
  ctx.strokeStyle = "rgba(255,215,0,0.10)";
  ctx.lineWidth = 30 * k;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,215,0,0.20)";
  ctx.lineWidth = 15 * k;
  ctx.stroke();
  ctx.strokeStyle = grad;
  ctx.lineWidth = 6 * k;
  ctx.stroke();
  // launch ring
  ctx.beginPath();
  ctx.arc(sx, sy, 11 * k, 0, Math.PI * 2);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3.5 * k;
  ctx.stroke();
  // impact burst
  const d = m.trace.death;
  if (d) {
    const [x, y] = d;
    const halo = ctx.createRadialGradient(x, y, 2, x, y, 64 * k);
    halo.addColorStop(0, "rgba(255,68,85,0.55)");
    halo.addColorStop(1, "rgba(255,68,85,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, 64 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 4 * k;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r0 = 20 * k;
      const r1 = (i % 2 === 0 ? 42 : 32) * k;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(x, y, 10 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff7e0";
    ctx.beginPath();
    ctx.arc(x, y, 4 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMedal(ctx: CanvasRenderingContext2D, m: ShareCardV2Model, assets: ShareCardV2Assets): void {
  const md = m.medal;
  if (!md) return;
  const b = md.box;
  ctx.save();
  ctx.shadowColor = `${MEDAL_WORD_COLOR[md.tier]}66`;
  ctx.shadowBlur = 36;
  if (assets.medalImg) {
    ctx.drawImage(assets.medalImg, b.x, b.y, b.w, b.h);
  } else {
    // hex insignia fallback
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const r = b.w / 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = MEDAL_WORD_COLOR[md.tier];
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.restore();
  drawText(ctx, md.word);
}

/** Paint the v2 card. Pure drawing so tests can run it against a recording context. */
export function drawShareCardV2(ctx: CanvasRenderingContext2D, m: ShareCardV2Model, assets: ShareCardV2Assets): void {
  drawBackdrop(ctx, m);
  drawTrace(ctx, m, assets);

  // header
  if (assets.markImg) ctx.drawImage(assets.markImg, m.mark.x, m.mark.y, m.mark.w, m.mark.h);
  else assets.markFallback(ctx, m.mark.x, m.mark.y, m.mark.w);
  const wmGrad = ctx.createLinearGradient(0, m.wordmark.y - m.wordmark.size, 0, m.wordmark.y);
  wmGrad.addColorStop(0, "#ffee88");
  wmGrad.addColorStop(0.55, "#ffd700");
  wmGrad.addColorStop(1, "#cc8800");
  setFont(ctx, m.wordmark);
  ctx.fillStyle = wmGrad;
  ctx.fillText(m.wordmark.text, m.wordmark.x, m.wordmark.y);
  // patrol line: parts share a baseline; advance by measured (or estimated) width
  {
    const sub = m.sub;
    ctx.font = `600 ${sub.size}px ${FONT}`;
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${sub.spacing}px`;
    ctx.textAlign = "left";
    let x = sub.x;
    for (const p of sub.parts) {
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, sub.y);
      const mw = ctx.measureText?.(p.text)?.width;
      x += typeof mw === "number" && mw > 0 ? mw : estTextWidth(p.text, sub.size, sub.spacing);
    }
  }

  // score hero: shrink to the measured width, gold gradient, soft glow
  {
    const t = m.score;
    let size = t.size;
    ctx.font = `${t.weight} ${size}px ${FONT}`;
    (ctx as unknown as { letterSpacing: string }).letterSpacing = "0px";
    for (let i = 0; i < 12; i++) {
      const mw = ctx.measureText?.(t.text)?.width;
      if (typeof mw !== "number" || mw <= m.scoreMaxW) break;
      size = Math.floor(size * 0.94);
      ctx.font = `${t.weight} ${size}px ${FONT}`;
    }
    drawText(ctx, m.scoreLabel);
    const g = ctx.createLinearGradient(0, t.y - size * 0.74, 0, t.y);
    g.addColorStop(0, "#ffee88");
    g.addColorStop(0.5, "#ffd700");
    g.addColorStop(1, "#cc8800");
    ctx.save();
    ctx.textAlign = "left";
    ctx.font = `${t.weight} ${size}px ${FONT}`;
    ctx.shadowColor = "rgba(255,215,0,0.38)";
    ctx.shadowBlur = 34;
    ctx.fillStyle = g;
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }
  drawMedal(ctx, m, assets);
  if (m.cause) drawText(ctx, m.cause);
  if (m.versus) drawText(ctx, m.versus);

  // hairline over the stats row
  ctx.fillStyle = "rgba(255,247,224,0.12)";
  ctx.fillRect(m.rule.x1, m.rule.y, m.rule.x2 - m.rule.x1, 1.5);
  for (const c of m.stats) {
    drawText(ctx, c.label);
    drawText(ctx, c.value);
  }
  drawText(ctx, m.footer);
  (ctx as unknown as { letterSpacing: string }).letterSpacing = "0px";
  ctx.textAlign = "left";
}
