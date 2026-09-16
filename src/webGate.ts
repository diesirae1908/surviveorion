/**
 * Phone App Store landing vs webapp lobby. Detection only; no play logic.
 * Native play (`?nativePlay=`) and Capacitor / Ionic origins never gate.
 */

export const WEB_OVERRIDE_KEY = "orion_web_override";
export const APP_STORE_URL = "https://apps.apple.com/app/id6811113450";

export type DeviceClass = "phone" | "tablet" | "desktop";

export interface GateInput {
  search: string;
  ua: string;
  protocol: string;
  nativePlay: boolean;
  nativeApp: boolean;
  coarsePointer: boolean;
  innerWidth: number;
  sessionOverride?: boolean;
}

export function queryFlag(search: string, key: string, value: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get(key) === value;
}

export function hasWebOverride(search: string, sessionFlag: boolean): boolean {
  return queryFlag(search, "web", "1") || sessionFlag;
}

export function readSessionOverride(): boolean {
  try {
    return sessionStorage.getItem(WEB_OVERRIDE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSessionOverride(): void {
  try {
    sessionStorage.setItem(WEB_OVERRIDE_KEY, "1");
  } catch {
    // private mode
  }
}

/** Persist `?web=1` for the rest of this tab session. sessionStorage only. */
export function consumeWebOverride(search: string): boolean {
  if (!queryFlag(search, "web", "1")) return readSessionOverride();
  writeSessionOverride();
  return true;
}

export function classifyDevice(input: {
  ua: string;
  coarsePointer: boolean;
  innerWidth: number;
}): DeviceClass {
  const ua = input.ua;
  if (/iPhone/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua))) return "phone";
  if (/iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (input.coarsePointer && input.innerWidth < 700) return "phone";
  if (input.coarsePointer && input.innerWidth >= 700) return "tablet";
  return "desktop";
}

export function isBundledNativeOrigin(protocol: string): boolean {
  return protocol === "capacitor:" || protocol === "ionic:";
}

/**
 * Hard phone App Store landing is off (Lucas, 2026-09-15): web stays playable on
 * phones; lobby App Store badge/CTA is the nudge. Kept for call sites + tests.
 */
export function shouldShowPhoneLanding(_input: GateInput): boolean {
  return false;
}
