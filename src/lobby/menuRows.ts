// Row specs for the lobby hamburger menu. Pure (no DOM, no ui.ts), so the row
// list, order, labels and dots are testable in node. ui.ts maps each spec id to
// its action (`lobbyMenuRows`). Lobby v3 reads the same rows, so a new
// destination is added once, here.

export type MenuRowId =
  | "training"
  | "calendar"
  | "wingmates"
  | "howto"
  | "powers"
  | "updates"
  | "feedback"
  | "settings"
  | "iphone"
  | "privacy";

export interface MenuRowSpec {
  id: MenuRowId;
  label: string;
  /** Red dot on the row. */
  notif: boolean;
  visible: boolean;
}

export interface MenuRowEnv {
  /** A field update the pilot has not opened yet. */
  unreadUpdate: boolean;
  /** The "Get on iPhone" row is on (App Store listing live). */
  appStoreLive: boolean;
}

/** Today's menu rows in today's order. */
export function menuRowSpecs(info: { pendingFriends?: number }, env: MenuRowEnv): MenuRowSpec[] {
  return [
    { id: "training", label: "Training Ground", notif: false, visible: true },
    { id: "calendar", label: "Patrol Calendar", notif: false, visible: true },
    { id: "wingmates", label: "Wingmates", notif: (info.pendingFriends ?? 0) > 0, visible: true },
    { id: "howto", label: "How to play", notif: false, visible: true },
    { id: "powers", label: "Powers", notif: false, visible: true },
    { id: "updates", label: "Field updates", notif: env.unreadUpdate, visible: true },
    { id: "feedback", label: "Feedback", notif: false, visible: true },
    { id: "settings", label: "Settings", notif: false, visible: true },
    { id: "iphone", label: "Get on iPhone", notif: false, visible: env.appStoreLive },
    { id: "privacy", label: "Privacy", notif: false, visible: true },
  ];
}
