// Live pace chip data (owner: WS-H). Stub from WS-R: types and no-op bodies so
// main.ts and render.ts can call the seams today. WS-H fills the bodies.

import type { World } from "./types";

/** One board row the pace chip compares against. */
export interface PaceRow {
  callsign: string;
  score: number;
  /** True for the signed-in pilot's own row. */
  self: boolean;
}

/** What the HUD paints. WS-H refines the fields; null = draw nothing. */
export interface PaceView {
  /** Next pilot ahead of the current score, or null when in front. */
  ahead: PaceRow | null;
  /** Points to that pilot (0 when in front). */
  gap: number;
}

export interface PaceStartCtx {
  daily: boolean;
  archive: boolean;
  preview: boolean;
  online: boolean;
  fetchBoard: () => Promise<PaceRow[]>;
}

/** Called once per run start. Stub: does nothing. */
export function onRunStart(_ctx: PaceStartCtx): void {
  void _ctx;
}

/** Per-frame view for the HUD. Stub: always null (chip never draws). */
export function snapshot(_world: World): PaceView | null {
  void _world;
  return null;
}
