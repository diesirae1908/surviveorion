# orion-social: pipeline spec v1

*Written 2026-08-25 (Aug 24, ~9:30 PM PT). This file founds the `orion-social` repo: create
`~/Documents/games/orion-social`, copy this in as `SPEC.md`, and build from it. Consumes the
clip sidecar shipped in surviveorion `ec48410`; strategy context in the game repo's
`brand/SOCIAL.md`.*

## Brief (paste into Cursor)

> Create `~/Documents/games/orion-social` and build the pipeline in this SPEC, phase by phase.
> Stop after Phase A for review; the acceptance test for every later phase is the real clip
> named in "Test input".
>
> Rules:
> - Node 22 + ffmpeg (`brew install ffmpeg`). Plain JS or TS, no framework, small deps only
>   (`googleapis` is expected; justify anything else).
> - Never post anything anywhere from code paths reached without a file living in
>   `out/approved/`. Approval is a human file-move; the pipeline never moves files into
>   `approved/` itself.
> - Secrets only in `.env` (gitignored) and `auth/` (gitignored). Never in the repo, never
>   logged. `.env.example` documents every key with a comment.
> - This repo gets `AGENTS.md` (context + conventions, pointing at the game repo's
>   `brand/SOCIAL.md` for strategy) and `JOURNAL.md` (dated entries, newest first), same
>   conventions as every other repo.
> - `npm test` must cover: sidecar parsing, cut-plan math (all four presets against fixture
>   sidecars), caption generation, and queue-manifest round-trip. Rendering itself is checked
>   by the golden-run script, not unit tests.

## Test input

`orion_2026-08-25_day43_arsenal_3490380.webm` + same-basename `.json` (Lucas's Downloads;
copy into `fixtures/`). A 4-5 minute ARSENAL run, score 3,490,380. Every phase's "does it
work" is this file until real batches exist.

## Sidecar contract (verbatim from the game, `src/clipSidecar.ts` @ `026001e`)

```ts
interface ClipSidecar {
  day: number;                    // Daily Patrol number
  mutatorIds: string[];           // [] on fullgame runs; 2 entries on Sundays
  mutatorNames: string[];         // display names, all-caps identities
  score: number;                  // floored
  medal: "gold" | "silver" | "copper" | null;   // this-run medal
  survivalTime: number;           // seconds
  closestCall: { time, x, y, clearance } | null; // clearance 0 = grazed with zero margin
  topGrazes: { time, clearance }[];              // up to 5, the auto-editor's cut list
}
```

Filename: `orion_<YYYY-MM-DD>_day<N>_<mutator-slot>_<score>.<webm|mp4>`; Sunday ids joined
`+`; fullgame runs put `classic`/`ironrain` in the mutator slot. Treat BOTH file naming and
JSON shape as an external contract owned by the game repo; if they drift, fail loudly with the
filename in the error, never guess.

## Repo layout

```
orion-social/
  SPEC.md  AGENTS.md  JOURNAL.md  .env.example
  package.json
  inbox/            <- Lucas drops clip+json pairs (gitignored)
  fixtures/         <- the day43 test pair, committed if <15MB else scripted download note
  assets/
    brand/          <- copied from game repo brand/: mark PNG (watermark), cover + thumbnail
                       template SVGs, fonts/Rajdhani-*.ttf (OFL, vendored for drawtext)
    sfx/            <- CC0-verified impact/whoosh sounds, each with a LICENSE note
    music/          <- symlink note: the game's public/music Suno tracks (ours)
    mutators.json   <- {id, name, subline} for all 22, extracted once from the game's
                       src/mutators.ts by scripts/extract-mutators.mjs run against a local
                       checkout; pool is append-only so this rarely changes
  src/
    harvest.mjs     ffprobe + sidecar parse -> RunRecord (dims, duration, fps, metadata)
    plan.mjs        RunRecord -> CutPlan per format (pure functions, unit-tested)
    edit.mjs        CutPlan -> ffmpeg args -> rendered 1080x1920 H.264 MP4 + poster frame
    captions.mjs    RunRecord + format -> per-platform caption .txt (templates from SOCIAL.md)
    thumbnail.mjs   poster frame + thumbnail-template overlay -> YouTube 1280x720 JPEG
    queue.mjs       assemble out/queue/<id>/, write manifest
    post-youtube.mjs   upload approved YT items (googleapis)
    post-instagram.mjs upload approved IG Reels (Graph API)
    auth-youtube.mjs   one-time OAuth bootstrap (prints consent URL, stores refresh token)
    auth-instagram.mjs one-time token bootstrap (walks the Graph API token exchange)
  out/
    queue/          <- rendered, awaiting Lucas (gitignored)
    approved/       <- Lucas moves item folders here = approval (gitignored)
    posted/         <- moved after successful upload, manifest updated with post ids
```

## Phase A: harvest + cut plans (pure logic, no rendering)

`harvest.mjs`: pair `<base>.webm|mp4` with `<base>.json` in `inbox/`, ffprobe for
width/height/duration/fps, emit a `RunRecord`. Unpaired files: warn and skip, never crash the
batch.

`plan.mjs` picks formats per run (a run can yield several posts):

| Format | Eligibility | Cut |
|---|---|---|
| CLOSE CALL | best graze clearance <= 0.15 | `[t-6, min(t+4, end)]`, slow-mo 0.5x on `[t-0.4, t+0.6]` |
| SPACE DUST | survivalTime < 20 or score < 5000 | whole run if <= 12s, else last 8s |
| THE BOARD | medal == gold or score >= 1,000,000 | last 12s before death + 1.5s endcard |
| TODAY'S PATROL | first processed run of a UTC day with mutatorIds.length > 0 | `[0, 22]` |

`t` = the eligible graze's `time`. Multiple grazes <= 0.15 clearance: plan one CLOSE CALL per
graze at most 2 per run, best clearance first. All plan math is pure and unit-tested against
fixture sidecars (day43 real one + hand-written edge cases: 8s death, Sunday double, fullgame
`classic` run which yields only SPACE DUST/THE BOARD since it has no mutators).

## Phase B: rendering (ffmpeg)

One canonical output: 1080x1920, H.264 high, yuv420p, CRF 19, 30fps, AAC audio. Recipe, in
order:

1. **Frame**: scale input to fit 1080 width (game clips are landscape or portrait; never
   crop gameplay). Pad to 1080x1920 with Void `#0a0a12`; the game background blends into it.
   Vertical position: gameplay centered at 46% height (leaves the caption band clear).
2. **Slow-mo** (CLOSE CALL only): three-segment `trim` + `setpts` + `concat`. Audio gets the
   matching `atempo`.
3. **Caption band**: `drawtext` with vendored Rajdhani Bold on a Void scrim
   (`drawbox` alpha 0.72) in the top safe area (y approximately 180-300). Text comes from
   captions.mjs, max 2 lines, Starlight `#fff7e0`; mutator names in Alarm `#ff4455` via a
   second drawtext. Never raw text over gameplay.
4. **Watermark**: mark PNG, width 64px, bottom-right at (1080-64-36, 1920-64-320), opacity
   0.6. Inside every platform's safe zone.
5. **Score burn** (THE BOARD only): `drawtext` of the formatted score, Rajdhani 700, gold,
   tabular position, bottom third.
6. **Endcard** (THE BOARD, TODAY'S PATROL): 1.5s of the vertical cover template PNG with the
   day's `{{HOOK_LINE1/2}}`/`{{TAG}}` filled (render the SVG via the same headless-Chromium
   trick as the kit's export script, cached per day), crossfade 0.25s.
7. **Audio**: game audio at 0.85 for CLOSE CALL/THE BOARD/TODAY'S PATROL. SPACE DUST: game
   audio 0.5 plus one SFX from `assets/sfx/` at the death frame. A `--music <track>` flag can
   bed a Suno track at 0.35 under any format. Never bake third-party meme audio; that is
   attached in-app at publish time (see SOCIAL.md sound rules).

`edit.mjs` builds the filtergraph from the CutPlan; a `--dry` flag prints the ffmpeg command
without running. Golden-run script `npm run golden` renders all eligible formats for the
day43 fixture and writes them to `out/golden/` for eyeball review; it is the Phase B
acceptance gate.

## Phase C: captions, thumbnail, queue

- `captions.mjs`: the templates in `brand/SOCIAL.md` "Caption templates", filled from the
  sidecar. Per platform variants (tiktok.txt, instagram.txt, youtube.txt: YT gets title +
  description, description always ends with surviveorion.com). Tag bank rotation is
  deterministic on `day` so reruns are stable. Voice rules enforced in code: reject captions
  containing an em dash or more than one `!` (test covers this).
- `thumbnail.mjs` (YouTube items only): poster frame = the frame at the cut's most
  interesting moment (CLOSE CALL: graze frame; others: midpoint). Composite under the
  1280x720 thumbnail template with `{{TITLE_LINE1/2}}`/`{{TAG}}` from a per-format title
  table. Output JPEG quality 90.
- `queue.mjs`: `out/queue/<YYYY-MM-DD>_<format>_<n>/` containing `video.mp4`,
  `caption.<platform>.txt`, `thumbnail.jpg` (YT), `meta.json` (format, source basename,
  platforms, suggested in-app sound if any, cut plan echo). Plus a top-level
  `out/queue/REVIEW.md` regenerated per batch: one line per item, what it is, where it goes.

## Phase D: posting

Runs only over `out/approved/`. Each success moves the item to `out/posted/` and appends the
platform post id to its `meta.json`; each failure leaves the item in place and prints why.

- **YouTube** (`post-youtube.mjs`): `googleapis` videos.insert
  (snippet.title/description/tags, status.privacyStatus from meta, default public;
  categoryId 20 Gaming), then thumbnails.set. Uploads cost 1600 quota units of the 10k/day
  default: max 6/day, which is more than the cadence needs. `#Shorts` not required; vertical
  short videos are classified automatically.
- **Instagram** (`post-instagram.mjs`): Graph API Reels: create media container
  (`media_type=REELS`) with resumable upload (`upload_type=resumable`, bytes via
  rupload.facebook.com), poll status_code until FINISHED, then `media_publish`. If resumable
  upload is unavailable on the account, fall back to `video_url` with a
  temporarily-presigned URL and say so in the run log; do not silently host files anywhere
  public.
- **TikTok**: no API in v1 (Content Posting public-post requires an audited app). The queue
  item's `caption.tiktok.txt` + suggested sound line make the manual post a 30-second job.
  Revisit an audited app or Postiz only if the tap count actually hurts.

## Phase E: wiring

- `npm run batch` = harvest -> plan -> render -> captions -> thumbnails -> queue. Idempotent:
  processed inbox pairs are moved to `inbox/done/`.
- `npm run post` = Phase D over approved/.
- launchd plist template (`ops/com.orion.social.batch.plist`) for auto-batch on a schedule if
  Lucas prefers drop-and-forget over running the command; posting stays manual-triggered
  after approval by design.
- Weekly stats loop and compilation cuts: out of scope for v1, spec'd later once there are
  posts to measure.

## AUTH.md runbook (write this file in the repo verbatim, then follow it)

### YouTube, ~10 minutes, once

1. console.cloud.google.com -> New project `orion-social`.
2. APIs & Services -> Library -> enable **YouTube Data API v3**.
3. OAuth consent screen: External, app name `ORION Social`, your email everywhere. Add
   yourself as the only user, then **Publish app** (Production). Unverified-production shows
   a warning screen you click through once; the alternative, Testing mode, expires refresh
   tokens every 7 days, which kills automation. Publish it.
4. Credentials -> Create credentials -> OAuth client ID -> **Desktop app** -> download the
   JSON to `auth/google-client.json`.
5. `npm run auth:youtube`: prints the consent URL. Open it, approve with the Google account
   that owns the @SurviveOrion channel, paste the code back. The refresh token lands in
   `.env` (`YT_REFRESH_TOKEN`). This URL is the "one OAuth consent"; it can only be minted
   from your own client JSON, which is why steps 1-4 exist.

### Instagram, ~15 minutes, once

1. **Create a Facebook Page** (this is the piece the IG app never explains):
   facebook.com/pages/create, name `ORION`, category Video game. Your personal profile is
   the admin; the Page is just API plumbing and needs no content, ever.
2. **Link IG to the Page**: Instagram app -> Edit profile -> under Public business
   information tap **Page** -> Connect existing page -> pick `ORION`. (If the app hides it:
   facebook.com -> the Page -> Settings -> Linked accounts -> Instagram -> Connect.)
3. developers.facebook.com -> Create app -> type **Business**, name `orion-social`.
4. `npm run auth:instagram`: walks the token dance (short-lived user token from the Graph
   API Explorer with `pages_show_list, instagram_basic, instagram_content_publish,
   pages_read_engagement, business_management`; exchanges it long-lived; resolves the Page
   token and `IG_USER_ID` via `/me/accounts?fields=instagram_business_account`). Stores
   `IG_USER_ID` + `IG_ACCESS_TOKEN` in `.env`. The app stays in Dev Mode: that is fine
   forever, because Dev Mode works fully for accounts with a role on the app, and that is
   you.

### TikTok

Nothing to set up in v1.

## Env contract (`.env.example`)

```
YT_CLIENT_JSON=auth/google-client.json
YT_REFRESH_TOKEN=
YT_CHANNEL_ID=            # UCJKMXg2yatBgDZv5XrnPO8A
IG_USER_ID=
IG_ACCESS_TOKEN=          # long-lived page-scoped token, rotate ~60 days; auth script prints expiry
DEFAULT_PRIVACY=public    # set to private for the first test uploads
```

## Acceptance for "v1 done"

1. `npm test` green.
2. `npm run golden` renders CLOSE CALL, THE BOARD and TODAY'S PATROL from the day43 fixture
   (it is not SPACE DUST eligible) and they look right by eye: framing, caption band, slow-mo
   moment, watermark, endcard.
3. `npm run batch` on an inbox of two runs produces a clean queue + REVIEW.md.
4. One real YouTube upload with `DEFAULT_PRIVACY=private` succeeds end to end, thumbnail
   included, and is visible in Studio.
5. One real IG Reel publish to @surviveorion succeeds (IG has no private mode; use a
   throwaway caption and delete it, or ship it for real as seed content).
6. `JOURNAL.md` entry; `.env`/`auth/` confirmed gitignored by `git status`.
