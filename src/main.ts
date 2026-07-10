import "./style.css";
import { Api } from "./api";
import { AudioSystem } from "./audio";
import { CommunityUi } from "./community";
import { FIXED_DT, PALETTE, POWERS, POWER_COLORS, POWER_NAMES } from "./config";
import { countryFlag, countryName } from "./countries";
import { createWorld, resizeWorld, tick } from "./gameState";
import { Input } from "./input";
import { Particles } from "./particles";
import { Popups } from "./popups";
import { Renderer } from "./render";
import { loadBestScore, loadSettings, saveBestScore, saveSettings } from "./save";
import type { World } from "./types";
import { Ui } from "./ui";

type AppState = "menu" | "playing" | "paused" | "gameover";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const audio = new AudioSystem();
const particles = new Particles();
const popups = new Popups();
const settings = loadSettings();

let state: AppState = "menu";
let world: World = createWorld(renderer.viewW, renderer.viewH); // menu backdrop (not ticked)
let bestScore = loadBestScore();
let accumulator = 0;
let uiTime = 0;

audio.setSound(settings.sound);
audio.setMusic(settings.music);

const api = new Api();

const ui = new Ui(settings, {
  onPlay: startRun,
  onResume: resume,
  onRestart: startRun,
  onQuitToMenu: quitToMenu,
  onPauseRequest: pause,
  onToggle: (key) => {
    settings[key] = !settings[key];
    saveSettings(settings);
    if (key === "sound") audio.setSound(settings.sound);
    if (key === "music") audio.setMusic(settings.music);
  },
  onWorldArena: () => community.showWorldArena(),
  onArenas: () => community.showArenas(),
  onProfile: () => (api.signedIn ? community.showProfile() : community.showAuth(showMenu)),
});

const community = new CommunityUi(
  document.getElementById("ui")!,
  api,
  showMenu,
  () => {}, // menu re-reads auth state every time it renders
);

function showMenu(): void {
  ui.showMenu(bestScore, isTouchDevice(), {
    callsign: api.online ? (api.user?.callsign ?? undefined) : null,
  });
}

function startRun(): void {
  audio.unlock();
  world = createWorld(renderer.viewW, renderer.viewH);
  particles.clear();
  popups.clear();
  accumulator = 0;
  state = "playing";
  ui.hideAll();
  audio.playTrack("game");
}

function pause(): void {
  if (state !== "playing") return;
  state = "paused";
  audio.setThrustLevel(0, false);
  audio.pauseMusic();
  ui.showPause();
}

function resume(): void {
  if (state !== "paused") return;
  state = "playing";
  ui.hideAll();
  audio.resumeMusic();
}

function quitToMenu(): void {
  state = "menu";
  audio.setThrustLevel(0, false);
  audio.playTrack("menu");
  world = createWorld(renderer.viewW, renderer.viewH);
  particles.clear();
  popups.clear();
  showMenu();
}

function onGameOver(): void {
  state = "gameover";
  audio.setThrustLevel(0, false);
  audio.playTrack("gameover");
  const isNewBest = world.score > bestScore;
  if (isNewBest) {
    bestScore = world.score;
    saveBestScore(bestScore);
  }
  ui.showGameOver({
    score: world.score,
    time: world.time,
    kills: world.kills,
    best: bestScore,
    isNewBest,
  });
  submitRun();
}

/** Push the finished run to the leaderboards and show the resulting ranks. */
function submitRun(): void {
  if (!api.online) return;
  if (!api.signedIn) {
    ui.setGameOverRank(`<span class="dim">Sign in from the menu to enter the World Arena</span>`);
    return;
  }
  const run = {
    score: Math.floor(world.score),
    timeSurvived: world.time,
    kills: world.kills,
    maxMultiplier: world.maxMultiplier,
  };
  api
    .submitScore(run)
    .then((r) => {
      const parts = [`World rank <b>#${r.worldRank}</b>`];
      const country = api.user?.country;
      if (country && r.countryRank) {
        parts.push(`${countryFlag(country)} ${countryName(country)} <b>#${r.countryRank}</b>`);
      }
      ui.setGameOverRank(parts.join(" &nbsp;·&nbsp; "));
    })
    .catch(() => ui.setGameOverRank(`<span class="dim">Score submission failed</span>`));
}

input.onPause = () => {
  if (state === "playing") pause();
  else if (state === "paused") resume();
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") pause();
});

window.addEventListener("resize", () => {
  renderer.resize();
  resizeWorld(world, renderer.viewW, renderer.viewH);
});

function isTouchDevice(): boolean {
  return input.touchUsed || "ontouchstart" in window;
}

/** Route gameplay events to audio, particles, and state transitions. */
function drainEvents(w: World): void {
  for (const e of w.events) {
    switch (e.type) {
      case "droneKilled":
        if (e.wasFrozen) {
          particles.burst(e.x, e.y, [PALETTE.freeze, PALETTE.white, "#dffaff"], 16, 4, 0.7, 0.1);
        } else {
          particles.burst(e.x, e.y, [PALETTE.redBright, PALETTE.gold, "#ff8866"], 14, 5, 0.6, 0.12);
        }
        if (e.points > 0) {
          popups.spawn(e.x, e.y, `+${e.points}`, e.wasFrozen ? PALETTE.freeze : PALETTE.gold);
        }
        audio.droneKill();
        break;
      case "mineExploded":
        particles.burst(e.x, e.y, ["#ff8844", PALETTE.gold, PALETTE.redBright], 26, 7, 0.8, 0.15);
        if (e.points > 0) popups.spawn(e.x, e.y, `+${e.points}`, "#ff8844");
        audio.mineBoom();
        break;
      case "pickup":
        particles.burst(e.x, e.y, [POWER_COLORS[e.power], PALETTE.white], 12, 3.5, 0.5, 0.1);
        popups.spawn(e.x, e.y, POWER_NAMES[e.power].toUpperCase(), POWER_COLORS[e.power], 0.32);
        audio.pickup();
        break;
      case "shieldUp":
        audio.shieldUp();
        break;
      case "shieldDetonate":
        particles.burst(e.x, e.y, [PALETTE.shield, PALETTE.white], 30, 8, 0.8, 0.14);
        audio.shieldDetonate();
        break;
      case "shockwave":
        particles.burst(e.x, e.y, [PALETTE.gold, PALETTE.goldPale], 26, 8, 0.7, 0.14);
        audio.shockwave();
        break;
      case "pulseCharge":
        audio.pulseCharge(POWERS.pulse.chargeTime);
        break;
      case "pulseFire":
        particles.burst(e.x, e.y, [PALETTE.pulse, PALETTE.white], 10, 4, 0.4, 0.1);
        audio.pulseFire();
        break;
      case "boostStart":
        audio.boostStart();
        break;
      case "afterburnerCharge":
        audio.pulseCharge(POWERS.afterburner.chargeTime);
        break;
      case "dash":
        audio.dash();
        break;
      case "freeze":
        particles.burst(e.x, e.y, [PALETTE.freeze, PALETTE.white], 24, 6, 0.7, 0.12);
        audio.freeze();
        break;
      case "missilesFire":
        audio.missilesFire();
        break;
      case "chainBonus":
        popups.spawn(e.x, e.y + 0.7, `CHAIN ×${e.count}  +${e.points}`, PALETTE.goldPale, 0.5);
        audio.chainBonus();
        break;
      case "droneSpawn":
        particles.burst(e.x, e.y, [PALETTE.redBright, PALETTE.redDark], 8, 2.5, 0.35, 0.08);
        break;
      case "ringWarning":
        audio.ringWarning();
        break;
      case "death":
        particles.burst(e.x, e.y, [PALETTE.gold, PALETTE.redBright, PALETTE.white], 60, 9, 1.2, 0.18);
        audio.death();
        break;
    }
  }
  w.events.length = 0;
}

let last = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  uiTime += dt;

  if (state === "playing") {
    accumulator += dt;
    while (accumulator >= FIXED_DT) {
      tick(world, input.sample(), FIXED_DT);
      drainEvents(world);
      accumulator -= FIXED_DT;
    }

    const s = world.ship;
    audio.setThrustLevel(
      world.phase === "playing" ? Math.max(s.thrusting, s.boostHeld ? 1 : 0) : 0,
      s.boostHeld,
    );

    if (world.phase === "dead") onGameOver();
  }

  particles.update(dt);
  popups.update(dt);

  renderer.render(world, particles, popups, {
    alpha: state === "playing" ? accumulator / FIXED_DT : 1,
    uiTime,
    shakeEnabled: settings.screenShake && state === "playing",
    showHud: state === "playing" || state === "paused",
    showShip: state !== "menu",
    bestScore,
    touch: state === "playing" ? input.getTouchView() : null,
  });

  requestAnimationFrame(frame);
}

// debug/testing hook (used by automated playtests)
Object.defineProperty(window, "__orion", {
  value: {
    get world() {
      return world;
    },
    get state() {
      return state;
    },
    get audio() {
      return audio;
    },
    /** Advance the simulation manually (rAF is throttled in headless tests). */
    step(seconds: number, override?: { turn?: number; thrust?: number; boost?: boolean }) {
      if (state !== "playing") return;
      const steps = Math.round(seconds / FIXED_DT);
      for (let i = 0; i < steps && world.phase !== "dead"; i++) {
        const sample = input.sample();
        tick(
          world,
          {
            turn: override?.turn ?? sample.turn,
            thrust: override?.thrust ?? sample.thrust,
            boost: override?.boost ?? sample.boost,
          },
          FIXED_DT,
        );
        drainEvents(world);
      }
      if (world.phase === "dead") onGameOver();
    },
  },
});

showMenu();
// Re-render the menu once the community server responds (session restore,
// server availability) so the community buttons appear/disappear correctly.
void api.init().then(() => {
  if (state === "menu") showMenu();
});
// Menu music: autoplay is blocked until the first interaction, so mark the
// menu track current now (play fails silently) and retry on first input.
audio.playTrack("menu");
const tryMenuMusic = (): void => {
  if (state === "menu") audio.playTrack("menu");
};
window.addEventListener("pointerdown", tryMenuMusic, { once: true });
window.addEventListener("keydown", tryMenuMusic, { once: true });

requestAnimationFrame(frame);
