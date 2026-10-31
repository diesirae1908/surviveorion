// Sky and parallax background (owner: WS-K). Stub from WS-R.
//
// Contract for `drawSky`: render() calls it in place of `drawStars` while the
// WORLD transform is active (world units, y up, field clip on), so everything
// is drawn in world space. `world.ship` is the parallax anchor. Return true
// when the sky drew (the caller then skips the old star field), false to fall
// back to the old stars.

import type { ClientFlags } from "./flags";
import type { Mutator } from "./mutators";
import type { FieldLayout } from "./playView";
import type { World } from "./types";

export interface SkyArgs {
  /** CSS size of the canvas and the world size of the field. */
  viewport: { cssW: number; cssH: number; viewW: number; viewH: number };
  field: FieldLayout;
  world: World;
  /** Active mutators for the day (empty outside the daily). */
  mutators: Mutator[];
  uiTime: number;
  flags: ClientFlags;
  effects: "full" | "lite";
}

/** Stub: draws nothing and returns false, so the old star field stays. */
export function drawSky(_ctx: CanvasRenderingContext2D, _args: SkyArgs): boolean {
  void _ctx;
  void _args;
  return false;
}
