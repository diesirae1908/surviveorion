import type { ControlMode } from "./input";

export type { ControlMode };

export interface Settings {
  sound: boolean;
  music: boolean;
  screenShake: boolean;
  /** Classic-mode drift. OFF = direct control (tilt rules, scores as tilt). */
  inertia: boolean;
}

/** Mobile control preference + tilt calibration (separate from the boolean toggles). */
export interface ControlPrefs {
  mode: ControlMode;
  tiltNeutral: { beta: number; gamma: number } | null;
  /** true once the first-launch "enable tilt?" prompt has been answered */
  tiltPromptSeen: boolean;
}

const BEST_KEY = "orion.bestScore";
const SETTINGS_KEY = "orion.settings";
const CONTROLS_KEY = "orion.controls";

export function loadBestScore(): number {
  const raw = localStorage.getItem(BEST_KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function saveBestScore(score: number): void {
  localStorage.setItem(BEST_KEY, String(Math.floor(score)));
}

export function loadSettings(): Settings {
  const defaults: Settings = { sound: true, music: true, screenShake: true, inertia: true };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadControlPrefs(): ControlPrefs {
  const defaults: ControlPrefs = { mode: "stick", tiltNeutral: null, tiltPromptSeen: false };
  try {
    const raw = localStorage.getItem(CONTROLS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function saveControlPrefs(prefs: ControlPrefs): void {
  localStorage.setItem(CONTROLS_KEY, JSON.stringify(prefs));
}
