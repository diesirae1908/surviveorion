/**
 * Parse orion clip filename contract.
 * orion_<YYYY-MM-DD>_day<N>_<mutator-slot>_<score>.<webm|mp4>
 */

const FILENAME_RE =
  /^orion_(\d{4}-\d{2}-\d{2})_day(\d+)_([^_]+)_(\d+)\.(webm|mp4)$/;

const SIDECAR_RE =
  /^orion_(\d{4}-\d{2}-\d{2})_day(\d+)_([^_]+)_(\d+)\.json$/;

const FULLGAME_SLOTS = new Set(["classic", "ironrain"]);

/**
 * @param {string} basename - filename without directory
 * @returns {{
 *   date: string,
 *   day: number,
 *   mutatorSlot: string,
 *   mutatorIds: string[],
 *   score: number,
 *   ext: 'webm' | 'mp4',
 *   basename: string,
 * }}
 */
/**
 * @param {string[]} match
 * @param {string} basename
 * @param {'webm'|'mp4'|null} ext
 */
function parseFilenameMatch(match, basename, ext) {
  const [, date, dayStr, mutatorSlot, scoreStr] = match;
  const day = Number(dayStr);
  const score = Number(scoreStr);

  if (!Number.isInteger(day) || day < 0) {
    throw new Error(
      `Filename contract mismatch for "${basename}": invalid day number "${dayStr}"`
    );
  }
  if (!Number.isInteger(score) || score < 0) {
    throw new Error(
      `Filename contract mismatch for "${basename}": invalid score "${scoreStr}"`
    );
  }

  const mutatorIds =
    FULLGAME_SLOTS.has(mutatorSlot) ? [] : mutatorSlot.split("+").filter(Boolean);

  if (!FULLGAME_SLOTS.has(mutatorSlot) && mutatorIds.length === 0) {
    throw new Error(
      `Filename contract mismatch for "${basename}": empty mutator slot "${mutatorSlot}"`
    );
  }

  return {
    date,
    day,
    mutatorSlot,
    mutatorIds,
    score,
    ext,
    basename,
  };
}

export function parseFilename(basename) {
  const match = basename.match(FILENAME_RE);
  if (!match) {
    throw new Error(
      `Filename contract mismatch for "${basename}": expected orion_<YYYY-MM-DD>_day<N>_<mutator-slot>_<score>.<webm|mp4>`
    );
  }
  const ext = /** @type {'webm'|'mp4'} */ (match[5]);
  return parseFilenameMatch(match, basename, ext);
}

/**
 * Parse sidecar JSON basename (same stem as the video pair).
 * @param {string} jsonBasename
 */
export function parseSidecarFilename(jsonBasename) {
  const match = jsonBasename.match(SIDECAR_RE);
  if (!match) {
    throw new Error(
      `Filename contract mismatch for "${jsonBasename}": expected orion_<YYYY-MM-DD>_day<N>_<mutator-slot>_<score>.json`
    );
  }
  const stem = jsonBasename.replace(/\.json$/, "");
  const videoBasename = `${stem}.webm`;
  return parseFilenameMatch(match, videoBasename, null);
}

/**
 * @param {string} basename
 * @returns {string} basename without extension
 */
export function basenameWithoutExt(basename) {
  return basename.replace(/\.(webm|mp4)$/i, "");
}

/**
 * @param {string} basename
 * @returns {'webm' | 'mp4' | null}
 */
export function videoExt(basename) {
  const m = basename.match(/\.(webm|mp4)$/i);
  return m ? /** @type {'webm'|'mp4'} */ (m[1].toLowerCase()) : null;
}
