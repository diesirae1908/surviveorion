# ORION brand conformance: bring the code in line with the kit

*Written 2026-08-24 against `diesirae1908/surviveorion` @ `7856ae6`. Every finding below was
grepped and verified in the actual codebase, with line numbers. Nothing here is a guess.*

> **STATUS, Aug 24, 2026: executed.** Phases 0, 2, 3, 4 and 5 shipped to `main` as `68ee261`
> (wordmark/icons follow-up `5e5f360`). Phase 1 is optional and was skipped by choice. This
> document stays as the record of what was checked and why; the line numbers reference `7856ae6`
> and have since shifted.

**How to use this in Cursor:** open the repo, paste the "Brief" block below into the agent, and
point it at this file. Work the phases in order. Phase 0 is blocking; everything after it is
independent, so each task can be its own commit and its own review.

---

## Brief (paste this into Cursor)

> Read `brand/CONFORMANCE.md` and work through it phase by phase. Phase 0 first, and stop after
> it so I can look at the diff before you touch anything else.
>
> Rules for this whole job:
> - Do not change gameplay, physics, tuning, scoring or determinism. If a change would alter a
>   Daily Patrol run, stop and tell me instead.
> - Do not touch anything in the "Not in scope" section at the bottom.
> - `src/config.ts` `PALETTE` and `brand/tokens/orion.tokens.css` must agree when you are done.
> - Run `npx tsc --noEmit` and `npx tsx scripts/sim-test.ts` before each commit.
> - Append a dated entry to `JOURNAL.md` per `AGENTS.md`, committed with the work.
> - Push to a branch. Never to `main`: `main` auto-deploys to production.

---

## The state of things

| | Count | Note |
|---|---|---|
| Hex literals in `src/style.css` | 148 (28 distinct) | No colour token layer exists |
| `:root` custom properties today | 4 | Safe-area insets only, no colour |
| Hex values not in the kit palette | 53 distinct, 78 uses | Most are legitimate canvas VFX, see Phase 2 |
| `rgba()` calls in `style.css` | 77 | 46 of them are gold or bronze at some alpha |
| Distinct `letter-spacing` values | 12 | The kit defines 3 |
| Confirmed WCAG failures on live text | 3 | Phase 3 |
| Player-facing em dashes | 2 | One is new, the Aug 17 sweep missed it |

The headline: **there is no token layer at all.** Every colour in the UI is a literal. That is
what makes the rest of this hard to keep true, so it is Phase 0.

---

## Phase 0: put the tokens in (blocking, zero visual change)

**Task 0.1.** Extend the existing `:root` block in `src/style.css:8` with the colour, type and
motion tokens from `brand/tokens/orion.tokens.css`. Keep the four `--safe-*` insets. Do not
delete anything.

**Task 0.2.** Replace hex literals in `src/style.css` with `var(--orion-*)` **only where the
literal already equals a palette value**. That is 24 of the 28 distinct values. The other four
are handled in Phase 2, so leave them alone for now.

Mapping (all exact matches, so this is find-and-replace with no judgment calls):

| Literal | Token |
|---|---|
| `#0a0a12` | `--orion-void` |
| `#12121e` | `--orion-deep-space` |
| `#2a2a3a` | `--orion-hull-line` |
| `#ffd700` | `--orion-gold` |
| `#ffee88` | `--orion-flare` |
| `#cc8800` | `--orion-ingot` |
| `#ccaa66` | `--orion-brass` |
| `#aa8844` | `--orion-bronze` |
| `#8a7a55` | `--orion-dust` |
| `#c41e3a` | `--orion-red` |
| `#ff4455` | `--orion-alarm` |
| `#7a1020` | `--orion-ash` |
| `#fff7e0` | `--orion-starlight` |
| `#d7d7d7` | `--orion-medal-silver` |
| `#cd7f32` | `--orion-medal-copper` |
| `#aecbee` | `--orion-mode-ironrain` |

**Acceptance:** `git diff` shows only `#hex` to `var(--orion-*)` substitutions. Load the game at
`npm run dev` and the menu, lobby, game-over and calendar look pixel-identical. If anything moved,
you substituted a value that was not an exact match.

> **Note on `#ccaa66` (Brass) and `#aecbee` (Iron Rain).** These were not in the kit when it was
> written; they are in it now *because* of this audit. `#ccaa66` is used 10 times as secondary
> text and measures 8.93:1, which is better than Bronze at 5.93:1. The code was right and the kit
> was under-specified. Do not "fix" these down to Bronze.

---

## Phase 1: alpha variants (optional, do it only if the diff stays clean)

46 of the 77 `rgba()` calls are a palette colour at some alpha: 23 are `rgba(255, 215, 0, x)`
(Hull Gold), 21 are `rgba(170, 136, 68, x)` (Bronze), 2 are `rgba(196, 30, 58, x)` (Rising Red).

Convert them to `color-mix(in srgb, var(--orion-gold) 35%, transparent)` and equivalents so a
palette change propagates. `color-mix` has been baseline in all evergreen browsers since 2023,
which is fine for a PWA, but this is cosmetic plumbing and it touches 46 lines. **Skip it if you
are short on review appetite.** Nothing else depends on it.

---

## Phase 2: collapse the drift (small, deliberate visual changes)

These are near-duplicates of palette values. Each one is a colour someone typed slightly
differently on a different day.

| File:line | Now | Change to | Why |
|---|---|---|---|
| `src/style.css:428` | `background: #ff4444` | `var(--orion-alarm)` (`#ff4455`) | 5.79 vs 5.83, indistinguishable, one is in the palette |
| `src/style.css:1255` | `color: #cc4455` | `var(--orion-alarm)` | `#cc4455` is 4.25:1, fails AA for body text |
| `src/style.css:511` | `color: #e6e6e6` (`.medal-earned.silver`) | `var(--orion-medal-silver)` (`#d7d7d7`) | The medal palette already defines silver |
| `src/style.css:1111` | `color: #666` | `var(--orion-dust)` | 3.43:1 pure grey. The kit has no neutral greys on purpose |
| `src/render.ts:127` | `grad.addColorStop(0, "#141426")` | `PALETTE.bgTop` | It is the arena background gradient top, sitting next to `PALETTE.bgBottom` on the following line. It should not be a literal |

**Leave alone, checked and compliant:**

- `src/render.ts:1724` and `src/render.ts:1792` use `#ffffff`. Both are the hot core of a flash
  (a bullet centre, and stop 0 of a radial gradient). The "never pure white" rule is about text
  and UI, not the middle of an explosion. Correct as written.
- `src/style.css:138` sets `color: #c41e3a` on `.heading`, which is `clamp(40px, 9vw, 68px)`
  bold. Rising Red is 3.37:1, which passes AA for large text (threshold 3.0). This is the one
  legitimate place Rising Red is a text colour. Do not change it.
- `src/style.css:234` uses `#1a1a2a` as an intermediate gradient stop between Hull Line and
  Deep Space. Intermediate stops are allowed.
- Everything else in `src/render.ts`, `src/main.ts` and `src/mines.ts`. See "Not in scope".

---

## Phase 3: fix the three real contrast failures

All three are plain `color:` declarations on small text, with no opacity modifying them. All
three fail WCAG AA. Verified by reading the full rule, not just the grep hit.

**3.1** `src/style.css:390` `.daily-day`

```css
color: #5a4828;   /* 2.25:1 on Void. FAIL. 10px uppercase, 0.2em tracking */
```
Change to `var(--orion-bronze)` (5.93:1). This is the "PATROL" label next to the day number, so
it should be readable. If it is meant to recede, `var(--orion-dust)` (4.69:1) is the floor.

**3.2** `src/style.css:776` `.calendar-day.missed`

```css
color: #6a5a45;   /* 2.97:1 on Void. FAIL */
```
Change to `var(--orion-dust)` (4.69:1). Missed days should read as quiet, not invisible. Also
used at `src/style.css:674`; change both.

**3.3** `src/style.css:876` `.menu-mode-btn.training .daily-sub`

```css
color: #6a6048;   /* 3.17:1 on Void, 2.99 on Deep Space. FAIL at 10px */
```
Change to `var(--orion-mode-training)` (Bronze, 5.93:1). That also makes Training use its own
mode colour consistently: the sibling `.daily-name` on line 871 is already `#aa8844`.

**Acceptance:** run `node brand/scripts/contrast-audit.cjs` for the numbers, and check each of
the three on a phone. Nothing in `style.css` should set a `color:` below 4.5:1 on text under
18px after this.

---

## Phase 4: copy and assets

**4.1** `src/ui.ts:711` contains a player-facing em dash. The Aug 17, 2026 sweep missed it.

```
"Last patrol today — make it count."   →   "Last patrol today. Make it count."
```

**4.2** `public/manifest.webmanifest:2`

```
"name": "ORION — Survive the Swarm"   →   "name": "ORION: Survive the Swarm"
```

**4.3** Replace `public/og.png` with `brand/assets/social/png/orion-og-1200x630.png`. The live
one reads `DAILY PATROL — SURVIVE THE SWARM`; the replacement uses a middle dot and is already
drawn at the right dimensions. `index.html` already points at `/og.png`, so this is a file swap
with no markup change.

**4.4** `index.html:42` has an inline data-URI favicon using `r=40 stroke-width=8`. The kit
favicon is `r=37 stroke-width=11` (`brand/assets/icon/orion-favicon.svg`). Update the data URI so
the ring weight matches the app icons. Keep it inline: it avoids a request and it is tiny.

**4.5** `src/tutorial.ts` says "Take her for a spin!" three times, at lines 57, 63 and 68. The
kit allows one exclamation mark per surface, and this is the same one three times. Rewrite two of
them. The other exclamations in the codebase are fine and should stay: `"Be the first!"` is an
invitation, and `"RAM THEM!"` / `"STARSHELL: RAM!"` are in-the-moment combat callouts that earn
the punctuation.

---

## Phase 5: type scale

**5.1** `src/style.css` uses 12 distinct `letter-spacing` values: `0.02 0.04 0.06 0.08 0.1 0.12
0.14 0.15 0.16 0.2 0.24 0.25 0.4em`. The kit defines three roles. Collapse to:

- `--orion-tracking-display: 0.06em` for screen titles, score heroes, the word ORION
- `--orion-tracking-label: 0.14em` for all-caps HUD labels (`PILOT`, `SCORE`, `TODAY'S MUTATOR`)
- `--orion-tracking-body: 0` for sentences

Round each existing value to the nearest role: everything at or below 0.04 becomes body, 0.05 to
0.1 becomes display, 0.12 and up becomes label. The two outliers at 0.25 and 0.4 are wide-tracked
straplines; check those by eye before folding them in, and if one genuinely needs to stay wide,
add a fourth token rather than leaving a literal.

**5.2** `src/style.css:1379` sets `"SF Mono", Menlo, Consolas, monospace`. The kit's token is
`ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, monospace`. Use the token; `ui-monospace` picks
the right system face on each platform instead of guessing.

---

## Not in scope. Do not touch these.

- **Canvas VFX colours in `src/render.ts`, `src/main.ts`, `src/mines.ts`.** Roughly 40 of the
  off-palette values are gradient stops in explosions, flames, trails and power effects. They
  interpolate between palette colours and need in-between shades to look right. The rule is that
  a VFX gradient should *start and end* on palette values; the stops in between are art. Flattening
  them to the palette would wreck the look for no brand gain.
- **The twelve power colours.** They are functional: a colour means a power. Never change one for
  aesthetic reasons.
- **`src/nickname.ts`.** The file name says "nickname" and the kit says the player-facing term is
  "callsign", but the UI strings already say Callsign correctly. Renaming the module touches three
  import sites for zero user-visible gain. Leave it, or do it as its own commit some other day.
- **Gameplay, physics, tuning, scoring, mutator selection, seed determinism.** None of this work
  should change a single frame of how the game plays.
- **`main` branch.** Pushing it deploys to production.

---

## When you are done

1. `npx tsc --noEmit` clean.
2. `npx tsx scripts/sim-test.ts` passes.
3. `npm test` passes (11 suites).
4. `node brand/scripts/contrast-audit.cjs` and confirm the table in `brand/BRAND.md` §6 still
   matches.
5. `grep -rn "—" src/*.ts | grep '"'` returns nothing inside string literals. Em dashes in code
   comments are fine and there are plenty; only player-facing strings matter.
6. `grep -c "#" src/style.css` should have dropped by roughly 130.
7. `JOURNAL.md` has a dated entry.
8. Update `brand/BRAND.md` §11: move whatever you fixed out of "Still open".
