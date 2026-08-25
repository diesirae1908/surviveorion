/**
 * Repo-relative asset paths.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ASSETS = {
  fontRegular: path.join(REPO_ROOT, "assets/brand/fonts/Rajdhani-400.ttf"),
  fontBold: path.join(REPO_ROOT, "assets/brand/fonts/Rajdhani-700.ttf"),
  fontAnton: path.join(REPO_ROOT, "assets/brand/fonts/Anton-Regular.ttf"),
  mark: path.join(REPO_ROOT, "assets/brand/orion-mark-512.png"),
  coverSvg: path.join(REPO_ROOT, "assets/brand/orion-cover-vertical-template.svg"),
  sfxImpact: path.join(REPO_ROOT, "assets/sfx/impact.wav"),
  sfxRiser: path.join(REPO_ROOT, "assets/sfx/riser.wav"),
  sfxBoom: path.join(REPO_ROOT, "assets/sfx/boom.wav"),
  sfxRewind: path.join(REPO_ROOT, "assets/sfx/rewind.wav"),
  sfxWhoosh: path.join(REPO_ROOT, "assets/sfx/whoosh.wav"),
  sfxWah: path.join(REPO_ROOT, "assets/sfx/wah.wav"),
  sfxBraam: path.join(REPO_ROOT, "assets/sfx/braam.wav"),
  memes: path.join(REPO_ROOT, "assets/memes"),
  mutators: path.join(REPO_ROOT, "assets/mutators.json"),
  musicNote: path.join(REPO_ROOT, "assets/music/README.md"),
};

export const MEME = {
  vignette: path.join(REPO_ROOT, "assets/memes/vignette-1080x1920.png"),
};

export const SUNO_MUSIC_DIR = path.join(
  process.env.HOME ?? "",
  "Documents/games/orion-web/public/music"
);

export function defaultBoardMusic() {
  return path.join(SUNO_MUSIC_DIR, "empire-of-the-stars.mp3");
}

export const FIXTURES_DIR = path.join(REPO_ROOT, "fixtures");
export const OUT_DIR = path.join(REPO_ROOT, "out");
export const GOLDEN_DIR = path.join(OUT_DIR, "golden");
export const ENDCARD_CACHE_DIR = path.join(OUT_DIR, ".cache", "endcards");

export const DAY43_BASE = "orion_2026-08-25_day43_arsenal_3490380";
