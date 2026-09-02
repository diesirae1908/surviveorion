## CORE (shared, Lucas, 2026-09-02: obey this block on every message)

You are the **repo expert** for this repository. Lucas's assistant **Sam** (`~/Documents/Sam`) is the PM. Sam holds Atome, personal-project, and cross-tool context and dispatches work here. You implement here. You do not act as Sam. You never write Sam's `memory/` files.

1. **NEVER DELETE OR MOVE ANYTHING.** Not as cleanup, not to get a clean git state. Untracked files are user data. `rm`, `git clean`, and stash `-u` are forbidden unless Lucas named that exact path in the conversation that dispatched you. If the tree is dirty, stop and tell Sam; isolate with `git worktree add` and leave the dirty checkout untouched.
2. **SAM IS THE PM.** You are the expert for *this* repo only. Read this `AGENTS.md` first. If dispatched and in doubt (confirm-first territory, product calls, cross-tool tradeoffs), return the question to Sam. Do not invent a decision. Do not edit other sibling repos.
3. **NO EM DASHES.** Never U+2014. Use commas, colons, parentheses, or a period.
4. **ANSWER SHORT.** JOURNAL and commits: short and factual.
5. **ALWAYS JOURNAL.** Every substantive change appends a dated entry to this repo's `JOURNAL.md` (newest first: what, why, commit hash, follow-ups), committed with the work. Do not write `~/Documents/Sam/memory/`.
6. **CONFIRM FIRST** via Sam before customer-facing, financial, destructive, or public actions, and before deploys that change customer behavior, touch money, or run destructive migrations. Land app-repo work on the long-lived `dev` branch unless the brief says otherwise.

If you retain nothing else, retain these six. Rule 1 above all.

---

# Orion — agent instructions

Orion is a daily dodging game: drone swarms close in, you have no gun, and the
only thing that keeps you alive is moving well. Live at **surviveorion.com**.
(The ship has inertia and that is what gives the movement its feel, but it is
not the pitch. Lucas's call, 2026-08-24: the old "inertia arcade" framing is
the previous game.)

**This repo is the game.** `orion-web` (GitHub `diesirae1908/surviveorion`),
local path `~/Documents/games/orion-web` since the 2026-08-23 move. It is the
only live Orion: TypeScript + Canvas + Vite client, zero-dependency Node
community server (leaderboards, accounts, arenas; SQLite via `node:sqlite`,
Node 22.5+), PWA.

Every other thing called Orion is a dead prototype, not a sibling version. The
Unity prototype sits at `~/Documents/personal/_archive/unity/Orion/` and is
archived: read it for history, never for current behaviour, and never port from
it without saying so. Do not treat anything outside this repo as a source of
truth about how the game works.

## Deploying — read before you push

**Production runs on Render** (service `surviveorion`), Docker, **auto-deploying
from `main`**. `git push origin main` IS a production deploy to a public game
with real players — Render rebuilds in ~2 minutes. Verify a deploy by checking
that the JS bundle hash served at surviveorion.com changed.

**QA / staging:** long-lived remote `dev` auto-deploys to Render `surviveorion-dev`
(`https://surviveorion-dev.onrender.com`, own `/data` disk). Promote `dev` → `main`
only when the build is good. `?mutator=` / `?day=` preview is allowed on the
staging host (and localhost), not on surviveorion.com.

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

## Social pipeline

`social/` is the harvest → edit → caption → queue pipeline (formerly the standalone
`orion-social` repo). Node 22 + ffmpeg. Strategy in `brand/SOCIAL.md`; spec in
`social/SPEC.md`. Secrets in `social/.env` (covered by root `.gitignore`). Never post
without human-approved files in `social/out/approved/`. Run tests with
`cd social && npm test`.

Lucas-only clip inbox (Grok cutter, no Drive OAuth): signed-in allowlist
(`CLIP_INBOX_GOOGLE_SUB` / `CLIP_INBOX_CALLSIGN` on Render) POSTs the
`webm`+`.json` pair to `POST /api/clip-inbox`. Operator backfill uses the same
path with Bearer `ORION_ADMIN_KEY` (no player session). Bytes live on the
existing `/data` disk at `/data/clip-inbox`. Grok lists pending at
`GET /clip-inbox/<CLIP_INBOX_SECRET>/` and marks done with
`POST /clip-inbox/<CLIP_INBOX_SECRET>/consumed` `{id}`. Consume never deletes.
The same allowlist unlocks Crew Rehearsal, Record runs, and Save clip.
On iPhone / iPad, Record encodes H.264 MP4 and Save clip opens the share
sheet (Save Video lands it in Photos for CapCut). Desktop still downloads
WebM to the browser Downloads folder. The JSON sidecar is not a download;
it only travels with Send to inbox.
Other players never see those controls. A leftover
`?rehearsal=director` browser flag does not count.

Grok uploads finished cuts (not the raw inbox pair) to
`POST /clip-inbox/<CLIP_INBOX_SECRET>/cuts` (multipart `video` plus optional
`name`, `format`, `mutator`, `sourceId`, `patrolDate`, `notes`, `poster`).
Cuts live at `/data/clip-inbox/cuts/<id>/` and are served unlisted at
`GET /clip-cuts/<id>/cut.mp4` (unguessable id, not the inbox secret).
If `NOTION_TOKEN` is set, the server creates a Clips row (Kind `Cut`) with
the hosted URL. Share the Notion integration on the Clips database.
Nothing auto-posts to Buffer.

## Brand

`brand/` is the ORION brand kit (v1.0, 2026-08-24). It is the source of truth
for the logo, colour, type and voice, and it was derived from this repo rather
than invented beside it.

- `brand/BRAND.md`: the book. Positioning, the three pillars, naming, logo
  rules, colour with measured WCAG ratios, type, layout, motion.
- `brand/VOICE.md`: three named voices (Mission Control for in-game strings,
  The Log for the site and patch notes, Wingmate for replies to pilots).
- `brand/COPY-BANK.md`: approved lines, ready to paste.
- `brand/tokens/`: `orion.tokens.css` and `.json`.
- `brand/assets/`: logo lockups, app icons, OG image, social header, share
  card template, medals, palette sheet, SVG and PNG.
- `brand/brand-book.html`: all of the above as one page.
- `brand/scripts/`: the generators. Run them from `brand/`; they are `.cjs`
  because this repo is `"type": "module"`.

Two rules that bite in code:

1. **Rising Red `#c41e3a` fails WCAG AA for body text on Void** (3.37:1). Red
   *text* uses Alarm `#ff4455` (5.83:1). Rising Red is for the core and the
   swarm.
2. **Dust `#8a7a55` clears AA on Void (4.69) but fails on Deep Space (4.42).**
   On raised surfaces use Bronze `#aa8844`.

If you change a colour in `src/config.ts` `PALETTE`, change it in
`brand/tokens/orion.tokens.css` too. They are meant to agree.
`brand/BRAND.md` §11 lists what in this repo still disagrees with the kit.

## Recording your work

Every substantive change gets:

1. A clear, **why-focused** commit message (this repo's history is the
   design log — look at `git log` for the style).
2. A dated entry **appended to `JOURNAL.md`** at the repo root (newest first,
   short and factual: what changed, why, commit hash, follow-ups), committed
   together with the work.

## Guardrails

- **Never delete Lucas's local video folders** (`final_videoasset/`,
  `Recordings_raw/`, and the older `Final_videoasset/` / `Recordings raw/`
  names). They are gitignored on purpose. If this checkout is dirty, isolate
  with `git worktree add`. Do not `git clean`, do not `rm`, do not stash `-u`.
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

## Adding a Daily Mutator

`src/mutators.ts` is append-only by design (see `scripts/test-mutators.ts` and
JOURNAL.md, mutator-hardening pass): appending a 23rd entry must never
reshuffle any past Daily Patrol day. Read `mutators.ts`'s header comment
first, then:

- **Tier A, override-only.** A new `MUTATOR_POOL` entry that reuses existing
  override knobs (rate/scale/weight/interval multipliers, `firstOf`
  replacements). Set `availableFrom` to a **future** patrol date, never in the
  past, never "today" if pilots could already have scores on that date.
  Pick tags honestly (see "Sunday tags" below) and a `difficultyFactor` for
  the medal thresholds.
- **Tier B, new runtime system.** Needs a new override flag on
  `MutatorOverrides` plus a getter (follow the pattern of `meteorRainActive`
  / `mutatorMeteorRainActive`), and a dedicated module (copy `starfall.ts` for
  an environmental effect, or `creatures.ts` for a direct-spawn choreography
  day). Gate the new behavior on the flag/getter, never on `if (id ===
  "your-id")` anywhere outside `mutators.ts` (`test:mutators` greps for this).
  Double-check the seeded-draw discipline in the header comment: no extra or
  missing `rand()`/`scheduleRand()` draws versus an ordinary day, or Daily
  Patrol desyncs across play styles. Add it to the kind classification map in
  `scripts/test-mutators.ts` (`override` / `creature` / `environmental`).
- **Frozen history, never do these:** reorder `MUTATOR_POOL`, change
  `availableFrom` on a shipped mutator, or make selection use
  `% MUTATOR_POOL.length` again (it must always be `% eligible.length`, see
  `eligiblePool` in `mutators.ts`).
- **Minimum tests before shipping:** `npm run test:mutators` still green
  (snapshot untouched for every existing date), the new id is classified,
  and `npx tsx scripts/sim-test.ts` still passes (section "all N pool
  mutators boot + survive 60s" already loops the whole pool, no per-mutator
  test needed unless it's Tier B, which wants its own determinism check like
  STARFALL's or MENAGERIE's).
- **Tripwire:** if the mutator needs a new seeded `rand()`/`scheduleRand()`
  draw that ordinary days don't make, stop and ask (see PM model above):
  that is exactly the class of change that can desync Daily Patrol.
- **Mutator-only powers** (`MUTATOR_ONLY_POWER_IDS` in config.ts): live in the
  engine, never enter Classic / Iron Rain / Training / the Powers codex.
  A day that needs one sets `extraPowerIds` (same hook as Vortex on
  SINGULARITY). Afterburner stays benched in the base pool.
- **Field guide:** unlisted `/guide.html`, built from `MUTATOR_POOL` so it
  cannot go stale. Fly links still use `?mutator=` + `?rehearsal=director`
  (localhost tuning). On production, flying a future day requires the
  clip-inbox allowlist session.

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
  identical formation/power/mine script). Daily runs seed from the patrol date
  (midnight America/Los_Angeles), submit with `daily: true`
  (server stamps `daily_date` on `scores`), rank on `GET /api/leaderboard/daily`
  (a tab in the Leaderboard screen, formerly "World Arena") and still count
  all-time. Menu button shows today's leader.
- Site split ("Orion Daily" is the front door): **the root of
  surviveorion.com is the daily-only game**; the full arcade game (Classic,
  Iron Rain, arenas, wingmates, pilot login) lives at **`/fullgame`**
  (`FULL_GAME`/`DAILY_ONLY` in main.ts; `?fullgame=1` works anywhere, same
  build/deploy — the server SPA-fallbacks unknown paths to index.html). The
  daily side boots straight to a minimal Daily Patrol lobby — Launch /
  Training Ground / How to play / Powers, today's board, a profile chip
  (sign in / callsign, country, wingmates) plus a Feedback
  footer link (the /fullgame door is unlisted — URL only — since the public
  Reddit launch; no cinematic; unsigned players can still get on
  the board via the game-over guest pseudo prompt), caps dailies at 3
  attempts per Pacific day (`orion.dailyAttempts` in save.ts client-side, and
  the server independently rejects a 4th daily score per account per patrol day —
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
  only, no `?key=` param), served from `server/admin.html`. The date picker
  only scopes the Selected day report; All time / rolling sits below and
  ignores it. The public daily board on that report splits real scores from
  filler bots (virtual, not visits, not runs). Crash reports arrive via
  `/api/feedback` with a `[crash]` prefix and show up there too.
