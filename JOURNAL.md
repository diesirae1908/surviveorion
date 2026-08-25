# JOURNAL

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
