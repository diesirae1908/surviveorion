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
- **Starshell** — a golden shell that makes you invulnerable for ~6s and ram-kills everything you touch; only appears after 2.5 minutes as a late-game pressure valve
- **Arc Lightning** — zaps the nearest enemy, then chain-jumps through nearby drones until nothing is close enough to continue

Pickups spawn with weighted frequency (`POWER_SPAWN_WEIGHTS` in `src/config.ts`):
shield/shockwave are common safety nets, freeze and afterburner are rarer, and
late-game powers are time-gated (`POWER_MIN_MINUTES`). Pickup drops come faster
as the difficulty climbs. Skill kills pay more: pulse kills are worth 2x points
(with an escalating bonus when one bolt kills 3+), and shattering frozen drones
pays 1.5x points and builds the multiplier twice as fast.

Enemies:

- **Drones** — chase you relentlessly; smaller ones are slightly slower, larger ones
  slightly faster. The swarm grows and speeds up over time, and the escalation never
  plateaus — spawn rate, drone speed, and formation frequency/size keep climbing until
  the run ends, so every run has an ending.
  Most spawns telegraph on-screen (a red glow warns ~1s before the drone pops,
  and the ring formation closes in around you); some still sneak in from the edges.
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
  Runs are tagged by control scheme (`classic` = keyboard/stick, `tilt` = phone
  tilt controls) and every leaderboard ranks the two modes separately.
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

| Action | Desktop | Touch |
| --- | --- | --- |
| Thrust | `W` / `↑` | drag on left half — the ship rotates toward the drag direction and thrusts; drag distance = power |
| Turn | `A` `D` / `←` `→` | (same drag — direction is the heading) |
| Boost | `Space` (hold) | hold right half |
| Pause | `Esc` / `P` | pause button |

## Mobile

The game is an installable PWA: on a phone, "Add to Home Screen" gives a
full-screen app with its own icon (`public/manifest.webmanifest` +
`public/icons/`). The HUD and UI respect notch/home-indicator safe areas,
the canvas tracks `visualViewport` resizes (iOS browser chrome, rotation),
and the page blocks pinch/double-tap zoom.

Phones default to **tilt controls** (Tilt to Live style): the first launch
offers to enable them — lean the phone to fly, touch and hold anywhere to
boost. Tilt maps directly to velocity (no inertia, `TILT` in `src/config.ts`),
so tilt runs compete on their own leaderboards, separate from classic
keyboard/stick runs. The virtual stick (drag left half to fly, hold right half
to boost) remains as a fallback and a settings toggle, and counts as classic.
Desktop keyboard play is unchanged. Tilt needs the motion-sensor permission on
iOS (requested from the enable tap) and a secure context, so test it against a
deployed build rather than plain-HTTP LAN dev.

Settings also has an **Inertia** toggle for classic controls: OFF switches
to directional WASD/arrows (ship goes the way you press, no drift) with two
speeds — cruise normally, hold Space for full speed. Those runs score on the
Tilt leaderboard to keep the classic board honest. **Direct speed** (Low/Med/High)
tunes the cruise pace; on phones, **Tilt sense** tunes how much lean reaches
full speed.

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
| `src/render.ts` | Canvas renderer: starfield, entities, HUD |
| `src/audio.ts` | Procedural Web Audio SFX + music loop |
| `src/ui.ts` | Menu / pause / game-over overlays |
| `src/api.ts` | Community server client (auth, scores, arenas) |
| `src/community.ts` | World Arena / arenas / sign-in screens |
| `src/countries.ts` | Country list, flags, offline geo guess |
| `server/` | Zero-dependency Node community server (http + sqlite) |

Music (Suno-generated, from the project's inspiration assets), one looping track per screen:

- Menu: `public/music/empire-of-the-stars.mp3`
- Gameplay: `public/music/empire-of-the-stars-battle.mp3` (alternate take of the same theme)
- Game over: `public/music/fallen-honor.mp3`
