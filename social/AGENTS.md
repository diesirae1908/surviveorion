# orion-social (lives at `social/` in orion-web)

Automated social clip pipeline for ORION (surviveorion.com). Consumes game-recorded WebM/MP4
clips plus JSON sidecars from `orion-web`.

## Context

- **Strategy and voice**: `~/Documents/games/orion-web/brand/SOCIAL.md` (formats, captions, sounds).
- **Spec**: `SPEC.md` in this repo (phases, contracts, acceptance).
- **PM**: Sam (`~/Documents/Sam`). Dispatch via Task with repo path and phase stop conditions.
- **Game sidecar contract**: `orion-web` `src/clipSidecar.ts`; filename + JSON are external contracts.

## Conventions

- **Node 22** + **ffmpeg** (`brew install ffmpeg`). Plain JS, no framework. Small deps only; justify any addition.
- **Secrets** only in `.env` and `auth/` (both gitignored). Never log tokens.
- **Never post** without a human-approved file already in `out/approved/`. The pipeline never moves files into `out/approved/`; only Lucas does.
- **Never push secrets** or commit inbox/out/fixture video blobs.
- Every substantive change: dated entry in `JOURNAL.md` (newest first), committed with the work.
- No em dashes (U+2014) in any code or copy this repo emits.

## Layout

- `inbox/` drop zone for clip+json pairs (gitignored).
- `fixtures/` test media; large `.webm`/`.mp4` are local-only (see `fixtures/README.md`).
- `src/harvest.mjs` ffprobe + sidecar parse.
- `src/plan.mjs` pure cut-plan math (unit-tested).
- `src/beats.mjs` / `src/crop.mjs` / `src/ass.mjs` / `src/edit.mjs` Phase B v2 beat-sheet path (tests only; not golden/batch).
- `src/presets.mjs` / `src/preset-runner.mjs` locked recipes (WASTED, PATROL, NEW_BEST). Golden and batch use this path only.
- `src/captions.mjs` on-video helpers plus platform .txt files. `src/thumbnail.mjs` YouTube 1280x720 from the brand template.
- `src/queue.mjs` writes `out/pending/`. Posting reads only `out/approved/` (human move). `src/post*.mjs` never writes approved.

## Commands

- `npm test` unit tests (parsing, cut plans, captions, queue, post path-guard, preset fail-loud).
- `npm run golden` locked day43 presets (WASTED, PATROL, NEW_BEST) to `out/golden/`. `--dry` prints ffmpeg steps.
- `npm run batch` harvest -> locked presets -> captions -> pending. Never posts.
- `npm run post` Phase D/E over `out/approved/` only.
- `node scripts/post-buffer.mjs` Buffer GraphQL path (default `--dry`; see `.env.example`).
- `npm run extract-mutators` refresh `assets/mutators.json` from a local orion-web checkout.
