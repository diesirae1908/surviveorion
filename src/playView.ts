/**
 * Playfield: short axis is always 10 world units. The long axis flexes with
 * the window between 16 (16:10) and 17.78 (16:9). Portrait mirrors that
 * (10 wide, 16 to 17.78 tall). Windows inside that aspect range fill with
 * no bars; wider/taller windows get bars only for the excess. px-per-unit
 * is contain-fit (short axis wins on ultrawide / tall phones). Desktop
 * 1440x900 still fills exactly at 90 css px / unit.
 *
 * Camera only: mutator physics still read world.viewW/viewH (THE PIT can
 * shrink that arena inside this frame).
 */

/** Short axis of the field (matches the old VIEW_MIN / Unity ortho 10). */
export const FIELD_SHORT = 10;
/** Long axis at 16:10 (minimum stretch). */
export const FIELD_LONG = 16;
/** Long axis at 16:9 (maximum stretch). */
export const FIELD_LONG_MAX = (FIELD_SHORT * 16) / 9;
/** Field aspect floor (16:10). */
export const FIELD_ASPECT_MIN = 16 / 10;
/** Field aspect ceiling (16:9). */
export const FIELD_ASPECT_MAX = 16 / 9;

/** @deprecated identity: canvas fills the window; the field letterboxes inside. */
export const PLAY_ASPECT_LANDSCAPE = FIELD_ASPECT_MAX;
/** @deprecated unused; kept so existing imports keep typechecking. */
export const PLAY_LETTERBOX_MIN_WIDTH = 900;

export function fieldWorldSize(cssW: number, cssH: number): { w: number; h: number } {
  const portrait = cssH > cssW;
  const longCss = portrait ? cssH : cssW;
  const shortCss = portrait ? cssW : cssH;
  const windowAspect = shortCss > 0 ? longCss / shortCss : FIELD_ASPECT_MIN;
  const aspect = Math.min(FIELD_ASPECT_MAX, Math.max(FIELD_ASPECT_MIN, windowAspect));
  const long = FIELD_SHORT * aspect;
  if (portrait) return { w: FIELD_SHORT, h: long };
  return { w: long, h: FIELD_SHORT };
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
