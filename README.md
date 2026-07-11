# Orion (web)

A rebuild of the Orion Unity prototype as a dependency-free TypeScript + Canvas web game.

An inertia-based survival arcade game: pilot your ship with thrust and rotation through
a bounded arena while drone swarms close in. No guns — survive with piloting skill and
defensive power pickups:

- **Aegis Shield** — stays on the ship until it absorbs a hit (a banked extra life), then detonates, clearing nearby drones
- **Shockwave** — instantly kills every drone in a radius
- **Pulse Shot** — charges up, then fires a piercing bolt forward
- **Magnet** — pulls pickups toward you for a few seconds
- **Afterburner** — charges, then dashes you forward through enemies, leaving a burning trail that stays lethal for ~2.5s; you get a 1s invincibility grace on arrival
- **Cryo Field** — flash-freezes all drones in a big area; fly into frozen drones to shatter them
- **Missile Swarm** — launches a volley of guided missiles in all directions that curve toward the nearest enemies
- **Starshell** — a golden shell that makes you invulnerable for ~6s and ram-kills everything you touch
- **Arc Lightning** — zaps the nearest enemy, then chain-jumps through nearby drones until nothing is close enough to continue
- **Autocannon** — mounts a turret on the ship for ~6s that auto-fires tracer rounds at the nearest enemy in range
- **Meteor Storm** — explosions rain down for ~4s, biased toward drone clusters, each clearing a small radius
- **Vortex** — drops a singularity at your position that drags drones inward for ~3s, devouring (and scoring) everything that reaches the core, then collapses and kills whatever is still caught nearby

Pickups spawn with weighted frequency (`POWER_SPAWN_WEIGHTS` in `src/config.ts`):
shield/shockwave are common safety nets, freeze and afterburner are rarer. Every
power can spawn from minute zero (`POWER_MIN_MINUTES` is empty), and bad-luck
protection demotes a power's weight each time it drops so the whole roster
appears over a run. Pickup drops come faster as the difficulty climbs. Skill kills pay more: pulse kills are
worth 2x points (with an escalating bonus when one bolt kills 3+), and
shattering frozen drones pays 1.5x points and builds the multiplier twice as
fast.

Enemies:

- **Drones** — chase you relentlessly; smaller ones are slightly slower, larger ones
  slightly faster. The swarm grows and speeds up over time, and the escalation never
  plateaus — spawn rate, drone speed, and formation frequency/size keep climbing until
  the run ends, so every run has an ending.
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

- **World Arena** — global leaderboard (best run per pilot), filterable by country.
  Runs are tagged by control physics (`classic` = inertia thrust-and-drift,
  `tilt` = direct control: phone tilt or the default no-inertia mode) and every
  leaderboard ranks the two modes separately.
- **Arenas** — private leaderboards: create one, share its 6-letter invite code.
- **Accounts** — callsign + password, Clerk sign-in (email/Google, see below),
  or direct Google sign-in. Country is guessed from the browser locale/timezone,
  always confirmable and editable in the profile — no external geolocation service.
- **Anti-cheat** — submissions are sanity-checked server-side against the game's
  scoring ceilings (`server/validate.mjs`, mirrors `SCORING` in `src/config.ts`)
  and rate-limited.

Data lives in `server/orion.db` (SQLite via `node:sqlite`, zero npm dependencies;
requires Node 22.5+).

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

### Clerk sign-in (recommended)

1. Grab the **Publishable key** and a **Secret key** from the
   [Clerk dashboard](https://dashboard.clerk.com) → API keys.
2. Put them in `server/.env` (gitignored) or the environment:

```
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

The "Sign in with Clerk" button appears automatically. The client loads
`clerk-js` from your Clerk Frontend API and opens Clerk's modal (email code,
Google, or whatever you enable in the dashboard). The server verifies the
Clerk session JWT locally against the instance JWKS and issues its own Orion
session token; the secret key is only used to fetch the display name for new
pilots. For production, create a **live** instance in Clerk, add
`surviveorion.com` to its allowed origins, and swap in the `pk_live_`/`sk_live_`
keys.

### Google sign-in (optional)

1. Create an OAuth **Web application** client ID in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (add your origins, e.g. `http://localhost:5199` and your production URL).
2. Run the server with it: `GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com npm run server`

The Google button appears automatically when configured. New Google pilots are
asked to confirm their country after the first sign-in.

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

The arena gets swarmy fast: an 8-drone opening burst, the first formation
inside ~10s, and near-full-size patterns by the 20-second mark.

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
plain-HTTP LAN dev. Tilt runs rank on the Tilt/Direct leaderboard, same
as the default no-inertia mode.

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
| `src/api.ts` | Community server client (auth, scores, arenas) |
| `src/community.ts` | World Arena / arenas / sign-in screens |
| `src/countries.ts` | Country list, flags, offline geo guess |
| `server/` | Zero-dependency Node community server (http + sqlite) |

Music (Suno-generated, from the project's inspiration assets), one looping track per screen:

- Menu: `public/music/empire-of-the-stars.mp3`
- Gameplay: `public/music/empire-of-the-stars-battle.mp3` (alternate take of the same theme)
- Game over: `public/music/fallen-honor.mp3`
