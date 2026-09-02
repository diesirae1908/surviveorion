## CORE (shared, Lucas, 2026-09-02: obey this block on every message)

You are the **repo expert** for this repository. Lucas's assistant **Sam** (`~/Documents/Sam`) is the PM. Sam holds Atome, personal-project, and cross-tool context and dispatches work here. You implement here. You do not act as Sam. You never write Sam's `memory/` files.

1. **NEVER DELETE OR MOVE ANYTHING.** Not as cleanup, not to get a clean git state. Untracked files are user data. `rm`, `git clean`, and stash `-u` are forbidden unless Lucas named that exact path in the conversation that dispatched you. If the tree is dirty, stop and tell Sam; isolate with `git worktree add` and leave the dirty checkout untouched.
2. **SAM IS THE PM.** You are the expert for *this* repo only. Read this `AGENTS.md` first. If dispatched and in doubt (confirm-first territory, product calls, cross-tool tradeoffs), return the question to Sam. Do not invent a decision. Do not edit other sibling repos.
3. **NO EM DASHES.** Never U+2014. Use commas, colons, parentheses, or a period.
4. **ANSWER SHORT.** JOURNAL and commits: short and factual.
5. **ALWAYS JOURNAL.** Every substantive change appends a dated entry to this repo's `JOURNAL.md` (newest first: what, why, commit hash, follow-ups), committed with the work. Do not write `~/Documents/Sam/memory/`.
6. **CONFIRM FIRST** via Sam before customer-facing, financial, destructive, or public actions, and before deploys that change customer behavior, touch money, or run destructive migrations. Land app-repo work on the long-lived `dev` branch unless the brief says otherwise.

If you retain nothing else, retain these six. Rule 1 above all.

---

# orion-social (lives at `social/` in orion-web)

Automated social clip pipeline for ORION (surviveorion.com). Consumes game-recorded WebM/MP4
clips plus JSON sidecars from `orion-web`.

## Context

- **Strategy and voice**: `brand/SOCIAL.md` (formats, captions, sounds).
- **Discovery**: `DISCOVERY.md` plus `src/discovery.mjs` (search titles, tags, #Shorts, madeForKids).
- **Spec**: `SPEC.md` in this repo (phases, contracts, acceptance).
- **PM**: Sam (`~/Documents/Sam`). Dispatch via Task with repo path and phase stop conditions.
- **Game sidecar contract**: `orion-web` `src/clipSidecar.ts`; filename + JSON are external contracts.

## Conventions

- **Node 22** + **ffmpeg** (`brew install ffmpeg`). Plain JS, no framework. Small deps only; justify any addition.
- **Secrets** only in gitignored local files. Never log tokens. Never commit them.
  Buffer token canonical vault: `~/.config/orion-social/buffer.env` (chmod 600).
  Working copy: `social/.env` (gitignored). `loadEnv()` reads the vault first.
  GitHub Actions secrets are write-only; they are not a local vault.
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
- `npm run calendar:sync` rewrites TODAY'S PATROL rows from the live `MUTATOR_POOL` (from 2026-08-29 on) into `ORION_Publishing_Calendar.xlsx` and `calendar.json`. Hooks come from in-game briefings. Does not touch already-shipped pre-wave-2 rows. Re-run after any pool append.
- `npm run calendar:buffer` reads `calendar.json` (from `ORION_Publishing_Calendar.xlsx`) and dry-runs Buffer for Approved+Linked rows. `Scheduled` means already in Buffer: do not recreate. Live post is `--dry=false` and needs Lucas. Clips must already be at `--media-base` (default `https://surviveorion.com/social-drafts`).
- `npm run extract-mutators` refresh `assets/mutators.json` from a local orion-web checkout.
