/**
 * Game updates feed: flat JSON Sam appends, popup once per new id.
 * Same-origin `/updates.json` only (no cross-origin fetch, CORS stays put).
 */

export const UPDATES_URL = "/updates.json";
export const LAST_SEEN_UPDATE_KEY = "orion.lastSeenUpdateId";

export interface GameUpdate {
  id: string;
  date: string;
  title: string;
  body: string[];
  link: string | null;
}

export function parseUpdates(raw: unknown): GameUpdate[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { updates?: unknown }).updates;
  if (!Array.isArray(list)) return [];
  const out: GameUpdate[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || rec.id.length === 0) continue;
    if (typeof rec.date !== "string" || rec.date.length === 0) continue;
    if (typeof rec.title !== "string" || rec.title.length === 0) continue;
    if (!Array.isArray(rec.body) || !rec.body.every((b) => typeof b === "string")) continue;
    const link = rec.link == null ? null : typeof rec.link === "string" ? rec.link : null;
    out.push({
      id: rec.id,
      date: rec.date,
      title: rec.title,
      body: rec.body,
      link,
    });
  }
  return out;
}

/** Newest entry is first in the file (Sam appends at the top). */
export function latestUpdate(updates: GameUpdate[]): GameUpdate | null {
  return updates[0] ?? null;
}

export function loadLastSeenUpdateId(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_UPDATE_KEY);
  } catch {
    return null;
  }
}

export function saveLastSeenUpdateId(id: string): void {
  try {
    localStorage.setItem(LAST_SEEN_UPDATE_KEY, id);
  } catch {
    // private mode
  }
}

export function hasUnreadUpdate(latestId: string | null, lastSeen: string | null): boolean {
  return latestId != null && latestId !== lastSeen;
}

export async function fetchUpdates(url = UPDATES_URL): Promise<GameUpdate[]> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) return [];
  return parseUpdates(await res.json());
}
