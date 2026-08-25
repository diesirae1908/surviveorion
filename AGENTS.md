# orion-social

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
- `src/beats.mjs` / `src/crop.mjs` / `src/ass.mjs` Phase B v2 (EDITING.md). Platform .txt files are Phase C.
- `src/edit.mjs` CutPlan + beat sheet -> ffmpeg. Full-bleed crop, freeze CTA. `src/endcard.mjs` unused in v2.
- Queue, thumbnails, posting: later phases per SPEC.

## Commands

- `npm test` unit tests (parsing, cut plans, captions, dry filtergraph).
- `npm run golden` Phase B v2: day43 THE BOARD + TODAY'S PATROL, plus synthetic CLOSE CALL, to `out/golden/`.
- `npm run extract-mutators` refresh `assets/mutators.json` from a local orion-web checkout.
