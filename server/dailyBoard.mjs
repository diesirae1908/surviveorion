// Combined Daily Patrol board: real SQLite rows + virtual bots merged at read
// time. Used by the daily leaderboard endpoint and daily rank/gap-to-goal.

import {
  dailyLeaderboardCombined,
  dailyRankCombined,
} from "./db.mjs";
import { visibleDailyBots } from "./dailyBots.mjs";

function mergeDailyEntries(realEntries, bots) {
  const merged = [
    ...realEntries.map((e) => ({ ...e, virtual: false, _submitAt: 0 })),
    ...bots,
  ];
  merged.sort((a, b) => b.best - a.best || a._submitAt - b._submitAt || (a.callsign < b.callsign ? -1 : 1));
  return merged.map(({ _submitAt, virtual, ...rest }) => ({ ...rest, virtual: !!virtual }));
}

/** Combined daily board with virtual bots (mode=all / TODAY'S BOARD). */
export function dailyLeaderboardCombinedWithBots({ dailyDate, limit = 100, nowMs = Date.now() }) {
  const real = dailyLeaderboardCombined({ dailyDate, limit: 1000 });
  const bots = visibleDailyBots(dailyDate, nowMs);
  return mergeDailyEntries(real, bots).slice(0, limit);
}

/** Viewer rank on the merged board (real pilots only — null if no daily run). */
export function dailyRankCombinedWithBots(userId, dailyDate, nowMs = Date.now()) {
  const me = dailyRankCombined(userId, dailyDate);
  if (!me) return null;
  const board = dailyLeaderboardCombinedWithBots({ dailyDate, limit: 10_000, nowMs });
  const idx = board.findIndex((e) => e.userId === userId);
  if (idx >= 0) return { rank: idx + 1, best: me.best, mode: me.mode };
  const ahead = board.filter((e) => e.best > me.best).length;
  return { rank: ahead + 1, best: me.best, mode: me.mode };
}

/** Nearest pilot above on the merged board (bots count; wingmates stay DB-only). */
export function nextAboveCombinedDailyWithBots(userId, dailyDate, nowMs = Date.now()) {
  const me = dailyRankCombined(userId, dailyDate);
  if (!me) return null;
  const board = dailyLeaderboardCombinedWithBots({ dailyDate, limit: 10_000, nowMs });
  let target = null;
  for (const entry of board) {
    if (entry.userId === userId) continue;
    if (entry.best <= me.best) continue;
    if (!target || entry.best < target.best) target = entry;
  }
  return target ? { callsign: target.callsign, score: target.best } : null;
}
