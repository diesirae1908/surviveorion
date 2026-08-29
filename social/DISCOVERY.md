# Orion discovery (IG + TikTok + YouTube)

*Locked 2026-08-29. Code: `src/discovery.mjs`. New channels stay at ~0 impressions until
the platform can categorize the clip. This file is the process; the code enforces it.*

A new Short with a brand-only title ("Day 47 WASTED") gives YouTube nothing to match
against Search. Browse and Suggested need watch data first. Search is the only shelf that
works on day one, so every post has to say what it is in words people type.

## Every post, all three channels

1. **Hook first.** First 2 seconds / first line. Already Direction v3.
2. **Name the game in searchable English.** "daily dodge game" or "browser game" in the
   title (YouTube) and in the first caption block (IG / TikTok). Not just the mutator name.
3. **Hashtags, rotated, 4 to 6.** `#indiegame #browsergame #dailychallenge #arcadegame`
   plus a mutator tag. TikTok used to ship with zero tags (calendar-buffer dropped them).
   That is fixed: TikTok inherits `ttTags` or `igTags`.
4. **Pin the first comment.** File: `comment.first.txt` in the pending folder.

   `Fly today's patrol free: https://surviveorion.com`
   `Same seed as every other pilot. Three attempts.`

   Bios get one link. TikTok hides it below follower thresholds. The pin is the CTA.
5. **Vertical 9:16, under ~60s.** Shorts / Reels / TikTok classification follows aspect
   ratio and duration, not a Buffer toggle. Do not upload a landscape master and hope
   `#Shorts` saves it.
6. **Never mark Made for Kids.** If that flag is true or unset wrong, YouTube hides
   comments and starves the regular feed. Buffer + Data API both send `madeForKids: false`.
7. **Do not buy views, pods, or bots.** Voice rule. It also tanks the next test audience.

## YouTube only

Buffer `YoutubePostMetadataInput` we now send on every create:

| Field | Value | Why |
|---|---|---|
| `title` | searchable, <= 100 chars | Search + CTR |
| `categoryId` | `"20"` Gaming | categorization |
| `madeForKids` | `false` | comments + regular feed |
| `license` | `youtube` | standard |
| `embeddable` | `true` | Reddit / Discord seeds can play it |
| `notifySubscribers` | `true` | the few we have still get pinged |
| `isAiGenerated` | `false` | these are real runs |
| `privacy` | `public` | drafts stay out of this path |

Description must include `#Shorts`, a dodge / browser / Orion phrase, and end with
`surviveorion.com`. Direct Data API uploads also set `defaultLanguage: en` and
`selfDeclaredMadeForKids: false`.

## Channel setup (manual, once)

Buffer cannot set these. Lucas in YouTube Studio / IG / TikTok:

- Handle `@surviveorion` everywhere. Avatar from the brand kit. YouTube banner from
  `assets/social/orion-header-1500x500.svg`.
- About / bio: "A daily dodging game. Three attempts a day. Same run for every pilot."
  plus https://surviveorion.com
- YouTube channel keywords: `orion, daily dodge game, browser game, indie game, arcade,
  surviveorion`
- Playlists: TODAY'S PATROL, WASTED / SPACE DUST, CLOSE CALL, THE BOARD. Add each new
  Short to the matching playlist after publish. Playlists tell YouTube the channel topic.
- Links: surviveorion.com in the channel link tree, not only the video description.

## What this will not fix by itself

Zero views with 4 to 6 Shorts is still a cold start. The algorithm needs a first
audience. Searchable packaging is how those first 20 testers find the clip. After that,
retention and the first 3 seconds decide whether it leaves the test. External seeds
(Reddit gameplay threads, Discord, a comment on a bigger dodge / arcade clip) still
matter. Do not post into a void and wait.

Already-scheduled Buffer posts were created before this layer. Confirm before we edit
those live (public). New Approved+Linked rows pick this up automatically.
