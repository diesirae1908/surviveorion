/**
 * Pure cut-plan math from a RunRecord.
 */

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
 * @property {number} [endcardSeconds]
 * @property {{ time: number, clearance: number }} [graze]
 */

const CLOSE_CALL_MAX = 2;
const CLOSE_CALL_CLEARANCE = 0.15;
const ENCARD_SECONDS = 1.5;

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
        grazes.push(g);
      }
    }
  }

  if (sidecar.closestCall && sidecar.closestCall.clearance <= CLOSE_CALL_CLEARANCE) {
    const c = sidecar.closestCall;
    const key = `${c.time}:${c.clearance}`;
    if (!seen.has(key)) {
      grazes.push({ time: c.time, clearance: c.clearance });
    }
  }

  grazes.sort((a, b) => a.clearance - b.clearance || a.time - b.time);
  return grazes.slice(0, CLOSE_CALL_MAX);
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
  if (duration <= 12) {
    return { start: 0, end: duration };
  }
  return { start: Math.max(0, duration - 8), end: duration };
}

/**
 * @param {number} duration
 * @returns {CutSegment}
 */
export function theBoardCut(duration) {
  return {
    start: Math.max(0, duration - 12),
    end: duration,
  };
}

/**
 * @param {number} duration
 * @returns {CutSegment}
 */
export function todaysPatrolCut(duration) {
  return { start: 0, end: Math.min(22, duration) };
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

  for (const graze of eligibleCloseCallGrazes(sidecar)) {
    const { cut, slowMo } = closeCallCut(graze.time, duration);
    plans.push({
      format: "CLOSE_CALL",
      sourceBasename,
      cut,
      slowMo,
      graze,
    });
  }

  if (isSpaceDustEligible(sidecar)) {
    plans.push({
      format: "SPACE_DUST",
      sourceBasename,
      cut: spaceDustCut(duration),
    });
  }

  if (isTheBoardEligible(sidecar)) {
    plans.push({
      format: "THE_BOARD",
      sourceBasename,
      cut: theBoardCut(duration),
      endcardSeconds: ENCARD_SECONDS,
    });
  }

  if (isTodaysPatrolEligible(sidecar, isFirstOfUtcDay)) {
    plans.push({
      format: "TODAYS_PATROL",
      sourceBasename,
      cut: todaysPatrolCut(duration),
      endcardSeconds: ENCARD_SECONDS,
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
