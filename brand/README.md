# ORION Brand Kit

Version 1.0, built 2026-08-24. Everything here is derived from the shipped game at
[surviveorion.com](https://surviveorion.com) (`diesirae1908/surviveorion`), not invented next
to it.

**This kit lives in two places on purpose.** The copy inside the game repo
(`surviveorion/brand/`) is the one to edit: it sits with the product, and it is what an agent
working in the game will find. The copy in Sam's repo (`sam/brand/orion/`) is the PM record.
Keep them in sync; if they ever disagree, the game repo wins.

## Start here

| File | What it is |
|---|---|
| **[BRAND.md](BRAND.md)** | The brand book. Positioning, pillars, naming, logo rules, colour with measured contrast, type, layout, motion. |
| **[VOICE.md](VOICE.md)** | Three named voices (Mission Control, The Log, Wingmate), when to use each, with shipped examples and anti-examples. |
| **[COPY-BANK.md](COPY-BANK.md)** | Paste-ready lines: taglines, store copy, social, in-game strings, support replies. |
| **[CONFORMANCE.md](CONFORMANCE.md)** | The implementation spec: what in the live code disagrees with this kit, file and line, in phases. Written to be handed to Cursor. |
| **[tokens/](tokens/)** | `orion.tokens.css` and `orion.tokens.json`. Source of truth for colour, type, radius, motion. |

## Assets

```
assets/
  logo/       mark · wordmark · horizontal · stacked · stacked+tagline
              each in gradient (default), -gold, -mono-white, -mono-black
              orion-clearspace.svg  (clearspace + minimum size spec)
              png/  transparent exports at 1600px / 1000px / 512px
  icon/       orion-app-icon.svg, -maskable.svg, orion-favicon.svg, -tile.svg
              png/  1024 · 512 · 192 · 180 · 32
  social/     orion-og.svg (1200x630) · orion-header-1500x500.svg
              orion-share-card-template.svg (1080x1080, {{TOKEN}} slots)
              png/  ready to upload
  badges/     orion-medal-gold / -silver / -copper .svg
              png/  400px transparent
  palette/    orion-palette.svg + png (full swatch sheet)
```

**Which logo do I use?** Horizontal by default. Stacked in square or tall crops. Mark alone
for avatars, favicons and watermarks. Gradient finish on dark, `-mono-black` on light,
`-mono-white` on photography or a busy background.

**Clearspace:** X equals the diameter of the red core, on all four sides. Minimum 120 px wide
for the horizontal lockup, 24 px for the mark. Below 24 px use `icon/orion-favicon.svg`, which
uses a solid ring because the diagonal cuts close up at that size.

## The share card template

`assets/social/orion-share-card-template.svg` carries six placeholders:
`{{DAY}}`, `{{CALLSIGN}}`, `{{SCORE}}`, `{{TIME}}`, `{{MUTATOR}}`, `{{MEDAL}}`. Substituting
them is a plain string replace, client-side or server-side.

## Two things about colour, up front

1. **Rising Red `#c41e3a` fails WCAG AA for body text on Void** (3.37:1). It is the colour of
   the core and the swarm, not of sentences. Red text uses Alarm `#ff4455` (5.83:1).
2. **The twelve power colours are functional.** Aegis Shield blue means Aegis Shield. Using
   them decoratively teaches pilots the wrong thing.

Full measured contrast table is in [BRAND.md §6](BRAND.md).

## Conformance status

The [CONFORMANCE.md](CONFORMANCE.md) run executed Aug 24, 2026 (phases 0, 2 to 5, merged as
`68ee261`): tokens are in `:root`, the WCAG failures and player-facing em dashes are fixed, the
favicon matches, and the kit wordmark and icons are live in the game. Only optional Phase 1
(`color-mix` alpha variants) remains, by choice. Details in [BRAND.md §11](BRAND.md).

## Regenerating

Every SVG in `assets/` is generated, so geometry stays identical across every lockup. The
generators are in [scripts/](scripts/) with a run order in its README. The SVGs are the
deliverable and are safe to hand-edit; the PNGs are headless-Chromium exports of them.

If you change a colour, change it in `tokens/orion.tokens.css` **and** in
`src/config.ts` `PALETTE` in the game repo. They are meant to agree.
