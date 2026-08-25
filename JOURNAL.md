# JOURNAL

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
