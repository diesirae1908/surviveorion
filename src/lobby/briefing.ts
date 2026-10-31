// Mission briefing before the first daily launch of a patrol day (owner: WS-B).
// Pure logic (shouldShow, briefingModel) is tested in node; the overlay only maps
// the model to DOM. No gameplay change: nothing is passed to startRun, no grace
// window. Switch: ui.lobby.briefing (client, default off; needs ui.lobby.enabled).

import type { LobbyParams } from "../flags";

export interface BriefingContext {
  patrolDate: string;
  patrolNumber: number;
  mutators: { name: string; subline: string; hudRule: string; tags: string[] }[];
  quick: boolean;
  mode: "daily" | "training" | "classic" | "ironrain" | "tutorial" | "firstFlight";
  archive: boolean;
  preview: boolean;
  effects: "full" | "lite";
  shake: boolean;
  params: LobbyParams | null;
  /** Native play and Capacitor pass false: the briefing is web only. */
  allowed: boolean;
  /** Plays the briefing stamp sound (the audio module's briefingStamp). */
  playStamp: () => void;
}

/** Design constants (timings, caps, storage key). */
export const BRIEFING_MS = 4000;
export const SKIP_AFTER_MS = 600;
export const BRIEFING_MAX_ROWS = 3;
export const BRIEFING_STORAGE_KEY = "orion.briefing.v1";
const TITLE_MAX = 140;
const SAME_RUN_LINE = "SAME RUN FOR EVERY PILOT TODAY";

export interface BriefingRow {
  title: string;
  detail: string;
}

export interface BriefingModel {
  header: string;
  patrolLine: string;
  /** Single-mutator day: the one name. Sunday: the names joined with " + ". */
  names: string[];
  rows: BriefingRow[];
  sameRunLine: string | null;
  previewTag: boolean;
  briefingMs: number;
  skipAfterMs: number;
  animate: boolean;
  shake: boolean;
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(BRIEFING_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSeen(date: string): void {
  try {
    localStorage.setItem(BRIEFING_STORAGE_KEY, date);
  } catch {
    // private mode: the briefing may show again, harmless
  }
}

/**
 * First daily launch of the patrol day only. `seen` is injectable for node tests;
 * the default reads localStorage.
 */
export function shouldShow(ctx: BriefingContext, seen: string | null = readSeen()): boolean {
  return (
    ctx.allowed &&
    ctx.params?.briefing === true &&
    ctx.mode === "daily" &&
    !ctx.archive &&
    !ctx.quick &&
    seen !== ctx.patrolDate
  );
}

/** Whether LAUNCH writes the patrol-date key: previews never do. */
export function shouldRecordSeen(ctx: BriefingContext, go: boolean): boolean {
  return go && !ctx.preview;
}

/** Sentences of a mutator subline, trimmed. */
export function sublineSentences(subline: string): string[] {
  return subline
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** The short rule line of a mutator (<= 44 chars). Falls back to the first subline sentence only if a mutator has none. */
function ruleLine(m: BriefingContext["mutators"][number]): string {
  const rule = m.hudRule.trim();
  return rule || clip((sublineSentences(m.subline)[0] ?? "").replace(/\.$/, ""), TITLE_MAX);
}

/**
 * One row per mutator, from its short `hudRule`. One mutator: the rule is the
 * row. Several (Sunday): the name with its rule under it. No other mutator
 * field is short enough for a supporting row, so there are none.
 */
export function briefingRows(mutators: BriefingContext["mutators"]): BriefingRow[] {
  if (mutators.length === 0) return [];
  if (mutators.length === 1) return [{ title: ruleLine(mutators[0]), detail: "" }];
  return mutators.slice(0, BRIEFING_MAX_ROWS).map((m) => ({ title: m.name, detail: ruleLine(m) }));
}

export function briefingModel(ctx: BriefingContext): BriefingModel {
  const animate = ctx.effects === "full";
  return {
    header: "INCOMING TRANSMISSION",
    patrolLine: `PATROL #${ctx.patrolNumber} · ${ctx.patrolDate}`,
    names: ctx.mutators.map((m) => m.name),
    rows: briefingRows(ctx.mutators),
    sameRunLine: ctx.mutators.length > 0 ? SAME_RUN_LINE : null,
    previewTag: ctx.preview,
    briefingMs: BRIEFING_MS,
    skipAfterMs: SKIP_AFTER_MS,
    animate,
    shake: animate && ctx.shake,
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const HEX_SVG =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,4 91,27 91,73 50,96 9,73 9,27" fill="#0a0a12" stroke="#ffd700" stroke-width="3"/><polygon points="50,14 82,32 82,68 50,86 18,68 18,32" fill="none" stroke="#cc8800" stroke-width="1.2" stroke-dasharray="3 4"/><path d="M54 24 L38 54 H49 L44 78 L63 46 H51 Z" fill="#ffd700"/></svg>';

/**
 * Show the briefing. Resolves true on LAUNCH (tap or Space), false on Escape.
 * The patrol date is written only on LAUNCH and never for previews.
 */
export async function maybeShowBriefing(ctx: BriefingContext): Promise<boolean> {
  // briefing.css is a static import in main.ts (node tests load this file without CSS).
  const model = briefingModel(ctx);
  const host = document.getElementById("ui") ?? document.body;
  return new Promise<boolean>((resolve) => {
    const root = el("div", "screen briefing" + (model.animate ? " briefing-anim" : " briefing-static"));
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Mission briefing");

    const head = el("div", "briefing-head");
    head.append(el("div", "briefing-kicker", model.header), el("div", "briefing-patrol", model.patrolLine));
    if (model.previewTag) head.append(el("div", "briefing-preview", "PREVIEW"));
    root.append(head);

    const emblem = el("div", "briefing-emblem");
    emblem.innerHTML = HEX_SVG;
    root.append(emblem);

    const cond = el("div", "briefing-cond");
    cond.append(el("div", "briefing-cond-label", model.names.length > 1 ? "TODAY'S CONDITIONS" : "TODAY'S CONDITION"));
    const nameEl = el("div", "briefing-name" + (model.shake ? " briefing-shake" : ""), model.names.join(" + "));
    cond.append(nameEl);
    root.append(cond);

    const rows = el("div", "briefing-rows");
    model.rows.forEach((r, i) => {
      const row = el("div", "briefing-row");
      row.style.setProperty("--bf-i", String(i));
      row.append(el("div", "briefing-row-title", r.title));
      if (r.detail) row.append(el("div", "briefing-row-detail", r.detail));
      rows.append(row);
    });
    root.append(rows);

    const foot = el("div", "briefing-foot");
    if (model.sameRunLine) foot.append(el("div", "briefing-same", model.sameRunLine));
    const launch = el("button", "briefing-launch", "LAUNCH");
    launch.type = "button";
    foot.append(launch);
    root.append(foot);

    let done = false;
    let ready = false; // LAUNCH state: everything resolved
    const timers: number[] = [];
    const finish = (go: boolean): void => {
      if (done) return;
      done = true;
      for (const t of timers) window.clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
      root.remove();
      if (shouldRecordSeen(ctx, go)) writeSeen(ctx.patrolDate);
      resolve(go);
    };
    const toLaunch = (): void => {
      if (ready) return;
      ready = true;
      root.classList.add("briefing-ready");
      launch.focus({ preventScroll: true });
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish(false);
      } else if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        if (ready) finish(true);
        else if (performance.now() - shownAt >= model.skipAfterMs) toLaunch();
      }
    };
    const shownAt = performance.now();
    launch.addEventListener("click", (e) => {
      e.stopPropagation();
      if (ready) finish(true);
    });
    root.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (!ready && performance.now() - shownAt >= model.skipAfterMs) toLaunch();
    });
    window.addEventListener("keydown", onKey, true);

    host.append(root);
    if (model.animate) {
      // name stamps in at ~35% of the sequence
      timers.push(window.setTimeout(() => ctx.playStamp(), Math.round(model.briefingMs * 0.35)));
      timers.push(window.setTimeout(toLaunch, model.briefingMs));
    } else {
      // lite / reduced motion: static card, ready at once
      toLaunch();
    }
  });
}
