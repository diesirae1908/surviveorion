# Direction v3: one bit per video

*Lucas's call, 2026-08-25, after seeing the v2-spec goldens: v2 had dynamism but crammed it.
The style is now cinematic-simple. One video is ONE bit, staged wide, with one persistent
tagline. This supersedes the beat sheets in EDITING.md; the five laws and the crop/caption
engines in EDITING.md still apply as machinery, used more sparingly.*

## The shape of every video

1. **One persistent tagline, top of frame, whole video.** Set on the `tagline-plate.png`
   pill (or bare with heavy shadow), Rajdhani Bold, one line, never changes, never moves.
   It IS the joke's setup. From `TAGLINES.md`.
2. **The game plays WIDE.** Open showing the full arena (fit the source width, gentle
   scale so gameplay fills ~70 percent of frame height; mild slow drift, never static).
   The viewer should watch the actual game, not a crop of it.
3. **One camera move.** A single slow push-in that tracks toward where the bit will land
   (the ship, the wall of drones), over 3 to 6 seconds. No punch spam, no flash rewinds.
4. **The bit.** One of the BITS below. It is the only "edit moment" in the video.
5. **The button.** A short end: WASTED card, or a freeze with the score, 1 to 1.5s, then
   loop. No CTA card unless the tagline already is one.

Target 8 to 15 seconds. The v2 "change something every 2.5s" law is satisfied by the push-in
and the bit; it no longer means text spam.

## The bits (one per video)

**WASTED** (the flagship, per Lucas's brief)
Wide view, slow push-in as the swarm closes. At death minus ~2.5s, freeze the frame; the
"he knew" voiceover starts over the freeze (`assets-audio/he-knew-vo-take*.mp3`, ours).
On "...he f*cked up", resume at 50 percent speed straight into the explosion. On the death
frame: cut ALL audio for 200ms, image slams to black and white (desaturate + slight contrast
crush + vignette), `wasted.png` slides in with a deep braam. Hold 1.4s. Loop.
Grading for the b&w slam: `hue=s=0, eq=contrast=1.25:brightness=-0.06`, vignette strong.

**THE FREEZE** (for near-misses)
Wide, push-in, freeze exactly at the closest-call frame, red circle pops on the gap between
hull and drone, tagline does the talking (e.g. "POV: death missed by one pixel"), resume at
50 percent through the dodge, no other text. Button: freeze on the escape.

**THE COUNTER** (for high scores)
Wide the whole way; the only overlay besides the tagline is the score counter rolling in the
corner. The bit is the number itself getting absurd. Button: freeze + the final number takes
the frame.

**JUST THE GAME** (for mutator days)
Tagline states the day's twist ("today the game rains meteors. everyone. same run."), then
the game simply demonstrates it wide for 8 seconds. The bit is the mutator. Button: freeze.

## Sound

- The WASTED voiceover and braam are baked (ours: ElevenLabs-generated VO in
  `assets-audio/`, CC0 braam in the sfx bank).
- Game audio otherwise carries the video, ducked only under the VO.
- The 200ms full-silence before the WASTED slam is mandatory; the silence is the joke's
  breath.

## Who renders

Claude renders. The presets are developed in the Claude session on real footage,
frame-checked there, and the resulting script is committed to orion-social for reruns.
Cursor plan-pool models do not iterate on visual output; they run finished presets.
