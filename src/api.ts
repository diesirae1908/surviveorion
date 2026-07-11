// Thin client for the community server. All calls are same-origin `/api/...`
// (vite dev proxy or the production server serving dist/). Failures surface as
// thrown ApiError with a user-readable message.

export interface UserInfo {
  callsign: string;
  country: string;
}

/** Control scheme a run was played with — each has its own leaderboards. */
export type BoardMode = "classic" | "tilt";

export interface LeaderboardEntry {
  userId: number;
  callsign: string;
  country: string;
  best: number;
  runs: number;
  bestTime: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  me: { rank: number; best: number } | null;
}

export interface ArenaInfo {
  code: string;
  name: string;
  isOwner?: number;
  members?: number;
}

export interface SubmitResult {
  best: number;
  worldRank: number | null;
  countryRank: number | null;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const TOKEN_KEY = "orion.session";

export class Api {
  private token: string | null = localStorage.getItem(TOKEN_KEY);
  user: UserInfo | null = null;
  googleClientId = "";
  clerkPublishableKey = "";
  /** false once a request fails to reach the server at all. */
  online = true;

  get signedIn(): boolean {
    return !!this.token && !!this.user;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    let res: Response;
    try {
      res = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      this.online = true;
    } catch {
      this.online = false;
      throw new ApiError("can't reach the community server", 0);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error ?? `request failed (${res.status})`, res.status);
    return data as T;
  }

  private setSession(token: string, user: UserInfo): void {
    this.token = token;
    this.user = user;
    localStorage.setItem(TOKEN_KEY, token);
  }

  /** Load server config + restore the saved session if still valid. */
  async init(): Promise<void> {
    try {
      const cfg = await this.request<{ googleClientId: string; clerkPublishableKey: string }>(
        "GET",
        "/api/config",
      );
      this.googleClientId = cfg.googleClientId;
      this.clerkPublishableKey = cfg.clerkPublishableKey ?? "";
    } catch {
      return; // server offline — community features hidden
    }
    if (this.token) {
      try {
        const me = await this.request<{ user: UserInfo }>("GET", "/api/me");
        this.user = me.user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          this.token = null;
          localStorage.removeItem(TOKEN_KEY);
        }
      }
    }
  }

  async register(callsign: string, password: string, country: string): Promise<void> {
    const r = await this.request<{ token: string; user: UserInfo }>("POST", "/api/auth/register", {
      callsign,
      password,
      country,
    });
    this.setSession(r.token, r.user);
  }

  async login(callsign: string, password: string): Promise<void> {
    const r = await this.request<{ token: string; user: UserInfo }>("POST", "/api/auth/login", {
      callsign,
      password,
    });
    this.setSession(r.token, r.user);
  }

  async clerkSignIn(sessionToken: string, country: string): Promise<boolean> {
    const r = await this.request<{ token: string; user: UserInfo; isNew: boolean }>(
      "POST",
      "/api/auth/clerk",
      { sessionToken, country },
    );
    this.setSession(r.token, r.user);
    return r.isNew;
  }

  async googleSignIn(idToken: string, country: string): Promise<boolean> {
    const r = await this.request<{ token: string; user: UserInfo; isNew: boolean }>(
      "POST",
      "/api/auth/google",
      { idToken, country },
    );
    this.setSession(r.token, r.user);
    return r.isNew;
  }

  async logout(): Promise<void> {
    try {
      await this.request("POST", "/api/auth/logout");
    } catch {
      // best effort — clear locally regardless
    }
    this.token = null;
    this.user = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  async updateProfile(patch: { callsign?: string; country?: string }): Promise<void> {
    const r = await this.request<{ user: UserInfo }>("PATCH", "/api/me", patch);
    this.user = r.user;
  }

  submitScore(run: {
    score: number;
    timeSurvived: number;
    kills: number;
    maxMultiplier: number;
    mode: BoardMode;
  }): Promise<SubmitResult> {
    return this.request<SubmitResult>("POST", "/api/scores", run);
  }

  worldLeaderboard(country?: string, mode: BoardMode = "classic"): Promise<LeaderboardResponse> {
    const q = new URLSearchParams({ mode });
    if (country) q.set("country", country);
    return this.request<LeaderboardResponse>("GET", `/api/leaderboard/world?${q}`);
  }

  createArena(name: string): Promise<{ arena: ArenaInfo }> {
    return this.request("POST", "/api/arenas", { name });
  }

  joinArena(code: string): Promise<{ arena: ArenaInfo }> {
    return this.request("POST", "/api/arenas/join", { code });
  }

  myArenas(): Promise<{ arenas: ArenaInfo[] }> {
    return this.request("GET", "/api/arenas");
  }

  arenaLeaderboard(
    code: string,
    mode: BoardMode = "classic",
  ): Promise<LeaderboardResponse & { arena: ArenaInfo }> {
    return this.request("GET", `/api/arenas/${code}/leaderboard?mode=${mode}`);
  }

  /** Player feedback; email is optional (follow-ups / rewards). */
  sendFeedback(message: string, email: string): Promise<{ ok: boolean }> {
    // device context helps reproduce bugs without asking the player
    const context =
      `${navigator.userAgent} | ${window.screen.width}x${window.screen.height}` +
      ` | touch:${"ontouchstart" in window}`;
    return this.request("POST", "/api/feedback", { message, email, context });
  }
}
