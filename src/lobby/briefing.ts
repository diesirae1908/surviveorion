// Mission briefing before a daily launch (owner: WS-B). Stub from WS-R: the
// context type and the two entry points main.ts calls. The stub never shows.

import type { LobbyParams } from "../flags";

export interface BriefingContext {
  patrolDate: string;
  patrolNumber: number;
  mutators: { name: string; subline: string; tags: string[] }[];
  quick: boolean;
  mode: "daily" | "training" | "classic" | "ironrain" | "tutorial" | "firstFlight";
  archive: boolean;
  preview: boolean;
  effects: "full" | "lite";
  shake: boolean;
  params: LobbyParams | null;
  /** Native play and Capacitor pass false: the briefing is web only. */
  allowed: boolean;
  /** Plays the briefing stamp sound (the audio module's briefingStamp). */
  playStamp: () => void;
}

/** Stub: never shows. */
export function shouldShow(_ctx: BriefingContext): boolean {
  void _ctx;
  return false;
}

/** Stub: resolves true (go) immediately. Real version resolves false when the pilot backs out. */
export function maybeShowBriefing(_ctx: BriefingContext): Promise<boolean> {
  void _ctx;
  return Promise.resolve(true);
}
