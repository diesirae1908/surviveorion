/**
 * Capacitor iOS (and later Android) shell. No-ops on the web.
 * Bundled dist/ talks to https://surviveorion.com over CORS; we never load
 * remote JS (Guideline 4.2 + Daily Patrol mutator lockstep).
 */

import { nextPatrolMidnight } from "./patrolDate";

export const LIVE_API_ORIGIN = "https://surviveorion.com";
export const PRIVACY_URL = "https://surviveorion.com/privacy.html";
export const BUNDLE_ID = "com.surviveorion.app";

export type NativePlayMode = "daily" | "training";

/** Query parser for the SwiftUI play WebView. Website: null when absent. */
export function parseNativePlay(search: string): NativePlayMode | null {
  const v = new URLSearchParams(search).get("nativePlay");
  return v === "daily" || v === "training" ? v : null;
}

/** True only when this page was opened as a play-only native run. */
export function isNativePlay(): boolean {
  try {
    if (typeof location === "undefined") return false;
    return parseNativePlay(location.search) !== null;
  } catch {
    return false;
  }
}

function postNative(payload: Record<string, unknown>): void {
  try {
    const wk = (
      window as unknown as {
        webkit?: { messageHandlers?: { orion?: { postMessage: (m: unknown) => void } } };
      }
    ).webkit?.messageHandlers?.orion;
    wk?.postMessage(payload);
  } catch {
    // website, or the Swift bridge is not installed
  }
}

/** Push Bearer + guest secret back to the Swift Keychain after a run. */
export function exportNativeSession(): void {
  if (!isNativePlay()) return;
  try {
    postNative({
      type: "session",
      token: localStorage.getItem("orion.session"),
      guestSecret: localStorage.getItem("orion.guestSecret"),
      dailyAttempts: localStorage.getItem("orion.dailyAttempts"),
    });
  } catch {
    // private mode
  }
}

export function postNativeGameOver(payload: {
  score: number;
  timeSurvived: number;
  kills: number;
  medal?: string | null;
  sharePngBase64?: string | null;
  callsign?: string | null;
}): void {
  if (!isNativePlay()) return;
  postNative({ type: "gameOver", ...payload });
  exportNativeSession();
}

/** Pause-quit / leave: dismiss the play WebView. No native game-over sheet. */
export function postNativeLeave(): void {
  if (!isNativePlay()) return;
  postNative({ type: "leave" });
  exportNativeSession();
}

const SESSION_COUNT_KEY = "orion.nativeSessions";
const NOTIF_DAILY_KEY = "orion.notifDaily";
const NOTIF_STREAK_KEY = "orion.notifStreak";
const PATROL_NOTIF_ID = 11;
const STREAK_NOTIF_ID = 12;

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
};

function capacitor(): CapacitorBridge | undefined {
  return (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
}

/** True inside the App Store / TestFlight binary, false on the website. */
export function isNativeApp(): boolean {
  try {
    return !!capacitor()?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * Prefix for /api calls. Empty on the web (same-origin). Native shells have
 * a fresh origin (capacitor://localhost), so they hit the live community
 * server. Guest localStorage is empty on first install: sign-in is how a
 * web pilot recovers history. No automatic identity migration.
 */
export function apiBase(): string {
  return isNativeApp() || isNativePlay() ? LIVE_API_ORIGIN : "";
}

export interface NativeNotifPrefs {
  daily: boolean;
  streakAtRisk: boolean;
}

export function nativeNotifPrefs(): NativeNotifPrefs {
  return {
    daily: localStorage.getItem(NOTIF_DAILY_KEY) !== "0",
    streakAtRisk: localStorage.getItem(NOTIF_STREAK_KEY) === "1",
  };
}

export async function setNativeNotifDaily(on: boolean): Promise<void> {
  localStorage.setItem(NOTIF_DAILY_KEY, on ? "1" : "0");
  if (on) await schedulePatrolNotification();
  else await cancelNotification(PATROL_NOTIF_ID);
}

export async function setNativeNotifStreak(on: boolean): Promise<void> {
  localStorage.setItem(NOTIF_STREAK_KEY, on ? "1" : "0");
  if (on) await scheduleStreakNotification();
  else await cancelNotification(STREAK_NOTIF_ID);
}

export async function hapticGraze(): Promise<void> {
  if (isNativePlay()) {
    postNative({ type: "graze" });
    return;
  }
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // plugin missing or web stub
  }
}

export async function hapticDeath(): Promise<void> {
  if (isNativePlay()) {
    postNative({ type: "death" });
    return;
  }
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch {
    // plugin missing or web stub
  }
}

export async function nativeShare(text: string, pngBlob?: Blob | null): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { Share } = await import("@capacitor/share");
    const files: string[] = [];
    if (pngBlob) {
      const uri = await writeSharePng(pngBlob);
      if (uri) files.push(uri);
    }
    await Share.share({
      title: "ORION Daily Patrol",
      text,
      url: files.length ? undefined : LIVE_API_ORIGIN,
      files: files.length ? files : undefined,
      dialogTitle: "Share patrol",
    });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return true;
    return false;
  }
}

async function writeSharePng(blob: Blob): Promise<string | null> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const result = await Filesystem.writeFile({
      path: "orion-share.png",
      data: btoa(binary),
      directory: Directory.Cache,
    });
    return result.uri;
  } catch {
    return null;
  }
}

export async function setPlayChrome(playing: boolean): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    if (playing) await StatusBar.hide();
    else await StatusBar.show();
  } catch {
    // simulator / plugin stub
  }
  try {
    if (playing) {
      const lock = await navigator.wakeLock?.request("screen");
      (window as unknown as { __orionWake?: WakeLockSentinel }).__orionWake = lock;
    } else {
      const prev = (window as unknown as { __orionWake?: WakeLockSentinel }).__orionWake;
      await prev?.release();
      (window as unknown as { __orionWake?: WakeLockSentinel }).__orionWake = undefined;
    }
  } catch {
    // Wake Lock is iOS 16.4+; older devices just dim
  }
}

export function openPrivacyPolicy(): void {
  window.open(PRIVACY_URL, "_blank", "noopener");
}

/**
 * Second session (not first launch) asks for local notification permission
 * when daily reminders are on (the default). Reschedules the next midnight
 * Pacific rollover on every boot so DST and timezone stay honest.
 */
export async function bootNativeShell(): Promise<void> {
  if (!isNativeApp()) return;
  const n = Number(localStorage.getItem(SESSION_COUNT_KEY) || "0") + 1;
  localStorage.setItem(SESSION_COUNT_KEY, String(n));
  if (n >= 2 && nativeNotifPrefs().daily) {
    await schedulePatrolNotification();
  }
  if (n >= 2 && nativeNotifPrefs().streakAtRisk) {
    await scheduleStreakNotification();
  }
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("appStateChange", ({ isActive }) => {
      window.dispatchEvent(new Event(isActive ? "focus" : "visibilitychange"));
    });
  } catch {
    // web stub
  }
}

async function cancelNotification(id: number): Promise<void> {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    // ignore
  }
}

async function ensureNotifPermission(): Promise<boolean> {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display === "granted") return true;
    perm = await LocalNotifications.requestPermissions();
    return perm.display === "granted";
  } catch {
    return false;
  }
}

async function schedulePatrolNotification(): Promise<void> {
  if (!(await ensureNotifPermission())) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const at = nextPatrolMidnight();
    await LocalNotifications.cancel({ notifications: [{ id: PATROL_NOTIF_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: PATROL_NOTIF_ID,
          title: "Daily Patrol is live",
          body: "A new swarm. Three attempts. Same run for every pilot.",
          schedule: { at, allowWhileIdle: true },
        },
      ],
    });
  } catch {
    // ignore
  }
}

async function scheduleStreakNotification(): Promise<void> {
  if (!(await ensureNotifPermission())) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const at = new Date(nextPatrolMidnight().getTime() - 2 * 3600 * 1000);
    if (at.getTime() <= Date.now()) return;
    await LocalNotifications.cancel({ notifications: [{ id: STREAK_NOTIF_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: STREAK_NOTIF_ID,
          title: "Patrol streak at risk",
          body: "Today's Daily Patrol closes in two hours.",
          schedule: { at, allowWhileIdle: true },
        },
      ],
    });
  } catch {
    // ignore
  }
}
