// Bottom tab bar (owner: WS-L). `tabBarModel` is pure; `tabBar` maps it to DOM.
// Styles: src/styles/lobby.css (`.tab-bar`, scoped by class, used on the lobby
// and on every tab screen built through `ui.showCustomScreen`).

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
  /** Unread field update: paints the dot on PILOT (`.tab-pilot .update-pill`). */
  unread?: () => boolean;
  /** Pending wingmate requests: paints a dot on WINGMATES. */
  friendsPending?: () => boolean;
}

/** Tab order and labels (copy batch). */
export const TAB_ORDER: ReadonlyArray<{ id: LobbyTab; label: string }> = [
  { id: "patrol", label: "PATROL" },
  { id: "board", label: "BOARD" },
  { id: "wingmates", label: "WINGMATES" },
  { id: "pilot", label: "PILOT" },
];

/** Bar height in px (the safe-area inset is added in CSS). */
export const TAB_BAR_HEIGHT_PX = 56;

/** The four tabs, or none when `ui.lobby.tabBar` is off (or the lobby flag is). */
export function tabBarModel(active: LobbyTab, params: LobbyParams | null): TabModel[] {
  if (!params || !params.tabBar) return [];
  return TAB_ORDER.map((t) => ({ id: t.id, label: t.label, active: t.id === active, notif: false }));
}

/** Where the PILOT tab goes: the dossier when `pilotTab` is on, else today's profile. */
export function pilotTarget(params: LobbyParams | null): "dossier" | "profile" {
  return params?.pilotTab ? "dossier" : "profile";
}

/** Callers that omit params (tab screens built by `showCustomScreen`) get the bar on. */
const BAR_ON: LobbyParams = { tabBar: true, briefing: false, pilotTab: true };

const ICONS: Record<LobbyTab, string> = {
  patrol: `<path d="M12 3 L18.5 20 L12 16.5 L5.5 20 Z" fill="currentColor"/>`,
  board: `<path d="M5 20 V13 M12 20 V5 M19 20 V10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  wingmates:
    `<circle cx="8.5" cy="9" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/>` +
    `<circle cx="16.5" cy="9.6" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/>` +
    `<path d="M3.5 19 c.6-3.2 2.4-4.6 5-4.6 s4.4 1.4 5 4.6 M14.6 14.8 c2.6-.2 4.3 1.1 5 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  pilot: `<path d="M12 3 L19.5 6 V12 C19.5 16.4 16.5 19.4 12 21 C7.5 19.4 4.5 16.4 4.5 12 V6 Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>`,
};

/** The bar, or null when the model is empty (flag off). */
export function tabBar(active: LobbyTab, cb: TabCallbacks, params: LobbyParams | null = BAR_ON): HTMLElement | null {
  const model = tabBarModel(active, params);
  if (model.length === 0) return null;
  const nav = document.createElement("nav");
  nav.className = "tab-bar";
  nav.setAttribute("aria-label", "Lobby");
  const inner = document.createElement("div");
  inner.className = "tab-bar-inner";
  const go: Record<LobbyTab, () => void> = {
    patrol: cb.onPatrol,
    board: cb.onBoard,
    wingmates: cb.onWingmates,
    pilot: cb.onPilot,
  };
  for (const t of model) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `tab tab-${t.id}${t.active ? " active" : ""}`;
    b.setAttribute("aria-label", t.label);
    if (t.active) b.setAttribute("aria-current", "page");
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[t.id]}</svg><span class="tab-label">${t.label}</span>`;
    if (t.id === "pilot") {
      const pill = document.createElement("span");
      pill.className = "update-pill";
      pill.hidden = !(cb.unread?.() ?? false);
      b.appendChild(pill);
    }
    if (t.id === "wingmates" && (cb.friendsPending?.() ?? false)) {
      const dot = document.createElement("span");
      dot.className = "notif-dot";
      b.appendChild(dot);
    }
    b.addEventListener("click", go[t.id]);
    inner.appendChild(b);
  }
  nav.appendChild(inner);
  return nav;
}
