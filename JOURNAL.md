# Orion work journal

Newest first. Every substantive change gets a dated entry here (what changed,
why, commit hash, follow-ups), committed together with the work. See
`AGENTS.md` → "Recording your work".

## 2026-08-05 — Daily lobby: inline leaderboard replaces the Leaderboard screen (this commit)

- Lucas asked to simplify the daily-only lobby (surviveorion.com root): the
  separate Leaderboard screen (tabs, per-device mode dropdown) is gone from
  that side, replaced with one merged ranking sitting directly under the
  menu buttons — no tabs, no mode filter, every device in one list. The
  `/fullgame` Leaderboard screen (`community.ts` `showWorldArena`) is
  untouched; it still tabs Classic/Iron Rain × Desktop/Phone/Phone tilt.
- Server (`server/db.mjs`, `server/index.mjs`): `GET /api/leaderboard/daily`
  now accepts `mode=all` alongside the existing per-device modes. New
  `dailyLeaderboardCombined()` groups today's daily runs by pilot across
  every device with a `ROW_NUMBER()`/`COUNT()` window over `scores`
  (confirmed `node:sqlite`'s bundled SQLite supports window functions before
  relying on it), picking each pilot's best score and which device it was
  set on; `dailyRankCombined()` gives one pilot's rank/best/device in that
  merged board. Both hardcode `game_mode = 'classic'` since Daily Patrol is
  always Classic — no schema change, purely additive queries alongside the
  existing per-mode `leaderboard()`/`rankOf()`.
- Client: `api.ts` gets `dailyLeaderboardCombined()` hitting the new
  `mode=all` param. `ui.ts`'s `showDailyLobby` drops the "Leaderboard"
  button and grows a bounded-scroll `.board` list (same class the world
  board already uses — `max-height: min(46vh, 420px)`) titled "TODAY'S
  BOARD", rows show rank/name/a subtle device tag (DESKTOP/PHONE/TILT text,
  full name in the title attr)/score. `main.ts`'s new `fillDailyBoard()`
  mirrors the existing `fillDailyHint()` fetch-after-render pattern: highlights
  the viewer's own row gold in place if it's in the loaded window (reusing
  the `.board-row.me` style from the world board), or appends a
  `position: sticky; bottom: 0` pinned copy of it if their rank falls
  outside the top 50 — no own-row at all if anonymous or no daily score yet.
  Feedback footer link untouched.
- Verified: `npm run build` (tsc + vite) clean, `npx tsx scripts/sim-test.ts`
  all green (untouched gameplay code, ran it anyway per the task ask). Manual
  check with `npm run dev` + `npm run server`: seeded local guest pilots
  across desktop/touch/tilt daily scores, confirmed the combined ranking
  merges correctly (best score wins regardless of device, ties broken by
  earliest), confirmed a signed-in pilot's row gets the gold `.me` highlight
  at its real position, and confirmed the server-side pinned-row math
  (`rank > entries.length` on a truncated window) computes right. Screenshot-
  verified in a real browser via a subagent — matches the gold/dark aesthetic
  cleanly, no layout bugs. Cleared the local seeded test data from
  `server/orion.db` (gitignored, dev-only) before finishing.
- No destructive DB changes — additive queries only, real Render data
  untouched by this change itself.

## 2026-07-30 — /admin date selector (per-day drill-down) [MERGED + DEPLOYED same day: merge `70c6709`, live on Render ~4:49 PM PT, /admin verified serving the day-nav]

- Added a date picker to `/admin` so Lucas can view analytics for any single
  day, not just the rolling 14-day charts and all-time totals. Default view
  (no date picked) is today, PT, matching the day math from `a22e890` below;
  everything else on the dashboard is unchanged.
- Picked up mid-flight, uncommitted work from an interrupted session (~150
  lines in `server/db.mjs`, ~111 in `server/index.mjs`). Reviewed it
  critically and kept nearly all of it as-is: `ptDateBounds()` (parses
  `YYYY-MM-DD`, defaults to today, reuses the existing `ptOffsetMs` PT-day
  math) and `adminStatsForDay()` in `server/db.mjs` mirror `adminStats()`'s
  query style exactly (same columns, same hardcoded-column SQL pattern, no
  injection risk since no column name is ever request-controlled) and were
  already correct. `GET /api/admin/stats?date=YYYY-MM-DD` in `server/index.mjs`
  validates the date, 400s on a bad one, and returns the existing payload plus
  a new `day` key; omitting `date` returns today, so old clients see identical
  output with one added field. Turned out the "admin UI was not started" note
  I was given was stale: the inherited diff already had a working date input,
  prev/next-day buttons, a today button, and a `renderDay()` panel reusing
  the existing `stat`/`hbars`/`splitBar` helpers, all inside the same
  `ADMIN_PAGE` template in `server/index.mjs` (this repo has no separate
  admin UI file). I left that code essentially untouched after verifying it.
- Tripwire check: confirmed per-day granularity already exists (every `runs`
  and `visits` row has a millisecond `created_at`), so no schema or backfill
  was needed. Verified against the local dev DB: `date=2026-07-11` correctly
  picked up 15 runs that are UTC-dated 2026-07-12 in `sqlite date()` terms but
  land in PT day 2026-07-11 once shifted, exactly the PT bucketing `a22e890`
  established for the rest of the dashboard.
- Verified: `npm run build` (tsc + vite) green, `npx tsx scripts/sim-test.ts`
  all green, ran the community server locally and hit
  `/api/admin/stats` with no date (today), a real historical date, an invalid
  date string (400), and a future date (200, all zeros) - all matched
  expectations. Committed on `sam/admin-date-selector` (not merged to main,
  not pushed to origin/main; branch itself may be pushed). Dispatched by Sam.

## 2026-07-21 — /admin day math moved from UTC to Pacific Time (this commit)

- The admin dashboard's per-day charts (visits/day, runs/day) bucketed on UTC
  days, so from 5 PM PT onward the charts rolled over to "tomorrow"; the
  "today" tiles were rolling 24-hour windows, not calendar days. Both now use
  America/Vancouver days: new `ptOffsetMs()` / `ptMidnightEpoch()` helpers in
  `server/db.mjs` (via `Intl.DateTimeFormat` — SQLite has no named timezones
  and the server is zero-dependency) shift epochs before `date()` and anchor
  "today" (visits/uniques today, users newToday) at PT midnight. The current
  offset is applied to the whole 14-day window — DST-edge rows can land a day
  off, acceptable for a hobby dashboard. Week counters stay rolling 7 days.
  Added a note on `/admin` that days/"today" are PT. Player-facing Daily
  Patrol rollover (`utcDate()` in `index.mjs`) deliberately untouched — that's
  gameplay, still UTC. Verified: build + sim-test green, plus a temp-DB check
  that a 6 PM PT visit no longer buckets to the next day. Dispatched by Sam.

## 2026-07-21 — PM-model docs: AGENTS.md + this journal

- Added `AGENTS.md` (repo context, deploy warning, guardrails, PM model with
  Sam) and seeded this `JOURNAL.md` from recent git history, bringing the repo
  into the convention used across Lucas's other repos. The parent-folder
  `Orion/AGENTS.md` (outside git) now just points here — this versioned copy
  is authoritative. Docs only, no code. Dispatched by Sam.

## 2026-07-21 — iOS tilt-permission fix (`a344159`, merged `01807d4`)

- Fixed the tilt-control dead end on iOS: motion permission is now requested
  only from the in-context Tilt pick (a real click), never at boot. The old
  boot-time request fired on the first "tap to enter" whenever tilt was the
  saved mode — players reflexively denied it, Safari cached the denial for the
  session, and tilt then silently fell back to the touch stick, reading as
  "tilt is broken". When tilt can't start, a toast now explains the stick
  fallback and how to un-wedge motion access.

## 2026-07-21 — Visual /admin dashboard (`2024923`, on `71caf17`)

- `71caf17` added traffic analytics to `/admin` (cookie-less visit beacon →
  `visits` table) and unlisted the `/fullgame` lobby link for the public
  launch. `2024923` made the dashboard visual: column charts for per-day
  trends, flag bars for countries, split bars for device/mode shares,
  replacing the number tables.

## 2026-07-20 — Public-launch hardening (`1314249`)

- Launch-hardened for the public Reddit push: device-locked guest accounts
  (`orion.guestSecret` in localStorage, hash in `users.guest_secret_hash`),
  server-enforced 3-attempts/day daily budget, spoof-resistant rate-limit IPs,
  Bearer-only admin auth with a rotated `ORION_ADMIN_KEY` (in `server/.env` +
  Render env vars, never committed), security headers, a visible feedback CTA,
  OG/Twitter social meta, and crash reports to `/api/feedback` with a
  `[crash]` prefix visible on `/admin`. These protections are now a guardrail
  in `AGENTS.md` — don't weaken them.

## 2026-07-16 — Daily Patrol pacing (`be54086`, `30e63ad`)

- `30e63ad`: daily free-death window — dying inside the first 15s of a Daily
  Patrol run refunds the attempt (the run never happened for the daily books).
- `be54086`: faster power drops on dailies (`PICKUPS.dailyIntervalScale` 0.7) —
  dailies have no refill floor, so they were stuck on the slowest pickup
  schedule; a flat scale on the same seeded draw keeps the shared script
  identical across pilots.

## 2026-07-15 — Daily front door + determinism + balance (`b96cdd8`…`20b30f8`)

- `b4fbcad` + `b96cdd8`: made the daily game the front door (surviveorion.com
  root is the daily-only lobby with 3 attempts/day, Training Ground, and a
  Wordle-style share card; the full arcade moved to `/fullgame`) and turned
  drone assemblies into real evolutions (lance / wheel / hunter / bomb).
- `ddd5468`: one drone size (`scaleClamp` pinned to 0.9) — small drones were
  invisible on phones.
- `bb01c9a`: Daily Patrol power drops and mines fully scripted so every pilot
  sees the identical run; sim-test determinism check now compares positions.
- `e532dba`: phone game-over layout fix + guest names shared across devices
  for passwordless callsigns.
- `20b30f8`: reworked Magnet into a one-shot grab (never wasted — stays armed
  on an empty board) and benched Afterburner (control-stealing dash too risky
  as a pickup).

## Earlier

The web rebuild started 2026-07-10 (v2 of the archived Unity prototype) and
the full design log lives in `git log` — commit messages in this repo are
deliberately why-focused and detailed. Highlights: retention loop + seeded
Daily Patrol (`171a233`, Jul 11), guest accounts + playtester-feedback round
(`213b33d`/`374b3ae`, Jul 12), Classic/Iron Rain modes + graze scoring +
swarm rebalance (`5b87aaa`…`0afb1f8`, Jul 14).
