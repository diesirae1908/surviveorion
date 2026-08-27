# ORION Social Engine

*Written 2026-08-24. Instagram + TikTok + YouTube, organic, as automated as honesty allows.*

The goal: turn Orion runs into a steady stream of short videos (memes, absurd dodges, high
scores, hilarious deaths, light education) with editing, captioning, thumbnails and scheduling
done by machines, and exactly one human moment left in the loop: Lucas approving a queue once
or twice a week. That human moment is not a compromise. Posting is public, so it sits behind
the confirm-first guardrail anyway, and it is also where trending sounds get attached, which no
API can do for you.

## Why this can be more automated than most games

Three things already shipped in orion-web were built for exactly this:

1. **`src/recorder.ts`** captures runs client-side, opt-in, WebM/MP4. Its header comment
   literally says it exists "for Lucas's Orion social content".
2. **`src/highlights.ts`** tracks the closest call of every run deterministically: the moment a
   drone came nearest the hull, with its timestamp. That is an auto-editor's cut list. No ML,
   no scene detection, the game just tells you where the highlight is.
3. **Every run carries structured metadata**: day number, mutator name, score, medal, survival
   time. That is a caption generator's entire input.

One small game change unlocks the pipeline (see Build step 1): make each downloaded clip come
with a JSON sidecar carrying that metadata plus the top graze timestamps, and name the file
`orion_YYYY-MM-DD_day47_starfall_1284300.webm`. After that, editing is deterministic ffmpeg,
not judgment.

## Handles and identity

- **@surviveorion** on all three platforms (check availability first; fallback `@orion.daily`).
  Same handle everywhere, it is also the URL, which is the whole point.
- Avatar: `assets/icon/png/orion-app-icon-512.png`. Banner (YouTube): render from
  `assets/social/orion-header-1500x500.svg`. Bio, all three, from the copy bank:
  *"A daily dodging game. Three attempts a day. Same run for every pilot. ⬇ fly today's patrol"*
  plus the link.
- Watermark on every video: the mark, bottom-right, 6% width, 60% opacity. Burned in by the
  pipeline, so reposts still say Orion.
- Caption font on video: Rajdhani 700, Starlight on a Void scrim bar, never raw text over
  gameplay. Mutator names always in Alarm red, always all-caps.
- Thumbnails: `assets/social/orion-thumbnail-template.svg` (1280x720 overlay, gameplay still
  underneath, `{{TITLE_LINE1}} {{TITLE_LINE2}} {{TAG}}` slots). Covers and end-cards:
  `assets/social/orion-cover-vertical-template.svg` (1080x1920, safe zones respected). Hook
  lines max ~14 characters per line at the set size.

## Content system: five formats, one weekly rhythm

Every video is one of five named formats. Naming them is what makes automation possible: each
format is a preset (edit template + caption template + sound rule), not a creative decision.

| Format | What it is | Source clips | Voice |
|---|---|---|---|
| **CLOSE CALL** | 8 to 15s: the near-miss, slowed 0.5x at the moment, zoom punch-in, then full speed death or escape. | Highest-graze clips, auto-picked by clearance | Mission Control captions |
| **SPACE DUST** | 6 to 10s: dying embarrassingly fast, or a 3-digit score. The badge for dying under 10s is already called Space Dust; the format inherits the name. Meme overlays live here ("at this moment he knew", explosion GIF on impact, sad violin). | Shortest runs, lowest scores | Meme register, self-deprecating |
| **THE BOARD** | 10 to 20s: a high score or #1 take, score counter burned in, ends on the share-card frame. | Best runs | The Log, dry |
| **TODAY'S PATROL** | 15 to 30s: what today's mutator does, shown not told. STARFALL day = 20 seconds of meteor rain with the briefing subline as caption. Ends with "same run for every pilot, three attempts". | First run of the day, any quality | Mission Control, educational |
| **FLIGHT SCHOOL** | 20 to 45s: one mechanic per video (grazing pays, the multiplier, why there is no gun). Occasional; these are the durable, searchable ones. | Curated clips | The Log |

Weekly rhythm, ~5 to 7 posts/week from one 30-minute recording session:

- TikTok: 5 to 7 per week (CLOSE CALL and SPACE DUST carry it; TikTok rewards volume and memes)
- Reels: 3 to 4 per week (same videos, best of them, posted natively, never with a TikTok watermark)
- Shorts: 3 to 4 per week (same again; YouTube also gets 1 to 2 FLIGHT SCHOOL per month, and a monthly "best patrols of Month X" compilation, which is where thumbnails matter)
- TODAY'S PATROL is the anchor: on a good mutator day (STARFALL, THE PIT, GIANTS), post it the
  same UTC day so the video is about the run everyone can go fly *right now*. This is Orion's
  one structural advantage over every other game account: the call to action expires at
  midnight, which is a reason to act now.

## Sounds: the one place full automation is a trap

Meme sounds are licensed **per platform, inside the platform**. A trending TikTok sound can
only legally ride on a TikTok posted with that sound attached in-app; baking it into the file
and uploading everywhere invites YouTube Content ID strikes and IG mutes.

So the rule, and it shapes the whole pipeline:

- **Baked into the file**: only sounds we have rights to. Game audio (ours), the Suno tracks in
  `public/music/` (ours, and on-brand), and a small folder of verified CC0 impact/whoosh SFX.
  Videos built this way are safe to auto-post anywhere.
- **Trending meme sounds**: added by hand, in-app, at approve time, on TikTok and IG only. The
  pipeline renders those videos with game audio quiet or muted and puts *"suggested sound:
  <name>"* in the caption file so the approve tap takes ten seconds.
- YouTube gets the baked-audio version, always.

## The machine

```
[Lucas plays, recording ON]                      30 min, once or twice a week
        v  clips + JSON sidecars into  ~/OrionClips/inbox/
[harvest]      watches the folder, reads sidecars, ranks runs
[edit]         ffmpeg per format preset: 9:16 crop, slow-mo at graze timestamps,
               caption bars, watermark, scrim, end-card from the cover template
[caption]      caption + hashtags per platform from metadata (templates below)
[thumbnail]    for YouTube: still at the graze frame + thumbnail template overlay
[queue]        everything lands in a review queue as draft posts
        v
[LUCAS: approve / swap sound / kill]             the one human step, 10 min
        v
[schedule]     approved posts go out on the calendar
[report]       weekly: views/likes/follows per format into a scoreboard file,
               so the format mix follows what works instead of what we guessed
```

Posting backends, honestly assessed (2026):

- **YouTube**: Data API v3 uploads work fine for an own-channel bot. Fully automatable
  end-to-end. Default quota comfortably covers a Short a day.
- **Instagram**: Reels publish via the Graph API on a Business/Creator account. Automatable.
- **TikTok**: the Content Posting API requires an audited app before posts can be public;
  unaudited apps can only push drafts/private. Realistic paths: (a) a scheduler product that
  already has the audited integration (Postiz is self-hostable and open source, Buffer/Later
  are the paid versions), or (b) pipeline pushes a draft, the approve tap in the TikTok app
  publishes it, which is where the trending sound gets added anyway. Start with (b); it costs
  nothing and the human tap was already in the loop.
- Never post the same file with another platform's watermark on it. The pipeline renders clean
  masters, so this is free to get right.

## Caption templates (the pipeline fills these)

- CLOSE CALL, TikTok/IG: `{clearance_percent}% of a hull between him and deletion. Day {day},
  {MUTATOR}. Could you dodge it? Link in bio.` plus 4 to 6 tags from the tag bank.
- SPACE DUST: `Day {day} attempt: {seconds}s. The daily patrol is undefeated.`
- THE BOARD: `{score} on Day {day}. Same seed as everyone else. That is the whole point.`
- TODAY'S PATROL: `Today every pilot on earth flies {MUTATOR}: {briefing_subline} Three
  attempts. Free, in your browser.`
- Tag bank: #arcadegame #indiegame #browsergame #dailychallenge #dodge #gamingmemes
  #satisfying #closecall plus per-video mutator tag. Rotate, never all at once.
- Hard rules from the voice guide apply: no em dashes, one exclamation mark max, pilots not
  players, and never buy or bot engagement.

## Comments are Wingmate territory

The accounts reply in the Wingmate voice: warm, quick, specific, a bit dry. "Skill issue"
jokes at our own expense are on-brand (SPACE DUST exists); dunking on players is not. Pin a
comment with the link on every post, because bios get one link and TikTok hides it below
follower thresholds.

## Build plan

**Step 0, accounts (manual, an afternoon).** Claim handles, set avatars/banners/bios from the
kit, post 3 seed videos each (one CLOSE CALL, one SPACE DUST, one TODAY'S PATROL) edited by
hand to calibrate what the presets should produce. Nothing here needs code.

**Step 1, the sidecar (small orion-web dispatch, Sonnet).** On clip download, also download
`<same-name>.json`: day, mutator ids/names, score, medal, survival time, and the top ~5 graze
events (time + clearance) from the existing highlights telemetry. Rename the clip file to the
structured form. Client-side only, no server change, no gameplay change, fits the privacy
stance (nothing uploaded).

**Step 2, the pipeline (`social/` in this repo, the real build).** Node + ffmpeg, runs
locally via launchd or in the cloud: harvest → edit presets per format → captions → thumbnail
→ queue. Output: a folder of ready posts plus a manifest. Posting: YouTube API direct, IG
Graph API, TikTok drafts. Review queue starts as a folder Lucas looks at; graduates to Postiz
if the tap count gets annoying.

**Step 3, the loop.** Weekly cloud task: compile the scoreboard (per-format averages), flag
the best hook lines, adjust the mix. Monthly: assemble the compilation cut for YouTube from
the month's approved clips.

Order matters: Step 0 starts this week with zero engineering, and everything learned there
becomes the presets in Step 2.

## What we do not do

No engagement pods, no bought followers, no bots in comments, no reposting other games'
clips, no fake "POV" bait unrelated to the game, no uploading player-submitted runs without
asking (clips are device-local by design; if fans start sending clips, that is a feature
request for a consented submit flow, not a scraping job).
