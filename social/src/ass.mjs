/**
 * ASS subtitle file from a beat sheet. Burned with libass `subtitles=` when
 * available; always generated so a future ffmpeg-with-libass can pick it up.
 */

const COLORS = {
  starlight: "&H00E0F7FF",
  alarm: "&H005544FF",
  gold: "&H0000D7FF",
};

const PLAYRES_X = 1080;
const PLAYRES_Y = 1920;

/**
 * @param {number} sec
 */
export function assTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const whole = Math.floor(rest);
  const cs = Math.round((rest - whole) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function assEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}

/**
 * @param {{ start: number, end: number, lines: string[], color?: string }[]} events
 * @param {{ font?: string, size?: number, yPct?: number }} [opts]
 */
export function buildAss(events, opts = {}) {
  const font = opts.font ?? "Rajdhani";
  const size = opts.size ?? 96;
  const yPct = opts.yPct ?? 0.2;
  const marginV = Math.round(PLAYRES_Y * yPct);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${PLAYRES_X}
PlayResY: ${PLAYRES_Y}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Starlight,${font},${size},${COLORS.starlight},&H000000FF,&H00120A0A,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,8,60,60,${marginV},1
Style: Alarm,${font},${size},${COLORS.alarm},&H000000FF,&H00120A0A,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,8,60,60,${marginV},1
Style: Gold,${font},${size},${COLORS.gold},&H000000FF,&H00120A0A,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,8,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const styleOf = (color) => {
    if (color === "alarm") return "Alarm";
    if (color === "gold") return "Gold";
    return "Starlight";
  };

  const lines = events.map((ev) => {
    const fadeOutStart = Math.max(ev.start, ev.end - 0.1);
    const fadeDur = Math.max(0, ev.end - fadeOutStart);
    const pop = `{\\fscx80\\fscy80\\t(0,120,\\fscx100\\fscy100)\\fad(0,${Math.round(fadeDur * 1000)}}`;
    const text = ev.lines.map((l) => assEscape(l.toUpperCase())).join("\\N");
    return `Dialogue: 0,${assTime(ev.start)},${assTime(ev.end)},${styleOf(ev.color)},,0,0,0,,${pop}${text}`;
  });

  return header + lines.join("\n") + "\n";
}
