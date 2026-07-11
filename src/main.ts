import "./style.css";
import { Api } from "./api";
import { AudioSystem } from "./audio";
import { CommunityUi } from "./community";
import { FIXED_DT, DIRECT_CRUISE, PALETTE, POWERS, POWER_COLORS, POWER_NAMES, TILT_MAX_DEG } from "./config";
import { countryFlag, countryName } from "./countries";
import { createWorld, resizeWorld, tick } from "./gameState";
import { Input } from "./input";
import { Particles } from "./particles";
import { Popups } from "./popups";
import { Renderer, type TransitionFx } from "./render";
import {
  loadBestScore,
  loadControlPrefs,
  loadKeyBindings,
  loadSettings,
  nextSenseLevel,
  assignKey,
  saveBestScore,
  saveControlPrefs,
  saveKeyBindings,
  saveSettings,
  DEFAULT_KEYBINDS,
  formatKeyCode,
  type BooleanSetting,
  type KeyBindings,
} from "./save";
import { TiltControl } from "./tilt";
import { Tutorial } from "./tutorial";
import type { World } from "./types";
import { Ui } from "./ui";

type AppState =
  | "gate" // tap-to-enter splash (unlocks audio for the intro)
  | "intro" // 5s boot cinematic
  | "menu"
  | "launching"
  | "playing"
  | "paused"
  | "tutorial"
  | "gameover";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const audio = new AudioSystem();
const particles = new Particles();
const popups = new Popups();
const settings = loadSettings();
const controls = loadControlPrefs();
let keybinds: KeyBindings = loadKeyBindings();

let state: AppState = "gate";
let world: World = createWorld(renderer.viewW, renderer.viewH); // menu backdrop (not ticked)
let bestScore = loadBestScore();
/** Control scheme locked at run start; tags the score submission. */
let runMode: "classic" | "tilt" = "classic";
let accumulator = 0;
let uiTime = 0;
let fx: TransitionFx | null = null; // cinematic overlay (warp / flash / death veil / intro)
let gameOverUiShown = false;
let lastRunWasBest = false;
let tutorial: Tutorial | null = null;

const INTRO_SECONDS = 5;
const INTRO_HIT_AT = 0.42 * INTRO_SECONDS; // when the title slams in
const WARP_SECONDS = 2.1;
const FLASH_SECONDS = 0.55;
const DEATH_VEIL_SECONDS = 1.9;
/** Veil progress at which the game-over screen starts fading in. */
const DEATH_UI_AT = 0.55;

audio.setSound(settings.sound);
audio.setMusic(settings.music);

const api = new Api();

// --- tilt controls (mobile) ---

input.controlMode = controls.mode;
input.inertia = settings.inertia;
input.cruiseSpeed = DIRECT_CRUISE[settings.directSpeed];
input.tilt.maxTiltDeg = TILT_MAX_DEG[settings.tiltSensitivity];
input.setBindings(keybinds);
if (controls.tiltNeutral) input.tilt.setNeutral(controls.tiltNeutral);
if (controls.mode === "tilt") {
  if (!TiltControl.needsPermission()) {
    input.tilt.start();
  } else {
    // iOS requires a user gesture to (re-)confirm the motion permission
    window.addEventListener(
      "pointerdown",
      () => {
        void input.tilt.requestPermission().then((ok) => {
          if (ok) input.tilt.start();
          else input.controlMode = "stick"; // denied: don't leave the ship uncontrollable
        });
      },
      { once: true },
    );
  }
}

/** Permission + sensor warm-up + neutral capture. False = fall back to stick. */
async function enableTilt(): Promise<boolean> {
  if (!TiltControl.supported()) return false;
  if (!(await input.tilt.requestPermission())) return false;
  input.tilt.start();
  // the first sensor reading can lag the permission grant by a few frames
  let neutral = input.tilt.calibrate();
  for (let i = 0; i < 20 && !neutral; i++) {
    await new Promise((r) => setTimeout(r, 50));
    neutral = input.tilt.calibrate();
  }
  if (!neutral) return false;
  controls.mode = "tilt";
  controls.tiltNeutral = neutral;
  input.controlMode = "tilt";
  saveControlPrefs(controls);
  return true;
}

function setStickMode(): void {
  controls.mode = "stick";
  input.controlMode = "stick";
  saveControlPrefs(controls);
}

const ui = new Ui(settings, {
  onPlay: beginLaunch,
  onResume: resume,
  onRestart: beginLaunch,
  onQuitToMenu: quitToMenu,
  onPauseRequest: pause,
  onTutorial: startTutorial,
  onToggle: (key: BooleanSetting) => {
    settings[key] = !settings[key];
    saveSettings(settings);
    if (key === "sound") audio.setSound(settings.sound);
    if (key === "music") audio.setMusic(settings.music);
    if (key === "inertia") {
      input.inertia = settings.inertia;
      // direct control plays by tilt rules: turning it off mid-run re-tags the run
      if (!settings.inertia) runMode = "tilt";
    }
  },
  onCycleSense: (key) => {
    settings[key] = nextSenseLevel(settings[key]);
    saveSettings(settings);
    if (key === "directSpeed") input.cruiseSpeed = DIRECT_CRUISE[settings.directSpeed];
    if (key === "tiltSensitivity") input.tilt.maxTiltDeg = TILT_MAX_DEG[settings.tiltSensitivity];
    return settings[key];
  },
  onWorldArena: () => community.showWorldArena(),
  onArenas: () => community.showArenas(),
  onProfile: () => (api.signedIn ? community.showProfile() : community.showAuth(showMenu)),
  onControlModeChange: async (mode) => {
    if (mode === "tilt") {
      if (!(await enableTilt())) setStickMode();
    } else {
      setStickMode();
    }
    return controls.mode;
  },
  onRecalibrate: () => {
    const neutral = input.tilt.calibrate();
    if (neutral) {
      controls.tiltNeutral = neutral;
      saveControlPrefs(controls);
    }
  },
  getControls: () => ({ mode: controls.mode, tiltSupported: TiltControl.supported() }),
  getKeyBindings: () => keybinds,
  onRebind: (action, code) => {
    keybinds = assignKey(keybinds, action, code);
    saveKeyBindings(keybinds);
    input.setBindings(keybinds);
    return keybinds;
  },
  onResetKeyBindings: () => {
    keybinds = {
      up: [...DEFAULT_KEYBINDS.up],
      down: [...DEFAULT_KEYBINDS.down],
      left: [...DEFAULT_KEYBINDS.left],
      right: [...DEFAULT_KEYBINDS.right],
      pause: [...DEFAULT_KEYBINDS.pause],
    };
    saveKeyBindings(keybinds);
    input.setBindings(keybinds);
    return keybinds;
  },
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

/** Fade the menu, open the stargate, and dive into the run. */
function beginLaunch(): void {
  if (state === "launching") return;
  // touch stick is the default everywhere; tilt is an opt-in from Settings
  // (a tribute to Tilt to Live)
  doLaunch();
}

function doLaunch(): void {
  audio.unlock();
  audio.pauseMusic();
  audio.warp(WARP_SECONDS);
  state = "launching";
  fx = { kind: "warp", t: 0 };
  ui.fadeOutScreens();
}

function startRun(): void {
  audio.unlock();
  // inertia-off classic uses tilt physics, so it competes on the tilt board
  runMode = input.tiltActive || !settings.inertia ? "tilt" : "classic";
  world = createWorld(renderer.viewW, renderer.viewH);
  particles.clear();
  popups.clear();
  accumulator = 0;
  state = "playing";
  ui.hideAll();
  audio.playTrack("game");
}

/** Flight school: a sandbox world with scripted static drones, no spawner. */
function startTutorial(): void {
  audio.unlock();
  world = createWorld(renderer.viewW, renderer.viewH, true);
  particles.clear();
  popups.clear();
  accumulator = 0;
  fx = null;
  state = "tutorial";
  audio.playTrack("game");
  ui.showTutorialHud(() => quitToMenu());
  tutorial = new Tutorial(
    world,
    {
      touch: isTouchDevice(),
      inertia: settings.inertia,
      moveKeys: [keybinds.up, keybinds.left, keybinds.down, keybinds.right]
        .map((codes) => formatKeyCode(codes[0] ?? ""))
        .join(" "),
    },
    (html) => ui.setTutorialHint(html),
  );
}

function finishTutorial(): void {
  tutorial = null;
  state = "menu"; // stop ticking the sandbox; the send-off screen takes over
  ui.showTutorialEnd(
    () => beginLaunch(),
    () => quitToMenu(),
  );
}

function pause(): void {
  if (state !== "playing") return;
  state = "paused";
  audio.setThrustLevel(0);
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
  fx = null;
  tutorial = null;
  audio.setThrustLevel(0);
  audio.playTrack("menu");
  world = createWorld(renderer.viewW, renderer.viewH);
  particles.clear();
  popups.clear();
  showMenu();
}

/** Death: start the crimson veil; the game-over screen fades in mid-veil. */
function onGameOver(): void {
  state = "gameover";
  fx = { kind: "death", t: 0 };
  gameOverUiShown = false;
  audio.setThrustLevel(0);
  audio.playTrack("gameover");
  lastRunWasBest = world.score > bestScore;
  if (lastRunWasBest) {
    bestScore = world.score;
    saveBestScore(bestScore);
  }
}

function showGameOverUi(): void {
  gameOverUiShown = true;
  ui.showGameOver({
    score: world.score,
    time: world.time,
    kills: world.kills,
    best: bestScore,
    isNewBest: lastRunWasBest,
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
    mode: runMode,
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

const handleResize = (): void => {
  renderer.resize();
  resizeWorld(world, renderer.viewW, renderer.viewH);
};
window.addEventListener("resize", handleResize);
// iOS fires these instead of (or before) window resize when the browser
// chrome collapses or the phone rotates; without them the canvas mis-sizes.
window.visualViewport?.addEventListener("resize", handleResize);
window.addEventListener("orientationchange", () => setTimeout(handleResize, 100));

function isTouchDevice(): boolean {
  return input.touchUsed || "ontouchstart" in window;
}

/** Route gameplay events to audio, particles, and state transitions. */
function drainEvents(w: World): void {
  for (const e of w.events) {
    switch (e.type) {
      case "droneKilled": {
        if (e.wasFrozen) {
          particles.burst(e.x, e.y, [PALETTE.freeze, PALETTE.white, "#dffaff"], 16, 4, 0.7, 0.1);
        } else if (e.source === "pulse") {
          particles.burst(e.x, e.y, [PALETTE.pulse, PALETTE.goldPale, "#ffcc77"], 16, 5, 0.65, 0.12);
        } else {
          particles.burst(e.x, e.y, [PALETTE.redBright, PALETTE.gold, "#ff8866"], 14, 5, 0.6, 0.12);
        }
        if (e.points > 0) {
          // bonus kills get their power's color so players learn what pays more
          const color = e.wasFrozen
            ? PALETTE.freeze
            : e.source === "pulse"
              ? PALETTE.pulse
              : PALETTE.gold;
          popups.spawn(e.x, e.y, `+${e.points}`, color);
        }
        audio.droneKill();
        break;
      }
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
      case "starshellUp":
        particles.burst(world.ship.x, world.ship.y, [PALETTE.starshell, PALETTE.goldPale, PALETTE.white], 20, 5, 0.6, 0.12);
        audio.starshellUp();
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
      case "autocannonFire":
        audio.autocannonFire();
        break;
      case "meteorStrike":
        particles.burst(e.x, e.y, [PALETTE.meteors, PALETTE.goldPale, "#ff8844"], 20, 6, 0.65, 0.13);
        audio.meteorStrike();
        break;
      case "vortexOpen":
        particles.burst(e.x, e.y, [PALETTE.vortex, "#c4b8ff"], 14, 3, 0.5, 0.1);
        audio.vortexOpen();
        break;
      case "vortexCollapse":
        particles.burst(e.x, e.y, [PALETTE.vortex, PALETTE.white, "#c4b8ff"], 32, 8, 0.85, 0.15);
        audio.vortexCollapse();
        break;
      case "arcZap":
        particles.burst(e.x, e.y, [PALETTE.arc, PALETTE.white, "#c8f0ff"], 14, 5, 0.55, 0.1);
        audio.arcZap();
        break;
      case "arcFizzle":
        particles.burst(e.x, e.y, [PALETTE.arc, "#a8d8ff"], 10, 3, 0.35, 0.08);
        audio.arcFizzle();
        break;
      case "chainBonus":
        popups.spawn(e.x, e.y + 0.7, `CHAIN ×${e.count}  +${e.points}`, PALETTE.goldPale, 0.5);
        audio.chainBonus();
        break;
      case "pulseMultiKill":
        popups.spawn(e.x, e.y + 0.7, `PULSE ×${e.hits}  +${e.points}`, PALETTE.pulse, 0.5);
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

  // cinematic transition timeline
  if (state === "intro" && fx?.kind === "intro") {
    fx.t += dt / INTRO_SECONDS;
    if (fx.t >= 1) endIntro();
  } else if (state === "launching" && fx?.kind === "warp") {
    fx.t += dt / WARP_SECONDS;
    if (fx.t >= 1) {
      startRun();
      fx = { kind: "flash", t: 0 };
    }
  } else if (fx?.kind === "flash") {
    fx.t += dt / FLASH_SECONDS;
    if (fx.t >= 1) fx = null;
  } else if (state === "gameover" && fx?.kind === "death") {
    fx.t = Math.min(1, fx.t + dt / DEATH_VEIL_SECONDS);
    if (!gameOverUiShown && fx.t >= DEATH_UI_AT) showGameOverUi();
  }

  if (state === "playing" || state === "tutorial") {
    accumulator += dt;
    while (accumulator >= FIXED_DT) {
      tick(world, input.sample(), FIXED_DT);
      if (state === "tutorial") tutorial?.update(FIXED_DT);
      drainEvents(world);
      accumulator -= FIXED_DT;
    }

    audio.setThrustLevel(world.phase === "playing" ? world.ship.thrusting : 0);

    if (world.phase === "dead") {
      // dying in flight school just restarts the lesson
      if (state === "tutorial") startTutorial();
      else onGameOver();
    } else if (state === "tutorial" && tutorial?.done) {
      finishTutorial();
    }
  }

  particles.update(dt);
  popups.update(dt);

  renderer.render(world, particles, popups, {
    alpha: state === "playing" ? accumulator / FIXED_DT : 1,
    uiTime,
    shakeEnabled: settings.screenShake && (state === "playing" || state === "tutorial"),
    showHud: state === "playing" || state === "paused" || state === "tutorial",
    showShip:
      state !== "menu" && state !== "launching" && state !== "gate" && state !== "intro",
    bestScore,
    touch: state === "playing" || state === "tutorial" ? input.getTouchView() : null,
    fx,
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
    step(seconds: number, override?: { turn?: number; thrust?: number }) {
      if (state !== "playing") return;
      const steps = Math.round(seconds / FIXED_DT);
      for (let i = 0; i < steps && world.phase !== "dead"; i++) {
        const sample = input.sample();
        tick(
          world,
          {
            turn: override?.turn ?? sample.turn,
            thrust: override?.thrust ?? sample.thrust,
            heading: override ? null : sample.heading,
            moveVector: override ? null : sample.moveVector,
            inertia: sample.inertia,
            cruiseSpeed: sample.cruiseSpeed,
          },
          FIXED_DT,
        );
        drainEvents(world);
      }
      if (world.phase === "dead") onGameOver();
    },
  },
});

// --- boot: tap-to-enter gate → epic intro → menu ---

/** The gate tap doubles as the audio unlock, so the intro can roar. */
function enterFromGate(): void {
  if (state !== "gate") return;
  audio.unlock();
  audio.intro(INTRO_SECONDS, INTRO_HIT_AT);
  state = "intro";
  fx = { kind: "intro", t: 0 };
}

function endIntro(): void {
  fx = null;
  state = "menu";
  audio.playTrack("menu");
  showMenu();
}

ui.showIntroGate(enterFromGate);
// keyboard players can enter with any key; any input after the slam skips
window.addEventListener("keydown", () => {
  if (state === "gate") {
    ui.clearScreens();
    enterFromGate();
  } else if (state === "intro" && fx && fx.t * INTRO_SECONDS > INTRO_HIT_AT + 0.4) {
    endIntro();
  }
});
window.addEventListener("pointerdown", () => {
  if (state === "intro" && fx && fx.t * INTRO_SECONDS > INTRO_HIT_AT + 0.4) endIntro();
});

// Re-render the menu once the community server responds (session restore,
// server availability) so the community buttons appear/disappear correctly.
void api.init().then(() => {
  if (state === "menu") showMenu();
});

requestAnimationFrame(frame);
