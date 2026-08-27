/**
 * Pure cut-plan math from a RunRecord.
 */

import { buildBeatSheet } from "./beats.mjs";
import { resolveCropMode } from "./crop.mjs";

/** @typedef {'CLOSE_CALL'|'SPACE_DUST'|'THE_BOARD'|'TODAYS_PATROL'} FormatId */

/**
 * @typedef {object} CutSegment
 * @property {number} start
 * @property {number} end
 */

/**
 * @typedef {object} SlowMoSegment
 * @property {number} start
 * @property {number} end
 * @property {number} rate
 */

/**
 * @typedef {object} CutPlan
 * @property {FormatId} format
 * @property {string} sourceBasename
 * @property {CutSegment} cut
 * @property {SlowMoSegment} [slowMo]
 * @property {{ time: number, clearance: number, x?: number, y?: number }} [graze]
 * @property {import('./beats.mjs').Beat[]} [beats]
 * @property {number} [sheetDuration]
 * @property {'v2.0'|'v2.1'} cropMode
 */

const CLOSE_CALL_MAX = 2;
const CLOSE_CALL_CLEARANCE = 0.15;

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @returns {{ time: number, clearance: number }[]}
 */
export function eligibleCloseCallGrazes(sidecar) {
  const seen = new Set();
  /** @type {{ time: number, clearance: number }[]} */
  const grazes = [];

  for (const g of sidecar.topGrazes) {
    if (g.clearance <= CLOSE_CALL_CLEARANCE) {
      const key = `${g.time}:${g.clearance}`;
      if (!seen.has(key)) {
        seen.add(key);
        grazes.push({
          time: g.time,
          clearance: g.clearance,
          ...(g.x != null && g.y != null ? { x: g.x, y: g.y } : {}),
        });
      }
    }
  }

  if (sidecar.closestCall && sidecar.closestCall.clearance <= CLOSE_CALL_CLEARANCE) {
    const c = sidecar.closestCall;
    const key = `${c.time}:${c.clearance}`;
    if (!seen.has(key)) {
      grazes.push({ time: c.time, clearance: c.clearance, x: c.x, y: c.y });
    }
  }

  grazes.sort((a, b) => a.clearance - b.clearance || a.time - b.time);
  const top = grazes.slice(0, CLOSE_CALL_MAX);
  if (sidecar.closestCall) {
    const c = sidecar.closestCall;
    for (const g of top) {
      if (g.x == null && g.time === c.time) {
        g.x = c.x;
        g.y = c.y;
      }
    }
  }
  return top;
}

/**
 * @param {number} t
 * @param {number} end
 * @returns {{ cut: CutSegment, slowMo: SlowMoSegment }}
 */
export function closeCallCut(t, end) {
  return {
    cut: {
      start: Math.max(0, t - 6),
      end: Math.min(t + 4, end),
    },
    slowMo: {
      start: t - 0.4,
      end: t + 0.6,
      rate: 0.5,
    },
  };
}

/**
 * @param {number} duration
 * @returns {CutSegment}
 */
export function spaceDustCut(duration) {
  if (duration <= 9) {
    return { start: 0, end: duration };
  }
  return { start: Math.max(0, duration - 8), end: duration };
}

/**
 * Last ~10s of source (v2 board stretch + death). No endcard.
 * @param {number} duration
 * @returns {CutSegment}
 */
export function theBoardCut(duration) {
  return {
    start: Math.max(0, duration - 10),
    end: duration,
  };
}

/**
 * Representative first stretch. v1 22s patrol is retired.
 * @param {number} duration
 * @returns {CutSegment}
 */
export function todaysPatrolCut(duration) {
  return { start: 0, end: Math.min(10, duration) };
}

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @returns {boolean}
 */
export function isSpaceDustEligible(sidecar) {
  return sidecar.survivalTime < 20 || sidecar.score < 5000;
}

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @returns {boolean}
 */
export function isTheBoardEligible(sidecar) {
  return sidecar.medal === "gold" || sidecar.score >= 1_000_000;
}

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @param {boolean} isFirstOfUtcDay
 * @returns {boolean}
 */
export function isTodaysPatrolEligible(sidecar, isFirstOfUtcDay) {
  return isFirstOfUtcDay && sidecar.mutatorIds.length > 0;
}

/**
 * @typedef {object} PlanInput
 * @property {string} sourceBasename
 * @property {import('./sidecar.mjs').ClipSidecar} sidecar
 * @property {number} duration
 * @property {boolean} [isFirstOfUtcDay]
 */

/**
 * Build all cut plans for one harvested run.
 * @param {PlanInput} input
 * @returns {CutPlan[]}
 */
export function buildCutPlans({ sourceBasename, sidecar, duration, isFirstOfUtcDay = false }) {
  /** @type {CutPlan[]} */
  const plans = [];
  const cropMode = resolveCropMode(sidecar);

  for (const graze of eligibleCloseCallGrazes(sidecar)) {
    const { cut, slowMo } = closeCallCut(graze.time, duration);
    const sheet = buildBeatSheet("CLOSE_CALL", sidecar, duration, { graze });
    plans.push({
      format: "CLOSE_CALL",
      sourceBasename,
      cut,
      slowMo,
      graze,
      beats: sheet.beats,
      sheetDuration: sheet.duration,
      punches: sheet.punches,
      shakes: sheet.shakes,
      cropMode,
    });
  }

  if (isSpaceDustEligible(sidecar)) {
    const sheet = buildBeatSheet("SPACE_DUST", sidecar, duration);
    plans.push({
      format: "SPACE_DUST",
      sourceBasename,
      cut: spaceDustCut(duration),
      beats: sheet.beats,
      sheetDuration: sheet.duration,
      punches: sheet.punches,
      shakes: sheet.shakes,
      cropMode,
    });
  }

  if (isTheBoardEligible(sidecar)) {
    const sheet = buildBeatSheet("THE_BOARD", sidecar, duration);
    plans.push({
      format: "THE_BOARD",
      sourceBasename,
      cut: theBoardCut(duration),
      beats: sheet.beats,
      sheetDuration: sheet.duration,
      punches: sheet.punches,
      shakes: sheet.shakes,
      cropMode,
    });
  }

  if (isTodaysPatrolEligible(sidecar, isFirstOfUtcDay)) {
    const sheet = buildBeatSheet("TODAYS_PATROL", sidecar, duration);
    plans.push({
      format: "TODAYS_PATROL",
      sourceBasename,
      cut: todaysPatrolCut(duration),
      beats: sheet.beats,
      sheetDuration: sheet.duration,
      punches: sheet.punches,
      shakes: sheet.shakes,
      cropMode,
    });
  }

  return plans;
}

/**
 * @param {CutPlan[]} plans
 * @returns {string}
 */
export function formatCutPlansForLog(plans) {
  return JSON.stringify(plans, null, 2);
}
