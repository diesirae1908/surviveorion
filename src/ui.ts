import type { BoardMode } from "./api";
import { countryFlag, countryName } from "./countries";
import { POWER_COLORS, POWER_HINTS, POWER_NAMES, SPAWNABLE_POWER_IDS, type GameMode } from "./config";
import type { DayInfo } from "./dailyHistory";
import { isTypingTarget } from "./input";
import { MEDAL_EMOJI, MEDAL_LABEL, type MedalThresholds, type MedalTier } from "./medals";
import { archivePatrolTag, formatPatrolShort, nextPatrolMidnight, patrolDateStr } from "./patrolDate";
import {
  FLY_THIS_PATROL,
  REPLAY_THIS_PATROL,
  patrolDayEligibleForArchiveCalendarAction,
} from "./dailyHistory";
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
  PATROL_COMPLETE_BODY_1,
  PATROL_COMPLETE_BODY_GOLD,
  PATROL_COMPLETE_TITLE,
  formatKeyList,
} from "./save";
import type { ShareOutcome } from "./share";
import { isNicknameBlocked, pickRejectionMessage, sanitizeCallsignForDisplay } from "./nickname";
import { RECORDING_MAX_SECONDS, recordingSupported, recordingUnavailableReason } from "./recorder";
import {
  isNativeApp,
  isNativePlay,
  nativeNotifPrefs,
  openPrivacyPolicy,
  setNativeNotifDaily,
  setNativeNotifStreak,
} from "./native";
import {
  fetchUpdates,
  hasUnreadUpdate,
  latestUpdate,
  loadLastSeenUpdateId,
  saveLastSeenUpdateId,
  type GameUpdate,
} from "./updates";
import { APP_STORE_URL } from "./webGate";

/** Flip false to hide the App Store CTA. Listing: apps.apple.com/app/id6811113450 */
const APP_STORE_LIVE = true;

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
  /** Gold Patrol / admin: launch a past Daily from the calendar (YYYY-MM-DD). */
  onPlayArchiveDay: (date: string) => void;
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
  onSaveClip: () => Promise<boolean>;
  /** Lucas-only: POST the clip pair to surviveorion's inbox. */
  onSendToInbox: () => Promise<boolean>;
  /** Rehearse a future patrol date (YYYY-MM-DD), or null to return to live today. */
  onRehearseDay: (date: string | null) => void;
  /** Daily-lobby/settings Google/password sign-in (needed for crew inbox). */
  onCrewSignIn: () => void;
  /** Open a public pilot record (daily board rows, with wingmate actions). */
  onPilot: (callsign: string) => void;
  /** Native play: open the Gold Patrol paywall sheet. Web: open Stripe paywall. */
  onUnlockGoldPatrol?: () => void;
  /** Web Gold Patrol: start Stripe Checkout for monthly or yearly. */
  onGoldPatrolWebCheckout?: (plan: "monthly" | "yearly") => void;
  /** Web: open Stripe Customer Portal (manage/cancel). */
  onManageGoldPatrol?: () => void;
  /** Native play: leave play and open native Analytics. */
  onNativeAnalytics?: () => void;
}

export interface MenuCommunity {
  /** null → community server offline (hide community buttons) */
  callsign: string | null | undefined;
  /** Incoming friend requests — shows a dot on the Wingmates button. */
  pendingFriends?: number;
  /** Lucas-only: Record runs / Save clip / Send to inbox. Same allowlist as the inbox. */
  clipInbox?: boolean;
  tier?: "free" | "premium" | "admin";
  hasStripeCustomer?: boolean;
  /** Website Stripe checkout configured (Go Premium row). */
  webBillingEnabled?: boolean;
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
  /** Past Daily file (YYYY-MM-DD). Today's Daily omits this. */
  patrolDate?: string;
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
  /** Lucas-only: Record / Save clip / Send to inbox (GET /api/me.clipInbox). */
  clipInbox?: boolean;
  /** Native play: pitch Gold Patrol on the web game-over overlay. */
  showGoldPatrolCta?: boolean;
  /** Native play: premium pilots can jump to native Analytics. */
  showAnalyticsLink?: boolean;
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
  /** Archive files only: names the date's board so rank is not read as today. */
  boardCaption?: string | null;
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
  opts: {
    isDaily: boolean;
    callsign: string;
    country: string;
    runScore: number;
    /** Past Daily file. Today / omitted keeps the "Daily Patrol" label. */
    archiveDate?: string | null;
  },
): GameOverRankResult {
  // Daily files rank on that date's board. Today keeps "Daily Patrol".
  // A past date names the file so the slot cannot be read as today's board.
  // World rank otherwise. One primary number, not both stacked.
  const today = patrolDateStr();
  const archive = opts.isDaily && opts.archiveDate && opts.archiveDate !== today ? opts.archiveDate : null;
  const primaryLabel = !opts.isDaily
    ? "World rank"
    : archive
      ? `${formatPatrolShort(archive)} Patrol`
      : "Daily Patrol";
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
    boardCaption: archive ? `${formatPatrolShort(archive)} board` : null,
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
  /** Lucas-only: show the next-patrol picker and treat picks as sandboxed rehearsal. */
  creator?: boolean;
  upcomingDays?: Array<{ date: string; names: string }>;
  /** Signed-in callsign when the community server is up. */
  callsign?: string;
  country?: string;
  pendingFriends?: number;
  /** Gold Patrol / admin: Daily launch stays open after the free 3-attempt cap. */
  unlimitedDaily?: boolean;
  /** Website: show Gold Patrol upsell (Stripe checkout configured). */
  showWebGoldPatrol?: boolean;
  /** Website: pilot can open Stripe Customer Portal. */
  showManageGoldPatrol?: boolean;
  hasStripeCustomer?: boolean;
  /** Display prices from GET /api/config billing (checkout still uses Stripe price ids). */
  goldPatrolPrices?: { monthly: string; yearly: string };
  tier?: "free" | "premium" | "admin";
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
  /** Daily Patrol ghost: not a real account, no profile to open. */
  virtual?: boolean;
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
  /** Gold Patrol / admin: past-day Fly / Replay CTAs are live. Free: no launch. */
  canFlyArchive?: boolean;
  /** Website: past days show Gold Patrol unlock instead of fly. */
  showWebGoldPatrol?: boolean;
  /** Pacific patrol date (YYYY-MM-DD) for week headers and free-tier locks. */
  todayDate: string;
  attemptsLeft: number;
  unlimitedDaily: boolean;
  isPremiumOrAdmin: boolean;
  /** Crew / admin: show future patrol rows (rehearsal picker). Hidden for free and Gold. */
  showFutureCalendarDays: boolean;
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
 * The Daily Patrol board resets at midnight Pacific Time. Show that instant
 * in the player's local clock so PT pilots see "resets at 12:00 AM".
 */
export function dailyResetLabel(): string {
  const next = nextPatrolMidnight();
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
  /** Latest updates.json entry for the lobby bell / FIELD UPDATE popup. */
  private latestLobbyUpdate: GameUpdate | null = null;
  private lobbyUpdatesGen = 0;

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
    this.lobbyUpdatesGen += 1;
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

  hasPatrolComplete(): boolean {
    return !!document.getElementById("patrol-complete-catcher");
  }

  hidePatrolComplete(): void {
    document.getElementById("patrol-complete-catcher")?.remove();
  }

  /**
   * Chamfered PATROL COMPLETE overlay. Does not wipe the screen underneath
   * (lobby or game-over). Primary dismisses. Secondary is the App Store CTA.
   */
  showPatrolComplete(): void {
    this.hidePatrolComplete();
    const catcher = this.el("div", "patrol-complete-catcher", "");
    catcher.id = "patrol-complete-catcher";
    const card = this.el("div", "patrol-complete-modal chamfer", "");
    card.appendChild(this.el("div", "heading gold", PATROL_COMPLETE_TITLE));
    card.appendChild(
      this.el(
        "div",
        "patrol-complete-body",
        `<p>${PATROL_COMPLETE_BODY_1}</p>` + `<p>${PATROL_COMPLETE_BODY_GOLD}</p>`,
      ),
    );
    const primary = this.button("See You Tomorrow", true, () => this.hidePatrolComplete());
    primary.classList.add("chamfer");
    card.appendChild(primary);
    if (this.cb.onUnlockGoldPatrol) {
      const unlock = this.button("Unlock Gold Patrol", false, () => this.cb.onUnlockGoldPatrol?.());
      unlock.classList.add("small-btn", "chamfer", "patrol-complete-unlock");
      card.appendChild(unlock);
    } else if (APP_STORE_LIVE) {
      const store = document.createElement("a");
      store.className = "patrol-complete-store chamfer";
      store.href = APP_STORE_URL;
      store.target = "_blank";
      store.rel = "noopener";
      store.textContent = "Get ORION on iPhone";
      card.appendChild(store);
    }
    catcher.appendChild(card);
    this.root.appendChild(catcher);
  }

  /**
   * Web Gold Patrol paywall: monthly vs yearly before Stripe Checkout redirect.
   */
  showGoldPatrolPaywall(
    prices: { monthly: string; yearly: string },
    onSelect: (plan: "monthly" | "yearly") => void,
    onBack: () => void,
  ): void {
    this.clear();
    this.pauseBtn.style.display = "none";
    const screen = this.el("div", "screen gold-patrol-paywall", "");
    this.makeSubmenu(screen, onBack);

    const crown = this.el("div", "paywall-crown", "");
    crown.appendChild(this.el("div", "paywall-crown-glow", ""));
    crown.appendChild(this.el("span", "paywall-crown-glyph", "♛"));
    screen.appendChild(crown);

    screen.appendChild(this.el("div", "heading gold small", "GOLD PATROL"));
    screen.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Unlimited Daily runs, plus your full patrol archive.",
      ),
    );
    screen.appendChild(this.el("div", "divider", ""));

    const benefits = this.el("div", "paywall-benefits", "");
    const benefitLines: Array<[string, string]> = [
      ["∞", "Unlimited Daily Patrol runs today"],
      ["↻", "Replay any past Daily Patrol with full scores"],
      ["▤", "Full history: attempts, medals, streaks, trends"],
    ];
    for (const [icon, text] of benefitLines) {
      const row = this.el("div", "paywall-benefit", "");
      row.appendChild(this.el("span", "paywall-benefit-icon", icon));
      row.appendChild(this.el("span", "paywall-benefit-text", text));
      benefits.appendChild(row);
    }
    screen.appendChild(benefits);

    const plans = this.el("div", "paywall-plans", "");
    const monthlyPlan = document.createElement("button");
    monthlyPlan.type = "button";
    monthlyPlan.className = "paywall-plan chamfer";
    monthlyPlan.dataset.plan = "monthly";
    monthlyPlan.appendChild(this.el("span", "paywall-plan-price", prices.monthly));
    monthlyPlan.appendChild(this.el("span", "paywall-plan-sub", "per month"));
    monthlyPlan.addEventListener("click", () => onSelect("monthly"));
    const yearlyPlan = document.createElement("button");
    yearlyPlan.type = "button";
    yearlyPlan.className = "paywall-plan chamfer featured";
    yearlyPlan.dataset.plan = "yearly";
    yearlyPlan.appendChild(this.el("span", "paywall-plan-badge", "BEST VALUE"));
    yearlyPlan.appendChild(this.el("span", "paywall-plan-price", prices.yearly));
    yearlyPlan.appendChild(this.el("span", "paywall-plan-sub", "per year, save 37%"));
    yearlyPlan.addEventListener("click", () => onSelect("yearly"));
    plans.append(monthlyPlan, yearlyPlan);
    screen.appendChild(plans);

    screen.appendChild(
      this.el(
        "div",
        "paywall-disclosure",
        "Gold Patrol renews automatically until cancelled. Secure checkout by Stripe (USD). Manage or cancel anytime from Settings.",
      ),
    );

    const footer = this.el("div", "paywall-footer", "");
    const terms = document.createElement("a");
    terms.className = "legacy-auth-link";
    terms.href = "https://surviveorion.com/terms.html";
    terms.target = "_blank";
    terms.rel = "noopener";
    terms.textContent = "Terms";
    const privacy = document.createElement("a");
    privacy.className = "legacy-auth-link";
    privacy.href = "https://surviveorion.com/privacy.html";
    privacy.target = "_blank";
    privacy.rel = "noopener";
    privacy.textContent = "Privacy";
    footer.append(terms, this.el("span", "paywall-footer-dot", "·"), privacy);
    screen.appendChild(footer);

    this.root.appendChild(screen);
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

  /** Combined mark + wordmark (`brand/assets/logo/orion-logo-horizontal-gold.svg`). */
  private wordmarkTitle(extraClass = ""): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = extraClass ? `title ${extraClass}` : "title";
    wrap.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 603 128" role="img" aria-label="ORION" class="wordmark-svg">` +
      `<g transform="translate(0,0) scale(1.28)">` +
      `<g fill="none" stroke="#ffd700" stroke-width="10">` +
      `<path d="M26.71 21.25 A37 37 0 0 1 73.29 21.25"/>` +
      `<path d="M78.75 26.71 A37 37 0 0 1 78.75 73.29"/>` +
      `<path d="M73.29 78.75 A37 37 0 0 1 26.71 78.75"/>` +
      `<path d="M21.25 73.29 A37 37 0 0 1 21.25 26.71"/>` +
      `</g>` +
      `<circle cx="50" cy="50" r="15" fill="#c41e3a"/>` +
      `</g>` +
      `<g transform="translate(172,14)" fill="#ffd700" fill-rule="evenodd">` +
      `<path transform="translate(0,0)" d="M22 0 L56 0 L78 22 L78 78 L56 100 L22 100 L0 78 L0 22 Z M30 22 L48 22 L56 30 L56 70 L48 78 L30 78 L22 70 L22 30 Z"/>` +
      `<path transform="translate(104,0)" d="M0 0 L56 0 L78 22 L78 38 L58 60 L78 100 L48 100 L28 60 L22 60 L22 100 L0 100 Z M22 20 L46 20 L56 30 L46 40 L22 40 Z"/>` +
      `<path transform="translate(203,0)" d="M0 0 L22 0 L22 100 L0 100 Z"/>` +
      `<path transform="translate(249,0)" d="M22 0 L56 0 L78 22 L78 78 L56 100 L22 100 L0 78 L0 22 Z M30 22 L48 22 L56 30 L56 70 L48 78 L30 78 L22 70 L22 30 Z"/>` +
      `<path transform="translate(353,0)" d="M0 22 L22 0 L24 0 L56 58 L56 0 L78 0 L78 78 L56 100 L54 100 L22 42 L22 100 L0 100 Z"/>` +
      `</g></svg>`;
    return wrap;
  }

  private settingsChip(onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "corner-btn settings-chip chamfer";
    btn.title = "Settings";
    btn.textContent = "Settings";
    btn.addEventListener("click", onClick);
    return btn;
  }

  private static readonly LOBBY_ICON: Record<"bell" | "chat" | "gear" | "rec", string> = {
    bell:
      `<svg viewBox="0 0 24 24" aria-hidden="true">` +
      `<path d="M6.2 9.2a5.8 5.8 0 0 1 11.6 0c0 3.6.9 5.4 1.6 6.4H4.6c.7-1 1.6-2.8 1.6-6.4Z" fill="none" stroke="currentColor" stroke-width="1.7"/>` +
      `<path d="M10 18.2a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.7"/>` +
      `</svg>`,
    chat:
      `<svg viewBox="0 0 24 24" aria-hidden="true">` +
      `<path d="M5.4 7.4a1.6 1.6 0 0 1 1.6-1.6h11.6a1.6 1.6 0 0 1 1.6 1.6v7.6a1.6 1.6 0 0 1-1.6 1.6H9.2L5.4 19.2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>` +
      `<path d="M8.4 9.6h7.2M8.4 12.6h4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>` +
      `</svg>`,
    gear:
      `<svg viewBox="0 0 24 24" aria-hidden="true">` +
      `<path d="M10.46 6.05L10.88 3.52L13.12 3.52L13.54 6.05L15.12 6.7L17.2 5.22L18.78 6.8L17.3 8.88L17.95 10.46L20.48 10.88L20.48 13.12L17.95 13.54L17.3 15.12L18.78 17.2L17.2 18.78L15.12 17.3L13.54 17.95L13.12 20.48L10.88 20.48L10.46 17.95L8.88 17.3L6.8 18.78L5.22 17.2L6.7 15.12L6.05 13.54L3.52 13.12L3.52 10.88L6.05 10.46L6.7 8.88L5.22 6.8L6.8 5.22L8.88 6.7Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>` +
      `<circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/>` +
      `</svg>`,
    rec:
      `<svg viewBox="0 0 24 24" aria-hidden="true">` +
      `<circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.7"/>` +
      `<circle class="rec-disc" cx="12" cy="12" r="3.6" fill="currentColor"/>` +
      `</svg>`,
  };

  private lobbyIconBtn(
    kind: "bell" | "chat" | "gear",
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `lobby-icon-btn chamfer lobby-icon-${kind}`;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = Ui.LOBBY_ICON[kind];
    if (kind === "bell") {
      const pill = this.el("span", "update-pill", "");
      pill.hidden = true;
      btn.appendChild(pill);
    }
    btn.addEventListener("click", onClick);
    return btn;
  }

  private buildTierChip(
    tier: "free" | "premium" | "admin",
    onGoPremium: () => void,
    openSettings: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    if (tier === "free") {
      btn.className = "lobby-icon-btn chamfer tier-chip tier-chip-free";
      btn.title = "Activate Gold Patrol";
      btn.setAttribute("aria-label", "Activate Gold Patrol");
      btn.innerHTML =
        `<svg class="tier-chip-icon" viewBox="0 0 24 24" aria-hidden="true">` +
        `<path d="M4 18h16M5 18l-1.4-8.4L9 13l3-6 3 6 5.4-3.4L19 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>` +
        `<span class="tier-chip-label">ACTIVATE</span>`;
      btn.addEventListener("click", onGoPremium);
    } else if (tier === "premium") {
      btn.className = "lobby-icon-btn chamfer tier-chip tier-chip-premium";
      btn.title = "Gold Patrol active";
      btn.setAttribute("aria-label", "Gold Patrol active. Open Settings.");
      btn.innerHTML = `<span class="tier-chip-label">PREMIUM</span>`;
      btn.addEventListener("click", openSettings);
    } else {
      btn.className = "lobby-icon-btn chamfer tier-chip tier-chip-crew";
      btn.title = "CREW";
      btn.setAttribute("aria-label", "CREW access. Open Settings.");
      btn.innerHTML = `<span class="tier-chip-label">CREW</span>`;
      btn.addEventListener("click", openSettings);
    }
    return btn;
  }

  /** CREW / clipInbox only. Same toggle as Settings "Recording mode". */
  private recordingModeIconBtn(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lobby-icon-btn chamfer lobby-icon-rec";
    btn.innerHTML = Ui.LOBBY_ICON.rec;
    const pill = this.el("span", "rec-mode-pill", "REC");
    btn.appendChild(pill);
    const paint = (): void => {
      const on = this.settings.recordingMode;
      btn.classList.toggle("rec-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      const label = on ? "Recording mode on" : "Recording mode";
      btn.setAttribute("aria-label", label);
      btn.title = label;
      pill.hidden = !on;
    };
    paint();
    btn.addEventListener("click", () => {
      this.cb.onToggle("recordingMode");
      paint();
    });
    return btn;
  }

  private paintUpdatePill(): void {
    const pill = this.root.querySelector(".lobby-icon-bell .update-pill") as HTMLElement | null;
    if (!pill) return;
    const unread = hasUnreadUpdate(this.latestLobbyUpdate?.id ?? null, loadLastSeenUpdateId());
    pill.hidden = !unread;
  }

  hideFieldUpdate(): void {
    document.getElementById("field-update-catcher")?.remove();
  }

  /**
   * Non-blocking FIELD UPDATE overlay. Writes lastSeen on dismiss so the
   * same id never auto-fires again. Bell re-opens the latest entry anytime.
   */
  showFieldUpdate(update: GameUpdate, opts?: { persistOnDismiss?: boolean; clearPillNow?: boolean }): void {
    this.hideFieldUpdate();
    if (opts?.clearPillNow) {
      const pill = this.root.querySelector(".lobby-icon-bell .update-pill") as HTMLElement | null;
      if (pill) pill.hidden = true;
    }
    const catcher = this.el("div", "field-update-catcher", "");
    catcher.id = "field-update-catcher";
    const card = this.el("div", "field-update-modal chamfer", "");
    card.appendChild(this.el("div", "heading gold", "FIELD UPDATE"));
    card.appendChild(this.el("div", "field-update-date", escapeHtml(update.date)));
    card.appendChild(this.el("div", "field-update-title", escapeHtml(update.title)));
    const list = document.createElement("ul");
    list.className = "field-update-body";
    for (const line of update.body) {
      const item = document.createElement("li");
      item.textContent = line;
      list.appendChild(item);
    }
    card.appendChild(list);
    if (update.link) {
      const more = document.createElement("a");
      more.className = "field-update-more";
      more.href = update.link;
      more.target = "_blank";
      more.rel = "noopener";
      more.textContent = "See more →";
      card.appendChild(more);
    }
    const dismiss = (): void => {
      if (opts?.persistOnDismiss !== false) saveLastSeenUpdateId(update.id);
      this.hideFieldUpdate();
      this.paintUpdatePill();
    };
    const gotIt = this.button("GOT IT", true, dismiss);
    gotIt.classList.add("chamfer");
    card.appendChild(gotIt);
    catcher.appendChild(card);
    this.root.appendChild(catcher);
  }

  private bootLobbyUpdates(): void {
    const gen = ++this.lobbyUpdatesGen;
    void fetchUpdates()
      .then((list) => {
        if (gen !== this.lobbyUpdatesGen) return;
        if (!this.root.querySelector(".daily-lobby")) return;
        this.latestLobbyUpdate = latestUpdate(list);
        this.paintUpdatePill();
        const latest = this.latestLobbyUpdate;
        if (latest && hasUnreadUpdate(latest.id, loadLastSeenUpdateId())) {
          this.showFieldUpdate(latest, { persistOnDismiss: true, clearPillNow: true });
        }
      })
      .catch(() => {});
  }

  private openLatestFieldUpdate(): void {
    const show = (update: GameUpdate): void => {
      this.showFieldUpdate(update, { persistOnDismiss: true, clearPillNow: true });
    };
    if (this.latestLobbyUpdate) {
      show(this.latestLobbyUpdate);
      return;
    }
    void fetchUpdates()
      .then((list) => {
        this.latestLobbyUpdate = latestUpdate(list);
        if (this.latestLobbyUpdate) show(this.latestLobbyUpdate);
      })
      .catch(() => {});
  }

  private appStoreBadge(): HTMLElement {
    const wrap = this.el("div", "lobby-app-store", "");
    const store = document.createElement("a");
    store.className = "app-store-badge";
    store.href = APP_STORE_URL;
    store.target = "_blank";
    store.rel = "noopener";
    store.setAttribute("aria-label", "Download on the App Store");
    const img = document.createElement("img");
    img.src = "/app-store-badge.svg";
    img.alt = "Download on the App Store";
    img.width = 180;
    img.height = 60;
    store.appendChild(img);
    wrap.appendChild(store);
    wrap.appendChild(this.el("div", "app-store-hint", "Daily reminder on your phone"));
    return wrap;
  }

  private lobbyStackButton(
    label: string,
    onClick: () => void,
    opts?: { sub?: string; notif?: boolean; extraClass?: string },
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `menu-mode-btn training lobby-stack-btn chamfer${opts?.extraClass ? ` ${opts.extraClass}` : ""}`;
    btn.innerHTML = opts?.sub
      ? `<span class="daily-name">${escapeHtml(label)}</span><span class="daily-sub">${escapeHtml(opts.sub)}</span>`
      : `<span class="daily-name">${escapeHtml(label)}</span>`;
    if (opts?.notif) btn.appendChild(this.el("span", "notif-dot", ""));
    btn.addEventListener("click", onClick);
    return btn;
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
    btn.classList.add("share-btn", "chamfer");
    return btn;
  }

  /** Save-clip button for the opt-in local recording feature (see recorder.ts). */
  private saveClipButton(): HTMLButtonElement {
    const btn = this.button("Save clip", false, () => {
      btn.disabled = true;
      btn.textContent = "Saving...";
      void this.cb.onSaveClip().then((outcome) => {
        btn.textContent = outcome ? "Saved!" : "Couldn't save clip";
        setTimeout(() => {
          btn.textContent = "Save clip";
          btn.disabled = false;
        }, 1600);
      });
    });
    btn.classList.add("share-btn");
    return btn;
  }

  private sendInboxButton(): HTMLButtonElement {
    const btn = this.button("Send to inbox", false, () => {
      btn.disabled = true;
      btn.textContent = "Sending...";
      void this.cb.onSendToInbox().then((ok) => {
        btn.textContent = ok ? "Sent!" : "Couldn't send";
        setTimeout(() => {
          btn.textContent = "Send to inbox";
          btn.disabled = false;
        }, 1800);
      });
    });
    btn.classList.add("share-btn");
    return btn;
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
    const wrap = this.el("div", "mutator-card-wrap", "");
    wrap.appendChild(this.el("div", "mutator-card-glow", ""));
    const card = this.el("div", "mutator-card chamfer", "");
    if (preview) {
      const label = previewDate ? `PREVIEW · ${previewDate}` : "PREVIEW";
      card.appendChild(this.el("div", "preview-badge chamfer", label));
    }
    card.appendChild(this.el("div", "mutator-overline", "Today's briefing"));
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
    wrap.appendChild(card);
    return wrap;
  }

  /** Lucas-only: pick a future patrol to record before it goes live. */
  private rehearsalDayPicker(info: DailyLobbyInfo): HTMLElement {
    const wrap = this.el("div", "creator-days", "");
    wrap.appendChild(this.el("div", "creator-days-label", "CREW REHEARSAL"));
    const select = document.createElement("select");
    select.className = "creator-day-select";
    const live = document.createElement("option");
    live.value = "";
    live.textContent = "Live today";
    select.appendChild(live);
    for (const day of info.upcomingDays ?? []) {
      const opt = document.createElement("option");
      opt.value = day.date;
      opt.textContent = `${day.date} · ${day.names}`;
      select.appendChild(opt);
    }
    select.value = info.previewDate ?? "";
    select.addEventListener("change", () => {
      this.cb.onRehearseDay(select.value || null);
    });
    wrap.appendChild(select);
    wrap.appendChild(
      this.el("div", "field-hint center", "Unlimited, not scored. Same mutators pilots will get that day."),
    );
    return wrap;
  }

  /** Daily lobby identity: signed-out Sign in, or the viewer's callsign. */
  private lobbyPilotBadge(info: DailyLobbyInfo): HTMLElement {
    const badge = document.createElement("button");
    badge.className = "pilot-badge";
    badge.type = "button";
    if (info.callsign) {
      const flag = info.country ? `${countryFlag(info.country)} ` : "";
      const name = escapeHtml(sanitizeCallsignForDisplay(info.callsign));
      const tier = info.tier ?? (info.unlimitedDaily ? "premium" : "free");
      const premiumMark =
        tier === "premium" || tier === "admin"
          ? `<span class="pilot-badge-premium">◆</span>`
          : "";
      badge.innerHTML =
        `<span class="wing">✦</span> ${flag}<b>${name}${premiumMark}</b> <span class="sub">pilot profile</span>`;
      badge.title = "Pilot profile";
      if ((info.pendingFriends ?? 0) > 0) {
        badge.appendChild(this.el("span", "notif-dot", ""));
      }
      badge.addEventListener("click", () => this.cb.onProfile());
    } else {
      badge.innerHTML =
        `<span class="wing">✦</span> Sign in <span class="sub">save your score, find wingmates</span>`;
      badge.title = "Sign in";
      badge.addEventListener("click", () => this.cb.onCrewSignIn());
    }
    return badge;
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

    screen.appendChild(
      this.settingsChip(() =>
        this.showSettings(touchDevice, () => this.showMenu(bestScore, touchDevice, community), community),
      ),
    );

    this.root.appendChild(screen);
  }

  /**
   * Daily-only site lobby: Launch, Training Ground, then Calendar /
   * Wingmates / How to Play / Powers. Board + App Store badge on the
   * right. Header is Rec (CREW) / Bell / Feedback / Settings. Unsigned
   * players can still join the board via the game-over guest prompt.
   */
  showDailyLobby(info: DailyLobbyInfo): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", `screen menu daily-lobby${info.creator ? " has-rec" : ""}`, "");
    const header = this.el("div", "lobby-header", "");
    header.appendChild(this.wordmarkTitle());
    const icons = this.el("div", "lobby-header-icons", "");
    if (info.creator) {
      icons.appendChild(this.recordingModeIconBtn());
    }
    const lobbyTier: "free" | "premium" | "admin" =
      info.tier ?? (info.unlimitedDaily ? "premium" : "free");
    const openSettings = (): void =>
      this.showSettings(info.touchDevice, () => this.showDailyLobby(info), {
        callsign: info.callsign,
        pendingFriends: info.pendingFriends,
        clipInbox: info.creator,
        tier: lobbyTier,
        hasStripeCustomer: info.hasStripeCustomer,
        webBillingEnabled: info.showWebGoldPatrol,
      });
    icons.appendChild(
      this.buildTierChip(
        lobbyTier,
        () => this.cb.onUnlockGoldPatrol?.(),
        openSettings,
      ),
    );
    icons.appendChild(this.lobbyIconBtn("bell", "Updates", () => this.openLatestFieldUpdate()));
    icons.appendChild(
      this.lobbyIconBtn("chat", "Feedback", () => this.showFeedback(() => this.showDailyLobby(info))),
    );
    icons.appendChild(this.lobbyIconBtn("gear", "Settings", openSettings));
    header.appendChild(icons);
    screen.appendChild(header);

    const left = this.el("div", "lobby-col-left", "");
    left.appendChild(this.el("div", "subtitle", "Daily Patrol"));
    left.appendChild(this.el("div", "divider", ""));
    left.appendChild(this.lobbyPilotBadge(info));
    if (!info.online) {
      left.appendChild(
        this.el(
          "div",
          "daily-offline",
          "Can't reach patrol command. Daily Patrol needs a connection. Training Ground is open offline.",
        ),
      );
    }

    left.appendChild(this.el("div", "daily-day", `PATROL <b>#${info.dayNumber}</b>`));
    // pre-launch-gate days carry no mutators and no thresholds (see
    // mutators.ts MUTATORS_START_DATE): skip the card entirely so the lobby
    // looks exactly like it did before this feature shipped.
    if (info.mutators.length > 0 && info.medalThresholds) {
      left.appendChild(
        this.mutatorBriefingCard(info.mutators, info.medalThresholds, info.preview, info.previewDate),
      );
    }

    if (info.creator && info.upcomingDays && info.upcomingDays.length > 0) {
      left.appendChild(this.rehearsalDayPicker(info));
    }

    // attempt pips: one per daily try, spent ones dimmed. A preview run
    // never spends one, so its row says so instead of counting down.
    if (info.preview) {
      left.appendChild(
        this.el("div", "attempt-pips", `<span class="pips-label">unlimited attempts, not scored</span>`),
      );
    } else if (info.unlimitedDaily) {
      left.appendChild(
        this.el("div", "attempt-pips", `<span class="pips-label">Unlimited today</span>`),
      );
    } else {
      const pipsRow = this.el("div", "attempt-pips", "");
      for (let i = 0; i < info.maxAttempts; i++) {
        pipsRow.appendChild(this.el("span", `pip${i < info.attemptsLeft ? "" : " spent"}`, ""));
      }
      pipsRow.appendChild(
        this.el(
          "span",
          info.attemptsLeft > 0 ? "pips-label" : "pips-label complete",
          info.attemptsLeft > 0 ? `${info.attemptsLeft} left today` : "Patrol complete",
        ),
      );
      left.appendChild(pipsRow);
    }

    // today's leader, filled in async via setMenuDailyHint
    const hint = this.el("div", "daily-hint lobby-hint", "");
    hint.id = "daily-hint";
    left.appendChild(hint);

    // preview ignores the real attempt budget entirely: Launch always shows
    if (!info.online && !info.preview) {
      left.appendChild(
        this.el("div", "daily-locked", "Daily Patrol is offline."),
      );
    } else if (info.preview || info.unlimitedDaily || info.attemptsLeft > 0) {
      const launch = this.button("Launch Patrol", true, () => this.cb.onDaily());
      launch.classList.add("launch", "chamfer");
      left.appendChild(launch);
      if (!info.preview && !info.unlimitedDaily && info.attemptsLeft === 1) {
        left.appendChild(
          this.el("div", "field-hint center last-attempt-hint", "Last patrol today. Make it count."),
        );
      }
    } else {
      left.appendChild(
        this.el("div", "daily-locked", `Patrol <b>#${info.dayNumber}</b> complete.`),
      );
      left.appendChild(
        this.el("div", "daily-locked-sub", `Next patrol at ${dailyResetLabel()}`),
      );
      if (info.best) {
        left.appendChild(
          this.el(
            "div",
            "daily-best-line",
            `Best today: <b>${fmtTime(info.best.time)}</b> · ` +
              `<b>${Math.floor(info.best.score).toLocaleString()}</b> pts` +
              (info.best.rank !== null ? ` · #${info.best.rank}` : ""),
          ),
        );
        left.appendChild(this.shareButton());
      }
    }

    const training = this.el("button", "menu-mode-btn training chamfer", "");
    training.innerHTML =
      `<span class="daily-name">✦ Training Ground</span>` +
      `<span class="daily-sub">free practice, unlimited</span>`;
    training.addEventListener("click", () => this.cb.onTraining());
    left.appendChild(training);

    if (info.showWebGoldPatrol && info.goldPatrolPrices && this.cb.onUnlockGoldPatrol) {
      const upsell = this.el("div", "gold-patrol-lobby-upsell chamfer", "");
      upsell.appendChild(this.el("div", "manual-title", "GOLD PATROL"));
      upsell.appendChild(
        this.el(
          "div",
          "field-hint",
          `Unlimited Daily runs · ${info.goldPatrolPrices.monthly}/mo or ${info.goldPatrolPrices.yearly}/yr`,
        ),
      );
      const unlock = this.button("Unlock Gold Patrol", false, () => this.cb.onUnlockGoldPatrol?.());
      unlock.classList.add("chamfer", "gold-patrol-plan");
      upsell.appendChild(unlock);
      left.appendChild(upsell);
    }

    const util = this.el("div", "lobby-util-grid", "");
    util.appendChild(this.lobbyStackButton("Patrol Calendar", () => this.cb.onPatrolCalendar()));
    util.appendChild(
      this.lobbyStackButton("Wingmates", () => this.cb.onFriends(), {
        notif: (info.pendingFriends ?? 0) > 0,
      }),
    );
    util.appendChild(this.lobbyStackButton("How to Play", () => this.cb.onTutorial()));
    util.appendChild(
      this.lobbyStackButton("Powers", () => this.showPowers(() => this.showDailyLobby(info))),
    );
    left.appendChild(util);
    screen.appendChild(left);

    const right = this.el("div", "lobby-col-right", "");
    // Inline leaderboard: one merged ranking (all devices) for today's
    // Daily Patrol, scrollable, filled in async via setDailyBoard once it
    // loads.
    if (info.online) {
      const boardWrap = this.el("div", "daily-board-wrap chamfer", "");
      boardWrap.id = "daily-lobby-board-wrap";
      boardWrap.appendChild(this.el("div", "manual-title", "TODAY'S BOARD"));
      const search = document.createElement("input");
      search.type = "search";
      search.className = "field daily-board-search chamfer";
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
      right.appendChild(boardWrap);
    }

    if (APP_STORE_LIVE) right.appendChild(this.appStoreBadge());
    screen.appendChild(right);

    // Privacy stays footer-tier (legal, not a promoted action).
    const footer = this.el("div", "lobby-footer", "");
    const privacy = this.el("button", "full-game-link", "Privacy");
    privacy.addEventListener("click", () => openPrivacyPolicy());
    footer.append(privacy);
    screen.appendChild(footer);

    this.root.appendChild(screen);
    this.bootLobbyUpdates();
  }

  /**
   * Phone-class App Store landing. No lobby, no launch, no board.
   * Crew/QA escape is `?web=1` (sessionStorage override).
   */
  showPhoneLanding(): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen phone-landing", "");
    screen.appendChild(this.wordmarkTitle("landing-mark"));
    screen.appendChild(this.el("h1", "landing-headline", "ORION is on iPhone."));
    screen.appendChild(
      this.el("p", "landing-subline", "One patrol a day. Same swarm for every pilot."),
    );

    const cta = document.createElement("a");
    cta.className = "landing-cta chamfer";
    cta.href = APP_STORE_URL;
    cta.target = "_blank";
    cta.rel = "noopener";
    cta.textContent = "Get on iPhone";
    screen.appendChild(cta);

    const more = this.el("div", "landing-more", "");
    const expand = this.el("button", "landing-expand", "What is Daily Patrol?");
    const blurb = this.el(
      "p",
      "landing-blurb",
      "One short run a day, same for every pilot. Dodge the swarm, beat your best, climb the board.",
    );
    blurb.hidden = true;
    expand.addEventListener("click", () => {
      const open = blurb.hidden;
      blurb.hidden = !open;
      expand.setAttribute("aria-expanded", open ? "true" : "false");
    });
    expand.setAttribute("aria-expanded", "false");
    more.append(expand, blurb);
    screen.appendChild(more);

    const footer = this.el("div", "landing-footer", "");
    const crew = document.createElement("a");
    crew.className = "landing-crew";
    crew.textContent = "Crew: open in browser";
    const dest = new URL(location.href);
    dest.searchParams.set("web", "1");
    crew.href = `${dest.pathname}${dest.search}${dest.hash}`;
    const privacy = this.el("button", "full-game-link", "Privacy");
    privacy.addEventListener("click", () => openPrivacyPolicy());
    footer.append(crew, privacy);
    screen.appendChild(footer);

    this.root.appendChild(screen);
  }

  private dayRowMutatorCopy(day: DayInfo): { name: string; sub: string } {
    if (day.mutators.length === 0) {
      return { name: "CLASSIC", sub: "The standard swarm. No mutator today." };
    }
    if (day.mutators.length === 2) {
      const a = day.mutators[0]!;
      const b = day.mutators[1]!;
      return {
        name: `${a.name} + ${b.name}`.toUpperCase(),
        sub: `${a.subline} · ${b.subline}`,
      };
    }
    const m = day.mutators[0]!;
    return { name: m.name.toUpperCase(), sub: m.subline };
  }

  private weekSectionLabel(
    days: Array<DayInfo & { dayOfMonth: number }>,
    todayDate: string,
  ): string {
    if (days.some((d) => d.date === todayDate)) return "THIS WEEK";
    const start = days.reduce((a, b) => (a.date < b.date ? a : b));
    const d = new Date(`${start.date}T00:00:00.000Z`);
    const short = d
      .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
      .toUpperCase();
    return `WEEK OF ${short}`;
  }

  private buildDayRowStatus(
    day: DayInfo & { dayOfMonth: number },
    month: PatrolCalendarMonth,
  ): HTMLElement {
    const statusCol = this.el("div", "day-card-status", "");
    const isPremium = month.isPremiumOrAdmin;
    const lockedPast =
      !isPremium && day.date < month.todayDate && day.status !== "today";
    const showGoldLock =
      lockedPast && (day.status === "missed" || day.status === "untracked");

    if (day.status === "today") {
      statusCol.appendChild(this.el("span", "status-chip status-chip-today", "TODAY"));
      const attempts = this.el("span", "status-attempts", "");
      if (month.unlimitedDaily) {
        attempts.textContent = "∞";
      } else {
        attempts.textContent =
          month.attemptsLeft === 1 ? "1 left" : `${month.attemptsLeft} left`;
      }
      statusCol.appendChild(attempts);
      return statusCol;
    }

    if (
      day.status === "completed" ||
      day.status === "completed-local-only"
    ) {
      statusCol.appendChild(
        this.el(
          "span",
          "day-card-score",
          Math.floor(day.score ?? 0).toLocaleString(),
        ),
      );
      if (day.medal) {
        statusCol.appendChild(
          this.el(
            "span",
            `day-card-medal day-card-medal-${day.medal}`,
            MEDAL_LABEL[day.medal].toUpperCase(),
          ),
        );
      } else if (day.rank !== undefined && day.rank !== null) {
        statusCol.appendChild(this.el("span", "status-attempts", `#${day.rank}`));
      }
      return statusCol;
    }

    if (showGoldLock) {
      statusCol.appendChild(this.el("span", "day-card-lock", "🔒"));
      statusCol.appendChild(this.el("span", "status-chip status-chip-gold", "GOLD"));
      return statusCol;
    }

    if (day.status === "attempted") {
      statusCol.appendChild(
        this.el("span", "status-chip status-chip-muted", "STARTED"),
      );
      return statusCol;
    }
    if (day.status === "missed") {
      statusCol.appendChild(
        this.el("span", "status-chip status-chip-muted", "MISSED"),
      );
      return statusCol;
    }
    if (day.status === "untracked") {
      statusCol.appendChild(
        this.el("span", "status-chip status-chip-muted", "NO RECORD"),
      );
      return statusCol;
    }
    if (day.status === "future") {
      statusCol.appendChild(
        this.el("span", "status-chip status-chip-rehearsal", "REHEARSAL"),
      );
      return statusCol;
    }
    return statusCol;
  }

  private appendCalendarDayAction(
    card: HTMLElement,
    day: DayInfo & { dayOfMonth: number },
    month: PatrolCalendarMonth,
    handlers: { onPlayDay?: (date: string) => void },
  ): void {
    const canFlyArchive = !!month.canFlyArchive;
    const showWebGoldPatrol = !!month.showWebGoldPatrol;
    const archivePast = patrolDayEligibleForArchiveCalendarAction(
      day.status,
      day.date,
      month.todayDate,
    );

    let actionBtn: HTMLButtonElement | null = null;

    if (
      day.status === "today" &&
      canFlyArchive &&
      handlers.onPlayDay &&
      (month.unlimitedDaily || month.attemptsLeft > 0)
    ) {
      actionBtn = this.button(FLY_THIS_PATROL, true, () => handlers.onPlayDay!(day.date));
    } else if (archivePast && canFlyArchive && handlers.onPlayDay) {
      const replayed =
        day.status === "completed" || day.status === "completed-local-only";
      actionBtn = this.button(
        replayed ? REPLAY_THIS_PATROL : FLY_THIS_PATROL,
        true,
        () => handlers.onPlayDay!(day.date),
      );
    } else if (archivePast && showWebGoldPatrol && this.cb.onUnlockGoldPatrol) {
      actionBtn = this.button("Unlock Gold Patrol", true, () =>
        this.cb.onUnlockGoldPatrol?.(),
      );
      actionBtn.classList.add("gold-patrol-plan");
    }

    if (!actionBtn) return;
    actionBtn.classList.add("day-card-action", "chamfer");
    actionBtn.addEventListener("click", (e) => e.stopPropagation());
    const actionWrap = this.el("div", "day-card-action-wrap", "");
    actionWrap.appendChild(actionBtn);
    card.appendChild(actionWrap);
  }

  private buildCalendarDayCard(
    day: DayInfo & { dayOfMonth: number },
    month: PatrolCalendarMonth,
    handlers: { onPlayDay?: (date: string) => void },
  ): HTMLElement {
    const todayClass = day.status === "today" ? " day-card-today" : "";
    const card = this.el("div", `day-card chamfer${todayClass}`, "");

    const d = new Date(`${day.date}T00:00:00.000Z`);
    const weekday = d
      .toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
      .toUpperCase();
    const { name, sub } = this.dayRowMutatorCopy(day);

    const dateCol = this.el("div", "day-card-date", "");
    dateCol.appendChild(this.el("span", "day-card-weekday", weekday));
    dateCol.appendChild(this.el("span", "day-card-num", String(day.dayOfMonth)));

    const mutCol = this.el("div", "day-card-mutator", "");
    mutCol.appendChild(this.el("span", "day-card-name", name));
    mutCol.appendChild(this.el("span", "day-card-sub", sub));

    card.append(dateCol, mutCol, this.buildDayRowStatus(day, month));
    this.appendCalendarDayAction(card, day, month, handlers);

    const lockedPast =
      !month.isPremiumOrAdmin &&
      day.date < month.todayDate &&
      day.status !== "today";
    if (lockedPast) {
      card.setAttribute("aria-label", "Locked. Requires Gold Patrol.");
      card.classList.add("day-card-locked");
      card.addEventListener("click", () => this.cb.onUnlockGoldPatrol?.());
    }

    return card;
  }

  private attachWeekTrackPeekEffects(weekList: HTMLElement): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(min-width: 900px)").matches) return;

    const tracks = weekList.querySelectorAll<HTMLElement>(".week-track");
    for (const track of tracks) {
      track.style.scrollBehavior = "smooth";
      const cards = track.querySelectorAll<HTMLElement>(".day-card");
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            entry.target.classList.toggle(
              "day-card-peek",
              entry.intersectionRatio < 0.75,
            );
          }
        },
        { root: track, threshold: [0, 0.25, 0.5, 0.75, 1] },
      );
      cards.forEach((c) => observer.observe(c));
    }
  }

  /**
   * Patrol history calendar: a month at a time, Sunday-start grid, tap a
   * day for its mutator(s) and result. Reached from the daily lobby's
   * Patrol Calendar button.
   */
  showPatrolCalendar(
    month: PatrolCalendarMonth,
    handlers: {
      onBack: () => void;
      onPrevMonth: () => void;
      onNextMonth: () => void;
      onPlayDay?: (date: string) => void;
    },
  ): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen calendar-screen calendar-screen-v2", "");
    this.makeSubmenu(screen, handlers.onBack);
    screen.appendChild(this.el("div", "heading gold small", "PATROL HISTORY"));
    screen.appendChild(this.el("div", "divider", ""));

    const nav = this.el("div", "calendar-nav", "");
    const prev = this.button("‹", false, handlers.onPrevMonth);
    prev.disabled = !month.canGoPrev;
    prev.classList.add("calendar-nav-btn", "chamfer");
    const next = this.button("›", false, handlers.onNextMonth);
    next.disabled = !month.canGoNext;
    next.classList.add("calendar-nav-btn", "chamfer");
    nav.append(prev, this.el("span", "calendar-month-label", month.label), next);
    screen.appendChild(nav);

    if (month.showWebGoldPatrol && this.cb.onUnlockGoldPatrol) {
      const strip = document.createElement("button");
      strip.type = "button";
      strip.className = "gold-strip chamfer";
      strip.appendChild(this.el("span", "gold-strip-icon", "♛"));
      const copy = this.el("span", "gold-strip-copy", "");
      copy.appendChild(this.el("span", "gold-strip-eyebrow", "GOLD PATROL"));
      copy.appendChild(
        this.el(
          "span",
          "gold-strip-title",
          "Every past patrol. Unlimited daily runs.",
        ),
      );
      strip.append(copy, this.el("span", "gold-strip-chevron", "›"));
      strip.addEventListener("click", () => this.cb.onUnlockGoldPatrol?.());
      screen.appendChild(strip);
    }

    const weekList = this.el("div", "week-list", "");
    const reversedWeeks = [...month.weeks].reverse();
    for (const week of reversedWeeks) {
      let days = week
        .filter((c): c is DayInfo & { dayOfMonth: number } => c !== null)
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      if (!month.showFutureCalendarDays) {
        days = days.filter((d) => d.date <= month.todayDate);
      }
      if (days.length === 0) continue;

      const section = this.el("div", "week-section", "");
      const header = this.el("div", "week-header", "");
      header.appendChild(
        this.el(
          "span",
          "week-header-label",
          this.weekSectionLabel(days, month.todayDate),
        ),
      );
      header.appendChild(this.el("span", "week-header-rule", ""));
      section.appendChild(header);

      const track = this.el("div", "week-track", "");
      for (const day of days) {
        track.appendChild(this.buildCalendarDayCard(day, month, handlers));
      }
      section.appendChild(track);
      weekList.appendChild(section);
    }
    screen.appendChild(weekList);
    this.attachWeekTrackPeekEffects(weekList);

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
  showSettings(touchDevice: boolean, onBack: () => void, community?: MenuCommunity): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen", "");
    this.makeSubmenu(screen, onBack);
    screen.appendChild(this.el("div", "heading gold small", "SETTINGS"));
    screen.appendChild(this.el("div", "divider", ""));

    const tier: "free" | "premium" | "admin" = community?.tier ?? "free";

    const accountSection = this.el("div", "settings-section", "");
    accountSection.appendChild(this.el("div", "manual-title", "ACCOUNT"));
    const accountPanel = this.el("div", "settings-panel chamfer", "");
    const tierRow = this.el("div", "settings-row", "");
    tierRow.appendChild(this.el("span", "settings-row-label", "ACCOUNT"));
    const badgeClass =
      tier === "admin"
        ? "tier-badge tier-badge-crew"
        : tier === "premium"
          ? "tier-badge tier-badge-premium"
          : "tier-badge tier-badge-free";
    const badgeLabel = tier === "admin" ? "CREW" : tier === "premium" ? "PREMIUM" : "FREE";
    tierRow.appendChild(this.el("span", badgeClass, badgeLabel));
    accountPanel.appendChild(tierRow);

    const showGoPremium =
      tier === "free" && community?.webBillingEnabled && this.cb.onUnlockGoldPatrol;
    const showManage =
      tier === "premium" && community?.hasStripeCustomer && this.cb.onManageGoldPatrol;
    if (showGoPremium || showManage) {
      accountPanel.appendChild(this.el("div", "settings-hairline", ""));
      if (showGoPremium) {
        const go = document.createElement("button");
        go.type = "button";
        go.className = "settings-row settings-row-link";
        go.innerHTML =
          `<span>Go Premium: unlock Gold Patrol</span><span class="settings-row-chevron">›</span>`;
        go.addEventListener("click", () => this.cb.onUnlockGoldPatrol?.());
        accountPanel.appendChild(go);
      } else if (showManage) {
        const manage = document.createElement("button");
        manage.type = "button";
        manage.className = "settings-row settings-row-link";
        manage.innerHTML =
          `<span>Manage Gold Patrol subscription</span><span class="settings-row-chevron">›</span>`;
        manage.addEventListener("click", () => this.cb.onManageGoldPatrol?.());
        accountPanel.appendChild(manage);
      }
    }
    accountSection.appendChild(accountPanel);

    if (community?.callsign) {
      const profile = this.el(
        "button",
        "link-btn",
        `Pilot profile · ${escapeHtml(sanitizeCallsignForDisplay(community.callsign))}`,
      );
      profile.addEventListener("click", () => this.cb.onProfile());
      accountSection.appendChild(profile);
      accountSection.appendChild(
        this.el("div", "field-hint center", "Country, wingmates, and sign out live here."),
      );
    } else {
      const signIn = this.el("button", "link-btn", "Sign in");
      signIn.addEventListener("click", () => this.cb.onCrewSignIn());
      accountSection.appendChild(signIn);
      accountSection.appendChild(
        this.el(
          "div",
          "field-hint center",
          "Optional. Needed to save a score to the board from a new device.",
        ),
      );
    }
    screen.appendChild(accountSection);

    const manualTitle = this.el("div", "manual-title", "FLIGHT MANUAL");
    const manual = this.el("div", "manual", "");
    let paintManual: () => void;
    paintManual = (): void => {
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

    if (community?.clipInbox) {
      const crewSection = this.el("div", "settings-section", "");
      crewSection.appendChild(this.el("div", "manual-title", "CREW"));
      const crewPanel = this.el("div", "settings-panel settings-panel-crew chamfer", "");
      if (recordingSupported()) {
        crewPanel.appendChild(this.toggleRow([["recordRuns", "Record runs"]]));
        crewSection.appendChild(
          this.el(
            "div",
            "field-hint center",
            "Saves a local clip of each run. Send to inbox posts the webm and JSON pair for Grok. " +
              "A quick toggle also shows up on the game-over screen after a run.",
          ),
        );
      } else {
        const row = this.el("div", "toggles", "");
        const dead = document.createElement("button");
        dead.textContent = "Record runs: unavailable";
        dead.disabled = true;
        dead.classList.add("off");
        row.appendChild(dead);
        crewPanel.appendChild(row);
        crewSection.appendChild(this.el("div", "field-hint center", recordingUnavailableReason()));
      }
      crewPanel.appendChild(this.toggleRow([["recordingMode", "Recording mode"]]));
      crewSection.appendChild(crewPanel);
      crewSection.appendChild(
        this.el(
          "div",
          "field-hint center",
          "Capture menus and game over, not just the run. Desktop Chrome: pick this tab when asked.",
        ),
      );
      screen.appendChild(crewSection);
    }

    const gameplaySection = this.el("div", "settings-section", "");
    gameplaySection.appendChild(this.el("div", "manual-title", "GAMEPLAY"));
    gameplaySection.appendChild(
      this.toggleRow([
        ["sound", "Sound"],
        ["music", "Music"],
        ["screenShake", "Shake"],
        ["inertia", "Inertia"],
      ]),
    );

    const senseRow = this.el("div", "toggles", "");
    senseRow.appendChild(this.senseButton("directSpeed", "Direct speed"));
    if (touchDevice && this.cb.getControls().tiltSupported) {
      senseRow.appendChild(this.senseButton("tiltSensitivity", "Tilt sense"));
    }
    gameplaySection.appendChild(senseRow);

    gameplaySection.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Direct control is the default: the ship goes where you point. " +
          "Inertia ON adds thrust-and-drift piloting for flavor. Leaderboards don't care either way.",
      ),
    );

    if (touchDevice && this.cb.getControls().tiltSupported) {
      gameplaySection.appendChild(
        this.el(
          "div",
          "field-hint center",
          "Tilt steering: lean the phone to fly.",
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
      const paintControls = (): void => {
        const mode = this.cb.getControls().mode;
        tiltBtn.textContent = `Tilt: ${mode === "tilt" ? "ON" : "OFF"}`;
        tiltBtn.classList.toggle("off", mode !== "tilt");
        stickBtn.textContent = `Stick: ${mode === "stick" ? "ON" : "OFF"}`;
        stickBtn.classList.toggle("off", mode !== "stick");
        recal.style.display = mode === "tilt" ? "" : "none";
        paintManual();
      };
      tiltBtn.addEventListener("click", () => void this.cb.onControlModeChange("tilt").then(paintControls));
      stickBtn.addEventListener("click", () => void this.cb.onControlModeChange("stick").then(paintControls));
      paintControls();
      row.append(tiltBtn, stickBtn);
      gameplaySection.appendChild(row);
      gameplaySection.appendChild(recal);
    }
    screen.appendChild(gameplaySection);

    // re-paint the flight manual when Inertia is flipped
    const inertiaBtn = [...screen.querySelectorAll(".toggles button")].find((b) =>
      (b as HTMLButtonElement).textContent?.startsWith("Inertia"),
    );
    inertiaBtn?.addEventListener("click", () => paintManual());

    const pilotSection = this.el("div", "settings-section", "");
    pilotSection.appendChild(this.el("div", "manual-title", "PILOT"));
    pilotSection.appendChild(manualTitle);
    pilotSection.appendChild(manual);

    if (!touchDevice) {
      pilotSection.appendChild(this.el("div", "manual-title", "KEY BINDINGS"));
      pilotSection.appendChild(this.buildKeybindEditor(paintManual));
      pilotSection.appendChild(
        this.el("div", "field-hint center", "Click a binding, then press a key. Esc cancels."),
      );
    }

    pilotSection.appendChild(
      this.el(
        "div",
        "hint",
        "Powers auto-activate on pickup. Touching a drone is fatal, unless shielded.<br/>Chain kills to build your multiplier and climb the leaderboard.",
      ),
    );

    if (isNativeApp()) {
      pilotSection.appendChild(this.el("div", "manual-title", "REMINDERS"));
      const notifRow = this.el("div", "toggles", "");
      const dailyBtn = document.createElement("button");
      const streakBtn = document.createElement("button");
      const paintNotif = (): void => {
        const p = nativeNotifPrefs();
        dailyBtn.textContent = `Daily patrol: ${p.daily ? "ON" : "OFF"}`;
        dailyBtn.classList.toggle("off", !p.daily);
        streakBtn.textContent = `Streak at risk: ${p.streakAtRisk ? "ON" : "OFF"}`;
        streakBtn.classList.toggle("off", !p.streakAtRisk);
      };
      dailyBtn.addEventListener("click", () => {
        void setNativeNotifDaily(!nativeNotifPrefs().daily).then(paintNotif);
      });
      streakBtn.addEventListener("click", () => {
        void setNativeNotifStreak(!nativeNotifPrefs().streakAtRisk).then(paintNotif);
      });
      paintNotif();
      notifRow.append(dailyBtn, streakBtn);
      pilotSection.appendChild(notifRow);
      pilotSection.appendChild(
        this.el(
          "div",
          "field-hint center",
          "Local reminders only, at midnight Pacific. First launch never asks. Streak warning is off until you turn it on.",
        ),
      );
    }
    screen.appendChild(pilotSection);

    const privacySection = this.el("div", "settings-section", "");
    privacySection.appendChild(this.el("div", "manual-title", "PRIVACY"));
    const privacy = this.el("button", "link-btn", "Privacy policy");
    privacy.addEventListener("click", () => openPrivacyPolicy());
    privacySection.appendChild(privacy);

    const feedback = this.button("Send feedback", false, () =>
      this.showFeedback(() => this.showSettings(touchDevice, onBack, community)),
    );
    feedback.classList.add("small-btn");
    privacySection.appendChild(feedback);
    screen.appendChild(privacySection);

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
    // Native play only: switch Touch ↔ Tilt without restarting the run.
    // Website pause stays as it was (recalibrate when already on tilt).
    if (isNativePlay() && this.cb.getControls().tiltSupported) {
      if (this.cb.getControls().mode === "tilt") {
        const toTouch = this.button("Switch to touch", false, () => {
          void this.cb.onControlModeChange("stick").then(() => this.showPause());
        });
        toTouch.classList.add("small-btn");
        screen.appendChild(toTouch);
      } else {
        const toTilt = this.button("Switch to tilt", false, () => {
          this.showTiltReadyConfirm(
            () => {
              void this.cb.onControlModeChange("tilt").then(() => this.showPause());
            },
            () => this.showPause(),
          );
        });
        toTilt.classList.add("small-btn");
        screen.appendChild(toTilt);
      }
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
   * default drag-anywhere stick, or phone tilt.
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
    const tilt = this.button("Tilt: lean your phone to fly", current === "tilt", () => {
      this.showTiltReadyConfirm(
        () => onPick("tilt"),
        () => this.showModeSelect(current, onPick),
      );
    });
    screen.appendChild(stick);
    screen.appendChild(tilt);
    screen.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Hold your phone at your comfortable play angle before tapping, that becomes neutral.",
      ),
    );
    this.root.appendChild(screen);
  }

  /**
   * Confirm comfortable play angle before starting motion / capturing neutral.
   * Cancel returns to the caller (control picker or pause).
   */
  showTiltReadyConfirm(onConfirm: () => void, onCancel: () => void): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen", "");
    screen.appendChild(this.el("div", "heading gold small", "HOLD YOUR POSITION"));
    screen.appendChild(this.el("div", "divider", ""));
    screen.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Hold your phone at your comfortable play angle, then confirm. That becomes neutral.",
      ),
    );
    screen.appendChild(this.button("Confirm", true, onConfirm));
    const cancel = this.button("Cancel", false, onCancel);
    cancel.classList.add("small-btn");
    screen.appendChild(cancel);
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
      const today = patrolDateStr();
      const archive = stats.patrolDate && stats.patrolDate !== today ? stats.patrolDate : null;
      const label = stats.preview
        ? "DAILY PATROL PREVIEW"
        : archive
          ? archivePatrolTag(archive)
          : "DAILY PATROL";
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

    const actions = this.el("div", "gameover-actions", "");
    if (canRetry) {
      // retries keep the mode picked at launch, so say which run comes next
      const retryLabel = capped
        ? `Fly again (${stats.attemptsLeft} left)`
        : stats.daily
          ? "Fly again: Daily Patrol"
          : stats.gameMode === "ironrain"
            ? "Fly again: Iron Rain"
            : "Fly again";
      const retry = this.button(retryLabel, true, () => this.cb.onRestart());
      retry.classList.add("gameover-primary");
      actions.appendChild(retry);
    } else {
      actions.appendChild(
        this.el("div", "daily-locked", "All patrols complete."),
      );
      actions.appendChild(
        this.el("div", "daily-locked-sub", `Next patrol at ${dailyResetLabel()}`),
      );
    }
    const navRow = this.el("div", "gameover-row", "");
    const menuBtn = this.button(capped ? "Back to base" : "Main menu", false, () => this.cb.onQuitToMenu());
    menuBtn.classList.add("small-btn", "chamfer");
    navRow.appendChild(menuBtn);
    if (stats.showShare) {
      const share = this.shareButton();
      share.classList.add("small-btn");
      navRow.appendChild(share);
    }
    actions.appendChild(navRow);
    if (!stats.touchDevice && canRetry) {
      actions.appendChild(this.el("div", "field-hint center gameover-space-hint", "Space to fly again"));
    }

    if (stats.clipInbox) {
      if (stats.clipReady) {
        const clipRow = this.el("div", "clip-save-row gameover-row", "");
        clipRow.appendChild(this.saveClipButton());
        clipRow.appendChild(this.sendInboxButton());
        actions.appendChild(clipRow);
        if (stats.clipCapped) {
          actions.appendChild(
            this.el(
              "div",
              "field-hint center",
              `Clip capped at ${fmtTime(RECORDING_MAX_SECONDS)}: saved up to the cutoff.`,
            ),
          );
        }
      } else if (recordingSupported()) {
        actions.appendChild(this.recordNextRunControl());
      }
    }

    // DETAILS: everything that isn't the hero/highlight/medal/board —
    // all-time best, peak multiplier, kills, the score breakdown, the
    // PB-time comparison, country rank. Demoted behind one toggle so none
    // of it competes with the score above; one tap gets it back.
    actions.appendChild(this.gameOverDetailsToggle(stats));

    if (stats.showGoldPatrolCta) {
      const pitch = this.el("div", "gameover-gold-pitch chamfer", "");
      pitch.appendChild(this.el("div", "gameover-gold-glow", ""));
      const eyebrow = this.el("div", "gameover-gold-eyebrow", "");
      eyebrow.appendChild(this.el("span", "gameover-gold-crown", "♛"));
      eyebrow.appendChild(document.createTextNode("GOLD PATROL"));
      pitch.appendChild(eyebrow);
      pitch.appendChild(this.el("div", "gameover-gold-headline", "Fly every patrol."));
      pitch.appendChild(
        this.el(
          "div",
          "field-hint center",
          "Unlimited Daily runs, every past patrol, full history.",
        ),
      );
      const unlock = this.button("Unlock Gold Patrol", false, () => this.cb.onUnlockGoldPatrol?.());
      unlock.classList.add("small-btn", "chamfer");
      pitch.appendChild(unlock);
      actions.appendChild(pitch);
    }
    if (stats.showAnalyticsLink && this.cb.onNativeAnalytics) {
      const analytics = this.el("button", "link-btn", "View Analytics");
      analytics.addEventListener("click", () => this.cb.onNativeAnalytics?.());
      actions.appendChild(analytics);
    }

    // feedback CTA: post-run is when testers actually have something to say
    const feedback = this.el("button", "link-btn", "Found a bug? Send feedback");
    feedback.addEventListener("click", () => this.showFeedback(null));
    actions.appendChild(feedback);
    screen.appendChild(actions);

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
   * same board-row markup the lobby uses (`.board-row`, `.me`, rank/flag/name/
   * points columns) — the pilot you're chasing stacked directly above your
   * own highlighted row, so the gap reads as a fast visual comparison
   * instead of a parsed sentence. `primaryRank` is nullable because a rank
   * only exists once a best score is on the board (e.g. a 0-point run has
   * none yet) — the board shows "–" rather than a literal "#null" in that
   * case. Country rank isn't rendered here any more (see
   * setGameOverCountryRank): it's all-time, secondary chrome that belongs
   * in the demoted details panel, not stacked on top of the score.
   * Archive files set `boardCaption` so this slot cannot be read as today's board.
   */
  setGameOverRank(data: GameOverRankResult): void {
    const line = document.getElementById("rank-line");
    if (!line) return;
    line.innerHTML = "";
    this.setGameOverCountryRank(data.country);
    if (data.boardCaption) {
      line.appendChild(this.el("div", "field-hint center dim", escapeHtml(data.boardCaption)));
    }

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
    const clickable = !row.virtual;
    const el = this.el(
      "div",
      `board-row${clickable ? " link" : ""}${row.isMe ? " me" : ""}${pinned ? " pinned" : ""}`,
      `<span class="rank">${row.rank}</span>` +
        `<span class="flag" title="${countryName(row.country)}">${row.country ? countryFlag(row.country) : "·"}</span>` +
        `<span class="name">${escapeHtml(row.callsign)}</span>` +
        `<span class="device" title="${DEVICE_LABEL[row.mode]}">${DEVICE_TAG[row.mode]}</span>` +
        `<span class="pts">${Math.floor(row.score).toLocaleString()}</span>`,
    );
    if (clickable) {
      el.addEventListener("click", () => {
        if (row.isMe) this.cb.onProfile();
        else this.cb.onPilot(row.callsign);
      });
    }
    return el;
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
