# JOURNAL

## 2026-08-29: Live YouTube Shorts discovery overlay via Studio

- Lucas signed into Survive Orion Studio (`UCJKMXg2yatBgDZv5XrnPO8A`).
- Updated descriptions on all 6 live Shorts: Rate This Dodge, GOLD DASH,
  He Knew, THE FLOOD, THE PIT, Official Trailer. Titles kept (already
  named Orion). `#Shorts` + tags + trailing `surviveorion.com`. Made for
  Kids already off.
- Posted the pin-comment CTA on all 6. Studio pin menu click did not
  stick as Pinned. Playlists not created yet.
- IG/TikTok live twins still blocked (Buffer cannot edit sent).

## 2026-08-29: Discovery overlay applied to scheduled Buffer posts

- Lucas: update the previous posts, do it all (titles, pin comment, playlists).
- `scripts/apply-discovery.mjs` editPost. 15/15 scheduled IG/TT/YT posts
  updated (hashtags, keyword line, YT `#Shorts` + madeForKids false).
- 16 sent/live posts: Buffer token cannot edit (`Account is not allowed`).
  No YT/IG API tokens on disk. YouTube Studio in the Cursor browser is a
  different Google account. Live rewrite / pin / playlists blocked until
  Lucas signs into Studio as Survive Orion or mints a `YT_REFRESH_TOKEN`
  with `youtube.force-ssl`.
- Nothing deleted. Video assets re-sent on scheduled edits so Buffer kept them.

## 2026-08-29: Discovery process on IG / TikTok / YouTube

- New channels get ~0 impressions until Search can categorize the clip. Added
  `src/discovery.mjs` + `DISCOVERY.md`. Searchable YouTube titles, keyword line
  on IG/TT, `#Shorts` + surviveorion.com on every YT description, pinned-comment
  file, Buffer `madeForKids: false` / Gaming / not-AI, Data API same plus `en`.
- Bug: calendar-buffer dropped TikTok hashtags (`joinCaption(tt, null)`). TikTok
  now inherits `ttTags` or `igTags`.
- Existing scheduled Buffer posts are unchanged (public). New Approved+Linked
  rows pick this up. Nothing posted this session.

## 2026-08-29: Ditch the Can is second person

- Lucas: "Caught yourself..." not "myself." IG + TT editPost on the
  same IDs. Video kept. YouTube body unchanged.

## 2026-08-29: Rewrote Ditch the Can + Dead Fart captions

- Lucas: do not restate the on-video hook. Dead Fart was too blunt.
  Ditch the Can now riffs the bathroom-can bit. Dead Fart uses the
  Chandler line plus "You don't say Ray." editPost on the same 6 IDs
  (assets re-sent so Buffer kept the video). Dates unchanged.

## 2026-08-29: Ditch the Can + Dead Fart hosted for Buffer

- New finals: `0828_ditchthecan_916.mp4` (Bored? Ditch the can, play Orion)
  and `0828_deadfartsound_916.mp4` (death + fart + screaming monkey).
- Captions follow the on-video hook for Ditch the Can. Dead Fart is the
  fart-on-death gag. Faststart remux. 6 Buffer posts scheduled.
  Ditch the Can Sep 1 9am PT: IG/TT/YT `6a928f65e959557ce5587b6a` /
  `6a928f66aad1969d9e09ad0a` / `6a928f67e959557ce5587b8e`.
  Dead Fart Sep 2 9am PT: `6a928f68463a5d78ec65dee1` /
  `6a928f69946f458537415371` / `6a928f6a463a5d78ec65df12`.
  Calendar rows now Scheduled.

## 2026-08-29: Dropped empty Aug 28 WASTED calendar row

- Lucas: WASTED is the same format as SPACE DUST. Removed the unlinked
  Aug 28 "WASTED classic" draft row from the xlsx + calendar.json.
  No video files touched. Buffer unchanged.

## 2026-08-28: 4 new finals linked, Nature's Call slot added

- Lucas dropped `0828_GOLDDASH_916.mp4`, `0828_ratemydodge_916.mp4`,
  `0828_spacedust_916.mov` in `final_videoasset/`. Naturecall was still in
  Downloads; copied (not moved) to `0828_naturecall_916.mp4`.
- Linked GOLD DASH + Rate this dodge on Aug 29. New POV row Nature's Call
  on Aug 30 (no prior slot). SPACE DUST on Aug 31. GOLD DASH copy updated
  to the live briefing (Stop, point, burn the line).
- HEVC spacedust remuxed to H.264. Hosted all four mp4s in
  `public/social-drafts/`. Masters left in place. Buffer `--only` those
  four titles so earlier Approved rows are not duplicated.
- CapCut 720p exports had moov at the end. Buffer could not read them.
  Hosted copies remuxed `-c copy -movflags +faststart`. All 12 posts
  scheduled. Calendar rows now Scheduled.
  Rate this dodge Aug 29 9am PT: IG/TT/YT `6a928364aa187a14a5eb769a` /
  `6a9283653a3b8905af282f76` / `6a928366463a5d78ec64eb1a`.
  GOLD DASH Aug 29 9am PT: `6a928368aa187a14a5eb76bf` /
  `6a92836973b542df4dd455f6` / `6a928369e959557ce5579866`.
  Nature's Call Aug 30 9am PT: `6a92836a3a3b8905af282f9b` /
  `6a92836b463a5d78ec64eb40` / `6a92836caad1969d9e08cc65`.
  Space Dust Aug 31 9am PT: `6a9282c2463a5d78ec64dda8` /
  `6a9282c3aad1969d9e08c670` / `6a9282c43a3b8905af2827eb`.

## 2026-08-28: Letterbox full playfield, black bars

- Locked look: entire source playfield scaled to fit 1080x1920, padded with true black.
- Replaced Void-pad-then-zoompan in `presets.mjs` / `preset-runner.mjs`. `edit.mjs` letterboxes concatenated gameplay the same way. NEW_BEST board still `scale=1080:1920`.
- Docs: EDITING.md law 1, SPEC.md Phase B, brand/SOCIAL.md, CAPCUT-TEMPLATES.md.
- No post. Nothing written to `out/approved/`. Game runtime untouched.

## 2026-08-28: GREAT WALL Buffer posts moved to Sep 26

- editPost on IG/TT/YT `6a9121e2efbc4adde7879dbe` /
  `6a9121e3df4be5293ae33522` / `6a9121e4ae8294e483701a04`. dueAt now
  2026-09-26T16:00:00.000Z (9am PT). Status still scheduled.
- Calendar row added as Scheduled + Linked so we do not re-create.

## 2026-08-28: Patrol rows synced to wave-2 mix

- `npm run calendar:sync` rewrote TODAY'S PATROL from 2026-08-29 off the
  live pool. Aug 29 GOLD DASH. Sundays: BAIT SHOT + YEAR OF THE SERPENT,
  then MAGNETIC FIELD + CLOAK. Hooks are in-game briefings.
- THE FLOOD Aug 28 stays Approved + Linked. GREAT WALL Buffer posts for
  Aug 29 9am PT are now the wrong day. Not cancelled from here.

## 2026-08-27: THE FLOOD + GREAT WALL scheduled in Buffer

- 6 posts created, all `scheduled`. THE FLOOD 9am PT Aug 28 (IG/TT/YT
  `6a9121e0df4be5293ae334d8` / `6a9121e0ae8294e4837019e0` /
  `6a9121e1b12b8efbe7375b7c`). GREAT WALL 9am PT Aug 29
  (`6a9121e2efbc4adde7879dbe` / `6a9121e3df4be5293ae33522` /
  `6a9121e4ae8294e483701a04`). `--only` those titles. Masters not deleted.

## 2026-08-26: 9 Buffer posts created for the 3 Approved rows

- Trailer + He Knew queued. THE PIT customScheduled 9am PT Aug 27.
- All three channels each. No further rows posted.

## 2026-08-26: trailer queued; remux HEVC .mov to H.264 for the other two

- Live after HEAD fix: Launch Trailer created on IG/TT/YT (`scheduled` /
  addToQueue). He Knew + THE PIT still "could not be read": `.mov` HEVC.
- Hosted H.264 mp4 copies. `--only` skips the trailer so we do not
  duplicate it. Originals not deleted.

## 2026-08-26: first live Buffer batch failed, then retry after HEAD fix

- Lucas: the 3 Approved + Linked rows are the go-ahead.
- `--dry=false` #1: Instagram rejected (no reel type). `--dry=false` #2:
  all 9 jobs "Video could not be read from its URL" because surviveorion
  HEAD 404s and GET lacked Content-Length.
- `post-buffer.mjs`: IG `type: reel` + `shouldShareToFeed`; YT `categoryId: 20`.
  Batch no longer aborts on the first channel error.
- Retry after the static HEAD deploy is live. Did not delete local video folders.

## 2026-08-26: approved clips copied to public/social-drafts

- Lucas: the 3 Approved rows are the go-ahead. Copied (not moved) into
  `public/social-drafts/` so Buffer can fetch
  `https://surviveorion.com/social-drafts/<file>`. Live schedule after the
  URLs return 200.

## 2026-08-26: calendar.xlsx -> Buffer dry path

- Lucas's `ORION_Publishing_Calendar.xlsx` (20 rows, 3 Approved+Linked) exported
  to `calendar.json`. `calendar-to-buffer.mjs` maps each approved row to IG/TT/YT
  jobs. Default `--dry`. Past/today -> addToQueue; future -> 9am PT scheduled.
- Does not host clips and does not post live. Next: copy the 3 linked files to
  `public/social-drafts/` (public URL) after Lucas nods, then `--dry=false`.

## 2026-08-26: Buffer token vault (outside git)

- Lucas asked for a "git secret" so Cursor can use the Buffer token. GitHub
  Actions secrets cannot be read back locally, so that is not the vault.
- Canonical store: `~/.config/orion-social/buffer.env` (chmod 600, not in any
  repo). Working copy: gitignored `social/.env`. Same token already in both.
- `loadEnv()` now reads the vault first, then `.env`. No token in git.

## 2026-08-26: Buffer YouTube title metadata (branch `sam/buffer-youtube-title`)

- `post-buffer.mjs`: `--youtube-title` wires `metadata.youtube.title` on YouTube
  posts; body stays in `text`. Not merged to main.

## 2026-08-26: merged into orion-web at `social/`

- `git subtree add --prefix=social ../orion-social main` from branch `sam/social-merge`.
  History preserved: `fcce94e` through `82ee9f3` (9 commits). Standalone
  `diesirae1908/orion-social` and `~/Documents/games/orion-social` left untouched.
- Added Buffer posting path: `BUFFER_ACCESS_TOKEN` in `.env.example`,
  `buffer-channels.json`, `scripts/post-buffer.mjs` (default `--dry`). Media field on
  `CreatePostInput` not introspected (no token yet): wired as unconfirmed
  `mediaAttachments` with `{ localPath }` pending live schema check.
- `ops/com.orion.social.batch.plist` paths updated to `orion-web/social/`.

## 2026-08-25 (Aug 25 ~4:08 PM PT): private GitHub remote

- Lucas: "ok, push everything live". Game repo already on surviveorion.com (`04deff9`, bundle `index-Cn4JTljO.js`). This pipeline had no origin.
- Created private `diesirae1908/orion-social` and pushed `main`. `.env`, `auth/`, `out/`, fixture video stay gitignored. `out/approved/` still absent: nothing posted to YT/IG/TikTok.

## 2026-08-25 (Aug 25 ~3:42 PM PT): lock NEW_BEST golden to the HTML board template

- Vendored approved board assets into `presets/`: `newbest-board.template.html`, `newbest-board-day43.png` (reference), `tag-newbest.png`, `fonts/Rajdhani-Bold.ttf`, README section "NEW BEST board template". Replaced the brand-cover-SVG fallback Lucas rejected.
- Board render (`src/newbest-board.mjs`): substitute `{{SCORE}} {{PREV_BEST}} {{DAY}} {{MUTATOR}}`, Playwright screenshot 1080x1920 `deviceScaleFactor` 1, `waitUntil: 'load'` + `document.fonts.ready` (not networkidle). Star field stays seeded.
- PREV_BEST: tesseract not installed. ffmpeg cropped the HUD corner (700x220 from 0,0) of `fixtures/orion_2026-08-25_day43_arsenal_3490380.webm` at 0.5s, 1s, and 2s. All three frames show `BEST 3,246,228`. Wrote that verified HUD value as `sidecar.bestScore: 3246228` (not copied from the reference PNG; the renderer has no previous-best constant). SCORE 3,490,380 / DAY 43 / ARSENAL from the sidecar.
- Pixel-diff rendered board vs `presets/newbest-board-day43.png`: max channel delta 246, MAE 6.086, not byte-identical. Layout, type (Rajdhani), and numbers match. Deltas are Chromium AA / gold-gradient rasterization, not a cover-template leftover. Renderer left as-is; reference not edited.
- Re-rendered only `out/golden/NEW_BEST.mp4` (12.854s, 1080x1920, 24fps H.264 + AAC). Play is still last 8s + celebration-funk board. No new tagline overlay (locked recipe has none). WASTED/PATROL not redone. `out/approved/` not written (dir absent).
- `npm test`: 66/66. Board fill uses sidecar/HUD numbers; missing prev-best fails loud for non-fixture clips; no em dashes; renderer source does not hardcode 3246228.
- Commit: `e5025bb` on local main. No remote, no push.

## 2026-08-25 (Aug 25 ~2:20 PM PT): locked-preset runner plus C-E plumbing

- Vendored locked recipes: `presets/` (README, day43-wasted-segments.sh, tag-*.png), `assets/audio/` (he-knew VO, celebration-funk), `assets/memes/wasted.png`, `IDEAS.md`, `DIRECTION-V3.md`.
- Phase B golden/batch now runs `src/presets.mjs` + `src/preset-runner.mjs` only (WASTED, PATROL, NEW_BEST). No fallback to beats/edit.mjs. Missing video/asset/dims/filter throws with the basename. `--dry` prints the exact ffmpeg steps.
- WASTED mix locked: VO x2.1, music 0.42 / 0.10 under VO / 0.62 late, 200ms silence, wasted.png slam. Slow-mo is a second-pass setpts (same-graph setpts after zoompan does not stretch).
- C: platform captions + deterministic tag rotation + YouTube thumbnail from the brand SVG template. Queue writes `out/pending/<date>_<format>_<n>/` and regenerates `REVIEW.md`.
- D/E: posting reads only `out/approved/` (realpath guard). YouTube/IG implemented, tests mock network. TikTok v1 is a manual-tap manifest. `npm run post` never runs live in this session. `npm run batch` never posts and never writes `out/approved/`.
- `googleapis` added for YouTube upload. AUTH.md copied from SPEC. launchd template is batch-only.
- `npm test`: 60/60. Goldens actually rendered this session: PATROL 9.29s 1080x1920, WASTED 14.2s with AAC, NEW_BEST ~12.9s (board from brand cover template; Claude-session board PNG was not in the extract).
- Posting was not executed. `out/approved/` was not written by the pipeline (dir absent). No remote, no push, no OAuth mint.
- Commit: `4020b7f` on local main. No remote, no push.

## 2026-08-25 (Aug 24 ~10:32 PM PT): Phase B v2 grammar + day43 goldens

- Copied V2 pack: `EDITING.md`, `HOOKS.md`, `assets/memes/` (16 PNG + LICENSE), `assets/brand/fonts/Anton-Regular.ttf` (OFL, keep Rajdhani), `scripts/make-meme-overlays.cjs` (paths pointed at `assets/`). SPEC.md Phase B now points at EDITING.md; v1 letterbox recipe dropped.
- Crop engine **v2.0** (day43 JSON has no `track`/`arena`/`view`): CLOSE CALL anchors graze world x,y; others arena-center + 6%/s push-in; clamp; 400ms ease. Precomputed sendcmd+crop. v2.1 path is wired if those fields appear later.
- Beat sheets from EDITING.md. Caps: SPACE DUST 6-9 / CLOSE CALL 8-11 / THE BOARD 9-12 / TODAY'S PATROL 10-14. v1 22s patrol retired. Freeze CTA, no fade-out endcard.
- Captions: always write `.ass` (`out/.cache/v2/`). Homebrew ffmpeg 8.1.2 has **no libass** (and no drawtext); goldens used PNG overlay fallback.
- Sound: game ducked 6 dB under original CC0 SFX (riser/boom/rewind/whoosh/wah/braam). THE BOARD beds `orion-web/public/music/empire-of-the-stars.mp3` at 0.35 (`assets/music/README.md` symlink note). No third-party meme audio.
- day43 sidecar untouched: `topGrazes: []`, `closestCall: null`. Eligible THE BOARD + TODAY'S PATROL only. Synthetic CLOSE CALL from `test/fixtures/orion_2026-08-21_day10_pit_8000.json` (graze t=10.5, x=1, y=2, clearance 0.05) over the day43 video.
- **Goldens** (`out/golden/`, gitignored):
  - `THE_BOARD.mp4` 9.900s, 1080x1920, H.264 High, 30fps, AAC (4.4MB)
  - `TODAYS_PATROL.mp4` 11.400s, same codec (2.1MB)
  - `CLOSE_CALL.mp4` 9.600s, same codec (2.0MB)
- day43 beat sheets: BOARD `{score}. one life.` / still alive somehow / score card / `same seed as you.`; PATROL `ARSENAL DAY` / `double the pickups.` / everyone flies this exact run / `3 attempts. free.` / `your move, pilot`.
- `npm test`: 48/48 pass (crop-path + beat-sheet math covered).
- Nothing posted. Nothing in `out/approved/` (dir absent). No remote, no push. Stopped for review. No Phase C/D.

## 2026-08-25 (Aug 24 ~9:47 PM PT): Phase B rendering + day43 golden

- Real day43 sidecar dropped by Lucas (not reconstructed). `topGrazes: []`, `closestCall: null`, `survivalTime: 270`, gold / 3,490,380. JSON committed; webm stays gitignored.
- Chrome WebM has format duration=N/A and a bogus one-frame stream duration. Harvest now counts packets / fps: **319.9167s** (7678 packets at 24fps), 2904x1656, **no audio**.
- Pairing bug: `basenameWithoutExt` now strips `.json` as well as `.webm`/`.mp4`.
- **day43 CutPlans** (`isFirstOfUtcDay: true`):
  - THE_BOARD: cut `[307.9167, 319.9167]` + 1.5s endcard
  - TODAYS_PATROL: cut `[0, 22]` + 1.5s endcard
  - No CLOSE CALL (empty grazes). No SPACE DUST (score + survivalTime).
- Phase B: `src/edit.mjs`, `src/captions.mjs`, `src/endcard.mjs`, `scripts/golden.mjs`. Endcard hooks: DAY 43 / ARSENAL / 3.49M, cached per day via playwright (same as orion-web `04-export-png.cjs`). **playwright** added; justified for SVG endcard. No googleapis.
- Homebrew ffmpeg 8.1.2 bottle has **no drawtext** (no freetype). Golden uses Void `drawbox` + Rajdhani PNG overlay (`src/overlay-text.mjs`). drawtext path stays for ffmpeg builds that have it. `--dry` CLOSE CALL still prints trim/setpts/concat.
- SPACE DUST SFX mix implemented (`assets/sfx/impact.wav`, original synth, CC0). Golden does not hit it. `--music` bed implemented, unused on golden.
- **golden** (`out/golden/`, gitignored):
  - `THE_BOARD.mp4` 13.300s, 1080x1920, H.264 High, yuv420p, 30fps, AAC (3.6MB)
  - `TODAYS_PATROL.mp4` 23.300s, same codec (2.9MB)
- ffmpeg 8.1.2 / ffprobe same. Node v25.5.0. `npm test`: 32/32 pass.
- Nothing posted. Nothing in `out/approved/`. No remote, no push.
- **Eyeball**: caption band + ARSENAL in Alarm, watermark at (980, 1536), THE BOARD gold score, endcard crossfade, framing (gameplay at 46% height, no crop). Source is silent so output is generated silence + fade into endcard.

## 2026-08-25 (Aug 24 ~9:30 PM PT): Phase A harvest + cut plans

- Repo initialized at `~/Documents/games/orion-social`. First commit: house files + brand assets.
- **day43 JSON**: not present. Video copied locally to `fixtures/` (44 MB, gitignored). Sidecar missing from Downloads and repo search.
- **day43 CutPlans**: cannot compute. Loud unpaired error:
  `Unpaired file skipped: "orion_2026-08-25_day43_arsenal_3490380.webm" (missing matching .json sidecar at ".../fixtures/orion_2026-08-25_day43_arsenal_3490380.json")`
- Implemented `src/filename.mjs`, `src/sidecar.mjs`, `src/harvest.mjs`, `src/plan.mjs` (pure logic, no rendering).
- Hand-written test sidecars: 8s death, Sunday double (`arsenal+starfall`), fullgame `classic`, multi-graze CLOSE CALL.
- `npm test`: 23/23 pass. ffprobe on day43 webm: duration ~4-5 min (local fixture).
- Stopped at Phase A per dispatch. No ffmpeg filtergraphs, edit.mjs, captions, queue, or posting.
