/**
 * Clip sidecar parse and filename contract validation.
 */

import { parseSidecarFilename } from "./filename.mjs";

const MEDALS = new Set(["gold", "silver", "copper", null]);

/**
 * @typedef {object} Graze
 * @property {number} time
 * @property {number} [clearance]
 * @property {number} [x]
 * @property {number} [y]
 */

/**
 * @typedef {object} ClipSidecar
 * @property {number} day
 * @property {string[]} mutatorIds
 * @property {string[]} mutatorNames
 * @property {number} score
 * @property {'gold'|'silver'|'copper'|null} medal
 * @property {number} survivalTime
 * @property {({ time: number, x: number, y: number, clearance: number }|null)} closestCall
 * @property {{ time: number, clearance: number }[]} topGrazes
 */

/**
 * @param {unknown} raw
 * @param {string} basename - for loud errors
 * @returns {ClipSidecar}
 */
export function parseSidecar(raw, basename) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `Sidecar contract mismatch for "${basename}": JSON must be an object`
    );
  }

  const o = /** @type {Record<string, unknown>} */ (raw);
  const prefix = `Sidecar contract mismatch for "${basename}"`;

  if (typeof o.day !== "number" || !Number.isInteger(o.day)) {
    throw new Error(`${prefix}: day must be an integer`);
  }
  if (!Array.isArray(o.mutatorIds) || !o.mutatorIds.every((id) => typeof id === "string")) {
    throw new Error(`${prefix}: mutatorIds must be a string array`);
  }
  if (!Array.isArray(o.mutatorNames) || !o.mutatorNames.every((n) => typeof n === "string")) {
    throw new Error(`${prefix}: mutatorNames must be a string array`);
  }
  if (typeof o.score !== "number" || !Number.isFinite(o.score)) {
    throw new Error(`${prefix}: score must be a number`);
  }
  if (!MEDALS.has(/** @type {null|string} */ (o.medal))) {
    throw new Error(`${prefix}: medal must be gold, silver, copper, or null`);
  }
  if (typeof o.survivalTime !== "number" || !Number.isFinite(o.survivalTime)) {
    throw new Error(`${prefix}: survivalTime must be a number`);
  }

  let closestCall = null;
  if (o.closestCall !== null) {
    if (typeof o.closestCall !== "object" || Array.isArray(o.closestCall)) {
      throw new Error(`${prefix}: closestCall must be an object or null`);
    }
    const c = /** @type {Record<string, unknown>} */ (o.closestCall);
    if (
      typeof c.time !== "number" ||
      typeof c.x !== "number" ||
      typeof c.y !== "number" ||
      typeof c.clearance !== "number"
    ) {
      throw new Error(`${prefix}: closestCall fields must be numbers`);
    }
    closestCall = {
      time: c.time,
      x: c.x,
      y: c.y,
      clearance: c.clearance,
    };
  }

  if (!Array.isArray(o.topGrazes)) {
    throw new Error(`${prefix}: topGrazes must be an array`);
  }
  const topGrazes = o.topGrazes.map((g, i) => {
    if (typeof g !== "object" || g === null || Array.isArray(g)) {
      throw new Error(`${prefix}: topGrazes[${i}] must be an object`);
    }
    const graze = /** @type {Record<string, unknown>} */ (g);
    if (typeof graze.time !== "number" || typeof graze.clearance !== "number") {
      throw new Error(`${prefix}: topGrazes[${i}] needs time and clearance`);
    }
    return { time: graze.time, clearance: graze.clearance };
  });

  return {
    day: o.day,
    mutatorIds: o.mutatorIds,
    mutatorNames: o.mutatorNames,
    score: Math.floor(o.score),
    medal: /** @type {ClipSidecar['medal']} */ (o.medal),
    survivalTime: o.survivalTime,
    closestCall,
    topGrazes,
  };
}

/**
 * Validate parsed filename against sidecar fields. Fail loudly; never guess.
 * @param {ReturnType<typeof parseSidecarFilename>} filename
 * @param {ClipSidecar} sidecar
 */
export function validateFilenameSidecarPair(filename, sidecar) {
  const { basename } = filename;
  const prefix = `Filename/sidecar drift for "${basename}"`;

  if (filename.day !== sidecar.day) {
    throw new Error(
      `${prefix}: day ${sidecar.day} in JSON vs day${filename.day} in filename`
    );
  }
  if (filename.score !== sidecar.score) {
    throw new Error(
      `${prefix}: score ${sidecar.score} in JSON vs ${filename.score} in filename`
    );
  }

  const expectedSlot =
    sidecar.mutatorIds.length === 0
      ? filename.mutatorSlot
      : sidecar.mutatorIds.join("+");

  if (sidecar.mutatorIds.length === 0) {
    if (!["classic", "ironrain"].includes(filename.mutatorSlot)) {
      throw new Error(
        `${prefix}: fullgame run needs classic or ironrain slot, got "${filename.mutatorSlot}"`
      );
    }
  } else if (filename.mutatorSlot !== sidecar.mutatorIds.join("+")) {
    throw new Error(
      `${prefix}: mutator slot "${filename.mutatorSlot}" vs mutatorIds [${sidecar.mutatorIds.join(", ")}]`
    );
  }

  if (sidecar.mutatorIds.length > 0 && filename.mutatorIds.join("+") !== expectedSlot) {
    throw new Error(`${prefix}: mutator slot parse failed`);
  }
}

/**
 * @param {string} jsonText
 * @param {string} jsonBasename
 * @returns {{ filename: ReturnType<typeof parseSidecarFilename>, sidecar: ClipSidecar }}
 */
export function parseSidecarFile(jsonText, jsonBasename) {
  let raw;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `Sidecar contract mismatch for "${jsonBasename}": invalid JSON (${/** @type {Error} */ (err).message})`
    );
  }
  const sidecar = parseSidecar(raw, jsonBasename);
  const filename = parseSidecarFilename(jsonBasename);
  validateFilenameSidecarPair(filename, sidecar);
  return { filename, sidecar };
}
