import type { Settings } from "./save";

export interface UiCallbacks {
  onPlay: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuitToMenu: () => void;
  onPauseRequest: () => void;
  onToggle: (key: keyof Settings) => void;
  onWorldArena: () => void;
  onArenas: () => void;
  onProfile: () => void;
}

export interface MenuCommunity {
  /** null → community server offline (hide community buttons) */
  callsign: string | null | undefined;
}

export interface GameOverStats {
  score: number;
  time: number;
  kills: number;
  best: number;
  isNewBest: boolean;
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

  /** Fade out whatever screen is showing (used by the launch transition). */
  fadeOutScreens(): void {
    this.pauseBtn.style.display = "none";
    for (const el of Array.from(this.root.children)) {
      el.classList.add("fade-out");
    }
  }

  private toggleRow(keys: Array<[keyof Settings, string]>): HTMLElement {
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

    // community row (only when the server is reachable)
    if (community && community.callsign !== null) {
      const row = this.el("div", "menu-row", "");
      row.appendChild(this.button("World Arena", false, () => this.cb.onWorldArena()));
      row.appendChild(this.button("Arenas", false, () => this.cb.onArenas()));
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
    ]));

    const rows = touchDevice
      ? [
          ["Fly", "drag on the left half — the ship flies where you point"],
          ["Boost", "hold the right half"],
          ["Pause", "the II button, top right"],
        ]
      : [
          ["Thrust", "W or ↑"],
          ["Turn", "A D or ← →"],
          ["Boost", "Space"],
          ["Pause", "Esc"],
        ];
    screen.appendChild(this.el("div", "manual-title", "FLIGHT MANUAL"));
    screen.appendChild(
      this.el(
        "div",
        "manual",
        rows.map(([k, v]) => `<div><span class="k">${k}</span><span class="v">${v}</span></div>`).join(""),
      ),
    );
    screen.appendChild(
      this.el(
        "div",
        "hint",
        "Powers auto-activate on pickup. Touching a drone is fatal — unless shielded.<br/>Chain kills to build your multiplier and climb the World Arena.",
      ),
    );

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
    ]));
    this.root.appendChild(screen);
  }

  showGameOver(stats: GameOverStats): void {
    this.clear();
    this.pauseBtn.style.display = "none";

    const mins = Math.floor(stats.time / 60);
    const secs = Math.floor(stats.time % 60);

    // transparent + slow fade: the canvas death veil provides the backdrop
    const screen = this.el("div", "screen gameover-screen", "");
    screen.appendChild(this.el("div", "heading", "GAME OVER"));
    if (stats.isNewBest) {
      screen.appendChild(this.el("div", "new-best", "New best score"));
    }
    screen.appendChild(this.el("div", "divider", ""));
    screen.appendChild(
      this.el(
        "div",
        "stats",
        `<div><span class="label">Score</span><span class="value">${Math.floor(stats.score).toLocaleString()}</span></div>` +
          `<div><span class="label">Survived</span><span class="value">${mins}:${secs.toString().padStart(2, "0")}</span></div>` +
          `<div><span class="label">Kills</span><span class="value">${stats.kills}</span></div>` +
          `<div><span class="label">Best</span><span class="value">${Math.floor(stats.best).toLocaleString()}</span></div>`,
      ),
    );
    const rank = this.el("div", "rank-line", "");
    rank.id = "rank-line";
    screen.appendChild(rank);

    screen.appendChild(this.button("Fly again", true, () => this.cb.onRestart()));
    screen.appendChild(this.button("Main menu", false, () => this.cb.onQuitToMenu()));
    this.root.appendChild(screen);
  }

  /** Fill the game-over rank line once the score submission returns. */
  setGameOverRank(html: string): void {
    const line = document.getElementById("rank-line");
    if (line) line.innerHTML = html;
  }
}
