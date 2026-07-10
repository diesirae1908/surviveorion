export interface Settings {
  sound: boolean;
  music: boolean;
  screenShake: boolean;
}

const BEST_KEY = "orion.bestScore";
const SETTINGS_KEY = "orion.settings";

export function loadBestScore(): number {
  const raw = localStorage.getItem(BEST_KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function saveBestScore(score: number): void {
  localStorage.setItem(BEST_KEY, String(Math.floor(score)));
}

export function loadSettings(): Settings {
  const defaults: Settings = { sound: true, music: true, screenShake: true };
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
