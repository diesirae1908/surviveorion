# Orion — agent instructions

Orion is an inertia-based survival arcade game (no guns — dodge drone swarms
with piloting skill and defensive power pickups), live at **surviveorion.com**.

This repo (`orion-web`, GitHub `diesirae1908/surviveorion`) is the whole game:
TypeScript + Canvas + Vite client, zero-dependency Node community server
(leaderboards, accounts, arenas — SQLite via `node:sqlite`, Node 22.5+), PWA.
Design material and the archived Unity prototype live in the parent folder
(`../design/`, `../_archive/`), outside this git repo.

## Deploying — read before you push

**Production runs on Render** (service `surviveorion`), Docker, **auto-deploying
from `main`**. `git push origin main` IS a production deploy to a public game
with real players — Render rebuilds in ~2 minutes. Verify a deploy by checking
that the JS bundle hash served at surviveorion.com changed.

## Working conventions

```bash
npm run dev        # game dev server on :5173 (proxies /api to the community server)
npm run server     # community server (leaderboards / accounts) on :8787
npm run build      # tsc --noEmit type-check + vite production build to dist/
npm run start      # production mode: community server + serves dist/ on :8787
npx tsx scripts/sim-test.ts   # headless playtest: runs the real game loop,
                              # checks formations/powers/pickups + Daily Patrol determinism
```

- All gameplay tuning lives in `src/config.ts` (the "Inspector" equivalent).
  Full module map in `README.md`.
- `server/` is the zero-dependency Node server: `index.mjs` (http + routes),
  `db.mjs` (SQLite), `validate.mjs` (anti-cheat ceilings), `badges.mjs`,
  `clerk.mjs` (legacy), `env.mjs` (reads `server/.env`). `server/orion.db` is
  the local dev database.
- Type-check (`npx tsc --noEmit` or `npm run build`) and run the sim-test
  before pushing gameplay changes.

## Recording your work

Every substantive change gets:

1. A clear, **why-focused** commit message (this repo's history is the
   design log — look at `git log` for the style).
2. A dated entry **appended to `JOURNAL.md`** at the repo root (newest first,
   short and factual: what changed, why, commit hash, follow-ups), committed
   together with the work.

## Guardrails

- **Pushes deploy to production.** Public players are on the other end of
  `git push origin main`. Don't push half-done work; type-check and sim-test
  first.
- **Never commit `ORION_ADMIN_KEY` or any secret.** Secrets live in
  `server/.env` locally and in Render env vars — reference those locations,
  never the values.
- **Don't weaken the launch hardening** (shipped 2026-07-20 for the public
  Reddit launch): device-locked guest accounts (`orion.guestSecret` in
  localStorage, hash in `users.guest_secret_hash`), the server-enforced
  3-attempts/day daily budget, rate limiting with spoof-resistant client IPs,
  Bearer-only admin auth, security headers.
- **The SQLite DB on Render holds real user data** (accounts, scores, badges,
  friends). No destructive schema changes, deletes, or resets without Lucas.
- If you change anything in `SCORING` (`src/config.ts`), keep the anti-cheat
  ceiling in `server/validate.mjs` in sync, or legitimate runs get rejected.

## PM model

Agents working in this repo are the **Orion repo experts** — they debug, plan,
and implement here. Lucas's assistant **Sam** (repo `~/Documents/Sam`) is the
PM: Sam holds the cross-project context (other tools, Slack/Sentry findings,
Lucas's decisions) and dispatches work here.

- **If dispatched by Sam and in doubt** — game-design or balance calls,
  anything touching live player data, public-facing copy — **return the
  question to Sam instead of guessing**. Sam escalates to Lucas.
- **If working directly** (not dispatched), record doubts in `JOURNAL.md` and
  surface them to Lucas rather than silently deciding.

## Gameplay tuning facts

- Two game modes (`GameMode` in config.ts, `gameMode` on `World`): **Classic**
  (the normal escalating run, gentle opening) and **Iron Rain** (flat endurance —
  the spawner acts as if the run were already `IRONRAIN.pinnedMinutes` (~9 min)
  deep and stays there, opens with an immediate mega-wall, wall/pincer/tightring-heavy
  formation diet, tighter wall spacing + smaller gaps, ~15% of walls spawn
  gapless (powers-only survival), grace never applies). Both launch buttons sit
  on the menu; the pick persists (`orion.gameMode` in save.ts) and retries reuse
  it. Daily Patrol is always Classic. Every run submits its `gameMode`; the
  `scores`/`runs` tables have a `game_mode` column and all leaderboards, ranks,
  PB deltas, and gap-to-goal are scoped per game mode (`?gameMode=` on
  endpoints; dropdown filters in the Leaderboard screen; local PBs keyed per
  mode in save.ts). Pilot profiles show an Iron Rain section once a pilot has
  Iron Rain runs.
- Powers: Shield (no timer — persists until it absorbs a hit, a banked extra life),
  Shockwave, Pulse Shot, Magnet (one-shot grab — yanks the nearest power
  pickup straight to the ship, or stays armed and claims the next drop if the
  board is empty; `magnetPending` on `PowersState`, `magnetized` on `Pickup`),
  Afterburner, Cryo Field, Missile Swarm,
  Starshell (invulnerable ram-kill shell), Arc Lightning (chain-jumps through
  nearby enemies), Autocannon (ship turret auto-firing at the nearest enemy),
  Meteor Storm (explosions raining on drone clusters), Vortex (singularity that
  pulls drones in, eats + scores whatever reaches the core, then collapses —
  the ship is invulnerable while any vortex is open).
  Afterburner and Vortex are currently benched (`BENCHED_POWER_IDS` in
  config.ts — code intact, just out of the drop pool and codex; vortex too
  strong, afterburner's control-stealing dash too risky to pick up).
  Shockwave, Missile Swarm impacts, and Meteor Storm strikes all leave
  lingering blasts (`blasts` on `PowersState`, `spawnBlast` in powers.ts) that
  stay lethal for ~1s after detonation.
  No power is time-gated (`POWER_MIN_MINUTES` is empty — everything can spawn from minute zero).
  Pickup spawn frequency is weighted (`POWER_SPAWN_WEIGHTS`) and speeds up with difficulty,
  and skill kills pay more: pulse kills 2x points (+ multi-kill bonus), frozen-drone kills
  1.5x points and 2x multiplier gain (frozen drones also puff up 1.5x —
  `DRONE.frozenScale` — so they're easier to see and shatter). Drones are all one size (`SPAWNER.scaleClamp` pinned to 0.9 —
  smaller ones were invisible on phones; widen the clamp to restore the old
  runt-to-bruiser spread and its size-speed link). The arena has hard walls
  (no screen wrap).
- Difficulty escalates forever (no plateau): Classic opens gently on purpose
  (5-drone burst, first formation slightly delayed, density ramps in 2.5 min —
  Iron Rain exists to skip the warm-up); drones shamble zombie-slow
  (`DRONE.baseSpeed` 0.85, near-flat speed ramp so Iron Rain's pinned depth
  stays slow) while spawn density
  runs Tilt to Live-high (`spawnsPerSecond` up to 4.0 + late growth,
  `maxDrones` 550) — the
  threat is the crowd, and play is about finding the way out, not out-running
  drones (`escalate` in `math.ts`). Ambient drones arrive in packs of 1-3
  around one anchor (`SPAWNER.clumpMax`/`clumpRadius` — same average rate,
  just grouped into blobs with lanes between). Scripted formations (walls/serpents/swarms) carry
  higher `speedScale`s so sweeps keep marching pace over the slow baseline.
  All scoring scales with uncapped linear danger pay
  (`SCORING.dangerPerMinute`).
- Graze rewards (`SCORING.graze*`, detection in gameState.ts): shaving past a
  live drone within `grazeBand` beyond contact pays points, bumps the
  multiplier, and resets its decay delay — threading tight gaps is a scoring
  strategy. Per-drone cooldown stops orbiting one drone; no graze while truly
  invulnerable (starshell/dash/vortex) — a banked shield still grazes since
  contact would cost the extra life.
- Drone evolutions ("assemblies", `ASSEMBLY` in config.ts, system in
  enemies.ts): when the crowd thickens, free ambient drones fuse into a
  creature with its own movement style — **lance** (broadside bar, flies
  straight and fast, bounces off arena walls, then shatters back into
  drones), **wheel** (spinning ring that rolls straight and rebounds like a
  ball), **hunter** (vee that tracks the ship with a limited turn rate —
  outfly it, don't outrun it), **bomb** (tight slab that drifts, strobes
  faster as its fuse burns, then detonates its members outward as fast
  shrapnel). Each kind glows its own color; bursts emit an `assemblyBurst`
  event. Fires on the seeded schedule timer AND via a crowd-pressure valve
  (`crowdTrigger` free drones → an extra evolution, Math.random-only so
  Daily Patrol determinism holds); event timing/kind ride the seeded
  schedule stream (fixed draws), member selection is position-based.
- Formations are weighted (`SPAWNER.formations.weights`) with late-game unlocks
  (`minMinutes`): line/ring/burst from the start, then wall (dot wall with escape
  gaps sweeping the arena), swarm (loose school drifting across as a blob),
  serpent (dotted train with a wandering head), tight ring (smaller, denser
  closing circle), corner cross (all four corners at once), mega wall (slow
  3-row-thick wall with one narrow gap), pincer (two converging walls).
  Walls/swarms/serpents use scripted drone movement (`scriptMode` on `Drone` in
  `enemies.ts`) before releasing to normal homing. Total drones are soft-capped
  (`SPAWNER.maxDrones`).
- Power drops have bad-luck protection (`powerSpawnCounts` on `World`,
  demotion in `pickups.ts` `rollPowerId`): every power in the roster shows up
  within a normal run instead of the common ones hogging the drops.
- Pickups drift slowly (`PICKUPS.driftSpeed`, soft wall bounces), one is
  dealt at launch, drops land every ~6-10s (a bit faster late; dailies run the
  whole schedule at 0.7x intervals — `dailyIntervalScale` — since they have no
  refill floor), the board caps
  at 3 live pickups (`maxActive`), and a refill floor (`minActive` 1) hurries
  a drop in only when the arena is dry. Daily Patrol drops are FULLY scripted
  so every pilot sees the identical board: no refill floor, no cap discard
  (every scheduled drop lands even past `maxActive`), and placement takes the
  first seeded candidate instead of filtering by ship distance — anything
  collection- or position-dependent would desync the shared run. Mines get
  the same daily treatment in `trySpawnMine` (no cap, no ship/spacing
  filters). The sim-test determinism check compares drop kinds AND positions
  across two different play styles. Spawn weights follow a pecking order:
  pulse > shield > freeze > magnet > shockwave > the rest.
- Retention loop: the death cinematic is skippable (tap/key after 0.5s),
  retries use a 0.5s quick warp (Space/Enter on game over also retries), a
  mid-run NEW RECORD celebration fires when the local best is passed, and the
  game-over screen leads with survival time plus peak multiplier, a
  PB-time delta, and gap-to-goal ("N points to pass X", wingmate preferred —
  `nextAbove`/`nextWingmate` in the score-submit response). Unsigned players
  get an inline "enter a name to save your score" prompt in the rank-line slot
  (`POST /api/auth/guest` creates a real passwordless account, then the normal
  score submit runs; a password can be added later from the profile).
- New-pilot grace: a player's first ~3 runs on a device (`orion.runCount` in
  localStorage) soften the opening (half burst, later first formation, gentler
  first-minute ramp) via `grace` on `World`. Scoring untouched; never applies
  to Daily Patrol or Iron Rain.
- Daily Patrol: gameplay RNG is seedable (`setRunSeed` in `math.ts`) with two
  independent streams so every pilot gets the same run script no matter how
  they fly: `scheduleRand` decides what spawns and when (formation kinds +
  intervals, power rolls + pickup intervals, mine intervals) and `rand` places
  things (positions, directions, gaps — always a fixed number of draws per
  event so ship position/kills can't desync it). Player-triggered randomness
  (power effects) and cosmetics stay on `Math.random`. `scripts/sim-test.ts`
  has a regression check (two seeded runs played differently must produce the
  identical formation/power/mine script). Daily runs seed from the UTC date,
  submit with `daily: true`
  (server stamps `daily_date` on `scores`), rank on `GET /api/leaderboard/daily`
  (a tab in the Leaderboard screen, formerly "World Arena") and still count
  all-time. Menu button shows today's leader.
- Site split ("Orion Daily" is the front door): **the root of
  surviveorion.com is the daily-only game**; the full arcade game (Classic,
  Iron Rain, arenas, wingmates, pilot login) lives at **`/fullgame`**
  (`FULL_GAME`/`DAILY_ONLY` in main.ts; `?fullgame=1` works anywhere, same
  build/deploy — the server SPA-fallbacks unknown paths to index.html). The
  daily side boots straight to a minimal Daily Patrol lobby — Launch /
  Training Ground / How to play / Powers / Leaderboard plus a Feedback
  footer link (the /fullgame door is unlisted — URL only — since the public
  Reddit launch; no cinematic, no sign-in on the lobby; players get on
  the board via the game-over guest pseudo prompt), caps dailies at 3
  attempts per UTC day (`orion.dailyAttempts` in save.ts client-side, and
  the server independently rejects a 4th daily score per account per UTC day —
  spent at run start; a death inside the first 15s —
  `DAILY_FREE_DEATH_SECONDS` — refunds the attempt and the run doesn't count
  as a daily), adds a free unscored Training Ground (`training` on
  `World`, `TRAINING` in config.ts — capped slow trickle, no
  formations/assemblies/mines, never submits), and a Wordle-style share card
  (`src/share.ts`: native sheet on phones, clipboard on desktop).
- Locked badges on the own-profile grid show live progress ("47 / 100") from
  career aggregates (`bestKills`/`bestScore`/`bestMultiplier` etc. on the
  players endpoint); progress definitions live in `src/badges.ts`.
- Headless playtest: `npx tsx scripts/sim-test.ts` runs the real game
  loop for minutes of sim time and checks formations, powers, and pickup variety.
- If you change anything in `SCORING` (config.ts), keep the anti-cheat ceiling in
  `server/validate.mjs` in sync, or legitimate runs will be rejected.
- Direct control (no inertia) is the default flight model everywhere; classic
  inertia thrust-and-drift is a settings opt-in. Phone tilt (`TILT` in
  config.ts, sensor in `src/tilt.ts`) is offered as a choice on Launch
  (touch devices with a motion sensor; retries keep the pick). iOS motion
  permission is only ever requested from that in-context Tilt pick (a real
  click) — never at boot; Safari caches a denial for the whole session, so an
  out-of-context prompt permanently wedges tilt. There is no
  boost — one flight speed (`DIRECT_CRUISE` by the Direct speed setting), and
  the phone virtual stick spawns anywhere on the screen. Every run is
  tagged by platform: `desktop` (keyboard), `touch` (phone virtual stick), or
  `tilt` (phone tilt — phone only by construction), and all leaderboards rank
  the three separately (`mode` column in scores, `?mode=` on leaderboard
  endpoints; UI labels in `MODE_LABEL` in community.ts: Desktop / Phone /
  Phone tilt). The Inertia setting is flavor only and never affects which
  board a run lands on.
- The Starshell rams with the whole drawn shell (`POWERS.starshell.killRadius`),
  not the ship hull radius.
- Boot flow (fullgame side): tap-to-enter gate (unlocks audio) → ~5s canvas
  cinematic intro (`drawIntroFx` in render.ts, score in `audio.intro`) → menu.
  The menu has a
  "How to play" tutorial (`src/tutorial.ts`): a sandbox world
  (`createWorld(..., sandbox=true)` — no spawner/mines/timed pickups) with
  scripted beats (fly → frozen drone exhibit → they hunt → shockwave → goal);
  each beat's message pauses the world until tapped (`Tutorial.waiting`).
- Badges: milestone awards evaluated server-side on score submission
  (`server/badges.mjs` has the checks, `src/badges.ts` the display data —
  keep the ids in sync). Shown on pilot profiles; every leaderboard row opens
  a public pilot record (`GET /api/players/:callsign`) with world ranks, a
  score-history sparkline, and wingmate actions.
- Wingmates (friends): mutual-accept friend list (`friends` table,
  `/api/friends/*` endpoints), with a squadron leaderboard (you + friends,
  per mode), a recent-flights feed, and a menu-button dot for pending
  requests (`pendingFriends` on `GET /api/me`).
- Analytics: every finished run (anonymous included) is logged to the `runs`
  table (`POST /api/runs` for signed-out players), and every page load fires
  a cookie-less visit beacon (`POST /api/visit`, one per browser session:
  hashed IP, country via cf-ipcountry or locale guess, referrer hostname,
  daily/fullgame, touch/desktop → `visits` table). `/admin` on the community
  server is the traffic + stats + feedback dashboard (Bearer `ORION_ADMIN_KEY`
  only — no `?key=` param); crash reports arrive via `/api/feedback` with a
  `[crash]` prefix and show up there too.
