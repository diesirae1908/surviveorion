import type { SenseLevel } from "./config";
import type { ControlMode } from "./input";

export type { ControlMode, SenseLevel };

export type BooleanSetting = "sound" | "music" | "screenShake" | "inertia";

export interface Settings {
  sound: boolean;
  music: boolean;
  screenShake: boolean;
  /** Classic-mode drift. OFF = directional direct control (scores as tilt). */
  inertia: boolean;
  /** Phone tilt lean range: low = more lean for full speed, high = twitchier. */
  tiltSensitivity: SenseLevel;
  /** Cruise speed in directional no-inertia mode. */
  directSpeed: SenseLevel;
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

const SENSE_LEVELS: SenseLevel[] = ["low", "med", "high"];

export function loadBestScore(): number {
  const raw = localStorage.getItem(BEST_KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function saveBestScore(score: number): void {
  localStorage.setItem(BEST_KEY, String(Math.floor(score)));
}

function parseSense(v: unknown, fallback: SenseLevel): SenseLevel {
  return typeof v === "string" && SENSE_LEVELS.includes(v as SenseLevel)
    ? (v as SenseLevel)
    : fallback;
}

export function loadSettings(): Settings {
  const defaults: Settings = {
    sound: true,
    music: true,
    screenShake: true,
    inertia: true,
    tiltSensitivity: "med",
    directSpeed: "med",
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...defaults,
      ...parsed,
      tiltSensitivity: parseSense(parsed.tiltSensitivity, defaults.tiltSensitivity),
      directSpeed: parseSense(parsed.directSpeed, defaults.directSpeed),
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** Cycle Low → Med → High → Low. */
export function nextSenseLevel(level: SenseLevel): SenseLevel {
  const i = SENSE_LEVELS.indexOf(level);
  return SENSE_LEVELS[(i + 1) % SENSE_LEVELS.length]!;
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
