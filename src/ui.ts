import { ALL_POWER_IDS, POWER_COLORS, POWER_HINTS, POWER_NAMES } from "./config";
import type {
  BooleanSetting,
  ControlMode,
  KeyAction,
  KeyBindings,
  SenseLevel,
  Settings,
} from "./save";
import {
  KEY_ACTION_LABELS,
  KEY_ACTIONS,
  formatKeyList,
} from "./save";

export interface UiCallbacks {
  onPlay: () => void;
  /** Launch today's Daily Patrol (shared-seed run, daily board). */
  onDaily: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuitToMenu: () => void;
  onPauseRequest: () => void;
  onTutorial: () => void;
  onToggle: (key: BooleanSetting) => void;
  /** Cycle Low/Med/High for a sensitivity setting. */
  onCycleSense: (key: "tiltSensitivity" | "directSpeed") => SenseLevel;
  onWorldArena: () => void;
  onArenas: () => void;
  onFriends: () => void;
  onProfile: () => void;
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
  touchDevice: boolean;
}

const SENSE_LABEL: Record<SenseLevel, string> = {
  low: "LOW",
  med: "MED",
  high: "HIGH",
};

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

/** DOM overlay screens (menu / pause / game over) in the gold-and-red style. */
export class Ui {
  private root: HTMLElement;
  private pauseBtn: HTMLButtonElement;

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
  }

  private clear(): void {
    this.root.innerHTML = "";
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

  showMenu(bestScore: number, touchDevice: boolean, community?: MenuCommunity): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen menu", "");
    screen.appendChild(this.el("div", "title", "ORION"));
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

    const launch = this.button("Launch", true, () => this.cb.onPlay());
    launch.classList.add("launch");
    screen.appendChild(launch);

    // Daily Patrol: everyone flies the same swarm today, one shared board
    if (community && community.callsign !== null) {
      const daily = document.createElement("button");
      daily.className = "daily-btn";
      daily.innerHTML =
        `<span class="daily-name">☀ Daily Patrol</span>` +
        `<span class="daily-sub">everyone flies the same swarm — its own board, resets at ${dailyResetLabel()}</span>` +
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

  /** Powers codex: what every pickup does, so nothing in a run is a mystery. */
  showPowers(onBack: () => void): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen", "");
    screen.appendChild(this.el("div", "heading gold small", "POWERS"));
    screen.appendChild(this.el("div", "divider", ""));
    screen.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Pickups fire the instant you grab them — no button. Every power can appear from minute zero.",
      ),
    );

    const list = this.el("div", "powers-list", "");
    for (const id of ALL_POWER_IDS) {
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
          "Inertia ON adds thrust-and-drift piloting for flavor — leaderboards don't care either way.",
      ),
    );

    const manualTitle = this.el("div", "manual-title", "FLIGHT MANUAL");
    const manual = this.el("div", "manual", "");
    const paintManual = (): void => {
      const controls = this.cb.getControls();
      const binds = this.cb.getKeyBindings();
      const rows = touchDevice
        ? controls.mode === "tilt"
          ? [
              ["Fly", "tilt your phone — the ship follows the lean"],
              ["Pause", "the II button, top right"],
            ]
          : this.settings.inertia
            ? [
                ["Fly", "drag anywhere — the ship flies where you point"],
                ["Pause", "the II button, top right"],
              ]
            : [
                ["Fly", "drag anywhere — ship goes that way"],
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
          "Tilt steering — lean the phone to fly. A tribute to Tilt to Live.",
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
        "Powers auto-activate on pickup. Touching a drone is fatal — unless shielded.<br/>Chain kills to build your multiplier and climb the leaderboard.",
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

  /** Feedback form: message + optional email for follow-ups and rewards. */
  private showFeedback(onBack: () => void): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const screen = this.el("div", "screen", "");
    screen.appendChild(this.el("div", "heading gold small", "PILOT DEBRIEF"));
    screen.appendChild(this.el("div", "divider", ""));
    screen.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Bugs, ideas, balance gripes — every report makes the arena better.",
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
        "Leave an email if you'd like a reply — or rewards for the best reports.",
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
          screen.innerHTML = "";
          screen.appendChild(this.el("div", "heading gold small", "TRANSMISSION RECEIVED"));
          screen.appendChild(this.el("div", "divider", ""));
          screen.appendChild(
            this.el(
              "div",
              "field-hint center",
              "Thank you, pilot — your report is in the log." +
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
          error.textContent = e instanceof Error ? e.message : "Transmission failed — try again.";
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
    gate.appendChild(this.el("div", "title", "ORION"));
    gate.appendChild(this.el("div", "enter", "Tap to enter"));
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

    const stick = this.button("Touch — drag anywhere to fly", current !== "tilt", () =>
      onPick("stick"),
    );
    const tilt = this.button("Tilt — lean your phone to fly", current === "tilt", () =>
      onPick("tilt"),
    );
    screen.appendChild(stick);
    screen.appendChild(tilt);
    screen.appendChild(
      this.el(
        "div",
        "field-hint center",
        "Tilt is our tribute to Tilt to Live — hold your phone at your comfortable" +
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

  showGameOver(stats: GameOverStats): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const fmtTime = (s: number): string =>
      `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

    // transparent + slow fade: the canvas death veil provides the backdrop
    const screen = this.el("div", "screen gameover-screen", "");
    screen.appendChild(this.el("div", "heading", "GAME OVER"));
    if (stats.daily) {
      screen.appendChild(this.el("div", "daily-tag", "DAILY PATROL"));
    }
    if (stats.isNewBest) {
      screen.appendChild(this.el("div", "new-best", "New best score"));
    }
    screen.appendChild(this.el("div", "divider", ""));
    // survival time leads: it's the number players intuitively compare
    screen.appendChild(
      this.el(
        "div",
        "stats",
        `<div><span class="label">Survived</span><span class="value">${fmtTime(stats.time)}</span></div>` +
          `<div><span class="label">Score</span><span class="value">${Math.floor(stats.score).toLocaleString()}</span></div>` +
          `<div><span class="label">Peak multiplier</span><span class="value">×${stats.maxMultiplier.toFixed(1)}</span></div>` +
          `<div><span class="label">Kills</span><span class="value">${stats.kills}</span></div>` +
          `<div><span class="label">Best</span><span class="value">${Math.floor(stats.best).toLocaleString()}</span></div>`,
      ),
    );

    // where the points came from — scoring is opaque without this
    if (stats.score > 0) {
      const fmt = (n: number): string => Math.floor(n).toLocaleString();
      screen.appendChild(
        this.el(
          "div",
          "score-breakdown",
          `<span>Kills ${fmt(stats.scoreKills)}</span> · ` +
            `<span>Survival ${fmt(stats.scoreSurvival)}</span>` +
            (stats.scoreBonuses >= 1 ? ` · <span>Bonuses ${fmt(stats.scoreBonuses)}</span>` : ""),
        ),
      );
      screen.appendChild(
        this.el(
          "div",
          "field-hint center",
          "Everything you score is multiplied — chain kills to keep the multiplier hot.",
        ),
      );
    }

    // near-miss framing: how this flight compares to the longest one
    if (stats.isNewBestTime && stats.bestTime > 0) {
      screen.appendChild(this.el("div", "run-delta gold", "Your longest flight yet"));
    } else if (stats.bestTime > 0 && stats.bestTime - stats.time >= 1) {
      const short = Math.ceil(stats.bestTime - stats.time);
      screen.appendChild(
        this.el(
          "div",
          "run-delta",
          `${short}s short of your longest flight (${fmtTime(stats.bestTime)})`,
        ),
      );
    }

    const rank = this.el("div", "rank-line", "");
    rank.id = "rank-line";
    screen.appendChild(rank);

    // retries keep the mode picked at launch, so say which run comes next
    screen.appendChild(
      this.button(stats.daily ? "Fly again — Daily Patrol" : "Fly again", true, () =>
        this.cb.onRestart(),
      ),
    );
    screen.appendChild(this.button("Main menu", false, () => this.cb.onQuitToMenu()));
    if (!stats.touchDevice) {
      screen.appendChild(this.el("div", "field-hint center", "Space — fly again"));
    }
    this.root.appendChild(screen);
  }

  /** Fill the game-over rank line once the score submission returns. */
  setGameOverRank(html: string): void {
    const line = document.getElementById("rank-line");
    if (line) line.innerHTML = html;
  }

  /** Submission failed: say so loudly and offer a retry (daily runs especially). */
  showGameOverSubmitError(onRetry: () => void): void {
    const line = document.getElementById("rank-line");
    if (!line) return;
    line.innerHTML = "";
    line.appendChild(
      this.el("div", "form-error", "Score not saved — couldn't reach the leaderboard."),
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
      error.textContent = "";
      save.disabled = true;
      save.textContent = "Saving…";
      try {
        await handlers.onSave(value);
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : "couldn't save — try again";
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
