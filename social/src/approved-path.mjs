/**
 * Posting is physically limited to out/approved/.
 */

import { realpathSync } from "node:fs";
import path from "node:path";

import { APPROVED_DIR } from "./paths.mjs";

/**
 * Resolve itemDir and throw if it is not inside approvedRoot.
 * @param {string} itemDir
 * @param {string} [approvedRoot]
 */
export function assertItemInApproved(itemDir, approvedRoot = APPROVED_DIR) {
  let approved;
  try {
    approved = realpathSync(approvedRoot);
  } catch {
    throw new Error(`post refuses path: approved root missing at "${approvedRoot}"`);
  }

  let resolved;
  try {
    resolved = realpathSync(itemDir);
  } catch {
    throw new Error(`post refuses path (cannot resolve): ${itemDir}`);
  }

  const prefix = approved.endsWith(path.sep) ? approved : `${approved}${path.sep}`;
  if (resolved !== approved && !resolved.startsWith(prefix)) {
    throw new Error(`post refuses path outside out/approved/: ${itemDir}`);
  }
  return resolved;
}
