import type { BoardMode } from "./api";
import { countryFlag, countryName } from "./countries";
import { POWER_COLORS, POWER_HINTS, POWER_NAMES, SPAWNABLE_POWER_IDS, type GameMode } from "./config";
import type { DayInfo, DayStatus } from "./dailyHistory";
import { isTypingTarget } from "./input";
import { MEDAL_EMOJI, MEDAL_LABEL, type MedalThresholds, type MedalTier } from "./medals";
import type { Mutator } from "./mutators";
import type {
  BooleanSetting,
  ControlMode,
  DailyBestResult,
  KeyAction,
  KeyBindings,
  SenseLevel,
  Settings,
} from "./save";
import {
  DAILY_FREE_DEATH_SECONDS,
  KEY_ACTION_LABELS,
  KEY_ACTIONS,
  formatKeyList,
} from "./save";
import type { ShareOutcome } from "./share";
import { isNicknameBlocked, pickRejectionMessage, sanitizeCallsignForDisplay } from "./nickname";
import { RECORDING_MAX_SECONDS, recordingSupported, recordingUnavailableReason } from "./recorder";

export interface UiCallbacks {
  onPlay: (gameMode: GameMode) => void;
  /** Launch today's Daily Patrol (shared-seed run, daily board — always Classic). */
  onDaily: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuitToMenu: () => void;
  onPauseRequest: () => void;
  onTutorial: () => void;
  /** Daily-only site: launch the free, unscored Training Ground. */
  onTraining: () => void;
  /** Daily-only site: share the result card (native sheet or clipboard). */
  onShare: () => Promise<ShareOutcome>;
  onToggle: (key: BooleanSetting) => void;
  /** Cycle Low/Med/High for a sensitivity setting. */
  onCycleSense: (key: "tiltSensitivity" | "directSpeed") => SenseLevel;
  onWorldArena: () => void;
  onArenas: () => void;
  onFriends: () => void;
  onProfile: () => void;
  /** Daily lobby: open the patrol history calendar (see showPatrolCalendar). */
  onPatrolCalendar: () => void;
  /** Switch control scheme; resolves with the mode actually in effect (tilt may be denied). */
  onControlModeChange: (mode: ControlMode) => Promise<ControlMode>;
  /** Re-capture the current phone attitude as tilt neutral. */
  onRecalibrate: () => void;
  getControls: () => { mode: ControlMode; tiltSupported: boolean };
  getKeyBindings: () => KeyBindings;
  /** Assign a key to an action; returns the updated bindings. */
  onRebind: (action: KeyAction, code: string) => KeyBindings;
  onResetKeyBindings: () => KeyBindings;
  /** Submit player feedback (email optional); rejects with a message on failure. */
  onFeedback: (message: string, email: string) => Promise<void>;
  /** Save the just-finished run's local clip (see recorder.ts); false = nothing to save. */
  onSaveClip: () => boolean;
}

export interface MenuCommunity {
  /** null → community server offline (hide community buttons) */
  callsign: string | null | undefined;
  /** Incoming friend requests — shows a dot on the Wingmates button. */
  pendingFriends?: number;
}

export interface GameOverStats {
  score: number;
  /** Score components (sum to score) for the "where did my points come from" line. */
  scoreKills: number;
  scoreSurvival: number;
  scoreBonuses: number;
  time: number;
  kills: number;
  maxMultiplier: number;
  best: number;
  /** Longest flight (seconds) before this run — 0 if none. */
  bestTime: number;
  isNewBest: boolean;
  isNewBestTime: boolean;
  /** Daily Patrol run (shared-seed board). */
  daily: boolean;
  /** Which board this run files on (Classic / Iron Rain). */
  gameMode: GameMode;
  touchDevice: boolean;
  /** Daily-only site: attempts left after this run (undefined = uncapped). */
  attemptsLeft?: number;
  /** Daily-only site: show the share-result button. */
  showShare?: boolean;
  /** Daily-only site: death inside the free-death window — attempt returned. */
  refunded?: boolean;
  /** Daily-only site: today's mutator name(s), for the "DAILY PATROL" tag. */
  mutatorNames?: string[];
  /** Daily-only site: best-of-day medal (by score) + next-tier hint. */
  dailyMedal?: { tier: MedalTier | null; hint: string | null };
  /** This run used the ?mutator= preview override — not submitted anywhere. */
  preview?: boolean;
  /** "Razor-thin dodge at 1:24" style highlight line, or undefined for no grazes (see highlights.ts). */
  closestCallLabel?: string | null;
  /** Opt-in local recording (see recorder.ts): a clip is ready to save. */
  clipReady?: boolean;
  /** That clip got cut short by RECORDING_MAX_SECONDS instead of stopping at game over. */
  clipCapped?: boolean;
  /** iOS/WebKit and desktop Chrome fallback: object URL for a visible Save JSON <a download>. */
  clipJsonHref?: string;
  clipJsonFilename?: string;
  /** Desktop Chrome: second programmatic download may be blocked; show settings hint. */
  clipJsonChromeHint?: boolean;
}

/**
 * Data for the game-over rank slot (see setGameOverRank): one primary rank
 * (Daily Patrol for daily runs, else World), an optional country rank, and
 * the pilot directly ahead of you (wingmate preferred) for the mini
 * comparison board. Ranks are nullable — a run can finish with no rank yet
 * (e.g. a 0-point death has no best score on the board to rank).
 */
export interface GameOverRankResult {
  primaryLabel: string;
  primaryRank: number | null;
  country: { code: string; rank: number } | null;
  target: { callsign: string; score: number; isWingmate: boolean } | null;
  me: { callsign: string; score: number; country: string };
}

/** Minimal slice of SubmitResult that the rank-slot decision needs (kept
 *  local so this stays DOM-free and unit-testable without importing api.ts). */
export interface GameOverRankInput {
  best: number;
  worldRank: number | null;
  countryRank: number | null;
  dailyRank?: number | null;
  nextAbove?: { callsign: string; score: number } | null;
  nextWingmate?: { callsign: string; score: number } | null;
}

/**
 * Pure decision logic for the game-over rank slot: which single rank to
 * lead with, whether a country rank exists, and who (if anyone) is worth
 * chasing. No DOM — deliberately separated from setGameOverRank's rendering
 * so this (the part that actually had the bugs: a literal "#null" when a
 * 0-point run had no rank yet, and three ranks stacked at once) is
 * unit-testable with plain objects (see scripts/test-gameover-rank.ts).
 */
export function deriveGameOverRank(
  r: GameOverRankInput,
  opts: { isDaily: boolean; callsign: string; country: string; runScore: number },
): GameOverRankResult {
  // Daily Patrol is the relevant board on a daily run (the same board
  // TODAY'S BOARD shows) — World rank otherwise. One primary number, not
  // both stacked, which was the "too much information" complaint.
  const primaryLabel = opts.isDaily ? "Daily Patrol" : "World rank";
  const primaryRank = opts.isDaily ? (r.dailyRank ?? null) : r.worldRank;
  // gap-to-goal: the next pilot to hunt (a wingmate beats a stranger)
  const nextUp = r.nextWingmate ?? r.nextAbove;
  const target =
    nextUp && nextUp.score > r.best
      ? { callsign: nextUp.callsign, score: nextUp.score, isWingmate: !!r.nextWingmate }
      : null;
  return {
    primaryLabel,
    primaryRank,
    country: opts.country && r.countryRank !== null ? { code: opts.country, rank: r.countryRank } : null,
    target,
    // `me.callsign` renders into the exact board-row markup a player
    // screenshots to share their run (see setGameOverRank), and unlike
    // `target` (server-sanitized before it ever reaches this function) it's
    // the account's own raw callsign passed straight from main.ts, so it
    // needs the same display-time masking here (2026-08-17 review finding).
    me: { callsign: sanitizeCallsignForDisplay(opts.callsign), score: opts.runScore, country: opts.country },
  };
}

/** Everything the daily-only lobby needs to paint itself. */
export interface DailyLobbyInfo {
  dayNumber: number;
  attemptsLeft: number;
  maxAttempts: number;
  /** Best run of the day so far (share card after lockout). */
  best: DailyBestResult | null;
  /** Community server reachable → show the inline leaderboard. */
  online: boolean;
  touchDevice: boolean;
  /** Today's mutator(s): 1 normally, 2 on UTC Sundays, empty before the launch gate opens. */
  mutators: Mutator[];
  /** Today's medal score thresholds (already mutator-adjusted). Undefined before the launch gate opens. */
  medalThresholds?: MedalThresholds;
  /** The ?mutator= / ?day= preview override is active: unlimited, unscored runs. */
  preview?: boolean;
  /** Rehearsed UTC date when ?day= is active (shown on the preview badge). */
  previewDate?: string;
}

/** One row of the daily-only lobby's inline leaderboard (all devices merged). */
export interface DailyBoardRow {
  rank: number;
  callsign: string;
  country: string;
  score: number;
  mode: BoardMode;
  /** Highlight this row gold — it's the viewer's own placement. */
  isMe: boolean;
}

/**
 * Data for the daily-only lobby's inline board (see setDailyBoard):
 * `entries` is the full merged board for the day; the UI shows the top 10
 * by default (or search matches). `pinned` is the viewer's own row when
 * their rank falls outside the visible top 10 (null = already visible,
 * no daily score yet, or anonymous).
 */
export interface DailyBoardData {
  entries: DailyBoardRow[];
  pinned: DailyBoardRow | null;
}

const DAILY_BOARD_TOP_N = 10;

function normalizeCallsignSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** A calendar cell, or null for a padding cell outside the visible month. */
export type CalendarCell = (DayInfo & { dayOfMonth: number }) | null;

/** Everything the patrol history calendar needs to paint one month. */
export interface PatrolCalendarMonth {
  label: string;
  /** Sunday-start weeks; each always has exactly 7 cells. */
  weeks: CalendarCell[][];
  canGoPrev: boolean;
  canGoNext: boolean;
  signedIn: boolean;
  /** True while the signed-in server fetch for this month is still in
   * flight (the grid already shows local-only data underneath it). */
  loading: boolean;
  /** True when the server fetch failed (offline, etc.), same visual
   * fallback as loading=false but says so instead of looking like a clean
   * signed-in read. */
  serverUnavailable: boolean;
}

const SENSE_LABEL: Record<SenseLevel, string> = {
  low: "LOW",
  med: "MED",
  high: "HIGH",
};

/** Subtle per-row device tag on the daily lobby board (title carries the full name). */
const DEVICE_TAG: Record<BoardMode, string> = {
  desktop: "Desktop",
  touch: "Phone",
  tilt: "Tilt",
};
const DEVICE_LABEL: Record<BoardMode, string> = {
  desktop: "Desktop",
  touch: "Phone",
  tilt: "Phone tilt",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * The Daily Patrol board resets at UTC midnight — which lands mid-evening in
 * the Americas, so scores "vanish" from today's board. Saying the reset time
 * in the player's local clock makes that legible ("resets at 8:00 PM").
 */
export function dailyResetLabel(): string {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0); // next UTC midnight
  return next.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

/** Compact score, e.g. 150000 -> "150k" (thresholds are always round-5k). */
function fmtScoreShort(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

/** DOM overlay screens (menu / pause / game over) in the gold-and-red style. */
export class Ui {
  private static wordmarkSeq = 0;

  private root: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private dailyBoardFull: DailyBoardRow[] | null = null;
  private dailyBoardPinned: DailyBoardRow | null = null;
  private dailyBoardSearchQuery = "";

  /**
   * Back action for whichever submenu screen is currently showing (Settings,
   * Powers, Feedback, the patrol calendar); null on every top-level screen
   * (Menu, Daily Lobby, Pause, Game Over) that has nothing to back out of.
   * Feeds both the always-visible corner arrow and the Escape key. Cleared
   * on every clear() so top-level screens never inherit a stale submenu's
   * back action.
   */
  private submenuBack: (() => void) | null = null;
  /** The screen element the current submenuBack belongs to, so a screen
   * rendered by ANOTHER class sharing this same #ui root (CommunityUi) can't
   * cause this Escape listener to fire a stale action on top of it. */
  private submenuBackScreen: HTMLElement | null = null;

  constructor(
    private settings: Settings,
    private cb: UiCallbacks,
  ) {
    this.root = document.getElementById("ui")!;
    this.pauseBtn = document.createElement("button");
    this.pauseBtn.id = "pause-btn";
    this.pauseBtn.textContent = "II";
    this.pauseBtn.style.display = "none";
    this.pauseBtn.addEventListener("click", () => this.cb.onPauseRequest());
    document.body.appendChild(this.pauseBtn);

    // Escape backs out of a submenu, one level, same as tapping its corner
    // arrow. Gated on isTypingTarget (a form field wants its own Escape,
    // e.g. clearing itself) and on the submenu's screen still being the one
    // actually on display (guards against staleness if another class wiped
    // #ui in the meantime). Deliberately separate from gameplay pause: the
    // "playing"/"paused" Escape handling lives in Input.onPause and never
    // touches this, so a run's pause/resume is untouched either way.
    window.addEventListener("keydown", (e) => {
      if (e.code !== "Escape") return;
      if (isTypingTarget(e.target)) return;
      if (!this.submenuBack) return;
      if (!this.submenuBackScreen || !this.root.contains(this.submenuBackScreen)) return;
      e.preventDefault();
      const back = this.submenuBack;
      this.submenuBack = null;
      this.submenuBackScreen = null;
      back();
    });
  }

  private clear(): void {
    this.root.innerHTML = "";
    this.submenuBack = null;
    this.submenuBackScreen = null;
    this.dailyBoardFull = null;
    this.dailyBoardPinned = null;
    this.dailyBoardSearchQuery = "";
  }

  /**
   * Register `screen` as a submenu with a back action: wires the always-
   * visible corner arrow (the bottom Back row most screens also have can
   * scroll below the fold on phones) and arms the Escape listener above.
   */
  private makeSubmenu(screen: HTMLElement, onBack: () => void): void {
    const corner = document.createElement("button");
    corner.className = "corner-btn left";
    corner.title = "Back";
    corner.textContent = "←";
    corner.addEventListener("click", onBack);
    screen.appendChild(corner);
    this.submenuBack = onBack;
    this.submenuBackScreen = screen;
  }

  hideAll(): void {
    this.clear();
    this.pauseBtn.style.display = "block";
  }

  /** Remove every screen without bringing the in-game pause button back. */
  clearScreens(): void {
    this.clear();
    this.pauseBtn.style.display = "none";
  }

  /** Fade out whatever screen is showing (used by the launch transition). */
  fadeOutScreens(): void {
    this.pauseBtn.style.display = "none";
    for (const el of Array.from(this.root.children)) {
      el.classList.add("fade-out");
    }
  }

  private toggleRow(keys: Array<[BooleanSetting, string]>): HTMLElement {
    const row = document.createElement("div");
    row.className = "toggles";
    for (const [key, label] of keys) {
      const btn = document.createElement("button");
      const paint = (): void => {
        btn.textContent = `${label}: ${this.settings[key] ? "ON" : "OFF"}`;
        btn.classList.toggle("off", !this.settings[key]);
      };
      paint();
      btn.addEventListener("click", () => {
        this.cb.onToggle(key);
        paint();
      });
      row.appendChild(btn);
    }
    return row;
  }

  /** Cycle button for Low/Med/High sensitivity settings. */
  private senseButton(key: "tiltSensitivity" | "directSpeed", label: string): HTMLButtonElement {
    const btn = document.createElement("button");
    const paint = (): void => {
      btn.textContent = `${label}: ${SENSE_LABEL[this.settings[key]]}`;
    };
    paint();
    btn.addEventListener("click", () => {
      this.cb.onCycleSense(key);
      paint();
    });
    return btn;
  }

  /**
   * Click-to-rebind rows for each flight action. Listening mode captures the
   * next keydown (Esc cancels unless rebinding Pause).
   */
  private buildKeybindEditor(onChanged: () => void): HTMLElement {
    const wrap = this.el("div", "keybinds", "");
    let listening: KeyAction | null = null;
    let stopListen: (() => void) | null = null;

    const cancelListen = (): void => {
      stopListen?.();
      stopListen = null;
      listening = null;
      paint();
    };

    const paint = (): void => {
      const binds = this.cb.getKeyBindings();
      wrap.innerHTML = "";
      for (const action of KEY_ACTIONS) {
        const row = document.createElement("button");
        row.className = "keybind-row";
        const label = KEY_ACTION_LABELS[action];
        const value =
          listening === action ? "Press a key…" : formatKeyList(binds[action]);
        row.innerHTML = `<span class="k">${label}</span><span class="v">${value}</span>`;
        if (listening === action) row.classList.add("listening");
        row.addEventListener("click", () => {
          if (listening === action) {
            cancelListen();
            return;
          }
          cancelListen();
          listening = action;
          paint();
          const onKey = (e: KeyboardEvent): void => {
            e.preventDefault();
            e.stopPropagation();
            // Esc cancels unless the player is rebinding Pause itself
            if (e.code === "Escape" && action !== "pause") {
              cancelListen();
              return;
            }
            // ignore bare modifiers
            if (
              ["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(
                e.code,
              )
            ) {
              return;
            }
            this.cb.onRebind(action, e.code);
            cancelListen();
            onChanged();
          };
          window.addEventListener("keydown", onKey, true);
          stopListen = () => window.removeEventListener("keydown", onKey, true);
        });
        wrap.appendChild(row);
      }
      const reset = this.button("Reset defaults", false, () => {
        cancelListen();
        this.cb.onResetKeyBindings();
        paint();
        onChanged();
      });
      reset.classList.add("small-btn");
      wrap.appendChild(reset);
    };
    paint();
    return wrap;
  }

  /**
   * Transient notice that survives screen changes (lives on <body>, not the
   * screen root). Used for control fallbacks the player must know about.
   */
  toast(message: string, seconds = 7): void {
    document.getElementById("orion-toast")?.remove();
    const el = this.el("div", "toast", "");
    el.id = "orion-toast";
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
      el.classList.add("fade-out");
      setTimeout(() => el.remove(), 600);
    }, seconds * 1000);
  }

  private button(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    if (primary) btn.className = "primary";
    btn.addEventListener("click", onClick);
    return btn;
  }

  private el(tag: string, className: string, html: string): HTMLElement {
    const e = document.createElement(tag);
    e.className = className;
    e.innerHTML = html;
    return e;
  }

  /** Kit wordmark (`brand/assets/logo/orion-wordmark.svg`) for screen titles. */
  private wordmarkTitle(): HTMLElement {
    const gradId = `orion-wordmark-grad-${++Ui.wordmarkSeq}`;
    const wrap = document.createElement("div");
    wrap.className = "title";
    wrap.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 431 100" role="img" aria-label="ORION" class="wordmark-svg">` +
      `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#ffee88"/><stop offset="0.55" stop-color="#ffd700"/><stop offset="1" stop-color="#cc8800"/>` +
      `</linearGradient></defs>` +
      `<g fill="url(#${gradId})" fill-rule="evenodd">` +
      `<path transform="translate(0,0)" d="M22 0 L56 0 L78 22 L78 78 L56 100 L22 100 L0 78 L0 22 Z M30 22 L48 22 L56 30 L56 70 L48 78 L30 78 L22 70 L22 30 Z"/>` +
      `<path transform="translate(104,0)" d="M0 0 L56 0 L78 22 L78 38 L58 60 L78 100 L48 100 L28 60 L22 60 L22 100 L0 100 Z M22 20 L46 20 L56 30 L46 40 L22 40 Z"/>` +
      `<path transform="translate(203,0)" d="M0 0 L22 0 L22 100 L0 100 Z"/>` +
      `<path transform="translate(249,0)" d="M22 0 L56 0 L78 22 L78 78 L56 100 L22 100 L0 78 L0 22 Z M30 22 L48 22 L56 30 L56 70 L48 78 L30 78 L22 70 L22 30 Z"/>` +
      `<path transform="translate(353,0)" d="M0 22 L22 0 L24 0 L56 58 L56 0 L78 0 L78 78 L56 100 L54 100 L22 42 L22 100 L0 100 Z"/>` +
      `</g></svg>`;
    return wrap;
  }

  /** Share-result button with inline outcome feedback (Shared! / Copied!). */
  private shareButton(): HTMLButtonElement {
    const btn = this.button("Share result", false, () => {
      btn.disabled = true;
      void this.cb.onShare().then((outcome) => {
        btn.disabled = false;
        btn.textContent =
          outcome === "copied" ? "Copied!" : outcome === "shared" ? "Shared!" : "Couldn't share";
        setTimeout(() => (btn.textContent = "Share result"), 1600);
      });
    });
    btn.classList.add("share-btn");
    return btn;
  }

  /** Save-clip button for the opt-in local recording feature (see recorder.ts). */
  private saveClipButton(): HTMLButtonElement {
    const btn = this.button("Save clip", false, () => {
      btn.disabled = true;
      const outcome = this.cb.onSaveClip();
      btn.textContent = outcome ? "Saved!" : "Couldn't save clip";
      setTimeout(() => {
        btn.textContent = "Save clip";
        btn.disabled = false;
      }, 1600);
    });
    btn.classList.add("share-btn");
    return btn;
  }

  /**
   * Second-gesture JSON download for iOS/WebKit (and any host that cannot
   * fire two programmatic downloads from one click). Real <a download>, not
   * a button that clicks a hidden link.
   */
  private saveJsonLink(href: string, filename: string): HTMLAnchorElement {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.textContent = "Save JSON";
    a.className = "share-btn";
    return a;
  }

  /**
   * Daily lobby briefing card: today's mutator(s) (name + flavor briefing +
   * a plain-language subline stating what mechanically changed, 2 on UTC
   * Sundays) and today's medal score thresholds, shown before launch.
   */
  private mutatorBriefingCard(
    mutators: Mutator[],
    thresholds: MedalThresholds,
    preview?: boolean,
    previewDate?: string,
  ): HTMLElement {
    const card = this.el("div", "mutator-card", "");
    if (preview) {
      const label = previewDate ? `PREVIEW · ${previewDate}` : "PREVIEW";
      card.appendChild(this.el("div", "preview-badge", label));
    }
    for (const m of mutators) {
      card.appendChild(
        this.el(
          "div",
          "mutator-row",
          `<span class="mutator-name">${escapeHtml(m.name)}</span>` +
            `<span class="mutator-briefing">${escapeHtml(m.briefing)}</span>` +
            `<span class="mutator-subline">${escapeHtml(m.subline)}</span>`,
        ),
      );
    }
    card.appendChild(
      this.el(
        "div",
        "medal-thresholds",
        `<span class="medal-pip copper">🥉 ${fmtScoreShort(thresholds.copper)}</span>` +
          `<span class="medal-pip silver">🥈 ${fmtScoreShort(thresholds.silver)}</span>` +
          `<span class="medal-pip gold">🥇 ${fmtScoreShort(thresholds.gold)}</span>`,
      ),
    );
    return card;
  }

  showMenu(bestScore: number, touchDevice: boolean, community?: MenuCommunity): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen menu", "");
    screen.appendChild(this.wordmarkTitle());
    screen.appendChild(this.el("div", "subtitle", "Survive the swarm"));
    screen.appendChild(this.el("div", "divider", ""));

    if (bestScore > 0) {
      screen.appendChild(
        this.el(
          "div",
          "stats",
          `<div><span class="label">Best score</span><span class="value">${Math.floor(bestScore).toLocaleString()}</span></div>`,
        ),
      );
    }

    const launch = this.button("Launch: Classic", true, () => this.cb.onPlay("classic"));
    launch.classList.add("launch");
    screen.appendChild(launch);

    // Iron Rain: flat max-difficulty endurance for pilots past the warm-up
    const ironRain = this.el("button", "menu-mode-btn ironrain", "");
    ironRain.innerHTML =
      `<span class="daily-name">⚙ Iron Rain</span>` +
      `<span class="daily-sub">max difficulty from second zero. Skip the warm-up, its own board</span>`;
    ironRain.addEventListener("click", () => this.cb.onPlay("ironrain"));
    screen.appendChild(ironRain);

    // Daily Patrol: everyone flies the same swarm today, one shared board
    if (community && community.callsign !== null) {
      const daily = document.createElement("button");
      daily.className = "daily-btn";
      daily.innerHTML =
        `<span class="daily-name">☀ Daily Patrol</span>` +
        `<span class="daily-sub">everyone flies the same swarm. Its own board, resets at ${dailyResetLabel()}</span>` +
        `<span class="daily-hint" id="daily-hint"></span>`;
      daily.addEventListener("click", () => this.cb.onDaily());
      screen.appendChild(daily);
    }

    const learnRow = this.el("div", "menu-row", "");
    const howTo = this.button("How to play", false, () => this.cb.onTutorial());
    howTo.classList.add("small-btn");
    const powers = this.button("Powers", false, () =>
      this.showPowers(() => this.showMenu(bestScore, touchDevice, community)),
    );
    powers.classList.add("small-btn");
    learnRow.append(howTo, powers);
    screen.appendChild(learnRow);

    // community row (only when the server is reachable)
    if (community && community.callsign !== null) {
      const row = this.el("div", "menu-row", "");
      row.appendChild(this.button("Leaderboard", false, () => this.cb.onWorldArena()));
      row.appendChild(this.button("Arenas", false, () => this.cb.onArenas()));
      const friends = this.button("Wingmates", false, () => this.cb.onFriends());
      if ((community.pendingFriends ?? 0) > 0) {
        friends.appendChild(this.el("span", "notif-dot", ""));
      }
      row.appendChild(friends);
      screen.appendChild(row);

      const badge = document.createElement("button");
      badge.className = "pilot-badge";
      badge.innerHTML = community.callsign
        ? `<span class="wing">✦</span> <b>${community.callsign.replace(/[&<>]/g, "")}</b> <span class="sub">pilot profile</span>`
        : `<span class="wing">✦</span> Pilot login <span class="sub">join the leaderboards</span>`;
      badge.addEventListener("click", () => this.cb.onProfile());
      screen.appendChild(badge);
    }

    // settings gear (toggles + controls live behind it)
    const gear = document.createElement("button");
    gear.className = "corner-btn";
    gear.title = "Settings";
    gear.innerHTML = "&#9881;";
    gear.addEventListener("click", () =>
      this.showSettings(touchDevice, () => this.showMenu(bestScore, touchDevice, community)),
    );
    screen.appendChild(gear);

    this.root.appendChild(screen);
  }

  /**
   * Daily-only site lobby, kept deliberately spare: Launch, Training Ground,
   * How to play, Powers, Leaderboard. No accounts here — players who want on
   * the board enter a pseudo on the game-over screen (guest signup).
   */
  showDailyLobby(info: DailyLobbyInfo): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen menu", "");
    screen.appendChild(this.wordmarkTitle());
    screen.appendChild(this.el("div", "subtitle", "Daily Patrol"));
    screen.appendChild(this.el("div", "divider", ""));

    screen.appendChild(this.el("div", "daily-day", `PATROL <b>#${info.dayNumber}</b>`));
    const calendarLink = this.el("button", "link-btn calendar-link", "See previous patrols");
    calendarLink.addEventListener("click", () => this.cb.onPatrolCalendar());
    screen.appendChild(calendarLink);
    // pre-launch-gate days carry no mutators and no thresholds (see
    // mutators.ts MUTATORS_START_DATE): skip the card entirely so the lobby
    // looks exactly like it did before this feature shipped.
    if (info.mutators.length > 0 && info.medalThresholds) {
      screen.appendChild(
        this.mutatorBriefingCard(info.mutators, info.medalThresholds, info.preview, info.previewDate),
      );
    }

    // attempt pips: one per daily try, spent ones dimmed. A preview run
    // never spends one, so its row says so instead of counting down.
    if (info.preview) {
      screen.appendChild(
        this.el("div", "attempt-pips", `<span class="pips-label">unlimited attempts, not scored</span>`),
      );
    } else {
      const pipsRow = this.el("div", "attempt-pips", "");
      for (let i = 0; i < info.maxAttempts; i++) {
        pipsRow.appendChild(this.el("span", `pip${i < info.attemptsLeft ? "" : " spent"}`, "◆"));
      }
      pipsRow.appendChild(
        this.el(
          "span",
          "pips-label",
          info.attemptsLeft > 0 ? `${info.attemptsLeft} left today` : "done for today",
        ),
      );
      screen.appendChild(pipsRow);
    }

    // today's leader, filled in async via setMenuDailyHint
    const hint = this.el("div", "daily-hint lobby-hint", "");
    hint.id = "daily-hint";
    screen.appendChild(hint);

    // preview ignores the real attempt budget entirely: Launch always shows
    if (info.preview || info.attemptsLeft > 0) {
      const launch = this.button("Launch", true, () => this.cb.onDaily());
      launch.classList.add("launch");
      screen.appendChild(launch);
      if (!info.preview && info.attemptsLeft === 1) {
        screen.appendChild(
          this.el("div", "field-hint center last-attempt-hint", "Last patrol today. Make it count."),
        );
      }
    } else {
      screen.appendChild(
        this.el("div", "daily-locked", `Patrol <b>#${info.dayNumber}</b> complete.`),
      );
      screen.appendChild(
        this.el("div", "daily-locked-sub", `Next patrol at ${dailyResetLabel()}`),
      );
      if (info.best) {
        screen.appendChild(
          this.el(
            "div",
            "daily-best-line",
            `Best today: <b>${fmtTime(info.best.time)}</b> · ` +
              `<b>${Math.floor(info.best.score).toLocaleString()}</b> pts` +
              (info.best.rank !== null ? ` · #${info.best.rank}` : ""),
          ),
        );
        screen.appendChild(this.shareButton());
      }
    }

    // Inline leaderboard: one merged ranking (all devices) for today's
    // Daily Patrol, scrollable, filled in async via setDailyBoard once it
    // loads. Placed before utility buttons so it's reachable without deep
    // scrolling on mobile.
    if (info.online) {
      const boardWrap = this.el("div", "daily-board-wrap", "");
      boardWrap.id = "daily-lobby-board-wrap";
      boardWrap.appendChild(this.el("div", "manual-title", "TODAY'S BOARD"));
      const search = document.createElement("input");
      search.type = "search";
      search.className = "field daily-board-search";
      search.placeholder = "Search callsign…";
      search.id = "daily-board-search";
      search.autocomplete = "off";
      search.spellcheck = false;
      search.addEventListener("input", () => {
        this.dailyBoardSearchQuery = search.value;
        this.renderDailyBoardRows();
      });
      boardWrap.appendChild(search);
      const list = this.el("div", "board", `<div class="field-hint center">Loading…</div>`);
      list.id = "daily-lobby-board";
      boardWrap.appendChild(list);
      screen.appendChild(boardWrap);
    }

    const training = this.el("button", "menu-mode-btn training", "");
    training.innerHTML =
      `<span class="daily-name">✦ Training Ground</span>` +
      `<span class="daily-sub">free practice, unlimited</span>`;
    training.addEventListener("click", () => this.cb.onTraining());
    screen.appendChild(training);

    const learnRow = this.el("div", "menu-row", "");
    const howTo = this.button("How to play", false, () => this.cb.onTutorial());
    howTo.classList.add("small-btn");
    learnRow.appendChild(howTo);
    const powers = this.button("Powers", false, () => this.showPowers(() => this.showDailyLobby(info)));
    powers.classList.add("small-btn");
    learnRow.appendChild(powers);
    screen.appendChild(learnRow);

    // footer: the feedback channel. (The /fullgame door still exists by URL,
    // but is unlisted while the daily is the public face.)
    const feedback = this.el("button", "full-game-link", "Feedback");
    feedback.addEventListener("click", () =>
      this.showFeedback(() => this.showDailyLobby(info)),
    );
    screen.appendChild(feedback);

    const gear = document.createElement("button");
    gear.className = "corner-btn";
    gear.title = "Settings";
    gear.innerHTML = "&#9881;";
    gear.addEventListener("click", () =>
      this.showSettings(info.touchDevice, () => this.showDailyLobby(info)),
    );
    screen.appendChild(gear);

    this.root.appendChild(screen);
  }

  /** Short, glanceable label for a calendar day cell's status ring. */
  private static readonly DAY_STATUS_LABEL: Record<DayStatus, string> = {
    future: "",
    "before-launch": "",
    today: "TODAY",
    completed: "FLOWN",
    "completed-local-only": "FLOWN",
    attempted: "STARTED",
    missed: "MISSED",
    untracked: "",
  };

  /** One calendar grid cell: day number, status ring, medal/mutator hints.
   * Tapping fills `detail` with the full breakdown (mobile has no hover). */
  private calendarDayCell(day: DayInfo & { dayOfMonth: number }, detail: HTMLElement): HTMLElement {
    const cell = document.createElement("button");
    cell.className = `calendar-day ${day.status}`;
    cell.type = "button";
    const statusLabel = Ui.DAY_STATUS_LABEL[day.status];
    if (statusLabel) cell.title = statusLabel;

    const num = this.el("span", "cal-daynum", String(day.dayOfMonth));
    cell.appendChild(num);

    if (day.status === "completed" || day.status === "completed-local-only") {
      cell.appendChild(this.el("span", "cal-medal", day.medal ? MEDAL_EMOJI[day.medal] : "✓"));
    } else if (day.status === "attempted") {
      cell.appendChild(this.el("span", "cal-mark", "•"));
    } else if (day.status === "missed") {
      cell.appendChild(this.el("span", "cal-mark", "×"));
    }
    if (day.mutators.length > 0) {
      const dots = this.el("span", "cal-mutator-dots", "");
      for (let i = 0; i < day.mutators.length; i++) dots.appendChild(this.el("span", "cal-mutator-dot", ""));
      cell.appendChild(dots);
    }

    const interactive = day.status !== "future";
    if (interactive) {
      cell.addEventListener("click", () => {
        cell.parentElement
          ?.querySelectorAll(".calendar-day.selected")
          .forEach((el) => el.classList.remove("selected"));
        cell.classList.add("selected");
        detail.innerHTML = this.dayDetailHtml(day);
      });
    } else {
      cell.disabled = true;
    }
    return cell;
  }

  /** Full breakdown for a tapped calendar day: mutator briefing (the FOMO
   * payoff for a missed day) plus whatever result data is available. */
  private dayDetailHtml(day: DayInfo & { dayOfMonth: number }): string {
    const dateLabel = new Date(`${day.date}T00:00:00.000Z`).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const parts: string[] = [`<div class="cal-detail-date">${dateLabel}</div>`];

    for (const m of day.mutators) {
      parts.push(
        `<div class="cal-detail-mutator">` +
          `<span class="mutator-name">${escapeHtml(m.name)}</span>` +
          `<span class="mutator-subline">${escapeHtml(m.subline)}</span>` +
          `</div>`,
      );
    }

    switch (day.status) {
      case "today":
        parts.push(`<div class="field-hint center">Today's patrol, still flying.</div>`);
        break;
      case "before-launch":
        parts.push(`<div class="field-hint center">Before Daily Patrol existed.</div>`);
        break;
      case "completed":
      case "completed-local-only": {
        const medalLine = day.medal
          ? `${MEDAL_EMOJI[day.medal]} ${MEDAL_LABEL[day.medal]} MEDAL`
          : "No medal that day";
        parts.push(
          `<div class="cal-detail-result">` +
            `<span class="value">${Math.floor(day.score ?? 0).toLocaleString()}</span> pts` +
            (day.time !== undefined ? ` &nbsp;·&nbsp; ${fmtTime(day.time)}` : "") +
            (day.rank !== undefined && day.rank !== null ? ` &nbsp;·&nbsp; #${day.rank}` : "") +
            `</div>`,
          `<div class="cal-detail-medal">${medalLine}</div>`,
        );
        if (day.status === "completed-local-only") {
          parts.push(
            `<div class="field-hint center">` +
              (day.sourceConflict
                ? "Recorded on this device only, it never reached your account (flown before signing in, or a sync that failed)."
                : "Recorded on this device only. Sign in to keep this on your account.") +
              `</div>`,
          );
        }
        break;
      }
      case "attempted":
        parts.push(
          `<div class="field-hint center">Started but never finished (this device only, no run submitted).</div>`,
        );
        break;
      case "missed":
        parts.push(`<div class="field-hint center">No patrol flown.</div>`);
        break;
      case "untracked":
        parts.push(
          `<div class="field-hint center">No record for this device, and you're not signed in to check your account.</div>`,
        );
        break;
      case "future":
        break;
    }
    return parts.join("");
  }

  /**
   * Patrol history calendar: a month at a time, Sunday-start grid, tap a
   * day for its mutator(s) and result. Reached from the daily lobby's
   * discreet "See previous patrols" link.
   */
  showPatrolCalendar(
    month: PatrolCalendarMonth,
    handlers: { onBack: () => void; onPrevMonth: () => void; onNextMonth: () => void },
  ): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen calendar-screen", "");
    this.makeSubmenu(screen, handlers.onBack);
    screen.appendChild(this.el("div", "heading gold small", "PATROL HISTORY"));
    screen.appendChild(this.el("div", "divider", ""));

    const nav = this.el("div", "calendar-nav", "");
    const prev = this.button("‹", false, handlers.onPrevMonth);
    prev.disabled = !month.canGoPrev;
    prev.classList.add("calendar-nav-btn");
    const next = this.button("›", false, handlers.onNextMonth);
    next.disabled = !month.canGoNext;
    next.classList.add("calendar-nav-btn");
    nav.append(prev, this.el("span", "calendar-month-label", month.label), next);
    screen.appendChild(nav);

    const grid = this.el("div", "calendar-grid", "");
    for (const wd of ["Su", "M", "T", "W", "Th", "F", "Sa"]) {
      grid.appendChild(this.el("div", "calendar-weekday", wd));
    }
    const detail = this.el("div", "calendar-detail", "");
    for (const week of month.weeks) {
      for (const day of week) {
        grid.appendChild(day ? this.calendarDayCell(day, detail) : this.el("div", "calendar-day empty", ""));
      }
    }
    screen.appendChild(grid);

    if (month.loading) {
      screen.appendChild(this.el("div", "field-hint center", "Syncing your account's record…"));
    } else if (month.serverUnavailable) {
      screen.appendChild(
        this.el("div", "field-hint center", "Couldn't reach the server, showing this device's local history."),
      );
    } else if (!month.signedIn) {
      screen.appendChild(
        this.el(
          "div",
          "field-hint center",
          "Signed out: showing this device's local history only. Sign in to sync your full record.",
        ),
      );
    }
    screen.appendChild(detail);

    const back = this.button("Back", false, handlers.onBack);
    back.classList.add("small-btn");
    screen.appendChild(back);

    this.root.appendChild(screen);
  }

  /**
   * Training Ground send-off (daily-only site): the run is unscored, so no
   * stats ceremony — just a nudge toward the real patrol.
   */
  showTrainingEnd(attemptsLeft: number): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen gameover-screen", "");
    screen.appendChild(this.el("div", "heading gold small", "TRAINING OVER"));
    screen.appendChild(this.el("div", "divider", ""));
    screen.appendChild(
      this.el(
        "div",
        "hint",
        attemptsLeft > 0
          ? "Ready for the real thing?"
          : `Next patrol at ${dailyResetLabel()}`,
      ),
    );
    if (attemptsLeft > 0) {
      const daily = this.button("Fly the Daily Patrol", true, () => this.cb.onDaily());
      daily.classList.add("launch");
      screen.appendChild(daily);
    }
    screen.appendChild(this.button("Train again", attemptsLeft <= 0, () => this.cb.onRestart()));
    screen.appendChild(this.button("Back to base", false, () => this.cb.onQuitToMenu()));
    this.root.appendChild(screen);
  }

  /** Powers codex: what every pickup does, so nothing in a run is a mystery. */
  showPowers(onBack: () => void): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen", "");
    this.makeSubmenu(screen, onBack);
    screen.appendChild(this.el("div", "heading gold small", "POWERS"));
    screen.appendChild(this.el("div", "divider", ""));
    screen.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Pickups fire the instant you grab them, no button. Every power can appear from minute zero.",
      ),
    );

    const list = this.el("div", "powers-list", "");
    for (const id of SPAWNABLE_POWER_IDS) {
      list.appendChild(
        this.el(
          "div",
          "power-row",
          `<span class="power-dot" style="background:${POWER_COLORS[id]};box-shadow:0 0 8px ${POWER_COLORS[id]}"></span>` +
            `<span class="power-name">${POWER_NAMES[id]}</span>` +
            `<span class="power-desc">${POWER_HINTS[id]}</span>`,
        ),
      );
    }
    screen.appendChild(list);

    screen.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Skill kills pay extra: pulse shots score 2x, shattering frozen drones scores 1.5x and builds your multiplier twice as fast.",
      ),
    );

    // suggest-a-power mini form: ideas land in the regular feedback log
    const suggest = this.el("div", "power-suggest", "");
    suggest.appendChild(
      this.el("div", "field-hint center", "Got an idea for a new power? Beam it in."),
    );
    const idea = document.createElement("textarea");
    idea.className = "field";
    idea.placeholder = "Name it, describe what it does…";
    idea.maxLength = 500;
    idea.rows = 2;
    suggest.appendChild(idea);
    const error = this.el("div", "form-error", "");
    suggest.appendChild(error);
    const send = this.button("Suggest power", false, () => {
      const text = idea.value.trim();
      if (text.length < 3) {
        error.textContent = "Tell us a little more first.";
        return;
      }
      send.disabled = true;
      send.textContent = "Transmitting…";
      error.textContent = "";
      this.cb
        .onFeedback(`[Power idea] ${text}`, "")
        .then(() => {
          suggest.innerHTML = "";
          suggest.appendChild(
            this.el(
              "div",
              "field-hint center",
              "Received, pilot. Best ideas make it into the arena.",
            ),
          );
        })
        .catch((e: unknown) => {
          send.disabled = false;
          send.textContent = "Suggest power";
          error.textContent =
            e instanceof Error ? e.message : "Transmission failed. Try again.";
        });
    });
    send.classList.add("small-btn");
    suggest.appendChild(send);
    screen.appendChild(suggest);

    const back = this.button("Back", false, onBack);
    back.classList.add("small-btn");
    screen.appendChild(back);
    this.root.appendChild(screen);
  }

  /** Settings screen: audio/shake toggles + flight manual. */
  showSettings(touchDevice: boolean, onBack: () => void): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen", "");
    this.makeSubmenu(screen, onBack);
    screen.appendChild(this.el("div", "heading gold small", "SETTINGS"));
    screen.appendChild(this.el("div", "divider", ""));

    screen.appendChild(this.toggleRow([
      ["sound", "Sound"],
      ["music", "Music"],
      ["screenShake", "Shake"],
      ["inertia", "Inertia"],
    ]));

    // sensitivity knobs
    const senseRow = this.el("div", "toggles", "");
    senseRow.appendChild(this.senseButton("directSpeed", "Direct speed"));
    if (touchDevice && this.cb.getControls().tiltSupported) {
      senseRow.appendChild(this.senseButton("tiltSensitivity", "Tilt sense"));
    }
    screen.appendChild(senseRow);

    screen.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Direct control is the default: the ship goes where you point. " +
          "Inertia ON adds thrust-and-drift piloting for flavor. Leaderboards don't care either way.",
      ),
    );

    // opt-in local recording. When it can't work here, show a disabled row
    // that says why instead of a toggle that silently produces no clip, or
    // silently vanishing (a dead control is worse than no control, but a
    // hidden one still leaves a player wondering where it went).
    if (recordingSupported()) {
      screen.appendChild(this.toggleRow([["recordRuns", "Record runs"]]));
      screen.appendChild(
        this.el(
          "div",
          "field-hint center",
          "Saves a local clip of each run for you to download. Stays on this device: " +
            "nothing is uploaded, nothing is stored on our end. A quick toggle also " +
            "shows up on the game-over screen after a run.",
        ),
      );
    } else {
      const row = this.el("div", "toggles", "");
      const dead = document.createElement("button");
      dead.textContent = "Record runs: unavailable";
      dead.disabled = true;
      dead.classList.add("off");
      row.appendChild(dead);
      screen.appendChild(row);
      screen.appendChild(this.el("div", "field-hint center", recordingUnavailableReason()));
    }

    const manualTitle = this.el("div", "manual-title", "FLIGHT MANUAL");
    const manual = this.el("div", "manual", "");
    const paintManual = (): void => {
      const controls = this.cb.getControls();
      const binds = this.cb.getKeyBindings();
      const rows = touchDevice
        ? controls.mode === "tilt"
          ? [
              ["Fly", "tilt your phone, the ship follows the lean"],
              ["Pause", "the II button, top right"],
            ]
          : this.settings.inertia
            ? [
                ["Fly", "drag anywhere, the ship flies where you point"],
                ["Pause", "the II button, top right"],
              ]
            : [
                ["Fly", "drag anywhere, ship goes that way"],
                ["Pause", "the II button, top right"],
              ]
        : this.settings.inertia
          ? [
              ["Thrust", formatKeyList(binds.up)],
              ["Turn", `${formatKeyList(binds.left)} ${formatKeyList(binds.right)}`],
              ["Pause", formatKeyList(binds.pause)],
            ]
          : [
              [
                "Fly",
                `${formatKeyList(binds.up)} ${formatKeyList(binds.left)} ${formatKeyList(binds.down)} ${formatKeyList(binds.right)}`,
              ],
              ["Pause", formatKeyList(binds.pause)],
            ];
      manual.innerHTML = rows
        .map(([k, v]) => `<div><span class="k">${k}</span><span class="v">${v}</span></div>`)
        .join("");
    };
    paintManual();

    // re-paint the flight manual when Inertia is flipped
    const inertiaBtn = [...screen.querySelectorAll(".toggles button")].find((b) =>
      (b as HTMLButtonElement).textContent?.startsWith("Inertia"),
    );
    inertiaBtn?.addEventListener("click", () => paintManual());

    // control scheme picker (touch devices with a motion sensor only)
    if (touchDevice && this.cb.getControls().tiltSupported) {
      screen.appendChild(
        this.el(
          "div",
          "field-hint center",
          "Tilt steering: lean the phone to fly. A tribute to Tilt to Live.",
        ),
      );
      const row = this.el("div", "toggles", "");
      const tiltBtn = document.createElement("button");
      const stickBtn = document.createElement("button");
      const recal = this.button("Recalibrate tilt", false, () => {
        this.cb.onRecalibrate();
        recal.textContent = "Recalibrated ✓";
        setTimeout(() => (recal.textContent = "Recalibrate tilt"), 1200);
      });
      recal.classList.add("small-btn");
      const paint = (): void => {
        const mode = this.cb.getControls().mode;
        tiltBtn.textContent = `Tilt: ${mode === "tilt" ? "ON" : "OFF"}`;
        tiltBtn.classList.toggle("off", mode !== "tilt");
        stickBtn.textContent = `Stick: ${mode === "stick" ? "ON" : "OFF"}`;
        stickBtn.classList.toggle("off", mode !== "stick");
        recal.style.display = mode === "tilt" ? "" : "none";
        paintManual();
      };
      tiltBtn.addEventListener("click", () => void this.cb.onControlModeChange("tilt").then(paint));
      stickBtn.addEventListener("click", () => void this.cb.onControlModeChange("stick").then(paint));
      paint();
      row.append(tiltBtn, stickBtn);
      screen.appendChild(row);
      screen.appendChild(recal);
    }

    screen.appendChild(manualTitle);
    screen.appendChild(manual);

    // key bindings editor (desktop / keyboard players)
    if (!touchDevice) {
      screen.appendChild(this.el("div", "manual-title", "KEY BINDINGS"));
      screen.appendChild(this.buildKeybindEditor(paintManual));
      screen.appendChild(
        this.el("div", "field-hint center", "Click a binding, then press a key. Esc cancels."),
      );
    }

    screen.appendChild(
      this.el(
        "div",
        "hint",
        "Powers auto-activate on pickup. Touching a drone is fatal, unless shielded.<br/>Chain kills to build your multiplier and climb the leaderboard.",
      ),
    );

    const feedback = this.button("Send feedback", false, () =>
      this.showFeedback(() => this.showSettings(touchDevice, onBack)),
    );
    feedback.classList.add("small-btn");
    screen.appendChild(feedback);

    const back = this.button("Back", false, onBack);
    back.classList.add("small-btn");
    screen.appendChild(back);
    this.root.appendChild(screen);
  }

  /**
   * Feedback form: message + optional email for follow-ups and rewards.
   * Pass null for onBack to open it as an overlay ON TOP of the current
   * screen (used from game over, so the results/save-score UI underneath
   * survives) — Back then just closes the form.
   */
  private showFeedback(onBackOrNull: (() => void) | null): void {
    const overlay = onBackOrNull === null;
    // An overlay sits on top of whatever submenu state was already active
    // (currently only ever Game Over, which has none). Save it so closing
    // the overlay restores it instead of leaving Escape pointed at a
    // closure that already ran.
    const prevBack = this.submenuBack;
    const prevScreen = this.submenuBackScreen;
    if (!overlay) {
      this.clear();
      this.pauseBtn.style.display = "none";
    }

    const screen = this.el("div", "screen", "");
    const onBack =
      onBackOrNull ??
      ((): void => {
        screen.remove();
        this.submenuBack = prevBack;
        this.submenuBackScreen = prevScreen;
      });
    this.makeSubmenu(screen, onBack);
    screen.appendChild(this.el("div", "heading gold small", "PILOT DEBRIEF"));
    screen.appendChild(this.el("div", "divider", ""));
    screen.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Bugs, ideas, balance gripes: every report makes the arena better.",
      ),
    );

    const message = document.createElement("textarea");
    message.className = "field feedback-message";
    message.placeholder = "What's on your mind, pilot?";
    message.maxLength = 2000;
    message.rows = 5;
    screen.appendChild(message);

    const email = document.createElement("input");
    email.className = "field";
    email.type = "email";
    email.placeholder = "Email (optional)";
    email.maxLength = 254;
    email.autocomplete = "email";
    screen.appendChild(email);
    screen.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Leave an email if you'd like a reply, or rewards for the best reports.",
      ),
    );

    const error = this.el("div", "form-error", "");
    screen.appendChild(error);

    const send = this.button("Transmit", true, () => {
      const text = message.value.trim();
      if (text.length < 3) {
        error.textContent = "Tell us a little more first.";
        return;
      }
      send.disabled = true;
      send.textContent = "Transmitting…";
      error.textContent = "";
      this.cb
        .onFeedback(text, email.value.trim())
        .then(() => {
          screen.innerHTML = ""; // wipes the corner arrow too, so re-arm it
          this.makeSubmenu(screen, onBack);
          screen.appendChild(this.el("div", "heading gold small", "TRANSMISSION RECEIVED"));
          screen.appendChild(this.el("div", "divider", ""));
          screen.appendChild(
            this.el(
              "div",
              "field-hint center",
              "Thank you, pilot. Your report is in the log." +
                (email.value.trim() ? "<br/>We'll reach out if it earns a reward." : ""),
            ),
          );
          const back = this.button("Back", false, onBack);
          back.classList.add("small-btn");
          screen.appendChild(back);
        })
        .catch((e: unknown) => {
          send.disabled = false;
          send.textContent = "Transmit";
          error.textContent = e instanceof Error ? e.message : "Transmission failed. Try again.";
        });
    });
    screen.appendChild(send);

    const back = this.button("Back", false, onBack);
    back.classList.add("small-btn");
    screen.appendChild(back);
    this.root.appendChild(screen);
  }

  showPause(): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen", "");
    screen.appendChild(this.el("div", "heading gold", "PAUSED"));
    screen.appendChild(this.el("div", "divider", ""));
    screen.appendChild(this.button("Resume", true, () => this.cb.onResume()));
    screen.appendChild(this.button("Restart", false, () => this.cb.onRestart()));
    screen.appendChild(this.button("Main menu", false, () => this.cb.onQuitToMenu()));
    screen.appendChild(this.toggleRow([
      ["sound", "Sound"],
      ["music", "Music"],
      ["screenShake", "Shake"],
      ["inertia", "Inertia"],
    ]));
    const senseRow = this.el("div", "toggles", "");
    senseRow.appendChild(this.senseButton("directSpeed", "Direct speed"));
    if (this.cb.getControls().mode === "tilt" || this.cb.getControls().tiltSupported) {
      senseRow.appendChild(this.senseButton("tiltSensitivity", "Tilt sense"));
    }
    screen.appendChild(senseRow);
    if (this.cb.getControls().mode === "tilt") {
      const recal = this.button("Recalibrate tilt", false, () => {
        this.cb.onRecalibrate();
        recal.textContent = "Recalibrated ✓";
        setTimeout(() => (recal.textContent = "Recalibrate tilt"), 1200);
      });
      recal.classList.add("small-btn");
      screen.appendChild(recal);
    }
    this.root.appendChild(screen);
  }

  /**
   * Boot gate: browsers block audio until a gesture, so the very first thing
   * players see is a tap-to-enter splash — the tap unlocks the epic intro.
   */
  showIntroGate(onEnter: () => void): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const gate = this.el("div", "intro-gate", "");
    gate.appendChild(this.wordmarkTitle());
    gate.appendChild(this.el("div", "enter", "Tap to enter"));
    gate.appendChild(
      this.el("div", "gate-tagline", "Dodge the swarm · 3 attempts daily · same run for every pilot"),
    );
    gate.addEventListener("pointerdown", () => {
      this.clear();
      onEnter();
    });
    this.root.appendChild(gate);
  }

  /**
   * Pre-launch control picker (touch devices with a motion sensor): the
   * default drag-anywhere stick, or tilt as the Tilt to Live tribute.
   */
  showModeSelect(current: ControlMode, onPick: (mode: ControlMode) => void): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen", "");
    screen.appendChild(this.el("div", "heading gold small", "CHOOSE YOUR CONTROLS"));
    screen.appendChild(this.el("div", "divider", ""));

    const stick = this.button("Touch: drag anywhere to fly", current !== "tilt", () =>
      onPick("stick"),
    );
    const tilt = this.button("Tilt: lean your phone to fly", current === "tilt", () =>
      onPick("tilt"),
    );
    screen.appendChild(stick);
    screen.appendChild(tilt);
    screen.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Tilt is our tribute to Tilt to Live. Hold your phone at your comfortable" +
          " play angle before tapping, that becomes neutral.",
      ),
    );
    this.root.appendChild(screen);
  }

  /** Tutorial overlay: an instruction banner up top and a skip button. */
  showTutorialHud(onSkip: () => void): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const hint = this.el("div", "tutorial-hint", "");
    hint.id = "tutorial-hint";
    this.root.appendChild(hint);

    const skip = this.button("Skip tutorial", false, onSkip);
    skip.className = "tutorial-skip";
    this.root.appendChild(skip);
  }

  setTutorialHint(html: string): void {
    const hint = document.getElementById("tutorial-hint");
    if (!hint) return;
    hint.innerHTML = html;
    // retrigger the pop-in animation on every new instruction
    hint.classList.remove("pop");
    void hint.offsetWidth;
    hint.classList.add("pop");
  }

  /**
   * Blocking tutorial message: the world pauses behind it, and a tap/click
   * anywhere dismisses it (leaving the same text as the top reminder banner).
   */
  showTutorialMessage(html: string, onDismiss: () => void): void {
    document.querySelector(".tutorial-catcher")?.remove();
    // hide the reminder banner while the modal is up — otherwise the same
    // text shows twice; it reappears (via setTutorialHint) on dismiss
    const hint = document.getElementById("tutorial-hint");
    if (hint) hint.style.display = "none";

    const catcher = this.el("div", "tutorial-catcher", "");
    const card = this.el("div", "tutorial-modal", html);
    card.appendChild(this.el("div", "tap-continue", "tap anywhere to continue"));
    catcher.appendChild(card);
    catcher.addEventListener("pointerdown", () => {
      catcher.remove();
      if (hint) hint.style.display = "";
      this.setTutorialHint(html);
      onDismiss();
    });
    this.root.appendChild(catcher);
  }

  /** Post-tutorial send-off: straight into a run, or back to the menu. */
  showTutorialEnd(onLaunch: () => void, onMenu: () => void): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen", "");
    screen.appendChild(this.el("div", "heading gold small", "YOU'RE READY, PILOT"));
    screen.appendChild(this.el("div", "divider", ""));
    screen.appendChild(
      this.el(
        "div",
        "hint",
        "Score the best score. Be the best of the galaxy.<br/>And above all… survive.",
      ),
    );
    const launch = this.button("Launch", true, onLaunch);
    launch.classList.add("launch");
    screen.appendChild(launch);
    screen.appendChild(this.button("Main menu", false, onMenu));
    this.root.appendChild(screen);
  }

  /**
   * Game-over screen, redesigned around THIS RUN (2026-08-18: the shipped
   * `88e7632` pass fixed World rank #null and added the mini board, but
   * Lucas's original complaint — "buggy / too much info" — was still true:
   * Survived + Score + Peak multiplier + Kills + Best (all-time) + a score
   * breakdown sentence + a longest-flight delta + a rank summary + a
   * country rank + a gap sentence + the mini board, all stacked with equal
   * visual weight. Nothing competed with the score, because nothing was
   * demoted. Now: one hero number, this run's highlight/medal, a compact
   * comparison board, the actions a player actually came here for, and
   * everything else (all-time best, peak multiplier, kill count, the score
   * breakdown, the PB-time comparison) behind a single "Details" toggle —
   * see gameOverDetailsToggle. Reference for the hierarchy:
   * sam/pilot-safety-and-highlights (fa9d25e), NOT its callsign filter or
   * moderation, which main already ships its own (different, deliberately
   * kept) version of.
   */
  showGameOver(stats: GameOverStats): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    // transparent + slow fade: the canvas death veil provides the backdrop
    const screen = this.el("div", "screen gameover-screen", "");
    screen.appendChild(this.el("div", "heading", "GAME OVER"));
    if (stats.daily) {
      const label = stats.preview ? "DAILY PATROL PREVIEW" : "DAILY PATROL";
      const tag =
        stats.mutatorNames && stats.mutatorNames.length > 0
          ? `${label} &nbsp;·&nbsp; ${escapeHtml(stats.mutatorNames.join(" + "))}`
          : label;
      screen.appendChild(this.el("div", "daily-tag", tag));
    } else if (stats.gameMode === "ironrain") {
      screen.appendChild(this.el("div", "ironrain-tag", "IRON RAIN"));
    }
    screen.appendChild(this.el("div", "divider", ""));

    // HERO: the one number a player actually came here for, this run's
    // score, biggest thing on the screen, no all-time comparison attached.
    // Survived time rides along as a subtitle since it's the other number
    // players intuitively track turn to turn.
    screen.appendChild(
      this.el(
        "div",
        "result-hero",
        `<span class="result-score">${Math.floor(stats.score).toLocaleString()}</span>` +
          `<span class="result-sub">pts &nbsp;·&nbsp; survived ${fmtTime(stats.time)}</span>`,
      ),
    );
    if (stats.isNewBest) {
      screen.appendChild(this.el("div", "new-best", "New best score"));
    }

    // one memorable moment from the run, if it earned one (see highlights.ts)
    if (stats.closestCallLabel) {
      screen.appendChild(this.el("div", "result-highlight", `⚡ ${escapeHtml(stats.closestCallLabel)}`));
    }

    // best-of-day medal (score), or how close today's best is to the next tier
    if (stats.dailyMedal) {
      const { tier, hint } = stats.dailyMedal;
      screen.appendChild(
        this.el(
          "div",
          `medal-earned${tier ? ` ${tier}` : ""}`,
          tier ? `${MEDAL_EMOJI[tier]} ${MEDAL_LABEL[tier]} MEDAL` : (hint ?? ""),
        ),
      );
    }

    // free death: the attempt went back to the budget — say so, or the
    // attempt count on the retry button looks wrong. Kept visible (not
    // demoted): it directly explains this run's retry state, not an
    // all-time comparison.
    if (stats.refunded) {
      screen.appendChild(
        this.el(
          "div",
          "run-delta gold",
          `Down inside ${DAILY_FREE_DEATH_SECONDS}s: that one's free, no attempt spent`,
        ),
      );
    }

    // COMPARISON: gap-to-goal sentence + the compact 2-row board (target
    // above, this run pinned below), filled async once the score
    // submission returns (setGameOverRank). No standalone "World rank #N /
    // Country #N" text line above it any more — the board's own rank badge
    // already shows the number, and the daily/Iron Rain tag above already
    // says which board this run counts on, so a repeated label was pure
    // redundancy on a screen that had too much text, not too little.
    const rank = this.el("div", "rank-line", `<div class="field-hint center dim">Scoring…</div>`);
    rank.id = "rank-line";
    screen.appendChild(rank);

    // NEXT ACTION: the one thing to do next, front and center.
    const capped = stats.attemptsLeft !== undefined;
    const canRetry = !capped || stats.attemptsLeft! > 0;

    if (canRetry) {
      // retries keep the mode picked at launch, so say which run comes next
      const retryLabel = capped
        ? `Fly again (${stats.attemptsLeft} left)`
        : stats.daily
          ? "Fly again: Daily Patrol"
          : stats.gameMode === "ironrain"
            ? "Fly again: Iron Rain"
            : "Fly again";
      screen.appendChild(this.button(retryLabel, true, () => this.cb.onRestart()));
    } else {
      screen.appendChild(
        this.el("div", "daily-locked", "All patrols complete."),
      );
      screen.appendChild(
        this.el("div", "daily-locked-sub", `Next patrol at ${dailyResetLabel()}`),
      );
    }
    screen.appendChild(
      this.button(capped ? "Back to base" : "Main menu", false, () => this.cb.onQuitToMenu()),
    );
    if (!stats.touchDevice && canRetry) {
      screen.appendChild(this.el("div", "field-hint center", "Space to fly again"));
    }

    if (stats.showShare) {
      screen.appendChild(this.shareButton());
    }
    if (stats.clipReady) {
      const clipRow = this.el("div", "clip-save-row", "");
      clipRow.appendChild(this.saveClipButton());
      if (stats.clipJsonHref && stats.clipJsonFilename) {
        clipRow.appendChild(this.saveJsonLink(stats.clipJsonHref, stats.clipJsonFilename));
      }
      screen.appendChild(clipRow);
      if (stats.clipJsonChromeHint) {
        screen.appendChild(
          this.el(
            "div",
            "field-hint center",
            "JSON missing? Chrome blocks the second file. Allow Automatic downloads for this site " +
              "(chrome://settings/content/automaticDownloads), then Save clip again. Or click Save JSON.",
          ),
        );
      }
      if (stats.clipCapped) {
        screen.appendChild(
          this.el(
            "div",
            "field-hint center",
            `Clip capped at ${fmtTime(RECORDING_MAX_SECONDS)}: saved up to the cutoff.`,
          ),
        );
      }
    } else if (recordingSupported()) {
      // no clip from THIS run (recording was off) — the fix for "recording
      // is not findable" is putting the toggle right where a player is
      // already looking after a run, not leaving it buried in Settings.
      screen.appendChild(this.recordNextRunControl());
    }

    // DETAILS: everything that isn't the hero/highlight/medal/board —
    // all-time best, peak multiplier, kills, the score breakdown, the
    // PB-time comparison, country rank. Demoted behind one toggle so none
    // of it competes with the score above; one tap gets it back.
    screen.appendChild(this.gameOverDetailsToggle(stats));

    // feedback CTA: post-run is when testers actually have something to say
    const feedback = this.el("button", "link-btn", "Found a bug? Send feedback");
    feedback.addEventListener("click", () => this.showFeedback(null));
    screen.appendChild(feedback);

    this.root.appendChild(screen);
  }

  /**
   * Demoted run details behind a single collapsed-by-default toggle: kills,
   * peak multiplier, the all-time personal best, the score breakdown
   * sentence, and the longest-flight-vs-PB comparison — everything Lucas's
   * "too much info" complaint was actually about. A `#result-details-country`
   * slot is filled in later by setGameOverCountryRank once the score
   * submission returns (country rank is exactly the kind of all-time,
   * secondary number this toggle exists to hold).
   */
  private gameOverDetailsToggle(stats: GameOverStats): HTMLElement {
    const wrap = this.el("div", "result-details-wrap", "");
    const toggle = this.button("Details ▾", false, () => {
      const open = panel.classList.toggle("open");
      toggle.textContent = open ? "Details ▴" : "Details ▾";
    });
    toggle.classList.add("small-btn", "result-details-toggle");
    wrap.appendChild(toggle);

    const lines: string[] = [
      `Kills <b>${stats.kills}</b> &nbsp;·&nbsp; Peak multiplier <b>×${stats.maxMultiplier.toFixed(1)}</b>`,
    ];
    if (stats.best > 0) {
      lines.push(`Personal best (all-time): <b>${Math.floor(stats.best).toLocaleString()}</b>`);
    }
    if (stats.score > 0) {
      const fmt = (n: number): string => Math.floor(n).toLocaleString();
      lines.push(
        `<span>${fmt(stats.scoreKills)} pts from kills</span> · ` +
          `<span>${fmt(stats.scoreSurvival)} pts from survival</span>` +
          (stats.scoreBonuses >= 1 ? ` · <span>${fmt(stats.scoreBonuses)} pts bonus</span>` : ""),
      );
      // the daily site keeps the results screen lean — numbers only
      if (stats.attemptsLeft === undefined) {
        lines.push("Everything you score is multiplied. Chain kills to keep the multiplier hot.");
      }
    }
    // near-miss framing: how this flight compares to the longest one
    if (stats.isNewBestTime && stats.bestTime > 0) {
      lines.push("Your longest flight yet");
    } else if (stats.bestTime > 0 && stats.bestTime - stats.time >= 1) {
      const short = Math.ceil(stats.bestTime - stats.time);
      lines.push(`${short}s short of your longest flight (${fmtTime(stats.bestTime)})`);
    }

    const panel = this.el(
      "div",
      "result-details",
      lines.map((l) => `<div>${l}</div>`).join("") + `<div id="result-details-country"></div>`,
    );
    wrap.appendChild(panel);
    return wrap;
  }

  /** Compact one-tap way to turn recording on for the NEXT run, shown on
   * game over whenever this run had no clip but the browser can record
   * (see recorder.ts). The Settings toggle still exists (see showSettings);
   * this puts the same switch where a player is already looking right
   * after a run, since "recording is not findable" was the exact
   * complaint this fixes. Reads/writes the live settings object directly
   * (same pattern as toggleRow), so flipping it here takes effect on the
   * very next launch. */
  private recordNextRunControl(): HTMLElement {
    const row = this.el("div", "toggles record-next-run", "");
    const btn = document.createElement("button");
    const paint = (): void => {
      btn.textContent = this.settings.recordRuns ? "Recording next run: ON" : "🎥 Record next run";
      btn.classList.toggle("off", !this.settings.recordRuns);
    };
    paint();
    btn.classList.add("small-btn");
    btn.addEventListener("click", () => {
      this.cb.onToggle("recordRuns");
      paint();
    });
    row.appendChild(btn);
    return row;
  }

  /** Fill the details panel's country-rank line once the score submission
   * returns (see setGameOverRank). No-op if game over isn't the screen
   * currently up, or there's no country rank to show. */
  setGameOverCountryRank(country: { code: string; rank: number } | null): void {
    const slot = document.getElementById("result-details-country");
    if (!slot || !country) return;
    slot.innerHTML =
      `<div><span title="${countryName(country.code)}">${countryFlag(country.code)}</span> ` +
      `${countryName(country.code)} rank <b>#${country.rank}</b></div>`;
  }

  /**
   * Fill the game-over rank slot once the score submission returns: a
   * gap-to-goal sentence plus a 2-row mini comparison board reusing the
   * exact TODAY'S BOARD row markup (`.board-row`, `.me`, rank/flag/name/
   * points columns) — the pilot you're chasing stacked directly above your
   * own highlighted row, so the gap reads as a fast visual comparison
   * instead of a parsed sentence. `primaryRank` is nullable because a rank
   * only exists once a best score is on the board (e.g. a 0-point run has
   * none yet) — the board shows "–" rather than a literal "#null" in that
   * case. Country rank isn't rendered here any more (see
   * setGameOverCountryRank): it's all-time, secondary chrome that belongs
   * in the demoted details panel, not stacked on top of the score.
   */
  setGameOverRank(data: GameOverRankResult): void {
    const line = document.getElementById("rank-line");
    if (!line) return;
    line.innerHTML = "";
    this.setGameOverCountryRank(data.country);

    if (data.target && data.me.score < data.target.score) {
      const gap = Math.max(1, Math.floor(data.target.score - data.me.score + 1)).toLocaleString();
      const who = data.target.isWingmate
        ? `your wingmate <b>${escapeHtml(data.target.callsign)}</b>`
        : `<b>${escapeHtml(data.target.callsign)}</b>`;
      line.appendChild(this.el("div", "rank-gap dim", `${gap} points to pass ${who}`));
    }

    const board = this.el("div", "board result-board", "");
    if (data.target && data.me.score < data.target.score) {
      board.appendChild(
        this.el(
          "div",
          "board-row",
          `<span class="rank">–</span>` +
            `<span class="flag">·</span>` +
            `<span class="name">${escapeHtml(data.target.callsign)}</span>` +
            `<span class="pts">${Math.floor(data.target.score).toLocaleString()}</span>`,
        ),
      );
    }
    board.appendChild(
      this.el(
        "div",
        "board-row me",
        `<span class="rank">${data.primaryRank !== null ? `#${data.primaryRank}` : "–"}</span>` +
          `<span class="flag">${data.me.country ? countryFlag(data.me.country) : "·"}</span>` +
          `<span class="name">${escapeHtml(data.me.callsign)}</span>` +
          `<span class="pts">${Math.floor(data.me.score).toLocaleString()}</span>`,
      ),
    );
    line.appendChild(board);
  }

  /** Small note under the rank line (e.g. "name already in use" heads-up). */
  appendGameOverRankNote(text: string): void {
    const line = document.getElementById("rank-line");
    if (line) line.appendChild(this.el("div", "rank-note", text));
  }

  /** Submission failed: say so loudly and offer a retry (daily runs especially). */
  showGameOverSubmitError(onRetry: () => void): void {
    const line = document.getElementById("rank-line");
    if (!line) return;
    line.innerHTML = "";
    line.appendChild(
      this.el("div", "form-error", "Score not saved. Couldn't reach the leaderboard."),
    );
    const retry = this.button("Retry", false, onRetry);
    retry.classList.add("small-btn");
    line.appendChild(retry);
  }

  /**
   * Unsigned players: inline save-score form in the rank-line slot.
   * A name is enough — the save handler creates the account and files the run.
   */
  showGameOverGuestPrompt(handlers: {
    /** Rejects with a user-readable message shown under the field. */
    onSave: (name: string) => Promise<void>;
    onSignIn: () => void;
  }): void {
    const line = document.getElementById("rank-line");
    if (!line) return;
    line.innerHTML = "";

    line.appendChild(
      this.el("div", "guest-save-title", "Enter a name to save your score to the leaderboard"),
    );
    const row = this.el("div", "form-row guest-save-row", "");
    const name = document.createElement("input");
    name.className = "field";
    name.placeholder = "Your name";
    name.maxLength = 20;
    const save = this.button("Save score", true, () => void submit());
    row.append(name, save);
    line.appendChild(row);
    const error = this.el("div", "form-error", "");
    line.appendChild(error);
    const signIn = this.el("button", "link-btn", "Already a pilot? Sign in");
    signIn.addEventListener("click", () => handlers.onSignIn());
    line.appendChild(signIn);

    const submit = async (): Promise<void> => {
      const value = name.value.trim();
      if (!/^[A-Za-z0-9_\- ]{3,20}$/.test(value)) {
        error.textContent = "3-20 characters: letters, digits, spaces, - or _";
        return;
      }
      // Cosmetic pre-check only — the server re-checks authoritatively
      // either way, so this just saves a round trip on the obvious cases.
      if (isNicknameBlocked(value)) {
        error.textContent = pickRejectionMessage();
        return;
      }
      error.textContent = "";
      save.disabled = true;
      save.textContent = "Saving…";
      try {
        await handlers.onSave(value);
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : "couldn't save, try again";
        save.disabled = false;
        save.textContent = "Save score";
      }
    };
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void submit();
    });
  }

  /** Update the Daily Patrol menu hint once today's board loads. */
  setMenuDailyHint(html: string): void {
    const hint = document.getElementById("daily-hint");
    if (hint) hint.innerHTML = html;
  }

  /**
   * Paint the daily-only lobby's inline leaderboard once it loads. `null`
   * hides the board entirely (fetch failed) instead of leaving "Loading…"
   * stuck — a no-op if the lobby isn't the screen currently showing.
   */
  setDailyBoard(data: DailyBoardData | null): void {
    const wrap = document.getElementById("daily-lobby-board-wrap");
    const list = document.getElementById("daily-lobby-board");
    const search = document.getElementById("daily-board-search") as HTMLInputElement | null;
    if (!wrap || !list) return;
    if (data === null) {
      wrap.style.display = "none";
      this.dailyBoardFull = null;
      this.dailyBoardPinned = null;
      return;
    }
    this.dailyBoardFull = data.entries;
    this.dailyBoardPinned = data.pinned;
    if (search && search.value !== this.dailyBoardSearchQuery) {
      search.value = this.dailyBoardSearchQuery;
    }
    this.renderDailyBoardRows();
  }

  private renderDailyBoardRows(): void {
    const list = document.getElementById("daily-lobby-board");
    if (!list || this.dailyBoardFull === null) return;
    list.innerHTML = "";
    const q = normalizeCallsignSearch(this.dailyBoardSearchQuery.trim());
    if (this.dailyBoardFull.length === 0) {
      list.appendChild(
        this.el("div", "field-hint center", "No patrols flown yet today. Be the first!"),
      );
      return;
    }
    const visible = q
      ? this.dailyBoardFull.filter((row) =>
          normalizeCallsignSearch(row.callsign).includes(q),
        )
      : this.dailyBoardFull.slice(0, DAILY_BOARD_TOP_N);
    if (visible.length === 0) {
      list.appendChild(this.el("div", "field-hint center", "No matching callsigns."));
      return;
    }
    for (const row of visible) list.appendChild(this.dailyBoardRow(row, false));
    if (!q && this.dailyBoardPinned) list.appendChild(this.dailyBoardRow(this.dailyBoardPinned, true));
  }

  private dailyBoardRow(row: DailyBoardRow, pinned: boolean): HTMLElement {
    return this.el(
      "div",
      `board-row${row.isMe ? " me" : ""}${pinned ? " pinned" : ""}`,
      `<span class="rank">${row.rank}</span>` +
        `<span class="flag" title="${countryName(row.country)}">${row.country ? countryFlag(row.country) : "·"}</span>` +
        `<span class="name">${escapeHtml(row.callsign)}</span>` +
        `<span class="device" title="${DEVICE_LABEL[row.mode]}">${DEVICE_TAG[row.mode]}</span>` +
        `<span class="pts">${Math.floor(row.score).toLocaleString()}</span>`,
    );
  }

  /** Celebrate freshly earned badges on the game-over screen. */
  showEarnedBadges(badges: Array<{ icon: string; name: string }>): void {
    const rank = document.getElementById("rank-line");
    if (!rank || badges.length === 0) return;
    const wrap = this.el("div", "badge-earned", "");
    wrap.appendChild(this.el("div", "badge-earned-title", "BADGE EARNED"));
    for (const b of badges) {
      wrap.appendChild(
        this.el(
          "div",
          "badge-earned-row",
          `<span class="badge-icon">${b.icon}</span> ${b.name}`,
        ),
      );
    }
    rank.insertAdjacentElement("afterend", wrap);
  }
}
