# ORION Brand Book

*Version 1.0. Written 2026-08-24. Owner: Lucas Navilloz.*

Before this document, ORION had a look but no brand: colours lived in `src/config.ts`,
the wordmark existed only inside a PNG, and nothing said which of the twelve golds was
*the* gold. This is the fix. Everything here is derived from the shipped game at
[surviveorion.com](https://surviveorion.com) (repo `diesirae1908/surviveorion`), not invented
alongside it.

---

## 1. What ORION is

A daily dodging game. Drone swarms close in, you have no gun, and the only thing that keeps
you alive is moving well. Everyone gets the same run on the same day: same seed, same mutator,
same conditions, three attempts per UTC day.

The ship has inertia, and that is what gives the movement its feel, but it is not the pitch.
Nobody arrives for a physics model. They arrive to dodge, and they come back because today's
run is the same one everybody else is failing at.

**The one-line version:** Wordle's daily ritual, applied to dodging.

**The positioning claim:** the daily dodging game. Plenty of games make you dodge. None of
them give every player the same run on the same day and put the results on one board.

**The promise, in four words:** *skill is the only cheat code.*

## 2. The three pillars

Three things. If a design or a line of copy does not sit inside one of them, it does not ship.

### 1. No gun. You dodge.

Survival is movement, not firepower. Powers are defensive. So: show near-misses, not
massacres. Never use power-fantasy imagery or "unleash your power" language. The hero
screenshot is a ship threading a gap, not a screen full of explosions.

### 2. Everyone gets the same day.

One seed, one mutator, three attempts, worldwide. That is the whole social hook, so the brand
is communal rather than solitary. Copy says *every pilot*, *today's patrol*, *the board*.
Mutators get names rather than difficulty numbers, because everyone is talking about the same
one today.

### 3. Say less, and say it warm.

Short lines, present tense, no hype. But the palette is warm on purpose: warm whites
(`#fff7e0`), lit golds, a dark that is deep blue rather than black. ORION is a cockpit at
night, not a hospital corridor. Terse is not the same as cold.

## 3. Name and naming system

- **ORION** always in caps in the wordmark and in product UI. In running prose, "Orion" is
  acceptable; "ORION" is preferred in headlines.
- **Orion Daily** or **Daily Patrol** for the primary mode. Never "daily challenge".
- **surviveorion.com** is the URL and doubles as a strapline in tight spaces.
- **Mutators**: an all-caps codename plus a plain-language subline. The codename carries the
  identity (`STARFALL`, `CRYO WINTER`, `YEAR OF THE SERPENT`); the subline says exactly what
  changes ("Every pickup is a Cryo Field."). Never explain the joke in the codename.
- **Powers**: two-word Title Case, one noun of function plus one noun of thing.
  `Aegis Shield`, `Missile Swarm`, `Arc Lightning`, `Cryo Field`.
- **Badges**: short human phrases, often wry. `Space Dust`, `Five Alive`, `Galaxy's Finest`,
  `Ten Million Club`. Badge names may be funny. Mutator names may not.
- **Players are pilots.** In product UI, in support replies, in ads. Never "users", never
  "gamers". Their name is a **callsign**, not a nickname or a username.

## 4. Taglines

| Slot | Line |
|---|---|
| Primary | **Survive the swarm.** |
| Descriptor | A daily dodging game. |
| Social bio | Three attempts a day. Same run for every pilot. |
| Link preview | DAILY PATROL · SURVIVE THE SWARM |
| Store subtitle | Dodge the swarm. Chase the board. |

The separator in the link preview is a middle dot (·), not an em dash. This is not a style
preference: em dashes are banned in every surface Lucas ships, and the pre-1.0 OG image and
`manifest.webmanifest` both still carry one. See §11.

## 5. Logo

### The Patrol Sight

The mark is a gold ring cut on the four diagonals, with a red core dead centre. It reads three
ways at once, which is why it works: a targeting reticle, an eclipse, and the top-down
silhouette of a ship inside its arena. It evolves the shipped favicon (a plain gold ring plus red
dot) rather than replacing it, so nothing already live looks wrong next to it.

The diagonal cuts are the same 45-degree corner cut used in the wordmark. That cut is the
brand's one repeating geometric idea: **the chamfer**. Use it on cards, buttons, medals and
crops. Never use a rounded pill.

### The wordmark

It is outlines, not a font. Five chamfered geometric letterforms on a 100-unit cap height,
22-unit stems, 22-unit corner cuts, drawn as vector paths in `assets/logo/orion-wordmark.svg`.
That means it carries no font dependency anywhere it goes. Do not re-set it in Rajdhani or
anything else.

### Lockups

| File | Use |
|---|---|
| `orion-logo-horizontal` | Default. Site header, README, video endcard, wide crops. |
| `orion-logo-stacked` | Square and tall crops, app store art, merch. |
| `orion-logo-stacked-tagline` | Posters, splash, first-impression surfaces. |
| `orion-wordmark` | When the mark already appears elsewhere in the same frame. |
| `orion-mark` | Avatars, favicons, app icons, watermarks, loading states. |

Each ships in four finishes: gradient (default), flat `-gold`, `-mono-white`, `-mono-black`.

### Clearspace and minimum size

**X = the diameter of the red core.** Keep X clear on all four sides of every lockup. Nothing
enters that box, including background artwork with detail in it. Diagram:
`assets/logo/orion-clearspace.svg`.

- Horizontal lockup: minimum 120 px wide, or 30 mm in print.
- Mark: minimum 24 px. Below that the diagonal cuts close up, so switch to
  `assets/icon/orion-favicon.svg`, which uses a solid ring for exactly this reason.

### Misuse

Do not recolour the mark outside the four supplied finishes. Do not stretch or condense
either element. Do not rotate the wordmark. Do not add drop shadows, bevels, or outer glow
beyond the single gold bloom baked into the icon artwork. Do not rebuild the wordmark in a
font. Do not place the gradient lockup on a light background: `-mono-black` exists for that.
Do not put the mark inside another shape, particularly a circle, since it already has one.

## 6. Colour

Full swatch sheet: `assets/palette/orion-palette.svg`. Machine-readable:
`tokens/orion.tokens.json`.

### Core

| Token | Hex | Role |
|---|---|---|
| Void | `#0a0a12` | Background. PWA theme-color. The default state of everything. |
| Deep Space | `#12121e` | Raised surfaces, top of the arena gradient. |
| Hull Line | `#2a2a3a` | Dividers, card borders. |
| **Hull Gold** | `#ffd700` | The brand. Ship hull, sight ring, primary action. |
| Flare | `#ffee88` | Top of every gold gradient. Highlights. |
| Ingot | `#cc8800` | Bottom of every gold gradient. Shadow side. |
| Bronze | `#aa8844` | Secondary text on dark, taglines. |
| Dust | `#8a7a55` | Muted labels, metadata. |
| **Rising Red** | `#c41e3a` | The core, the swarm, danger. |
| Alarm | `#ff4455` | Bright danger. Red *text* uses this. |
| Ash Red | `#7a1020` | Red shadow. |
| Starlight | `#fff7e0` | Primary text. Warm white, never `#ffffff`. |

Gold is the protagonist, red is the antagonist, and the split is roughly 70/25/5 gold to red
to everything else. Red should feel like it is arriving from off-frame. In the OG image and
the header it always enters from the right, because that is the direction the swarm comes
from in the boot cinematic.

### Contrast, measured

Against Void `#0a0a12`, WCAG 2.1 ratios:

| Foreground | Ratio | Verdict |
|---|---|---|
| Starlight `#fff7e0` | 18.43 | AAA |
| Flare `#ffee88` | 16.75 | AAA |
| Hull Gold `#ffd700` | 14.06 | AAA |
| Ingot `#cc8800` | 6.66 | AA |
| Bronze `#aa8844` | 5.93 | AA |
| Alarm `#ff4455` | 5.83 | AA |
| Dust `#8a7a55` | 4.69 | AA, and only just |
| **Rising Red `#c41e3a`** | **3.37** | **Large text only. Fails AA for body copy.** |

Two rules fall out of that table:

1. **Never set body copy in Rising Red on Void.** Use Alarm `#ff4455`. This is why live
   mutator names on the share card are Alarm and not Rising Red.
2. Dust at 4.69 clears AA on Void but drops to 4.42 on Deep Space, which fails. Keep Dust on
   Void only; on Deep Space use Bronze.

On light backgrounds, gold fails badly (`#ffd700` on `#fff7e0` is 1.31). ORION is a dark
brand. If a surface must be light, the logo goes `-mono-black` and the type goes Void.

### Power signals

The twelve power colours are **functional, never decorative**. A colour means a power. Using
Magnet purple as a background accent teaches players the wrong thing. They are listed in
`tokens/orion.tokens.css` and are the same values the game renders.

## 7. Typography

**Rajdhani** (Google Fonts, weights 400/500/600/700). Already loaded by the game, so this is
codification, not migration. It is a semi-condensed squarish sans: technical without being a
sci-fi novelty face, and narrow enough that long HUD labels fit on a phone.

Fallback stack: `'Rajdhani', 'Titillium Web', 'Segoe UI', system-ui, sans-serif`.

| Style | Spec | Use |
|---|---|---|
| Display | 700, tracking 0.06em, caps | Screen titles, score heroes, ORION in text |
| Label | 600, tracking 0.14em, caps | `PILOT`, `SCORE`, `TODAY'S MUTATOR`, HUD keys |
| Body | 500, tracking 0 | Sentences, briefings, help text |
| Data | 700, tabular where available | Scores, times, ranks |

Numbers are the loudest thing on most ORION surfaces. Set scores large, in Hull Gold or the
gold gradient, and let everything around them be Dust. The share card is the reference layout.

`PRODUCT.md` records the base UI font as Georgia. That is stale: the shipped `index.html`
loads Rajdhani and `style.css` sets it on `body`. Rajdhani is the brand face.

## 8. Layout and motion

- **Frame the composition.** Compositions get a visible frame: a 1.5 to 3 px Hull Line border
  with a chamfered or 28 px radius, inset from the edge. See the share card.
- **Stars, not nebulas.** Small warm-white dots at 18 to 68 percent opacity, sparse.
  Never purple space clouds, never lens flares.
- **The swarm is the texture.** Hexagonal outlines in Alarm with a small Rising Red centre,
  crowding in from one edge, opacity rising toward that edge. This is the only illustration
  motif ORION needs.
- **Use glow once.** One soft gold bloom on the mark. Nothing else glows. In the game, glow
  intensity means multiplier heat, so decorative glow is a lie.
- **Motion**: fast in, slow out. `cubic-bezier(0.16, 1, 0.3, 1)`. Screens fade in at 350 ms,
  out at 700 ms, and the game-over screen rises over 1600 ms because the loss should land.
  Nothing bounces. Nothing springs.

## 9. Photography and screenshots

There is no photography. The product screenshot is the hero image, always in landscape on a
phone, always mid-run with the swarm on screen and the multiplier visible. Do not use a menu
screenshot as a hero. Do not mock the game up on a device that is not a phone unless the
surface is specifically about desktop play.

## 10. Asset index

```
assets/
  logo/      mark, wordmark, horizontal, stacked, stacked+tagline
             x4 finishes (gradient, -gold, -mono-white, -mono-black)
             orion-clearspace.svg
             png/   1600px transparent exports of the key lockups
  icon/      app icon (full bleed + maskable), favicon, favicon tile
             png/   1024 / 512 / 192 / 180 / 32
  social/    orion-og.svg (1200x630), orion-header-1500x500.svg,
             orion-share-card-template.svg (1080x1080, {{TOKEN}} slots)
             png/   ready to upload
  badges/    medal-gold / -silver / -copper (hex plate + sight)
             png/   400px transparent
  palette/   orion-palette.svg + png
tokens/      orion.tokens.css, orion.tokens.json
VOICE.md     the three voices, with rules and examples
COPY-BANK.md approved lines, ready to paste
```

The share card template uses `{{DAY}}`, `{{CALLSIGN}}`, `{{SCORE}}`, `{{TIME}}`,
`{{MUTATOR}}` and `{{MEDAL}}` placeholders. Substituting them server-side or in the client
renderer is a straight string replace.

## 11. What to fix in the game

Found while deriving this kit.

### Still open

1. **`public/manifest.webmanifest` name field contains an em dash**: `"ORION — Survive the
   Swarm"`. Should be `"ORION: Survive the Swarm"`. The 2026-08-17 copy sweep caught the game
   strings but not the manifest. Player-facing.
2. **`public/og.png` reads `DAILY PATROL — SURVIVE THE SWARM`**, same em dash. The replacement
   is already drawn: `assets/social/png/orion-og-1200x630.png`. Player-facing.
3. **The favicon is an inline data-URI SVG in `index.html`** with `r=40 stroke-width=8`, close
   to but not identical to `assets/icon/orion-favicon.svg` (`r=37 stroke-width=11`). Swap in the
   kit version so the ring weight matches everywhere.

All three are small. Items 1 and 2 are the ones players see.

### Fixed on the branch that added this kit (`sam/brand-kit`, not yet on `main`)

4. `PRODUCT.md` pitched "the only mobile-first inertia arcade". Rewritten to the daily-dodging
   positioning in §1, with a note recording that it was Lucas's call on 2026-08-24.
5. `PRODUCT.md` recorded the UI font as Georgia. The shipped `style.css` sets Rajdhani.
   Corrected.
6. `PRODUCT.md` called the palette "recorded as evidence, not locked". It is locked now and
   points at `brand/tokens/`.
7. `AGENTS.md` opened on the same stale positioning, and its sibling-folder paths predated the
   2026-08-23 move. Rewritten, and it now says plainly that this repo is the only live Orion and
   the Unity build is an archive, not a sibling version.
