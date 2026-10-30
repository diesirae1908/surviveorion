// OVERDRIVE presentation (hull heat tint, form popups, stings). Owned by the
// presentation workstream; this is the no-op seam. Gated by `ui.overdriveFx`.

import type { RenderOpts } from "../render";
import type { Drone, FxContext, GameEvent, World } from "../types";

/** React to a gameplay event. No-op until the presentation lands. */
export function onEvent(_e: GameEvent, _ctx: FxContext): void {}

/** Overlay drawn on the ship (inside the world transform). No-op. */
export function drawShipOverlay(_g: CanvasRenderingContext2D, _world: World, _opts: RenderOpts): void {}

/** Tint for a loose drone near a HOT ship. Returns the base color unchanged. */
export function drawDroneTint(_world: World, _drone: Drone, baseColor: string): string {
  return baseColor;
}
