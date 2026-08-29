# Orion work journal

Newest first. Every substantive change gets a dated entry here (what changed,
why, commit hash, follow-ups), committed together with the work. See
`AGENTS.md` → "Recording your work".

## 2026-08-29: Discovery overlay on scheduled Buffer posts

- 15/15 scheduled IG/TT/YT Buffer posts updated. Live/sent posts cannot be
  edited with this Buffer token. Studio login is a different Google account.

## 2026-08-29: Spell diet so restricted days cannot streak

- LIVE `de86e4a` on `main`. Render `dep-da9hvjoae00c73amp6kg` live
  ~11:13 AM PT. Bundle `main-Baa4C5p_.js` / `mutators-Cl8Ukli-.js`
  (was `main-Cff0FvXQ.js` / `mutators-BRECQUcI.js`).
- Wave 2 put 8 monopower entries in a 32-pool, so hash picks clustered
  (live 4-day restricted streak Aug 29–Sep 1). Full kit should be the
  default; restricted days stay a special, not a streak.
- `SPELL_DIET_FROM = 2026-08-31`. A day is restricted iff any active
  mutator has the `monopower` tag. After the gate, a restricted day is
  allowed only when both previous resolved days were full-spell.
  `pickFirst` keeps the hash + yesterday-raw-index step. If that lands
  on monopower when the diet forbids it, the same date hash is re-indexed
  into the full-spell subset (walking +1 dumped those days on THE PIT /
  BLACKOUT). Sunday `pickSecond` skips monopower when a restricted day
  is not allowed. Lookback is memoized on fully resolved days. No new
  `rand()` / `scheduleRand()` draws.
- Aug 29 GOLD DASH and Aug 30 BAIT SHOT + YEAR OF THE SERPENT stay
  frozen (both resolve with the old picker; the gate day's lookback
  sees two restricted days and forbids ION on Aug 31). Existing
  `mutator-snapshot.json` and `mutator-snapshot-wave2.json` untouched.
- New fixture `scripts/mutator-snapshot-spell-diet.json` from the gate
  through 2026-12-31. That window: 97 full-spell / 26 restricted, no
  consecutive restricted days.
- Sep 1 identity changes (STARFALL → SOLAR WIND). Sep 2 RED ALERT and
  Sep 26 GREAT WALL unchanged.

## 2026-08-29: Social discovery process (IG / TikTok / YouTube)

- Branch `sam/social-discovery`. Searchable titles, TikTok hashtags restored,
  `#Shorts` + madeForKids false, pinned-comment file. Nothing posted.

## 2026-08-29: Flare pulls trains and shapes, keeps the pile

- Aug 30 is BAIT SHOT + YEAR OF THE SERPENT. Flare only homed loose
  drones, so serpents ignored it, then the pile fused into a bomb.
- Scripted drones (serpents/walls) now drop the train and gather on the
  decoy. Assemblies steer toward it as a shape and do not burst, shatter,
  or detonate while baited. Crowd-evolution ignores the pile.
- Flare still does not kill. Pulse is still the shot.
- Sim-test 3e covers train gather, parked bomb, no crowd fuse.
  `test:mutators` snapshot untouched.
- LIVE `38309ea`. Render back ~10:35 AM PT after a 502 during rebuild.
  Bundle `main-Cff0FvXQ.js` / `mutators-BRECQUcI.js` (was
  `main-C80AS654.js` / `mutators-yFR-vVlo.js`).

## 2026-08-29: Rewrote Ditch the Can + Dead Fart Buffer copy

- Same 6 scheduled posts, new captions. No video files touched.

## 2026-08-29: Melting-pot filler callsigns LIVE

- Pushed `c19d433` to surviveorion `main`. Render `dep-da99a7jl550s739pprg0`
  live ~1:16 AM PT. Server-only, bundle unchanged.
- Lucas: mix everything. First Aug 29 PT name (Finhc) lands ~2:21 AM PT.

## 2026-08-29: Melting-pot filler callsigns

- Lucas: not one generator. Mix everything discussed: first names, typos,
  ALL CAPS, lowercase, digits, Dofus mashes, two-word sci-fi, nonsense
  real-word pairs. Shuffled quota per patrol day so no style dominates.
- Same 20–40 / time-gate / blocklist / live-name skip. Seed
  `orion-daily-bots-mix-`. LIVE `c19d433`.

## 2026-08-29: Host Ditch the Can + Dead Fart social finals

- Two new CapCut finals hosted at `/social-drafts/` with faststart.
  Calendar slots Sep 1 and Sep 2. Game runtime untouched.

## 2026-08-29: iPhone Save clip is Photos MP4, not a weird download

- Safari 18.4+ started advertising WebM, so Save clip dumped a .webm into
  Files. Photos and CapCut will not treat that as a camera-roll video.
- iOS now records H.264 MP4 and Save clip opens the native share sheet
  (Save Video). Desktop / Android download path unchanged (WebM first).
- Tests: `test:recorder` (preferMp4 order + share-sheet mocks).
  Lucas-only. Not player-facing.

## 2026-08-29: Dropped empty Aug 28 WASTED calendar row

- Lucas: WASTED = SPACE DUST. Removed the unlinked draft row only.
  No files deleted. Buffer unchanged.

## 2026-08-28: Host 4 new social finals + Nature's Call calendar slot

- GOLD DASH, Rate this dodge, Space Dust, Nature's Call hosted at
  `/social-drafts/` for Buffer. Calendar: Aug 29 GOLD DASH + Rate this
  dodge, Aug 30 Nature's Call (new POV slot), Aug 31 Space Dust.
- Naturecall was in Downloads, copied into `final_videoasset/` (not moved).
  Spacedust HEVC remuxed to H.264. Game runtime untouched.

## 2026-08-28: GOLD DASH stop-aim-ram, always one orb

- Lucas: dash was hard to aim and the field filled too fast. Pickup now
  freezes the ship for a 0.5s aim (turn only), ram-safe, then the locked
  line burns. Trail 0.55 -> 1.1, ram bubble 0.5 on charge/dash/grace.
  Ambient 0.75x. Always exactly one Afterburner; collect replaces it on
  the far side via a date hash (no shared-seed draws).
- Copy + hint updated. Difficulty 0.9 -> 0.85. Aug 29 UTC is GOLD DASH.
- Sim-test: stop/turn/ram/dash + hold-one + formation script stays synced
  if you collect. `test:mutators` snapshot untouched.
- LIVE `0006051`. Render `dep-da97dvnlk1mc73fsoli0` ~11:08 PM PT. Bundle
  `main-DtjiQeq0.js` (was `main-BvksxERv.js`).
- Lucas playtest ~11:18 PM PT: "WAY better, keep it live." Feel locked.

## 2026-08-28: ION charge ram LIVE

- Pushed `fac1b93` (`d319787`) to surviveorion `main`. Render
  `dep-da977c710e5c73as24hg` live ~10:53 PM PT. Bundle `main-BvksxERv.js`
  (was `main-DJI6xiG-.js`), mutators `mutators-IiLoD6d9.js`. Charge ram +
  ~1-in-5 shields is on surviveorion.com. First ION patrol day Aug 31.

## 2026-08-28: ION charge rams; a few shields drop

- Lucas: ION is super fun but a bit too hard. While the cone is charging,
  hull-glow contact now rams (drones, mines, lighthouses, ride-out on
  lethal blasts). Radius `POWERS.ion.ramRadius` 0.45, not a starshell
  bubble. Charge is still 0.8s.
- Ion-day drops are no longer ion-only: ion weight 20, shield 5 (~1 in 5).
  Shield detonation is the map-clean breath. Difficulty 0.9 -> 0.85.
- Copy + `POWER_HINTS.ion` updated. First live ION day is still Aug 31.
- Sim-test: charge ram. `test:mutators` snapshot untouched (weights/copy
  only). Social calendar captions for ION day are stale; re-run
  `npm run calendar:sync` if those posts have not gone out yet.
- Commit `d319787`. Live via `fac1b93`.

## 2026-08-28: Grok cutter cuts land in Notion Clips

- Grok POSTs finished cuts to `POST /clip-inbox/<secret>/cuts` (multipart
  `video`, optional name/format/mutator/sourceId/patrolDate/notes/poster).
- Bytes stay on `/data/clip-inbox/cuts/<id>/`. Never deleted. Served
  unlisted at `GET /clip-cuts/<id>/cut.mp4` (unguessable id, not the inbox
  secret). No public index.
- If `NOTION_TOKEN` is set, fail-soft create of a Clips row Kind `Cut` with
  Hosted URL + optional poster cover. Default DB
  `464e297722b648c58cd3f9a4e98e561a`. Override `NOTION_CLIPS_DATABASE_ID`.
- Tests: `test:clip-inbox` (cut upload/fetch/list) + `test:notion-clips`.
  Commit `3642ddd`. Not on main yet. Needs Render `NOTION_TOKEN` and the
  integration shared on the Clips database. Nothing auto-posts to Buffer.

## 2026-08-28: Admin can backfill clip-inbox pairs

- POST /api/clip-inbox now accepts Bearer ORION_ADMIN_KEY (same as /admin)
  so morning local webm+json pairs can land on /data/clip-inbox without
  a luciux game session. Still allowlist-shaped (CLIP_INBOX_CALLSIGN).
  Player upload path unchanged. Commit `a5c5fa0`.
- test:clip-inbox covers day46 the-flood basename. No player-facing copy.

## 2026-08-28: ION charges like Pulse, then fires an aimed cone

- Pickup no longer shoves instantly. Ion now charges (~0.8s, same pattern
  as Pulse) while a cone tracks the ship, then bowls drones along that
  facing. The shove is still bowling (pushed drones live; what they slam
  dies); you just get a beat to point it.
- Charge preview: full-size cone, slam-axis line, drones in the cone
  ringed cyan. Slammed drones glow ion-blue while they fly.
- ION mutator copy and `POWER_HINTS.ion` updated. Still mutator-only.
- Sim-test: charge-then-aim (turn during charge, only the new heading
  slams). `test:mutators` snapshot untouched (copy-only on the pool entry).

## 2026-08-28: Record / Save clip are luciux-only; no JSON download

- Crew Rehearsal and POST /api/clip-inbox were already allowlist-gated, but
  Record runs and Save clip still showed for every pilot. Those UI paths and
  the recorder start now require the same `clipInbox` flag
  (`CLIP_INBOX_CALLSIGN=luciux` on Render). Save JSON is gone: the sidecar
  only travels with Send to inbox. Other accounts never get the pair.
  Commit `4b44eab`.

## 2026-08-28: Mixed filler names LIVE

- Pushed `c82e42d` to `main`. Render `dep-da93ch710e5c73apo96g` live.
  Server-only change, bundle still `main-BOf4OLSR.js`.
- Live `GET /api/leaderboard/daily?mode=all&limit=20`: Niko (FI), Jonas
  (SE), keel (NZ), tess (GB), Patchwork (CA). Meteor Courier / Kestrel
  Wing gone. Real pilots (Trip, Jarsco, Luciano, L33x, bellend, Haribro)
  unchanged.

## 2026-08-28: Daily filler names vary format and origin

- Public daily board fillers were all two-word Title Case sci-fi names
  with a random flag, which made the Filler column obvious next to real
  pilots (Trip, Jarsco, Luciano, L33x, bellend, Haribro).
- `server/dailyBots.mjs` now uses a mixed pool: first names, lowercase
  handles, one-word callsigns, a few two-word leftovers, a few digit
  handles. Country is bound to the name (Kenji stays JP).
- Tests cover format mix, uniqueness, live-name collision, and country
  pairing. Not merged, not deployed (customer-facing board).

## 2026-08-28: Crew Rehearsal picker is allowlist-only

- The future-day dropdown was also unlocking from a leftover
  `?rehearsal=director` flag in localStorage, so a second account on the
  same browser still saw next-14 patrols. Picker is `clipInbox` from
  `/api/me` only. Production `?day=` / `?mutator=` also require that
  allowlist. Localhost URL preview stays for tuning. Stale
  `orion.rehearsal` is cleared on boot.

## 2026-08-28: Admin analytics revamp live

- Pushed `1057fc3` to `main`. Render `dep-da9361v10e5c73apkfj0` live.
- `/admin` is the Shopify-style report. Selected day vs all-time. Public
  board split real vs filler. Verified live HTML + `day.board` (6 real,
  17 fillers on 2026-08-28 PT).

## 2026-08-28: Admin analytics Shopify-style revamp (branch `sam/admin-analytics`)

- `/admin` dropped the gold-on-void Mission Control chrome. Light analytics
  page in `server/admin.html`: Selected day (owns the date picker) vs All
  time and rolling (explicitly ignores the picker).
- Day report now includes the public daily board, split into real scores vs
  filler bots. Those fillers are why the lobby can show ~19 names with only
  a handful of visits. Bots never write visits or runs.
- `GET /api/admin/stats` attaches `day.board` (`realPilots`, `fillerBots`,
  `entries`). Lucas: push live.

## 2026-08-28: Profile analytics locked as a WIP square

- Career stats, Iron Rain record, and the run sparkline are hidden on
  own profile and public pilot records. A dashed square reads ANALYTICS /
  LOCKED / WIP so the slot is reserved for the paid analytics plan.
  Badge grid unchanged. Live on `main` `b2383de`.

## 2026-08-28: Daily lobby profile + wingmates

- Daily lobby hid identity after the Reddit launch, so even a signed-in
  pilot could not find their callsign, country, or friends. The same
  fullgame screens now open from a lobby profile chip (Sign in, or
  callsign + flag). TODAY'S BOARD rows open a public pilot record with
  Add / Accept / Decline. Own profile has Wingmates (mutual accept) and
  Sign out. Settings shows Pilot profile when signed in.
- Reuses existing `/api/me`, `/api/friends/*`, `PATCH /api/me` country.
  Daily ghost rows stay on the board but are not clickable (`virtual` on
  the public combined board, userId still stripped). Live on `main`
  `bfe22eb` (profile chip `673acca`).

## 2026-08-28: Lucas-only clip inbox + future-day rehearsal

- Phone workflow without Drive OAuth: allowlisted Google account
  (`CLIP_INBOX_GOOGLE_SUB` / `CLIP_INBOX_CALLSIGN`) sees Crew Rehearsal
  (next 14 patrols, sandboxed) and Send to inbox on game-over. Upload is
  `POST /api/clip-inbox` (multipart webm+json). Grok fetches
  `GET /clip-inbox/<secret>/`; consume moves pending → consumed, never
  deletes. Disk: existing Render `/data` (`orion-data`, 1GB) at
  `/data/clip-inbox`. Inbox module `3671450`. Live on `main` `bfe22eb`.
- Sidecar now includes `deathTime`, `powers[]`, and `events[]` (mutator /
  power / death timestamps) so the cutter can label CLOSE CALL / SPACE DUST
  / THE BOARD / TODAY'S PATROL. Rehearsal runs stamp the future date on the
  filename. Canvas recording is still the full playfield.
- Tests: `test:clip-inbox` PASS, sidecar extras PASS, `sim-test` ALL CHECKS
  PASSED. Render env still needs `CLIP_INBOX_SECRET` + allowlist before the
  inbox/rehearsal picker is useful in prod.

## 2026-08-28: Social clips letterbox full playfield

- Pipeline now shows the entire playfield in 1080x1920 with true black bars.
  Void pad + zoompan crop is retired. Helper: `LETTERBOX_VF` / `letterboxFilter` in `social/src/presets.mjs`.
- Tests updated in `social/test/presets.test.mjs` and `social/test/edit-dry.test.mjs`.
- No post, no `social/out/approved/`, no `src/` game runtime.

## 2026-08-28: GREAT WALL Buffer posts moved to Sep 26

- Next GREAT WALL patrol is 2026-09-26. Edited the 3 scheduled Buffer
  posts (IG/TT/YT) from Aug 29 9am PT to Sep 26 9am PT
  (`2026-09-26T16:00:00.000Z`). Same clip. YT title now Day 75.
- Calendar gained a Sep 26 GREAT WALL row, `Post status: Scheduled`, so
  `calendar:buffer` will not duplicate them.

## 2026-08-28: Publishing calendar rewritten from the live wave-2 pool

- TODAY'S PATROL rows from 2026-08-29 now match `getMutatorsForDateStr`.
  Aug 29 is GOLD DASH, not GREAT WALL. Non-patrol formats untouched.
  Aug 28 THE FLOOD stays Approved + Linked.
- Sync path: `npm run calendar:sync` in `social/` (dumps live picks, writes
  the xlsx, exports `calendar.json`). Re-run after any pool append.
- Buffer: 3 GREAT WALL posts still scheduled 9:00 AM PT Aug 29. Calendar
  no longer says to post them. Cancel needs Lucas.

## 2026-08-28: Wave 2 mutators + mutator-only powers + field guide

- Appended 10 Daily Patrol mutators with `availableFrom` 2026-08-29 (PT
  midnight mix-in). Aug 10 through Aug 28 snapshot unchanged. Six new
  powers (RAZOR, THUNDER, CLOAK, FLARE, ION, HOWLERS) are engine-complete
  and stay off Classic / Iron Rain / Training via `MUTATOR_ONLY_POWER_IDS`.
- Days: RAM RAID, GOLD DASH, THE LIGHTHOUSE, GRAZE PROTOCOL, RAZOR,
  THUNDER, CLOAK, BAIT SHOT, ION, HOWLERS. Lighthouse is a growing
  scanner (first at 5s). Graze Protocol prints big gold numbers.
- Unlisted `/guide.html` reads `MUTATOR_POOL` live. Fly links use
  `?mutator=` + `?rehearsal=director`.
- Tests: `test:mutators` ALL PASS (split snapshot), `sim-test` ALL
  CHECKS PASSED, `tsc --noEmit` clean.

## 2026-08-28: Share result includes a real surviveorion.com link

- Share-result paste (clipboard on desktop, native sheet on phones) already
  ended with the bare domain `surviveorion.com`. Many apps never make that
  a tap target. Last line is now `https://surviveorion.com`, and
  `navigator.share` also gets that URL so the sheet can attach a link.
- Live on `7c5f450` (wave-2 merge carried `8f829e5`). Render `dep-da8ukerl550s739i3pb0` live ~1:07 PM PT. Bundle `main-BdNRpL01.js` has `https://surviveorion.com` and `navigator.share({text, url})`.

## 2026-08-27: THE FLOOD + GREAT WALL in Buffer (~10:51 PM PT)

- Lucas added `0827_theflood_916.mov` and `0827_greatwall_916.mov` to
  `final_videoasset/` as buffer. Masters left there. HEVC remuxed (copy)
  to H.264 in `public/social-drafts/`. Hosted `6ae9ed9`, Render
  `dep-da8i30ou01pc73f572s0` live. HEAD 200 + Content-Length.
- 6 Buffer posts, all `scheduled`. THE FLOOD 9:00 AM PT Aug 28:
  IG `6a9121e0df4be5293ae334d8` / TT `6a9121e0ae8294e4837019e0` /
  YT `6a9121e1b12b8efbe7375b7c`. GREAT WALL 9:00 AM PT Aug 29:
  IG `6a9121e2efbc4adde7879dbe` / TT `6a9121e3df4be5293ae33522` /
  YT `6a9121e4ae8294e483701a04`. `--only` so trailer/He Knew/THE PIT
  were not duplicated. Sep 7 Flood row stays Draft.

## 2026-08-27: BLACKOUT true-black LIVE

- Lucas: "I like it!!!! push live :)". Pushed `a1ba639` (and `e88a2e7`) to
  `origin/main`. Bundle `index-BZNa6gyX.js` → `index-DkD0r7nG.js`. HTTP 200.
  Live JS has "Stay in the pocket" / "Some of those are fakes". Hard refresh.

## 2026-08-27: BLACKOUT true-black + fake flickers + growing dark (local)

- Lucas: overlay still leaked the arena; wanted a complete blackout outside
  the pocket, fake flickers that don't go dark, and outages that get longer
  (3-4s at 1:30, 6-7s at 3:00).
- Overlay is now opaque black (`overlayOpacity` 1) with a radial lantern
  that is fully black past the feather. Fake flickers ride the same
  schedule draws as real ones (`realChance` 0.55; first is always real).
  Dark length is a pure function of minutes. Snapshot untouched.
- Not pushed. Localhost `?mutator=blackout`.

## 2026-08-27: BLACKOUT real lights-out (local, not live)

- Lucas: the 0.5s dim vignette "really doesnt do anything". Wants flicker,
  then an actual blackout except a small pocket around the ship, 1-2s,
  every 5-15s.
- New `src/blackout.ts` (STARFALL-shaped). Flicker 0.4s, then dark 1.2-2.0s
  with a lantern (`lanternRadius` 1.85) around the ship. Next gap is
  `scheduleRange(5, 15)`. First outage in 3.5-5.5s. Snapshot untouched.
- Copy: "The grid flickers. Then it goes dark. Stay in the pocket."
- Not pushed. Localhost `?mutator=blackout`.

## 2026-08-27: THE FLOOD metronome LIVE

- Lucas: "the flood is great now :) push it live". Pushed `f885172` to
  `origin/main`. Bundle `index-H6gU6f7P.js` → `index-BZNa6gyX.js`. HTTP 200.
  Live JS has "They just keep popping in". Hard refresh.

## 2026-08-27: THE FLOOD metronome (branch `sam/flood-metronome`)

- Lucas: directional surge waves "not good". Wants constant flooding: enemies
  popping on a regular beat, rate increasing the whole run. He will fly it
  and tune.
- `flood.ts` is now a metronome. One edge pop per beat, no jitter, no
  telegraph, no directional current. Interval = start / (1 + k * minutes),
  floored. Classic ambient off so the beat is the only spawn. Formations
  still off.
- Tune in `FLOOD_SURGE` (`src/config.ts`): `intervalStart` 0.32 (~3/s open),
  `tightenPerMinute` 0.38, `intervalHardFloor` 0.10 (10/s cap).
- Copy: "No formations. They just keep popping in." / "A constant beat from
  the edges. The beat speeds up the whole run."
- Snapshot untouched. Not merged, not deployed. Localhost `?mutator=the-flood`.

## 2026-08-27: player feedback #19 THE FLOOD identity LIVE

- Lucas: "awesome push live". Merged `sam/feedback-aug27-flood` → main (`2ca07ef`,
  `--no-ff`). Pushed `origin/main`.
- Bundle `index-DXuWiPE6.js` → `index-H6gU6f7P.js`. HTTP 200. Live JS has
  "Just the current" / "Formations are off" / floodSurge. Hard refresh.

## 2026-08-27: player feedback #19 THE FLOOD identity (branch `sam/feedback-aug27-flood`)

- Admin #19 (Luciano, 2:41 PM PT): v3 slider pass still read as vanilla.
  "Not unique enough. REALLY needs to feel like a flood." Today's live Daily
  is THE PIT; he was rehearsing Flood. Tomorrow PT (2026-08-28) is a Flood day.
- Identity is now a directional current, not denser scatter. New `src/flood.ts`
  (STARFALL-shaped): hashed heading (`orion-flood-<date>`), timed lane surges,
  cyan inflow chevrons. Formations actually off (`formationsDisabled`). Ambient
  trickle 0.45 with a 1-min escalate floor so the open is already moving.
  Opening generic burst skipped; first wave lands inside ~1.5s.
- Copy: "No formations. Just the current. It only runs one way." / "Formations
  are off. Packs surge in from one edge in timed waves, lanes between them."
- Snapshot untouched (144 dates). Not merged, not deployed (customer-facing
  feel; Lucas plays first). Localhost `?mutator=the-flood`.
- Verified: pass — `npx tsc --noEmit`, `npm run test:mutators` (snapshot
  unchanged), `npm run test:no-em-dash`, `npx tsx scripts/sim-test.ts` (Flood
  formations=0, surge script shared, opening 5 drones at t=3s, evasive-bot
  18.9s vs 13.8s baseline, observer 1.5 kills/sec vs 20 ceiling).

## 2026-08-27: player feedback #13-#18 LIVE

- Lucas: "push live". Merged `sam/feedback-aug26-night` → main (`5f411f2`,
  `--no-ff`). Pushed `origin/main`; Render `dep-da86f3rncjis73fdu2bg` live.
- Bundle `index-CzX0LK42.js` → `index-DXuWiPE6.js`. HTTP 200. New copy is
  in the live JS (Flood river, Blackout flicker, Starfall scarce shields,
  Hunt early packs, Cryo mines). Hard refresh if the old bundle is cached.

## 2026-08-26: player feedback #13-#18 (branch `sam/feedback-aug26-night`)

- `/admin` queue, six new Luciano notes after the morning pass. GREAT WALL
  (#14) is praise, left alone. The other five shipped as a design spec from
  Claude CLI (sonnet), then implemented here. Date snapshot untouched (144
  dates). Shared creature-day ramp (`openingMinutes` / `rampMinutes`) not
  moved: it already wakes at 0:27, and moving it would retune every creature
  day.
- THE FLOOD: ambient 1.3->1.8, formations 3.0->4.5, soft cap 0.7->1.3,
  clumps 1.6->2.2. STARFALL: fewer shields (pickup 0.8->1.4), rain opens at
  2.6s and ramps in 1.2 min. BLACKOUT: same 0.36 telegraph scale plus a
  deterministic 6s lights-out pulse (blue-black vignette, telegraphs dim to
  0.15). CRYO WINTER: ice freezes mines; ram-shatter like a frozen drone, no
  boom; ice overlay at 0.5 so the mine stays readable. HUNTING PARTY: early
  waves [11,14]->[8,11], hunting-only graze 1.5x; `validate.mjs` graze
  ceiling 10->15.
- Why: skip-the-card BLACKOUT felt like no mutator; Flood/Starfall/Hunt
  openings were underwhelming; cryo ice hid live mines.
- Not merged, not deployed (customer-facing feel; Lucas plays first).
- Verified: pass — `npx tsc --noEmit`, `npm run test:mutators` (snapshot
  unchanged), `npm run test:no-em-dash`, `npx tsx scripts/sim-test.ts` (all
  22 mutators boot, Flood/Blackout/Starfall/Hunt playability bars hold).
  `test:clip-sidecar` still fails on main from the PT-midnight day shift
  (hardcoded UTC fixtures); not this change.

## 2026-08-26: 3 approved rows are in Buffer (9 posts)

- Launch Trailer + He Knew: addToQueue (IG/TT/YT). THE PIT: 9:00 AM PT
  Aug 27 (`2026-08-27T16:00:00.000Z`). All `scheduled`.
- Buffer post ids: trailer `6a8fcfa13a7f513da7433334` /
  `6a8fcfa2afff9dcdac2093d0` / `6a8fcfa31295cfd65b486e22`; He Knew
  `6a8fd0a91295cfd65b48792d` / `6a8fd0aaa20b784092ce0894` /
  `6a8fd0abce24b9bfdde8b2c0`; THE PIT `6a8fd0acce24b9bfdde8b2f3` /
  `6a8fd0ad50aea461e086d8a0` / `6a8fd0ae8854b4d2a031a423`.
- Masters still in `final_videoasset/`. Nothing else posted.

## 2026-08-26: Buffer took the trailer; .mov HEVC failed

- After HEAD+Content-Length went live, trailer posted to IG/TT/YT (queue).
  He Knew and THE PIT failed: Buffer cannot read `.mov` / HEVC.
- Transcoded copies (not moves) to H.264 mp4 in `public/social-drafts/`.
  Masters stay in `final_videoasset/`. Calendar still names the .mov;
  the Buffer URL rewrites `.mov` → `.mp4`. Retry those two titles only.

## 2026-08-26: static HEAD + Buffer IG reel metadata

- Live `calendar-to-buffer --dry=false` for the 3 Approved rows: Instagram
  first failed (needs `metadata.instagram.type = reel`). After that fix,
  all 9 jobs failed: Buffer cannot read the hosted URL.
- Cause: `serveStatic` was GET-only, so HEAD on
  `/social-drafts/*.mp4|.mov` returned 404, and GET had no Content-Length.
  Buffer probes the URL before downloading.
- Static serving extracted to `server/serve-static.mjs`: HEAD and GET share
  headers, Content-Length + Accept-Ranges set. Instagram reel + YouTube
  category 20 on create. Retry Buffer after this deploy is live.

## 2026-08-26: host 3 approved clips for Buffer

- Copied (not moved) `orion_trailer.mp4`, `0826_heknew_916.mov`,
  `0827_thepit_916.mov` to `public/social-drafts/`. Originals still in
  `final_videoasset/`. Server MIME added for mp4/mov/webm so Buffer gets a
  video Content-Type.
- Live URLs after this deploy: `/social-drafts/<filename>`. Then
  `calendar-to-buffer --dry=false` schedules the 3 Approved rows.

## 2026-08-26: gitignore local video folders (never delete)

- Lucas recreated `final_videoasset/` (`orion_trailer.mp4`,
  `0826_heknew_916.mov`, `0827_thepit_916.mov`) and `Recordings_raw/`
  (`orion_2026-08-27_day45_the-pit_235477.webm` + sidecar) after a dispatch
  permanently deleted the earlier untracked copies.
- Root `.gitignore` now covers both current names and the old
  `Final_videoasset/` / `Recordings raw/` spellings. Guardrail added in
  `AGENTS.md`. If the tree is dirty, isolate with a worktree. Never delete.

## 2026-08-26: PT-midnight Daily Patrol LIVE

- Lucas: "push live" (Aug 26, ~9:17 PM PT). Merged `sam/pt-midnight-clerk-fix`
  → main (`dd9fa66`, `--no-ff`) and pushed. Render `dep-da7rkntbedkc73ekblp0`
  live. Brief 502 mid-update; HTTP 200 after.
- Bundle `index-BCMteHRV.js` → `index-CzX0LK42.js`. Live JS has
  `America/Los_Angeles` and `midnight Pacific`.
- `GET /api/leaderboard/daily` date is `2026-08-26` (PT today). That is the
  expected rewind: UTC had already rolled to Aug 27.
- Next mutator change: midnight PT tonight (Aug 27 12:00 AM PT).

## 2026-08-26: restore Clerk import dropped by PT-midnight commit (branch `sam/pt-midnight-clerk-fix`)

- `51f6bce` (PT midnight, landed on main via the buffer-youtube-title merge)
  replaced the `clerk.mjs` import with `patrolDate.mjs`. Server boot then
  crashed: `ReferenceError: clerkEnabled is not defined` at the listen log
  (`server/index.mjs:1255`).
- Render deploy `dep-da7rgo4s728c73aeaikg` (`9c6d383`) is `update_failed`.
  Live stays `f928820` / bundle `index-BCMteHRV.js` (still UTC daily).
- Restored `import { clerkEnabled, clerkPublishableKey, verifyClerkToken,
  clerkUserProfile } from "./clerk.mjs"` next to the new `patrolDateStr`
  import. PT midnight logic unchanged.
- Do not merge until Lucas says; after midnight PT is the clean window
  (a 5 PM–midnight PT deploy rewinds live Daily from UTC-tomorrow to PT-today).

## 2026-08-26: buffer-youtube-title LIVE

- PM review passed (75/75 tests). Merged `sam/buffer-youtube-title` → main
  (`9c6d383`, `--no-ff`). Pushed `origin/main`; Render auto-deployed
  `surviveorion`.
- Brief 502 mid-deploy (~30s after push); HTTP 200 thereafter. Live bundle
  unchanged `index-BCMteHRV.js` (pipeline-only surface area for Buffer title
  metadata; no client bundle flip observed).
- `social/scripts/post-buffer.mjs`: `--youtube-title` / `youtubeTitle` sets
  `CreatePostInput.metadata.youtube.title`.

## 2026-08-26: Daily Patrol midnight PT rollover (branch `sam/pt-midnight-daily`)

- **What changed:** Daily Patrol day boundary moved from UTC midnight to
  **midnight America/Los_Angeles** (PDT/PST). Shared helpers:
  `src/patrolDate.ts` (client) and `server/patrolDate.mjs` (server, same
  algorithm). Live "today" now uses `patrolDateStr()` everywhere: mutator pick
  (`getMutatorsForDateStr`), daily seed, attempt budget, server `daily_date`
  stamp, countdown/`dailyResetLabel()`, virtual-bot submit windows, calendar
  "today". `?day=YYYY-MM-DD` rehearsal still resolves mutators/seed from that
  civil label; `getMutatorsForDate(new Date(\`${d}T00:00:00Z\`))` unchanged.
- **Snapshot:** `scripts/mutator-snapshot.json` **bit-identical** —
  `npm run test:mutators` PASS (144 dates).
- **Deploy caveat:** If this ships between **5 PM PT and midnight PT**, live
  Daily rewinds from the UTC-tomorrow date back to the PT-today date (mutator,
  seed, board key, attempt budget all flip together). Scores already stored
  under the UTC date label stay in SQLite; no migration. Mid-window deploy only.
- **Verify:** `npx tsc --noEmit` PASS; `npm run test:mutators` PASS; `npm run
  test:patrol-date` PASS; `npx tsx scripts/sim-test.ts` PASS; `npm run
  test:daily-history` PASS; `npm run test:server-daily-history` PASS; `npm run
  test:daily-combined-rank` PASS; `npm run test:daily-bots` PASS; `npm run
  test:rehearsal-day` PASS.
- Not merged to main. Not deployed.

## 2026-08-26: Buffer YouTube title metadata (branch `sam/buffer-youtube-title`)

- `social/scripts/post-buffer.mjs`: optional `--youtube-title` / `youtubeTitle`
  sets `CreatePostInput.metadata.youtube.title` (distinct from post body `text`).
  JSDoc notes pipeline clips are 9:16; landscape media won't classify as Shorts.
- Tests in `social/test/post-buffer.test.mjs`. Commit `21cc615`. Not merged to main.

## 2026-08-26: social pipeline merge (branch `sam/social-merge`)

- Merged `orion-social` into `social/` via `git subtree add` (history
  `fcce94e`..`82ee9f3`). Standalone repo untouched until Lucas archives it.
- Buffer posting script (`social/scripts/post-buffer.mjs`), channel ids config,
  creator kit copied from Sam into `brand/creator-kit/`. Game code unchanged.
- Not merged to main, not deployed.

## 2026-08-26: rehearsal-link LIVE

- PM review passed. Merged `sam/rehearsal-link` → main (`e47235b`,
  `--no-ff`). Pushed `origin/main`; Render auto-deployed `surviveorion`.
- Live bundle flipped `index-DUrIPklW.js` → `index-BCMteHRV.js` (~1 min
  after push). HTTP 200 confirmed.
- Invisible to players: `?rehearsal=director` unlocks rehearsal director mode
  in one click; no param → unchanged behavior.

## 2026-08-26: rehearsal-link — one-click director unlock via URL (branch `sam/rehearsal-link`)

- **`?rehearsal=director` / `?rehearsal=off`:** before `REHEARSAL_DIRECTOR` is
  computed, the client reads the `rehearsal` query param, persists to
  `localStorage.orion.rehearsal` (or clears it), and applies the gate on the
  same page load so `?day=…&rehearsal=director` rehearses in one click. Wrapped
  in try/catch for private browsing. No param → unchanged behavior.
- **Tests:** `scripts/test-rehearsal-day.ts` now asserts the gate decision table.
- Why: follow-up to production rehearsal unlock (`752c831`) — Lucas needs a
  shareable link that unlocks and rehearses without a manual reload.
- Commit: `e556b01`.
- Follow-up: merge when ready; not deployed from this branch.

## 2026-08-26: board-life LIVE

- Lucas approved deploy. Merged `sam/board-life` → main (`752c831`,
  `--no-ff`). Pushed `origin/main`; Render auto-deployed `surviveorion`.
- Live bundle flipped `index-B5mS0Bc1.js` → `index-DUrIPklW.js` (~1.5 min
  after push; brief 502 mid-deploy). HTTP 200 confirmed.
- Daily board check (`GET /api/leaderboard/daily?mode=all&limit=12`): 7/12
  entries are bot callsigns (e.g. Tactical Sparrow, Falcon Patch, Drift
  Courier); no entry exposes `userId`.

## 2026-08-26: board-life PM fix round — strip board userId, tame launch-window bot scores (branch `sam/board-life`)

- **Bot userId leak:** `publicBoardEntry` now drops `userId` on every public
  leaderboard row (client never reads it; bots used `bot:DATE:i`). Test asserts
  no board JSON value matches `/^bot:/`.
- **Launch-window bot scores:** top tail tightened to 0.5% probability, capped
  at 330k (`300k + rng*30k`). No salt bump needed after retune — launch day no
  longer stacks 350k+ bots.
- Why: PM review of `sam/board-life` — devtools could spot bots instantly; Aug 26
  drew two bots above 350k and 5 of the first 9 days had a 340k+ top bot.
- Commit: `ae11f3f`.
- Top bot per UTC day (Aug 26 – Sep 8, end-of-day field):
  - 2026-08-26: 294,762 (Tactical Sparrow)
  - 2026-08-27: 267,712 (Cinder Pilot)
  - 2026-08-28: 294,102 (Meteor Courier)
  - 2026-08-29: 296,352 (Binary Kite)
  - 2026-08-30: 274,029 (Meteor Courier)
  - 2026-08-31: 298,702 (Glint Runner)
  - 2026-09-01: 315,924 (Quiet Burn)
  - 2026-09-02: 296,460 (Harbor Wing)
  - 2026-09-03: 292,235 (Gale Runner)
  - 2026-09-04: 299,898 (Lumen Drifter)
  - 2026-09-05: 283,298 (Nimbus Ace)
  - 2026-09-06: 270,149 (Lumen Drifter)
  - 2026-09-07: 278,500 (Stellar Skipper)
  - 2026-09-08: 305,103 (Onyx Vector)
- Verified: pass — `npx tsc --noEmit`, `npm run test:mutators`, `npx tsx
  scripts/sim-test.ts`, `npx tsx scripts/test-gameover-rank.ts`, `npm run
  test:nickname`, `npm run test:daily-bots`, `npm run test:rehearsal-day`.
- Not merged, not deployed.

## 2026-08-26: board-life — daily bots, board UI, production rehearsal (branch `sam/board-life`)

- **Production rehearsal unlock:** `?mutator=` and `?day=YYYY-MM-DD` preview params
  work on localhost/127.0.0.1 as before; on production they are ignored unless
  `localStorage.orion.rehearsal === "director"`. Rehearsal runs stay sandboxed
  (no daily attempt spent, no score submitted, no medal recorded).
- **Virtual daily bot scores:** `server/dailyBots.mjs` — ~60 blocklist-safe bot
  callsigns; hash-picked 20–40 bots per UTC day with plausible score curves;
  submit times spread across the UTC day so the merged board fills in over time.
  Bots merge into `mode=all` daily rankings and gap-to-goal but never touch the
  DB, wingmates, or analytics (`virtual` stripped before JSON).
- **Daily board UI:** daily-only lobby shows top 10 + callsign search + pinned
  me-row (`.board-row.pinned`) on TODAY'S BOARD.
- Why: early UTC hours left the daily lobby board empty; Lucas wanted a living
  board and a production-safe way to rehearse future patrol days without
  leaking the preview tool to every player.
- Commit: `46c7463`.
- Verified: pass — `npx tsc --noEmit`, `npm run test:mutators` (golden snapshot
  unchanged), `npx tsx scripts/sim-test.ts`, `npx tsx scripts/test-gameover-rank.ts`,
  `npx tsx scripts/test-nickname.ts`, `node scripts/test-daily-bots.mjs`,
  `npx tsx scripts/test-rehearsal-day.ts`.
- Board samples (`GET /api/leaderboard/daily?mode=all&limit=10`):
  - **Today `2026-08-26`:** Tactical Sparrow 359048 · Falcon Patch 351401 ·
    Drift Courier 236134 · Onyx Vector 154333 · Jetstream Lark 149540 (bots +
    any real pilots merged; `virtual` not exposed on wire).
  - **Future `2026-09-15` (end-of-UTC-day module sim — HTTP endpoint is
    today-only):** Apex Courier 364069 · Glint Runner 268221 · Waypoint Ghost
    238749 · Zenith Tracer 174172 · Echo Vector 146909.
- Not merged, not deployed.

## 2026-08-26: player feedback fixes LIVE

- Lucas approved deploy. Merged `sam/feedback-aug26` → main (`e1e1abc`,
  `--no-ff`). Pushed `origin/main`; Render auto-deployed `surviveorion`.
- Live bundle flipped `index-H0A3VNmC.js` → `index-B5mS0Bc1.js` (~1 min after
  push; brief 502 mid-deploy). HTTP 200 confirmed.

## 2026-08-26: player feedback fixes from admin queue (branch `sam/feedback-aug26`)

- `/admin` feedback queue, five items: blocked callsigns now show a
  deterministic fun pseudonym (FNV-1a over the raw name, same 24-name list in
  `src/nickname.ts` + `server/nickname.mjs`, list parity asserted in
  `scripts/test-nickname.ts`) instead of the static "Callsign redacted";
  game-over comparison board pins **this run's** score on the me-row (`runScore`
  in `deriveGameOverRank`; gap-to-goal + target row hidden when this run already
  passed the chase pilot); SOLAR WIND drones only take ~30% of the wind
  displacement (`DRONE.windDriftFraction: 0.3`, ~70% compensated in homing) so
  the opening stays dense without losing visible drift; upward-wind top-wall
  escape regression in `scripts/test-mutators.ts` (inertia thrust, direct
  control, afterburner dash); player-facing em-dash sweep in
  `scripts/test-nickname.ts` (409 / Welcome back / vortex already comma/colon;
  sweep guards regression).
- Why: Lucas (#9 pseudonym, #10 game-over score confusion), live SOLAR WIND
  emptiness (#12), and a stale-bundle top-wall report (#11) worth locking in.
- Wind balance pick: partial drift fraction over rim-steer because it preserves
  the current's feel with one tunable and no extra per-drone steering logic.
- Commit: `420d432`.
- Verified: pass — `npx tsc --noEmit`, `npm run test:mutators` (golden snapshot unchanged), `npx tsx scripts/sim-test.ts`, `npx tsx scripts/test-gameover-rank.ts`, `npx tsx scripts/test-nickname.ts`.
- Not merged, not deployed.

## 2026-08-25: SOLAR WIND pin + shifting current LIVE

- Lucas: "ok push live" (Aug 25, ~9:20 PM PT). Merged `sam/solar-wind-pin` to
  main (`dc33928`). Ship can leave the wall again; current shifts every 20-28s
  with a 2.5s CURRENT TURNING warning. Live Daily is UTC 2026-08-26 SOLAR WIND.
- Pushing `origin/main` (Render auto-deploy).

## 2026-08-25: SOLAR WIND wall pin + shifting current (branch `sam/solar-wind-pin`)

- Live Daily Patrol (UTC 2026-08-26) pinned the ship to the top wall. Wind
  was a raw position nudge ahead of control; `clampToBounds` then zeroed
  velocity on that axis unconditionally, including the outward component, so
  thrust away could never accumulate. Inertia (thrust 12) never won a frame;
  drones (unclamped) blew off the top and lined the rim with radar chevrons.
- `clampToBounds` now only kills the into-wall component. `ship.ts` cancels
  into-wall wind once the hull is already on that wall (covers the
  afterburner path too). Drone wind stays a raw positional add.
- The current now shifts during the run. Heading is `hashString` of the UTC
  date plus a segment index (same family as the old per-day angle; segment 0
  keeps `orion-wind-YYYY-MM-DD` so today still opens at ~67.8°). Period is
  hashed in 20-28s of `world.time`, 2.5s warning, and a <25° no-op rehashes
  with `-alt` or takes a quarter-turn. Strength stays 2.2 (or the summed
  Sunday `windStrength`). No `rand()` / `scheduleRand()` draws. Snapshot
  untouched.
- In-world bronze current marks and rim chevrons show the live heading;
  incoming heading pulses in during the warning. HUD line: `CURRENT TURNING`
  plus countdown. Briefing/subline no longer claim a constant all-day current.
- Verified: `npx tsc --noEmit`, `npm run test:mutators` (snapshot + clamp /
  hash / wall-escape checks), `npx tsx scripts/sim-test.ts`. Not a deploy.
  Feature branch only.

## 2026-08-25: sidecar track + Chrome hint LIVE

- Lucas: "push live" (Aug 25, ~3:26 PM PT). Merged `sam/sidecar-track` to main
  (`d62b554`). Ships `track` / `arena` / `view` on the clip sidecar plus the
  desktop Chrome Save JSON + Automatic downloads hint. Not a gameplay change.
- Recorder path untouched. Pushing `origin/main` (Render auto-deploy).

## 2026-08-25: desktop Chrome second-download hint (branch `sam/sidecar-track`)

- Track sidecar (`track` / `arena` / `view`) was already on this branch from
  2026-08-24; this commit is the Chrome follow-up only.
- Desktop Chrome often silently drops the second programmatic download (JSON)
  when Save clip fires video + JSON in one click. Added `isDesktopChrome()`
  next to `isIosWebKit()` in `clipSidecar.ts`; desktop Chrome now gets the
  same visible Save JSON link as iOS plus a field-hint pointing at
  `chrome://settings/content/automaticDownloads`. iOS path unchanged (video
  only programmatic, Save JSON link, no Chrome hint). Other desktop browsers
  keep dual programmatic download with no hint.
- Verified: `npx tsc --noEmit`, `npx tsx scripts/sim-test.ts`, `npx tsx
  scripts/test-clip-sidecar.ts` (new UA tests for Chrome/Edge/Opera/Android/
  Safari/Firefox).
- Commit: `03e881e`. Not a deploy. Feature branch only.

## 2026-08-24: clip sidecar ship track (branch `sam/sidecar-track`)

- Sidecar JSON now includes `track` (`[t, x, y]` at 2 Hz, cap 720 / 6 min) plus
  frozen `arena` (world units) and `view` (canvas CSS px) so social cuts can
  follow the flight without guessing a crop. Snapshot still at game-over.
- Sampling is additive telemetry: `sampleShipTrack` in `tick` next to grazes,
  plus the t=0 origin sample at `createWorld`. Reads `world.time` and ship x/y
  only. No recording-path changes, no `trackClosestCall` change, no seeded
  streams / `Math.random`.
- Verified: `npx tsc --noEmit`, `npx tsx scripts/sim-test.ts`, `npm test`
  (clip-sidecar now asserts 0.5s cadence, 720 cap, and a scripted-run match).
- Not a deploy. Feature branch only.

## 2026-08-24: privacy policy + terms pages (branch `sam/legal-pages`)

- Added `public/privacy.html` and `public/terms.html`, needed as the App domain
  links for the Google OAuth consent screen (orion-social YouTube auth), and
  overdue for a live game anyway. Served at `/privacy.html` and `/terms.html`
  via the existing dist static handler; SPA fallback makes extension-less
  paths land on the game, so the `.html` URLs are canonical.
- Content derived from the actual code, not boilerplate: visits store a
  truncated SHA-256 `ip_hash` and never raw IPs (`server/db.mjs` schema
  comment), no third-party analytics exists, password hashes are salted,
  Google Sign-In stores `google_sub`, clips never upload (`recorder.ts`).
  Contact channel is the in-game feedback form. Governing law BC, Canada.
- Kit-styled standalone pages (Void/gold, Rajdhani, the sight mark inline),
  cross-linked, both linked back to `/`. No em dashes.
- NOT merged: pushing `main` deploys. This change does need a real Render
  rebuild (public/ ships in the build), so no `[skip render]` when merging.

## 2026-08-24: SOCIAL.md + video templates onto main's kit; fix lists closed out (branch `sam/social-docs`)

- The social plan and its two template assets were on `sam/brand-kit` (`15719c7`)
  but missed the kit merge to `main` (`68ee261` took the branch at `c5e7dd9`).
  This branch adds them onto the current kit: `brand/SOCIAL.md`, the 1280x720
  thumbnail overlay and 1080x1920 vertical cover templates (SVG + PNG), their
  generator `05-social-templates.cjs`, and the two export-list entries.
- `brand/BRAND.md` §11, `brand/README.md` and `brand/CONFORMANCE.md` updated
  from "still open" to the executed state: phases 0, 2 to 5 shipped Aug 24 as
  `68ee261`, wordmark/icons as `5e5f360`, clip sidecar as `ec48410`. Only
  optional Phase 1 (color-mix alpha variants) remains, by choice.
- Docs and brand assets only; no game code.

## 2026-08-24: clip sidecar LIVE on surviveorion.com

- Lucas: "ok push live". Merged `sam/clip-sidecar` into main as `--no-ff` `ec48410`.
- Render `dep-da6ge93m8hqs738l1jb0` live. Bundle `index-DWisqDku.js` -> `index-DVAZWGBt.js`. Live JS has `Save JSON`, `topGrazes`, named `orion_${` basename. `/api/config` 200.

## 2026-08-24: clip sidecar JSON + named downloads (branch `sam/clip-sidecar`)

- Downloaded clips now use `orion_<YYYY-MM-DD>_day<N>_<mutator-id>_<score>.<ext>` and a same-basename JSON sidecar (`day`, mutators, this-run medal, score, survivalTime, closestCall, top 5 grazes as `{time, clearance}` only). Snapshot at game-over so a later save cannot read a reset world. Nothing uploads or persists. No callsign.
- Recording path untouched (`startRecording`, 360s cap, bitrate, chunks, mime picker). `trackClosestCall` unchanged; `trackTopGrazes` is additive and reads world time/position only (no `Math.random` / seeded streams).
- **iOS download path that shipped:** Chromium (Cursor browser) is not iOS Safari. Dual programmatic download was not live-device-tested on iPhone/iPad. Desktop / non-iOS: Save clip fires video + JSON in the same click. iOS/iPadOS WebKit (`iPhone`/`iPad`/`iPod`, plus iPadOS-as-Mac + touch): Save clip is video only; a visible **Save JSON** `<a download>` sits next to it (second user gesture). No `setTimeout` dual-click.
- Verified: `npx tsc --noEmit`, `npx tsx scripts/sim-test.ts` (ALL CHECKS PASSED, including Daily Patrol determinism), `npm test` (includes new `test:clip-sidecar` + recorder memory-cap assertions).
- Commit: `80965c9`. Follow-ups: live-device check on iOS Safari if Lucas wants the desktop dual-download path proven/denied there; not required to ship the conservative WebKit link.

## 2026-08-24: brand wordmark + PWA icons (branch `sam/brand-wordmark`)

- **Wordmark:** menu, daily lobby, and intro gate now render the kit vector wordmark
  (`brand/assets/logo/orion-wordmark.svg`) via a shared `wordmarkTitle()` helper in
  `ui.ts` instead of Rajdhani gradient text. SVG uses Flare→Gold→Ingot gradient, unique
  gradient ids per instance, `role="img"` + `aria-label="ORION"`, and a gold drop-shadow
  filter. `.title` CSS retargeted to `.wordmark-svg` width
  `clamp(240px, 60vw, 474px)` (maps the old `font-size: clamp(56px, 14vw, 110px)` cap
  height to the 431:100 aspect ratio; 110px tall ≈ 474px wide).
- **PWA icons:** replaced stale `public/icons/icon-{192,512,180}.png` with kit app-icon
  renders; added `icon-512-maskable.png` from `orion-app-icon-maskable-512.png` and pointed
  manifest maskable purpose at it. Apple-touch uses `orion-app-icon-180.png` (full-bleed app
  icon, not the favicon tile).
- Verified: `npx tsc --noEmit`, `npx tsx scripts/sim-test.ts` (1 flaky retry on unrelated
  pending-grab check), `npm test`, `npm run build`. No gameplay changes.
- Commits: `8fb4890` (wordmark), `29ae493` (icons + manifest).

## 2026-08-24: brand conformance PM review follow-up (branch `sam/brand-conformance`)

- Applied two items previously escalated as skipped: `render.ts:127` arena gradient top now
  `PALETTE.bgTop` (`#12121e`, deliberate Phase 2 drift collapse); `.calendar-nav-btn:disabled`
  `#6a5a45` → `var(--orion-dust)` (Phase 3.2 second occurrence). Visual/CSS only.
- Commit: `48b7bfb`.

## 2026-08-24: brand conformance Phases 2–5 (branch `sam/brand-conformance`)

- **Kit fix:** added `--orion-brass: #ccaa66` to `brand/tokens/orion.tokens.css` (JSON already
  had it). `PALETTE` has no brass field; all shared values agree. Commit `3874392`.
- **Phase 2:** collapsed four near-duplicate UI hex literals to palette tokens (alarm,
  medal-silver, dust). Commit `75de44a`. Arena gradient top (`render.ts:127`) applied in PM
  follow-up commit.
- **Phase 3:** fixed WCAG AA failures: `.daily-day` → bronze, `.calendar-day.missed` and
  `.calendar-nav-btn:disabled` → dust, training `.daily-sub` → `--orion-mode-training`.
  Commit `861f930` (+ PM follow-up for disabled nav btn).
- **Phase 4:** em dash in `ui.ts:711`, manifest colon, kit OG swap, favicon r=37/stroke=11,
  tutorial spin deduped to one exclamation (touch keeps it). Commit `b10753f`.
- **Phase 5:** collapsed 12 letter-spacing literals to three roles + two strapline tokens
  (`0.25em` intro-gate enter, `0.4em` tutorial tap-continue); `.mono` uses
  `var(--orion-font-mono)`. Commit `8b14406`.
- Phase 1 (`rgba()` → `color-mix`) skipped by decision. Verified: tsc, sim-test, npm test,
  contrast audit, em-dash grep clean.

## 2026-08-24: brand conformance Phase 0 — CSS token layer (branch `sam/brand-conformance`)

- **Phase 0 only** per `brand/CONFORMANCE.md`: extended `:root` in `src/style.css` with
  colour, type and motion tokens from `brand/tokens/orion.tokens.css` (kept the four
  `--safe-*` insets). Added `--orion-brass: #ccaa66` in `:root` because the mapping table
  references it but the tokens file on this branch had not caught up yet.
- Replaced **132** hex literals outside `:root` with `var(--orion-*)` where the value
  exactly matched the 16-token palette mapping (13 distinct palette values present in the
  file). Left **4** near-duplicate hex values untouched for Phase 2: `#ff4444`, `#cc4455`,
  `#e6e6e6`, `#666`. Did not touch `rgba()` calls or any `.ts` files.
- Verified: `npx tsc --noEmit` clean, `npx tsx scripts/sim-test.ts` ALL CHECKS PASSED.
  Zero gameplay/determinism impact (CSS-only).
- Commit: `a20cec2`. Follow-ups: Phases 1–5 in `brand/CONFORMANCE.md`.

## 2026-08-24: brand conformance audit + implementation spec (branch `sam/brand-kit`)

- Added `brand/CONFORMANCE.md`: the spec for bringing this codebase in line with
  the brand kit. Every finding was grepped and verified here, with file and line
  numbers, ordered into phases with acceptance checks. Written to be handed
  straight to Cursor.
- **The headline finding: there is no colour token layer.** `:root` in
  `src/style.css` holds four safe-area insets and nothing else, while the file
  carries 148 hex literals (28 distinct) and 77 `rgba()` calls, 46 of which are
  gold or bronze at some alpha. That is Phase 0 of the spec.
- **Three confirmed WCAG AA failures on live text**, each read in full rule
  context, none of them an opacity artefact: `.daily-day` `#5a4828` at 2.25:1
  (`style.css:390`), `.calendar-day.missed` `#6a5a45` at 2.97:1 (`:674` and
  `:776`), `.menu-mode-btn.training .daily-sub` `#6a6048` at 3.17:1 on 10px
  text (`:876`).
- **New player-facing em dash found**: `src/ui.ts:711` "Last patrol today — make
  it count." The 2026-08-17 sweep missed it. Adds to the known manifest one.
- **Two findings went the other way: the code was right and the kit was wrong.**
  Both are now in the kit rather than being "fixed" out of the code.
  - `#ccaa66` is used 10 times as secondary text and measures 8.93:1, better
    than Bronze at 5.93:1. Added to the palette as **Brass**.
  - `.menu-mode-btn` already runs a mode-identity colour system: Daily gold,
    Iron Rain `#aecbee`, Training bronze. Documented as **Mode identity**, three
    modes and three colours.
- Explicitly ruled compliant, so nobody churns them later: the two `#ffffff` in
  `render.ts` (`:1724`, `:1792`) are the hot core of a flash, not UI; and
  `.heading` `color: #c41e3a` (`style.css:138`) is 40px+ bold, where Rising Red's
  3.37:1 passes AA for large text. Roughly 40 further off-palette values in
  `render.ts` / `main.ts` / `mines.ts` are VFX gradient stops and are out of
  scope by design.
- Nothing in `src/`, `server/` or `public/` changed in this commit. The spec is
  the deliverable; the work it describes is not done.

## 2026-08-24: brand kit added + product docs repositioned (branch `sam/brand-kit`)

- Added `brand/`, the ORION brand kit v1.0. Derived from this repo, not
  invented beside it: colour from `src/config.ts` `PALETTE`, type from the
  shipped `src/style.css`, voice from player-facing strings already live.
  Contents: `BRAND.md` (the book), `VOICE.md` (three named voices),
  `COPY-BANK.md`, `tokens/` (CSS + JSON), `assets/` (logo lockups, app icons,
  OG, social header, 1080 share-card template, medals, palette sheet, SVG and
  PNG), `brand-book.html`, and `scripts/` (the generators).
- New drawn work: the wordmark is now vector outlines (chamfered letterforms,
  no font dependency) and the mark is "the Patrol Sight", the shipped
  ring-and-dot favicon evolved with diagonal cuts on the four axes.
- **Positioning corrected, Lucas 2026-08-24: Orion is a daily dodging game.**
  The "mobile-first inertia arcade" framing describes the previous game.
  Inertia is close to a hidden feature now, and is not the pitch. Rewritten in
  `PRODUCT.md` (Positioning, Product Purpose) and at the top of `AGENTS.md`.
- `AGENTS.md` also now states plainly that this repo is the ONLY live Orion.
  The Unity build at `~/Documents/personal/_archive/unity/Orion/` is an
  archive, not a sibling version, and nothing outside this repo is a source of
  truth about how the game works. Its old `../design/`, `../_archive/` sibling
  paths predated the 2026-08-23 move to `~/Documents/games/orion-web` and were
  wrong; removed.
- `PRODUCT.md` Brand Commitments fixed: font is Rajdhani (it said Georgia; the
  shipped `style.css` has always set Rajdhani), and the palette is now LOCKED
  and points at `brand/tokens/orion.tokens.css`.
- Measured, not asserted: `brand/scripts/contrast-audit.cjs` runs the WCAG
  numbers behind `BRAND.md`. Two results that constrain code: **Rising Red
  `#c41e3a` is 3.37:1 on Void and fails AA for body text**, so red text must
  use Alarm `#ff4455` (5.83:1); and **Dust `#8a7a55` clears AA on Void (4.69)
  but fails on Deep Space (4.42)**, so muted text on raised surfaces uses
  Bronze `#aa8844`.
- Generators are `.cjs` on purpose: this repo is `"type": "module"`, which
  would otherwise make Node read them as ES modules and fail. They resolve
  `../assets` relative to themselves. Verified by re-running all three from
  the new location and diffing: every asset reproduced byte-identically.
- Docs-and-assets only. No `src/`, `server/`, `public/` or build change, so no
  type-check or sim-test was warranted and nothing here can affect gameplay.
  Not pushed to `main`: `main` auto-deploys to production.
- **Still open**, listed in `brand/BRAND.md` §11: the em dash in
  `public/manifest.webmanifest`'s name field and in the live `public/og.png`
  (both player-facing; the replacement OG is drawn at
  `brand/assets/social/png/orion-og-1200x630.png`), and the inline data-URI
  favicon in `index.html` using a different ring weight than the kit favicon.

## 2026-08-18: append-only Daily Mutators MERGED + DEPLOYED (main `2b8554e`)

- Lucas: "ok all push live". Merged `sam/mutator-hardening` into `main` as
  `--no-ff` `2b8554e` (rebased onto combined-rank main via merge `057fd73`).
  Render deploy `dep-da2dpf49v7es73c5re3g` live. Bundle
  `index-uHyZDvG3.js` -> `index-BJWU_z2Q.js`. Live JS contains
  `availableFrom`. Player-facing days unchanged; mutator #23 can now ship
  with a future `availableFrom` without reshuffling Aug 10, 2026 onward.
- Verified locally after the main merge: `tsc --noEmit` clean, full
  `npm test` (11 suites including `test:mutators`) all pass. Did not open
  the live game in Cursor (audio blast earlier today).

## 2026-08-18: combined daily ranks MERGED + DEPLOYED (main `74a8d4b`)

- Lucas: "push live". Merged `sam/daily-rank-and-nickname-fix` (`26cd52b`)
  into `main` as `--no-ff` `74a8d4b`. Render verified: bundle
  `index-DetuWskv.js` -> `index-uHyZDvG3.js` (matches worktree prod hash).
- Live combined board #1 is Lucaccino (touch, 1,014,630). Old desktop-only
  #1 (627,124) and the "deeze nuts" row now display as Callsign redacted.
  Live JS serves `/api/leaderboard/daily?mode=all` for the merged board.

## 2026-08-18: daily leaderboard combined-rank fix, buttsniff/deeznuts filter tightening (branch `sam/daily-rank-and-nickname-fix`, merged 2026-08-18 as `74a8d4b`)

- **Trigger.** Lucas screenshotted the Daily lobby ~11:22 AM PT: TODAY'S
  BOARD #1 was Lucaccino (phone, 1,014,630) but the "today's leader" hint
  line above LAUNCH said "Butt sniffer, 627,124". Same class of mismatch
  reported on the game-over screen. Dispatched by Sam with the root cause
  already traced.
- **Root cause.** Two call sites read the wrong board for a Daily Patrol
  run: `fillDailyHint()` in `src/main.ts` called `api.dailyLeaderboard(mode)`
  (the per-device board) while TODAY'S BOARD reads
  `api.dailyLeaderboardCombined()` (every device merged). Separately,
  `POST /api/scores`'s `dailyRank` used `store.rankOf(..., { mode, dailyDate
  })` (per-device daily) and `nextAbove`/`nextWingmate` used the world
  ALL-TIME board for the run's device, not today's combined daily board, so
  `deriveGameOverRank` could show the wrong Daily Patrol rank and chase the
  wrong name on the game-over screen.
- **Fix.** `src/main.ts`'s `fillDailyHint()` now calls
  `dailyLeaderboardCombined()`, same source as TODAY'S BOARD, same
  server-side `sanitizeCallsignForDisplay` masking already applied there.
  `server/db.mjs` gets `nextAboveCombinedDaily()` /
  `nextWingmateAboveCombinedDaily()`, combined-board equivalents of the
  existing `nextAbove()`/`nextWingmateAbove()`. `server/index.mjs`'s
  `POST /api/scores` now branches on `dailyDate`: daily runs get
  `dailyRankCombined()` for `dailyRank` and the new combined functions for
  `nextAbove`/`nextWingmate`; Classic/Iron Rain (dailyDate is always null
  for both) keep the untouched world all-time board, per-device, exactly as
  before. Iron Rain specifically was never touched since Daily Patrol is
  server-enforced Classic-only, so `dailyDate` never applies to an Iron Rain
  run, no ambiguity to resolve there.
- **Regression test**, `scripts/test-daily-combined-rank.mjs`
  (`npm run test:daily-combined-rank`, added to `npm test`): reproduces
  Lucas's exact screenshot shape with an in-memory DB (Lucaccino phone
  1,014,630, Butt sniffer desktop 627,124, same UTC day) and confirms the
  combined board's #1 is the phone score, `dailyRankCombined` places a third
  lower desktop pilot at #3 (not the #2 a per-device rank would say),
  `nextAboveCombinedDaily` finds the nearest target across every device (a
  closer phone score the old per-device query could never see), the
  wingmate variant follows the same scoping, and world all-time
  `nextAbove`/Iron Rain semantics are provably untouched by fresh,
  non-overlapping fixture users.
- **Secondary: nickname filter tightening.** The live lobby also showed
  "Butt sniffer" and "Redact deeze nuts", both evading the Aug 17 filter
  (`88e7632`). Added narrow whole-COMPOUND terms to both
  `server/nickname.mjs` and `src/nickname.ts`: `buttsniff`, `deeznuts`,
  `deezenuts`, `deeznutz`, `deezenutz`. Deliberately did NOT add the short
  components `butt` (collides with buttercup/buttons/butte/Abbott), `nuts`
  (an ordinary word: peanuts/walnuts/doughnuts/nutshell), or `redact`
  (Redactor is a real, legitimate word, the exact overreach this filter's
  design exists to avoid). Added tripwire tests for all of those to
  `scripts/test-nickname.ts` (now 90 names x 2 implementations, still all
  green) plus the exact leaderboard strings and obfuscation variants as new
  BLOCKED fixtures. No prod DB write: masking is
  `sanitizeCallsignForDisplay`, already wired into every public read path,
  so both existing rows mask immediately once this ships, same mechanism
  the 2026-08-17 pass established.
- **Verified.** `npm run build` clean, full `npm test` (10 suites, including
  the two new/extended ones) green, `npx tsx scripts/sim-test.ts` all green
  (untouched gameplay code). Manual end-to-end check: ran the real community
  server against a throwaway temp SQLite DB (`ORION_DB=/tmp/orion-verify.db`,
  deleted after), created three guest accounts via the real HTTP API,
  renamed one directly in the DB to "Butt sniffer" (simulating the real
  legacy row, since the filter now blocks it from ever being created),
  submitted daily scores reproducing the exact screenshot numbers, and
  confirmed live over HTTP: `GET /api/leaderboard/daily?mode=desktop` vs
  `?mode=all` reproduced the bug pre-fix (different #1s), then post-fix both
  endpoints mask "Butt sniffer" as "Callsign redacted" while the DB row
  itself stayed byte-for-byte untouched, and `POST /api/scores` for the
  lower-scoring desktop pilot returned `dailyRank: 3` and `nextAbove` naming
  the correct nearer combined-board target with the masked callsign. No
  production DB touched, no push, no merge.
- **Isolated worktree**, `.worktrees/daily-rank-fix`, off `main` at `d3d0114`
  (did not touch the pre-existing `mutator-hardening` /
  `gameover-calendar-recording` / `callsign-safety-fixes` /
  `patrol-calendar-menu-back` checkouts).
- **Caveats / remaining work for Lucas or a follow-up pass:**
  - Not merged or pushed, per the dispatch guardrails, this stays on the
    branch until Lucas says go.
  - The Aug 17 filter pass already noted pre-existing em dashes elsewhere in
    player-facing strings (409 "taken" message, a `main.ts` welcome-back
    line, the vortex power description); still unfixed, still out of scope
    for this pass.
  - Only the two evidenced taunts got new terms. Did not proactively guess
    at other scatological/sexual compounds nobody has actually typed yet,
    per the tripwire instruction to avoid guessing.
  - The real production row (userId TBD on Render, not queried, no prod DB
    access this pass) still needs Lucas's go-ahead to deploy before its
    public display actually changes; this pass only proves the mechanism
    works against a local reproduction.

## 2026-08-18: Daily Mutators hardened append-only, characterization lock added (branch `sam/mutator-hardening`, unmerged, not deployed)

- **Trigger.** Dispatched by Sam to professionalize `src/mutators.ts` before
  a future 23rd mutator ships: today `poolIndex` is
  `hashString(key) % MUTATOR_POOL.length`, so appending a new entry would
  reshuffle every past Daily Patrol day's pick. Worked in an isolated
  worktree (`.worktrees/mutator-hardening`, branch `sam/mutator-hardening`,
  off `main` at `3635a36`) since three other agents already had worktrees on
  this repo. No merge, no push to `main`, no deploy.

- **1. Characterization lock, written first, before touching selection
  math.** New `scripts/test-mutators.ts` (wired into `npm test` as
  `test:mutators`), 13 checks:
  - A frozen snapshot (`scripts/mutator-snapshot.json`, generated once
    straight off the unmodified `getMutatorsForDate`) of every UTC date
    2026-08-10 through 2026-12-31: 144 dates, ids joined
    (`blackout`, `blackout+the-pit` on Sundays, etc.). The selection rewrite
    below must match this byte-for-byte; the test fails loudly with the
    first 5 mismatches if it doesn't, and the instruction is to revert the
    selection change, not "fix" the fixture.
  - A Classic (non-daily) fingerprint: 3 seeded minutes, same recorder shape
    as `sim-test.ts` section 7 (duplicated in miniature, not imported, to
    avoid coupling the two suites over one small helper), hashed into a
    single int. Proves a mutator-selection PR can't leak into the arcade
    path (Classic never calls `setActiveMutators`, so this is a static
    guard for future PRs more than a live risk today).
  - Getter algebra: a real compatible Sunday pair (BLACKOUT + THE PIT,
    tags verified disjoint first) for a sanity pass-through check, plus a
    synthetic pair of test-only `Mutator` objects (never added to
    `MUTATOR_POOL`) to prove multiplicative scales multiply (2 * 3 = 6),
    additive knobs sum (1.5 + 2.5 = 4), `firstOf` replacements take the
    first mutator's value, and `clearActiveMutators()` resets everything to
    identity. No real pair in the live pool shares a combinable knob without
    also sharing a tag (that's what tags are for), so a synthetic pair was
    the only way to exercise genuine two-nonzero arithmetic.
  - Sunday tags: every UTC Sunday in the snapshot range re-checked against
    the real pool: no two same-day picks ever share a tag.
  - Append-only proof: a fake 23rd mutator (`availableFrom: "2026-09-01"`),
    injected only through a new `getMutatorsForDateFromPool(date, pool)`
    export, never added to the live pool. Every date before 2026-09-01 still
    matches the frozen snapshot exactly; the fake is confirmed reachable
    within a 200-day window after (23 eligible entries means ~1/23 odds per
    day-slot, so a short window can miss it by luck even when selection
    works; 200 days makes a false negative astronomically unlikely, and
    since the hash is a pure function of the date string this isn't a
    flakiness source, it's deterministic pass/fail on this fixed input).
  - Kind classification: every live pool id classified `override` (14) /
    `creature` (5: MENAGERIE + the four forced-assembly days) /
    `environmental` (3: STARFALL, SOLAR WIND, MAGNETIC FIELD, the latter two
    picked over "override" because they're persistent ambient world forces
    rather than spawn/formation/power retunes, documented in the test file
    since the brief allowed either call). Test fails if a pool id is
    unclassified or a classification is stale.
  - No id-branch leak: greps every `src/**/*.ts` file except `mutators.ts`
    for a live pool id as a quoted string literal. Clean today, zero leaks
    found.

- **2. Append-only selection.** Added `availableFrom: string` (UTC
  `YYYY-MM-DD`) to the `Mutator` interface; all 22 live entries set it to
  `MUTATORS_START_DATE` (moved that constant above `MUTATOR_POOL` so the
  entries could reference it; nothing else about it changed). New
  `eligiblePool(pool, dateStr)` filters by `availableFrom <= dateStr`,
  preserving pool order; `pickFirst`/`pickSecond` now index into that
  eligible subset with `% eligible.length`, never `% MUTATOR_POOL.length`.
  `getMutatorsForDate` is now a thin wrapper over a new
  `getMutatorsForDateFromPool(date, pool)`, which is what makes the
  append-only test possible without exporting the live pool as mutable.
  Yesterday's anti-repeat heuristic keeps its documented "cheap, can rarely
  miss" character, just computed against yesterday's own eligible pool
  (guarded against a zero-length yesterday pool with a `-1` sentinel index,
  the one edge case: the very day the feature itself launched, since
  yesterday was pre-launch. Verified by hand with the real hash that this
  doesn't change 2026-08-10's actual pick, so the snapshot's launch day is
  unaffected either way). No 23rd mutator added to the live pool; no
  existing entry reordered, renamed, or retuned, confirmed by the diff being
  additive-only plus the two selection functions.

- **3. AGENTS.md.** Added "Adding a Daily Mutator": Tier A (override-only,
  future `availableFrom`) vs Tier B (new runtime system, dedicated module,
  seeded-draw discipline, kind classification), the frozen-history rules
  (never reorder the pool, never edit a shipped `availableFrom`, never
  `% MUTATOR_POOL.length` again), minimum tests, and the seeded-draw
  tripwire.

- **4. Did not touch.** `scripts/sim-test.ts` (left at 1907 lines, no split,
  per the brief), `enemies.ts`/`render.ts`/`main.ts`/`ui.ts` (no split),
  `SCORING`, `server/validate.mjs`. No 23rd mutator, no retuned mutator.

- **Verification.** `npx tsc --noEmit` clean. `npm test` (10 suites
  including the new `test:mutators`) all green. `npx tsx
  scripts/sim-test.ts`: one pre-existing flake, "lances/wheels/bombs burst
  back into drones", confirmed unrelated to this work (reproduced the same
  intermittent pass/fail on unmodified `main` across 3 runs, ~1/3 fail
  rate; almost certainly the documented `Math.random`-only crowd-trigger
  path, not a regression here). Every other sim-test check passed on every
  run, including all 22-pool-mutator boot/survive checks and every
  determinism check.

- **Snapshot confirmation.** All 144 dates 2026-08-10 through 2026-12-31
  resolve identically before and after the selection rewrite (0 mismatches,
  checked directly, not just via the test file).

- **Doubts / flags for Sam.**
  - The brief said "main is idle at `a39968a`"; by the time this worktree
    was created, `main` had already advanced to `3635a36` (merge of the
    gameover-calendar-recording branch) and further to `d3d0114`
    (a journal-only commit), and local `main` reported "up to date with
    origin/main", meaning that merge was already pushed and presumably
    already auto-deployed by Render before this session started. Not
    something this session did; flagging since it's a deviation from the
    stated starting state and (if unintended) worth Sam confirming with
    Lucas whether that deploy was expected.
  - The "lances/wheels/bombs burst back into drones" sim-test flake
    (~1/3 fail rate on both `main` and this branch) is pre-existing and out
    of this PR's scope (no engine changes allowed), but worth a ticket: a
    real Daily Patrol mutator day that happens to trigger lance/wheel/bomb
    evolutions could theoretically hit the same nondeterminism, though
    Daily Patrol's own determinism checks all passed clean.
  - Follow-up not done here (out of scope per the brief): no 23rd mutator
    was added. This PR only proves the mechanism works; an actual Tier
    A/Tier B mutator still needs its own design pass.

- **Commit.** `3e6c966` on `sam/mutator-hardening`, pushed to origin with
  `-u`. Not merged into `main`.

## 2026-08-18: calendar + lean game-over + findable recording MERGED + DEPLOYED (main `3635a36`)

- Lucas: "live". Merged `sam/gameover-calendar-recording` (`18cd3be`) into
  `main` as `--no-ff` `3635a36` and pushed. Render auto-deploy verified:
  bundle `index-jHlTHP4B.js` -> `index-DetuWskv.js` (matches the worktree
  production build). Live JS contains "See previous patrols", "Record next
  run", `result-hero`, Details, and `video/mp4`.
- Remaining caveat: iOS Safari recording is codec-tested, not
  physical-device-tested.

## 2026-08-18: patrol calendar finished, game-over redesigned around THIS RUN, recording made findable + Safari/iOS-capable (branch `sam/gameover-calendar-recording`, merged 2026-08-18 as `3635a36`)

- **Trigger.** Lucas playtested surviveorion.com live (`08a1a72` / journal
  `a39968a`) Aug 18 ~9:25 AM PT and reported three things: recording isn't
  findable, the game-over screen is still overcrowded with all-time info
  and not visual, and he's never seen the calendar. New branch off current
  `main`, worked in an isolated worktree (`.worktrees/gameover-calendar-recording`)
  since the primary checkout was busy. No push, no merge, no deploy, no
  production DB writes.

- **1. Patrol history calendar, finished.** `sam/patrol-calendar-menu-back`
  (`529f229`) turned out to be based on `40080a9`, an ancestor from BEFORE
  callsign safety, recording, and the highlights/em-dash sweep landed on
  `main`: a wholesale merge would have clobbered all of that. Hand-ported
  instead: `src/dailyHistory.ts` (day-status pure logic), `server/dateUtils.mjs`
  (UTC date validation), and both test suites
  (`scripts/test-daily-history.ts`, `scripts/test-server-daily-history.mjs`)
  copied over unchanged, since they predate and don't touch anything that
  moved. Wired fresh on top of current `main`: `server/db.mjs`
  (`dailyHistoryForUser`, one query with a window function, not one query
  per day), `server/index.mjs` (`GET /api/me/daily-history`, `joinedAt` on
  `/api/me`), `src/api.ts` (`dailyHistory()`, `joinedAt`), `src/save.ts`
  (`DailyDayLog`, `loadDailyHistory`, `archiveDailyDay` on UTC rollover),
  `src/share.ts` (exported `DAILY_EPOCH_DATE`), and the calendar UI + all of
  `main.ts`'s orchestration (`openPatrolCalendar`, month math, the
  session-lifetime server-row cache, a fetch-token guard against a slow
  month fetch clobbering a screen the player already navigated away from).
  A "See previous patrols" link sits directly under the `PATROL #N` line in
  the Daily Patrol lobby, above the mutator briefing card, so it's the
  first thing under the headline, not a buried settings entry. FOMO rule
  preserved: `dayInfoFor` refuses to hand back a future day's mutator at
  the source, so no caller can leak it. Ported the source branch's
  consistent Escape-key-backs-out-one-level pattern to every submenu
  (Settings, Powers, Feedback, the new Calendar, and `CommunityUi`'s
  screens) via a small `makeSubmenu` helper, since the calendar needed it
  and the other submenus were inconsistent about it already.
  **Caught in review, not by the ported code:** the calendar CSS classes
  referenced by `ui.ts` (`.calendar-grid`, `.calendar-day`, etc.) didn't
  actually exist anywhere in `style.css`. The grid rendered as a column of
  full-width, 240px-min default `<button>`s (the base `button` rule's
  `min-width: 240px` with nothing overriding it), which looked
  coincidentally OK on a wide desktop viewport by luck of inline-block
  wrapping, and badly broken at 375px (grid crushed into a ~200px column).
  Wrote the missing CSS from scratch (7-column grid, explicit
  `min-width: 0` override on the day buttons: this IS the "review-fix for
  calendar-day button overflow" the brief asked to preserve, just written
  fresh rather than ported, since there was nothing to port). Browser
  verified, rendered at both desktop and 375px mobile width post-fix: full-
  width 7-column grid, no overflow, day-detail panel fits, Escape and the
  corner arrow both back out to the lobby, month nav correctly caps at the
  current month and at the epoch/join-date floor.

- **2. Game-over screen, redesigned around THIS RUN.** The shipped
  `88e7632` pass only fixed World rank `#null` and added the mini board;
  `showGameOver` still dumped Survived + Score + Peak multiplier + Kills +
  Best (all-time) + a score-breakdown sentence + a longest-flight delta + a
  rank summary + a country rank + a gap sentence + the mini board, all at
  equal visual weight. Rewrote `showGameOver` + `setGameOverRank`: one hero
  score (biggest element on the screen, gold gradient, `clamp(52px, 15vw,
  88px)`), survived time riding along as a small subtitle, the closest-call
  highlight and medal if earned, the gap-to-goal sentence + 2-row mini
  board (unchanged, it already read as a fast visual comparison), the
  primary actions (Fly again / Main menu / Save clip), then everything else
  (all-time best, peak multiplier, kill count, the score breakdown, the
  PB-time comparison, and, new, country rank) collapsed behind a single
  "Details ▾" toggle, closed by default. Material product call made
  without asking (per the brief's default): all-time Best stays, tucked
  into Details, rather than being dropped outright. It's real information
  a returning pilot might want, it just doesn't get to compete with the
  score anymore. Looked at `sam/pilot-safety-and-highlights` (`fa9d25e`)
  for the hero/collapsed-details hierarchy only; did not touch its
  callsign filter or restore its moderation/masking/crash-filter, both of
  which `main` already ships its own (different, deliberately kept)
  versions of. Red Rising gold/red language kept throughout. No em dashes
  added (`npm run test:no-em-dash` covers every string here).
  Browser verified end to end at desktop and 375px mobile width by forcing
  a real Daily Patrol run to game-over via the dev-only `window.__orion`
  debug hook (`world.phase = 'dead'`, after confirming `state === "playing"`;
  the ~2.1s launch-warp cinematic has to finish first, which tripped up two
  earlier verification passes): hero score is the dominant element at both
  widths, Details is collapsed by default and expands to kills/multiplier/
  personal best/breakdown/flight-comparison, nothing overflows at 375px.

- **3. Recording: findable, and MP4-capable for Safari/iOS.**
  `PREFERRED_MIME_TYPES` was WebM-only (vp9/vp8/webm); Safari (14.5+, most
  iPhones) has MediaRecorder + `canvas.captureStream()` but has never
  supported WebM, so `pickMimeType()` returned `undefined` there and
  `MediaRecorder` started with no explicit codec, at the mercy of that
  browser's undocumented default. Added `video/mp4;codecs=avc1` and plain
  `video/mp4` as fallback candidates (WebM still tried first everywhere it
  works), and made `recordingSupported()` actually check codec support
  (`pickMimeType() !== undefined`) instead of just API presence, so a
  browser with the APIs but zero usable codecs no longer shows a toggle
  that would silently produce no clip. Added `recordingUnavailableReason()`
  (one plain sentence, names Safari/iPhone since that's the common real
  case) and wired it into Settings as a disabled "Record runs: unavailable"
  row instead of hiding the control outright: a player who goes looking
  and finds nothing can't tell a missing feature from a bug. Added a
  constructor retry (bitrate hint dropped) for MediaRecorder implementations
  that reject a codec+bitrate combination outright. Findability fix: a
  "🎥 Record next run" one-tap control now shows on the game-over screen
  itself (inside the new layout, where `Save clip` would otherwise sit)
  whenever this run had no clip but the browser can record. That's the
  actual "not findable" fix, since it puts the switch where a player is
  already looking right after a run instead of only in Settings. Recording
  stays local-only, opt-in (`recordRuns` still defaults `false`), no
  uploads, 360s / ~36MB worst-case cap unchanged. New tests in
  `scripts/test-recorder.ts`: mocked `MediaRecorder.isTypeSupported` to
  verify the WebM-before-MP4 preference order and each fallback rung
  (desktop-like, Safari-like, generic-mp4-only, nothing-supported), plus a
  check that `recordingUnavailableReason()` is a short, em-dash-free,
  Safari-mentioning sentence. iOS Safari's real MediaRecorder behavior
  could not be verified live in this session (no physical device / real
  Safari available); the MP4 fallback is exercised only by the mocked unit
  tests above, not a live Safari run. Flagging per the brief's tripwire:
  this is the one slice that's unverified beyond code + mocked tests.

- **Tests.** All ported/new suites wired into `npm test`:
  `test:daily-history`, `test:server-daily-history` added alongside the
  existing seven. Full run (`npm run build`, `npm test`, `npx tsx
  scripts/sim-test.ts`) passes clean: `tsc --noEmit`, Vite production
  build, all 9 test suites, and the full sim-test playtest suite
  (formations, mutators, evolutions, tutorial, evasive-bot fairness,
  determinism checks).

- **Caveats.**
  - iOS Safari MP4 recording is unit-tested (mocked codec support) but not
    live-device-verified, see above.
  - The patrol calendar's server-backed history was only exercised against
    a local dev SQLite DB with no real historical daily runs in it, so the
    signed-in "completed" / "completed-local-only" / conflict states were
    verified by `test-daily-history.ts` and `test-server-daily-history.mjs`
    (both synthetic), not by browsing an account with real multi-week
    history.
  - Game-over browser verification used the dev-only `window.__orion` debug
    hook to force death rather than an actual drone collision; the DOM
    didn't repaint until the tab received an interaction after `state`
    flipped to `"gameover"` mid-session (likely a rAF-throttling artifact
    of driving state via a raw console eval outside user interaction, not
    a real gameplay issue: a real death always happens while the player
    is actively engaged with the page).
  - All-time Best was tucked into Details rather than dropped, per the
    brief's stated default; flagging in case Lucas wants it gone entirely.

## 2026-08-17: reconciled pilot extras MERGED + DEPLOYED (main `08a1a72`)

- Lucas approved the production deploy. Merged
  `sam/highlights-recording-reconciled` (`581d3d9`) into `main` with
  merge commit `08a1a72` and pushed, triggering Render auto-deploy.
- Production bundle changed from `index-o2JuUmy7.js` to
  `index-jHlTHP4B.js`, exactly matching the reviewed local build.
- Live bundle contains the `Record runs`, `Save clip`, and
  `Razor-thin dodge` feature strings. Daily and world leaderboard checks
  still mask userId 54 and the second blocked account as
  `Callsign redacted`, with zero unmasked blocked names.
- The branch had already passed build, all seven test suites, full
  simulation tests, and desktop Chromium smoke testing before merge.
- Remaining caveat: recording is feature-gated and safely degrades, but its
  360-second, approximately 36 MB ceiling has not been measured on a
  physical iPhone or low-end Android device.

## 2026-08-17: closest-call highlight + opt-in local recording reconciled from `sam/pilot-safety-and-highlights` onto a clean branch off main (`08a1a72`, deployed)

- **Trigger.** Sam dispatch to reconcile the two unmerged branches called out
  in the entry below: `sam/pilot-safety-and-highlights` (`fa9d25e`) has an
  overlapping callsign filter and game-over redesign (redundant, since
  main already shipped its own version of both in `88e7632`) plus two
  features main never got: the closest-call highlight and opt-in local
  recording. Rather than merge or rebase that branch (which would drag the
  redundant/alternate implementations along), a new branch,
  `sam/highlights-recording-reconciled`, was cut fresh off main (`2f6f1e2`)
  and only the two worthwhile pieces were hand-ported. Unmerged, unpushed,
  no production deploy, no DB access.
- **Ported: closest-call highlight** (`src/highlights.ts`, copied unchanged
  from the branch: `grazeClearance`, `trackClosestCall`, `closestCallTier`,
  `closestCallLabel`, all pure functions). Wired into `src/gameState.ts`'s
  `handleGrazes` (tracks the tightest graze via `world.closestCall`, a new
  field on `World` in `src/types.ts`) and surfaced on the existing
  simplified game-over screen as a single gold-bordered line
  (`⚡ Razor-thin dodge at 1:24`, `.result-highlight` in `src/style.css`)
  right under the "New best score" line, ahead of the divider. It reads
  world state only, never touches `Math.random` or the seeded schedule
  streams, so Daily Patrol determinism is untouched (confirmed by
  `sim-test.ts`'s determinism checks passing unchanged). Unit tests ported
  verbatim as `scripts/test-highlights.ts` (`npm run test:highlights`).
- **Ported: opt-in local recording** (`src/recorder.ts`, copied unchanged
  from the branch: `canvas.captureStream()` + `MediaRecorder`, initially at
  the branch's own 600s / ~1.2Mbps cap, degrades to "no clip" via
  `recordingSupported()` on any unsupported browser or runtime failure,
  never uploads or persists anything, only ever offers a same-device
  download). Wired into `src/save.ts` (`recordRuns` boolean setting, OFF by
  default), `src/ui.ts` (a "Record runs" toggle in Settings, hidden
  entirely when `recordingSupported()` is false; a "Save clip" button on
  game over when a clip is ready, with a capped-at-cutoff hint if the
  safety timer cut it short), and `src/main.ts` (starts fresh every run in
  `startRun` when the setting is on and it's not Training Ground, discarded
  on a mid-run quit in `quitToMenu`, finalized in `onGameOver` so the
  MediaRecorder flush overlaps the death cinematic instead of adding a
  delay, downloaded via the new `onSaveClip` UI callback). Unit tests
  ported verbatim as `scripts/test-recorder.ts` (`npm run test:recorder`,
  covers the safety-cap sanity math and that feature detection never throws
  outside a browser). **The 600s/1.2Mbps cap was reassessed and lowered the
  same day, see "Follow-up review fixes" below: this section describes what
  was first ported, not what shipped.**
- **Left behind, deliberately.** The branch's own callsign content filter
  and display-sanitization pass (`8f39f9b`/`e3dbe69`/`fa9d25e`) is fully
  redundant: main already shipped a different implementation of the same
  thing in `88e7632`, and per the prior entry the two designs disagree on
  normalization (main's avoids the branch's character-collapsing
  false-positive risk on words like "Nigeria"/"falcon"). The branch's
  large game-over redesign (hero score treatment, a demoted "details"
  panel, and a compact "today's board" mini-leaderboard slot fed by
  `fillGameOverBoard`/`setGameOverBoard`) was also left out entirely per
  the task brief: main's simplified game-over board (from `88e7632`) is a
  deliberate simplification and the two new features fit into it as two
  small additions (a highlight line, a save-clip button) with zero
  restructuring needed, so there was no "small required portion" of the
  redesign to carry over.
- **Escalation: found, then fixed on Lucas's explicit authorization
  (follow-up, same day).** While diffing the branch's
  `fillDailyBoard`/`fillGameOverBoard` sanitization fix against main, found
  that main's `fillDailyBoard` (`src/main.ts`) still built its client-side
  "pinned me" row from the account's raw `api.user.callsign`
  (`callsign: myCallsign`, unsanitized) on the daily lobby's inline board.
  Initially flagged rather than silently patched (a content-moderation-
  adjacent call outside the original task's scope), per the "stop and
  return the question" guardrail. Lucas authorized the fix as part of the
  already-approved callsign safety objective and asked for a broader sweep,
  not just the one spot: **auditing every client-built (not server-
  returned) leaderboard-shaped row across the whole app** turned up three
  instances of the same gap, all fixed the same way:
  1. `src/main.ts` `fillDailyBoard`'s pinned row (the originally flagged
     one).
  2. `src/main.ts` `renderRankResult` → `deriveGameOverRank`'s `me` row
     (`src/ui.ts`): the game-over screen's own rank-comparison row, which
     is arguably the most exposed of the three since it's the exact screen
     players screenshot to share a run.
  3. `src/community.ts` `renderBoard`'s pinned row, shared by the World
     Arena, friends/squadron, and custom-arena leaderboard screens.
  Fix: a new `sanitizePinnedRow()` helper in `src/nickname.ts` (wraps
  `sanitizeCallsignForDisplay()`, preserves every other field on the row
  unchanged) applied at call sites 1 and 3; for call site 2, the
  sanitization was pushed inside `deriveGameOverRank` itself (a pure,
  already-unit-tested function) rather than trusted to the caller, so a
  future call site can't reintroduce the leak by forgetting to wrap its
  input. Deliberately left untouched (the documented, intentional
  carve-out, unchanged): the account owner's own private views of their
  own raw callsign (the profile edit field in `community.ts`'s
  `showPilot`, and the main menu's "signed in as" `MenuCommunity.callsign`
  indicator): neither is a shareable, screenshot-prone leaderboard
  surface, and the owner needs to see the real value to know it needs
  changing, same rationale `sanitizeCallsignForDisplay`'s own doc comment
  already gives for that carve-out.
  **Regression coverage** (reproduces the exact leak, not a superficial
  string check): `scripts/test-nickname.ts` gained 3 checks against
  `sanitizePinnedRow` directly (a blocked callsign redacts, a clean one and
  every non-callsign field on the row pass through byte-for-byte via a
  JSON-equality check); `scripts/test-gameover-rank.ts` gained a case
  feeding a real blocked-callsign fixture (`"trump rapes kids"`, the same
  fixture `test-nickname.ts` already uses) into `deriveGameOverRank` and
  asserting `me.callsign` comes out as `"Callsign redacted"`, not the raw
  string, while `me.score` still passes through.
- **Copy sweep: em dashes in player-facing text, fixed.** Lucas's
  no-em-dash rule is absolute for anything a player can see. Swept
  `index.html`, all of `src/`, and the community server's player-facing
  response strings (excluding comments, `JOURNAL.md`, dev scripts, and the
  Bearer-key-gated `/admin` dashboard, none of which a player ever sees).
  Fixed 10 occurrences, replacing each with the punctuation that reads most
  naturally in context (colon, comma, or period, matching this codebase's
  existing voice):
  - `server/index.mjs`: the 409 "that callsign is taken" message and the
    429 daily-attempt-limit message.
  - `src/main.ts`: the guest-reclaim "Welcome back" note appended to the
    game-over rank line.
  - `src/config.ts`: the vortex power's `POWER_HINTS` description.
  - `src/ui.ts`: the main-menu launch button label (now "Launch: Classic"),
    the Iron Rain mode card's sub-line, and the daily free-death "that
    one's free" note on the game-over screen.
  - `index.html`: the SEO/social meta description and both `og:title`/
    `twitter:title` tags (now "ORION: a daily survival patrol").
  - Left untouched (out of scope, not player-facing): comments throughout
    the codebase (which use em dashes constantly as this repo's writing
    style), the `/admin` mission-control dashboard's internal display
    formatting (`server/index.mjs` lines 798-1120, gated by Bearer
    `ORION_ADMIN_KEY`, seen only by Lucas), a SQL schema comment in
    `server/db.mjs`, and all historical `JOURNAL.md` text.
  - **Regression guard added:** `scripts/test-no-em-dash.ts`
    (`npm run test:no-em-dash`, included in `npm test`). Scans `index.html`,
    `src/*.ts`/`src/*.css`, and the community server's route files for an
    em dash outside comments/block-comments/HTML-comments, with an explicit
    skip range for the admin dashboard's embedded HTML and `server/db.mjs`
    excluded entirely (SQL-only, no player-facing strings, its one em dash
    lives in a `--` SQL comment this script doesn't parse). Smoke-tested
    against a deliberately reintroduced em dash to confirm it fails loudly,
    then confirmed it passes clean on the fixed tree.
- **Recorder safety cap reassessed (follow-up, same day).** The ported
  600s / 1.2Mbps cap worked out to an ~86MB worst case (600 x 1,200,000 /
  8 bytes), flagged on review as unsafe for Orion's mobile-skewed install
  base. Reverted the duration to the branch's original, pre-bump 360s
  (6:00) and lowered the bitrate to an explicit 800kbps instead of raising
  duration again, landing the worst case at 360 x 800,000 / 8 =
  36,000,000 bytes, **~36MB**, comfortably inside a 40MB budget with
  headroom, without a rolling-buffer rewrite (considered and rejected for
  the same reason as before: MediaRecorder's WebM header only lives in the
  first chunk, so discarding early chunks to bound memory independent of
  duration produces an unopenable file, not a shorter clip). Known,
  accepted tradeoff: 360s is under Orion's ~7-8 minute skilled-run
  ceiling, so an exceptional long run's clip auto-stops before the actual
  death/ending, same situation the original 2026-08-16 pass moved away
  from, now reintroduced deliberately, this time in the review's own
  words. The auto-stop is not silent: the game-over screen's
  "Clip capped at ⟨time⟩: saved up to the cutoff." hint (`src/ui.ts`) now
  computes its time string from `RECORDING_MAX_SECONDS` via the existing
  `fmtTime` helper instead of a hardcoded "10:00", so the two can't drift
  out of sync again. **Regression coverage:** `scripts/test-recorder.ts`
  now asserts both constants directly (`RECORDING_MAX_SECONDS === 360`,
  `BITRATE_BPS === 800_000`, replacing the old "clears the ~8min ceiling"
  check, which is no longer the design) and computes the worst-case size
  from them, failing loudly if it ever exceeds the 40MB budget again (the
  old check only failed above 200MB, far too loose to catch this class of
  regression).
- **Verification.** `npm run build` clean (`tsc --noEmit` + `vite build`).
  Full `npm test` green: nickname (existing, +3 pinned-row masking checks),
  touch-input (existing), game-over rank (existing, +1 blocked-callsign
  masking check), crash filter (existing), highlights (new), recorder (new,
  updated for the 360s/800kbps cap), no-em-dash (new). Full
  `npx tsx scripts/sim-test.ts`: ALL CHECKS PASSED, including both Daily
  Patrol determinism checks and every mutator/creature-day suite,
  confirming the closest-call tracking (which runs inside the hot
  graze-detection path every tick) has zero effect on the seeded schedule
  streams or scoring. Re-ran build/test/sim-test after the follow-up fixes
  too, all still green.
- **Browser-verified live** in a real Chromium session against the local
  dev server (`npm run dev`, `/?fullgame=1`): gate → intro → menu showed
  "Launch: Classic" (colon, not em dash); Settings showed a working
  "Record runs" toggle; started a Classic run with recording on, forced an
  instant death via the existing dev-only `window.orionWorld` console hook
  (`import.meta.env.DEV` only, never in prod builds); the game-over screen
  showed `⚡ Clean dodge at 0:10` and a working "Save clip" button that
  changed to "Saved!" after a click actually produced and downloaded a
  clip via `captureStream`/`MediaRecorder` in a real browser tab, not a
  mock. No console errors, no visual glitches, no em dashes anywhere in the
  rendered UI.
- **Browser-verified live again (follow-up, same day), after the masking
  and recorder-cap fixes.** Ran the local community server (`npm run
  server`, local dev SQLite, no production DB) alongside the dev server so
  a full signed-in flow was reachable, not just the offline menu. Gate →
  intro → menu → Settings (confirmed "Record runs" toggle still present)
  → launched Classic with recording on → forced death via the same
  dev-only `window.orionWorld` hook → game-over screen → entered a normal
  test callsign ("TestPilot") and saved it as a fresh guest account →
  confirmed the rank comparison row rendered `#1 TestPilot 27` with no
  masking, no "Callsign redacted", no crash (the expected, unaffected
  result for a clean callsign, confirming the `deriveGameOverRank`
  sanitize-wrap didn't break normal display) → clicked "Save clip", button
  changed to "Saved!" confirming the recording pipeline still works at the
  new 800kbps bitrate → navigated to the World leaderboard, confirmed the
  pinned row also rendered `TestPilot` normally with no masking. No
  console errors, no visual glitches. Did **not** attempt to create or
  submit a blocked/offensive callsign in this or any other session, live
  or otherwise, since that would mean deliberately exercising the content
  filter's block path against a real (if local) account purely for a
  screenshot; the masking fix itself is instead covered by the unit tests
  above, which reproduce the exact leak with a known blocked-callsign
  fixture without ever touching a real signup flow. Both local servers
  stopped after verification; the test account lives only in the
  gitignored local `server/orion.db` (not committed, not production).
- **Browser/mobile caveats (recording feature, unverified beyond desktop
  Chromium).** `recordingSupported()` gates on `HTMLCanvasElement.
  prototype.captureStream` and `window.MediaRecorder`, both existing but
  behaving unevenly across browsers: (1) **Safari/iOS**: `captureStream` on
  `<canvas>` has historically had partial/late support and inconsistent
  codec negotiation across Safari versions; the feature will silently
  no-op there if either API is missing or throws, but was not verified on
  an actual iOS device or Safari desktop in this session. (2) **Firefox**:
  generally supports both APIs, not verified here either. (3) **Low-end
  Android/older Chromium**: after the same-day cap reassessment below, the
  worst case is ~36MB (360s cap x 800kbps), down from the originally
  ported ~86MB (600s x 1.2Mbps), specifically because "a modern mobile
  browser tab" was judged too optimistic an assumption for Orion's actual
  install base; still not re-verified against a real low-memory device in
  this session; the ~36MB figure is a calculation, not a measurement. (4) On any
  browser where `MediaRecorder` throws mid-run (a codec/permission quirk),
  the code path resolves to "no clip" rather than surfacing an error, by
  design, so a broken recording is invisible to the player except by the
  Save Clip button simply not appearing. None of this affects gameplay,
  scoring, or determinism either way (recorder.ts never touches game
  state), only whether a player on an unsupported/flaky browser gets a
  clip. Recommend a manual pass on an actual iPhone/Android before this
  ships, since Orion's install base skews mobile.
- **Guardrail/scope checks.** New branch off main (not main itself,
  confirmed `git log --oneline -1` before starting), no push, no merge, no
  deploy, no production data read or touched (this whole session ran
  against local source only). `SCORING`/  `server/validate.mjs` untouched
  (nothing here changes point values or anti-cheat ceilings). No secrets
  touched. The one out-of-scope finding (daily-lobby pinned-row
  sanitization gap, above) was flagged first, then fixed on Lucas's
  explicit authorization in the same-day follow-up, with the fix widened
  to every client-built pinned-row surface found on audit, not just the
  one originally spotted.

## 2026-08-17: callsign safety pass MERGED + DEPLOYED (main `88e7632`)

- Lucas gave the go ("push live"). `sam/callsign-safety-and-fixes` (`d873574`)
  merged into `main` as `--no-ff` merge commit `88e7632` and pushed, which
  auto-deployed the Render `surviveorion` service.
- Re-verified on the branch before merging (not just trusting the build
  session): `npm run build` clean, all four new suites green (nickname 71
  names x 2 implementations, touch-input lifecycle, game-over rank,
  crash filter), and full `scripts/sim-test.ts` ALL CHECKS PASSED, so the
  `src/input.ts` touch change carries no gameplay regression.
- Verified live after the deploy: served bundle flipped
  `index--LdUHUyN.js` -> `index-o2JuUmy7.js` (matches the local production
  build hash exactly); `/api/leaderboard/daily?mode=all` now returns
  `"Callsign redacted"` for the offending row (userId 54) instead of the
  real string; `/api/leaderboard/world` shows 2 masked rows and zero
  remaining unmasked blocked names, so a second offensive callsign that
  nobody had spotted got covered by the same pass.
- The server-side filter module is confirmed loaded and classifying
  correctly in production, since the display masking above is
  `sanitizeCallsignForDisplay` -> `isNicknameBlocked`, the same predicate
  the write paths call. A live write-path probe was deliberately NOT run to
  completion: posting a blocked-but-untaken callsign to
  `POST /api/auth/guest` would create a junk account if the wiring were
  wrong, and there is no admin delete endpoint to clean it up. (The probe
  with the exact existing name returns 409 "taken" first, since the
  uniqueness check precedes the content check.)
- **No production DB write.** userId 54's stored callsign is untouched and
  needs no operational step: masking solves the public exposure. Correcting
  the stored value would still require a manual, Lucas-approved
  `UPDATE users SET callsign = ... WHERE id = 54` against the Render DB.
- Follow-up found while verifying, NOT fixed here: Orion still has
  pre-existing em dashes in a few player-facing strings, which breaks
  Lucas's absolute no-em-dash rule. Confirmed offenders: the server's
  "that callsign is taken" 409 message, `src/main.ts` "Welcome back, ...
  this run counts for your existing pilot.", and the `vortex` power
  description in `src/config.ts`. Today's change introduced none of them
  (verified against the diff); a small copy sweep is worth its own pass.
- Still unreconciled: `sam/pilot-safety-and-highlights` (now `fa9d25e`,
  pushed but unmerged) has an overlapping callsign filter and its own
  game-over redesign plus the closest-call highlight and opt-in local
  recording. Now that main carries this branch's filter and game-over
  changes, that branch needs a rebase and a decision about which pieces
  survive before it can merge. Its callsign/game-over work is redundant;
  the highlight and recording features are not.

## 2026-08-16: callsign moderation + display sanitization, touch-drag lockup fix, game-over rank slot simplified, crash-noise filter (`sam/callsign-safety-and-fixes`, merged 2026-08-17 as `88e7632`)

- **Trigger.** A cohesive live-feedback fix pass, dispatched with four
  ordered tasks: block offensive callsigns (server-authoritative, with
  public-display sanitization for legacy rows), fix a reported touch-drag
  lockup, simplify the end-of-game rank display, and classify a batch of
  Aug 16 Brave/iPhone crash reports. Everything below is on a feature
  branch (built in an isolated `git worktree` at
  `.worktrees/callsign-safety-fixes`, off `40080a9`), unmerged, unpushed, no
  DB migration, no production data touched or queried.
- **Mid-session collision, noted for the record.** Partway through, the main
  checkout showed live, unscheduled edits from a concurrent agent (untracked
  `src/gameState.ts`/`src/types.ts`/`src/highlights.ts`/
  `scripts/test-highlights.ts`), so this work moved into the isolated
  worktree above per `AGENTS.md`'s parallel-dispatch guidance. That other
  session finished and committed as `8f39f9b` on branch
  `sam/pilot-safety-and-highlights` (also unmerged/unpushed): its own
  callsign filter (normalizes by collapsing repeated characters, which
  false-positives on real words like "Nigeria"/"falcon" — the exact issue
  this branch's filter design avoids, see below) plus a game-over redesign,
  a "closest call" highlight, and opt-in local recording — a superset that
  overlaps this branch's Task 1 and Task 3 but is NOT the same
  implementation. **Two unmerged branches now both touch callsign
  moderation and the game-over screen; flagged back to Sam/Lucas rather
  than silently picking a winner or merging them myself** — reconciling
  which (if either, or some combination) ships is a product call, not an
  engineering one.
- **Callsign content filter is server-authoritative** (`server/nickname.mjs`,
  mirrored cosmetically in `src/nickname.ts` for instant client feedback,
  same pattern as `SCORING`/`validate.mjs`). Wired into every route that
  writes a callsign: `POST /api/auth/register`, `POST /api/auth/guest`
  (new-account branch only — see below), `PATCH /api/me`, and
  `uniqueCallsign` (Google/Clerk auto-name, falls back to "Pilot" on a
  blocked provider-supplied name). `CALLSIGN_RE` still only checks
  shape/charset; this checks content and can't be bypassed by a
  hand-crafted request.
  - **Normalization deliberately does NOT collapse repeated characters.**
    An earlier pass did (kills "fuuuuck"-style elongation) but that same
    collapse turns "coon" into "con" and "niger" into a substring of
    "Nigeria" — false-positives on real words/names, an explicit guardrail
    violation ("avoid excessive false positives"). Instead each blocklist
    term compiles to a regex requiring one-or-more of each character
    (`c+o+o+n+`), so `normalizeForFilter` only lowercases, strips
    diacritics, maps common leetspeak (0→o, 1→i, 3→e, @→a…), and strips
    non-alphanumerics — elongation and spacing/punctuation evasion are
    still caught, ordinary words with a blocked term's letters scattered
    inside them are not.
  - **Dropped `cock`/`anal` from the blocklist entirely** (collide too hard
    with `cockpit`/`analyst`/`analog`); added `SAFE_EXCEPTIONS` (exact-match
    only) for `Scunthorpe`, `Grape`, `Therapist`, `Despicable`,
    `Retardant` — words that contain `rape`/`spic`/etc. as substrings but
    are themselves entirely legitimate.
  - On rejection: 400 with one of several short, randomized, lightly
    in-world lines (`pickRejectionMessage()`), no em dashes. Nothing is
    silently renamed; no existing rows touched.
  - **Guest reclaim doesn't run the filter.** Reclaiming an *existing*
    account by its device secret is not a create-or-rename, so a legacy
    callsign that predates the filter (or a future blocklist addition)
    stays reachable by its own device — the alternative (locking a real
    player out of their own account and scores over a name they didn't
    just type) is worse than the display-time fix below, which already
    solves the actual complaint (public exposure).
  - Tests: `scripts/test-nickname.ts` (`npm run test:nickname`) — allowed
    list (incl. deliberate false-positive tripwires: Nigeria, falcon,
    Constantine, cockpit, analyst, Scunthorpe, grape, therapist, despicable,
    retardant…), blocked list (incl. leetspeak/spacing/elongation
    variants, "trump is a pedo"/"trump rapes kids" and obfuscations
    thereof), non-string input, rejection-message shape, and
    `sanitizeCallsignForDisplay` (below) — run against BOTH the server
    `.mjs` and client `.ts` copies so a drift between them fails loudly.
- **Display-time sanitization masks legacy blocked rows without touching the
  DB.** `sanitizeCallsignForDisplay(raw)` returns `"Callsign redacted"` for
  any callsign that would be blocked today, applied at every
  public-facing response boundary that shows another player's name:
  `/api/leaderboard/world`, `/api/leaderboard/daily` (both combined and
  per-mode), `/api/friends` (friends + incoming + outgoing),
  `/api/friends/leaderboard`, `/api/friends/activity`,
  `/api/players/:callsign` (public profile), arena leaderboards, and the
  `nextAbove`/`nextWingmate` gap-to-goal targets on `/api/scores`.
  Deliberately NOT applied to `publicUser()` — the account owner still
  sees their own real callsign on their own session. Verified live: seeded
  a temp SQLite DB with a user callsigned `"trump is a pedo"` + a score,
  confirmed `/api/leaderboard/world` and `/api/players/trump%20is%20a%20pedo`
  both return `"Callsign redacted"` instead of the real string, then
  cleaned up the temp DB/server. **No production data was read, queried, or
  touched at any point.**
  - **Operational step for userId 54 after this deploys: none required.**
    The moment this code ships, `sanitizeCallsignForDisplay` masks that
    row everywhere it's rendered publicly — no rename, no DB write, no
    risk to the account/scores/badges/history. The row's actual stored
    callsign is untouched (out of scope: no destructive changes without
    Lucas) but can no longer be re-submitted through any write path either.
    If Lucas separately wants the DB row's *stored* value corrected (not
    just masked) rather than left as-is: there's no admin endpoint for it
    today (`/api/admin/*` is stats/feedback read-only), so the only path is
    a one-off, Lucas-approved manual `UPDATE users SET callsign = '...'
    WHERE id = 54` run by a human against the Render DB — optional,
    not needed for the public-exposure problem, and not something this
    session did or should do unilaterally.
- **Touch drag lockup fixed** (`src/input.ts`). Root cause: some
  WebKit-based mobile browsers can silently stop delivering events for an
  active touch mid-drag — most concretely, backgrounding (app switch,
  incoming call, Control Center/notification swipe) drops the touch with
  **no** `touchend`/`touchcancel` ever reaching the page — but the stick's
  last-known drag vector kept feeding `sample()` forever, so the ship kept
  flying/drifting in a fixed direction with no way to correct course: the
  reported "drag stopped but the ship didn't" / feels-like-Asteroids
  symptom. Two-part fix, no dependency on which specific browser quirk
  caused the loss:
  1. `window.blur` and `document.visibilitychange` (hidden) now clear the
     tracked touch/keys directly inside `Input`, independent of `main.ts`'s
     separate pause-on-hide handler.
  2. Self-healing reconciliation (`reconcileStick`): on every
     touchstart/touchmove, check the browser's own live `e.touches` list —
     if the touch we think is active isn't actually in it, release it
     before processing the event. Closes the case where the browser keeps
     talking to the page (so blur/visibility never fires) but has already
     silently dropped the specific touch we were tracking, e.g. an OS
     gesture stealing recognition without a formal cancel.
  Regression test `scripts/test-touch-input.ts` (`npm run test:touch-input`)
  drives `Input`'s touch state machine with synthetic events against a
  minimal fake window/document/canvas (no real DOM needed) — verified it
  fails with 6 assertions against the pre-fix code and passes clean after.
  Covers: normal lift, `touchcancel`, silent loss + self-heal via a new
  touch, `blur`, `visibilitychange`, and the inertia-mode variant
  specifically (thrust/heading must zero too, not just direct-mode's
  moveVector).
- **Game-over rank slot simplified** (`src/ui.ts`, `src/main.ts`,
  `src/style.css`). Root cause of "buggy": `World rank <b>#${r.worldRank}</b>`
  had no null guard (unlike the country/daily ranks right next to it in the
  same line), so a run with no rank yet (e.g. a 0-point death — `rankOf`
  returns `null` when there's no best score to rank) rendered a literal
  **"World rank #null"** on the results screen. Root cause of "too much
  information": Daily Patrol rank + World rank + Country rank + a
  "N points to pass X" sentence all crammed into one run-on line.
  - Replaced with ONE primary rank (Daily Patrol on daily runs — the same
    board TODAY'S BOARD shows — else World rank; country rides along as a
    compact secondary tag only when present) plus a 2-row mini comparison
    board reusing TODAY'S BOARD's exact row markup (`.board-row`, `.me`,
    rank/flag/name/points columns, same CSS, no new classes needed beyond
    a couple of spacing tweaks): the pilot you're chasing stacked directly
    above your own highlighted row, so the gap reads as a fast visual
    comparison instead of a parsed sentence.
  - Also relabeled the score breakdown's "Kills"/"Survival" (point totals)
    to "N pts from kills"/"N pts from survival" — they sat right next to
    the stats grid's "Kills" (a *count*), same word meaning two different
    things at a glance.
  - The rank-derivation logic (which single rank to show, whether a
    country rank exists, who's worth chasing) was pulled out of `main.ts`
    into a pure, DOM-free `deriveGameOverRank()` in `ui.ts` specifically so
    the bug above is unit-testable: `scripts/test-gameover-rank.ts`
    (`npm run test:gameover-rank`) covers the null-rank case, single-vs-
    stacked primary rank, country rank present/absent, wingmate-over-
    stranger targeting, and no-target once already ahead (including an
    exact-tie edge case).
  - Scope note: dropped World rank from the line on daily runs (Daily
    Patrol rank leads instead) to keep one primary number — a minor,
    reversible information tradeoff in service of the explicit "minimal
    fields" ask, not a bug.
- **Crash-telemetry noise classified** (`src/crashFilter.ts`). The two
  Aug 16 reports are both well-documented third-party/browser-injection
  artifacts, not Orion bugs: exact `"Script error."` is the browser's
  own redaction placeholder for an uncaught exception from a cross-origin
  script without CORS headers (Orion's bundle is always same-origin, so a
  genuine crash structurally can't surface this way — every crash vendor's
  default ignore list carries this exact string); `window.__firefox__` is
  a namespace Firefox's iOS browser/Focus injects into every page for its
  reader-mode bridge (confirmed zero references to it anywhere in Orion's
  source). `isThirdPartyCrashNoise()` is a narrow exact/substring
  allowlist-of-noise (not a "no stack trace" or "looks vague" heuristic,
  which would risk swallowing a genuine minified-build crash), wired into
  `main.ts`'s existing `window.error`/`unhandledrejection` reporter before
  it spends one of its capped report slots. Tests:
  `scripts/test-crash-filter.ts` (`npm run test:crash-filter`) — both Aug 16
  reports classified as noise, plus tripwires confirming real errors
  (including ones that superficially resemble the noise patterns, e.g.
  "my script error occurred") are never swallowed.
- **Verification.** `npx tsc --noEmit` clean, `npm run build` clean,
  `npx tsx scripts/sim-test.ts` — full pass (formations/powers/pickups/
  mutator choreography/determinism, no regressions from the touch-input or
  rank-slot changes), and all four new/updated test scripts pass
  (`npm run test` runs nickname + touch-input + gameover-rank +
  crash-filter together). Added `npm run sim-test` and `npm run test*`
  script aliases to `package.json` (previously `npx tsx` direct-invoke
  only) since this session leaned on them repeatedly.
- **Follow-ups / open questions for Sam:**
  1. Reconcile this branch with `sam/pilot-safety-and-highlights`
     (`8f39f9b`) — both touch callsign moderation and the game-over
     screen with different implementations; needs a product decision on
     which ships (or how to combine), not an engineering guess.
  2. If Lucas wants userId 54's *stored* callsign corrected (beyond the
     automatic display masking already live), that's a manual, human-run
     DB statement — no admin tool exists for it today.

## 2026-08-12: "no chill" densify merged + deployed, the creature days stop having a calm pocket to screenshot from (main, DEPLOYED)

- **Shipped.** Lucas green-lit the pass ("push live"), so
  `sam/no-chill-midgame` was merged into `main` as merge commit `2aab5d3`
  (`--no-ff`, matching this repo's style for `sam/*` branches) on top of the
  single content commit `b115a93`, and pushed, which auto-deploys the Render
  service `surviveorion`. Bundle `index-LnPMPnt2.js` before the deploy,
  `index--LdUHUyN.js` after; CSS unchanged (`index-Bp4CgbiJ.css`), no styles
  moved. `npm run build` green and a full `npx tsx scripts/sim-test.ts` ALL
  CHECKS PASSED on the merge commit before the push.
- **Second mid-day deploy on the same UTC day, boards again left alone.** This
  is the second ship into the running 2026-08-12 daily (the mid-ramp densify
  went out earlier the same day), so today's board now mixes three scripts:
  pre-densify, mid-ramp, and this one. Lucas's standing call is to ship and not
  clear the boards. `MUTATOR_POOL` order and ids stay frozen, so the
  day-to-mutator mapping is untouched, and no medal or `validate.mjs` change
  rode along.
- **Trigger.** Lucas hard-refreshed onto the mid-ramp build shipped earlier the
  same day (bundle `index-LnPMPnt2.js` confirmed live) and screenshotted
  WHEELHOUSE at **1:43**: near-empty arena, one pickup, ship parked shielded in
  the centre. "I shouldnt be chill taking a screenshot at 1:45". The bar for
  this pass: at ~1:45 a competent pilot must not have a calm pocket to casually
  line up a screenshot from.
- **Why the shipped telemetry missed it (the useful lesson).** Every number the
  mid-ramp pass optimised went the right way (concurrent wheels 2.4 to 4.2 at
  1:30) and the day still felt empty, because **average concurrent creatures
  and mean arrival rate are both blind to how a moment feels**. Two things they
  cannot see:
  - **Dead air.** Each day fired its whole event as a clump (4 wheel lanes 0.5s
    apart) and then went silent. The MEAN arrival gap read a healthy 1.7s while
    the LONGEST gap in the same 30 seconds was 5.6s.
  - **Coverage.** Crossing traffic can be dense on average and still leave one
    roomy corner, and a competent pilot finds it and sits in it. Measured
    directly (see the new pocket metric): at 60-120s the roomiest spot on the
    WHEELHOUSE grid stayed clear of drones for **6.6 seconds**. That is Lucas's
    screenshot, quantified.
- **New sim metric: the pocket search** (`halfPocket` in sim-test section 11).
  A coarse arena grid is sampled at 4Hz and, per sample, a backward pass asks
  "if the pilot parked in the best available spot right now, how long before a
  drone comes within 3 units?" It is pilot-independent (no bot behaviour in the
  loop) and it is the only metric here that could see the bug. Also added
  `halfMaxGap`, the LONGEST arrival gap per 30s bucket, next to the existing
  mean. `ORION_FELT_DUMP=1` prints both.
- **Fix 1, de-clumping (`eventStagger` in creatures.ts). Costs no extra
  drones.** The per-kind stagger constant is now a FLOOR; structures of one
  event spread across `CREATURE_DAYS.staggerSpread` (0.85) of the gap to the
  next event, capped by a new per-kind `*StaggerMax`. So "clump, silence,
  clump" becomes continuous traffic at the same average density. Late-game
  events with tiny intervals still floor out at the old tight volley.
- **Fix 2, the ramp moves earlier and steeper.** `openingMinutes` 0.5 to 0.45,
  `rampMinutes` 2 to 1.4, `rampCurve` 0.65 to 0.5, so full mid pressure lands
  ~1:25 instead of 2:00 (`progress` at m=1: 0.49 shipped, 0.76 now).
  **`lateStartMinutes` stays 3**, as instructed.
- **Fix 3, coverage geometry.** WHEELHOUSE bursts of 3+ lanes now cross BOTH
  axes (lanes 0-1 on the drawn axis pair, 2-3 on the perpendicular one), making
  the centre a real intersection, which is the day's own briefing. And lanes
  (WHEELHOUSE) / bars (LANCER DOCTRINE) take stratified bands of their edge
  instead of each rolling the full span, handed out **centre-out** so the first
  structure always crosses the middle and extra ones fan toward the corners a
  pilot would park in. Still exactly one placement draw per structure, and for
  a single-structure event the distribution is identical to the old full-span
  roll, so the shared daily script and the readable opening both hold.
- **Per-day cadence endpoints** (ramp endpoints only; no `late` block touched):
  wheel `laneCountRange` [1,4] to [1,5] and `laneIntervalLate` [4,5.4] to
  [3.4,4.6]; hunter `waveIntervalLate` [6,7.5] to [4.2,5.4] (the biggest move —
  a vee only lives 6s, so waves 6-7.5s apart meant the pack was reliably dead
  before the next one arrived); lance `salvoIntervalLate` [4.6,6.2] to [3.8,5];
  bomb `deploymentIntervalLate` [3.2,4.6] to [3,4.2] (gentlest: slabs deny
  space for their whole fuse); MENAGERIE `eventIntervalLate` [2.4,3.2] to
  [2.1,2.8] and `doubleChanceLate` 0.7 to 0.85.
- **Render fix.** A staggered event queues every structure up front, so
  `drawCreatureTelegraphs` now skips items still waiting out their stagger
  (`timer > duration`). Without it, spreading a burst over ~3s littered the
  edges with warning rings seconds ahead of the arrivals and gave the whole
  event away.
- **Before/after, 60-120s** (seeded invulnerable observer, `before` = the build
  Lucas screenshotted). Pocket is the headline:

  | day | roomiest pocket | longest quiet gap | avg concurrent |
  | --- | --- | --- | --- |
  | WHEELHOUSE | 6.6s to **1.7s** | 5.6s to 1.9s | 4.0 to 8.3 |
  | HUNTING PARTY | 28.3s to **10.2s** | 9.0s to 2.4s | 2.4 to 4.7 |
  | LANCER DOCTRINE | 7.8s to **2.2s** | 8.8s to 3.2s | 4.3 to 7.6 |
  | DEMOLITION DAY | 6.7s to **4.3s** | 6.2s to 3.7s | 1.3 to 2.0 |
  | MENAGERIE | 6.4s to **4.8s** | 4.6s to 3.1s | 2.5 to 3.8 |

  HUNTING PARTY stays the loose one on purpose: its hunters TRACK the ship, so
  they cluster on the pilot and genuinely do leave the far side of the arena
  empty. That roomy spot is real but unusable — taking it means turning your
  back on the pack — so its bar is set loose and the reason is in the code.
- **The opening is untouched, and now guarded on both sides.** First 30s on
  WHEELHOUSE: 1.1 avg concurrent, 4 arrivals, 8.7s arrival gap, all
  bit-comparable to before. The opening guard used to *average the first sixty
  seconds* despite being named "the first 30s", which put it on a collision
  course with the mid ramp it is not meant to police (it read 2.3 against its
  own 2.5 ceiling purely because 0:30-1:00 got busier, as intended); it now
  reads bucket 0 only, and gained a POCKET FLOOR (>=8s) so a future pass cannot
  quietly eat the readable opening either.
- **Every new/raised bar was checked against the shipped build and FAILS
  there** (that is the point of a guard): raised mid floors, the dead-air
  ceiling, and the pocket ceiling all go red on `main`'s `src/`, green here.
- **FLAG FOR LUCAS, the honest cost: minute 2 now carries roughly what minute 5
  used to.** Max-throughput observer, concurrent creatures per minute on
  WHEELHOUSE: before 0.2 1.1 1.4 2.0 3.8 6.8 9.7 11.2, after 0.5 3.1 4.7 5.2
  7.8 11.4 12.6 12.0. Minutes 5-8 rose ~1.3-1.5x on WHEELHOUSE / HUNTING PARTY
  / LANCER DOCTRINE as a knock-on: the late leg's SHAPE is untouched and its
  anchor stayed at 3, but it now multiplies up from a denser shelf, which is
  unavoidable if the mid game is to be tightened at all. The shield-assisted
  dodge bot's WHEELHOUSE median dropped from 124-154s to 77-97s, so **skilled
  run length will shorten** — that is the price of "no calm pocket at 1:45",
  and it wants Lucas's eyes on the preview before any ship. The one knob to
  dial it back is `CREATURE_DAYS.rampMinutes` / `rampCurve`.
- **Kill-rate ceiling: NOT raised, and not breached where the tripwire cares.**
  `MAX_KILLS_PER_SEC` is 20 against CUMULATIVE kills/time. Inside the 5-8
  minute band the tripwire named, a max-throughput invulnerable rammer (far
  above any human) peaks at 16.6 kills/s on WHEELHOUSE, up from 12.7. It does
  cross 20 deeper into a 12-minute run (WHEELHOUSE 21.3 at m10, DEMOLITION DAY
  22.5 at m11), but that is pre-existing rather than new — the same observer on
  `main` crosses it at m11-12 — and the shield-assisted bot dies around 90s, so
  runs that long are not plausible on these days. Reported, not raised.
- **Medal factors: NOT changed** (same tripwire as the last two passes). The
  `difficultyFactor` calibration harness is the 90-second evasive bot, which
  dies inside the opening this pass deliberately did not touch, and its medians
  moved inside their own documented noise band: WHEELHOUSE 22.0-23.0s (22.0
  before), MENAGERIE 18.6s (18.6), HUNTING PARTY 15.2-15.4s (14.0-14.4),
  DEMOLITION DAY 17.1-17.9s (17.0-18.9), LANCER DOCTRINE 11.9-18.8s (12.6 —
  that spread is the off-stream `Math.random` jitter the last pass documented,
  not a shift).
- **Pool frozen and player-facing copy untouched.** No `MUTATOR_POOL` order, id,
  or membership change, so every date-to-mutator assignment holds; `mutators.ts`
  is not in this diff at all. Sublines were deliberately NOT rewritten: they
  still read true ("One lane at the open, then rush hour builds fast", "lanes
  from alternating sides"), and public copy is Lucas's call, not a tuning pass's.
  Pickup throttle left at `CREATURE_DAY_PICKUP_SCALE` 1.3 (measured 75-79 drops
  per 8 min against a plain Daily's 100, inside the existing 0.6-0.9x bars).
- **Verification.** `npm run build` (tsc --noEmit + vite) green, bundle
  `index--LdUHUyN.js`, CSS unchanged (`index-Bp4CgbiJ.css`). Three consecutive
  full `npx tsx scripts/sim-test.ts` runs ALL CHECKS PASSED, with the seeded
  telemetry stable to a tenth across runs. Daily Patrol determinism checks
  (WHEELHOUSE 163 events, MENAGERIE 107 events, identical script across two
  play styles) still pass — `randRange` consumes exactly one draw regardless of
  its bounds, so the banded placement keeps the fixed-draw contract.
- **Follow-ups.** (a) Shipped without the preview eyeball Lucas was asked for
  (he called "push live" instead); the open question is still readability at
  8-10 concurrent wheels, not density, and it is now a live-play question. (b) If minute 5-8 is judged too hot as a knock-on, the fix is a
  `lateStartMinutes` nudge rather than undoing the mid ramp. (c) HUNTING PARTY
  is still visibly the sparsest day of the five and would need a pursuit-shaped
  fix (longer hunter lifetime, which is global `ASSEMBLY` config) rather than
  more waves.

## 2026-08-12: mid-ramp densify merged + deployed, the choreography days wake up at 0:30 instead of 3:00 (main, DEPLOYED)

- **Shipped.** Lucas green-lit the pass ("push live"), so
  `sam/mid-ramp-densify` was merged into `main` as merge commit `4f1dc63`
  (`--no-ff`, matching this repo's style for `sam/*` branches) on top of the
  single content commit `24b3bf2`, and pushed, which auto-deploys the Render
  service `surviveorion`. Bundle `index-BnR92Xoc.js` before the deploy,
  `index-LnPMPnt2.js` after; CSS unchanged (`index-Bp4CgbiJ.css`), no styles
  moved. `npm run build` green and a full `npx tsx scripts/sim-test.ts` ALL
  CHECKS PASSED on the merge commit before the push.
- **Mid-day deploy, boards deliberately left alone.** The UTC 2026-08-12
  daily was already running, so pilots who played before this deploy flew the
  sparser pre-densify script and pilots after it fly the denser one. Lucas's
  call was to ship now and not clear the boards. Day-to-mutator mapping is
  unaffected (`MUTATOR_POOL` order and ids frozen), and the player-facing
  subline rewrites flagged below ship with the same green light.
- **Trigger.** Lucas played the live WHEELHOUSE daily right after the
  late-growth deploy: at 1:55 the field was still sparse (screenshot showed a
  handful of wheels and a lot of empty arena) and he was hoarding powers
  without pressure. His call: "after 30 secs, it needs to ramp up a bit more i
  think. People will get bored otherwise". So the first ~30s stays the readable
  opening beat, and 0:30 onward has to climb hard. This sits ON TOP of
  yesterday's late growth; that curve is deliberately untouched.
- **Root cause.** The late-growth pass only starts past `rampMinutes: 3`, and
  minutes 1-3 were left bit-identical to the plateau-era curve on purpose. That
  early curve was a straight lerp from the early feel to the late feel starting
  at t=0, so at 1:55 WHEELHOUSE was ~40% of the way from "one lane" to "three
  lanes": ~2.4 concurrent wheels, ~27 drones, a wheel arriving every ~3s. The
  interesting part of the day only began as the late leg took over.
- **New shared shape (`CREATURE_DAYS`, applied by `rampProgress` in
  `creatures.ts`).** The early ramp is no longer a straight line from zero:
  `progress(m) = clamp01((m - openingMinutes) / (rampMinutes - openingMinutes)) ^ rampCurve`
  with `openingMinutes: 0.5`, `rampMinutes: 2` (was 3), `rampCurve: 0.65`. Flat
  through the opening (so the first 30s is bit-comparable to before), then
  concave, so the steepest climb lands exactly in the 0:30-2:00 window Lucas
  was bored in. `escalateInterval` / `escalateCount` / MENAGERIE's double-roll
  all read the same function, so the shape is identical across the pool.
- **`lateStartMinutes: 3` is a new, separate knob, and it matters.**
  `rampMinutes` used to double as the late-growth anchor. Shortening it to 2
  therefore dragged the whole shipped late curve 1 minute earlier, and the two
  passes compounded: measured with the anchor at 2.5, WHEELHOUSE hit 9
  concurrent wheels before minute 3, which used to be minute-6 pressure. Anchor
  held at 3, so minute 3+ keeps exactly the curve that shipped yesterday, just
  starting from a denser mid-game. Minutes 2-3 are a short flat shelf at full
  early-ramp pressure. `STARFALL_RAIN.lateStartMinutes: 3.5` does the same job
  for the rain (its `rampMinutes` moved 3.5 to 2.5).
- **Per-day coefficients** (only the ramp ENDPOINTS moved; every day's late
  block is untouched): wheel `laneCountRange` [1,3] to [1,4] with
  `laneIntervalLate` [3.5,5] to [4,5.4] (deliberately looser: the 4th lane adds
  more traffic per burst than the cadence it replaces, and lanes read better as
  traffic than a machine-gun of single crossings); hunter `packSizeRange` [2,4]
  to [2,5], `waveIntervalLate` [6,8] to [6,7.5]; lance stays at 5 bars (the most
  lethal shape in the pool) with `salvoIntervalLate` [5,7] to [4.6,6.2]; bomb
  `deploymentCountRange` [1,2] to [1,3], `deploymentIntervalLate` [3,4.5] to
  [3.2,4.6]; MENAGERIE `eventIntervalLate` [2.5,3.5] to [2.4,3.2] and
  `doubleChanceLate` 0.5 to 0.7.
- **Pickup economy (the hoarding half of the complaint).** New shared
  `CREATURE_DAY_PICKUP_SCALE = 1.3` in `mutators.ts`, set as
  `pickupIntervalScale` on all five choreography days. Daily Patrol runs the
  drop schedule at 0.7x intervals because it has no refill floor; on a day with
  no ambient swarm and no ordinary formations there was nothing to spend powers
  on between events, so a 30%-faster schedule meant a permanently full board.
  1.3 x 0.7 = 0.91, i.e. just under the ordinary non-daily rate: measured 77-79
  drops per 8 minutes against a plain Daily's 100. Not a starve on purpose, the
  powers are the counterplay to a dense field.
- **Before/after density** (seeded invulnerable observer, 30-second buckets,
  `avg concurrent creatures` then `drones on the field`, buckets 0:00 / 0:30 /
  1:00 / 1:30 / 2:00 / 2:30 / 3:00):
  - WHEELHOUSE concurrent 1.1 1.6 2.5 2.4 2.5 4.2 4.8 becomes
    1.1 1.9 3.7 4.2 6.6 5.0 6.1; drones 13 14 28 27 35 70 50 becomes
    13 18 39 53 76 80 63; arrival gap 8.0 4.9 3.3 3.0 2.2 1.6 1.4 becomes
    8.2 4.3 2.0 1.4 1.3 1.1 1.2. The 1:55 bucket Lucas complained about is
    1.75x the concurrent wheels and 2x the drones; the first 30s is unchanged.
  - HUNTING PARTY 1.0 1.0 1.2 1.6 1.8 2.1 2.8 becomes 1.0 1.2 2.0 2.7 3.4 3.3 3.7.
  - LANCER DOCTRINE 1.5 2.3 2.7 2.6 3.8 5.1 6.0 becomes 1.5 2.0 3.5 5.2 7.4 6.4 7.4.
  - DEMOLITION DAY 0.3 0.3 0.4 0.8 1.0 1.0 1.4 becomes 0.3 0.6 0.8 1.8 1.8 2.0 2.0.
  - MENAGERIE 0.5 1.7 1.9 1.9 1.9 1.6 2.7 becomes 0.8 2.0 2.3 2.6 3.8 3.3 3.5.
  - STARFALL impacts/min by minute: 16 22 32 becomes 17 27 54, i.e. the
    lighter touch it was meant to be early and a real thickening by minute 3;
    minutes 4-8 are unchanged within noise (57/min at 3-4, 84/min at 6-8)
    because the late anchor didn't move.
  - Minute 5-8 across the creature days lands within noise of yesterday's
    numbers (WHEELHOUSE 12.8 12.1 12.4 10.8 19.7 17.0 vs 7.4 11.3 10.1 17.2
    16.7 13.9 per 30s bucket), which is the point: this is a mid-game fix, not
    a second late-game buff.
- **Kill-rate ceiling: NOT raised, and not close in the window that matters.**
  `MAX_KILLS_PER_SEC` is 20 and `validateRun` compares it against CUMULATIVE
  kills/time, so that's what was measured. A max-throughput invulnerable
  rammer (the hardest possible case, far above any human) sits at 6.0-12.5
  cumulative kills/s across minutes 5-8, up from 4.7-10.9: no ceiling risk in
  the 5-8 minute band the tripwire named. It does cross 20 deep into a
  12-minute run (DEMOLITION DAY 20.0 at 11:00, 22.3 at 12:00), but that is
  pre-existing, not new: the same observer on the current `main` build crosses
  it at 11:30 (20.7 at 12:00). Runs that long shouldn't exist on these days
  anymore (the shield-assisted bot dies around minute 2), so this is a report,
  not a request.
- **Medal factors: NOT changed** (same tripwire as yesterday). The
  `difficultyFactor` calibration harness is the 90-second evasive bot, and its
  medians moved inside their own noise band: WHEELHOUSE 22.0s, MENAGERIE 18.6s,
  LANCER DOCTRINE 12.6s, HUNTING PARTY 14.0-14.4s, DEMOLITION DAY 17.0-18.9s.
  Worth a re-look on real player data once these days come around, since the
  first 90 seconds is precisely the stretch this pass changed.
- **Sim-test additions.** (a) 30-second-resolution telemetry in section 11
  (`halfConcurrent` / `halfGap` / `halfArrivals`), since minute buckets can't
  tell "calm open, then a climb" from "flat for two minutes". (b) An opening
  guard: no creature day may exceed 2.5 avg concurrent creatures or 8 arrivals
  in its first 30 seconds, so a future densify can't ship a jump-scare open.
  (c) Mid-ramp floors per day at 60-120s and 120-180s. These are ABSOLUTE, not
  growth ratios, because a ratio cannot see this bug: the pre-pass curve grew a
  respectable 1.8x from minute 1 to minute 2, it was just doing it from nothing
  to almost nothing. Each floor sits ~20-25% above the pre-pass measurement and
  ~20% below the post-pass one. (d) WHEELHOUSE lane cadence <=2s by t=60s.
  (e) The two-sided pickup-economy check above. (f) STARFALL's rain must
  thicken >=1.4x from minute 1 to minute 2.
- **Sim flake fixed** (the follow-up left open yesterday). Both bot harnesses
  were fully unseeded, so their medians swung wildly run to run (WHEELHOUSE
  188s then 125s) and any bar near its threshold flapped. Each trial now runs
  on its own fixed seed from a shared `TRIAL_SEEDS` list: the bot still faces
  10 different run scripts, but the SAME 10 every time. The evasive-bot medians
  are now stable to a couple of tenths across runs. Sections 1, 1b and 5 were
  seeded too, all for the same reason: section 1's "population stayed under
  cap" bar caught a run at 265 against a <=250 bar on a build where nothing
  about vanilla Classic had changed (now a steady 158-168), and section 5's
  bad-luck-protection bar came back 7 against a >=8 bar on the next run (now a
  steady 8, exactly on the bar, which is what that protection actually delivers
  in 15 drops). Residual spread in the 300s
  shield-assisted harness is real and expected: per-drone jitter seeds, lance
  and wheel shatter scatter, and the crowd-pressure valve are all deliberately
  off-stream `Math.random` (they must be, or Daily Patrol determinism breaks),
  so its bar stays deliberately loose and the seeded telemetry checks remain
  the sharp guard.
- **Verification.** `npm run build` (tsc --noEmit + vite) green; three
  consecutive full `npx tsx scripts/sim-test.ts` runs all green. Shield-assisted
  bot at the 300s cap: WHEELHOUSE median 124-154s, HUNTING PARTY 111s, LANCER
  DOCTRINE 126-154s, DEMOLITION DAY 111-173s, MENAGERIE 103-125s, GREAT WALL
  103-231s, YEAR OF THE SERPENT 77-126s, everything 7-10 of 10 trials dying
  inside the cap.
- **Pool frozen, as instructed.** No `MUTATOR_POOL` order, id, or membership
  changes, so every date-to-mutator assignment pilots are already seeing is
  untouched. The only pool edits are the five `pickupIntervalScale` overrides
  and the sublines that disclose them (each creature day's subline now says
  drops come a little slower, and WHEELHOUSE / HUNTING PARTY / DEMOLITION DAY /
  MENAGERIE mention the faster build-up), so the days still read honestly.
  Subline copy is player-facing: flagged for Lucas rather than assumed.
- **Merged and deployed.** See the Shipped bullet at the top of this entry;
  the branch-only note that stood here is superseded.
- **Open risks.** (1) The mid-game is now roughly the old minute 3-4 at minute
  2, so skilled runs will come in shorter; if Lucas wants the 5-minute typical
  back, `rampCurve` toward 0.8 or `rampMinutes` back toward 2.5 is the dial,
  not the per-day counts. (2) LANCER DOCTRINE is the densest day at t=120s (7.0
  concurrent bars) and its bars are the most lethal shape in the pool, so it is
  the first candidate if the mid-game reads brutal in live play. (3) GREAT WALL
  and YEAR OF THE SERPENT were left alone on purpose: their formation interval
  already floors at ~2.7s by minute 1 (~22 formations/min), so their early game
  was never the sparse one. Their evasive-bot medians (20.5s / 23.8-24.4s) stay
  the highest in the pool, which is a hint they could take a pass of their own
  later.

## 2026-08-12: late-growth pass merged + deployed, kill-rate ceiling raised to 20 (main, DEPLOYED)

- **Shipped.** Lucas green-lit the late-growth pass, so
  `sam/creature-late-growth` was merged into `main` (merge commit, matching this
  repo's style for `sam/*` branches) and pushed, which auto-deploys the Render
  service `surviveorion`. Two content commits: `7c2a8e3` the late-growth pass
  itself (creature days, STARFALL, GREAT WALL / YEAR OF THE SERPENT, the
  drone-cap valve, new sim guards) and `6d4b662` the companion anti-cheat
  change below.
- **Anti-cheat ceiling raised, and it was required, not cosmetic.**
  `MAX_KILLS_PER_SEC` in `server/validate.mjs` goes 12 to 20. The whole point of
  the pass is that these days keep escalating past minute 3 instead of
  plateauing, so the crowd a skilled pilot legitimately clears late is far
  bigger than when the ceiling was set: a max-throughput observer at minute
  8-10 sustains roughly 11-16 kills/s. Left at 12, long skilled runs on
  creature days would have come back rejected as "impossible kill rate", i.e.
  the pass would have punished exactly the players it was built for.
  `validateRun`'s per-run score upper bound is derived from `kills`, so it
  tracked the raise on its own; nothing in `SCORING` changed. The stale "(12)"
  reference in the OVERCHARGE comment in `src/mutators.ts` was synced to match.
- **Pool deliberately frozen.** No `MUTATOR_POOL` order or id changes and no
  medal-base changes, so the day-to-mutator mapping pilots are already seeing
  stays exactly as it was. The only pool edits are the two new
  `lateFormationGrowth` overrides on GREAT WALL / YEAR OF THE SERPENT and their
  subline rewrites, which disclose the late ambient leak so those days still
  read honestly.
- **Verification.** `npm run build` (tsc --noEmit + vite) green. Bundle
  `index-BopFbpFD.js` before the deploy, `index-BnR92Xoc.js` after, confirmed
  live at surviveorion.com. CSS hash unchanged (`index-Bp4CgbiJ.css`), as
  expected for a gameplay-only change.
- **Follow-up: the sim suite is mildly flaky.** `scripts/sim-test.ts` passed on
  four of five runs; one run reported a single failed check that never
  reproduced across four further runs. The bot-median checks (evasive and
  shield-assisted) run unseeded `Math.random` trials, so day medians swing a
  lot between runs (WHEELHOUSE came in at 188s on one run and 125s on the next)
  and any bar close to a threshold will flap. Worth seeding those trials or
  widening the bars, otherwise a genuine regression will get waved through as
  "probably the flaky one".

## 2026-08-11: late-growth pass, the plateau days keep escalating forever (branch `sam/creature-late-growth`, merged + deployed 2026-08-12, see the entry above)

- **Trigger.** Today's Daily Patrol (WHEELHOUSE) was farmable: Lucas ~2.5 min,
  a friend ~25 min. Target skilled run length is ~5 min typical and 7-8 min
  MAX. Requirement from Lucas: the fix must be a shape shared by every
  plateau-prone mutator, not a WHEELHOUSE-only hack.
- **Root cause.** Creature days ramp "early feel" to "late feel" over
  `CREATURE_DAYS.rampMinutes: 3` and then hard-stop: `rampedInterval` /
  `rampedCount` both clamp at `m/3`, `wheelMemberRange` never scaled with time
  at all, `ASSEMBLY.kinds.*.speedScale` is fixed, and the drone baseline speed
  ramp is near-flat. Classic keeps growing forever through
  `SPAWNER.spawnsPerSecond.latePerMinute`, but these days set
  `ambientRateScale: 0`, so they threw Classic's endless leg away and replaced
  it with nothing. Same story for STARFALL (sits on `intervalFloor` after
  m3.5) and for the zero-ambient formation days GREAT WALL / YEAR OF THE
  SERPENT (formation interval floors out around m2).
- **Shared helpers (`src/creatures.ts`), replacing `rampedInterval` /
  `rampedCount`.** All four are pure functions of elapsed run minutes, with
  `lateMin = max(0, m - 3)`:
  - `escalateInterval` = ramped range x `max(intervalFloorScale, 1 / (1 + intervalTighten * lateMin))`
    (hyperbolic, so the first late minutes bite hardest)
  - `escalateCount` = `max(1, round(min(groupMax, rampedCount + groupPerMinute * lateMin)))`
  - `lateMemberBonus` = `min(memberMax, memberPerMinute * lateMin)`, added to the seeded member roll
  - `lateSpeedScale` = `min(speedMax, 1 + speedPerMinute * lateMin)`, threaded
    through `CreatureSpawn.speedScale` into `spawnAssemblyDirect`
  Per-day numbers live in `CREATURE_DAYS.*.late` (new `CreatureLateGrowth`
  interface in `config.ts`), so the curve shape is identical everywhere and
  only the coefficients differ: WHEELHOUSE leans hardest on members + speed
  (0.9/min, 0.08/min), HUNTING PARTY least on speed (0.05/min, a hunter is
  meant to be outflown), DEMOLITION DAY gets zero speed growth and the
  tightest cadence floor (0.4) because a slab is stationary, MENAGERIE gets
  the gentlest group growth (0.35/min) plus
  `doubleChanceLatePerMinute: 0.12` so its double becomes the norm late.
- **DEMOLITION DAY also needed a mid-ramp fix**, not just a late leg: one
  short-fused slab at a time disbands before the next lands, so it was the
  most farmable day in the pool (assisted bot ran it to the 10-minute cap in
  10 of 25 trials). Added `deploymentCountRange: [1, 2]` and
  `slabStagger: 0.6`. Minute 1 is unchanged (8 events, same 7.8s gap); minute
  2 onward is denser by design.
- **STARFALL** (`starfall.ts`): past `rampMinutes` the interval keeps
  shrinking, `max(intervalHardFloor 0.45, ramped / (1 + 0.14 * lateMin))`,
  reaching ~0.7s by m7 and bottoming out around m13.
- **GREAT WALL / YEAR OF THE SERPENT** (`mutators.ts`, new
  `lateFormationGrowth` override): formation interval keeps tightening
  (`intervalTighten: 0.18`, floor 0.45 of the ramped value) and a stray-drone
  trickle starts at m4 and grows (`ambientPerMinute` 0.25 / 0.3, capped at
  1.5 / 1.8 spawns/sec). The trickle needed its own accumulator
  (`World.lateAmbientAccumulator`): these days arrive formations so often that
  the shared `spawnAccumulator` is reset to 0 before it can ever fire.
  Sublines updated to disclose the late leak, so the day still reads honestly.
- **Drone cap valve (`enemies.ts`).** Late growth makes `SPAWNER.maxDrones`
  (550) genuinely reachable (a 10-minute invulnerable run now peaks 240-505
  where it used to peak near 100). Skipping a scheduled creature at the cap
  would make the shared daily script depend on how much the pilot had killed,
  so `spawnAssemblyDirect` now calls `retireDistantFreeDrones` first: silently
  removes the loose non-assembly, non-frozen drones farthest from the ship, no
  score, no kill event, no multiplier. Verified script-identical across play
  styles at the cap: creature arrivals over a 600s run match exactly between a
  ram-everything observer and a never-kill observer (WHEELHOUSE 879/879,
  LANCER DOCTRINE 887/887, DEMOLITION DAY 874/874, HUNTING PARTY 649/649,
  MENAGERIE 757/757).
- **Sim before/after** (seeded invulnerable observer, per-minute buckets 1-8,
  `avg concurrent creatures` and `members/event` and `avg gap`):
  - WHEELHOUSE concurrent 1.4 2.5 3.3 5.1 4.2 3.9 3.8 4.7 becomes
    1.4 2.5 3.4 5.4 9.1 9.5 11.6 14.5; members 7.6 flat-ish becomes
    7.6 7.5 7.4 8.0 8.7 9.8 10.6 11.4; gap 5.9 3.2 1.9 1.4 1.4 1.4 1.4 1.4
    becomes 5.9 3.2 1.9 1.3 0.8 0.7 0.5 0.4; wheel speed 1.9 flat becomes
    1.9 1.9 1.9 2.0 2.2 2.4 2.6 2.8. Minutes 1-3 are bit-identical.
  - HUNTING PARTY concurrent 2.6 at m8 becomes 9.0; LANCER DOCTRINE 4.5
    becomes 15.1; DEMOLITION DAY 0.5 becomes 5.3; MENAGERIE 2.7 becomes 12.2.
  - STARFALL impacts/min 55 59 60 59 61 (m4-8) become 56 68 75 85 89.
  - GREAT WALL formations/min 27 27 27 26 27 become 34 39 43 50 52, ambient/min
    0 0 0 0 becomes 7 22 38 52 (m5-8). SERPENT formations 30 30 29 30 30 become
    38 43 49 53 59, ambient 8 27 45 63.
  - Assisted dodge bot (rebankable shield every 7s, the stand-in for a skilled
    pilot banking drops): pre-pass WHEELHOUSE reached 9.6 min and DEMOLITION
    DAY hit the 10-minute cap in 10 of 25 trials; post-pass nothing reaches
    7.1 min. At the committed 300s cap in sim-test, medians across two
    consecutive runs (10 trials each, the bot is unseeded so this is the real
    spread): WHEELHOUSE 104-173s, HUNTING PARTY 146s, LANCER DOCTRINE 161-223s,
    DEMOLITION DAY 196-203s, MENAGERIE 160-168s, GREAT WALL 104-168s,
    YEAR OF THE SERPENT 88-91s. Every day ended 10 of 10 trials inside the cap
    except GREAT WALL (8-9 of 10).
- **Sim-test additions (section 11).** (a) Pressure telemetry on a seeded
  invulnerable observer: every growing day must show minute 6-8 concurrent
  pressure >= 1.6x minute 3-4 (observed 2.1x to 3.9x), plus WHEELHOUSE's four
  explicit calibration targets (>=5 concurrent wheels through m5, >=10
  members/wheel by m7, <=0.8s between arrivals by m7, >=1.2x speed by m7), plus
  STARFALL intensity growth and the GREAT WALL / SERPENT "zero ambient for 4
  minutes, then a growing trickle" shape. (b) A 300s-cap assisted-bot guard
  requiring >=50% of trials to end inside the cap on every plateau-prone day.
  Bot-to-human mapping documented in the file: this bot dies around minute 1
  at the old 90s cap, so it cannot see a minute-3 plateau at all; the shield
  stand-in pushes it into the 2-7 minute band where the late curve bites.
- **Medal factors: NOT changed** (deliberately, per Lucas's tripwire). The
  90s-cap evasive bot that `difficultyFactor` was calibrated against sees
  almost none of this: minutes 1-3 are bit-identical on WHEELHOUSE, HUNTING
  PARTY, LANCER DOCTRINE and MENAGERIE, so their calibration inputs cannot
  have moved. Measured ratios before/after over 20 trials: WHEELHOUSE
  1.69x/1.46x, HUNTING PARTY 0.97x/0.87x, LANCER DOCTRINE 0.93x/1.27x,
  DEMOLITION DAY 1.22x/1.15x, MENAGERIE 1.40x/1.31x, STARFALL 1.08x/1.04x,
  GREAT WALL 1.55x/1.62x, SERPENT 1.74x/1.61x. The spread is harness noise
  (unseeded bot, wide run-to-run variance), not signal. Worth a real-data
  re-look: skilled players now score less per day on creature days because
  runs are shorter, and STARFALL's median bot score moved 297 to 551 points
  (more meteors clearing crowds for free), which is the one number that could
  justify a threshold revisit.
- **Anti-cheat ceiling: flagged for Lucas, NOT changed.**
  `server/validate.mjs` rejects a run when `kills > timeSurvived * 12`
  (`MAX_KILLS_PER_SEC`, commented "spawn rate reaches ~8/s late"). A
  max-throughput invulnerable observer now averages 10.9-11.2 kills/s at m8 and
  13-16 kills/s at m10 on WHEELHOUSE / LANCER DOCTRINE / DEMOLITION DAY /
  MENAGERIE / SERPENT (was well under 12 everywhere). A human dying at 5-8
  minutes should stay under it, but the margin is now thin and a long
  starshell-heavy run could trip it, which would silently refuse to save a
  legitimate score. Recommend raising `MAX_KILLS_PER_SEC` to ~20 in the same
  change that ships this; it needs Lucas's sign-off because it is a server
  deploy and a validation loosening.
- **Remaining risks.** (1) GREAT WALL still touches the 550 drone cap in a
  10-minute invulnerable run (t=473s), which is a frame-rate question on weak
  devices more than a balance one; the late ambient trickle is the new
  contributor and `ambientMax` is the knob. (2) DEMOLITION DAY's minute 2-3 is
  now denser than before, a deliberate deviation from "late growth only"
  because its plateau started before the ramp ended; minute 1 is untouched.
  (3) Coefficients were tuned against a bot, not a human. Lucas's own run on a
  preview build is the real test, and the per-day `late` blocks are the single
  place to tune. (4) Sublines for GREAT WALL / SERPENT changed, so their
  briefing copy is no longer the version that shipped on 2026-08-10.
- Verified: `npx tsc --noEmit`, `npm run build`, `npx tsx scripts/sim-test.ts`
  all green (122 checks). Pool order, ids and date-hash assignments untouched
  (sim-test's launch-gate check still resolves 2026-08-11 to `iron-barrage`).
  Local preview: `npm run dev`, then `?mutator=wheelhouse` (also
  `hunting-party`, `lancer-doctrine`, `demolition-day`, `menagerie`,
  `great-wall`, `year-of-the-serpent`, `starfall`).

## 2026-08-10f: MENAGERIE density pass, the zoo was too sparse (main, deployed, second hotfix on today's live day)

- Direct commit to `main` (Lucas explicitly approved, this deploys to prod
  immediately). Live tuning feedback, roughly an hour after the previous
  fix: "a minute in, and still not a lot of enemies," with a screenshot at
  1:19 showing one creature mid-formation, a couple of stray drones, and
  pickups floating in mostly empty space. The round-e rebuild fixed the
  "plain drones at the start" bug but landed the ongoing pacing too sparse.
- **Telemetry-first tuning.** Added a throwaway probe (not committed, see
  below) reading on-screen counts (`world.drones.length`,
  `world.assemblies.length`, i.e. creatures currently live/forming) at
  t=30/60/90/120/150/180 on a scripted, invulnerable-observer run, averaged
  over 20 seeds, instead of eyeballing event intervals. Confirmed the
  complaint quantitatively: pre-fix MENAGERIE averaged ~1 concurrent
  creature or fewer at every checkpoint (0% to 35% of trials ever reaching
  2 concurrent) and 0-15 drones on screen, well under both reference points
  Lucas asked for: Classic baseline (0.0-0.8 creatures, but 27-55 drones
  from ambient/formations) and RED ALERT (0.0-1.0 creatures, 40-79 drones).
- **Levers pulled (`CREATURE_DAYS.menagerie`, `mutators.ts`):**
  - Cadence: `eventIntervalEarly` 8-10s → 4-6s, `eventIntervalLate` 4-6s →
    2.5-3.5s. Deliberately faster than Lucas's own ballpark (5-7s/3-4s):
    testing his exact numbers still left concurrent-creature rates too low
    at t=60 (~1.0 avg, <35% of trials at 2+), so judgment call to push
    further. Chosen so cadence regularly undercuts a creature's own active
    lifetime (6-9s for hunter/lance/wheel, see `ASSEMBLY.kinds`), producing
    real overlap (a new creature lands while the last is still live)
    instead of relying only on explicit double events for concurrency.
  - Doubles: added a `doubleChanceEarly` floor (new field, was hardcoded to
    0) so two-kind events start from the very first event, not just late
    run. `doubleChanceEarly` 0 → 0.25, `doubleChanceLate` 0.25 → 0.5.
  - Ambient trickle: `ambientRateScale` 0.15 → 0.3. Smaller effect than the
    cadence/double changes on its own (base ambient rate scales down a lot
    at 0.3 of normal), but keeps the gaps between creatures from reading
    fully dead, per Lucas's own fallback suggestion.
- **Result (20-seed average, invulnerable-observer telemetry):** creatures
  live/forming climbs 0.9 (t30) → 0.9 (t60) → 1.7 (t90) → 1.5 (t120) → 1.8
  (t150) → 1.6 (t180), hitting 2+ concurrent in 55-70% of trials by t90
  onward (was 0-35% everywhere pre-fix). Drones on screen climbs 11 → 11 →
  17 → 15 → 21 → 19 (was 0-15, flat, pre-fix). Deterministic script check
  (fixed seed) shows 58 choreography events over a 180s run, up from 26.
  This clears Lucas's ballpark ("2+ creatures by t=60, climbing from
  there") most consistently from t90 on; t30/t60 average just under 1,
  reported honestly rather than rounded up, first creature still lands at
  its intended t~13s reveal beat so there's little run time before t60 for
  a second creature to stack on top of the first regardless of cadence.
  If Lucas wants t60 itself denser, the next lever is loosening the reveal
  delay or the doubleChanceEarly floor further; flagged, not changed here
  since it wasn't asked for.
- **Difficulty factor re-tuned 1.1 → 0.95.** The extra pressure moved the
  evasive bot's survival ratio from ~1.4-1.6x baseline (WHEELHOUSE's easy
  territory) down to ~1.2x baseline (LANCER DOCTRINE's territory, factor
  0.95): baseline medians 14.5-15.9s across runs, MENAGERIE now 17-20s
  (was 20-23s), score medians 52-73pts (was 61-80pts), landing right
  alongside LANCER DOCTRINE's own numbers. Today's thresholds shift mid-day
  a second time as a result; accepted per Lucas (today is already a mixed
  soft-launch day, now also mid-tuning).
- **Sim-test additions:** added `menagerie` to the four-day evasive-bot
  "fair fight" named call-out loop (was only checked by the generic
  pool-wide playability bar before). Added a durable density regression
  guard on the fixed-seed script: at least 2 concurrent creatures within
  the first 60s, and concurrent count at t120 not below t60's peak (i.e.
  climbing, not fading). This directly encodes today's bug as a permanent
  check so the day can't quietly go sparse again.
- **Single-kind creature days: NOT changed**, per Lucas's explicit
  instruction (telemetry-only, for his own decision on whether they need
  the same pass). 20-seed-average on-screen counts, unchanged from before
  this pass:
  - HUNTING PARTY: creatures 0.8/1.6/1.6/1.7/1.6/2.4 at t30-180, drones
    4.0-14.0. Reaches 2+ concurrent in 35-60% of trials.
  - LANCER DOCTRINE: creatures 0.6/1.4/1.3/2.6/2.4/3.5, drones 6.0-27.2.
    Reaches 2+ concurrent in 25-70% of trials, climbing the most of the
    four late-run.
  - WHEELHOUSE: creatures 0.7/1.4/1.9/1.5/3.2/3.1, drones 5.9-31.8.
    Reaches 2+ concurrent in 10-90% of trials, the densest of the four by
    t150-180.
  - DEMOLITION DAY: creatures 0.0/0.4/0.3/0.6/0.3/0.6, drones 4.2-13.3.
    Never reaches 2+ concurrent in any checkpoint across 20 seeds (0%
    everywhere), the sparsest of the four by a clear margin (bomb's short
    ~3.7s active lifecycle disbands before the next deployment lands even
    late-run). Flagging this one specifically as the strongest candidate
    if Lucas wants the same density pass applied to the single-kind days.
- **Verification:** `npm run build` green. `npx tsx scripts/sim-test.ts`
  green across 5+ consecutive runs (one run hit the pre-existing
  `pending grab claims the next drop` flake, documented in earlier entries,
  unrelated to this change, cleared on re-run).

## 2026-08-10e: MENAGERIE rebuilt on the direct-spawn choreography engine (main, deployed, hotfix on today's live day)

- Direct commit to `main` (Lucas explicitly approved, this deploys to prod
  immediately). Live playtest feedback while flying today's MENAGERIE:
  "the beginning is just drones as usual." Root cause: MENAGERIE never got
  round 5's direct-spawn treatment. It was still conscription-based (round
  2's "ambient thin + evolutions frequent" tuning), so the opening was plain
  drones until the ambient crowd built enough mass to fuse, which could take
  well past a minute.
- **MENAGERIE identity: THE ZOO.** Rebuilt on the same direct-spawn
  choreography engine as the four single-kind days (`creatures.ts`), but
  instead of one forced kind, the kind is drawn per event from the seeded
  schedule stream across all four (hunter/lance/wheel/bomb), with
  consecutive-repeat avoidance so the variety actually reads. New override
  flag `menagerieChoreography` (mutators.ts) gates conscription and the
  crowd-pressure valve off exactly like `forceAssemblyKind` does for the
  single-kind days (`enemies.ts`'s `directSpawnActive` now checks either).
  One event = one creature (reusing that kind's own edge geometry,
  member-count range, and telegraph), not a whole wave/salvo like the
  single-kind days, so a MENAGERIE event reads as "one animal fused in,"
  distinct from HUNTING PARTY's packs or LANCER DOCTRINE's salvos.
- **First creature lands fast, on purpose.** New override
  `firstCreatureDelayRange` (seeded `[8, 12]` seconds, drawn once at world
  setup in `initSpawner`) replaces the default near-instant first event
  (every other creature day starts its countdown at 0). This is the
  screenshot moment Lucas was missing: a beat of quiet, then the first
  creature bursts in, generally landing around t=8.4-13.5s once its own
  telegraph (0.4s for hunter/lance/wheel, 1.5s for bomb) is added on top of
  the drawn delay.
- **Cadence + double events.** New `CREATURE_DAYS.menagerie` config:
  interval ramps `[8,10]s` early to `[4,6]s` late (deliberately between the
  four single-kind days' own pacing, not matching any one of them). Late in
  the run, a seeded roll (ramping 0% to 25% by `rampMinutes`) doubles an
  event into two different kinds firing at once, the "menagerie compounding."
  A double forces the second kind's telegraph to resolve strictly after the
  first's (`telegraphFor(kindFirst) + 0.1`) regardless of which two kinds
  are drawn, otherwise a short-telegraph second kind (e.g. hunter, 0.4s)
  could pop in before a long-telegraph first kind (bomb, 1.5s) and land
  next to whatever ended the *previous* event instead of next to its actual
  partner, silently defeating the repeat guard on the visible script. Caught
  this exact failure mode in sim-test (a back-to-back "hunter, hunter" in
  the recorded script) before fixing the ordering.
- **Ambient: a faint trickle, not true zero** (`ambientRateScale: 0.15`,
  vs the four single-kind days' `0`). With the first creature deliberately
  delayed 8-12s, a true-zero opening would sit visually empty for that
  whole window; the faint trickle keeps a few ambient drones on screen
  during the wait without diluting the reveal. Formations stay near-zero
  (`formationIntervalScale: 30`, same as the other creature days): sim
  confirms 0 formations and ~29 ambient spawns vs 29 assemblies over a 180s
  run, creature pressure carries the day including the opening, as required.
- **Tags:** MENAGERIE moves from its old solo `assembly-freq` tag to
  `assembly-kind` (same family as the four single-kind days), since it's now
  a direct-spawn day itself and shouldn't co-occur with any of them on a
  Sunday. TITANFALL's tag list drops the now-dead `assembly-freq` (nothing
  else carries it) and keeps `assembly-kind`, which already excludes
  MENAGERIE under its new tag.
- **Copy:** briefing "The Zoo is open. Every cage, every kind. You never
  know what fuses next." Plain subline: "A brief calm, then hunters, lances,
  wheels, and bombs take turns, drawn at random with no repeats back to
  back. Ambient is a faint trickle, ordinary formations are gone, and late
  in the run two kinds sometimes fuse in at once."
- **Difficulty factor re-tuned 1.2 → 1.1.** Evasive-bot score median across
  several sim-test runs lands close to WHEELHOUSE's (the easiest of the
  direct-spawn days): one creature at a time with seeded variety gives a
  dodging pilot plenty of room. Factor set just above WHEELHOUSE's 1.0.
  Today's medal thresholds shift mid-day as a result; accepted per Lucas
  (today is already a mixed soft-launch day).
- **New World field** `creatureLastKind: AssemblyKind | null`, MENAGERIE-only
  bookkeeping for the consecutive-repeat guard; harmless on every other day
  (`null`, never read).
- **Sim-test additions:** MENAGERIE determinism (script identical across
  "ram"/"drift" play styles, matching the other four creature days),
  kind-variety check (>=3 distinct kinds over a 180s run; typical runs saw
  all four), no-back-to-back-repeat check (this is what caught the ordering
  bug above), and a first-creature-landing-time check (7-14s window, giving
  the telegraph tail some room around the drawn 8-12s). All new checks pass
  cleanly across 5+ consecutive runs. Ad hoc (not in sim-test, checked
  manually): a 300s run with an invulnerable ram bot logs 548 kills (1.83
  kills/sec, well under `validate.mjs`'s `MAX_KILLS_PER_SEC = 12`) and peaks
  at 114 concurrent drones (well under `SPAWNER.maxDrones = 550`).
- **Verification:** `npm run build` green. `npx tsx scripts/sim-test.ts`
  green across 5+ consecutive runs (one run hit the pre-existing
  `pending grab claims the next drop` flake, documented in earlier entries
  as unrelated unseeded-`Math.random` gameplay, unrelated to this change,
  cleared on re-run).

## 2026-08-10d: Daily Mutators LIVE from Aug 10, preview override locked to dev (main, deployed)

- Direct commit to `main` (Lucas explicitly approved, this deploys to prod
  immediately). Two changes:
- **Mutators are live starting today, not tomorrow.** `MUTATORS_START_DATE`
  moved from `2026-08-11` to `2026-08-10` in `mutators.ts`. A plain visit to
  surviveorion.com right now gets today's real hash pick, MENAGERIE (factor
  1.2), full briefing card, and medal thresholds Copper 70k / Silver 155k /
  Gold 360k. Lucas's explicit tradeoff: a handful of pilots flew today's
  vanilla daily before this shipped, so today's board mixes vanilla and
  mutator flights. Accepted, not a bug. The gate only ever suppresses (see
  the doc comment on `MUTATORS_START_DATE`), so moving it doesn't shift any
  future date's pick: 2026-08-11 still resolves to iron-barrage exactly as
  it always did, now covered by a dedicated regression check in sim-test.
- **`?mutator=` preview override restricted to localhost/127.0.0.1.**
  Lucas's concern: with the ids public (they're in this file and in the
  boot console log), anyone could rehearse a specific mutator on demand via
  URL, which kills the everyone-discovers-the-day-together scarcity that's
  the point of a daily. The override in `main.ts` now checks
  `location.hostname` before touching `?mutator=` at all: on a production
  hostname the param is ignored completely (no forced mutator, no briefing
  "PREVIEW" badge, no console id list, the real day loads exactly as
  normal), on `localhost`/`127.0.0.1` (i.e. `npm run dev`) everything works
  exactly as before, unrestricted, for tuning work. All the sandboxing code
  (no attempt spent, no score submitted, no medal recorded) is untouched,
  it's just unreachable on prod now since the override itself never
  activates there.
- Sim-test: the launch-gate section's pre-gate/post-gate dates already
  derive from `MUTATORS_START_DATE` directly, so moving the constant
  automatically retargeted that check to 2026-08-09 (none) / 2026-08-10
  (menagerie) with no test edits needed. Added one new check: 2026-08-11
  still resolves to iron-barrage after the move, proving the gate move
  didn't shift the hash.
- **Verification:** `npm run build` green. `npx tsx scripts/sim-test.ts`
  green (ran 4x; two unrelated pre-existing flakes surfaced across those
  runs, the documented magnet-grab test and a bad-luck-protection power
  distribution check, both unseeded Math.random gameplay checks, neither
  touched by this change, both passed clean on reruns).
- **What a visitor sees right now:** MENAGERIE, briefing "The swarm keeps
  fusing into hunters and worse", subline "Ambient density cut roughly in
  half. Evolutions form more than twice as often.", medal thresholds Copper
  70,000 / Silver 155,000 / Gold 360,000. `?mutator=starfall` on prod now
  does nothing: the param is ignored, the real day (MENAGERIE) loads as
  normal, no PREVIEW badge, no console output.

## 2026-08-10c: Daily Mutators launch-date gate (LAUNCH COMMIT, branch, not merged)

- Still branch `sam/daily-mutators`, still **not merged to main** (Sam does
  that merge). Lucas approved going live, but 3 pilots had already flown
  today's (2026-08-10 UTC) vanilla daily on prod before the feature shipped,
  so today's board needs to stay plain to be fair.
- Added `MUTATORS_START_DATE = "2026-08-11"` in `mutators.ts`, right above
  `getMutatorsForDate`, the obvious place to find/change it later. Any UTC
  date strictly before it makes `getMutatorsForDate` return `[]` (early
  return, before `pickFirst`/`pickSecond` run), so the hash pick for every
  other date is completely untouched: the gate only suppresses, it never
  shifts which mutator lands on which future date. Patrol # numbering
  (`share.ts`, a separate epoch) was never touched by mutator selection to
  begin with, so it's unaffected either way.
- The rest of the app already threads an empty mutator array through
  correctly in most places, but a few spots assumed at least one mutator was
  always active and needed an explicit `mutators.length > 0` gate so a
  pre-launch day looks exactly like pre-mutators prod, not "mutators active
  with a neutral 1.0 factor":
  - `ui.ts` `showDailyLobby`: skips the whole briefing card (mutator rows +
    medal thresholds) when `mutators.length === 0`. `DailyLobbyInfo.medalThresholds`
    is now optional.
  - `main.ts` `showMenu`: only computes `medalThresholds` when there's a
    mutator to compute it from.
  - `main.ts` `showGameOverUi`: `dailyMedal` stays `undefined` (not a
    `{tier: null}` object, which would still render empty medal UI) pre-gate,
    so the game-over screen shows no medal section at all.
  - `main.ts` `onShare`: mutator name line and medal line both drop out of
    the share card pre-gate.
- The `?mutator=` preview override is untouched by any of this: `todaysMutators()`
  still checks `PREVIEW_ACTIVE` first, so `?mutator=starfall` today (still
  2026-08-10 UTC) forces STARFALL for the session same as always, gate or no
  gate. It was already sandboxed from boards/attempts, so there's no fairness
  issue letting it work early.
- Sim-test: added section (g), a small check that the day before
  `MUTATORS_START_DATE` resolves to zero mutators and the gate date itself
  resolves to the normal hash pick. Also had to move the "same mutated day,
  two play styles" determinism check's reference date (`dayA`) from
  2026-08-10 (now pre-gate, would resolve to no mutators and break that
  check's ">3 formations" assumption) to 2026-08-13 (THE FLOOD, post-gate,
  not a creature day so its formation count is still the normal kind of
  "plenty").
- **Verification:** `npm run build` green. `npx tsx scripts/sim-test.ts`
  green across 4 consecutive runs (one run mid-session hit the
  pre-existing, previously documented flaky magnet test, unrelated to this
  change and unseeded by design; reran clean). New gate checks pass: pre-gate
  date -> 0 mutators, gate date (2026-08-11) -> `iron-barrage`.
- **Gate behavior right now:** today, 2026-08-10 UTC, is pre-gate: vanilla
  daily, no briefing card, no medal UI, no medal share lines, matching prod
  exactly (the `?mutator=` override still works for demos). Tomorrow,
  2026-08-11 UTC, the gate opens: normal hash pick (`iron-barrage`), full
  briefing card, medal thresholds, and share lines, no manual flip needed.

## 2026-08-10b: Daily Mutators round 5, creature days rebuilt as direct-spawn choreography (branch, not merged)

- Still branch `sam/daily-mutators`, still **not merged to main**, pushed the
  branch only. Lucas's playtest verdict on HUNTING PARTY: "doesn't feel any
  different, just feels like a lot of hunters at some point. I want the
  mutations to have a real identity." Root cause: round 4's forced-creature
  days still ran on the normal game's conscription rhythm (thin ambient
  drones periodically fusing into a creature), so they inherited the base
  game's pacing instead of having their own.
- **Core mechanic (new): direct-spawn assemblies.** New module `creatures.ts`
  schedules scripted events that materialize an assembly FULLY FORMED via a
  new `spawnAssemblyDirect` (`enemies.ts`): member drones are created at their
  rotated slot positions and bound to the assembly immediately, skipping the
  gather/conscription phase. Slot geometry was factored out of `tryFormAssembly`
  into shared `assemblySlots`/`assemblyRadiusFor` helpers so both paths produce
  byte-identical shapes, and the entire active-phase lifecycle (steering,
  wall-bounce, burst, disband) is 100% reused, untouched, from `updateAssemblies`.
  On a forced-creature day, `updateAssemblies`'s scheduled-evolution and
  crowd-pressure blocks are gated off (`mutatorForceAssemblyKind() !== null`);
  every other day/mode is byte-for-byte unchanged.
- **Determinism, now stronger than round 4's conscription:** event cadence and
  member counts ride the seeded schedule stream (`scheduleRand`), anchor
  positions and headings ride the seeded placement stream (`rand`). Pack/salvo/
  lane size is a pure function of elapsed run minutes (never field state), so
  the number of draws per event is identical for every pilot at a given point
  in the run. Headings are picked from the seed, not aimed at the live ship
  position, since the ship's position is player-dependent; only the hunter's
  ongoing per-tick re-aim while active stays on Math.random (explicitly called
  out as player-dependent, same as normal homing). Added a permanent sim-test
  check per creature day: two wildly different play styles (aggressive ram vs.
  evasive drift) produce byte-identical `time:kind@x,y` event scripts. This is
  new: round 4's conscription-based assemblies were *never* part of the shared
  determinism check (member selection was positional, hence player-dependent);
  round 5's scripted events now are.
- **Per-day choreography** (`CREATURE_DAYS` config in `config.ts`, all ramp
  from an "early" feel to a "late" feel over 3 minutes):
  - **HUNTING PARTY, "wolf packs"**: waves of 2-4 hunter vees (member count
    4-6 each) entering from different edges within a 0.3s stagger, converging
    on the ship via the hunter's existing turn-rate tracking. Wave interval
    ramps 11-14s → 6-8s. Pack size ramps 2 → 4 over the run.
  - **LANCER DOCTRINE, "broadsides"**: salvos of 2-5 parallel lance bars
    (5-8 members each) sweeping in from ONE edge per salvo, staggered 0.4s
    apart (volley rhythm). Salvo interval ramps 9-12s → 5-7s.
  - **WHEELHOUSE, "crossing traffic"**: 1-3 wheels (6-9 members each) rolling
    in from alternating sides of one axis (left/right or bottom/top per
    burst), staggered 0.5s apart, Frogger-style. Lane interval ramps 7-9s →
    3.5-5s.
  - **DEMOLITION DAY, "area denial"**: bomb slabs (5-9 members) materialize at
    a seeded arena point and detonate on the existing fuse/shrapnel timer.
    Deployment interval ramps 7-9s → 3-4.5s; late-game the interval gets close
    enough to the fuse+telegraph lifecycle that multiple bombs are live at
    once, which is the "shrinking safe ground" feel, achieved without any
    field-state-dependent gating (kept the schedule seed-pure).
  - Telegraphs, per kind (task left this "your call"): hunter/lance/wheel get
    a brief 0.4s on-screen flash at the entry point (they're already
    telegraphed by their inbound motion, this is just a beat of warning); the
    bomb gets a 1.5s warning strobe since it has no inbound motion to read.
    New `drawCreatureTelegraphs` in `render.ts`, new `creatureSpawnQueue` on
    `World` (types.ts) holding the pending materializations.
  - All four: `ambientRateScale: 0` (no ambient at all now, no longer needed
    as conscription fuel) and `formationIntervalScale: 30` (ordinary
    formations effectively suppressed within any normal run length). The
    choreography is the whole day, per Lucas's spec.
  - Rewrote briefing + subline for all four, dropped the round-4 "stragglers
    are parts waiting to fuse" framing entirely (no conscription left to
    describe).
- **Round-4 cleanup**: the "ambient rate takes the MAX when a creature day is
  active" combine rule existed only to protect conscription's fuel supply.
  Direct-spawn removed that need, so `mutatorAmbientRateScale()` is back to
  plain `scaleOf` (multiplicative). Re-verified the Sunday pairing edge case
  (a zero-ambient formation day + a creature day): both sides now want zero,
  the product is zero, which is exactly what both want; no special-casing
  needed. Updated the round-4 sim-test checks for the new expected behavior
  (creature days now assert zero ambient instead of a nonzero trickle) and
  added `formations <= 1` as an explicit near-zero-formations check.
- **Re-tuned difficulty factors** using the evasive bot's score medians
  (relative to its no-mutator baseline, since bot medians move around
  slightly run to run given real unseeded Math.random gameplay):
  hunting-party 0.75 (survives shortest, lowest score, packs kill members
  one at a time rather than in a batch), lancer-doctrine 0.95 (roughly at
  baseline), wheelhouse 1.0 (highest score of the four: lanes give the most
  room to graze safely while still crossing danger), demolition-day 0.9.
- **Anti-cheat / population check** (ad hoc script, not a permanent test,
  same methodology as round 2/3's OVERCHARGE/STARFALL ceiling checks): a
  maximally aggressive run (permanent starshell + shield, ramming everything)
  over 5 minutes on each of the four days produced 1.1-3.6 kills/sec, far
  under `server/validate.mjs`'s `MAX_KILLS_PER_SEC = 12` ceiling, and peak
  concurrent drone counts of 17-126, far under `SPAWNER.maxDrones = 550`.
  `spawnAssemblyDirect` also carries its own `maxDrones` safety guard
  (mirrors `spawnAt`'s), astronomically unlikely to trigger given near-zero
  ambient on these days.
- **Manual sanity**: the `?mutator=` preview override's browser tool was
  unavailable this session (repeated `browser_navigate` calls errored with
  "no browser tab available" even after creating a tab explicitly; stopped
  after 4 attempts per the tool's own guidance rather than rabbit-holing).
  Substituted a direct event-trace of HUNTING PARTY over 90s on a fixed seed,
  which is arguably a stronger check than an eyeball pass: it confirmed waves
  of 2-3 hunter vees arriving from different edges within ~0.3-0.6s of each
  other, wave gaps of 8.6-13.2s (a clear "beat of silence" between packs),
  and pack size visibly growing from 2 to 3 members over the run, matching
  the "wolf pack" design exactly. Recommend Lucas spot-check the visual feel
  on the test link once it redeploys, since a script-level trace can't judge
  "does this read well on screen."
- **Verification**: `npm run build` green. `npx tsx scripts/sim-test.ts`
  green across 4 consecutive runs (one earlier run hit the pre-existing
  unseeded flake noted in round 4, `pending grab claims the next drop`/
  `bad-luck protection`, unrelated to this round). New checks: per-day
  choreography determinism (event script identical across play styles) for
  all four creature days, choreography event counts over a 180s run
  (HUNTING PARTY 58, LANCER DOCTRINE 79, WHEELHOUSE 63, DEMOLITION DAY 31),
  zero-ambient + near-zero-formations assertions for all four, the
  simplified Sunday-pairing resolution, and four new evasive-bot fair-fight
  call-outs.
- **Nothing touched**: `SCORING` in `config.ts`, `server/validate.mjs`,
  GREAT WALL / YEAR OF THE SERPENT (unaffected, still round 4's zero-ambient
  scripted-formation design), every other mutator, Classic/Iron Rain/Training
  Ground.
- Nothing escalated this round; every design call (telegraph style per kind,
  ambient/formation suppression level, bomb concurrency via interval alone
  instead of state-dependent gating) stayed inside the brief's explicit "your
  call, tune the numbers" latitude.

## 2026-08-10a: Daily Mutators round 4, pattern/creature days purified (branch, not merged)

- Still branch `sam/daily-mutators`, still **not merged to main**, pushed the
  branch only. Lucas's playtest note: pattern-specific days still had normal
  lone ambient drones diluting the identity, wanted them "purer."
- **GREAT WALL / YEAR OF THE SERPENT (forced-formation days)**: `ambientRateScale`
  dropped from 0.4 to a literal `0`. Only the scripted formations spawn now;
  their members still release to normal homing after their sweep (untouched
  in `handleFormations`), so the organic accumulation stays intact, only the
  ambient *trickle* is gone. The opening burst in `initSpawner` (previously a
  flat 5 drones on every Classic-family run, unconditional on any ambient
  override) now scales by `mutatorAmbientRateScale()` too, so it goes to zero
  right alongside the trickle instead of quietly ignoring the override.
- **Opening-empty risk, found and fixed**: with ambient at zero, the run's
  only cover is the first formation, and two bugs made that unreliable
  before this round even shipped: (1) `rollFormationKind`'s `minMinutes`
  ramp-gate (heavier patterns unlock over real time) was still being applied
  on top of a mutator's *fully replaced* weight table, and YEAR OF THE
  SERPENT's only allowed kind (serpent) gates at 18s, with nothing else in
  the pool to fall back on: every formation attempt before minute
  0.3 silently fizzled (empty weighted pool, no crash, just nothing spawns)
  and the true first serpent could take up to 18s to land. Fixed by bypassing
  the `minMinutes` gate whenever a mutator has replaced the weight table
  outright (same treatment Iron Rain's pinned-minutes already gets, on the
  reasoning that the day's own curated diet already IS the gate). (2) Added
  a new `firstFormationDelayCap` override (GREAT WALL and SERPENT both set it
  to 4s) that clamps the very first formation's delay via `Math.min`, so the
  opening never sits empty waiting on the natural 4.5-6.5s range. Verified
  directly: with the fix, GREAT WALL's first formation is `wall @ t=4.02`
  and SERPENT's is `serpent @ t=4.02`, every trial, 10-11 drones on screen at
  4 seconds in. Added a permanent sim-test regression check for this
  (`GREAT WALL/YEAR OF THE SERPENT: opening formation lands fast and
  resolves (no empty-pool fizzle)`), since both bugs would otherwise have
  been invisible to the existing "boots and survives 60s" pool check.
- **LANCER DOCTRINE / WHEELHOUSE / HUNTING PARTY / DEMOLITION DAY
  (forced-creature days)**: ambient can't go to zero here, assemblies
  conscript members *from* the free ambient pool (`tryFormAssembly`'s
  `gatherRadius` scan in `enemies.ts`); zero ambient means zero creatures and
  the fusion is the whole telegraph. Added `ambientRateScale: 0.5` to all
  four (previously unset = normal density, which is exactly what Lucas
  flagged). Sim-tested over a 120s run: each of the four still produces
  6-11 assemblies (`lancer-doctrine`, `wheelhouse`, `hunting-party`,
  `demolition-day` all `>0`, comfortably frequent) while keeping a real
  ambient trickle (54-60 ambient-spawn events, never zero), so conscription
  keeps working and the field between evolutions reads sparse. Did not also
  raise `assemblyIntervalScale`: the existing cadence (roughly one
  evolution every 12-20s) already reads clearly creatures-first once the
  background is this thin, no need to force it further. Plain-language
  sublines rewritten to frame the remaining strays as raw material ("the
  stragglers are parts waiting to fuse").
- **Sunday pairing edge case, handled explicitly**: GREAT WALL/SERPENT
  (`formation-kind`/`density` tags) and the four forced-creature days
  (`assembly-kind` tag) share no exclusion tag, so a Sunday can legally pair
  a zero-ambient formation day with a creature day. Multiplying their rates
  together would land on exactly zero regardless of the creature day's own
  (already-cut) demand, silently killing conscription. `mutatorAmbientRateScale()`
  now checks whether any active mutator is a "creature day" (defined as
  `forceAssemblyKind !== undefined`, a clean semantic hook rather than an id
  list) and, if so, takes the **max** of the active `ambientRateScale`
  values instead of the product ("most permissive wins"); with no creature
  day active, the combine stays multiplicative as before (verified: RED
  ALERT × ARSENAL still stacks to `1.375`, unchanged). Verified the actual
  edge case directly: `setActiveMutators([great-wall, lancer-doctrine])`
  resolves to `0.5` (lancer's own rate), not `0`. Both directions covered by
  new sim-test checks.
- **New test-only event** (`ambientSpawn`, pushed once at the top of
  `spawnAmbient` in `enemies.ts`): needed a way to positively assert "zero
  ambient spawns happened," since the existing `droneSpawn` event only fires
  for the telegraph-pop half of ambient spawns, not the edge-sneak half.
  Same pattern as round 3's `pickupSpawn`: declared in `types.ts`, never
  handled in `main.ts`'s `drainEvents`, so it's inert in the real game (no
  visual/audio change), only consumed by `sim-test.ts`.
- **Difficulty factor re-tune** (all six days; task's framing: fewer drones =
  fewer kill/graze opportunities = lower score potential, so factors move
  down from their round-1/2 values):
  - GREAT WALL: 1.15 → **0.85**. YEAR OF THE SERPENT: 1.1 → **0.8** (a
    serpent is a single-file train, narrower simultaneous kill cluster than
    a wall spanning the whole edge). Note: the evasive (dodge-only, never
    attacks) bot's own SCORE median for these two actually came in *above*
    baseline (e.g. one run: GW 120pts vs 57pts baseline), that's a graze
    artifact of a passive bot surviving a long time next to slow-moving
    walls/trains without ever killing anything, not a real scoring profile.
    Didn't trust it for these two; went with the reasoned direction instead
    (fewer total kill targets over a real offensive run) and said so.
  - LANCER DOCTRINE: 1.05 → **0.9**. WHEELHOUSE: 1.05 → **0.95**. HUNTING
    PARTY: 1.1 → **0.85** (bot's score median consistently lowest of the
    four: hunters close in and die one at a time rather than sweeping
    through in a killable batch). DEMOLITION DAY: 1.05 → **1.0** (bot's
    score median consistently highest: a fragmented bomb burst offers the
    most simultaneous graze surface). These four's bot-score ranking was
    stable enough across repeated runs to trust for relative ordering, even
    though absolute numbers are noisy (unseeded Math.random gameplay).
  - Re-checked the evasive-bot playability bar for all six across several
    repeated `sim-test` runs: comfortably clear every time (GREAT
    WALL/SERPENT medians 22-27s, the four creature days 14-20s, vs a
    ~5.3-6.0s bar and a baseline around 13-15s). If anything these two
    zero-ambient days got *easier* to survive for a passive bot, expected
    given "fewer things trying to kill you," the factor cut compensates on
    the scoring side, not survival.
- **Verification**: `npm run build` green. `npx tsx scripts/sim-test.ts`
  green, run ~20 times in a row to check the new checks and the (unseeded)
  evasive-bot numbers for stability; one unrelated pre-existing flake hit
  once (`pending grab claims the next drop`, the magnet power test in
  section 3b, unseeded `Math.random` gameplay, not touched by this round,
  not reproducible on reruns), noted, not fixed, out of scope. New checks
  added: opening-formation-lands-fast for both formation days, zero
  ambient-spawn events for both formation days, nonzero assemblies + nonzero
  ambient trickle for all four creature days, and both directions of the
  ambient-rate combine rule (creature-day-active → max; no-creature-day →
  still multiplicative).
- No SCORING/`server/validate.mjs` changes (the score-side effect here is
  entirely via the existing difficulty-factor knob, same mechanism as every
  prior round). No em dashes.

## 2026-08-09e: Daily Mutators, ?mutator= preview override for playtesting (branch, not merged)

- Still branch `sam/daily-mutators`, still **not merged to main**, pushed the
  branch only. Lucas needed to playtest specific mutators on the test link
  instead of waiting for the date-hash pick, so `main.ts` now reads
  `?mutator=<id>` (or `?mutator=<id1>,<id2>` to preview a Sunday-style
  double) and forces it for the session, wherever Daily Patrol mutators
  normally apply.
- **Sandboxed by construction**: every call site that would spend a daily
  attempt (`useDailyAttempt`, the `dailyAttemptsLeft() <= 0` lockouts),
  submit a score (`submitRun`), or record a local best/medal
  (`recordDailyResult`) checks `PREVIEW_ACTIVE` first and skips it. Verified
  end to end with a headless Playwright run through a full launch → death →
  game-over cycle: `localStorage`'s daily-attempts record stayed untouched
  (`used: 0`, `best: null`) through the whole run.
- Lobby card gets a red "PREVIEW" badge (`.preview-badge` in `style.css`,
  `mutatorBriefingCard` in `ui.ts`) and the attempt-pips row is replaced with
  "unlimited attempts, not scored"; Launch always shows regardless of the
  real budget. Game-over still computes and shows the medal this run's own
  score would earn (against the forced mutator's thresholds), it just
  doesn't fold that score into the real best-of-day. The "DAILY PATROL" tag
  reads "DAILY PATROL PREVIEW" and the retry button drops to the
  uncapped "Fly again: Daily Patrol" style (no fake attempt count). Share
  card gets a "PREVIEW (not scored, not submitted)" line and drops the
  attempt-count line, since neither means anything for a preview run.
- Unknown ids are dropped silently (`getMutatorById` returns undefined,
  filtered out); if nothing valid survives, `todaysMutators()` falls back to
  the real date-hash pick, verified with `?mutator=bogus-id` resolving to
  the same mutator as no override at all, no crash. No exclusion-tag
  compatibility check runs on the override itself (unlike the real Sunday
  picker) since forcing an odd combo on purpose is sometimes the point of a
  rehearsal; extra ids past the first two are dropped.
- Not gated behind `import.meta.env.DEV`, this is safe to leave live in
  production since a preview run can't touch boards, streaks, or attempts,
  so it doubles as an always-available rehearsal tool. Prints the forced
  mutator(s) plus the full list of valid ids to the console on boot whenever
  the override is active.
- Verification: `npm run build` green, `npx tsx scripts/sim-test.ts` green
  (untouched by this change). Manual check: headless Playwright against the
  dev server confirmed `?mutator=starfall` renders the PREVIEW badge,
  STARFALL's briefing/subline/thresholds, and "unlimited attempts, not
  scored"; `?mutator=starfall,giants` renders both; `?mutator=bogus-id` and
  no override both fall back to the same real mutator with no page errors; a
  full played-out run showed "DAILY PATROL PREVIEW · STARFALL", a correct
  "N pts to COPPER" hint matching this run's own score against STARFALL's
  thresholds, and an unchanged (empty) local daily-attempts record after.
- Valid mutator ids (also printed on boot when the override is active):
  `blackout, red-alert, the-flood, great-wall, year-of-the-serpent,
  menagerie, lancer-doctrine, wheelhouse, hunting-party, demolition-day,
  titanfall, arsenal, overcharge, cryo-winter, iron-barrage, singularity,
  starfall, the-pit, giants, minefield, solar-wind, magnetic-field`.
- URL format: `https://<site>/?mutator=<id>` or `?mutator=<id1>,<id2>`, works
  on both the daily-only root and `/fullgame?mutator=...&fullgame=1` (the
  override only changes anything once a Daily Patrol run actually starts).
- Nothing escalated this round.

## 2026-08-09d: Daily Mutators round 3, STARFALL environmental rework + medals switch to score (branch, not merged)

- Still branch `sam/daily-mutators`, still **not merged to main**, pushed the
  branch only (`surviveorion-test` auto-deploys from it).

- **STARFALL reworked from monopower-Meteor-Storm into an environmental event
  day (item 1)**. New module `src/starfall.ts`, fully gated behind
  `mutatorMeteorRainActive()` (true only when STARFALL is active), zero effect
  on any other day or mode:
  - Only power drop all day is Shield (`monoPowerWeights("shield")`), with
    `pickupIntervalScale: 0.8` so shields come a bit more often, the day's
    sole defense.
  - Constant meteor rain for the whole run: cadence ramps from one every ~4s
    at minute 0 to one every ~1s by minute 3.5 (`STARFALL_RAIN` in
    `config.ts`, uses the existing `ramp()` helper), ±15% schedule-stream
    jitter so it doesn't feel metronomic.
  - Each meteor telegraphs a 1-2s ground reticle (schedule-stream draw for
    duration, placement-stream draw for x/y) before striking; new
    `drawMeteorTelegraphs` in `render.ts` draws converging rings + a pulsing
    crosshair in the mutator's meteor palette.
  - Impacts kill drones and mines in radius (reuses `killDronesInRadius`/
    `killMinesInRadius`) **and now threaten the ship**: `spawnBlast` gained an
    optional `lethalToShip` flag (`powers.ts`/`types.ts`), STARFALL's strikes
    set it, and `gameState.ts` got a new `handleShipBlastCollisions` pass
    (mirrors the existing ship-vs-drone invuln/shield logic) so a direct hit
    costs the run unless a banked shield eats it. Checked first: existing
    blasts (shockwave, meteor-storm power) only ever killed drones/mines, the
    ship side didn't exist before this, so the new lethality is scoped
    strictly to blasts that opt in (`lethalToShip: true`), i.e. STARFALL's
    rain only. Every other blast-spawning power is unaffected.
  - Determinism: exactly 2 schedule-stream draws (interval, warning duration)
    + 2 placement-stream draws (x, y) per meteor, same fixed-draws-per-event
    discipline as `spawnTelegraphs` in `enemies.ts`. New sim-test check
    confirms an identical meteor-impact script (position + timing) across
    differently-played runs on the same day.
  - Evasive bot: extended `evasiveHeading` to repel from `world.meteorTelegraphs`
    (urgency-weighted, stacks with existing drone/mine avoidance) so the
    playability check reflects a reticle-aware dodge, not a blind one. Result:
    median 13.4s survival, same as the no-mutator baseline (13.4s), with score
    roughly 1.8x baseline (135 vs 74 sim-bot points, free meteor kills). New
    briefing: "The sky itself is falling. Shields up, pilot." Plain subline:
    "A constant meteor rain falls all run, each impact flashed by a ground
    reticle first. The only drop is Shield, a little more often."

- **Medals switched from survival time to score (item 2)**, Lucas's call:
  score is on-screen and actionable mid-run (grazing/kills/multiplier push it
  at equal survival time), and isn't monotonic with time, today's live board
  had 105-121s survival times mapping to 279k-520k scores in the "wrong"
  order.
  - `medals.ts` rewritten: `MEDAL_BASE_SCORE` replaces the old
    `MEDAL_BASE_SECONDS`, rounding is now `roundTo5k` (nearest 5,000),
    `medalForTime` → `medalForScore`, `nextMedalHint` now reads "N pts to
    SILVER" instead of "Ns to SILVER". Per-mutator `difficultyFactor` is
    unchanged in meaning (still multiplies the base, still >1 harder / <1
    easier) and unchanged in value for every mutator except STARFALL (see
    below), since round 2's factors were already vetted by Lucas for feel and
    the score/time ordering they encode (crowd days harder, fun days easier)
    carries over fine to score.
  - **Base calibration**: used the live pre-mutator board (3 real pilots,
    279k/375k/520k at 105-121s, i.e. today's factor-1.0 reference) plus the
    sim bot's score output. Landed on Copper 60,000 / Silver 130,000 / Gold
    300,000. Copper sits well under a casual run (sim baseline bot alone
    scores ~74-94 pts with zero player skill; a real casual pilot clears 60k
    comfortably), Silver demands a solid run, Gold sits at the bottom of that
    day's real top three so it stays "genuinely good" rather than a rubber
    stamp for the board's leaders. These are three constants
    (`MEDAL_BASE_SCORE` in `medals.ts`) specifically so Lucas can re-tune
    after a week of real score data without touching anything else.
  - **STARFALL's factor** eased from Meteor-Storm-era 0.75 to 0.8: the new
    mechanic hands out free kills (score up) while holding survival flat vs
    baseline per the evasive bot, so it lands in the "fun/spectacle, mildly
    easier" bracket alongside ARSENAL/OVERCHARGE rather than the harder
    crowd-day bracket it inherited by accident from the old monopower design.
  - **MAGNETIC FIELD** keeps its existing 0.85 factor unchanged. Its sim-bot
    score median is a 100x+ outlier (14,322 pts) because the passive bot
    parks near homing pickups all game; a real pilot doesn't get anywhere
    close to that, so the bot number isn't a usable score signal for this one
    and the factor stays keyed to its original design intent (generous, fun
    day) instead.
  - `save.ts`: `DailyAttempts.bestTime` removed (score is now the only medal
    currency, keeping two "best" fields around would just invite drift),
    `dailyBestTimeToday()` replaced with `dailyBestScoreToday()`.
  - `main.ts`/`ui.ts`: game-over hint and lobby/share cards now read off
    `dailyBestScoreToday()` + `medalForScore()`; added `fmtScoreShort` (60k
    style) for the lobby briefing card's threshold row so it stays tight on
    phones.
  - Anti-cheat ceiling check (`server/validate.mjs`'s
    `kills > timeSurvived * MAX_KILLS_PER_SEC` at 12/s, checked the same way
    as OVERCHARGE in round 2): average kills/timeSurvived across 90s runs,
    5 seeds, invulnerable stationary bot: baseline 3.6-4.8/s, STARFALL
    3.4-4.0/s (STARFALL trends *below* baseline: swapping out the drop pool
    for Shield-only removes several kill-heavy incidental power pickups the
    baseline observer benefits from), OVERCHARGE 3.7-4.9/s. All comfortably
    under the 12/s ceiling; nowhere close to a flag risk. (A rolling 5s-window
    peak-rate probe run first hit up to 26/s on some seeds for *baseline
    too*, before realizing the server check is on the whole-run average, not
    a rolling peak, redid the check against the real formula.)

- Sample week (2026-08-10 through 2026-08-16), score thresholds
  Copper/Silver/Gold:
  - Aug 10 MENAGERIE: 70,000 / 155,000 / 360,000
  - Aug 11 IRON BARRAGE: 55,000 / 125,000 / 285,000
  - Aug 12 WHEELHOUSE: 65,000 / 135,000 / 315,000
  - Aug 13 THE FLOOD: 55,000 / 125,000 / 285,000
  - Aug 14 SINGULARITY: 50,000 / 110,000 / 255,000
  - Aug 15 GIANTS: 60,000 / 130,000 / 300,000
  - Aug 16 DEMOLITION DAY + ARSENAL (Sunday, double): 55,000 / 115,000 / 270,000
  - STARFALL (any day it lands): 50,000 / 105,000 / 240,000

- Verification: `npm run build` green, `npx tsx scripts/sim-test.ts` green,
  including new STARFALL determinism check (identical meteor script across
  play styles), STARFALL cadence-ramp sanity check, score-based medal
  threshold sanity check, and the STARFALL-specific evasive-bot playability
  check.
- Nothing escalated this round; both items shipped as specced.

## 2026-08-10: static cache policy so deploys reach players without a hard refresh (Sam, inline)

- Right after the mutators launch Lucas still saw the old build. Cause: `serveStatic`
  sent no Cache-Control and no validators at all, so browsers cached index.html on
  their own heuristics and kept referencing the previous hashed bundle after a deploy.
- Fix in `server/index.mjs` `serveStatic`: `/assets/*` (Vite-fingerprinted) gets
  `public, max-age=31536000, immutable`; `.html` (including the SPA fallback) gets
  `no-cache` so every load revalidates; everything else (icons, music, manifest)
  gets `public, max-age=3600`. Added `Last-Modified` + `If-Modified-Since` 304
  handling so the revalidation is a header-only round trip.
- Verified locally on all three tiers plus the 304 path. Players with an already
  stale cached HTML self-heal when their heuristic TTL lapses (or on one manual
  refresh); from this deploy on, new HTML is picked up on the next load.

## 2026-08-09c: evasive-bot baseline bar loosened 12s to 8s (addendum, Sam)

- The round-2 baseline sanity check (`baselineMedian >= 12`) sat exactly at the
  bot's observed median (11.9-14s across runs) and flaked in Sam's independent
  verification. The check only guards against a broken harness bot, so the bar
  now sits at 8s, below normal variance, above genuine breakage.

## 2026-08-09b: Daily Mutators round 2, tuning fixes + pool expansion (branch, not merged)

- Lucas playtested round 1 on the test link and loved the concept ("very fun
  to have a new mode like that every day"), then gave item-by-item tuning
  feedback. Still branch `sam/daily-mutators`, still **not merged to main**,
  pushed the branch only (`surviveorion-test` auto-deploys from it).
- **BLACKOUT (item 1)**: "maybe too hard". Tried both options from the brief;
  the evasive-bot harness (new this round, see below) showed pure
  telegraph-off hitting real survival, so kept telegraphs on but cut their
  warning time to ~1/3 (`telegraphDurationScale: 0.36`, ~0.5s instead of
  1.4s). New briefing "The sirens are slow tonight." Factor eased 1.15 → 1.1.
- **OVERDRIVE → RED ALERT (item 2)**: reworked to tempo-only. Spawn rate,
  formation frequency, and pickup interval all sped up; `droneSpeedScale`
  removed entirely so drone speed stays normal (klaxon-panic, not
  twitch-speed, per the brief). Added a cheap cosmetic pulsing red vignette
  (`render.ts`, gated on `world.daily && phase==="playing"`, no gameplay
  state, safe for the daily determinism scripts).
- **THE FLOOD (item 3)**: added the evasive-bot playability harness Lucas
  asked for (section 10 in `sim-test.ts`, a repulsion dodger with no powers,
  unseeded on purpose since it's testing playability not determinism) and
  required every mutator to clear a floor relative to the no-mutator
  baseline. Retuned FLOOD: ambient rate down (1.6 → 1.3), added a tighter
  ambient soft cap (`ambientSoftCapScale: 0.7`, this also surfaced that
  `SPAWNER.ambientSoftCap` was defined but never actually wired into any
  spawn call before now, fixed that plumbing in `enemies.ts` so it only
  engages when a mutator asks for it), bigger clump grouping
  (`clumpMaxScale: 1.6`, same density gathered into fewer/bigger blobs with
  real lanes between them), plus a touch more pickup support. Evasive-bot
  median ~12-14s vs. baseline ~13-14s across repeated runs, a fair current,
  not an instant-death trap.
- **WARGAMES → GREAT WALL + YEAR OF THE SERPENT (item 4)**: "not sure what
  this is" (illegible identity), replaced with two self-explanatory
  forced-formation days. GREAT WALL locks the formation diet to
  wall/megawall/pincer ("Today the enemy builds walls. Find the gaps.").
  YEAR OF THE SERPENT locks it to serpent trains only. Both tagged
  `formation-kind` (mutually exclusive with each other) and `density`
  (mutually exclusive with THE FLOOD, opposite identity).
- **MENAGERIE (item 5)**: sharpened so it reads in the first minute. Ambient
  rate cut harder (0.85 → 0.55) and assembly interval tightened further
  (0.45 → 0.35) so the thinner swarm makes the much-more-frequent evolutions
  the obvious main event. New briefing: "The swarm keeps fusing into hunters
  and worse." Factor raised 1.1 → 1.2.
- **ARSENAL (item 7)**: kept as-is (liked), added the requested **OVERCHARGE**
  variant: normal drop rate, every power's magnitude amplified 1.4x
  (shockwave radius, missile count, arc jump radius, cryo radius/duration,
  autocannon fire rate, meteor interval + a fragmented second explosion,
  pulse projectile radius), via one `powerAmpScale` knob read across
  `powers.ts`. Checked against `server/validate.mjs`'s `MAX_KILLS_PER_SEC`
  (12) with the same invulnerable-observer harness used for WARGAMES in
  round 1: OVERCHARGE averaged ~6.8 kills/sec over 4 minutes vs. a ~6.6
  no-mutator baseline in the same harness, nowhere near the ceiling (the
  amplification is magnitude not rate, so it barely moves the sustained
  average). Worst mutator in the whole pool by this measure was GREAT WALL
  at ~8.2 kills/sec, still well under 12. No exclusions needed.
- **New mutators (item 8)**, all shipped:
  - **SOLAR WIND**: constant per-day crosswind pushing ship and every drone
    the same way. Direction comes from a hash of the UTC date string (same
    "deterministic from the date, no stream draw" trick the mutator
    selection itself uses), not a seeded-stream draw, so it sits outside the
    seeded-draw-count discipline entirely rather than resting on "one fixed
    draw threaded correctly through every call site". Applied as a pure
    per-frame positional nudge in `ship.ts`/`enemies.ts`. Tagged
    `arena-size` too (excluded from THE PIT: a shrunk arena plus a crosswind
    pinning you against closer walls tested as too much stacked at once).
  - **TITANFALL**: evolutions much rarer (interval x2.4), much bigger
    (member count x1.8), capped at 1 concurrent. Boss-hunt read. Tagged
    `assembly-kind` + `assembly-freq` (excludes the forced-kind days and
    MENAGERIE, since it's both a frequency and a scale change).
  - **STARFALL**: monopower day, every drop is Meteor Storm. Spectacle,
    reuses the existing mono-power weight helper.
  - **MAGNETIC FIELD**: verified pickup drift is pure post-spawn kinematics
    with zero RNG involved (not riding the seeded streams), so a gentle
    ship-homing pull layered on top is determinism-safe. Pickups slowly
    drift toward the ship all day on top of normal wander. Reads as a fun
    day (0.85 factor); evasive-bot median came back the highest in the pool
    (~21-24s vs. ~13-14s baseline), confirming it as the intended pure-fun
    outlier.
- **Legibility (item 9)**: every mutator in the pool (22 total, up from 16)
  now carries a `subline`, a second plain-language line under the flavor
  briefing stating mechanically what changed (e.g. "Spawn rate, formation
  frequency, and pickup drops all sped up. Drone speed is unchanged.").
  Rendered in `ui.ts`'s briefing card, new `.mutator-subline` style in
  `style.css` (dimmer, smaller than the flavor line, still centered and
  tight on phones). Game-over tag and share card left as-is (already
  generic over `mutator.name`, nothing to update).
- **Determinism bug found and fixed**: while retuning MENAGERIE, hit a
  determinism-test failure isolated to `assemblyIntervalScale`. Root cause
  was in the test harness, not the game: `sim-test.ts` recorded dropped
  powers by scanning `world.pickups` after each tick, so a pickup that
  spawned and got instantly self-collected by one of the synthetic bots in
  the same tick (a quirk of the ram/drift test bots, not a real player) just
  vanished from the recorded script for that style, producing a false
  mismatch. Fixed at the source: `pickups.ts` now fires a `pickupSpawn`
  event the moment a pickup is created (new event type in `types.ts`,
  harmless if unhandled elsewhere), and both `sim-test.ts` recorders now
  read that event instead of scanning `world.pickups` post-tick. Confirmed
  real Daily Patrol pickup placement was never affected (position is
  ship-independent on daily runs already, see the "first candidate wins"
  comment in `pickups.ts`); this was purely a test-measurement artifact.
- Also noticed (pre-existing, unrelated to this branch): a handful of
  `sim-test.ts` checks that use unseeded `Math.random()` (assembly burst,
  magnet pending-grab, serpent-follow, drone-population-cap) can very rarely
  flip on an unlucky roll, roughly 1 in 20-30 runs, reproduced at the same
  rate on the unmodified round-1 baseline. Not something this branch caused
  or is fixing; flagging for awareness only.
- **Verified**: `npm run build` (tsc + vite) green. `npx tsx
  scripts/sim-test.ts` green, reran repeatedly clean including the new
  evasive-bot section; every one of the 22 pool mutators clears the
  playability floor. No em dashes in any new copy or comments (scanned the
  full diff for this round).
- Open items for Lucas/Sam: none blocking. (1) OVERCHARGE/STARFALL both
  cleared the kill-rate ceiling with real margin, no tone-down needed;
  (2) the pre-existing test flakiness noted above is worth a look someday
  but is out of scope here; (3) medal-calendar/server persistence remains
  intentionally out of scope, same as round 1.

## 2026-08-09 — Daily Mutators + Medals for Daily Patrol (branch, not merged)

- Lucas's ask (via Sam): make every Daily Patrol feel DIFFERENT to play, not
  just harder, and give it a legible skill target. Two systems, both
  Daily-Patrol-only (Classic/Iron Rain/Training untouched), both deterministic
  from the UTC date so every pilot on today's seed sees the identical script.
  On branch `sam/daily-mutators`, **not merged to main** (Lucas wants a test
  link first), pushed the branch only.

- **Daily Mutators (`src/mutators.ts`, new)**: a named set of config-value
  overrides (never logic that changes seeded-draw counts) picked by a
  deterministic hash of the UTC date, same derivation family as the daily
  seed. One mutator on weekdays, two compatible ones (tag-excluded, e.g. two
  arena-size or two monopower days can't co-occur) on UTC Sundays. A cheap
  yesterday-hash check steps the pick forward once to avoid an immediate
  repeat. 16 mutators shipped (target was ~14):
  BLACKOUT (1.15, telegraphs off), OVERDRIVE (1.05, tempo/spawn/pickup pace
  up ~20%), THE FLOOD (0.9, formations way down, ambient way up), WARGAMES
  (1.15, ambient way down, formation interval way down, wall/serpent/pincer
  weighted), MENAGERIE (1.1, assemblies much more frequent), LANCER DOCTRINE /
  WHEELHOUSE / HUNTING PARTY / DEMOLITION DAY (1.05/1.05/1.1/1.05, every
  assembly forced to one kind), ARSENAL (0.85, pickup interval halved, a fun
  power-fantasy day, not a hard one), CRYO WINTER / IRON BARRAGE (0.9/0.95,
  monopower days via `POWER_SPAWN_WEIGHTS`-style overrides that zero every
  other candidate so bad-luck-protection demotion can't fight the guarantee),
  SINGULARITY (0.85, unbenches Vortex for the day and weights it high,
  verified via sim it opens/absorbs/collapses cleanly), THE PIT (1.2, view
  scaled to 0.72, a real arena-size shrink, not just a camera crop), GIANTS
  (1.0, zero-width scale clamp at 1.6 neutralizes the size-speed lerp so
  `droneSpeedScale` alone makes them slower, bigger only, per the phone
  visibility note in AGENTS.md), MINEFIELD (1.1, mine interval way down).
  Wiring: `enemies.ts` (ambient rate, drone speed, scale clamp, telegraph
  ratio, formation weights/interval, assembly interval/forced kind),
  `pickups.ts` (pickup interval, extra power ids, power weights),
  `mines.ts` (mine interval), `main.ts` (`setActiveMutators`/
  `clearActiveMutators` around daily/non-daily world creation and on every
  menu/tutorial transition so state never bleeds, `mutatorViewScale()` scales
  `createWorld`/`resizeWorld`'s viewW/viewH for the daily run).
- Checked every mutator against `server/validate.mjs`'s anti-cheat ceilings
  (`MAX_KILLS_PER_SEC` 12, the score-ceiling formula) before including it.
  None touch `SCORING`, and even WARGAMES's dense set-piece diet (the
  highest-kill mutator in testing) stayed at ~4.5 kills/sec average against a
  scripted invulnerable observer, nowhere near the ceiling. No exclusions
  needed on ceiling grounds.
- **Daily Medals (`src/medals.ts`, new)**: Copper/Silver/Gold thresholds on
  SURVIVAL TIME (legible, immune to scoring tuning), base 60s/120s/200s times
  the day's combined mutator difficulty factor (Sundays multiply both),
  rounded to 5s. Client-side only (`save.ts`'s `DailyAttempts` gains
  `bestTime`, tracked independently of the score-picked `best` since the
  longest flight isn't always the highest score,
  `dailyBestTimeToday()` helper), no server schema change, no new endpoints,
  per Sam's instruction (calendar/persistence is a later phase).
- **UI**: daily lobby gets a briefing card (`Ui.mutatorBriefingCard`) under
  "PATROL #N" showing today's mutator name(s), one-line briefing(s), and the
  day's medal thresholds (Cu/Ag/Au pips), styled to match the existing gold
  and red card look. Game-over screen shows the mutator tag and either the
  earned medal (glowing, gold pulses) or a "Ns to SILVER" style hint toward
  the next tier, both computed from `dailyBestTimeToday()` so they reflect
  the day's best attempt, not just this run's. `src/style.css` gets
  `.mutator-card`, `.medal-thresholds`/`.medal-pip`, `.medal-earned`
  (per-tier color).
- **Share card (`src/share.ts`)**: "ORION Daily #N" becomes "ORION Patrol #N"
  (the existing July 14, 2026 daily-site-launch epoch is reused, not a new
  one, same feature, same numbering), plus a mutator-names line and a medal
  emoji line, still a tight pasteable block, no em dashes anywhere in the
  new copy.
- **TODAY'S BOARD** (daily lobby inline leaderboard): left untouched. Its
  rows only carry `score` (`DailyBoardRow` in `ui.ts`, backed by
  `dailyLeaderboardCombined()` server-side), no survival time, so there is
  nothing to compute a time-based medal glyph from without a server change.
  Flagging this per the task's own "skip and note" instruction rather than
  guessing at a score-based proxy.
- **`scripts/sim-test.ts`**: new section covers (a) a mutated day's script is
  byte-identical across two very differently-played runs (ram vs. drifting
  shield pilot): formations, power drops (kind + position), and mines all
  match; (b) two different days land different mutators within 30 days and
  produce different scripts; (c) every pool mutator boots, runs 60 sim
  seconds, and never goes non-finite or spawns/kills nothing (dead arena);
  plus a medal-threshold sanity check (positive, ordered, 5s-rounded) across
  a sample week. All new checks pass; also caught and confirmed a
  **pre-existing flake** unrelated to this work: the section-1 "serpent
  followers trailed" check uses unseeded `Math.random()` and can legitimately
  roll 0 serpent formations in an unlucky 3-minute window (reran clean 3/3
  times after; not something this branch caused or fixed).
- Manual play-sanity (scripted invulnerable-observer eyeball, not committed):
  ARSENAL nearly doubled pickup count (68 vs. 36 baseline) at similar kill
  rate, reads as a fun day, not a hard one. THE FLOOD cut formations from 35
  to 11 and dropped score well below baseline, crowd-navigation texture, not
  just-harder. WARGAMES more than doubled formation count (77 vs. 35) and led
  every mutator on kills, a real set-piece gauntlet, still safely under the
  kill-rate ceiling (see above). GIANTS and THE PIT both cut max concurrent
  drones (377 and 398 vs. 504 baseline) for a fewer-but-bigger and
  claustrophobic read respectively. Conclusion: the pool reads as distinct
  sidegrades, not a difficulty slider, per the brief.
- Verified: `npm run build` (tsc + vite) green, `npx tsx scripts/sim-test.ts`
  all green. Branch `sam/daily-mutators` pushed to origin, **main untouched,
  no deploy triggered**.
- Open items for Lucas/Sam: (1) no exclusions or ceiling flags ended up
  needed, the pool shipped in full at 16 entries; (2) TODAY'S BOARD medal
  glyphs are skipped for the reason above, say if that's worth a future
  server column; (3) medal-calendar/server persistence is intentionally out
  of scope per the brief, for whenever that phase comes up.

## 2026-08-05 — Daily lobby inline board: show country flags (matches fullgame boards)

- Sam asked for the daily-only lobby's "TODAY'S BOARD" (the merged inline
  leaderboard added earlier today) to show each pilot's country flag, same
  as the fullgame community boards already do. The API already returned
  `country` (`dailyLeaderboardCombined` selects `u.country`,
  `LeaderboardEntry`/`DailyCombinedEntry` in `api.ts` already typed it) — the
  lobby UI just dropped it on the floor.
- `ui.ts`: `DailyBoardRow` gains `country: string`; `dailyBoardRow()` renders
  `<span class="flag" title="${countryName(...)}">` between rank and name,
  identical markup/behavior to `community.ts`'s board rows (empty country →
  "·"). Reused the existing `.board-row .flag` CSS — no style changes
  needed, it was already generic.
- `main.ts`: `fillDailyBoard()` threads `e.country` through for loaded-window
  rows; the pinned own-row (shown when the viewer's rank falls outside the
  window) uses `api.user?.country ?? ""` since the combined-board `me`
  response only carries rank/best/mode, not country.
- Verified: `npm run build` (tsc + vite) clean, no lint errors. UI-only
  change, no sim-test needed (no gameplay code touched).
- On branch `sam/daily-board-country` for Sam to review before merging to
  `main` (which auto-deploys).

## 2026-08-05 — Daily lobby: inline leaderboard replaces the Leaderboard screen (this commit)

- Lucas asked to simplify the daily-only lobby (surviveorion.com root): the
  separate Leaderboard screen (tabs, per-device mode dropdown) is gone from
  that side, replaced with one merged ranking sitting directly under the
  menu buttons — no tabs, no mode filter, every device in one list. The
  `/fullgame` Leaderboard screen (`community.ts` `showWorldArena`) is
  untouched; it still tabs Classic/Iron Rain × Desktop/Phone/Phone tilt.
- Server (`server/db.mjs`, `server/index.mjs`): `GET /api/leaderboard/daily`
  now accepts `mode=all` alongside the existing per-device modes. New
  `dailyLeaderboardCombined()` groups today's daily runs by pilot across
  every device with a `ROW_NUMBER()`/`COUNT()` window over `scores`
  (confirmed `node:sqlite`'s bundled SQLite supports window functions before
  relying on it), picking each pilot's best score and which device it was
  set on; `dailyRankCombined()` gives one pilot's rank/best/device in that
  merged board. Both hardcode `game_mode = 'classic'` since Daily Patrol is
  always Classic — no schema change, purely additive queries alongside the
  existing per-mode `leaderboard()`/`rankOf()`.
- Client: `api.ts` gets `dailyLeaderboardCombined()` hitting the new
  `mode=all` param. `ui.ts`'s `showDailyLobby` drops the "Leaderboard"
  button and grows a bounded-scroll `.board` list (same class the world
  board already uses — `max-height: min(46vh, 420px)`) titled "TODAY'S
  BOARD", rows show rank/name/a subtle device tag (DESKTOP/PHONE/TILT text,
  full name in the title attr)/score. `main.ts`'s new `fillDailyBoard()`
  mirrors the existing `fillDailyHint()` fetch-after-render pattern: highlights
  the viewer's own row gold in place if it's in the loaded window (reusing
  the `.board-row.me` style from the world board), or appends a
  `position: sticky; bottom: 0` pinned copy of it if their rank falls
  outside the top 50 — no own-row at all if anonymous or no daily score yet.
  Feedback footer link untouched.
- Verified: `npm run build` (tsc + vite) clean, `npx tsx scripts/sim-test.ts`
  all green (untouched gameplay code, ran it anyway per the task ask). Manual
  check with `npm run dev` + `npm run server`: seeded local guest pilots
  across desktop/touch/tilt daily scores, confirmed the combined ranking
  merges correctly (best score wins regardless of device, ties broken by
  earliest), confirmed a signed-in pilot's row gets the gold `.me` highlight
  at its real position, and confirmed the server-side pinned-row math
  (`rank > entries.length` on a truncated window) computes right. Screenshot-
  verified in a real browser via a subagent — matches the gold/dark aesthetic
  cleanly, no layout bugs. Cleared the local seeded test data from
  `server/orion.db` (gitignored, dev-only) before finishing.
- No destructive DB changes — additive queries only, real Render data
  untouched by this change itself.

## 2026-07-30 — /admin date selector (per-day drill-down) [MERGED + DEPLOYED same day: merge `70c6709`, live on Render ~4:49 PM PT, /admin verified serving the day-nav]

- Added a date picker to `/admin` so Lucas can view analytics for any single
  day, not just the rolling 14-day charts and all-time totals. Default view
  (no date picked) is today, PT, matching the day math from `a22e890` below;
  everything else on the dashboard is unchanged.
- Picked up mid-flight, uncommitted work from an interrupted session (~150
  lines in `server/db.mjs`, ~111 in `server/index.mjs`). Reviewed it
  critically and kept nearly all of it as-is: `ptDateBounds()` (parses
  `YYYY-MM-DD`, defaults to today, reuses the existing `ptOffsetMs` PT-day
  math) and `adminStatsForDay()` in `server/db.mjs` mirror `adminStats()`'s
  query style exactly (same columns, same hardcoded-column SQL pattern, no
  injection risk since no column name is ever request-controlled) and were
  already correct. `GET /api/admin/stats?date=YYYY-MM-DD` in `server/index.mjs`
  validates the date, 400s on a bad one, and returns the existing payload plus
  a new `day` key; omitting `date` returns today, so old clients see identical
  output with one added field. Turned out the "admin UI was not started" note
  I was given was stale: the inherited diff already had a working date input,
  prev/next-day buttons, a today button, and a `renderDay()` panel reusing
  the existing `stat`/`hbars`/`splitBar` helpers, all inside the same
  `ADMIN_PAGE` template in `server/index.mjs` (this repo has no separate
  admin UI file). I left that code essentially untouched after verifying it.
- Tripwire check: confirmed per-day granularity already exists (every `runs`
  and `visits` row has a millisecond `created_at`), so no schema or backfill
  was needed. Verified against the local dev DB: `date=2026-07-11` correctly
  picked up 15 runs that are UTC-dated 2026-07-12 in `sqlite date()` terms but
  land in PT day 2026-07-11 once shifted, exactly the PT bucketing `a22e890`
  established for the rest of the dashboard.
- Verified: `npm run build` (tsc + vite) green, `npx tsx scripts/sim-test.ts`
  all green, ran the community server locally and hit
  `/api/admin/stats` with no date (today), a real historical date, an invalid
  date string (400), and a future date (200, all zeros) - all matched
  expectations. Committed on `sam/admin-date-selector` (not merged to main,
  not pushed to origin/main; branch itself may be pushed). Dispatched by Sam.

## 2026-07-21 — /admin day math moved from UTC to Pacific Time (this commit)

- The admin dashboard's per-day charts (visits/day, runs/day) bucketed on UTC
  days, so from 5 PM PT onward the charts rolled over to "tomorrow"; the
  "today" tiles were rolling 24-hour windows, not calendar days. Both now use
  America/Vancouver days: new `ptOffsetMs()` / `ptMidnightEpoch()` helpers in
  `server/db.mjs` (via `Intl.DateTimeFormat` — SQLite has no named timezones
  and the server is zero-dependency) shift epochs before `date()` and anchor
  "today" (visits/uniques today, users newToday) at PT midnight. The current
  offset is applied to the whole 14-day window — DST-edge rows can land a day
  off, acceptable for a hobby dashboard. Week counters stay rolling 7 days.
  Added a note on `/admin` that days/"today" are PT. Player-facing Daily
  Patrol rollover (`utcDate()` in `index.mjs`) deliberately untouched — that's
  gameplay, still UTC. Verified: build + sim-test green, plus a temp-DB check
  that a 6 PM PT visit no longer buckets to the next day. Dispatched by Sam.

## 2026-07-21 — PM-model docs: AGENTS.md + this journal

- Added `AGENTS.md` (repo context, deploy warning, guardrails, PM model with
  Sam) and seeded this `JOURNAL.md` from recent git history, bringing the repo
  into the convention used across Lucas's other repos. The parent-folder
  `Orion/AGENTS.md` (outside git) now just points here — this versioned copy
  is authoritative. Docs only, no code. Dispatched by Sam.

## 2026-07-21 — iOS tilt-permission fix (`a344159`, merged `01807d4`)

- Fixed the tilt-control dead end on iOS: motion permission is now requested
  only from the in-context Tilt pick (a real click), never at boot. The old
  boot-time request fired on the first "tap to enter" whenever tilt was the
  saved mode — players reflexively denied it, Safari cached the denial for the
  session, and tilt then silently fell back to the touch stick, reading as
  "tilt is broken". When tilt can't start, a toast now explains the stick
  fallback and how to un-wedge motion access.

## 2026-07-21 — Visual /admin dashboard (`2024923`, on `71caf17`)

- `71caf17` added traffic analytics to `/admin` (cookie-less visit beacon →
  `visits` table) and unlisted the `/fullgame` lobby link for the public
  launch. `2024923` made the dashboard visual: column charts for per-day
  trends, flag bars for countries, split bars for device/mode shares,
  replacing the number tables.

## 2026-07-20 — Public-launch hardening (`1314249`)

- Launch-hardened for the public Reddit push: device-locked guest accounts
  (`orion.guestSecret` in localStorage, hash in `users.guest_secret_hash`),
  server-enforced 3-attempts/day daily budget, spoof-resistant rate-limit IPs,
  Bearer-only admin auth with a rotated `ORION_ADMIN_KEY` (in `server/.env` +
  Render env vars, never committed), security headers, a visible feedback CTA,
  OG/Twitter social meta, and crash reports to `/api/feedback` with a
  `[crash]` prefix visible on `/admin`. These protections are now a guardrail
  in `AGENTS.md` — don't weaken them.

## 2026-07-16 — Daily Patrol pacing (`be54086`, `30e63ad`)

- `30e63ad`: daily free-death window — dying inside the first 15s of a Daily
  Patrol run refunds the attempt (the run never happened for the daily books).
- `be54086`: faster power drops on dailies (`PICKUPS.dailyIntervalScale` 0.7) —
  dailies have no refill floor, so they were stuck on the slowest pickup
  schedule; a flat scale on the same seeded draw keeps the shared script
  identical across pilots.

## 2026-07-15 — Daily front door + determinism + balance (`b96cdd8`…`20b30f8`)

- `b4fbcad` + `b96cdd8`: made the daily game the front door (surviveorion.com
  root is the daily-only lobby with 3 attempts/day, Training Ground, and a
  Wordle-style share card; the full arcade moved to `/fullgame`) and turned
  drone assemblies into real evolutions (lance / wheel / hunter / bomb).
- `ddd5468`: one drone size (`scaleClamp` pinned to 0.9) — small drones were
  invisible on phones.
- `bb01c9a`: Daily Patrol power drops and mines fully scripted so every pilot
  sees the identical run; sim-test determinism check now compares positions.
- `e532dba`: phone game-over layout fix + guest names shared across devices
  for passwordless callsigns.
- `20b30f8`: reworked Magnet into a one-shot grab (never wasted — stays armed
  on an empty board) and benched Afterburner (control-stealing dash too risky
  as a pickup).

## Earlier

The web rebuild started 2026-07-10 (v2 of the archived Unity prototype) and
the full design log lives in `git log` — commit messages in this repo are
deliberately why-focused and detailed. Highlights: retention loop + seeded
Daily Patrol (`171a233`, Jul 11), guest accounts + playtester-feedback round
(`213b33d`/`374b3ae`, Jul 12), Classic/Iron Rain modes + graze scoring +
swarm rebalance (`5b87aaa`…`0afb1f8`, Jul 14).
