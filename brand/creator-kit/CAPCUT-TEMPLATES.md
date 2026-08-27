# CapCut template specs: the three ORION formats

*2026-08-26. The locked video grammar (one bit per video, wide game, one tagline) translated
into CapCut steps. Build each once, save as template, then a new post is: swap clip, retype
numbers, pick sound, export. Timings are starting points; trust your eye in motion, that is
exactly what this move buys us.*

## Rules that apply to every format (from the research, non-negotiable)

- **First frame is action.** Trim so frame 1 already has bullets flying. No run start, no menu.
- **One tagline, top of frame, whole video.** Rajdhani Bold, Hull Gold #ffd700 or Starlight
  #fff7e0, subtle black shadow. 85% watch muted; the tagline IS the video for them.
- **15 to 34 seconds total.** Shorter is fine. Longer needs a reason.
- **9:16, game fills ~70% of frame height.** Position the arena center-frame; let CapCut's
  background blur or the `memes/vignette-1080x1920.png` fill the edges. Never letterbox.
- **Trending sound**: pick in CapCut/TikTok at edit time. Our `audio/` files are fallbacks.
- **Watermark**: Patrol Sight mark (`logos/orion-mark-512.png`), bottom corner, ~40% opacity,
  small. Skip it if it fights the footage.
- **End card CTA** (last 1 to 1.5s): "free in your browser · surviveorion.com" in Rajdhani,
  or just the stacked logo. Every post.

## Format 1: WASTED (any dumb death)

Target 12 to 16s. The bit: confidence, then consequence.

1. Clip: start mid-action ~8 to 10s before the death. Speed 1x.
2. Slow zoom: keyframe scale 100% to ~135% across the clip, centered on the ship's path.
3. Freeze frame ONE frame before the killing hit (right-click, Freeze). Hold ~2.5s.
4. On the freeze: drop `memes/he-knew.png` (or `at-this-moment.png`) lower third + play
   `vo/he-knew-vo-take1.mp3`. Duck music to ~20% under the VO (CapCut auto-ducking).
5. Resume clip: the death plays. Speed ramp 50% through the explosion (~0.7s).
6. Cut to `memes/wasted.png` on black. Apply black-and-white filter to the death's last
   frames if it reads well. Add a braam or the trending sound's drop here.
7. Tagline ideas: `copy/TAGLINES.md` WASTED section ("flying too close to the stars",
   "he had a plan. the plan had him.").

## Format 2: NEW BEST (a run beats the HUD BEST)

Target 11 to 14s. The bit: the grind pays off, celebrate stupid hard.

1. Clip: final ~8s of the run, wide, slow zoom toward the ship.
2. The moment the run ends, cut to the score board (fresh render from the board template;
   day 43 reference in `boards/`). Board fades in over ~0.4s.
3. Music: Celebration (or current celebratory trending sound) hits exactly at the board cut.
   Fallback: `audio/celebration-funk.wav`.
4. Optional: `memes/undefeated.png` or confetti effect from CapCut on the board.
5. Tagline: "day {N}. new best." or "beat my ghost: {score}". Numbers MUST match the board
   and the HUD in the footage. Never invent a number.

## Format 3: FREEZE / PATROL (showcase, close calls, today's mutator)

Target 8 to 12s. The bit: the game itself is the spectacle.

1. Clip: the most readable 8 to 10s of chaos, one slow camera move only (zoom OR pan,
   keyframed, not both).
2. For close calls: freeze at the nearest miss, `memes/red-circle.png` on the gap, hold 1s,
   resume. `memes/one-pixel.png` or `clean.png` as the reaction sticker.
3. For patrol reveals: end on a text slam of the mutator name in Rajdhani caps, Rising Red
   #c41e3a, e.g. "STARFALL". Post same UTC day so the CTA is live.
4. Tagline: patrol lines in `copy/TAGLINES.md` ("it rains meteors today. everyone.").

## Eklipse note

If testing Eklipse: upload a FULL session recording (not pre-cut clips), let it detect
highlights, then export its cuts INTO CapCut and apply the formats above. Its detection is
tuned for FPS visuals; judge its picks against the sidecar's closestCall/topGrazes before
trusting it.
