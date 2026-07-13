// Community screens: sign-in, world leaderboard, private arenas.
// Rendered into the same #ui overlay as the menu screens.

import {
  Api,
  ApiError,
  type BoardMode,
  type FriendActivityEntry,
  type FriendRequest,
  type LeaderboardEntry,
  type PlayerProfile,
} from "./api";
import { BADGES, TIER_LABEL, type BadgeProgressStats } from "./badges";
import { COUNTRIES, countryFlag, countryName, guessCountry } from "./countries";
import { dailyResetLabel } from "./ui";

const BOARD_MODE_KEY = "orion.boardMode";

/**
 * Board display names. Runs are tagged by the platform they were played on:
 * desktop keyboard, phone touch stick, or phone tilt. Inertia is a flavor
 * setting and doesn't affect where a run ranks.
 */
const BOARD_MODES: BoardMode[] = ["desktop", "touch", "tilt"];
const MODE_LABEL: Record<BoardMode, string> = {
  desktop: "Desktop",
  touch: "Phone",
  tilt: "Tilt",
};
const MODE_TAB_LABEL: Record<BoardMode, string> = {
  desktop: "Desktop",
  touch: "Phone",
  tilt: "Phone tilt",
};

const isTouchDevice = (): boolean => "ontouchstart" in window || navigator.maxTouchPoints > 0;

/** Last-viewed leaderboard tab; defaults to where your own runs score. */
function loadBoardMode(): BoardMode {
  const saved = localStorage.getItem(BOARD_MODE_KEY);
  if (saved && (BOARD_MODES as string[]).includes(saved)) return saved as BoardMode;
  return isTouchDevice() ? "touch" : "desktop";
}

type Google = {
  accounts: {
    id: {
      initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void }): void;
      renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
    };
  };
};

export class CommunityUi {
  private boardMode: BoardMode = loadBoardMode();

  /** Back action of the community screen currently showing (null = none). */
  private backAction: (() => void) | null = null;
  /** The screen element we last rendered (stale-check for popstate). */
  private currentScreen: HTMLElement | null = null;
  /** 1 while our sentinel history entry is pushed (system back support). */
  private navDepth = 0;

  constructor(
    private root: HTMLElement,
    private api: Api,
    private onBack: () => void,
    private onAuthChange: () => void,
  ) {
    // System back (Android gesture / browser back) navigates community
    // screens instead of leaving the app — vital in the fullscreen PWA.
    window.addEventListener("popstate", () => {
      if (this.navDepth === 0) return;
      this.navDepth = 0;
      const act = this.backAction;
      this.backAction = null;
      // the player may have left for the menu or a run since we pushed —
      // only navigate if our screen is still the one on display
      if (act && this.currentScreen && this.root.contains(this.currentScreen)) act();
    });
  }

  /** Route back through history when our sentinel is pushed (keeps it balanced). */
  private goBack(): void {
    if (this.navDepth > 0) history.back();
    else this.backAction?.();
  }

  /** Desktop / Phone / Phone tilt leaderboard tabs — each platform ranks separately. */
  private modeTabs(onChange: () => void): HTMLElement {
    const row = this.el("div", "tabs");
    const tabs = BOARD_MODES.map((mode) => {
      const b = this.button(MODE_TAB_LABEL[mode], false, () => {
        this.boardMode = mode;
        localStorage.setItem(BOARD_MODE_KEY, mode);
        paint();
        onChange();
      });
      return { mode, b };
    });
    const paint = (): void => {
      for (const { mode, b } of tabs) b.classList.toggle("active", this.boardMode === mode);
    };
    paint();
    row.append(...tabs.map((t) => t.b));
    return row;
  }

  // --- tiny DOM helpers ---

  private el(tag: string, className = "", html = ""): HTMLElement {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html) e.innerHTML = html;
    return e;
  }

  private button(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.textContent = label;
    if (primary) b.className = "primary";
    b.addEventListener("click", onClick);
    return b;
  }

  private input(placeholder: string, type = "text"): HTMLInputElement {
    const i = document.createElement("input");
    i.className = "field";
    i.placeholder = placeholder;
    i.type = type;
    return i;
  }

  private countrySelect(selected: string): HTMLSelectElement {
    const s = document.createElement("select");
    s.className = "field";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "🌐 No country / prefer not to say";
    s.appendChild(none);
    for (const [code, name] of COUNTRIES) {
      const o = document.createElement("option");
      o.value = code;
      o.textContent = `${countryFlag(code)} ${name}`;
      if (code === selected) o.selected = true;
      s.appendChild(o);
    }
    return s;
  }

  /**
   * Community screen scaffold. `onBack` (default: the menu) gets an
   * always-visible corner arrow — the bottom Back row can scroll below the
   * fold on phones. Pass null for mid-flow screens with no back.
   */
  private screen(
    title: string,
    onBack: (() => void) | null = this.onBack,
  ): { screen: HTMLElement; body: HTMLElement; error: HTMLElement } {
    this.root.innerHTML = "";
    const screen = this.el("div", "screen");
    if (onBack) {
      const b = this.el("button", "corner-btn left", "←");
      b.title = "Back";
      b.addEventListener("click", () => this.goBack());
      screen.appendChild(b);
    }
    screen.appendChild(this.el("div", "heading gold small", title));
    screen.appendChild(this.el("div", "divider"));
    const body = this.el("div", "panel");
    screen.appendChild(body);
    const error = this.el("div", "form-error");
    screen.appendChild(error);
    this.root.appendChild(screen);

    this.currentScreen = screen;
    this.backAction = onBack;
    if (onBack && this.navDepth === 0) {
      history.pushState({ orion: "community" }, "");
      this.navDepth = 1;
    }
    return { screen, body, error };
  }

  /** Bottom Back button; uses the back action given to screen(). */
  private backRow(screen: HTMLElement): void {
    const b = this.button("Back", false, () => this.goBack());
    b.classList.add("small-btn");
    screen.appendChild(b);
  }

  private async guard<T>(error: HTMLElement, fn: () => Promise<T>): Promise<T | null> {
    error.textContent = "";
    try {
      return await fn();
    } catch (e) {
      error.textContent = e instanceof ApiError ? e.message : "something went wrong";
      return null;
    }
  }

  // --- auth ---

  showAuth(onDone: () => void): void {
    const { screen, body, error } = this.screen("PILOT LOGIN");
    body.appendChild(
      this.el("div", "field-hint center", "Enter the ranks. Your scores join the leaderboard."),
    );

    const hasGoogle = Boolean(this.api.googleClientId);

    // Primary path: Google's native button (one tap, no passwords, no redirects)
    if (hasGoogle) {
      const gwrap = this.el("div", "google-wrap hero");
      body.appendChild(gwrap);
      void this.mountGoogleButton(gwrap, error, onDone);
      body.appendChild(this.el("div", "field-hint center", "One tap, takes 5 seconds"));
    }

    // Callsign/password path — collapsed behind a link when Google is the primary path.
    const legacy = this.el("div", "legacy-auth");
    body.appendChild(legacy);

    let mode: "login" | "register" = "login";
    const tabs = this.el("div", "tabs");
    const form = this.el("div", "form");
    const tabLogin = this.button("Sign in", false, () => switchMode("login"));
    const tabRegister = this.button("New pilot", false, () => switchMode("register"));
    tabs.append(tabLogin, tabRegister);
    legacy.append(tabs, form);

    if (hasGoogle) {
      legacy.style.display = "none";
      const reveal = this.el(
        "button",
        "legacy-auth-link",
        "Prefer a callsign &amp; password? Sign in the old way",
      );
      reveal.addEventListener("click", () => {
        legacy.style.display = "";
        reveal.remove();
      });
      body.appendChild(reveal);
    }

    const renderForm = (): void => {
      form.innerHTML = "";
      const callsign = this.input("Callsign");
      const password = this.input("Password", "password");
      form.append(callsign, password);

      let country: HTMLSelectElement | null = null;
      if (mode === "register") {
        const guess = guessCountry();
        country = this.countrySelect(guess);
        const label = this.el(
          "div",
          "field-hint",
          guess
            ? `We guessed your country. Change it if we got it wrong.`
            : `Pick your country to appear in its leaderboard.`,
        );
        form.append(country, label);
      }

      form.appendChild(
        this.button(mode === "login" ? "Sign in" : "Create pilot", true, () => {
          void this.guard(error, async () => {
            if (mode === "login") await this.api.login(callsign.value, password.value);
            else await this.api.register(callsign.value, password.value, country?.value ?? "");
            this.onAuthChange();
            onDone();
          });
        }),
      );
    };

    const switchMode = (m: "login" | "register"): void => {
      mode = m;
      tabLogin.classList.toggle("active", m === "login");
      tabRegister.classList.toggle("active", m === "register");
      renderForm();
    };

    switchMode("login");
    this.backRow(screen);
  }

  private googleLoaded: Promise<Google | null> | null = null;

  private loadGoogle(): Promise<Google | null> {
    this.googleLoaded ??= new Promise((resolve) => {
      const existing = (window as unknown as { google?: Google }).google;
      if (existing) return resolve(existing);
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve((window as unknown as { google?: Google }).google ?? null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
    return this.googleLoaded;
  }

  private async mountGoogleButton(
    wrap: HTMLElement,
    error: HTMLElement,
    onDone: () => void,
  ): Promise<void> {
    const google = await this.loadGoogle();
    if (!google) {
      wrap.textContent = "Google sign-in unavailable";
      wrap.className = "field-hint";
      return;
    }
    google.accounts.id.initialize({
      client_id: this.api.googleClientId,
      callback: (resp) => {
        void this.guard(error, async () => {
          const isNew = await this.api.googleSignIn(resp.credential, guessCountry());
          this.onAuthChange();
          // Google gives us no reliable location: confirm country for new pilots
          if (isNew) this.showConfirmCountry(onDone);
          else onDone();
        });
      },
    });
    google.accounts.id.renderButton(wrap, {
      theme: "filled_black",
      size: "large",
      shape: "pill",
      width: 300,
    });
  }

  /** Post-signup step: confirm the guessed country (all-cases geo). */
  showConfirmCountry(onDone: () => void): void {
    const { screen, body, error } = this.screen("WHERE DO YOU FLY FROM?", null);
    body.appendChild(
      this.el("div", "field-hint", "Your country places you in its arena leaderboard. You can change it anytime."),
    );
    const select = this.countrySelect(this.api.user?.country || guessCountry());
    body.appendChild(select);
    body.appendChild(
      this.button("Confirm", true, () => {
        void this.guard(error, async () => {
          await this.api.updateProfile({ country: select.value });
          this.onAuthChange();
          onDone();
        });
      }),
    );
    const skip = this.button("Skip", false, onDone);
    skip.classList.add("small-btn");
    screen.appendChild(skip);
  }

  /** Profile: change callsign/country, badge collection, sign out. */
  showProfile(): void {
    const user = this.api.user;
    if (!user) return this.showAuth(() => this.onBack());
    const { screen, body, error } = this.screen("PILOT PROFILE");

    const callsign = this.input("Callsign");
    callsign.value = user.callsign;
    const select = this.countrySelect(user.country);
    body.append(callsign, select);
    body.appendChild(
      this.button("Save", true, () => {
        void this.guard(error, async () => {
          await this.api.updateProfile({ callsign: callsign.value, country: select.value });
          this.onAuthChange();
          this.onBack();
        });
      }),
    );

    // guest / Google accounts: offer a password so the callsign works anywhere
    if (!this.api.hasPassword) {
      const panel = this.el("div", "panel");
      panel.appendChild(
        this.el(
          "div",
          "field-hint",
          "Set a password to sign in with your callsign on other devices.",
        ),
      );
      const password = this.input("New password", "password");
      panel.appendChild(password);
      panel.appendChild(
        this.button("Set password", false, () => {
          void this.guard(error, async () => {
            await this.api.updateProfile({ password: password.value });
            panel.replaceChildren(
              this.el("div", "field-hint", "Password set. You can sign in anywhere now."),
            );
          });
        }),
      );
      body.appendChild(panel);
    }

    // service record + badge collection (locked ones show how to earn them)
    const record = this.el("div", "panel");
    body.appendChild(record);
    void this.guard(error, async () => {
      const p = await this.api.playerProfile(user.callsign);
      record.appendChild(this.statsRow(p));
      const graph = this.historyGraph(p);
      if (graph) record.appendChild(graph);
      record.appendChild(this.badgeGrid(p.badges, true, p));
    });

    body.appendChild(
      this.button("Sign out", false, () => {
        void this.api.logout().then(() => {
          this.onAuthChange();
          this.onBack();
        });
      }),
    );
    this.backRow(screen);
  }

  /** Public pilot profile, opened from any leaderboard row (with friend actions). */
  showPilot(callsign: string, onBack: () => void): void {
    const { screen, body, error } = this.screen("PILOT RECORD", onBack);
    body.appendChild(this.el("div", "field-hint", "Loading…"));
    void this.guard(error, async () => {
      const p = await this.api.playerProfile(callsign);
      body.innerHTML = "";
      body.appendChild(
        this.el(
          "div",
          "pilot-title",
          `${p.country ? countryFlag(p.country) + " " : ""}<b>${escapeHtml(p.callsign)}</b>`,
        ),
      );
      const action = this.friendAction(p, error, () => this.showPilot(callsign, onBack));
      if (action) body.appendChild(action);
      body.appendChild(this.statsRow(p));
      const graph = this.historyGraph(p);
      if (graph) body.appendChild(graph);
      body.appendChild(this.badgeGrid(p.badges, false));
    });
    this.backRow(screen);
  }

  private statsRow(p: PlayerProfile): HTMLElement {
    const cells: Array<[string, string]> = [
      ...BOARD_MODES.map(
        (m): [string, string] => [`Best (${MODE_LABEL[m]})`, p.best[m].toLocaleString()],
      ),
      ...BOARD_MODES.map(
        (m): [string, string] => [
          `World rank (${MODE_LABEL[m]})`,
          p.rank?.[m] ? `#${p.rank[m]}` : "0",
        ],
      ),
      ["Runs", p.runs.toLocaleString()],
      ["Kills", p.totalKills.toLocaleString()],
      ["Longest run", fmtDuration(p.bestTime)],
      ["Time in the swarm", fmtDuration(p.totalTime)],
      [
        "Enlisted",
        p.joinedAt
          ? new Date(p.joinedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })
          : "0",
      ],
    ];
    return this.el(
      "div",
      "stats pilot-stats",
      cells
        .filter(([, v]) => v !== "0" && v !== "0:00")
        .map(([k, v]) => `<div><span class="label">${k}</span><span class="value">${v}</span></div>`)
        .join(""),
    );
  }

  /** Score-over-time sparkline of the last ~40 ranked runs. */
  private historyGraph(p: PlayerProfile): HTMLElement | null {
    const h = p.history ?? [];
    if (h.length < 2) return null;
    const max = Math.max(...h.map((r) => r.score), 1);
    const W = 100;
    const H = 30;
    const pts = h
      .map((r, i) => {
        const x = (i / (h.length - 1)) * W;
        const y = H - 2 - (r.score / max) * (H - 6);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const wrap = this.el("div", "history-graph");
    wrap.appendChild(this.el("div", "manual-title", `LAST ${h.length} RUNS`));
    wrap.appendChild(
      this.el(
        "div",
        "history-svg",
        `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
          `<polyline points="${pts}" fill="none" stroke="#ffd700" stroke-width="1" ` +
          `stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/></svg>`,
      ),
    );
    wrap.appendChild(
      this.el(
        "div",
        "field-hint center",
        `peak <b>${max.toLocaleString()}</b> · latest <b>${h[h.length - 1].score.toLocaleString()}</b>`,
      ),
    );
    return wrap;
  }

  /** Add friend / accept / cancel / unfriend button for a viewed pilot. */
  private friendAction(p: PlayerProfile, error: HTMLElement, rerender: () => void): HTMLElement | null {
    if (!this.api.signedIn || p.friendship === null) return null;
    const wrap = this.el("div", "friend-action");
    const act = (fn: () => Promise<unknown>): void => {
      void this.guard(error, async () => {
        await fn();
        rerender();
      });
    };
    switch (p.friendship) {
      case "none":
        wrap.appendChild(
          this.button("✦ Add wingmate", true, () => act(() => this.api.requestFriend(p.callsign))),
        );
        break;
      case "outgoing": {
        wrap.appendChild(this.el("div", "field-hint center", "Wingmate request sent."));
        const cancel = this.button("Cancel request", false, () =>
          act(() => this.api.removeFriend(p.callsign)),
        );
        cancel.classList.add("small-btn");
        wrap.appendChild(cancel);
        break;
      }
      case "incoming":
        wrap.appendChild(
          this.button("✦ Accept wingmate request", true, () =>
            act(() => this.api.acceptFriend(p.callsign)),
          ),
        );
        break;
      case "friends": {
        wrap.appendChild(this.el("div", "field-hint center", "✦ Your wingmate"));
        const remove = this.button("Remove wingmate", false, () =>
          act(() => this.api.removeFriend(p.callsign)),
        );
        remove.classList.add("small-btn");
        wrap.appendChild(remove);
        break;
      }
    }
    return wrap;
  }

  /** Badge collection: earned bright; locked dimmed (with hints on own profile). */
  private badgeGrid(
    earned: Array<{ id: string; earnedAt: number }>,
    showLocked: boolean,
    stats?: BadgeProgressStats,
  ): HTMLElement {
    const earnedIds = new Set(earned.map((b) => b.id));
    const wrap = this.el("div", "badge-wrap");
    wrap.appendChild(
      this.el("div", "manual-title", `BADGES · ${earnedIds.size} / ${BADGES.length}`),
    );
    const grid = this.el("div", "badge-grid");
    const detail = this.el("div", "field-hint center badge-detail", "Tap a badge for details.");
    for (const b of BADGES) {
      const has = earnedIds.has(b.id);
      if (!has && !showLocked) continue;
      // live progress toward locked, countable badges ("47 / 100 runs")
      const progress = !has && stats && b.progress ? b.progress(stats) : null;
      const cell = this.el(
        "div",
        `badge${has ? "" : " locked"}`,
        `<span class="badge-icon">${has ? b.icon : "❔"}</span>` +
          `<span class="badge-name">${has ? b.name : "???"}</span>` +
          (progress
            ? `<span class="badge-progress">${progress.label}</span>`
            : `<span class="badge-tier">${TIER_LABEL[b.tier]}</span>`),
      );
      cell.title = has ? `${b.name}: ${b.desc}` : `Locked: ${b.desc}`;
      cell.addEventListener("click", () => {
        detail.innerHTML = has
          ? `${b.icon} <b>${b.name}</b> · ${b.desc}`
          : `❔ <b>Locked</b> · ${b.desc}` +
            (progress ? ` <b>(${progress.label})</b>` : "");
      });
      grid.appendChild(cell);
    }
    if (!showLocked && earnedIds.size === 0) {
      grid.appendChild(this.el("div", "field-hint", "No badges yet."));
    }
    wrap.appendChild(grid);
    wrap.appendChild(detail);
    return wrap;
  }

  // --- leaderboard (world board; screen was once called "World Arena") ---

  /** Leaderboard scope: all-time bests or today's Daily Patrol. */
  private boardScope: "alltime" | "daily" = "alltime";

  showWorldArena(): void {
    const { screen, body, error } = this.screen("LEADERBOARD");

    const filter = this.countrySelect("");
    (filter.firstChild as HTMLOptionElement).textContent = "🌐 All countries";
    const table = this.el("div", "board");
    const dailyHint = this.el(
      "div",
      "field-hint center",
      `Daily Patrol: everyone flies the same swarm today. New board at ${dailyResetLabel()} your time (UTC midnight).`,
    );

    const load = (): void => {
      const daily = this.boardScope === "daily";
      filter.style.display = daily ? "none" : "";
      dailyHint.style.display = daily ? "" : "none";
      table.innerHTML = `<div class="field-hint">Loading…</div>`;
      void this.guard(error, async () => {
        const data = daily
          ? await this.api.dailyLeaderboard(this.boardMode)
          : await this.api.worldLeaderboard(filter.value || undefined, this.boardMode);
        this.renderBoard(table, data.entries, data.me, () => this.showWorldArena());
        if (daily && data.entries.length === 0) {
          table.innerHTML = `<div class="field-hint">No patrols flown yet today. Be the first!</div>`;
        }
      });
    };

    // All-time / Today scope tabs
    const scopeRow = this.el("div", "tabs");
    const scopes: Array<["alltime" | "daily", string]> = [
      ["alltime", "All-time"],
      ["daily", "Daily Patrol"],
    ];
    const scopeTabs = scopes.map(([scope, label]) => {
      const b = this.button(label, false, () => {
        this.boardScope = scope;
        paintScopes();
        load();
      });
      return { scope, b };
    });
    const paintScopes = (): void => {
      for (const { scope, b } of scopeTabs) b.classList.toggle("active", this.boardScope === scope);
    };
    paintScopes();
    scopeRow.append(...scopeTabs.map((t) => t.b));

    body.append(scopeRow, this.modeTabs(load), filter, dailyHint, table);
    filter.addEventListener("change", load);
    load();

    if (!this.api.signedIn) {
      body.appendChild(
        this.button("Sign in to compete", true, () => this.showAuth(() => this.showWorldArena())),
      );
    }
    this.backRow(screen);
  }

  private renderBoard(
    table: HTMLElement,
    entries: LeaderboardEntry[],
    me: { rank: number; best: number } | null,
    backTo: () => void,
  ): void {
    table.innerHTML = "";
    if (entries.length === 0) {
      table.appendChild(this.el("div", "field-hint", "No scores yet. Be the first!"));
      return;
    }
    entries.forEach((e, i) => {
      const isMe = this.api.user?.callsign === e.callsign;
      const row = this.el(
        "div",
        `board-row link${isMe ? " me" : ""}`,
        `<span class="rank">${i + 1}</span>` +
          `<span class="flag" title="${countryName(e.country)}">${e.country ? countryFlag(e.country) : "·"}</span>` +
          `<span class="name">${escapeHtml(e.callsign)}</span>` +
          `<span class="pts">${e.best.toLocaleString()}</span>`,
      );
      row.addEventListener("click", () => this.showPilot(e.callsign, backTo));
      table.appendChild(row);
    });
    if (me && me.rank > entries.length) {
      table.appendChild(
        this.el(
          "div",
          "board-row me",
          `<span class="rank">${me.rank}</span><span class="flag"></span>` +
            `<span class="name">${escapeHtml(this.api.user?.callsign ?? "you")}</span>` +
            `<span class="pts">${me.best.toLocaleString()}</span>`,
        ),
      );
    }
  }

  // --- friends ---

  showFriends(): void {
    if (!this.api.signedIn) return this.showAuth(() => this.showFriends());
    const { screen, body, error } = this.screen("WINGMATES");

    body.appendChild(
      this.el("div", "field-hint center", "Add pilots by callsign to race their best runs and see their latest flights."),
    );

    const addInput = this.input("Pilot callsign");
    const addBtn = this.button("Add", true, () => {
      const callsign = addInput.value.trim();
      if (!callsign) return;
      void this.guard(error, async () => {
        const r = await this.api.requestFriend(callsign);
        addInput.value = "";
        note.textContent =
          r.status === "accepted"
            ? `You and ${callsign} are now wingmates!`
            : `Request sent. ${callsign} can accept it from their Wingmates screen.`;
        refresh();
      });
    });
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addBtn.click();
    });
    const rowAdd = this.el("div", "form-row");
    rowAdd.append(addInput, addBtn);
    const note = this.el("div", "field-hint center");
    body.append(rowAdd, note);

    const requests = this.el("div", "friend-requests");
    const boardTitle = this.el("div", "manual-title", "SQUADRON BOARD");
    const table = this.el("div", "board");
    const activityTitle = this.el("div", "manual-title", "RECENT FLIGHTS");
    const activityList = this.el("div", "board");

    const loadBoard = (): void => {
      table.innerHTML = `<div class="field-hint">Loading…</div>`;
      void this.guard(error, async () => {
        const [board, mine] = await Promise.all([
          this.api.friendsLeaderboard(this.boardMode),
          this.api.myFriends(),
        ]);
        this.renderBoard(table, board.entries, null, () => this.showFriends());
        if (mine.friends.length === 0 && board.entries.length <= 1) {
          table.innerHTML = `<div class="field-hint">No wingmates yet. Add a pilot above, or meet them on the leaderboard.</div>`;
          return;
        }
        // friends with no ranked run in this mode still deserve a row
        const ranked = new Set(board.entries.map((e) => e.callsign));
        for (const f of mine.friends) {
          if (ranked.has(f.callsign)) continue;
          const row = this.el(
            "div",
            "board-row link dim-row",
            `<span class="rank">–</span>` +
              `<span class="flag">${f.country ? countryFlag(f.country) : "·"}</span>` +
              `<span class="name">${escapeHtml(f.callsign)}</span>` +
              `<span class="pts dim">no ${MODE_LABEL[this.boardMode]} runs</span>`,
          );
          row.addEventListener("click", () => this.showPilot(f.callsign, () => this.showFriends()));
          table.appendChild(row);
        }
      });
    };
    const tabs = this.modeTabs(loadBoard);

    const refresh = (): void => {
      loadBoard();
      void this.guard(error, async () => {
        const [mine, act] = await Promise.all([this.api.myFriends(), this.api.friendActivity()]);
        this.renderFriendRequests(requests, mine.incoming, mine.outgoing, error, refresh);
        this.renderActivity(activityList, act.activity);
      });
    };

    body.append(requests, boardTitle, tabs, table, activityTitle, activityList);
    refresh();
    this.backRow(screen);
  }

  private renderFriendRequests(
    wrap: HTMLElement,
    incoming: FriendRequest[],
    outgoing: FriendRequest[],
    error: HTMLElement,
    refresh: () => void,
  ): void {
    wrap.innerHTML = "";
    if (incoming.length === 0 && outgoing.length === 0) return;
    wrap.appendChild(this.el("div", "manual-title", "REQUESTS"));
    for (const r of incoming) {
      const row = this.el(
        "div",
        "board-row",
        `<span class="flag">${r.country ? countryFlag(r.country) : "·"}</span>` +
          `<span class="name">${escapeHtml(r.callsign)}</span>`,
      );
      const actions = this.el("span", "row-actions");
      const accept = this.button("Accept", true, () => {
        void this.guard(error, async () => {
          await this.api.acceptFriend(r.callsign);
          refresh();
        });
      });
      const decline = this.button("Decline", false, () => {
        void this.guard(error, async () => {
          await this.api.removeFriend(r.callsign);
          refresh();
        });
      });
      actions.append(accept, decline);
      row.appendChild(actions);
      wrap.appendChild(row);
    }
    for (const r of outgoing) {
      const row = this.el(
        "div",
        "board-row",
        `<span class="flag">${r.country ? countryFlag(r.country) : "·"}</span>` +
          `<span class="name">${escapeHtml(r.callsign)}</span>` +
          `<span class="pts dim">pending</span>`,
      );
      const actions = this.el("span", "row-actions");
      actions.appendChild(
        this.button("Cancel", false, () => {
          void this.guard(error, async () => {
            await this.api.removeFriend(r.callsign);
            refresh();
          });
        }),
      );
      row.appendChild(actions);
      wrap.appendChild(row);
    }
  }

  private renderActivity(wrap: HTMLElement, activity: FriendActivityEntry[]): void {
    wrap.innerHTML = "";
    if (activity.length === 0) {
      wrap.appendChild(this.el("div", "field-hint", "No flights from your wingmates yet."));
      return;
    }
    for (const a of activity) {
      const row = this.el(
        "div",
        "board-row link",
        `<span class="flag">${a.country ? countryFlag(a.country) : "·"}</span>` +
          `<span class="name">${escapeHtml(a.callsign)}</span>` +
          `<span class="pts">${a.score.toLocaleString()}</span>` +
          `<span class="pts dim">${fmtDuration(a.timeSurvived)} · ${timeAgo(a.createdAt)}</span>`,
      );
      row.addEventListener("click", () => this.showPilot(a.callsign, () => this.showFriends()));
      wrap.appendChild(row);
    }
  }

  // --- private arenas ---

  showArenas(): void {
    if (!this.api.signedIn) return this.showAuth(() => this.showArenas());
    const { screen, body, error } = this.screen("ARENAS");

    body.appendChild(
      this.el("div", "field-hint", "Create a private arena and share its code with friends. Everyone's best run counts."),
    );

    const list = this.el("div", "board");
    body.appendChild(list);
    list.innerHTML = `<div class="field-hint">Loading…</div>`;
    void this.guard(error, async () => {
      const { arenas } = await this.api.myArenas();
      list.innerHTML = "";
      if (arenas.length === 0) {
        list.appendChild(this.el("div", "field-hint", "You're not in any arena yet."));
      }
      for (const a of arenas) {
        const row = this.el(
          "div",
          "board-row link",
          `<span class="name">${escapeHtml(a.name)}</span>` +
            `<span class="flag">${a.members} pilot${a.members === 1 ? "" : "s"}</span>` +
            `<span class="pts mono">${a.code}</span>`,
        );
        row.addEventListener("click", () => this.showArenaBoard(a.code));
        list.appendChild(row);
      }
    });

    const createName = this.input("New arena name");
    const createBtn = this.button("Create", true, () => {
      void this.guard(error, async () => {
        const { arena } = await this.api.createArena(createName.value);
        this.showArenaBoard(arena.code);
      });
    });
    const joinCode = this.input("Invite code");
    joinCode.maxLength = 6;
    const joinBtn = this.button("Join", false, () => {
      void this.guard(error, async () => {
        const { arena } = await this.api.joinArena(joinCode.value);
        this.showArenaBoard(arena.code);
      });
    });

    const rowCreate = this.el("div", "form-row");
    rowCreate.append(createName, createBtn);
    const rowJoin = this.el("div", "form-row");
    rowJoin.append(joinCode, joinBtn);
    body.append(rowCreate, rowJoin);

    this.backRow(screen);
  }

  showArenaBoard(code: string): void {
    const { screen, body, error } = this.screen("ARENA", () => this.showArenas());
    const heading = screen.querySelector(".heading")!;
    const table = this.el("div", "board");
    body.appendChild(
      this.el("div", "field-hint", `Invite code: <b class="mono">${escapeHtml(code.toUpperCase())}</b>. Share it with friends.`),
    );

    const load = (): void => {
      table.innerHTML = `<div class="field-hint">Loading…</div>`;
      void this.guard(error, async () => {
        const data = await this.api.arenaLeaderboard(code, this.boardMode);
        heading.textContent = data.arena.name.toUpperCase();
        this.renderBoard(table, data.entries, data.me, () => this.showArenaBoard(code));
      });
    };
    body.append(this.modeTabs(load), table);
    load();
    this.backRow(screen);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** "3:41" under an hour, "2h 15m" above. */
function fmtDuration(s: number): string {
  return s >= 3600
    ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    : `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
