// In-run game feel: kill and graze feedback today, the Rising Gold HUD feel
// later. Everything here is cosmetic and uses Math.random only (never the
// seeded sim streams). The `graze` and `droneKilled` bodies were moved here
// unchanged from main.ts drainEvents, so later feel work edits only this file.

import { PALETTE } from "./config";
import { hapticGraze } from "./native";
import type { RenderOpts } from "./render";
import type { FxContext, GameEvent, World } from "./types";

/** React to a gameplay event. */
export function onEvent(e: GameEvent, ctx: FxContext): void {
  const { particles, popups, audio, world } = ctx;
  switch (e.type) {
    case "droneKilled": {
      if (e.wasFrozen) {
        particles.burst(e.x, e.y, [PALETTE.freeze, PALETTE.white, "#dffaff"], 16, 4, 0.7, 0.1);
      } else if (e.source === "pulse") {
        particles.burst(e.x, e.y, [PALETTE.pulse, PALETTE.goldPale, "#ffcc77"], 16, 5, 0.65, 0.12);
      } else {
        particles.burst(e.x, e.y, [PALETTE.redBright, PALETTE.gold, "#ff8866"], 14, 5, 0.6, 0.12);
      }
      // no floating +points: with the dense swarm the numbers cluttered the
      // view — the HUD score and the kill burst are feedback enough
      audio.droneKill();
      break;
    }
    case "graze":
      particles.burst(e.x, e.y, [PALETTE.goldPale, PALETTE.white], 5, 2.5, 0.3, 0.06);
      particles.grazeArc(Math.atan2(e.y - world.ship.y, e.x - world.ship.x));
      audio.graze();
      void hapticGraze();
      popups.spawn(e.x, e.y + 0.55, `+${e.points}`, PALETTE.gold, 0.72, 1.15);
      break;
  }
}

/** Screen-space overlay drawn once per frame inside the field clip. No-op for now. */
export function drawOverlay(_g: CanvasRenderingContext2D, _world: World, _opts: RenderOpts): void {}
