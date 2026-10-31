// Bottom tab bar (owner: WS-L). Stub from WS-R.

import type { LobbyParams } from "../flags";
import type { LobbyTab } from "./lobbyV3";

export interface TabModel {
  id: LobbyTab;
  label: string;
  active: boolean;
  /** Small dot (e.g. an unread field update on PILOT). */
  notif: boolean;
}

/** Handlers the host screen gives the bar, one per tab. */
export interface TabCallbacks {
  onPatrol: () => void;
  onBoard: () => void;
  onWingmates: () => void;
  onPilot: () => void;
}

/** Stub: no tabs. */
export function tabBarModel(_active: LobbyTab, _params: LobbyParams | null): TabModel[] {
  void _active;
  void _params;
  return [];
}

/** Stub: no bar (callers append nothing). */
export function tabBar(_active: LobbyTab, _cb: TabCallbacks): HTMLElement | null {
  void _active;
  void _cb;
  return null;
}
