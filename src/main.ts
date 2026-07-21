import "./style.css";
import { Api, ApiError, type BoardMode, type SubmitResult } from "./api";
import { AudioSystem } from "./audio";
import { badgeInfo } from "./badges";
import { CommunityUi } from "./community";
import { FIXED_DT, DIRECT_CRUISE, PALETTE, POWERS, POWER_COLORS, POWER_HINTS, POWER_NAMES, TILT_MAX_DEG, type GameMode } from "./config";
import { countryFlag, countryName, guessCountry } from "./countries";
import { createWorld, resizeWorld, tick, DEATH_TO_GAMEOVER_SECONDS } from "./gameState";
import { Input, isTypingTarget } from "./input";
import { clamp01, hashString, setRunSeed } from "./math";
import { Particles } from "./particles";
import { Popups } from "./popups";
import { Renderer, type TransitionFx } from "./render";
import {
  loadBestScore,
  loadBestTime,
  loadControlPrefs,
  loadGameMode,
  loadKeyBindings,
  loadRunCount,
  loadSettings,
  saveGameMode,
  nextSenseLevel,
  assignKey,
  bumpRunCount,
  saveBestScore,
  saveBestTime,
  saveControlPrefs,
  saveKeyBindings,
  saveSettings,
  dailyAttemptsLeft,
  loadDailyAttempts,
  recordDailyResult,
  refundDailyAttempt,
  useDailyAttempt,
  DAILY_FREE_DEATH_SECONDS,
  DAILY_MAX_ATTEMPTS,
  DEFAULT_KEYBINDS,
  formatKeyCode,
  type BooleanSetting,
  type KeyBindings,
} from "./save";
import { buildShareText, dailyNumber, shareText } from "./share";
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

/**
 * The site's two personalities, one build:
 * - the root (surviveorion.com) is "Orion Daily" — boots straight into a
 *   Daily Patrol lobby, 3 attempts per UTC day (local budget, incognito
 *   bypass accepted), a free Training Ground, and a shareable result card;
 * - /fullgame (or ?fullgame=1) is the full arcade game — Classic, Iron Rain,
 *   arenas, wingmates, pilot login, the works.
 * The server SPA-fallbacks every unknown path to index.html, so /fullgame
 * needs no server-side route.
 */
const FULL_GAME =
  location.pathname.replace(/\/+$/, "") === "/fullgame" ||
  new URLSearchParams(location.search).has("fullgame");
const DAILY_ONLY = !FULL_GAME;

if (DAILY_ONLY) document.title = "ORION Daily";

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
let bestTime = loadBestTime();
/** Board mode (platform) locked at run start; tags the score submission. */
let runMode: BoardMode = "desktop";
let accumulator = 0;
let uiTime = 0;
let fx: TransitionFx | null = null; // cinematic overlay (warp / flash / death veil / intro)
let gameOverUiShown = false;
let lastRunWasBest = false;
let lastRunWasBestTime = false;
/** Longest flight before the run that just ended (for the game-over delta). */
let prevBestTime = 0;
/** Personal best passed mid-run (one celebration per run). */
let recordBeaten = false;
/** Daily Patrol: shared-seed run, files on today's board too. */
let pendingDaily = false;
let runIsDaily = false;
/** Training Ground (daily-only site): free, unscored practice run. */
let pendingTraining = false;
let runIsTraining = false;
/** Daily death inside the free-death window: the attempt was returned. */
let runRefunded = false;
/** Share card for the daily run that just ended (rank fills in on submit). */
let lastRunShare: {
  score: number;
  time: number;
  maxMultiplier: number;
  rank: number | null;
  attempt: number;
} | null = null;
/** Game mode picked on the menu; retries reuse it (Daily is always Classic). */
let pendingGameMode: GameMode = loadGameMode();
let runGameMode: GameMode = "classic";
let tutorial: Tutorial | null = null;

const INTRO_SECONDS = 5;
const INTRO_HIT_AT = 0.42 * INTRO_SECONDS; // when the title slams in
/** Grace before a tap/key skips the intro (so the gate tap doesn't skip it). */
const INTRO_SKIP_AFTER = 0.5;
const WARP_SECONDS = 2.1;
/** Retries skip the ceremony: a blink of warp instead of the full cinematic. */
const RETRY_WARP_SECONDS = 0.5;
const FLASH_SECONDS = 0.55;
const DEATH_VEIL_SECONDS = 1.9;
/** Veil progress at which the game-over screen starts fading in. */
const DEATH_UI_AT = 0.55;
/** Any tap/key after this much death cinematic skips straight to the results. */
const DEATH_SKIP_AFTER = 0.5;

let warpSeconds = WARP_SECONDS;

audio.setSound(settings.sound);
audio.setMusic(settings.music);

const api = new Api();

// --- crash reporting ---
// Uncaught errors from public testers would otherwise vanish silently.
// Ship them to the existing feedback log (visible on /admin), deduped and
// capped so a render-loop crash can't flood the server.
const reportedCrashes = new Set<string>();
function reportCrash(kind: string, detail: unknown): void {
  const err = detail instanceof Error ? detail : new Error(String(detail));
  const key = `${err.name}:${err.message}`;
  if (reportedCrashes.has(key) || reportedCrashes.size >= 2) return;
  reportedCrashes.add(key);
  const message = `[crash] ${kind}: ${err.message}\n${(err.stack ?? "").slice(0, 1500)}`;
  void api.sendFeedback(message.slice(0, 2000), "").catch(() => {});
}
window.addEventListener("error", (e) => reportCrash("error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => reportCrash("promise", e.reason));

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
  onPlay: (gameMode) => beginLaunch(false, gameMode),
  onDaily: () => beginLaunch(true),
  onResume: resume,
  // restarts keep the mode chosen at launch (no picker friction) and use the
  // quick warp — the "one more go" loop stays under ~1.5s
  onRestart: () => doLaunch(true),
  onQuitToMenu: quitToMenu,
  onPauseRequest: pause,
  onTutorial: startTutorial,
  onTraining: () => beginLaunch(false, "classic", true),
  onShare: () => {
    // game over shares the run that just ended; the lobby shares today's best
    const source =
      state === "gameover" && lastRunShare ? lastRunShare : loadDailyAttempts().best;
    if (!source) return Promise.resolve("failed" as const);
    return shareText(
      buildShareText({ dayNumber: dailyNumber(), ...source }),
      isTouchDevice(),
    );
  },
  onToggle: (key: BooleanSetting) => {
    settings[key] = !settings[key];
    saveSettings(settings);
    if (key === "sound") audio.setSound(settings.sound);
    if (key === "music") audio.setMusic(settings.music);
    // inertia is a flavor setting — it doesn't change which board the run ranks on
    if (key === "inertia") input.inertia = settings.inertia;
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
  onFriends: () => community.showFriends(),
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
  onFeedback: async (message, email) => {
    await api.sendFeedback(message, email);
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
  if (DAILY_ONLY) {
    const attempts = loadDailyAttempts();
    ui.showDailyLobby({
      dayNumber: dailyNumber(),
      attemptsLeft: DAILY_MAX_ATTEMPTS - attempts.used,
      maxAttempts: DAILY_MAX_ATTEMPTS,
      best: attempts.best,
      online: api.online,
      touchDevice: isTouchDevice(),
    });
    fillDailyHint();
    return;
  }
  bestScore = loadBestScore(pendingGameMode);
  bestTime = loadBestTime(pendingGameMode);
  ui.showMenu(bestScore, isTouchDevice(), {
    callsign: api.online ? (api.user?.callsign ?? undefined) : null,
    pendingFriends: api.pendingFriends,
  });
  fillDailyHint();
}

/** Fill the Daily Patrol hint with today's leader once the board loads. */
function fillDailyHint(): void {
  if (!api.online) return;
  const mode: BoardMode = isTouchDevice() ? "touch" : "desktop";
  void api
    .dailyLeaderboard(mode)
    .then((d) => {
      const top = d.entries[0];
      ui.setMenuDailyHint(
        top
          ? `today's leader: <b>${top.callsign.replace(/[&<>]/g, "")}</b> · ${top.best.toLocaleString()}`
          : "no patrols flown yet today. Be the first!",
      );
    })
    .catch(() => {});
}

/**
 * Launch entry point: on touch devices with a motion sensor, first offer the
 * choice between the default touch stick and tilt mode (Tilt to Live tribute).
 * Desktop has no sensor, so it goes straight in.
 */
function beginLaunch(daily: boolean, gameMode: GameMode = "classic", training = false): void {
  if (state === "launching") return;
  // daily-only site: out of attempts → back to the lobby (shows the countdown)
  if (DAILY_ONLY && daily && dailyAttemptsLeft() <= 0) {
    quitToMenu();
    return;
  }
  pendingDaily = daily;
  pendingTraining = training;
  if (!daily && !training) {
    pendingGameMode = gameMode;
    saveGameMode(gameMode); // the menu remembers the last mode flown
  }
  if (isTouchDevice() && TiltControl.supported()) {
    ui.showModeSelect(controls.mode, (mode) => {
      if (mode === "tilt") {
        void enableTilt().then((ok) => {
          if (!ok) setStickMode(); // permission denied → fly with the stick
          doLaunch();
        });
      } else {
        setStickMode();
        doLaunch();
      }
    });
    return;
  }
  doLaunch();
}

function doLaunch(quick = false): void {
  if (state === "launching") return;
  // daily-only retry path (Fly again / Space): the attempt budget still rules
  if (DAILY_ONLY && pendingDaily && dailyAttemptsLeft() <= 0) {
    quitToMenu();
    return;
  }
  audio.unlock();
  audio.pauseMusic();
  warpSeconds = quick ? RETRY_WARP_SECONDS : WARP_SECONDS;
  audio.warp(warpSeconds);
  state = "launching";
  fx = { kind: "warp", t: 0 };
  ui.fadeOutScreens();
}

/** Seed for today's Daily Patrol: same UTC date → same opening script. */
function dailySeed(): number {
  return hashString(`orion-daily-${new Date().toISOString().slice(0, 10)}`);
}

function startRun(): void {
  audio.unlock();
  // boards are per platform: phone tilt, phone touch stick, or desktop keys
  runMode = input.tiltActive ? "tilt" : isTouchDevice() ? "touch" : "desktop";
  runIsTraining = pendingTraining;
  runIsDaily = pendingDaily && !pendingTraining;
  runGameMode = runIsDaily || runIsTraining ? "classic" : pendingGameMode;
  // an attempt is spent the moment a daily run starts (quitting mid-run counts)
  if (DAILY_ONLY && runIsDaily) useDailyAttempt();
  runRefunded = false;
  // PBs are per game mode — the NEW RECORD beat compares like-for-like
  bestScore = loadBestScore(runGameMode);
  bestTime = loadBestTime(runGameMode);
  // Daily Patrol deals everyone the same script (and no beginner grace);
  // normal runs soften the opening for a player's first few flights.
  setRunSeed(runIsDaily ? dailySeed() : null);
  const grace = runIsDaily || runIsTraining ? 0 : clamp01(1 - loadRunCount() / 3);
  world = createWorld(
    renderer.viewW,
    renderer.viewH,
    false,
    grace,
    runGameMode,
    runIsDaily,
    runIsTraining,
  );
  recordBeaten = false;
  particles.clear();
  popups.clear();
  accumulator = 0;
  state = "playing";
  ui.hideAll();
  audio.playTrack("game");
  // dev-only console handle for manual playtesting (never in prod builds)
  if (import.meta.env.DEV) (window as unknown as { orionWorld: World }).orionWorld = world;
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
  audio.playTrack("tutorial"); // generated chill-epic loop, not the battle track
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
    // each lesson pauses the world behind a message; a tap resumes it
    (html) => ui.showTutorialMessage(html, () => tutorial?.dismiss()),
  );
}

function finishTutorial(): void {
  tutorial = null;
  state = "menu"; // stop ticking the sandbox; the send-off screen takes over
  ui.showTutorialEnd(
    // daily-only site: the send-off launch goes into today's patrol
    () => beginLaunch(DAILY_ONLY),
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
  // Training Ground runs are unscored: no PBs, no run count, no submission
  if (runIsTraining) return;
  // instant wipeouts are free: a daily death inside the grace window hands
  // the attempt back so a botched start doesn't burn the day's budget
  runRefunded = DAILY_ONLY && runIsDaily && world.time < DAILY_FREE_DEATH_SECONDS;
  if (runRefunded) refundDailyAttempt();
  bumpRunCount(); // new-pilot grace fades out with completed runs
  lastRunWasBest = world.score > bestScore;
  if (lastRunWasBest) {
    bestScore = world.score;
    saveBestScore(bestScore, runGameMode);
  }
  prevBestTime = bestTime;
  lastRunWasBestTime = world.time > bestTime;
  if (lastRunWasBestTime) {
    bestTime = world.time;
    saveBestTime(bestTime, runGameMode);
  }
}

function showGameOverUi(): void {
  gameOverUiShown = true;
  if (runIsTraining) {
    ui.showTrainingEnd(DAILY_ONLY ? dailyAttemptsLeft() : 1);
    return;
  }
  const cappedDaily = DAILY_ONLY && runIsDaily;
  // a refunded run never happened as far as the daily books are concerned:
  // no best-of-day entry, no share card, no daily board submission
  if (cappedDaily && !runRefunded) {
    // remember the run for the share card (rank arrives with the submit)
    recordDailyResult({
      score: Math.floor(world.score),
      time: world.time,
      maxMultiplier: world.maxMultiplier,
      rank: null,
    });
    lastRunShare = {
      score: Math.floor(world.score),
      time: world.time,
      maxMultiplier: world.maxMultiplier,
      rank: null,
      attempt: loadDailyAttempts().used,
    };
  }
  ui.showGameOver({
    score: world.score,
    scoreKills: world.scoreKills,
    scoreSurvival: world.scoreSurvival,
    scoreBonuses: world.scoreBonuses,
    time: world.time,
    kills: world.kills,
    maxMultiplier: world.maxMultiplier,
    best: bestScore,
    bestTime: prevBestTime,
    isNewBest: lastRunWasBest,
    isNewBestTime: lastRunWasBestTime,
    daily: runIsDaily,
    gameMode: runGameMode,
    touchDevice: isTouchDevice(),
    attemptsLeft: cappedDaily ? dailyAttemptsLeft() : undefined,
    showShare: cappedDaily && !runRefunded,
    refunded: runRefunded,
  });
  submitRun();
}

/** Paint the rank line + badge celebration from a score-submit response. */
function renderRankResult(r: SubmitResult): void {
  // daily-only site: the submit response carries the rank for the share card
  if (DAILY_ONLY && runIsDaily && r.dailyRank) {
    if (lastRunShare) lastRunShare.rank = r.dailyRank;
    recordDailyResult({
      score: Math.floor(world.score),
      time: world.time,
      maxMultiplier: world.maxMultiplier,
      rank: r.dailyRank,
    });
  }
  const parts: string[] = [];
  if (runIsDaily && r.dailyRank) parts.push(`Daily Patrol <b>#${r.dailyRank}</b>`);
  parts.push(`World rank <b>#${r.worldRank}</b>`);
  const country = api.user?.country;
  if (country && r.countryRank) {
    parts.push(`${countryFlag(country)} ${countryName(country)} <b>#${r.countryRank}</b>`);
  }
  // gap-to-goal: the next pilot to hunt (a wingmate beats a stranger)
  const target = r.nextWingmate ?? r.nextAbove;
  if (target && target.score > r.best) {
    const gap = (target.score - r.best + 1).toLocaleString();
    const who = target.callsign.replace(/[&<>]/g, "");
    const label = r.nextWingmate ? `your wingmate <b>${who}</b>` : `<b>${who}</b>`;
    parts.push(`<span class="dim">${gap} points to pass ${label}</span>`);
  }
  ui.setGameOverRank(parts.join(" &nbsp;·&nbsp; "));
  const earned = (r.newBadges ?? [])
    .map((id) => badgeInfo(id))
    .filter((b): b is NonNullable<typeof b> => !!b);
  ui.showEarnedBadges(earned);
}

/** Push the finished run to the leaderboards and show the resulting ranks. */
function submitRun(): void {
  if (!api.online) return;
  const run = {
    score: Math.floor(world.score),
    timeSurvived: world.time,
    kills: world.kills,
    maxMultiplier: world.maxMultiplier,
    mode: runMode,
    gameMode: runGameMode,
    platform: isTouchDevice() ? "touch" : "desktop",
    daily: (runIsDaily && !runRefunded) || undefined,
  };
  if (!api.signedIn) {
    void api.logRun(run).catch(() => {}); // analytics only, fire-and-forget
    // a name is enough to get on the boards: quick guest signup, then the
    // normal score submit — the device stays signed in for future runs
    ui.showGameOverGuestPrompt({
      onSave: async (name) => {
        // skip signup on a retry where the account was created but the score
        // submit failed — the session is already live
        let reusedName = false;
        if (!api.signedIn) {
          try {
            reusedName = await api.guestSignup(name, guessCountry());
          } catch (e) {
            // 409 = the name is locked to a registered pilot or another
            // device's guest — the server's message says which
            if (e instanceof ApiError && e.status === 409) throw new Error(e.message);
            throw e;
          }
        }
        renderRankResult(await api.submitScore(run));
        // the name matched this device's existing guest pilot: scores merge
        if (reusedName) ui.appendGameOverRankNote(`Welcome back, “${name.trim()}” — this run counts for your existing pilot.`);
      },
      // full sign-in: back to this screen after, where submitRun files the score
      onSignIn: () => community.showAuth(showGameOverUi),
    });
    return;
  }
  // retry bypasses the api.online gate — a transient failure marks us offline
  const trySubmit = (): void => {
    api
      .submitScore(run)
      .then(renderRankResult)
      .catch(() => ui.showGameOverSubmitError(trySubmit));
  };
  trySubmit();
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
        // no floating +points: with the dense swarm the numbers cluttered the
        // view — the HUD score and the kill burst are feedback enough
        audio.droneKill();
        break;
      }
      case "mineExploded":
        particles.burst(e.x, e.y, ["#ff8844", PALETTE.gold, PALETTE.redBright], 26, 7, 0.8, 0.15);
        audio.mineBoom();
        break;
      case "pickup":
        particles.burst(e.x, e.y, [POWER_COLORS[e.power], PALETTE.white], 12, 3.5, 0.5, 0.1);
        popups.spawn(e.x, e.y, POWER_NAMES[e.power].toUpperCase(), POWER_COLORS[e.power], 0.32);
        // the hint line lingers longer so new pilots learn what they grabbed
        popups.spawn(e.x, e.y - 0.55, POWER_HINTS[e.power], POWER_COLORS[e.power], 0.22, 1.7);
        audio.pickup();
        break;
      case "shieldUp":
        audio.shieldUp();
        break;
      case "starshellUp":
        particles.burst(world.ship.x, world.ship.y, [PALETTE.starshell, PALETTE.goldPale, PALETTE.white], 20, 5, 0.6, 0.12);
        // the shell makes ramming safe — say so, or players never dare
        popups.spawn(world.ship.x, world.ship.y + 1.3, "RAM THEM!", PALETTE.starshell, 0.5, 1.4);
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
      case "dashGrace":
        // the arrival second is free — tell the pilot so the dash feels safe
        popups.spawn(world.ship.x, world.ship.y + 1.3, "UNTOUCHABLE", PALETTE.afterburner, 0.38, 1.0);
        break;
      case "freeze":
        particles.burst(e.x, e.y, [PALETTE.freeze, PALETTE.white], 24, 6, 0.7, 0.12);
        audio.freeze();
        break;
      case "missilesFire":
        audio.missilesFire();
        break;
      case "missileBlast":
        particles.burst(e.x, e.y, [PALETTE.missiles, PALETTE.gold, "#ff9966"], 14, 4.5, 0.5, 0.11);
        audio.missileBlast();
        break;
      case "graze":
        // near-miss payoff: a gold spark + tick, no number (keeps the view clean)
        particles.burst(e.x, e.y, [PALETTE.goldPale, PALETTE.white], 5, 2.5, 0.3, 0.06);
        audio.graze();
        break;
      case "assembly": {
        // crowded drones just fused into a creature — name the threat
        const label = { lance: "LANCE", wheel: "WHEEL", hunter: "HUNTER", bomb: "BOMB" }[e.kind];
        popups.spawn(e.x, e.y, label, PALETTE.redBright, 0.4, 1.0);
        audio.assemblyForm();
        break;
      }
      case "assemblyBurst":
        // a creature shattered/detonated back into loose drones
        particles.burst(
          e.x,
          e.y,
          e.kind === "bomb"
            ? ["#ffee55", PALETTE.gold, PALETTE.white]
            : [PALETTE.redBright, "#ffaa33", PALETTE.white],
          e.kind === "bomb" ? 40 : 22,
          e.kind === "bomb" ? 8 : 5,
          0.7,
          0.13,
        );
        audio.mineBoom();
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
        popups.spawn(e.x, e.y + 0.7, `CHAIN ×${e.count}`, PALETTE.goldPale, 0.5);
        audio.chainBonus();
        break;
      case "pulseMultiKill":
        popups.spawn(e.x, e.y + 0.7, `PULSE ×${e.hits}`, PALETTE.pulse, 0.5);
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
    fx.t += dt / warpSeconds;
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

  if (state === "tutorial" && tutorial?.waiting) {
    // a lesson message is up: freeze the world (and drop banked time so
    // dismissing doesn't trigger a burst of catch-up ticks)
    accumulator = 0;
    audio.setThrustLevel(0);
  } else if (state === "playing" || state === "tutorial") {
    accumulator += dt;
    while (accumulator >= FIXED_DT) {
      tick(world, input.sample(), FIXED_DT);
      if (state === "tutorial") tutorial?.update(FIXED_DT);
      drainEvents(world);
      accumulator -= FIXED_DT;
    }

    audio.setThrustLevel(world.phase === "playing" ? world.ship.thrusting : 0);

    // Devil Daggers beat: crossing the personal best mid-run is celebrated
    // the moment it happens — the run flips from routine to all-in.
    if (
      state === "playing" &&
      world.phase === "playing" &&
      !world.training && // training is unscored — no record beats in there
      !recordBeaten &&
      bestScore > 0 &&
      world.score > bestScore
    ) {
      recordBeaten = true;
      popups.spawn(world.ship.x, world.ship.y + 1.4, "NEW RECORD", PALETTE.gold, 0.7);
      particles.burst(
        world.ship.x,
        world.ship.y,
        [PALETTE.gold, PALETTE.goldPale, PALETTE.white],
        40,
        6,
        0.9,
        0.14,
      );
      audio.newRecord();
    }

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
    daily:
      state === "launching"
        ? pendingDaily
        : (state === "playing" || state === "paused") && runIsDaily,
    touch: state === "playing" || state === "tutorial" ? input.getTouchView() : null,
    fx,
  });

  requestAnimationFrame(frame);
}

// debug/testing hook (used by automated playtests) — dev builds only, so the
// public daily site doesn't ship a ready-made cheat/automation surface
if (import.meta.env.DEV) Object.defineProperty(window, "__orion", {
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
  // daily-only site: skip the 5s cinematic — a daily habit wants zero friction
  if (DAILY_ONLY) {
    state = "menu";
    audio.playTrack("menu");
    showMenu();
    return;
  }
  audio.intro(INTRO_SECONDS, INTRO_HIT_AT);
  state = "intro";
  fx = { kind: "intro", t: 0 };
}

function endIntro(): void {
  fx = null;
  state = "menu";
  audio.stopIntro(); // cut the scheduled riser/braam if the player skipped early
  audio.playTrack("menu");
  showMenu();
}

/**
 * Skip the death ceremony: after a short beat, any tap/key fast-forwards the
 * explosion + veil so the results (and the retry button) arrive instantly.
 */
function skipDeathCinematic(): void {
  if (state === "playing" && world.phase === "dying" && world.deathTimer >= DEATH_SKIP_AFTER) {
    world.deathTimer = DEATH_TO_GAMEOVER_SECONDS; // next tick flips to game over
  } else if (state === "gameover" && fx?.kind === "death" && !gameOverUiShown) {
    fx.t = Math.max(fx.t, DEATH_UI_AT);
  }
}

ui.showIntroGate(enterFromGate);
// keyboard players can enter with any key; any input after a short beat skips
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (isTypingTarget(e.target)) return; // don't hijack keys typed into a form field
  if (state === "gate") {
    ui.clearScreens();
    enterFromGate();
  } else if (state === "intro" && fx && fx.t * INTRO_SECONDS > INTRO_SKIP_AFTER) {
    endIntro();
  } else if (state === "gameover" && gameOverUiShown && (e.code === "Space" || e.code === "Enter")) {
    doLaunch(true); // instant retry without reaching for the mouse
  } else {
    skipDeathCinematic();
  }
});
window.addEventListener("pointerdown", () => {
  if (state === "intro" && fx && fx.t * INTRO_SECONDS > INTRO_SKIP_AFTER) endIntro();
  else skipDeathCinematic();
});

// Re-render the menu once the community server responds (session restore,
// server availability) so the community buttons appear/disappear correctly.
void api.init().then(() => {
  if (state === "menu") showMenu();
});

// traffic beacon: who's arriving, from where (admin dashboard only)
api.logVisit(DAILY_ONLY ? "daily" : "fullgame", guessCountry());

requestAnimationFrame(frame);
