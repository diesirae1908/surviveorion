// Community screens: sign-in, World Arena leaderboard, private arenas.
// Rendered into the same #ui overlay as the menu screens.

import { Api, ApiError, type BoardMode, type LeaderboardEntry, type PlayerProfile } from "./api";
import { BADGES, TIER_LABEL } from "./badges";
import { COUNTRIES, countryFlag, countryName, guessCountry } from "./countries";

const BOARD_MODE_KEY = "orion.boardMode";
/** Set while a Clerk sign-in is in flight; survives the OAuth full-page redirect. */
const CLERK_PENDING_KEY = "orion.clerkPending";

/** Last-viewed leaderboard tab; phones default to Tilt (their native mode). */
function loadBoardMode(): BoardMode {
  const saved = localStorage.getItem(BOARD_MODE_KEY);
  if (saved === "classic" || saved === "tilt") return saved;
  return "ontouchstart" in window ? "tilt" : "classic";
}

type Google = {
  accounts: {
    id: {
      initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void }): void;
      renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
    };
  };
};

type Clerk = {
  load(opts?: Record<string, unknown>): Promise<void>;
  loaded: boolean;
  user: unknown;
  session: { getToken(): Promise<string | null> } | null;
  openSignIn(opts?: Record<string, unknown>): void;
  closeSignIn(): void;
  addListener(cb: (state: { user: unknown; session: unknown }) => void): void;
  signOut(): Promise<void>;
};

/** Clerk modal styled to match the game's dark/gold palette (see style.css). */
const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "#ffd700",
    colorTextOnPrimaryBackground: "#0a0a12",
    colorBackground: "#12121e",
    colorText: "#ffee88",
    colorTextSecondary: "#c9b26a",
    colorInputBackground: "#1a1a2a",
    colorInputText: "#ffee88",
    colorNeutral: "#ffee88",
    colorDanger: "#ff4455",
    fontFamily: 'Georgia, "Times New Roman", serif',
    borderRadius: "4px",
  },
  layout: {
    unsafe_disableDevelopmentModeWarnings: true,
  },
};

export class CommunityUi {
  private boardMode: BoardMode = loadBoardMode();

  constructor(
    private root: HTMLElement,
    private api: Api,
    private onBack: () => void,
    private onAuthChange: () => void,
  ) {}

  /** Classic / Tilt leaderboard tabs — the two control schemes rank separately. */
  private modeTabs(onChange: () => void): HTMLElement {
    const row = this.el("div", "tabs");
    const mk = (mode: BoardMode, label: string): HTMLButtonElement =>
      this.button(label, false, () => {
        this.boardMode = mode;
        localStorage.setItem(BOARD_MODE_KEY, mode);
        paint();
        onChange();
      });
    const classic = mk("classic", "Classic");
    const tilt = mk("tilt", "Tilt");
    const paint = (): void => {
      classic.classList.toggle("active", this.boardMode === "classic");
      tilt.classList.toggle("active", this.boardMode === "tilt");
    };
    paint();
    row.append(classic, tilt);
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

  private screen(title: string): { screen: HTMLElement; body: HTMLElement; error: HTMLElement } {
    this.root.innerHTML = "";
    const screen = this.el("div", "screen");
    screen.appendChild(this.el("div", "heading gold small", title));
    screen.appendChild(this.el("div", "divider"));
    const body = this.el("div", "panel");
    screen.appendChild(body);
    const error = this.el("div", "form-error");
    screen.appendChild(error);
    this.root.appendChild(screen);
    return { screen, body, error };
  }

  private backRow(screen: HTMLElement, onBack = this.onBack): void {
    const b = this.button("Back", false, onBack);
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
      this.el("div", "field-hint center", "Enter the ranks — your scores join the World Arena."),
    );

    const hasClerk = Boolean(this.api.clerkPublishableKey);

    // Primary path: Clerk (email code or Google, no password to remember)
    if (hasClerk) {
      const cbtn = this.button("✦ Sign in / Create account", true, () => {
        void this.guard(error, () => this.clerkSignIn(onDone));
      });
      cbtn.classList.add("enlist-btn");
      body.appendChild(cbtn);
      body.appendChild(this.el("div", "field-hint center", "Email or Google — takes 10 seconds"));
    }

    // Legacy callsign/password path — collapsed behind a link when Clerk is the primary path.
    const legacy = this.el("div", "legacy-auth");
    body.appendChild(legacy);

    let mode: "login" | "register" = "login";
    const tabs = this.el("div", "tabs");
    const form = this.el("div", "form");
    const tabLogin = this.button("Sign in", false, () => switchMode("login"));
    const tabRegister = this.button("New pilot", false, () => switchMode("register"));
    tabs.append(tabLogin, tabRegister);
    legacy.append(tabs, form);

    if (hasClerk) {
      legacy.style.display = "none";
      const reveal = this.el(
        "button",
        "legacy-auth-link",
        "Have a callsign &amp; password? Sign in the old way",
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
            ? `We guessed your country — change it if we got it wrong.`
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

      // Google sign-in (only when the server has a client id configured)
      if (this.api.googleClientId) {
        const gwrap = this.el("div", "google-wrap");
        form.appendChild(gwrap);
        void this.mountGoogleButton(gwrap, error, onDone);
      }
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

  // --- Clerk ---

  private clerkLoaded: Promise<Clerk | null> | null = null;

  /** Load clerk-js from the instance's Frontend API (domain encoded in the pk). */
  private loadClerk(): Promise<Clerk | null> {
    this.clerkLoaded ??= new Promise((resolve) => {
      const w = window as unknown as { Clerk?: Clerk };
      if (w.Clerk) return resolve(w.Clerk);
      const pk = this.api.clerkPublishableKey;
      let frontendApi = "";
      try {
        frontendApi = atob(pk.replace(/^pk_(test|live)_/, "")).replace(/\$$/, "");
      } catch {
        return resolve(null);
      }
      const s = document.createElement("script");
      s.src = `https://${frontendApi}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.setAttribute("data-clerk-publishable-key", pk);
      s.onload = async () => {
        const clerk = (window as unknown as { Clerk?: Clerk }).Clerk ?? null;
        if (!clerk) return resolve(null);
        try {
          await clerk.load({ appearance: CLERK_APPEARANCE });
          resolve(clerk);
        } catch {
          resolve(null);
        }
      };
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
    return this.clerkLoaded;
  }

  /** Open the Clerk modal; once a session exists, exchange its JWT for an Orion session. */
  private async clerkSignIn(onDone: () => void): Promise<void> {
    const clerk = await this.loadClerk();
    if (!clerk) throw new ApiError("Clerk failed to load — check your connection", 0);

    const finish = async (): Promise<boolean> => {
      const jwt = await clerk.session?.getToken();
      if (!jwt) return false;
      const isNew = await this.api.clerkSignIn(jwt, guessCountry());
      localStorage.removeItem(CLERK_PENDING_KEY);
      clerk.closeSignIn();
      this.onAuthChange();
      if (isNew) this.showConfirmCountry(onDone);
      else onDone();
      return true;
    };

    // Already signed in to Clerk from a previous visit: reuse the session.
    if (await finish()) return;

    // OAuth (Google) does a full-page redirect, losing this JS context; the
    // flag lets resumeClerkSignIn() pick the flow back up after the reload.
    localStorage.setItem(CLERK_PENDING_KEY, "1");
    let handled = false;
    clerk.addListener((state) => {
      if (handled || !state.session) return;
      handled = true;
      void finish();
    });
    clerk.openSignIn({});
  }

  /**
   * Complete a Clerk sign-in interrupted by an OAuth redirect: if the previous
   * page load opened the Clerk modal and we now have a Clerk session, exchange
   * it for an Orion session without the player having to click anything.
   */
  async resumeClerkSignIn(): Promise<"none" | "signedIn" | "newPilot"> {
    if (!this.api.clerkPublishableKey || this.api.signedIn) {
      localStorage.removeItem(CLERK_PENDING_KEY);
      return "none";
    }
    if (localStorage.getItem(CLERK_PENDING_KEY) !== "1") return "none";
    localStorage.removeItem(CLERK_PENDING_KEY);
    const clerk = await this.loadClerk();
    const jwt = await clerk?.session?.getToken();
    if (!clerk || !jwt) return "none";
    try {
      const isNew = await this.api.clerkSignIn(jwt, guessCountry());
      this.onAuthChange();
      return isNew ? "newPilot" : "signedIn";
    } catch {
      return "none";
    }
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
    google.accounts.id.renderButton(wrap, { theme: "filled_black", size: "large", shape: "pill" });
  }

  /** Post-signup step: confirm the guessed country (all-cases geo). */
  showConfirmCountry(onDone: () => void): void {
    const { screen, body, error } = this.screen("WHERE DO YOU FLY FROM?");
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

    // service record + badge collection (locked ones show how to earn them)
    const record = this.el("div", "panel");
    body.appendChild(record);
    void this.guard(error, async () => {
      const p = await this.api.playerProfile(user.callsign);
      record.appendChild(this.statsRow(p));
      record.appendChild(this.badgeGrid(p.badges, true));
    });

    body.appendChild(
      this.button("Sign out", false, () => {
        const clerk = (window as unknown as { Clerk?: Clerk }).Clerk;
        if (clerk?.loaded) void clerk.signOut().catch(() => {});
        void this.api.logout().then(() => {
          this.onAuthChange();
          this.onBack();
        });
      }),
    );
    this.backRow(screen);
  }

  /** Public read-only pilot profile, opened from any leaderboard row. */
  showPilot(callsign: string, onBack: () => void): void {
    const { screen, body, error } = this.screen("PILOT RECORD");
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
      body.appendChild(this.statsRow(p));
      body.appendChild(this.badgeGrid(p.badges, false));
    });
    this.backRow(screen, onBack);
  }

  private statsRow(p: PlayerProfile): HTMLElement {
    const fmtTime = (s: number): string =>
      s >= 3600
        ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
        : `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
    const cells: Array<[string, string]> = [
      ["Best (Tilt)", p.best.tilt.toLocaleString()],
      ["Best (Classic)", p.best.classic.toLocaleString()],
      ["Runs", p.runs.toLocaleString()],
      ["Kills", p.totalKills.toLocaleString()],
      ["Longest run", fmtTime(p.bestTime)],
    ];
    return this.el(
      "div",
      "stats pilot-stats",
      cells
        .filter(([, v]) => v !== "0")
        .map(([k, v]) => `<div><span class="label">${k}</span><span class="value">${v}</span></div>`)
        .join(""),
    );
  }

  /** Badge collection: earned bright; locked dimmed (with hints on own profile). */
  private badgeGrid(earned: Array<{ id: string; earnedAt: number }>, showLocked: boolean): HTMLElement {
    const earnedIds = new Set(earned.map((b) => b.id));
    const wrap = this.el("div", "badge-wrap");
    wrap.appendChild(
      this.el("div", "manual-title", `BADGES — ${earnedIds.size} / ${BADGES.length}`),
    );
    const grid = this.el("div", "badge-grid");
    const detail = this.el("div", "field-hint center badge-detail", "Tap a badge for details.");
    for (const b of BADGES) {
      const has = earnedIds.has(b.id);
      if (!has && !showLocked) continue;
      const cell = this.el(
        "div",
        `badge${has ? "" : " locked"}`,
        `<span class="badge-icon">${has ? b.icon : "❔"}</span>` +
          `<span class="badge-name">${has ? b.name : "???"}</span>` +
          `<span class="badge-tier">${TIER_LABEL[b.tier]}</span>`,
      );
      cell.title = has ? `${b.name} — ${b.desc}` : `Locked — ${b.desc}`;
      cell.addEventListener("click", () => {
        detail.innerHTML = has
          ? `${b.icon} <b>${b.name}</b> — ${b.desc}`
          : `❔ <b>Locked</b> — ${b.desc}`;
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

  // --- world arena ---

  showWorldArena(): void {
    const { screen, body, error } = this.screen("WORLD ARENA");

    const filter = this.countrySelect("");
    (filter.firstChild as HTMLOptionElement).textContent = "🌐 All countries";
    const table = this.el("div", "board");

    const load = (): void => {
      table.innerHTML = `<div class="field-hint">Loading…</div>`;
      void this.guard(error, async () => {
        const data = await this.api.worldLeaderboard(filter.value || undefined, this.boardMode);
        this.renderBoard(table, data.entries, data.me, () => this.showWorldArena());
      });
    };
    body.append(this.modeTabs(load), filter, table);
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
      table.appendChild(this.el("div", "field-hint", "No scores yet — be the first!"));
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

  // --- private arenas ---

  showArenas(): void {
    if (!this.api.signedIn) return this.showAuth(() => this.showArenas());
    const { screen, body, error } = this.screen("ARENAS");

    body.appendChild(
      this.el("div", "field-hint", "Create a private arena and share its code with friends — everyone's best run counts."),
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
    const { screen, body, error } = this.screen("ARENA");
    const heading = screen.querySelector(".heading")!;
    const table = this.el("div", "board");
    body.appendChild(
      this.el("div", "field-hint", `Invite code: <b class="mono">${escapeHtml(code.toUpperCase())}</b> — share it with friends.`),
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
    this.backRow(screen, () => this.showArenas());
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
