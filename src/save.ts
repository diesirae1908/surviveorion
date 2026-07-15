import { GAME_MODES, type GameMode, type SenseLevel } from "./config";
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
const BEST_TIME_KEY = "orion.bestTime";
const RUN_COUNT_KEY = "orion.runCount";
const SETTINGS_KEY = "orion.settings";
const CONTROLS_KEY = "orion.controls";
const KEYBINDS_KEY = "orion.keybinds";
const GAME_MODE_KEY = "orion.gameMode";
const DAILY_ATTEMPTS_KEY = "orion.dailyAttempts";

const SENSE_LEVELS: SenseLevel[] = ["low", "med", "high"];

function loadNumber(key: string): number {
  const raw = localStorage.getItem(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * PBs are kept per game mode so NEW RECORD and PB deltas compare like-for-like.
 * Classic reuses the historic keys, so pre-modes bests migrate for free.
 */
function modeKey(base: string, mode: GameMode): string {
  return mode === "classic" ? base : `${base}.${mode}`;
}

export function loadBestScore(mode: GameMode = "classic"): number {
  return loadNumber(modeKey(BEST_KEY, mode));
}

export function saveBestScore(score: number, mode: GameMode = "classic"): void {
  localStorage.setItem(modeKey(BEST_KEY, mode), String(Math.floor(score)));
}

/** Longest survival time in seconds (personal best, local, per game mode). */
export function loadBestTime(mode: GameMode = "classic"): number {
  return loadNumber(modeKey(BEST_TIME_KEY, mode));
}

export function saveBestTime(seconds: number, mode: GameMode = "classic"): void {
  localStorage.setItem(modeKey(BEST_TIME_KEY, mode), String(seconds));
}

/** Last game mode launched (Classic / Iron Rain) — the menu remembers it. */
export function loadGameMode(): GameMode {
  const raw = localStorage.getItem(GAME_MODE_KEY);
  return GAME_MODES.includes(raw as GameMode) ? (raw as GameMode) : "classic";
}

export function saveGameMode(mode: GameMode): void {
  localStorage.setItem(GAME_MODE_KEY, mode);
}

/** Lifetime completed runs on this device (drives the new-pilot grace curve). */
export function loadRunCount(): number {
  return loadNumber(RUN_COUNT_KEY);
}

export function bumpRunCount(): void {
  localStorage.setItem(RUN_COUNT_KEY, String(loadRunCount() + 1));
}

// --- Daily-only site: attempt budget (client-side, per UTC day) ---
//
// The daily variant allows DAILY_MAX_ATTEMPTS Daily Patrol launches per UTC
// day (the same day boundary as the daily seed). Purely local — incognito
// resets it, and that's accepted (Wordle model).

export const DAILY_MAX_ATTEMPTS = 3;

/** Best daily result so far today, kept for the share card after lockout. */
export interface DailyBestResult {
  score: number;
  time: number;
  maxMultiplier: number;
  /** Daily board rank at submit time (null = unranked / signed out). */
  rank: number | null;
  /** 1-based attempt number that produced this result. */
  attempt: number;
}

export interface DailyAttempts {
  /** UTC date (YYYY-MM-DD) these attempts belong to. */
  date: string;
  used: number;
  best: DailyBestResult | null;
}

/** Same UTC day boundary as the Daily Patrol seed in main.ts. */
export function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Today's attempt state; a stale date resets the budget. */
export function loadDailyAttempts(): DailyAttempts {
  const fresh: DailyAttempts = { date: utcDateString(), used: 0, best: null };
  try {
    const raw = localStorage.getItem(DAILY_ATTEMPTS_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<DailyAttempts>;
    if (parsed.date !== fresh.date || typeof parsed.used !== "number") return fresh;
    return {
      date: fresh.date,
      used: Math.max(0, Math.floor(parsed.used)),
      best: parsed.best ?? null,
    };
  } catch {
    return fresh;
  }
}

function saveDailyAttempts(state: DailyAttempts): void {
  localStorage.setItem(DAILY_ATTEMPTS_KEY, JSON.stringify(state));
}

export function dailyAttemptsLeft(): number {
  return Math.max(0, DAILY_MAX_ATTEMPTS - loadDailyAttempts().used);
}

/** Consume one attempt (called when a daily run actually starts). */
export function useDailyAttempt(): DailyAttempts {
  const state = loadDailyAttempts();
  state.used = Math.min(DAILY_MAX_ATTEMPTS, state.used + 1);
  saveDailyAttempts(state);
  return state;
}

/** Record a finished daily run if it beats (or first sets) today's best. */
export function recordDailyResult(result: Omit<DailyBestResult, "attempt">): DailyBestResult {
  const state = loadDailyAttempts();
  const attempt = Math.max(1, state.used);
  const entry: DailyBestResult = { ...result, attempt };
  if (!state.best || entry.score >= state.best.score) {
    state.best = entry;
    saveDailyAttempts(state);
    return entry;
  }
  // a better earlier run keeps the share card, but the server's dailyRank
  // always reflects today's BEST run — so refresh the stored rank regardless
  if (result.rank !== null) {
    state.best.rank = result.rank;
    saveDailyAttempts(state);
  }
  return state.best;
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
    // off by default: with Tilt to Live density the shake hurts readability
    screenShake: false,
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
