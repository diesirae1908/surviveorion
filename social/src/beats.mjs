/**
 * Beat-sheet presets from EDITING.md + HOOKS.md. Pure, unit-tested.
 */

import { assertCaptionVoice, formatScore } from "./captions.mjs";

export const DURATION_CAPS = {
  SPACE_DUST: { min: 6, max: 9 },
  CLOSE_CALL: { min: 8, max: 11 },
  THE_BOARD: { min: 9, max: 12 },
  TODAYS_PATROL: { min: 10, max: 14 },
};

export const FREEZE_S = 0.4;
export const MAX_MEMES = { SPACE_DUST: 3, CLOSE_CALL: 2, THE_BOARD: 2, TODAYS_PATROL: 2 };

/** Compressed mutator sublines, max 4 words (HOOKS.md + the rest of the pool). */
export const SUBLINE_HOOKS = {
  arsenal: "double the pickups.",
  starfall: "it rains meteors today.",
  "the-pit": "the arena shrank 30%.",
  pit: "the arena shrank 30%.",
  giants: "every drone is huge.",
  "cryo-winter": "everything freezes.",
  minefield: "mines. everywhere.",
  blackout: "warnings last half.",
  "red-alert": "everything comes faster.",
  "the-flood": "packs surge one way.",
  "great-wall": "only walls hunt.",
  "year-of-the-serpent": "only trains hunt.",
  menagerie: "hunters take turns.",
  "lancer-doctrine": "lances sweep in.",
  wheelhouse: "wheels in lanes.",
  "hunting-party": "hunters from edges.",
  "demolition-day": "bombs then shrapnel.",
  titanfall: "one giant evo.",
  overcharge: "every power hits harder.",
  "iron-barrage": "missiles all day.",
  singularity: "vortex drops often.",
  "solar-wind": "a constant crosswind.",
  "magnetic-field": "pickups drift in.",
};

/**
 * @param {string} text
 */
export function wordCount(text) {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Wrap to max 2 lines, 4 words/line. Does not invent wording.
 * @param {string} text
 * @param {number} [maxWords]
 * @param {number} [maxLines]
 * @returns {string[]}
 */
export function wrapHook(text, maxWords = 4, maxLines = 2) {
  const words = String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= maxWords) return [words.join(" ")];
  const lines = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    const room = maxWords;
    const take = words.slice(i, i + room);
    lines.push(take.join(" "));
    i += take.length;
  }
  return lines;
}

/**
 * @param {string[]} lines
 * @param {string} label
 */
export function assertBeatLines(lines, label) {
  if (lines.length > 2) {
    throw new Error(`${label}: more than 2 lines`);
  }
  for (const line of lines) {
    if (wordCount(line) > 4) {
      throw new Error(`${label}: more than 4 words on "${line}"`);
    }
    assertCaptionVoice(line, label);
  }
}

/**
 * @param {number} clearance
 */
export function closeCallPct(clearance) {
  return Math.max(0, clearance * 100).toFixed(1);
}

/**
 * @param {{ clearance: number }} graze
 */
export function closeCallBeat1(graze) {
  const pct = closeCallPct(graze.clearance);
  if (Number(pct) <= 8) return `${pct}% FROM DEATH`;
  return `DEATH MISSED BY ${pct}%`;
}

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 */
export function boardBeat1(sidecar) {
  return `${formatScore(sidecar.score)}. one life.`;
}

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 */
export function patrolBeat1(sidecar) {
  const name = sidecar.mutatorNames[0] || "PATROL";
  return `${name} DAY`;
}

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 */
export function patrolSubline(sidecar) {
  const id = sidecar.mutatorIds[0];
  if (id && SUBLINE_HOOKS[id]) return SUBLINE_HOOKS[id];
  return "today's daily patrol.";
}

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 */
export function spaceDustBeat1(sidecar) {
  const s = Math.max(0, Math.round(sidecar.survivalTime));
  return `day ${sidecar.day}: ${s} SECONDS`;
}

/**
 * @param {{ outStart: number, outEnd: number }[]} beats
 */
export function sheetDuration(beats) {
  return beats.reduce((m, b) => Math.max(m, b.outEnd), 0);
}

/**
 * @param {import('./plan.mjs').FormatId} format
 * @param {number} duration
 */
export function assertDurationCap(format, duration) {
  const cap = DURATION_CAPS[format];
  if (!cap) throw new Error(`unknown format ${format}`);
  if (duration < cap.min - 1e-3 || duration > cap.max + 1e-3) {
    throw new Error(
      `${format} duration ${duration.toFixed(2)}s outside ${cap.min}-${cap.max}s`
    );
  }
}

/**
 * @typedef {object} Beat
 * @property {string} id
 * @property {number} outStart
 * @property {number} outEnd
 * @property {'gameplay'|'flash'|'freeze'|'card'} kind
 * @property {number} [srcStart]
 * @property {number} [srcEnd]
 * @property {number} [rate]
 * @property {number} [punch]
 * @property {string[]} [lines]
 * @property {'starlight'|'alarm'|'gold'} [color]
 * @property {string[]} [memes]
 * @property {{ name: string, at: number }[]} [sfx]
 * @property {boolean} [scoreOdometer]
 * @property {boolean} [scoreCard]
 */

/**
 * @param {import('./plan.mjs').FormatId} format
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @param {number} duration
 * @param {{ graze?: { time: number, clearance: number, x?: number, y?: number } }} [extras]
 * @returns {{ format: string, beats: Beat[], duration: number, memes: string[], punches: {at:number,value:number}[], shakes: {at:number,amp?:number}[] }}
 */
export function buildBeatSheet(format, sidecar, duration, extras = {}) {
  if (format === "CLOSE_CALL") return closeCallSheet(sidecar, duration, extras.graze);
  if (format === "SPACE_DUST") return spaceDustSheet(sidecar, duration);
  if (format === "THE_BOARD") return theBoardSheet(sidecar, duration);
  if (format === "TODAYS_PATROL") return todaysPatrolSheet(sidecar, duration);
  throw new Error(`Unknown format for beat sheet: ${format}`);
}

function clampSrc(t, duration) {
  return Math.min(Math.max(0, t), duration);
}

function finish(format, beats, punches, shakes) {
  const duration = sheetDuration(beats);
  assertDurationCap(format, duration);
  const memes = [];
  for (const b of beats) {
    if (b.lines) assertBeatLines(b.lines, `${format} ${b.id}`);
    for (const m of b.memes ?? []) {
      if (!memes.includes(m)) memes.push(m);
    }
  }
  const cap = MAX_MEMES[format] ?? 2;
  if (memes.length > cap) {
    throw new Error(`${format}: ${memes.length} memes > max ${cap}`);
  }
  return { format, beats, duration, memes, punches, shakes };
}

function closeCallSheet(sidecar, duration, graze) {
  if (!graze) {
    throw new Error("CLOSE_CALL beat sheet needs a graze");
  }
  const t = graze.time;
  const lived = t + 0.6 < duration - 0.05;
  const beat1 = wrapHook(closeCallBeat1(graze));
  const beat2 = wrapHook("watch the top");
  const beat3 = wrapHook(lived ? "he lived." : "he did not.");
  const cta = wrapHook("could you? ▶");

  // Source windows from EDITING.md. Output times are the preset.
  const openSrc = 0.9;
  const ctxSrc = 3.9 * 1.25;
  const grazeSrcStart = clampSrc(t - 0.4, duration);
  const grazeSrcEnd = clampSrc(t + 0.6, duration);
  const afterSrc = 2.0;

  const beats = [
    {
      id: "cold-open",
      kind: "gameplay",
      outStart: 0,
      outEnd: 0.9,
      srcStart: clampSrc(t - openSrc / 2, duration),
      srcEnd: clampSrc(t + openSrc / 2, duration),
      rate: 1,
      punch: 1.5,
      lines: beat1,
      color: "starlight",
      sfx: [{ name: "riser", at: 0 }],
    },
    {
      id: "flash",
      kind: "flash",
      outStart: 0.9,
      outEnd: 1.1,
      sfx: [{ name: "rewind", at: 0.9 }],
    },
    {
      id: "context",
      kind: "gameplay",
      outStart: 1.1,
      outEnd: 5.0,
      srcStart: clampSrc(t - 6, duration),
      srcEnd: clampSrc(t - 6 + ctxSrc, duration),
      rate: 1.25,
      punch: 1,
      lines: beat2,
      color: "starlight",
      textAt: 2.5,
    },
    {
      id: "graze",
      kind: "gameplay",
      outStart: 5.0,
      outEnd: 7.0,
      srcStart: grazeSrcStart,
      srcEnd: grazeSrcEnd,
      rate: 0.45,
      punch: 1.4,
      memes: ["red-circle"],
      sfx: [{ name: "boom", at: 5.5 }],
    },
    {
      id: "aftermath",
      kind: "gameplay",
      outStart: 7.0,
      outEnd: 9.0,
      srcStart: clampSrc(t + 0.6, duration),
      srcEnd: clampSrc(t + 0.6 + afterSrc, duration),
      rate: 1,
      punch: 1,
      lines: beat3,
      color: lived ? "starlight" : "alarm",
    },
    {
      id: "freeze",
      kind: "freeze",
      outStart: 9.0,
      outEnd: 9.0 + FREEZE_S,
      lines: cta,
      color: "starlight",
      memes: ["could-you"],
    },
  ];

  const punches = [
    { at: 0, value: 1.5 },
    { at: 1.1, value: 1 },
    { at: 5.0, value: 1.4 },
    { at: 7.0, value: 1 },
  ];
  const shakes = [{ at: 5.5, amp: 6, dur: 0.2 }];
  return finish("CLOSE_CALL", beats, punches, shakes);
}

function spaceDustSheet(sidecar, duration) {
  const s = Math.max(0, Math.round(sidecar.survivalTime));
  const death = duration;
  const runStart = duration <= 9 ? 0 : Math.max(0, duration - 8);
  const beats = [
    {
      id: "cold-open",
      kind: "gameplay",
      outStart: 0,
      outEnd: 0.8,
      srcStart: clampSrc(death - 0.8 * 1.5, duration),
      srcEnd: death,
      rate: 1.5,
      punch: 1.5,
      lines: wrapHook(spaceDustBeat1(sidecar)),
      color: "starlight",
      sfx: [{ name: "riser", at: 0 }],
    },
    {
      id: "flash",
      kind: "flash",
      outStart: 0.8,
      outEnd: 1.0,
      sfx: [{ name: "rewind", at: 0.8 }],
    },
    {
      id: "run",
      kind: "gameplay",
      outStart: 1.0,
      outEnd: 4.5,
      srcStart: runStart,
      srcEnd: clampSrc(runStart + 3.5, duration),
      rate: 1,
      punch: 1,
    },
    {
      id: "moment",
      kind: "card",
      outStart: 4.5,
      outEnd: 5.0,
      memes: ["at-this-moment"],
      sfx: [{ name: "boom", at: 4.5 }],
    },
    {
      id: "death",
      kind: "gameplay",
      outStart: 5.0,
      outEnd: 6.5,
      srcStart: clampSrc(death - 0.75, duration),
      srcEnd: death,
      rate: 0.5,
      punch: 1.4,
      memes: ["he-knew", "rip"],
      sfx: [{ name: "wah", at: 5.4 }],
    },
    {
      id: "freeze",
      kind: "freeze",
      outStart: 6.5,
      outEnd: 6.5 + FREEZE_S,
      lines: wrapHook(`${s}s. undefeated. ▶`),
      color: "starlight",
    },
  ];
  const punches = [
    { at: 0, value: 1.5 },
    { at: 1.0, value: 1 },
    { at: 5.0, value: 1.4 },
  ];
  return finish("SPACE_DUST", beats, punches, []);
}

function theBoardSheet(sidecar, duration) {
  const last = Math.min(9, duration);
  const srcStart = Math.max(0, duration - last);
  const beats = [
    {
      id: "cold-open",
      kind: "gameplay",
      outStart: 0,
      outEnd: 1.0,
      srcStart: clampSrc(duration - 1.0, duration),
      srcEnd: duration,
      rate: 1,
      punch: 1.5,
      lines: wrapHook(boardBeat1(sidecar)),
      color: "gold",
      sfx: [{ name: "riser", at: 0 }],
    },
    {
      id: "flash",
      kind: "flash",
      outStart: 1.0,
      outEnd: 1.2,
      sfx: [{ name: "rewind", at: 1.0 }],
    },
    {
      id: "stretch",
      kind: "gameplay",
      outStart: 1.2,
      outEnd: 8.0,
      srcStart,
      srcEnd: clampSrc(srcStart + 6.8 * 1.25, duration),
      rate: 1.25,
      punch: 1,
      lines: wrapHook("still alive somehow"),
      color: "starlight",
      textAt: 4.0,
      scoreOdometer: true,
    },
    {
      id: "slam",
      kind: "gameplay",
      outStart: 8.0,
      outEnd: 9.5,
      srcStart: clampSrc(duration - 1.5, duration),
      srcEnd: duration,
      rate: 1,
      punch: 1.2,
      scoreCard: true,
      sfx: [{ name: "boom", at: 8.0 }],
    },
    {
      id: "freeze",
      kind: "freeze",
      outStart: 9.5,
      outEnd: 9.5 + FREEZE_S,
      lines: ["same seed as you.", "▶"],
      color: "starlight",
    },
  ];
  const punches = [
    { at: 0, value: 1.5 },
    { at: 1.2, value: 1 },
    { at: 4.0, value: 1.15 },
    { at: 6.0, value: 1 },
    { at: 8.0, value: 1.2 },
  ];
  return finish("THE_BOARD", beats, punches, []);
}

function todaysPatrolSheet(sidecar, duration) {
  const name = sidecar.mutatorNames[0] || "PATROL";
  const stretchSrc = Math.min(duration, 8.28);
  const chaosStart = Math.max(0, Math.min(duration, stretchSrc) - 1.4);
  const beats = [
    {
      id: "cold-open",
      kind: "gameplay",
      outStart: 0,
      outEnd: 1.4,
      srcStart: chaosStart,
      srcEnd: clampSrc(chaosStart + 1.4, duration),
      rate: 1,
      punch: 1.5,
      lines: wrapHook(`${name} DAY`),
      color: "alarm",
      sfx: [{ name: "braam", at: 0 }],
    },
    {
      id: "flash",
      kind: "flash",
      outStart: 1.4,
      outEnd: 1.6,
      sfx: [{ name: "rewind", at: 1.4 }],
    },
    {
      id: "stretch",
      kind: "gameplay",
      outStart: 1.6,
      outEnd: 8.5,
      srcStart: 0,
      srcEnd: stretchSrc,
      rate: 1.2,
      punch: 1,
      lines: wrapHook(patrolSubline(sidecar)),
      color: "starlight",
      textAt: 3.2,
    },
    {
      id: "everyone",
      kind: "gameplay",
      outStart: 5.5,
      outEnd: 8.5,
      srcStart: 0,
      srcEnd: stretchSrc,
      rate: 1.2,
      punch: 1,
      lines: ["everyone flies this", "exact run."],
      color: "starlight",
      overlayOnly: true,
    },
    {
      id: "cta",
      kind: "gameplay",
      outStart: 8.5,
      outEnd: 11.0,
      srcStart: clampSrc(stretchSrc * 0.6, duration),
      srcEnd: clampSrc(stretchSrc * 0.6 + 2.5, duration),
      rate: 1,
      punch: 1,
      lines: ["3 attempts. free.", "today only."],
      color: "starlight",
    },
    {
      id: "freeze",
      kind: "freeze",
      outStart: 11.0,
      outEnd: 11.0 + FREEZE_S,
      lines: wrapHook("your move, pilot"),
      color: "starlight",
    },
  ];
  const punches = [
    { at: 0, value: 1.5 },
    { at: 1.6, value: 1 },
    { at: 8.5, value: 1.1 },
  ];
  return finish("TODAYS_PATROL", beats, punches, []);
}

/**
 * Gameplay segments only, in output order (skip overlay-only).
 * @param {Beat[]} beats
 */
export function gameplayBeats(beats) {
  return beats.filter((b) => b.kind === "gameplay" && !b.overlayOnly);
}

/**
 * Text events for ASS / PNG, using textAt when set.
 * @param {Beat[]} beats
 */
export function textEvents(beats) {
  return beats
    .filter((b) => b.lines?.length)
    .map((b) => ({
      start: b.textAt ?? b.outStart,
      end: b.outEnd,
      lines: b.lines,
      color: b.color ?? "starlight",
      id: b.id,
    }));
}
