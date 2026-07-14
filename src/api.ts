// Thin client for the community server. All calls are same-origin `/api/...`
// (vite dev proxy or the production server serving dist/). Failures surface as
// thrown ApiError with a user-readable message.

import type { GameMode } from "./config";

export interface UserInfo {
  callsign: string;
  country: string;
}

/**
 * Platform a run was played on — each has its own leaderboards.
 * desktop = keyboard/mouse, touch = phone virtual stick, tilt = phone tilt.
 * (Inertia is a settings flavor, not a board.)
 */
export type BoardMode = "desktop" | "touch" | "tilt";

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
  /** Badge ids earned by this run (see src/badges.ts for display data). */
  newBadges?: string[];
  /** Pilot directly above on the world board (gap-to-goal messaging). */
  nextAbove?: { callsign: string; score: number } | null;
  /** Nearest wingmate above on the world board, if any. */
  nextWingmate?: { callsign: string; score: number } | null;
  /** Rank on today's Daily Patrol board (daily runs only). */
  dailyRank?: number | null;
}

/** Viewer's relationship with a pilot (null = viewing yourself / signed out). */
export type Friendship = "none" | "friends" | "outgoing" | "incoming" | null;

/** Public pilot profile (GET /api/players/:callsign). */
export interface PlayerProfile {
  callsign: string;
  country: string;
  joinedAt: number;
  best: Record<BoardMode, number>;
  rank: Record<BoardMode, number | null>;
  runs: number;
  totalKills: number;
  totalTime: number;
  bestTime: number;
  /** Single-run career bests (badge progress display). */
  bestKills: number;
  bestScore: number;
  bestMultiplier: number;
  history: Array<{ score: number; mode: BoardMode; createdAt: number }>;
  badges: Array<{ id: string; earnedAt: number }>;
  friendship: Friendship;
  /** Iron Rain bests/ranks — null until the pilot has flown Iron Rain. */
  ironRain: {
    best: Record<BoardMode, number>;
    rank: Record<BoardMode, number | null>;
  } | null;
}

export interface FriendInfo {
  callsign: string;
  country: string;
  best: number;
  lastRunAt: number | null;
}

export interface FriendRequest {
  callsign: string;
  country: string;
  createdAt: number;
}

export interface FriendsResponse {
  friends: FriendInfo[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export interface FriendActivityEntry {
  callsign: string;
  country: string;
  score: number;
  timeSurvived: number;
  kills: number;
  mode: BoardMode;
  createdAt: number;
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
  /** Incoming friend requests awaiting an answer (menu badge). */
  pendingFriends = 0;
  /** False for guest accounts until they set one from the profile screen. */
  hasPassword = true;
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
      const cfg = await this.request<{ googleClientId: string }>("GET", "/api/config");
      this.googleClientId = cfg.googleClientId;
    } catch {
      return; // server offline — community features hidden
    }
    if (this.token) {
      try {
        const me = await this.request<{
          user: UserInfo;
          pendingFriends?: number;
          hasPassword?: boolean;
        }>("GET", "/api/me");
        this.user = me.user;
        this.pendingFriends = me.pendingFriends ?? 0;
        this.hasPassword = me.hasPassword ?? true;
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
    this.hasPassword = true;
  }

  async login(callsign: string, password: string): Promise<void> {
    const r = await this.request<{ token: string; user: UserInfo }>("POST", "/api/auth/login", {
      callsign,
      password,
    });
    this.setSession(r.token, r.user);
    this.hasPassword = true;
  }

  /** Game-over quick save: a callsign creates a real passwordless account. */
  async guestSignup(callsign: string, country: string): Promise<void> {
    const r = await this.request<{ token: string; user: UserInfo }>("POST", "/api/auth/guest", {
      callsign,
      country,
    });
    this.setSession(r.token, r.user);
    this.hasPassword = false;
  }

  async googleSignIn(idToken: string, country: string): Promise<boolean> {
    const r = await this.request<{ token: string; user: UserInfo; isNew: boolean }>(
      "POST",
      "/api/auth/google",
      { idToken, country },
    );
    this.setSession(r.token, r.user);
    this.hasPassword = false; // Google accounts sign in via Google, no password
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

  async updateProfile(patch: {
    callsign?: string;
    country?: string;
    /** Guest-account upgrade — only accepted while no password is set. */
    password?: string;
  }): Promise<void> {
    const r = await this.request<{ user: UserInfo }>("PATCH", "/api/me", patch);
    this.user = r.user;
    if (patch.password !== undefined) this.hasPassword = true;
  }

  submitScore(run: {
    score: number;
    timeSurvived: number;
    kills: number;
    maxMultiplier: number;
    mode: BoardMode;
    /** Which board the run files on (classic / ironrain). */
    gameMode: GameMode;
    platform: string;
    /** true for Daily Patrol runs (server files it on today's board too). */
    daily?: boolean;
  }): Promise<SubmitResult> {
    return this.request<SubmitResult>("POST", "/api/scores", run);
  }

  /** Anonymous run telemetry (analytics only — signed-in runs go via submitScore). */
  logRun(run: {
    score: number;
    timeSurvived: number;
    kills: number;
    maxMultiplier: number;
    mode: BoardMode;
    gameMode: GameMode;
    platform: string;
    daily?: boolean;
  }): Promise<{ ok: boolean }> {
    return this.request("POST", "/api/runs", run);
  }

  playerProfile(callsign: string): Promise<PlayerProfile> {
    return this.request("GET", `/api/players/${encodeURIComponent(callsign)}`);
  }

  worldLeaderboard(
    country?: string,
    mode: BoardMode = "desktop",
    gameMode: GameMode = "classic",
  ): Promise<LeaderboardResponse> {
    const q = new URLSearchParams({ mode, gameMode });
    if (country) q.set("country", country);
    return this.request<LeaderboardResponse>("GET", `/api/leaderboard/world?${q}`);
  }

  /** Today's Daily Patrol board (shared-seed runs, resets at UTC midnight). */
  dailyLeaderboard(mode: BoardMode = "desktop"): Promise<LeaderboardResponse & { date: string }> {
    return this.request("GET", `/api/leaderboard/daily?mode=${mode}`);
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
    mode: BoardMode = "desktop",
    gameMode: GameMode = "classic",
  ): Promise<LeaderboardResponse & { arena: ArenaInfo }> {
    return this.request("GET", `/api/arenas/${code}/leaderboard?mode=${mode}&gameMode=${gameMode}`);
  }

  // --- friends ---

  myFriends(): Promise<FriendsResponse> {
    return this.request("GET", "/api/friends");
  }

  requestFriend(callsign: string): Promise<{ status: "pending" | "accepted" }> {
    return this.request("POST", "/api/friends/request", { callsign });
  }

  async acceptFriend(callsign: string): Promise<void> {
    await this.request("POST", "/api/friends/accept", { callsign });
    this.pendingFriends = Math.max(0, this.pendingFriends - 1);
  }

  /** Decline an incoming request, cancel an outgoing one, or unfriend. */
  async removeFriend(callsign: string): Promise<void> {
    await this.request("POST", "/api/friends/remove", { callsign });
  }

  friendsLeaderboard(
    mode: BoardMode = "desktop",
    gameMode: GameMode = "classic",
  ): Promise<LeaderboardResponse> {
    return this.request("GET", `/api/friends/leaderboard?mode=${mode}&gameMode=${gameMode}`);
  }

  friendActivity(): Promise<{ activity: FriendActivityEntry[] }> {
    return this.request("GET", "/api/friends/activity");
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
