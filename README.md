# Orion (web)

A rebuild of the Orion Unity prototype as a dependency-free TypeScript + Canvas web game.

An inertia-based survival arcade game: pilot your ship with thrust and rotation through
a bounded arena while drone swarms close in. No guns — survive with piloting skill and
defensive power pickups:

- **Aegis Shield** — stays on the ship until it absorbs a hit (a banked extra life), then detonates, clearing nearby drones
- **Shockwave** — kills every drone in a radius, and the blast zone stays lethal for ~1s after (a nuclear linger)
- **Pulse Shot** — charges up (~1s), then fires a piercing bolt forward
- **Afterburner** — charges, then dashes you forward through enemies, leaving a burning trail that stays lethal for ~2.5s; you get a 1s invincibility grace on arrival
- **Cryo Field** — flash-freezes all drones in a big area; fly into frozen drones to shatter them
- **Missile Swarm** — launches a volley of guided missiles in all directions; each impact detonates a small area blast that lingers ~1s
- **Starshell** — a golden shell that makes you invulnerable for ~6s and ram-kills everything you touch
- **Arc Lightning** — zaps the nearest enemy, then chain-jumps through nearby drones until nothing is close enough to continue
- **Autocannon** — mounts a turret on the ship for ~6s that auto-fires tracer rounds (~8/s) at the nearest enemy in range
- **Meteor Storm** — explosions rain down for ~4s, biased toward drone clusters, each leaving a crater that stays lethal for ~1s

(Magnet and Vortex exist in the code but are benched from the drop rotation
for now — `BENCHED_POWER_IDS` in `src/config.ts`; vortex's open-vortex
invulnerability made it too strong even as a rare drop.)

Pickups spawn with weighted frequency (`POWER_SPAWN_WEIGHTS` in `src/config.ts`):
shield/shockwave are common safety nets, freeze and afterburner are rarer. Every
power can spawn from minute zero (`POWER_MIN_MINUTES` is empty), and bad-luck
protection demotes a power's weight each time it drops so the whole roster
appears over a run. Pickups drift slowly across the arena (soft wall bounces),
two are dealt at launch, drops come faster as the difficulty climbs, and a
refill floor hurries the next drop whenever fewer than two are live (disabled
on Daily Patrol to protect the shared seed). Skill kills pay more: pulse kills are
worth 2x points (with an escalating bonus when one bolt kills 3+), and
shattering frozen drones pays 1.5x points and builds the multiplier twice as
fast. **Grazing** pays too: shaving past a live drone (or threading a tight
wall gap) scores points, bumps the multiplier, and resets its decay — a
skill-based scoring lane alongside kills. Each drone can only be grazed once
per ~1.5s, and no graze pays while a protection (shield, starshell, dash,
vortex) makes the near-miss risk-free.

Enemies:

- **Drones** — chase you relentlessly; smaller ones are slightly slower, larger ones
  slightly faster. Individual drones shamble like zombies — the threat is the
  crowd, and the game is about reading the swarm and finding the way out, not
  out-running anything. The swarm grows dense fast and the escalation never
  plateaus — spawn rate and formation frequency/size keep climbing until the
  run ends, so every run has an ending. (Scripted walls and serpents keep a
  brisker marching pace over the slow baseline, so sweeps still sweep.) Free drones also periodically
  **assemble**: a handful steer into a line or vee "ship", hold the shape for a
  beat (glowing hot orange), then charge you at boosted speed before disbanding.
  Most spawns telegraph on-screen (a red glow warns ~1s before the drone pops,
  and the ring formation closes in around you); some still sneak in from the edges.
  Formations are weighted (`SPAWNER.formations.weights`) and heavier patterns
  unlock as the run deepens: **line**, **ring**, and **burst** from the start,
  then Tilt to Live-style **walls** (a dot wall with escape gaps marching across
  the arena), **swarms** (a loose school drifting across as one organic blob),
  **serpents** (a dotted train whose head carves a curve before the whole train
  releases to homing), **tight rings** (smaller, denser closing circles),
  **corner crosses** (bursts from all four corners), **mega walls** (a slow
  3-row-thick wall spanning the arena with one narrow gap — thread it or blast
  through), and **pincers** (two walls converging from opposite edges).
- **Floating mines** (after 30s) — stationary hazards that arm after a brief fade-in and despawn after a while; lethal on contact, but destroying one with a power chain-explodes everything nearby

Kills feed the score multiplier (up to **x10**) — the ship glows brighter gold the
higher it climbs: it climbs fast on streaks but drains faster the higher it is,
and kill chains pay escalating bonuses. All scoring also scales with **danger pay**
(uncapped, `1 + 0.5/min`): the deeper into the escalation you survive, the more
every second and every kill is worth. High scores come from aggressive, risky
play deep into the run.

## Game modes

- **Classic** — the normal run: a gentle opening (5-drone burst, first
  formation delayed a beat, density ramps over ~2.5 min) that escalates
  forever.
- **Iron Rain** — flat endurance at max difficulty from second zero: the
  spawner behaves as if the run were already ~6 minutes deep and stays there.
  Opens with an immediate mega-wall, leans hard on walls / pincers / tight
  rings with tighter spacing and smaller escape gaps, and ~15% of walls spawn
  with **no gap at all** (survivable only via powers). New-pilot grace never
  applies. Built to skip the warm-up.

Both modes have their own launch button on the menu (the pick persists across
retries), their own leaderboards, and their own local PBs — the NEW RECORD
celebration and PB delta always compare like-for-like. Daily Patrol is always
Classic.

## Run

```bash
npm install
npm run dev      # game dev server (proxies /api to the community server)
npm run server   # community server (leaderboards / accounts) on :8787
npm run build    # type-check + production build to dist/
npm run start    # production: community server + serves dist/ on :8787
```

Without the community server the game still works fully offline — the
community buttons simply don't appear.

## Community

- **Leaderboard** — global board (best run per pilot), filterable with
  dropdowns by game mode (Classic / Iron Rain), platform, and country. Runs
  are tagged by the platform they were played on (`desktop` = keyboard,
  `touch` = phone virtual stick, `tilt` = phone tilt) and by game mode
  (`game_mode` column on `scores`/`runs`, `?gameMode=` on the leaderboard
  endpoints); ranks, PB deltas, and the game-over gap-to-goal are all scoped
  per game mode. Pilot records grow an Iron Rain section once a pilot has
  Iron Rain runs. The Inertia setting is flavor only — it doesn't change
  which board a run lands on.
- **Daily Patrol** — a shared-seed daily run: the gameplay RNG is seeded from
  the UTC date (`setRunSeed` in `src/math.ts`), so every pilot faces the same
  opening script that day. Daily runs land on a per-day board
  (`GET /api/leaderboard/daily`, `daily_date` column on `scores`; the "Daily
  Patrol" tab in the Leaderboard screen) *and* still count all-time. Unlimited
  attempts; the board resets at UTC midnight. Launched from the menu's Daily
  Patrol button, which shows today's leader.
- **Arenas** — private leaderboards: create one, share its 6-letter invite code.
- **Wingmates (friends)** — add pilots by callsign (mutual accept; requests can
  be sent from any pilot record too). The Wingmates screen has a squadron
  leaderboard (you + friends, per mode), a recent-flights activity feed, and
  request management; the menu button shows a dot when a request is waiting
  (`pendingFriends` on `GET /api/me`, endpoints under `/api/friends/*`).
- **Accounts** — Google sign-in (native one-tap button, the primary path) or
  callsign + password. Country is guessed from the browser locale/timezone,
  always confirmable and editable in the profile — no external geolocation service.
  Unsigned players get an inline prompt on the game-over screen: entering just a
  name creates a real passwordless account (`POST /api/auth/guest`), files the
  finished run on the boards, and keeps the device signed in; a password can be
  added later from the profile (`PATCH /api/me`, only while none is set).
- **Badges** — 17 milestone awards (definitions in `server/badges.mjs`, display
  data in `src/badges.ts`), from easy (First Flight, Space Dust — die inside
  10s) through rare (Swarm Reaper — 1,000 kills in a run; Galaxy's Finest —
  hold world #1) to career grinds (10,000 lifetime kills). Earned on score
  submission, celebrated on the game-over screen, and shown as a collection on
  the pilot profile (locked ones are dimmed with an unlock hint).
- **Public pilot records** — every leaderboard row is clickable and opens that
  pilot's read-only record (`GET /api/players/:callsign`): best scores, world
  ranks, playtime, a score-history sparkline of the last 40 ranked runs, earned
  badges, and a wingmate add/accept/remove action for signed-in viewers.
- **Anti-cheat** — submissions are sanity-checked server-side against the game's
  scoring ceilings (`server/validate.mjs`, mirrors `SCORING` in `src/config.ts`)
  and rate-limited.

Data lives in `server/orion.db` (SQLite via `node:sqlite`, zero npm dependencies;
requires Node 22.5+).

### Analytics & admin dashboard

Every finished run is logged to a `runs` table — signed-in runs through
`POST /api/scores`, anonymous runs through `POST /api/runs` (validated and
rate-limited; analytics only, never the leaderboards). Set `ORION_ADMIN_KEY`
in the environment (or `server/.env`) and open **`/admin`** for a dashboard:
pilot counts, runs per day, game-length and score distributions
(average/median/range/percentiles), kills per minute, per-board and
touch-vs-desktop splits, badge holder counts, and all player feedback. The
same data is available as JSON at `GET /api/admin/stats` and
`GET /api/admin/feedback` (Bearer key or `?key=`).

## Deploy (surviveorion.com)

One process serves everything (game + API + SQLite). Two options:

**Docker** (works on Fly.io, Railway, Render, any VPS):

```bash
docker build -t orion .
docker run -d -p 8787:8787 -v orion-data:/data --restart unless-stopped orion
```

**Bare Node** (VPS with Node 22.5+):

```bash
npm ci && npm run build
ORION_SERVE_DIST=1 PORT=8787 node server/index.mjs
```

Then point DNS: an `A` record for `surviveorion.com` (and `www`) at the host,
with the platform or a reverse proxy (Caddy/nginx/Cloudflare) terminating HTTPS.
The SQLite file (`ORION_DB`, default `/data/orion.db` in Docker) is the only
state — persist and back up that one file.

### Google sign-in (the primary path)

The Pilot Login screen leads with Google's native button (Google Identity
Services): one tap, in-page, no redirects — the smoothest path on phones.
New Google pilots confirm their country after the first sign-in; the
callsign + password form stays available behind a "sign in the old way" link.

The production OAuth client id is baked in as the server default (client ids
are public by design). To use a different one, create an OAuth **Web
application** client ID in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
(free, no billing; add your origins, e.g. `http://localhost:5173` and your
production URL) and set `GOOGLE_CLIENT_ID` in the environment or `server/.env`.
Setting it to an empty string disables Google sign-in.

### Clerk sign-in (legacy, server-side only)

The client no longer offers Clerk (its hosted modal meant an extra redirect
hop through Clerk's domain — clunky on phones). The server still verifies
Clerk session JWTs on `POST /api/auth/clerk` (`server/clerk.mjs`) when
`CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` are set, so accounts created
through Clerk keep working if the UI path is ever restored.

## Controls

Direct control is the default: the ship flies the way you point, no drift.
There is no boost — one flight speed, tuned by the Direct speed setting.

| Action | Desktop (default) | Touch (default) |
| --- | --- | --- |
| Fly | `WASD` / arrows — ship goes that way | drag anywhere on screen — ship goes that way |
| Pause | `Esc` / `P` | pause button |

Settings has an **Inertia** toggle for classic thrust-and-drift piloting
(`W`/`↑` thrust, `A`/`D` turn, drag heading on touch) — the original flight
model, now the opt-in add-on. A **How to play** tutorial on the menu walks new
pilots through flying, drones, and powers in a sandbox with static (frozen)
enemies — each lesson pauses the world behind a message you tap to dismiss —
and the game boots through a tap-to-enter gate into a ~5s cinematic
intro (hyperspace rush, swarm fly-by, title slam) before the menu.

Classic opens gently (a 5-drone burst, the first formation after a breath)
and ramps up over the first couple of minutes; Iron Rain skips straight to
the deep end. A player's
first ~3 runs on a device get a grace curve (`grace` on `World`, run counter
in `src/save.ts`): half the opening burst, first formation delayed ~8s, and a
gentler ambient ramp for the first minute — scoring is untouched, and Daily
Patrol and Iron Rain runs never use grace. Dying is fast to leave behind: the death
cinematic is tap/key-skippable after 0.5s, **Fly again** (and Space/Enter on
the game-over screen) retries with a 0.5s quick warp instead of the full
cinematic, and passing your personal best mid-run fires a NEW RECORD
celebration.

## Mobile

The game is an installable PWA: on a phone, "Add to Home Screen" gives a
full-screen app with its own icon (`public/manifest.webmanifest` +
`public/icons/`). The HUD and UI respect notch/home-indicator safe areas,
the canvas tracks `visualViewport` resizes (iOS browser chrome, rotation),
and the page blocks pinch/double-tap zoom.

Phones default to the **virtual stick** — the stick spawns wherever your
finger lands, anywhere on the screen. On devices with a motion sensor,
tapping **Launch** first asks Touch or **Tilt** — the tribute to Tilt to
Live: lean the phone to fly (retries keep the choice; it's also switchable
in Settings). Tilt maps directly to velocity (`TILT` in `src/config.ts`)
and needs the motion-sensor permission on iOS (requested when picked) and
a secure context, so test it against a deployed build rather than
plain-HTTP LAN dev. Tilt runs rank on their own Phone tilt leaderboard,
separate from phone touch and desktop.

**Direct speed** (Low/Med/High) tunes the cruise pace of direct control; on
phones, **Tilt sense** tunes how much lean reaches full speed. Desktop
Settings also has **Key bindings**: click an action, press a key to rebind it
(a key used elsewhere is cleared from the other action), or Reset defaults
for WASD + arrows / Space / Esc+P.

## Structure

All gameplay tuning lives in `src/config.ts` (the "Inspector" equivalent).

| Module | Role (Unity counterpart) |
| --- | --- |
| `src/ship.ts` | Ship physics + boost (`ShipController`) |
| `src/input.ts` | Keyboard, virtual stick, and tilt input sampling |
| `src/tilt.ts` | Device-orientation sensor: iOS permission, calibration, axis remap |
| `src/physics.ts` | Arena bounds clamp, circle collision |
| `src/enemies.ts` | Drones, difficulty ramps, formations (`EnemyDrone`, `EnemySpawner`) |
| `src/mines.ts` | Floating mines: spawning, arming, chain explosions |
| `src/popups.ts` | Floating score / power-name text |
| `src/powers.ts` | Power effects (`PowerManager` + effect ScriptableObjects) |
| `src/pickups.ts` | Pickup spawning + magnet pull (`PickupSpawner`, `PowerPickup`) |
| `src/scoring.ts` | Score + kill multiplier (`GameRules`) |
| `src/gameState.ts` | World state, fixed-timestep tick, collisions |
| `src/render.ts` | Canvas renderer: starfield, entities, HUD, cinematics (warp, intro) |
| `src/audio.ts` | Procedural Web Audio SFX + music loop |
| `src/ui.ts` | Menu / pause / game-over / tutorial overlays |
| `src/tutorial.ts` | Flight-school sandbox: scripted beats over a spawner-free world |
| `src/api.ts` | Community server client (auth, scores, arenas, badges) |
| `src/community.ts` | Leaderboard / arenas / sign-in / pilot record screens |
| `src/badges.ts` | Badge display metadata (ids mirror `server/badges.mjs`) |
| `src/countries.ts` | Country list, flags, offline geo guess |
| `server/` | Zero-dependency Node community server (http + sqlite) |

Music (Suno-generated, from the project's inspiration assets), one looping track per screen:

- Menu: `public/music/empire-of-the-stars.mp3`
- Gameplay: `public/music/empire-of-the-stars-battle.mp3` (alternate take of the same theme)
- Game over: `public/music/fallen-honor.mp3`
- Tutorial: synthesized live in `src/audio.ts` (chill ambient pads, no file)
