import "./style.css";
import { Api, ApiError, type BoardMode, type DailyHistoryEntry, type SubmitResult } from "./api";
import { AudioSystem } from "./audio";
import { badgeInfo } from "./badges";
import { CommunityUi } from "./community";
import { FIXED_DT, DIRECT_CRUISE, PALETTE, POWERS, POWER_COLORS, POWER_HINTS, POWER_NAMES, TILT_MAX_DEG, type GameMode } from "./config";
import { guessCountry } from "./countries";
import { isThirdPartyCrashNoise } from "./crashFilter";
import {
  dayInfoFor,
  daysInMonth,
  leadingPadding,
  maxDateStr,
  monthLabel,
  nextMonthOf,
  prevMonthOf,
  utcDateStr,
  type MonthKey,
} from "./dailyHistory";
import { createWorld, resizeWorld, tick, DEATH_TO_GAMEOVER_SECONDS } from "./gameState";
import { closestCallLabel } from "./highlights";
import { Input, isTypingTarget } from "./input";
import { sanitizePinnedRow } from "./nickname";
import { patrolDateStr } from "./patrolDate";
import { clamp01, hashString, setRunSeed } from "./math";
import { medalForScore, medalThresholdsFor, nextMedalHint } from "./medals";
import {
  buildClipSidecar,
  clipSidecarBasename,
  type ClipSidecar,
  type ClipSidecarPower,
} from "./clipSidecar";
import {
  clearActiveMutators,
  getActiveMutators,
  getMutatorById,
  getMutatorsForDate,
  getMutatorsForDateStr,
  mutatorGrazePopups,
  mutatorViewScale,
  setActiveMutators,
  MUTATOR_POOL,
  type Mutator,
} from "./mutators";
import { Particles } from "./particles";
import { Popups } from "./popups";
import { Renderer, type TransitionFx } from "./render";
import { clipExtension, downloadClip, startRecording, type RecordingHandle } from "./recorder";
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
  dailyBestScoreToday,
  loadDailyAttempts,
  loadDailyHistory,
  recordDailyResult,
  refundDailyAttempt,
  useDailyAttempt,
  DAILY_FREE_DEATH_SECONDS,
  DAILY_MAX_ATTEMPTS,
  DEFAULT_KEYBINDS,
  formatKeyCode,
  type BooleanSetting,
  type DailyDayLog,
  type KeyBindings,
} from "./save";
import { buildShareText, dailyNumber, shareText, DAILY_EPOCH_DATE } from "./share";
import { TiltControl } from "./tilt";
import { Tutorial } from "./tutorial";
import type { World } from "./types";
import { deriveGameOverRank, Ui, type CalendarCell, type PatrolCalendarMonth } from "./ui";

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
 *   Daily Patrol lobby, 3 attempts per Pacific day (local budget, incognito
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

/**
 * Playtest override: ?mutator=<id> (or ?mutator=<id1>,<id2> to preview a
 * Sunday-style double) forces today's Daily Mutator(s) for this session,
 * instead of the date-hash pick. Only ever applies where mutators normally
 * apply (Daily Patrol, via todaysMutators() below); Classic/Iron Rain/
 * Training Ground are untouched either way.
 *
 * Sandboxed by construction: every call site below that would spend a daily
 * attempt, submit a score, or record a local medal checks PREVIEW_ACTIVE
 * first and skips it, so a preview run can't touch boards, streaks, or the
 * attempt budget.
 *
 * Dev-only on localhost (Lucas's call, 2026-08-10): letting anyone rehearse a
 * specific mutator by id kills the everyone-discovers-the-day-together
 * scarcity that's the whole point of a daily. Restricted to localhost/127.0.0.1
 * (so `npm run dev` keeps the rehearsal tool for tuning). On production the
 * params are ignored unless the signed-in account is on the clip-inbox
 * allowlist (`GET /api/me` `clipInbox`). The lobby Crew Rehearsal picker
 * is allowlist-only everywhere, including localhost. A leftover
 * `?rehearsal=director` flag must not unlock future days for the next
 * account on that browser.
 *
 * `?day=YYYY-MM-DD` (same gate) forces the daily run seed and, unless
 * `?mutator=` overrides it, the mutator pick to that civil date — identical
 * shared instance to what pilots will get. Invalid dates fall back to today,
 * silently. Both params are sandboxed like any preview run.
 *
 * Unlike the real picker, no exclusion-tag compatibility check runs here,
 * the override forces exactly what's asked, including a combo that wouldn't
 * naturally pair, since testing an odd combo is sometimes the point. Unknown
 * ids are dropped silently; extra ids past the first two are dropped too
 * (matches the one-or-two-per-day rule); if nothing valid survives, this
 * falls back to today's real mutator(s).
 */
const PREVIEW_ALLOWED_HOST = location.hostname === "localhost" || location.hostname === "127.0.0.1";
try {
  localStorage.removeItem("orion.rehearsal");
} catch {
  /* private browsing */
}

function parsePreviewDayParam(): Date | null {
  const raw = new URLSearchParams(location.search).get("day");
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return d;
}

function parsePreviewMutators(): Mutator[] {
  return (
    new URLSearchParams(location.search)
      .get("mutator")
      ?.split(",")
      .map((id) => getMutatorById(id.trim()))
      .filter((m): m is Mutator => !!m)
      .slice(0, 2) ?? []
  );
}

/** Set after GET /api/me when this Google account is allowlisted. */
let creatorAccess = false;
let PREVIEW_DAY: Date | null = null;
let PREVIEW_MUTATORS: Mutator[] = [];
let PREVIEW_ACTIVE = false;
let PREVIEW_REHEARSAL_DATE: string | null = null;

function previewGateOpen(): boolean {
  // Localhost keeps ?day= / ?mutator= for tuning. Production is allowlist
  // only: a leftover ?rehearsal=director in localStorage must not unlock
  // future days for whoever next signs in on that browser.
  return PREVIEW_ALLOWED_HOST || creatorAccess;
}

function syncPreview(): void {
  const allowed = previewGateOpen();
  if (allowed && PREVIEW_DAY === null && PREVIEW_MUTATORS.length === 0) {
    PREVIEW_DAY = parsePreviewDayParam();
    PREVIEW_MUTATORS = parsePreviewMutators();
  }
  if (!allowed) {
    PREVIEW_DAY = null;
    PREVIEW_MUTATORS = [];
  }
  PREVIEW_REHEARSAL_DATE = PREVIEW_DAY?.toISOString().slice(0, 10) ?? null;
  PREVIEW_ACTIVE = allowed && (PREVIEW_MUTATORS.length > 0 || PREVIEW_DAY !== null);
}

syncPreview();

function addIsoDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function upcomingPatrols(n = 14): Array<{ date: string; names: string }> {
  const today = patrolDateStr();
  const out: Array<{ date: string; names: string }> = [];
  for (let i = 0; i < n; i++) {
    const date = addIsoDays(today, i);
    const muts = getMutatorsForDateStr(date);
    out.push({ date, names: muts.map((m) => m.name).join(" + ") || "CLASSIC" });
  }
  return out;
}

function applyCreatorAccess(on: boolean): void {
  creatorAccess = on;
  syncPreview();
}

function setRehearsalDay(dateStr: string | null): void {
  if (!previewGateOpen()) return;
  if (!dateStr) {
    PREVIEW_DAY = null;
    PREVIEW_MUTATORS = [];
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    PREVIEW_DAY = Number.isNaN(d.getTime()) ? null : d;
    PREVIEW_MUTATORS = [];
  }
  syncPreview();
  if (state === "menu") showMenu();
}

if (PREVIEW_ACTIVE) {
  const bits = [
    PREVIEW_MUTATORS.length > 0
      ? `mutator(s): ${PREVIEW_MUTATORS.map((m) => m.id).join(" + ")}`
      : PREVIEW_DAY
        ? `mutator(s): ${getMutatorsForDate(PREVIEW_DAY).map((m) => m.id).join(" + ") || "vanilla"}`
        : null,
    PREVIEW_REHEARSAL_DATE ? `date: ${PREVIEW_REHEARSAL_DATE}` : null,
  ].filter(Boolean);
  console.log(
    `[preview] ${bits.join(" · ")} for this session. ` +
      "Sandboxed: no daily attempt spent, no score submitted, no medal recorded " +
      "(game over still shows the medal this score would earn).",
  );
  console.log(`Valid mutator ids: ${MUTATOR_POOL.map((m) => m.id).join(", ")}`);
}

/** Patrol date label for preview/rehearsal runs (today's PT date otherwise). */
function currentPatrolDateStr(): string {
  return PREVIEW_REHEARSAL_DATE ?? patrolDateStr();
}

/** UTC date whose shared daily script preview/rehearsal runs use (today otherwise). */
function previewDailyDate(): Date {
  return PREVIEW_DAY ?? new Date();
}

/** Today's Daily Mutator(s): date-hash pick, preview override, or rehearsed day. */
function todaysMutators(): Mutator[] {
  if (PREVIEW_MUTATORS.length > 0) return PREVIEW_MUTATORS;
  if (PREVIEW_ACTIVE && PREVIEW_DAY) return getMutatorsForDate(PREVIEW_DAY);
  return getMutatorsForDateStr(patrolDateStr());
}

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
/** Today's Daily Mutator arena-size override, applied to viewW/viewH (1 = normal). */
let currentViewScale = 1;
/** Training Ground (daily-only site): free, unscored practice run. */
let pendingTraining = false;
let runIsTraining = false;
/** Daily death inside the free-death window: the attempt was returned. */
let runRefunded = false;
/** Opt-in local recording of the run in progress (see recorder.ts), if any. */
let activeRecording: RecordingHandle | null = null;
/** Finished clip for the run that just ended, ready to download from the result screen. */
let lastClipBlob: Blob | null = null;
/** True if that clip got cut short by RECORDING_MAX_SECONDS instead of stopping at game over. */
let lastClipCapped = false;
/** Sidecar snapshotted at game-over so a later save cannot read a reset world. */
let lastClipSidecar: ClipSidecar | null = null;
let lastClipBasename: string | null = null;
/** Power pickups this run (world.time), snapshotted into the sidecar. */
let clipPowerLog: ClipSidecarPower[] = [];
/** Share card for the daily run that just ended (rank fills in on submit). */
let lastRunShare: {
  score: number;
  time: number;
  maxMultiplier: number;
  rank: number | null;
  attempt: number;
  mutatorNames?: string[];
  medal?: import("./medals").MedalTier | null;
  preview?: boolean;
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
  // Drop known third-party/browser-injected noise before it spends a slot —
  // see crashFilter.ts. Without this, two of these in a row could fill the
  // cap and silently hide a genuine crash that lands right after them.
  if (isThirdPartyCrashNoise(err.message)) return;
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
// On platforms without a permission gate the sensor can warm up right away.
// On iOS we deliberately DON'T request permission here: the old first-tap
// request fired the motion dialog out of context (on "tap to enter"), players
// reflexively denied it, and Safari caches a denial for the whole session —
// silently killing tilt everywhere. The mode-select "Tilt" tap (a real,
// in-context click) is now the only place that asks.
if (controls.mode === "tilt" && !TiltControl.needsPermission()) {
  input.tilt.start();
}

type TiltEnableResult = "ok" | "denied" | "no-data";

/** Permission + sensor warm-up + neutral capture. Non-"ok" = fall back to stick. */
async function enableTilt(): Promise<TiltEnableResult> {
  if (!TiltControl.supported()) return "denied";
  if (!(await input.tilt.requestPermission())) return "denied";
  input.tilt.start();
  // the first sensor reading can lag the permission grant by a few frames
  let neutral = input.tilt.calibrate();
  for (let i = 0; i < 20 && !neutral; i++) {
    await new Promise((r) => setTimeout(r, 50));
    neutral = input.tilt.calibrate();
  }
  if (!neutral) return "no-data";
  controls.mode = "tilt";
  controls.tiltNeutral = neutral;
  input.controlMode = "tilt";
  saveControlPrefs(controls);
  return "ok";
}

/**
 * Tilt couldn't start: fall back to the stick and SAY SO. iOS caches a motion
 * permission denial for the whole Safari session and auto-denies every later
 * request without showing the dialog, so the player needs to know how to
 * un-wedge it (silent stick fallback here read as "tilt is broken").
 */
function failTiltToStick(reason: TiltEnableResult): void {
  setStickMode();
  ui.toast(
    reason === "no-data"
      ? "No motion data from this device. Flying with the touch stick."
      : "Motion access is blocked, so tilt can't steer. Flying with the touch stick. " +
          "To fix it: quit and reopen your browser (or allow Motion & Orientation access" +
          " in its settings), then pick Tilt again.",
  );
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
    // the lobby's "today's best" doesn't carry mutator/medal metadata (it's
    // a DailyBestResult, not a lastRunShare), so fill it in from today's
    // date the same way the briefing card does
    const mutatorsToday = todaysMutators();
    // pre-launch-gate days: mutatorsToday is empty (see mutators.ts
    // MUTATORS_START_DATE), so the share card carries no mutator line and
    // no medal line, exactly like it did before this feature shipped.
    const todaysMutatorNames = mutatorsToday.length > 0 ? mutatorsToday.map((m) => m.name) : undefined;
    const asShare = source as Partial<{ mutatorNames: string[]; medal: import("./medals").MedalTier | null }>;
    const sourceMedal = asShare.medal;
    const sourceMutatorNames = asShare.mutatorNames;
    const medal =
      sourceMedal !== undefined
        ? sourceMedal
        : mutatorsToday.length > 0
          ? medalForScore(dailyBestScoreToday(), medalThresholdsFor(mutatorsToday))
          : undefined;
    return shareText(
      buildShareText({
        dayNumber: dailyNumber(),
        ...source,
        mutatorNames: sourceMutatorNames ?? todaysMutatorNames,
        medal,
        preview: PREVIEW_ACTIVE,
      }),
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
  onPatrolCalendar: () => openPatrolCalendar(),
  onControlModeChange: async (mode) => {
    if (mode === "tilt") {
      const r = await enableTilt();
      if (r !== "ok") failTiltToStick(r);
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
  onSaveClip: () => {
    if (!lastClipBlob || !lastClipBasename) return false;
    downloadClip(lastClipBlob, `${lastClipBasename}.${clipExtension(lastClipBlob)}`);
    return true;
  },
  onSendToInbox: async () => {
    if (!lastClipBlob || !lastClipSidecar || !lastClipBasename) return false;
    try {
      await api.uploadClipInbox(
        lastClipBlob,
        lastClipSidecar,
        lastClipBasename,
        clipExtension(lastClipBlob),
      );
      return true;
    } catch {
      return false;
    }
  },
  onRehearseDay: (date) => setRehearsalDay(date),
  onCrewSignIn: () =>
    community.showAuth(() => {
      applyCreatorAccess(api.clipInbox);
      showMenu();
    }),
  onPilot: (callsign) => community.showPilot(callsign, showMenu),
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
  () => {
    applyCreatorAccess(api.clipInbox);
  },
);

function showMenu(): void {
  if (DAILY_ONLY) {
    const attempts = loadDailyAttempts();
    const mutatorsToday = todaysMutators();
    ui.showDailyLobby({
      dayNumber: dailyNumber(PREVIEW_REHEARSAL_DATE ? previewDailyDate() : undefined),
      attemptsLeft: DAILY_MAX_ATTEMPTS - attempts.used,
      maxAttempts: DAILY_MAX_ATTEMPTS,
      best: attempts.best,
      online: api.online,
      touchDevice: isTouchDevice(),
      mutators: mutatorsToday,
      // pre-launch-gate days: mutatorsToday is empty (see mutators.ts
      // MUTATORS_START_DATE), so leave thresholds undefined too. The
      // lobby then skips the whole briefing card.
      medalThresholds: mutatorsToday.length > 0 ? medalThresholdsFor(mutatorsToday) : undefined,
      preview: PREVIEW_ACTIVE,
      previewDate: PREVIEW_REHEARSAL_DATE ?? undefined,
      creator: creatorAccess,
      upcomingDays: creatorAccess ? upcomingPatrols(14) : undefined,
      callsign: api.user?.callsign,
      country: api.user?.country,
      pendingFriends: api.pendingFriends,
    });
    fillDailyHint();
    fillDailyBoard();
    return;
  }
  bestScore = loadBestScore(pendingGameMode);
  bestTime = loadBestTime(pendingGameMode);
  ui.showMenu(bestScore, isTouchDevice(), {
    callsign: api.online ? (api.user?.callsign ?? undefined) : null,
    pendingFriends: api.pendingFriends,
    clipInbox: api.clipInbox,
  });
  fillDailyHint();
}

/**
 * Fill the Daily Patrol hint with today's leader once the board loads.
 * MUST read the same combined (all-devices) ranking as TODAY'S BOARD below
 * it: this used to call the per-device daily board, so the hint could name
 * a different pilot (and a different, lower score) than TODAY'S BOARD #1
 * (2026-08-18 fix, Lucas's screenshot: desktop hint said 627k while the
 * combined board's #1 was a 1.01M phone score). The server already runs
 * every entry through sanitizeCallsignForDisplay before it reaches this
 * response; the `[&<>]` strip below is only HTML-escaping for the innerHTML
 * render, not content moderation.
 */
function fillDailyHint(): void {
  if (!api.online) return;
  void api
    .dailyLeaderboardCombined()
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
 * Fill the daily-only lobby's inline leaderboard: one ranking merging every
 * device. The UI shows the top 10 by default; the full board is kept client-
 * side for search. The viewer's row is pinned below when their rank is outside
 * the top 10 (no pin if anonymous or no daily run today).
 */
function fillDailyBoard(): void {
  if (!api.online) return;
  void api
    .dailyLeaderboardCombined(200)
    .then((d) => {
      const myCallsign = api.user?.callsign;
      const entries = d.entries.map((e, i) => ({
        rank: i + 1,
        callsign: e.callsign,
        country: e.country,
        score: e.best,
        mode: e.mode,
        isMe: !!myCallsign && myCallsign === e.callsign,
        virtual: !!e.virtual,
      }));
      const inTopTen = entries.slice(0, 10).some((e) => e.isMe);
      const pinned =
        d.me && d.me.rank > 10 && myCallsign && !inTopTen
          ? sanitizePinnedRow({
              rank: d.me.rank,
              callsign: myCallsign,
              country: api.user?.country ?? "",
              score: d.me.best,
              mode: d.me.mode,
              isMe: true,
            })
          : null;
      ui.setDailyBoard({ entries, pinned });
    })
    .catch(() => ui.setDailyBoard(null));
}

// --- Patrol history calendar ---
//
// One month of day statuses at a time (see dailyHistory.ts for what each
// status means and why). Local history (save.ts) is always available
// instantly; a signed-in pilot's server history (api.ts dailyHistory) is
// fetched per month and layered on top, since it's the authoritative source
// once it answers (dayInfoFor prefers `server` over `local` when signed in).

/** Month currently shown, or null when the calendar isn't open. UTC
 * calendar months, matching the daily rollover boundary everywhere else. */
let calendarMonth: MonthKey | null = null;
/** Server day entries fetched so far this session, keyed by date string.
 * Never evicted (a session-lifetime cache of a few dozen small rows at
 * most) so flipping back to an already-seen month is instant. */
const calendarServerCache = new Map<string, DailyHistoryEntry>();
/** "YYYY-MM" keys already fetched (or attempted), so re-opening a month
 * doesn't refire the request — including a month with zero entries, which
 * would otherwise look identical to "not fetched yet" and refetch forever. */
const calendarFetchedMonths = new Set<string>();
/** Bumped on every navigation; a fetch response for a month the player has
 * since navigated away from is discarded instead of repainting a stale
 * screen (see renderPatrolCalendar). */
let calendarFetchToken = 0;

function monthKeyStr({ year, month }: MonthKey): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** [earliest, latest] navigable months: never before the feature's epoch
 * (or this pilot's join date, if later and signed in), never after today. */
function patrolCalendarBounds(): { min: MonthKey; max: MonthKey } {
  const todayStr = patrolDateStr();
  const [ty, tm] = todayStr.split("-").map(Number);
  const epochDate =
    api.signedIn && api.joinedAt
      ? maxDateStr(DAILY_EPOCH_DATE, new Date(api.joinedAt).toISOString().slice(0, 10))
      : DAILY_EPOCH_DATE;
  const epochD = new Date(`${epochDate}T00:00:00.000Z`);
  return {
    min: { year: epochD.getUTCFullYear(), month: epochD.getUTCMonth() },
    max: { year: ty, month: tm - 1 },
  };
}

/** This device's local history, as a date -> log map (dayInfoFor wants
 * one entry at a time, loadDailyHistory returns the whole list). */
function localDailyMap(): Map<string, DailyDayLog> {
  const map = new Map<string, DailyDayLog>();
  for (const day of loadDailyHistory()) map.set(day.date, day);
  return map;
}

function openPatrolCalendar(): void {
  const { max } = patrolCalendarBounds();
  calendarMonth = calendarMonth ?? max;
  renderPatrolCalendar();
}

function calendarHandlers(): { onBack: () => void; onPrevMonth: () => void; onNextMonth: () => void } {
  return {
    onBack: () => {
      calendarMonth = null;
      showMenu();
    },
    onPrevMonth: () => {
      if (!calendarMonth) return;
      calendarMonth = prevMonthOf(calendarMonth);
      renderPatrolCalendar();
    },
    onNextMonth: () => {
      if (!calendarMonth) return;
      calendarMonth = nextMonthOf(calendarMonth);
      renderPatrolCalendar();
    },
  };
}

/** Build one month's grid from whatever data is available right now (local
 * history is synchronous; server rows already in calendarServerCache are
 * layered in immediately, everything else fills in once the fetch below
 * resolves). `loading` tells the UI a signed-in fetch for this exact month
 * is still in flight, so it doesn't look like a clean "no server data". */
function buildCalendarMonth(key: MonthKey, loading: boolean, serverUnavailable: boolean): PatrolCalendarMonth {
  const bounds = patrolCalendarBounds();
  const today = patrolDateStr();
  const epochDate =
    api.signedIn && api.joinedAt
      ? maxDateStr(DAILY_EPOCH_DATE, new Date(api.joinedAt).toISOString().slice(0, 10))
      : DAILY_EPOCH_DATE;
  const local = localDailyMap();
  const pad = leadingPadding(key.year, key.month);
  const total = daysInMonth(key.year, key.month);

  const cells: CalendarCell[] = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    const dateStr = utcDateStr(key.year, key.month, d);
    const info = dayInfoFor(dateStr, {
      today,
      epochDate,
      signedIn: api.signedIn,
      local: local.get(dateStr) ?? null,
      server: calendarServerCache.get(dateStr) ?? null,
    });
    cells.push({ ...info, dayOfMonth: d });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const beforeMin = key.year < bounds.min.year || (key.year === bounds.min.year && key.month <= bounds.min.month);
  const afterMax = key.year > bounds.max.year || (key.year === bounds.max.year && key.month >= bounds.max.month);

  return {
    label: monthLabel(key.year, key.month),
    weeks,
    canGoPrev: !beforeMin,
    canGoNext: !afterMax,
    signedIn: api.signedIn,
    loading,
    serverUnavailable,
  };
}

/** Paint the calendar for calendarMonth, kicking off (or reusing) a
 * signed-in server fetch for that month if it hasn't been fetched yet. */
function renderPatrolCalendar(): void {
  if (!calendarMonth) return;
  const key = calendarMonth;
  const mKey = monthKeyStr(key);
  const alreadyFetched = calendarFetchedMonths.has(mKey);
  const loading = api.signedIn && api.online && !alreadyFetched;

  ui.showPatrolCalendar(buildCalendarMonth(key, loading, false), calendarHandlers());

  if (!api.signedIn || !api.online || alreadyFetched) return;
  const token = ++calendarFetchToken;
  const from = utcDateStr(key.year, key.month, 1);
  const to = utcDateStr(key.year, key.month, daysInMonth(key.year, key.month));
  void api
    .dailyHistory(from, to)
    .then((r) => {
      calendarFetchedMonths.add(mKey);
      for (const entry of r.entries) calendarServerCache.set(entry.date, entry);
      // a slower fetch for a month the player has since navigated away
      // from would otherwise clobber whatever's on screen now
      if (token !== calendarFetchToken || !calendarMonth || monthKeyStr(calendarMonth) !== mKey) return;
      ui.showPatrolCalendar(buildCalendarMonth(key, false, false), calendarHandlers());
    })
    .catch(() => {
      if (token !== calendarFetchToken || !calendarMonth || monthKeyStr(calendarMonth) !== mKey) return;
      ui.showPatrolCalendar(buildCalendarMonth(key, false, true), calendarHandlers());
    });
}

/**
 * Launch entry point: on touch devices with a motion sensor, first offer the
 * choice between the default touch stick and tilt mode (Tilt to Live tribute).
 * Desktop has no sensor, so it goes straight in.
 */
function beginLaunch(daily: boolean, gameMode: GameMode = "classic", training = false): void {
  if (state === "launching") return;
  // daily-only site: out of attempts → back to the lobby (shows the countdown).
  // Preview runs don't spend attempts, so they never hit this lockout.
  if (DAILY_ONLY && daily && !PREVIEW_ACTIVE && dailyAttemptsLeft() <= 0) {
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
        void enableTilt().then((r) => {
          if (r !== "ok") failTiltToStick(r); // permission denied → fly with the stick
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
  // daily-only retry path (Fly again / Space): the attempt budget still
  // rules, except for a preview run, which never spends one.
  if (DAILY_ONLY && pendingDaily && !PREVIEW_ACTIVE && dailyAttemptsLeft() <= 0) {
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

/** Seed for today's Daily Patrol: same patrol date label → same opening script. */
function dailySeed(): number {
  const dateStr =
    runIsDaily && PREVIEW_ACTIVE && PREVIEW_REHEARSAL_DATE
      ? PREVIEW_REHEARSAL_DATE
      : currentPatrolDateStr();
  return hashString(`orion-daily-${dateStr}`);
}

function startRun(): void {
  audio.unlock();
  // boards are per platform: phone tilt, phone touch stick, or desktop keys
  runMode = input.tiltActive ? "tilt" : isTouchDevice() ? "touch" : "desktop";
  runIsTraining = pendingTraining;
  runIsDaily = pendingDaily && !pendingTraining;
  runGameMode = runIsDaily || runIsTraining ? "classic" : pendingGameMode;
  // an attempt is spent the moment a daily run starts (quitting mid-run
  // counts) — a preview run is sandboxed from the budget entirely
  if (DAILY_ONLY && runIsDaily && !PREVIEW_ACTIVE) useDailyAttempt();
  runRefunded = false;
  // PBs are per game mode — the NEW RECORD beat compares like-for-like
  bestScore = loadBestScore(runGameMode);
  bestTime = loadBestTime(runGameMode);
  // Daily Mutators apply ONLY to Daily Patrol; Classic/Iron Rain/Training
  // Ground never see an override (see mutators.ts). todaysMutators() folds
  // in the ?mutator= preview override, if one's active.
  if (runIsDaily) {
    setActiveMutators(todaysMutators(), currentPatrolDateStr());
  } else {
    clearActiveMutators();
  }
  currentViewScale = runIsDaily ? mutatorViewScale() : 1;
  // Daily Patrol deals everyone the same script (and no beginner grace);
  // normal runs soften the opening for a player's first few flights.
  setRunSeed(runIsDaily ? dailySeed() : null);
  const grace = runIsDaily || runIsTraining ? 0 : clamp01(1 - loadRunCount() / 3);
  world = createWorld(
    renderer.viewW * currentViewScale,
    renderer.viewH * currentViewScale,
    false,
    grace,
    runGameMode,
    runIsDaily,
    runIsTraining,
  );
  world.clipView = { w: canvas.clientWidth, h: canvas.clientHeight };
  recordBeaten = false;
  particles.clear();
  popups.clear();
  accumulator = 0;
  state = "playing";
  ui.hideAll();
  audio.playTrack("game");
  // opt-in local recording (settings toggle + browser support gate both live
  // in recorder.ts); starts fresh every run, previous clip discarded. Training
  // Ground never reaches the game-over screen (no save-clip button to use it),
  // so skip it there rather than burn CPU for nothing.
  lastClipBlob = null;
  lastClipCapped = false;
  lastClipSidecar = null;
  lastClipBasename = null;
  clipPowerLog = [];
  activeRecording =
    settings.recordRuns && api.clipInbox && !runIsTraining ? startRecording(canvas) : null;
  // dev-only console handle for manual playtesting (never in prod builds)
  if (import.meta.env.DEV) (window as unknown as { orionWorld: World }).orionWorld = world;
}

/** Flight school: a sandbox world with scripted static drones, no spawner. */
function startTutorial(): void {
  audio.unlock();
  clearActiveMutators();
  currentViewScale = 1;
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
  // an unfinished run (quit mid-flight, no game-over screen) never offers a
  // clip: stop and discard rather than leaving the recorder running
  if (activeRecording) {
    const rec = activeRecording;
    activeRecording = null;
    void rec.stop();
  }
  clearActiveMutators();
  currentViewScale = 1;
  world = createWorld(renderer.viewW, renderer.viewH);
  particles.clear();
  popups.clear();
  showMenu();
}

/** Freeze clip metadata at death so a later Save clip cannot read a reset world. */
function snapshotClipSidecar(): void {
  const mutators = getActiveMutators().slice();
  const input = {
    score: world.score,
    survivalTime: world.time,
    closestCall: world.closestCall,
    topGrazes: world.topGrazes,
    track: world.shipTrack,
    arena: world.clipArena,
    view: world.clipView,
    mutators,
    daily: runIsDaily,
    gameMode: runGameMode,
    powers: clipPowerLog.slice(),
    now: PREVIEW_ACTIVE ? previewDailyDate() : undefined,
  };
  lastClipSidecar = buildClipSidecar(input);
  lastClipBasename = clipSidecarBasename(input);
}

/** Death: start the crimson veil; the game-over screen fades in mid-veil. */
function onGameOver(): void {
  state = "gameover";
  fx = { kind: "death", t: 0 };
  gameOverUiShown = false;
  audio.setThrustLevel(0);
  audio.playTrack("gameover");
  // stop recording now, not when the game-over UI shows: finalizing the clip
  // (MediaRecorder flush) overlaps the death cinematic instead of adding a
  // delay before the result screen appears. Snapshot sidecar fields first so
  // a later Save clip cannot read a reset world.
  if (activeRecording) {
    snapshotClipSidecar();
    const rec = activeRecording;
    activeRecording = null;
    void rec.stop().then((blob) => {
      lastClipBlob = blob;
      lastClipCapped = rec.hitCap;
    });
  }
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
  const mutatorsToday = cappedDaily ? todaysMutators() : [];
  // a refunded run never happened as far as the daily books are concerned:
  // no best-of-day entry, no share card, no daily board submission. A
  // preview run is the same story for a different reason: it's sandboxed by
  // design, so it never touches the best-of-day record either.
  let dailyMedal: { tier: import("./medals").MedalTier | null; hint: string | null } | undefined;
  if (cappedDaily && !runRefunded) {
    if (!PREVIEW_ACTIVE) {
      // remember the run for the share card (rank arrives with the submit)
      recordDailyResult({
        score: Math.floor(world.score),
        time: world.time,
        maxMultiplier: world.maxMultiplier,
        rank: null,
      });
    }
    // best-of-day medal (score): the real day's running best, or (preview)
    // this run's own score against the forced mutator's thresholds — a
    // preview never touches the locally-recorded best-of-day. Pre-launch-gate
    // days: mutatorsToday is empty (see mutators.ts MUTATORS_START_DATE), so
    // dailyMedal stays undefined and the game-over screen shows no medal UI,
    // exactly like it did before this feature shipped.
    if (mutatorsToday.length > 0) {
      const thresholds = medalThresholdsFor(mutatorsToday);
      const bestScoreToday = PREVIEW_ACTIVE ? Math.floor(world.score) : dailyBestScoreToday();
      const medalTier = medalForScore(bestScoreToday, thresholds);
      dailyMedal = {
        tier: medalTier,
        hint: nextMedalHint(bestScoreToday, thresholds),
      };
    }
    lastRunShare = {
      score: Math.floor(world.score),
      time: world.time,
      maxMultiplier: world.maxMultiplier,
      rank: null,
      attempt: PREVIEW_ACTIVE ? 1 : loadDailyAttempts().used,
      mutatorNames: mutatorsToday.length > 0 ? mutatorsToday.map((m) => m.name) : undefined,
      medal: dailyMedal?.tier,
      preview: PREVIEW_ACTIVE,
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
    // a preview run's retry never draws from the real budget — same
    // "uncapped" retry-button styling Classic/Iron Rain use
    attemptsLeft: cappedDaily && !PREVIEW_ACTIVE ? dailyAttemptsLeft() : undefined,
    showShare: cappedDaily && !runRefunded,
    refunded: runRefunded,
    mutatorNames: mutatorsToday.length > 0 ? mutatorsToday.map((m) => m.name) : undefined,
    dailyMedal,
    preview: cappedDaily && PREVIEW_ACTIVE,
    closestCallLabel: closestCallLabel(world.closestCall),
    clipReady: lastClipBlob !== null,
    clipCapped: lastClipCapped,
    clipInbox: api.clipInbox,
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
  ui.setGameOverRank(
    // deriveGameOverRank sanitizes opts.callsign internally (it's the
    // account's raw callsign, and `me` renders into a screenshot-prone
    // board row), so this call site doesn't need to do it itself.
    deriveGameOverRank(r, {
      isDaily: runIsDaily,
      callsign: api.user?.callsign ?? "You",
      country: api.user?.country ?? "",
      runScore: Math.floor(world.score),
    }),
  );
  const earned = (r.newBadges ?? [])
    .map((id) => badgeInfo(id))
    .filter((b): b is NonNullable<typeof b> => !!b);
  ui.showEarnedBadges(earned);
}

/** Push the finished run to the leaderboards and show the resulting ranks. */
function submitRun(): void {
  // preview runs are sandboxed from every board: no submission, period
  if (runIsDaily && PREVIEW_ACTIVE) return;
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
        if (reusedName) ui.appendGameOverRankNote(`Welcome back, “${name.trim()}”: this run counts for your existing pilot.`);
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
  // keep a mutated day's arena-size override (e.g. THE PIT) through rotates/resizes
  const scale = state === "playing" || state === "paused" ? currentViewScale : 1;
  resizeWorld(world, renderer.viewW * scale, renderer.viewH * scale);
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
        clipPowerLog.push({ id: e.power, name: POWER_NAMES[e.power], time: world.time });
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
        particles.burst(e.x, e.y, [PALETTE.goldPale, PALETTE.white], 5, 2.5, 0.3, 0.06);
        audio.graze();
        if (mutatorGrazePopups()) {
          popups.spawn(e.x, e.y + 0.55, `+${e.points}`, PALETTE.gold, 0.72, 1.15);
        }
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
      case "razorUp":
        popups.spawn(world.ship.x, world.ship.y + 1.2, "RAZOR", PALETTE.razor, 0.5, 1.1);
        audio.starshellUp();
        break;
      case "thunderFire":
        audio.arcZap();
        break;
      case "cloakUp":
        popups.spawn(world.ship.x, world.ship.y + 1.2, "CLOAK", PALETTE.cloak, 0.5, 1.1);
        audio.shieldUp();
        break;
      case "cloakDown":
        audio.shockwave();
        break;
      case "flareDrop":
        particles.burst(e.x, e.y, [PALETTE.flare, PALETTE.gold], 16, 4, 0.5, 0.1);
        audio.pickup();
        break;
      case "ionPulse":
        audio.shockwave();
        break;
      case "howlersUp":
        popups.spawn(world.ship.x, world.ship.y + 1.2, "HOWLERS", PALETTE.howlers, 0.5, 1.1);
        audio.assemblyForm();
        break;
      case "lighthouseSpawn":
        particles.burst(e.x, e.y, [PALETTE.gold, PALETTE.goldPale], 10, 3, 0.4, 0.08);
        break;
      case "lighthouseKill":
        particles.burst(e.x, e.y, [PALETTE.gold, PALETTE.white], 18, 5, 0.55, 0.11);
        audio.mineBoom();
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
  applyCreatorAccess(api.clipInbox);
  if (state === "menu") showMenu();
});

// traffic beacon: who's arriving, from where (admin dashboard only)
api.logVisit(DAILY_ONLY ? "daily" : "fullgame", guessCountry());

requestAnimationFrame(frame);
