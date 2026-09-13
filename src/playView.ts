/**
 * Desktop play framing: lock landscape play to 16:9 (phone-landscape feel)
 * and letterbox ultra-wide monitors. Portrait / phone windows stay full-bleed.
 * Camera only: mutator physics still read world.viewW/viewH from this frame.
 */

/** Social / typical phone-landscape play aspect. */
export const PLAY_ASPECT_LANDSCAPE = 16 / 9;

/** Apply the 16:9 cap only on wide desktop windows, never on phones. */
export const PLAY_LETTERBOX_MIN_WIDTH = 900;

export function playViewport(cssW: number, cssH: number): { w: number; h: number } {
  if (cssW >= PLAY_LETTERBOX_MIN_WIDTH && cssH > 0 && cssW / cssH > PLAY_ASPECT_LANDSCAPE) {
    return { w: cssH * PLAY_ASPECT_LANDSCAPE, h: cssH };
  }
  return { w: cssW, h: cssH };
}
