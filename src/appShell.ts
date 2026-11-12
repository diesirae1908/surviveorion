/**
 * App Store web shell (iOS 1.2): the binary boots the bundled web lobby v3 in one persistent
 * WKWebView instead of the SwiftUI Home. This module is the pure side: the on/off decision
 * (`app.shell` AND `ui.lobby` AND the build's protocol), the URL params Swift passes, and the
 * bridge message shapes. No DOM, so node tests pin it. The boot wiring lives in main.ts.
 *
 * Swift contract (WS-N): `index.html?shell=1&appv=<ver>&sessions=<n>[&shellForce=1][&goldPatrol=1]`.
 * Web to native: shellReady, shellFallback{reason}, openSettings{section}, openManageGold,
 * openAnalytics, requestReview{reason}, chrome{playing}, signedOut (plus the 1.1 messages).
 * Native to web: orion-native-tier{gold}, orion-native-session{signedIn}, orion-native-pause.
 */

import type { AppShellParams, LobbyParams } from "./flags";

/** Why the shell is off. Posted to Swift as `shellFallback.reason` and kept for QA. */
export type ShellReason =
  | "on"
  | "not-shell"
  | "no-flags"
  | "switch-off"
  | "lobby-off"
  | "old-build"
  | "load-error";

export interface ShellDecision {
  on: boolean;
  reason: ShellReason;
  /** ui.lobby params AND-combined with app.shell (null when the shell is off). */
  lobby: LobbyParams | null;
  /** The STORY share button is allowed in the shell (ui.result.stories AND app.shell.stories). */
  stories: boolean;
}

export interface ShellDecisionInput {
  /** `?shell=` protocol integer, null when this page is not a shell. */
  shellVersion: number | null;
  /** Rows (or a stale cache) are in memory. False = offline first launch. */
  flagsLoaded: boolean;
  appShell: AppShellParams | null;
  lobby: LobbyParams | null;
}

const OFF = (reason: ShellReason): ShellDecision => ({ on: false, reason, lobby: null, stories: false });

/**
 * The one decision. ON only when the app.shell switch is on, ui.lobby is on (turning the lobby
 * off sends the app back to SwiftUI, never to the old web lobby) and the build's protocol is at
 * least `minShell`. Sub-switches only narrow: app.shell.briefing / pilotTab AND the lobby ones.
 */
export function shellDecision(i: ShellDecisionInput): ShellDecision {
  if (i.shellVersion === null) return OFF("not-shell");
  if (!i.flagsLoaded) return OFF("no-flags");
  if (!i.appShell) return OFF("switch-off");
  if (!i.lobby) return OFF("lobby-off");
  if (i.shellVersion < (i.appShell.minShell ?? 1)) return OFF("old-build");
  return {
    on: true,
    reason: "on",
    lobby: {
      tabBar: i.lobby.tabBar,
      briefing: i.lobby.briefing && i.appShell.briefing !== false,
      pilotTab: i.lobby.pilotTab && i.appShell.pilotTab !== false,
    },
    stories: i.appShell.stories !== false,
  };
}

/** `shellForce=1` is a request only; it counts for a server-confirmed crew or admin session. */
export function shellForceRequested(search: string): boolean {
  return new URLSearchParams(search).get("shellForce") === "1";
}

export function shellForceAllowed(search: string, session: { clipInbox: boolean; tier: string }): boolean {
  return shellForceRequested(search) && (session.clipInbox || session.tier === "admin");
}

/** Foreground launches the app has counted (`sessions=`). 0 when absent or junk. */
export function parseShellSessions(search: string): number {
  const v = new URLSearchParams(search).get("sessions");
  return v && /^\d{1,6}$/.test(v) ? Number(v) : 0;
}

/** The app's marketing version (`appv=`), bounded and charset-checked. null when absent. */
export function parseShellAppVersion(search: string): string | null {
  const v = new URLSearchParams(search).get("appv");
  return v && /^[0-9A-Za-z.\-]{1,16}$/.test(v) ? v : null;
}

export type SettingsSection = "pilot" | "crew";

/** Web to native messages the shell adds in 1.2 (the 1.1 ones live in native.ts). */
export type ShellMessage =
  | { type: "shellReady" }
  | { type: "shellFallback"; reason: ShellReason }
  | { type: "openSettings"; section: SettingsSection }
  | { type: "openManageGold" }
  | { type: "requestReview"; reason: string }
  | { type: "chrome"; playing: boolean }
  | { type: "signedOut" };

/** Native to web: `orion-native-tier` detail. Anything but a boolean is ignored. */
export function parseTierEvent(e: Event): boolean | null {
  const g = (e as CustomEvent<{ gold?: unknown }>).detail?.gold;
  return typeof g === "boolean" ? g : null;
}

/** Native to web: `orion-native-session` detail. Anything but a boolean is ignored. */
export function parseSessionEvent(e: Event): boolean | null {
  const s = (e as CustomEvent<{ signedIn?: unknown }>).detail?.signedIn;
  return typeof s === "boolean" ? s : null;
}
