# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Casual-to-competitive arcade players looking for a quick daily skill challenge — primarily on mobile, played in short sessions. The Wordle model: one shared run per UTC day, 3 attempts (free tier), results worth sharing. Secondary audience: dedicated arcade players who want more control, longer sessions, and competition on the full-game version.

## Product Purpose

ORION is a daily dodging game: pilot your ship through a bounded arena while escalating drone swarms close in. No gun, so staying alive is movement plus defensive power pickups. The daily patrol gives everyone the same seed, the same mutators, the same conditions; your rank is earned, not bought. A paid tier unlocks unlimited daily attempts and all mutators, removing the caps that throttle free players.

## Positioning

The daily dodging game. Plenty of games make you dodge; none of them give every player the same run on the same day and put the results on one board. Wordle's social hook, applied to dodging. (Updated 2026-08-24, Lucas: the previous "mobile-first inertia arcade" line described the older game. The ship still has inertia and it is what gives the movement its feel, but it is close to a hidden feature and is not the pitch.)

## Operating Context

- Primary surface: the Orion Daily web app at **surviveorion.com** (the `/` route). This is the product.
- `/fullgame` is an older dev/arcade version; it is not the current design priority.
- Mobile app builds exist but are older; future roadmap includes a native app alongside web.
- Played in short bursts (1–3 attempts, ~3–10 min total). Social sharing (Wordle-style result card) is part of the daily ritual.
- Controls: virtual joystick or gyroscope tilt on mobile; WASD/arrows on desktop.
- Installable PWA: fullscreen, notch-aware, blocks pinch/zoom.

## Capabilities and Constraints

- **Game modes**: Daily Patrol (primary), Training Ground (free practice), Classic and Iron Rain (full-game routes; not current design focus).
- **Daily mutators**: date-hash-derived config overrides, same for all pilots per UTC day; Sundays get two. Mutator access beyond daily-assigned ones is a paid feature (planned).
- **Free tier**: 3 attempts per UTC day, today's active mutators only.
- **Paid tier (planned, ~$1–$1.99/mo)**: unlimited daily attempts + all mutators unlocked.
- **Community**: global leaderboard, pilot profiles, badges (17 milestones), arenas (private codes), wingmates (mutual-accept friends), daily share card.
- **Auth**: Google one-tap, callsign + password, guest (passwordless device-locked).
- **Tech stack**: TypeScript + HTML5 Canvas (zero runtime dependencies), Vite 8, Node.js 22.5+, SQLite (built-in), no npm backend deps.
- **Scoring**: kill multiplier (up to ×10), danger pay, grazing, skill bonuses.
- **Undecided**: exact subscription price ($1 vs $1.99), native app timeline, which mutators are gated vs always-free on given days.

## Brand Commitments

- **Name**: ORION / Orion Daily / "Survive the Swarm"
- **URL**: surviveorion.com
- **Palette**: LOCKED as of 2026-08-24. Source of truth is `brand/tokens/orion.tokens.css`, which mirrors `src/config.ts` `PALETTE`. Core: Void `#0a0a12`, Hull Gold `#ffd700`, Rising Red `#c41e3a`, Alarm `#ff4455`, Starlight `#fff7e0`. Change one, change both.
- **Font**: Rajdhani (Google Fonts, 400 to 700). `index.html` loads it and `src/style.css` sets it on `body`. The older "Georgia serif" note here was wrong.
- **Brand guide**: `brand/` in this repo. `brand/BRAND.md` is the book, `brand/VOICE.md` the three voices, `brand/assets/` the logo, icon, social and share-card artwork.
- No Figma file, press kit, or social presence established yet.

## Evidence on Hand

- Fully playable game at surviveorion.com with a live leaderboard and community features.
- Suno-generated music tracks (`public/music/`).
- SVG/PNG icon set (gold ring + red center circle; 180/192/512px).
- `src/config.ts` is the authoritative gameplay tuning source.
- `README.md` is the authoritative architecture doc.
- No testimonials, press coverage, or external case studies yet; do not fabricate them.

## Product Principles

1. **Skill is the only cheat code.** No weapon, no power creep, no pay-to-win mechanics — rank is earned through piloting.
2. **Daily ritual, shared seed.** The social hook depends on everyone fighting the exact same conditions; mutator and seed determinism is non-negotiable.
3. **Mobile-first, desktop-capable.** The primary screen is a phone held in landscape or tapped upright; desktop is a first-class second citizen.
4. **Community earns the return.** Leaderboard, wingmates, and the share card exist to make each daily run feel consequential beyond the game itself.
5. **Earn before you gate.** The free experience must be worth coming back to; the paid tier removes friction, not core fun.
