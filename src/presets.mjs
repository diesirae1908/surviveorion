/**
 * Locked Phase B recipes. Do not invent looks. Fail loud when a clip cannot map.
 */

import { access } from "node:fs/promises";
import path from "node:path";

import { ASSETS, DAY43_BASE, PRESETS, defaultBoardMusic } from "./paths.mjs";

/** @typedef {'WASTED'|'PATROL'|'NEW_BEST'} LockedFormat */

export const LOCKED_FORMATS = /** @type {const} */ (["WASTED", "PATROL", "NEW_BEST"]);

export const IDEA_BY_FORMAT = {
  WASTED: 1,
  NEW_BEST: 2,
  PATROL: 8,
};

/** day43 locked source times from presets/day43-wasted-segments.sh */
export const DAY43_WASTED = {
  approach: 312.6,
  freeze: 317.1,
  slam: 318.5,
  durationHint: 319.9167,
};

export const PATROL_SRC_START = 120;
export const PATROL_PLAY_S = 8;
export const PATROL_FREEZE_S = 1.3;
export const PATROL_TOTAL_S = 9.3;

export const NEW_BEST_PLAY_S = 8;

export function isDay43Fixture(basename) {
  return String(basename).startsWith(DAY43_BASE);
}

/**
 * Pad source to 9:16 Void, then zoompan 1080x1920.
 * day43 2904x1656 -> 2904x5164, y offset 1754, y center 2582.
 * @param {number} width
 * @param {number} height
 * @param {string} basename
 */
export function voidPadSpec(width, height, basename) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 16 || height < 16) {
    throw new Error(`Cannot map source dims for "${basename}": ${width}x${height}`);
  }
  const padW = Math.round(width);
  const padH = Math.ceil((padW * 16) / 9 / 2) * 2;
  if (height > padH) {
    throw new Error(
      `Cannot map source dims for "${basename}": ${width}x${height} is taller than 9:16 Void pad ${padW}x${padH}`
    );
  }
  const padY = Math.round((padH - height) / 2);
  return {
    padW,
    padH,
    padX: 0,
    padY,
    yCenter: Math.round(padH / 2),
    filter: `pad=${padW}:${padH}:0:${padY}:color=#0a0a12`,
  };
}

/**
 * Scale locked day43 x-pan values when width != 2904.
 * @param {number} x
 * @param {number} width
 */
export function scalePanX(x, width) {
  return x * (width / 2904);
}

/**
 * @param {number} duration
 * @param {string} basename
 */
export function wastedSourceTimes(duration, basename) {
  if (isDay43Fixture(basename)) {
    if (duration < DAY43_WASTED.slam + 0.05) {
      throw new Error(
        `Cannot map WASTED times for "${basename}": duration ${duration}s < slam ${DAY43_WASTED.slam}`
      );
    }
    return { ...DAY43_WASTED };
  }
  const approach = duration - (DAY43_WASTED.durationHint - DAY43_WASTED.approach);
  const freeze = duration - (DAY43_WASTED.durationHint - DAY43_WASTED.freeze);
  const slam = duration - (DAY43_WASTED.durationHint - DAY43_WASTED.slam);
  if (approach < 0 || freeze < 0 || slam < 0 || slam > duration) {
    throw new Error(
      `Cannot map WASTED times for "${basename}": duration ${duration}s is too short for the locked 14.2s death recipe`
    );
  }
  return { approach, freeze, slam, durationHint: duration };
}

/**
 * @param {number} duration
 * @param {string} basename
 */
export function patrolSourceTimes(duration, basename) {
  const start = PATROL_SRC_START;
  const freezeAt = start + PATROL_PLAY_S;
  if (duration < freezeAt + 0.2) {
    throw new Error(
      `Cannot map PATROL times for "${basename}": duration ${duration}s cannot reach ARSENAL stretch at 2:00`
    );
  }
  return { start, freezeAt, playS: PATROL_PLAY_S, freezeS: PATROL_FREEZE_S };
}

/**
 * @param {number} duration
 * @param {string} basename
 */
export function newBestSourceTimes(duration, basename) {
  if (duration < NEW_BEST_PLAY_S) {
    throw new Error(
      `Cannot map NEW_BEST times for "${basename}": duration ${duration}s < last ${NEW_BEST_PLAY_S}s`
    );
  }
  return { start: duration - NEW_BEST_PLAY_S, playS: NEW_BEST_PLAY_S };
}

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @param {string} basename
 */
export function assertNewBestEligible(sidecar, basename) {
  if (isDay43Fixture(basename)) return;
  if (sidecar.bestScore == null) {
    throw new Error(
      `NEW_BEST cannot run for "${basename}": sidecar has no bestScore (score > HUD BEST required)`
    );
  }
  if (!(sidecar.score > sidecar.bestScore)) {
    throw new Error(
      `NEW_BEST cannot run for "${basename}": score ${sidecar.score} is not greater than bestScore ${sidecar.bestScore}`
    );
  }
}

/**
 * @param {import('./sidecar.mjs').ClipSidecar} sidecar
 * @param {string} basename
 */
export function isNewBestPickable(sidecar, basename) {
  if (isDay43Fixture(basename)) return true;
  return sidecar.bestScore != null && sidecar.score > sidecar.bestScore;
}

/**
 * @param {import('./harvest.mjs').RunRecord} record
 * @param {{ isFirstOfUtcDay?: boolean }} [opts]
 * @returns {LockedFormat[]}
 */
export function pickEligiblePresets(record, opts = {}) {
  /** @type {LockedFormat[]} */
  const out = [];
  const { sidecar, basename, probe } = record;

  try {
    wastedSourceTimes(probe.duration, basename);
    out.push("WASTED");
  } catch {
    /* clip cannot map */
  }

  const first = opts.isFirstOfUtcDay ?? false;
  if (first && sidecar.mutatorIds.length > 0) {
    try {
      patrolSourceTimes(probe.duration, basename);
      out.push("PATROL");
    } catch {
      /* clip cannot map */
    }
  }

  if (isNewBestPickable(sidecar, basename)) {
    try {
      newBestSourceTimes(probe.duration, basename);
      out.push("NEW_BEST");
    } catch {
      /* clip cannot map */
    }
  }

  return out;
}

/**
 * @param {string} filePath
 * @param {string} basename
 * @param {string} label
 */
export async function requireAsset(filePath, basename, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Missing ${label} for "${basename}": ${filePath}`);
  }
}

/**
 * @param {LockedFormat} format
 * @param {import('./harvest.mjs').RunRecord} record
 */
export async function requirePresetInputs(format, record) {
  const basename = record.basename;
  if (!record.videoPath) {
    throw new Error(`Missing video for "${basename}"`);
  }
  await requireAsset(record.videoPath, basename, "video");

  if (format === "WASTED") {
    await requireAsset(ASSETS.voHeKnew, basename, "he-knew VO");
    await requireAsset(ASSETS.wasted, basename, "wasted.png");
    await requireAsset(PRESETS.tagWasted, basename, "tag-wasted.png");
    await requireAsset(ASSETS.sfxBraam, basename, "braam");
    await requireAsset(defaultBoardMusic(), basename, "music bed");
    wastedSourceTimes(record.probe.duration, basename);
    voidPadSpec(record.probe.width, record.probe.height, basename);
  } else if (format === "PATROL") {
    await requireAsset(PRESETS.tagPatrol, basename, "tag-patrol.png");
    patrolSourceTimes(record.probe.duration, basename);
    voidPadSpec(record.probe.width, record.probe.height, basename);
  } else if (format === "NEW_BEST") {
    assertNewBestEligible(record.sidecar, basename);
    await requireAsset(ASSETS.celebrationFunk, basename, "celebration-funk.wav");
    await requireAsset(PRESETS.newBestBoardTemplate, basename, "NEW BEST board template");
    await requireAsset(PRESETS.newBestBoardFont, basename, "Rajdhani-Bold.ttf");
    newBestSourceTimes(record.probe.duration, basename);
    voidPadSpec(record.probe.width, record.probe.height, basename);
  } else {
    throw new Error(`Unknown locked preset "${format}" for "${basename}"`);
  }
}

/**
 * @param {string} filePath
 */
export function assetBasename(filePath) {
  return path.basename(filePath);
}
