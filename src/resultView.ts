// Result screen v2 (switch `ui.result`, params `resultV2` / `deathMoment`).
// Renders the content of the game-over screen: header, hero score with a
// count-up, the flight trace, the medal bar, three chips and the cause line.
// The actions (FLY AGAIN, SHARE, BASE, Details, Gold Patrol card) are wired in
// ui.ts, which owns the callbacks; this module has no callbacks and no sim
// state, only the stats it is handed. Presentation only: it never touches what
// is submitted to the server. Styles: src/styles/result.css, imported by main.ts
// (a CSS import here would break the tsx tests that load this module).

import type { FormationKind } from "./config";
import { appendDeathPoint, pathData, traceToPath, type TraceBox, type TraceSample } from "./flightTrace";
import { MEDAL_LABEL, type MedalThresholds, type MedalTier } from "./medals";
import type { DeathCause } from "./types";

// --- design constants (not switches) ---

/**
 * Screen title. "SIGNAL LOST" approved by Lucas 2026-10-30 (plan decision 5,
 * brand/VOICE.md). The old game-over screen keeps "GAME OVER".
 */
export const RESULT_HEADER = "SIGNAL LOST";
/** Hero score count-up. */
export const COUNT_UP_MS = 900;
/** The result slides up out of the death veil over this long (CSS transition). */
export const SLIDE_MS = 400;
/**
 * Gold Patrol card sits below FLY AGAIN, share and the chips (plan decision 6,
 * Lucas approved 2026-10-30). Same copy, same button, same callback.
 */
export const GOLD_CARD_BELOW = true;
/** Trace art box (SVG user units). */
const TRACE_VIEW = { w: 360, h: 430 };
const TRACE_BOX: TraceBox = { x: 36, y: 196, w: 288, h: 222 };

// --- the data this screen reads (a slice of GameOverStats, kept local so this stays DOM-free to import) ---

export interface ResultViewStats {
  score: number;
  /** Seconds survived. */
  time: number;
  kills: number;
  maxMultiplier: number;
  daily: boolean;
  gameMode: string;
  mutatorNames?: string[];
  preview?: boolean;
  /** Past Daily file tag ("PATROL #12"), already formatted by the caller. */
  archiveTag?: string | null;
  isNewBest: boolean;
  prevBest?: number;
  runCount?: number;
  track?: ReadonlyArray<TraceSample>;
  field?: { w: number; h: number };
  deathCause?: DeathCause | null;
  grazes?: number;
  hotCount?: number;
  medalThresholds?: MedalThresholds;
  effects?: "full" | "lite";
}

// --- pure helpers (tested in scripts/test-result-view.ts) ---

/**
 * Every death-cause line in one place (copy approval: Lucas edits only this
 * table). A line reads "<verb> <article> <name> at M:SS"; the name is the
 * highlighted noun. An empty article means the name carries its own ("the swarm").
 */
export interface CauseLine {
  verb: string;
  article: string;
  name: string;
}
const DOWNED = "Downed by";
const CAUGHT = "Caught in";
export const CAUSE_LINES = {
  drone: { verb: DOWNED, article: "a", name: "loose drone" },
  mine: { verb: "Hit", article: "a", name: "mine" },
  beam: { verb: "Caught by", article: "a", name: "lighthouse" },
  crater: { verb: "Hit", article: "a", name: "meteor crater" },
  formation: {
    line: { verb: DOWNED, article: "a", name: "drone line" },
    ring: { verb: CAUGHT, article: "a", name: "drone ring" },
    burst: { verb: DOWNED, article: "a", name: "spawn burst" },
    wall: { verb: DOWNED, article: "a", name: "drone wall" },
    serpent: { verb: DOWNED, article: "a", name: "serpent train" },
    pincer: { verb: CAUGHT, article: "a", name: "pincer" },
    corners: { verb: CAUGHT, article: "a", name: "corner trap" },
    tightring: { verb: CAUGHT, article: "a", name: "closing ring" },
    swarm: { verb: DOWNED, article: "", name: "the swarm" },
    megawall: { verb: DOWNED, article: "", name: "the Great Wall" },
  } satisfies Record<FormationKind, CauseLine>,
  creature: {
    lance: { verb: DOWNED, article: "a", name: "LANCE" },
    wheel: { verb: DOWNED, article: "a", name: "WHEEL" },
    hunter: { verb: DOWNED, article: "a", name: "HUNTER" },
    bomb: { verb: DOWNED, article: "a", name: "BOMB" },
  } as Record<string, CauseLine>,
  /** Unknown detail never prints "undefined". */
  formationFallback: { verb: DOWNED, article: "a", name: "formation" },
  creatureFallback: { verb: DOWNED, article: "a", name: "creature" },
};

export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export interface CauseParts {
  before: string;
  /** Highlighted noun ("" when the line has no named cause). */
  name: string;
  after: string;
}

function lineFor(cause: DeathCause): CauseLine {
  switch (cause.kind) {
    case "formation":
      return (CAUSE_LINES.formation as Record<string, CauseLine>)[cause.detail ?? ""] ?? CAUSE_LINES.formationFallback;
    case "creature":
      return CAUSE_LINES.creature[cause.detail ?? ""] ?? CAUSE_LINES.creatureFallback;
    case "mine":
      return CAUSE_LINES.mine;
    case "beam":
      return CAUSE_LINES.beam;
    case "crater":
      return CAUSE_LINES.crater;
    case "drone":
    default:
      return CAUSE_LINES.drone;
  }
}

/** "Downed by a drone line at 0:47" in Mission Control voice (brand/VOICE.md). */
export function causeParts(cause: DeathCause): CauseParts {
  const l = lineFor(cause);
  return {
    before: `${l.verb} ${l.article ? `${l.article} ` : ""}`,
    name: l.name,
    after: ` at ${fmtClock(cause.time)}`,
  };
}

export function causeText(cause: DeathCause): string {
  const p = causeParts(cause);
  return `${p.before}${p.name}${p.after}`;
}

export interface MedalBarModel {
  /** Tier marks along the bar (0..1), copper, silver, gold. */
  ticks: Record<MedalTier, number>;
  /** This run's marker (0..1). */
  fill: number;
  reached: Record<MedalTier, boolean>;
  /** The tier to chase, null once GOLD is reached. */
  next: MedalTier | null;
  /** Points still needed for `next`. */
  toGo: number;
}

/** Equal thirds per tier so Copper, Silver and Gold read evenly; fill is piecewise linear between thresholds. */
export function medalBarModel(score: number, t: MedalThresholds): MedalBarModel {
  const s = Math.max(0, Math.floor(score));
  const ticks: Record<MedalTier, number> = { copper: 1 / 3, silver: 2 / 3, gold: 1 };
  let fill: number;
  if (s >= t.gold) fill = 1;
  else if (s >= t.silver) fill = 2 / 3 + ((s - t.silver) / (t.gold - t.silver)) / 3;
  else if (s >= t.copper) fill = 1 / 3 + ((s - t.copper) / (t.silver - t.copper)) / 3;
  else fill = (s / t.copper) / 3;
  const reached = { copper: s >= t.copper, silver: s >= t.silver, gold: s >= t.gold };
  const next: MedalTier | null = !reached.copper ? "copper" : !reached.silver ? "silver" : !reached.gold ? "gold" : null;
  return { ticks, fill: Math.max(0, Math.min(1, fill)), reached, next, toGo: next ? t[next] - s : 0 };
}

/** Chips shown under the medal bar. Always three; the hot line only when the run went hot. */
export function resultChips(s: Pick<ResultViewStats, "kills" | "maxMultiplier" | "grazes">): Array<{ label: string; value: string }> {
  return [
    { label: "KILLS", value: String(s.kills) },
    { label: "PEAK CHAIN", value: `×${s.maxMultiplier.toFixed(1)}` },
    { label: "GRAZES", value: String(s.grazes ?? 0) },
  ];
}

export function hotLine(hotCount: number | undefined): string | null {
  if (!hotCount || hotCount < 1) return null;
  return `Ran hot ${hotCount} ${hotCount === 1 ? "time" : "times"}`;
}

/** Subtitle line over the screen: "SIGNAL LOST · DAILY PATROL · MUTATOR". */
export function headerLine(s: Pick<ResultViewStats, "daily" | "gameMode" | "mutatorNames" | "preview" | "archiveTag">): string {
  const parts: string[] = [RESULT_HEADER];
  if (s.daily) {
    parts.push(s.preview ? "DAILY PATROL PREVIEW" : (s.archiveTag ?? "DAILY PATROL"));
    if (s.mutatorNames && s.mutatorNames.length > 0) parts.push(s.mutatorNames.join(" + "));
  } else if (s.gameMode === "ironrain") parts.push("IRON RAIN");
  return parts.join(" · ");
}

/** NEW PERSONAL BEST only on a real improvement over a prior score, after the first run (same rule as today). */
export function showNewBest(s: Pick<ResultViewStats, "isNewBest" | "prevBest" | "runCount">): boolean {
  return s.isNewBest && (s.prevBest ?? 0) > 0 && (s.runCount ?? 0) > 1;
}

// --- DOM ---

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function div(cls: string, html = ""): HTMLElement {
  const e = document.createElement("div");
  e.className = cls;
  e.innerHTML = html;
  return e;
}

/** Ease-out count-up on the hero digits. Lite effects (and reduced motion) show the final number at once. */
export function startCountUp(el: HTMLElement, target: number, lite: boolean): void {
  const final = Math.floor(target).toLocaleString();
  el.textContent = final;
  if (lite || target < 10 || typeof requestAnimationFrame === "undefined") return;
  const t0 = performance.now();
  el.textContent = "0";
  const step = (now: number): void => {
    if (!el.isConnected && now - t0 > 50) {
      el.textContent = final;
      return;
    }
    const p = Math.min(1, (now - t0) / COUNT_UP_MS);
    const e = 1 - (1 - p) * (1 - p) * (1 - p);
    el.textContent = p >= 1 ? final : Math.floor(target * e).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Header, hero score, tags and the flight trace behind them. */
export function buildResultStage(s: ResultViewStats): HTMLElement {
  const stage = div("rv-stage");
  stage.appendChild(buildTrace(s));
  stage.appendChild(div("rv-eyebrow", esc(headerLine(s))));
  const hero = div("rv-hero");
  const score = div("rv-score");
  startCountUp(score, s.score, s.effects === "lite");
  hero.appendChild(score);
  hero.appendChild(div("rv-sub", `SCORE · SURVIVED ${fmtClock(s.time)}`));
  stage.appendChild(hero);
  const tags = div("rv-tags");
  if (showNewBest(s)) tags.appendChild(div("rv-tag light", "NEW PERSONAL BEST"));
  const rank = div("rv-tag gold");
  rank.id = "result-rank-tag";
  rank.hidden = true; // filled by setGameOverRank when a daily rank exists
  tags.appendChild(rank);
  stage.appendChild(tags);
  return stage;
}

function buildTrace(s: ResultViewStats): HTMLElement {
  const wrap = div("rv-trace");
  wrap.setAttribute("aria-hidden", "true");
  if (!s.track || s.track.length < 1 || !s.field) return wrap;
  const path = appendDeathPoint(traceToPath(s.track, s.field, TRACE_BOX), s.deathCause);
  if (path.points.length < 2) return wrap;
  const d = pathData(path);
  const [sx, sy] = path.points[0];
  let death = "";
  if (path.death) {
    const [x, y] = path.death;
    const rays = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return `<line x1="${(x + Math.cos(a) * 9).toFixed(1)}" y1="${(y + Math.sin(a) * 9).toFixed(1)}" x2="${(x + Math.cos(a) * 17).toFixed(1)}" y2="${(y + Math.sin(a) * 17).toFixed(1)}"/>`;
    }).join("");
    death =
      `<g class="rv-impact" style="transform-origin:${x.toFixed(1)}px ${y.toFixed(1)}px">` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15" fill="rgba(196,30,58,0.28)"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#ff4455"/>` +
      `<g stroke="#ff4455" stroke-width="2" stroke-linecap="round">${rays}</g></g>`;
  }
  wrap.innerHTML =
    `<svg viewBox="0 0 ${TRACE_VIEW.w} ${TRACE_VIEW.h}" preserveAspectRatio="xMidYMid meet" focusable="false">` +
    `<defs><linearGradient id="rv-trace-grad" x1="0" y1="1" x2="0" y2="0">` +
    `<stop offset="0" stop-color="#cc8800" stop-opacity="0.25"/><stop offset="1" stop-color="#ffee88"/></linearGradient></defs>` +
    `<path class="rv-trace-glow" d="${d}" pathLength="1"/>` +
    `<path class="rv-trace-line" d="${d}" pathLength="1" stroke="url(#rv-trace-grad)"/>` +
    `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4" fill="none" stroke="#ffd700" stroke-width="2"/>` +
    death +
    `</svg>`;
  return wrap;
}

/** Copper / Silver / Gold track with this run's marker and "N to go". Null when the day has no medals. */
export function buildMedalBar(s: ResultViewStats): HTMLElement | null {
  if (!s.medalThresholds) return null;
  const m = medalBarModel(s.score, s.medalThresholds);
  const head = m.next
    ? `<span>NEXT MEDAL · ${MEDAL_LABEL[m.next]}</span><b>${m.toGo.toLocaleString()} TO GO</b>`
    : `<span>ALL MEDALS EARNED</span><b>GOLD</b>`;
  const tier = (t: MedalTier): string =>
    `<span class="rv-tier ${t}${m.reached[t] ? " got" : ""}">${MEDAL_LABEL[t]}${m.reached[t] ? " ✓" : ""}</span>`;
  const ticks = (["copper", "silver"] as MedalTier[])
    .map((t) => `<i class="rv-tick" style="left:${(m.ticks[t] * 100).toFixed(2)}%"></i>`)
    .join("");
  const bar = div(
    "rv-medal chamfer",
    `<div class="rv-medal-head">${head}</div>` +
      `<div class="rv-medal-track"><div class="rv-medal-fill" style="width:${(m.fill * 100).toFixed(2)}%"></div>${ticks}` +
      `<i class="rv-medal-marker" style="left:${(m.fill * 100).toFixed(2)}%"></i></div>` +
      `<div class="rv-medal-tiers">${tier("copper")}${tier("silver")}${tier("gold")}</div>`,
  );
  return bar;
}

export function buildChips(s: ResultViewStats): HTMLElement {
  const wrap = div("rv-chips-wrap");
  const row = div("rv-chips");
  for (const c of resultChips(s)) {
    row.appendChild(div("rv-chip chamfer", `<b>${esc(c.value)}</b><span>${c.label}</span>`));
  }
  wrap.appendChild(row);
  const hot = hotLine(s.hotCount);
  if (hot) wrap.appendChild(div("rv-hot", esc(hot)));
  return wrap;
}

export function buildCauseLine(s: ResultViewStats): HTMLElement | null {
  if (!s.deathCause) return null;
  const p = causeParts(s.deathCause);
  return div("rv-cause", `${esc(p.before)}${p.name ? `<b>${esc(p.name)}</b>` : ""}${esc(p.after)}`);
}

/** Everything above the actions, in reading order. */
export function buildResultTop(s: ResultViewStats): HTMLElement[] {
  const out: HTMLElement[] = [buildResultStage(s)];
  const medal = buildMedalBar(s);
  if (medal) out.push(medal);
  out.push(buildChips(s));
  const cause = buildCauseLine(s);
  if (cause) out.push(cause);
  return out;
}
