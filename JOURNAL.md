# Orion work journal

Newest first. Every substantive change gets a dated entry here (what changed,
why, commit hash, follow-ups), committed together with the work. See
`AGENTS.md` → "Recording your work".

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
