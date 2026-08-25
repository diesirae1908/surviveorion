# Day-43 presets (first real renders, built in the Claude session 2026-08-25)

Three finished cuts from `orion_2026-08-25_day43_arsenal_3490380.webm`, per DIRECTION-V3:

- WASTED (14.2s): approach push-in (z 1.5-2.05) -> 4.3s freeze with the tightened VO ->
  50% slow-mo through the explosion -> b&w + vignette + WASTED card + synth braam after
  200ms silence. Tagline: "flying too close to the stars" (he died at the top wall).
- THE COUNTER (12.4s): the x10 chain storm at 4:00 -> freeze -> push into the real HUD
  score corner as the punchline. Tagline: "no gun. just vibes and 3.4 million points".
- JUST THE GAME (9.3s): the ARSENAL RAM-THEM stretch at 2:00, gentle push, tagline
  "double pickups today. go feral.", freeze out.

Lucas's v1 verdicts (2026-08-25): WASTED approved with VO louder + music quieter (locked at
VO x2.1, music 0.42 base / 0.10 under VO / 0.62 late). PATROL approved as-is. COUNTER v1
rejected: unclear, and the mid-run score at the end contradicted the tagline. v2 rule, now
standing for the format: **the number in the tagline must be the number on screen at the
end.** COUNTER ends on the run's final frame (HUD 3,490,380 + death sparks) and the tagline
became "3,490,380 points. zero bullets fired."

COUNTER v2 also rejected (angle unclear); replaced by **NEW BEST** per Lucas's brief: the
run's last ~8s at full speed and wide, music hard-cut on the death, then a full-frame NEW
BEST board (kit-styled: score in the gold gradient, previous best struck through, DAY N ·
MUTATOR in Alarm) with a synthesized victory fanfare and a slow zoom pulse. Board is a
Chromium-rendered PNG; fanfare v1 is `assets-audio/victory-fanfare.wav`; Lucas wanted actual Celebration energy, so the standing ending is `assets-audio/celebration-funk.wav` (JS-synthesized 118 BPM disco-funk: four-on-floor kick, octave funk bassline in F, brass stab chords, layered claps, final hit; ours, bakeable everywhere). Platform note baked into the format: TikTok/IG publishes mute the
ending in-app and attach the real Celebration as the platform sound; the fanfare version is
the YouTube-safe master. Eligibility: score > all-time best in the HUD (visible as BEST in
the top-left; a future sidecar field could carry it explicitly).

Build recipe notes (hard-won, keep):
- The source webm has NO audio track and no duration header: remux `-c copy` to mkv first.
- Full-bleed engine: pad source to 9:16 (2904x5164, Void), then zoompan with
  s=1080x1920. Game height on screen = 615.7*z px; z 1.5 = wide, 2.2 = fills 70%.
  y center 2582 constant; animate x toward the action; always clamp with max/min.
- Slow-mo THROUGH zoompan: zoompan first, then setpts=2*PTS, then fps=24
  (zoompan recounts frames, so setpts before it does nothing).
- `-t` placement matters: output-side for normal segments; filter trim for slow-mo;
  for -loop 1 stills, -t goes on the OUTPUT or it loops forever.
- ffmpeg-static has no drawtext: taglines and text are pre-rendered PNGs (Chromium+Rajdhani).
- VO tightened with silenceremove (7.6s -> 3.9s); freeze length = VO + 0.4s.
- Braam is synthesized (aevalsrc layered decaying sines), so nothing is licensed.
