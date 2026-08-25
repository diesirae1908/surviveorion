/**
 * Repo-relative asset paths.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ASSETS = {
  fontRegular: path.join(REPO_ROOT, "assets/brand/fonts/Rajdhani-400.ttf"),
  fontBold: path.join(REPO_ROOT, "assets/brand/fonts/Rajdhani-700.ttf"),
  mark: path.join(REPO_ROOT, "assets/brand/orion-mark-512.png"),
  coverSvg: path.join(REPO_ROOT, "assets/brand/orion-cover-vertical-template.svg"),
  sfxImpact: path.join(REPO_ROOT, "assets/sfx/impact.wav"),
  mutators: path.join(REPO_ROOT, "assets/mutators.json"),
};

export const FIXTURES_DIR = path.join(REPO_ROOT, "fixtures");
export const OUT_DIR = path.join(REPO_ROOT, "out");
export const GOLDEN_DIR = path.join(OUT_DIR, "golden");
export const ENDCARD_CACHE_DIR = path.join(OUT_DIR, ".cache", "endcards");

export const DAY43_BASE = "orion_2026-08-25_day43_arsenal_3490380";
