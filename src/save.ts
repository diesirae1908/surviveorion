import type { SenseLevel } from "./config";
import type { ControlMode } from "./input";

export type { ControlMode, SenseLevel };

export type BooleanSetting = "sound" | "music" | "screenShake" | "inertia";

export type KeyAction = "up" | "down" | "left" | "right" | "pause";

/** KeyboardEvent.code lists per action — multiple codes = alternates (WASD + arrows). */
export type KeyBindings = Record<KeyAction, string[]>;

export const KEY_ACTIONS: KeyAction[] = ["up", "down", "left", "right", "pause"];

export const KEY_ACTION_LABELS: Record<KeyAction, string> = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  pause: "Pause",
};

export const DEFAULT_KEYBINDS: KeyBindings = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  pause: ["Escape", "KeyP"],
};

export interface Settings {
  sound: boolean;
  music: boolean;
  screenShake: boolean;
  /**
   * Flight drift. OFF (the default) = directional direct control: the ship
   * goes where you point, no momentum (scores on the Tilt/Direct board).
   * ON = classic thrust-and-drift piloting (scores on the Classic board).
   */
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
const KEYBINDS_KEY = "orion.keybinds";

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
    inertia: false, // direct control by default; inertia is the opt-in add-on
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

function cloneBinds(b: KeyBindings): KeyBindings {
  return {
    up: [...b.up],
    down: [...b.down],
    left: [...b.left],
    right: [...b.right],
    pause: [...b.pause],
  };
}

export function loadKeyBindings(): KeyBindings {
  try {
    const raw = localStorage.getItem(KEYBINDS_KEY);
    if (!raw) return cloneBinds(DEFAULT_KEYBINDS);
    const parsed = JSON.parse(raw) as Partial<Record<KeyAction, unknown>>;
    const out = cloneBinds(DEFAULT_KEYBINDS);
    for (const action of KEY_ACTIONS) {
      const v = parsed[action];
      if (Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === "string")) {
        out[action] = v as string[];
      }
    }
    return out;
  } catch {
    return cloneBinds(DEFAULT_KEYBINDS);
  }
}

export function saveKeyBindings(binds: KeyBindings): void {
  localStorage.setItem(KEYBINDS_KEY, JSON.stringify(binds));
}

/**
 * Bind `code` to `action` (replacing that action's keys). Removes the code from
 * any other action so one key never does two jobs.
 */
export function assignKey(binds: KeyBindings, action: KeyAction, code: string): KeyBindings {
  const next = cloneBinds(binds);
  for (const a of KEY_ACTIONS) {
    next[a] = next[a].filter((c) => c !== code);
  }
  next[action] = [code];
  // never leave an action empty — fall back to default if somehow cleared
  for (const a of KEY_ACTIONS) {
    if (next[a].length === 0) next[a] = [...DEFAULT_KEYBINDS[a]];
  }
  return next;
}

/** Pretty label for a KeyboardEvent.code. */
export function formatKeyCode(code: string): string {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  const special: Record<string, string> = {
    Space: "Space",
    Escape: "Esc",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    ShiftLeft: "LShift",
    ShiftRight: "RShift",
    ControlLeft: "LCtrl",
    ControlRight: "RCtrl",
    AltLeft: "LAlt",
    AltRight: "RAlt",
    MetaLeft: "Cmd",
    MetaRight: "Cmd",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Backquote: "`",
  };
  if (special[code]) return special[code];
  if (code.startsWith("Numpad")) return "Num" + code.slice(6);
  return code;
}

export function formatKeyList(codes: string[]): string {
  return codes.map(formatKeyCode).join(" / ");
}
