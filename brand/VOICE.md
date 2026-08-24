# ORION Voice

*Version 1.0. Written 2026-08-24.*

ORION speaks in three voices. They share a spine and differ in warmth. Every line ORION ships
is in one of them. If you cannot tell which one you are writing in, you are writing in none of
them.

All three are lifted from strings already live in the game. This is not an aspiration
document; it is a description of what ORION already sounds like when it is at its best, with
the rules made explicit so it stays that way.

---

## The spine (all three voices)

1. **The player is a pilot.** Never a user, a player, or a gamer. Their name is a **callsign**.
2. **Short lines.** If a sentence needs a comma to survive, try two sentences first.
3. **Present tense, active voice.** "Three attempts a day", not "You will be given three
   attempts per day."
4. **Specific over superlative.** "Destroy 1,000 drones in a single run" beats "an epic
   challenge". Numbers are more exciting than adjectives.
5. **No em dashes. Ever.** Not U+2014, not an en dash pretending to be one. Use a comma, a
   colon, parentheses, a middle dot, or a full stop. This is a hard rule across everything
   Lucas ships and it has already been swept out of the game once, on 2026-08-17.
6. **One exclamation mark per surface, maximum.** Usually zero. `"No patrols flown yet today.
   Be the first!"` earns its one because it is an invitation.
7. **Never fake scale.** No testimonials, no press quotes, no player counts unless they are
   real and current. ORION is small and honest about it.
8. **Absolute dates and a timezone label.** "Aug 18, 3:44 PM PT", never "yesterday". Daily
   Patrol rolls over at 00:00 UTC, which is 5 PM PT. Say which one you mean.

---

## Voice 1: MISSION CONTROL

**Where:** in-game UI, HUD, prompts, system messages, error states, briefings, push copy.

**Who is talking:** the ground station. It has your telemetry on a screen. It is calm, it is
busy, and it is on your side but it is not going to make a fuss.

**Register:** flight comms. Terse, second person, present tense, mid-sentence with the world
already in motion. It states conditions and consequences; it does not sell, apologise at
length, or celebrate on your behalf.

### Rules

- Lead with the fact, then the consequence. "Score not saved. Couldn't reach the leaderboard."
- Contractions are fine and preferred. "Couldn't", "you're", "don't".
- All-caps only for labels and screen titles (`FLIGHT SCHOOL`, `TRANSMISSION RECEIVED`,
  `DAILY PATROL PREVIEW`). Never all-caps a sentence.
- Mutator sublines say exactly what changes, in plain language, with no hedging.
  "Every pickup is a Cryo Field." not "Pickups may tend toward Cryo Fields."
- Failure states name the cause and the fallback in that order. Never blame the pilot for an
  infrastructure problem.
- Never explain a mechanic the pilot can feel. The game teaches by playing.

### It sounds like this (all shipped)

> Today's patrol, still flying.
> Three attempts a day. Same run for every pilot.
> Pickups fire the instant you grab them, no button. Every power can appear from minute zero.
> Everything you score is multiplied. Chain kills to keep the multiplier hot.
> Sandboxed: no daily attempt spent, no score submitted, no medal recorded.
> Score not saved. Couldn't reach the leaderboard.
> Signed out: showing this device's local history only. Sign in to sync your full record.
> Recorded on this device only. Sign in to keep this on your account.
> No motion data from this device. Flying with the touch stick.
> YOU'RE READY, PILOT

### It does not sound like this

> ~~Uh oh! Something went wrong. Please try again later.~~
> ~~Get ready for the ULTIMATE arcade challenge!~~
> ~~We're so excited to have you on board.~~
> ~~Your score could not be saved due to a network issue — please retry.~~

---

## Voice 2: THE LOG

**Where:** the site, store listings, link previews, patch notes, Reddit posts, ads, the README.

**Who is talking:** the person who built it, writing down what happened. Confident, plain,
allergic to hype. It reports; it does not pitch. Its persuasion comes entirely from being
specific.

**Register:** a builder's changelog that happens to be readable. First person plural is
allowed sparingly ("our tribute to Tilt to Live"). First person singular is fine on Reddit.

### Rules

- Open with the concrete thing, not the promise. "22 mutators, one per day, picked by a date
  hash" beats "endless variety".
- Credit influences openly. The tilt controls already say "a tribute to Tilt to Live". That
  honesty is a brand asset; keep it.
- Never claim a feature that is not live. If it is planned, say planned, and say roughly when
  or say you do not know.
- Patch notes are a list of changes, newest first, each one line, each starting with a verb.
- A launch post says what it is, what is different about it, what it costs, and where to play.
  Four things. In that order. Nothing else.
- Do not write "we're thrilled", "we're excited", or "we're proud to announce".

### It sounds like this

> ORION is a daily survival patrol. Dodge the drone swarm, grab powers, chase the daily
> leaderboard. Three attempts a day, same run for every pilot. Free, no install, plays great
> on your phone.

> Every Daily Patrol day gets a named mutator from a pool of 22, picked by a date hash. Two on
> Sundays. They are sidegrades, not difficulty sliders: STARFALL swaps every drop for a shield
> and rains seeded meteors, CRYO WINTER makes every pickup a Cryo Field, THE PIT shrinks the
> arena by 30 percent. Everyone gets the same one on the same day.

> Tilt steering: lean the phone to fly. A tribute to Tilt to Live.

### It does not sound like this

> ~~ORION redefines the arcade genre for a new generation.~~
> ~~Experience heart-pounding action like never before.~~
> ~~We're excited to announce our biggest update yet!~~

---

## Voice 3: WINGMATE

**Where:** feedback replies, support email, Reddit comments, Discord, anything answering a
human directly.

**Who is talking:** the pilot in the next seat. Warm, quick, a bit dry, treats the person as a
competent adult who found something real.

**Register:** Mission Control with the shoulders down. It can be funny. It thanks people
concretely rather than effusively.

### Rules

- Thank them for the specific thing, not for "reaching out".
- If they found a bug, say what you are going to do about it, or say you are not going to and
  why. Never "we'll look into it" with no follow-through.
- Never apologise twice for the same thing.
- Match their register. A one-line gripe gets a one-line answer.
- French is fine when the pilot writes in French. Same voice, same brevity, same ban on em
  dashes.
- Never argue with a bad review in public. Fix the thing or let it stand.

### It sounds like this (the first two are shipped)

> Received, pilot. Best ideas make it into the arena.
> Thank you, pilot. Your report is in the log.
> Good catch. The touch-drag lockup is real, it is fixed on the branch, it goes live this week.
> That one is on purpose. The pool is append-only so a given day always lands on the same
> mutator, even years later. It makes old share cards still mean something.
> Not planned right now, and I would rather say so than leave it on a roadmap forever.

### It does not sound like this

> ~~Thank you for reaching out! We appreciate your feedback and will pass it along to our team.~~
> ~~We're sorry for any inconvenience this may have caused.~~
> ~~Great question! Let me help you with that.~~

---

## Choosing a voice

| You are writing | Voice |
|---|---|
| A button, a toast, a HUD label, an error | Mission Control |
| A mutator briefing or a badge description | Mission Control |
| The site, an ad, a store page, a link preview | The Log |
| A patch note or a launch post | The Log |
| A reply to a pilot, anywhere | Wingmate |
| A Reddit post you wrote | The Log |
| A Reddit comment replying to someone | Wingmate |

## Words

**Use:** pilot, callsign, patrol, run, attempt, the swarm, the board, the arena, mutator,
power, medal, drone, seed, graze, multiplier.

**Avoid:** user, player, gamer, level (ORION has no levels), enemy (they are drones), score
multiplier x2 combo hype language, "content", "experience", "journey", "unlock the power
within", "insane", "epic", "game-changing".

**Careful with:** "challenge" (fine as a verb, weak as a noun), "daily" (say Daily Patrol when
you mean the mode), "free" (true today, and the paid tier is planned, so do not build a
campaign on the word).

## French notes

Lucas is French and some surfaces will be. The voice does not change: terse, present tense, no
em dashes, pilot stays **pilote**, callsign becomes **indicatif**, the Daily Patrol becomes
**la patrouille du jour**. Do not translate mutator codenames; they are proper nouns, the same
way STARFALL stays STARFALL on the leaderboard everyone shares.
