/**
 * Fixed playfield: every device sees the same world size. Landscape-ish
 * screens (width >= height) are 16x10; portrait (height > width) is 10x16.
 * The field is contained in the canvas (uniform scale, centered). Spare
 * screen becomes bars. Desktop 1440x900 fills exactly (90 css px / unit).
 *
 * Camera only: mutator physics still read world.viewW/viewH (THE PIT can
 * shrink that arena inside this frame).
 */

/** Short axis of the fixed field (matches the old VIEW_MIN / Unity ortho 10). */
export const FIELD_SHORT = 10;
/** Long axis of the fixed field. Landscape 16x10, portrait 10x16. */
export const FIELD_LONG = 16;

/** @deprecated identity: canvas fills the window; the field letterboxes inside. */
export const PLAY_ASPECT_LANDSCAPE = 16 / 9;
/** @deprecated unused; kept so existing imports keep typechecking. */
export const PLAY_LETTERBOX_MIN_WIDTH = 900;

export function fieldWorldSize(cssW: number, cssH: number): { w: number; h: number } {
  if (cssH > cssW) return { w: FIELD_SHORT, h: FIELD_LONG };
  return { w: FIELD_LONG, h: FIELD_SHORT };
}

export interface FieldLayout {
  /** Css pixels per world unit. */
  scale: number;
  /** Field left edge in css pixels. */
  ox: number;
  /** Field top edge in css pixels. */
  oy: number;
  fieldCssW: number;
  fieldCssH: number;
}

export function fieldLayout(cssW: number, cssH: number, viewW: number, viewH: number): FieldLayout {
  const scale = Math.min(cssW / viewW, cssH / viewH);
  const fieldCssW = viewW * scale;
  const fieldCssH = viewH * scale;
  return {
    scale,
    fieldCssW,
    fieldCssH,
    ox: (cssW - fieldCssW) / 2,
    oy: (cssH - fieldCssH) / 2,
  };
}

/** Canvas css size: full window. Field letterbox is drawn on the canvas. */
export function playViewport(cssW: number, cssH: number): { w: number; h: number } {
  return { w: cssW, h: cssH };
}
