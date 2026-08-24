# Kit generators

The SVGs in `../assets/` are generated so geometry stays identical across every lockup.
Run in order from the repo root:

```
node scripts/01-logo.cjs
node scripts/02-icon-social-badges.cjs
node scripts/03-specsheets.cjs
NODE_PATH=$(npm root -g) node scripts/04-export-png.cjs   # needs playwright + chromium
node scripts/contrast-audit.cjs                            # re-checks the WCAG table in BRAND.md
```

Run them from this `brand/` directory. They resolve `../assets` relative to themselves, so the
kit can be copied between repos without editing paths.

They are `.cjs` on purpose: the game repo sets `"type": "module"`, which would otherwise make
Node read these CommonJS scripts as ES modules and fail. Scripts 01 to 03 are plain Node with no
dependencies. Script 04 renders the SVGs in headless Chromium (Rajdhani is pulled from Google
Fonts at export time) and needs `playwright`.

The SVGs are the deliverable and are safe to hand-edit. If you do, either stop using the
generators or port the edit back into them.
