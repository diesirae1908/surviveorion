// Share card: rows always inside the frame and above the footer; the logo slot
// is drawn (image, or canvas-path fallback when the SVG will not load).
import assert from "node:assert/strict";
import {
  SHARE_ROW_PITCH_MIN,
  SHARE_ROWS_BOTTOM_MAX,
  drawShareCard,
  shareRowLayout,
  type ShareStats,
} from "../src/share";

for (let n = 1; n <= 6; n++) {
  const l = shareRowLayout(n);
  assert.equal(l.ys.length, n, `${n} rows`);
  assert.ok(l.bottom <= SHARE_ROWS_BOTTOM_MAX, `${n} rows end at ${l.bottom}, past ${SHARE_ROWS_BOTTOM_MAX}`);
  assert.ok(l.bottom < 966 - 28, `${n} rows clear the footer`);
  assert.ok(l.bottom < 1024, `${n} rows inside the frame`);
  if (n > 1) assert.ok(l.pitch >= SHARE_ROW_PITCH_MIN, `${n} rows keep a readable pitch (${l.pitch})`);
  for (let i = 1; i < n; i++) assert.ok(l.ys[i] > l.ys[i - 1], "rows ascend");
}

// recording context
function fakeCtx() {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  const rec = (fn: string) => (...args: unknown[]) => {
    calls.push({ fn, args });
    return fn.startsWith("create") ? { addColorStop() {} } : undefined;
  };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : rec(k)),
    set: (t, k: string, v) => ((t[k] = v), true),
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const full: ShareStats = {
  dayNumber: 108,
  score: 61204,
  time: 47,
  maxMultiplier: 9,
  rank: 14,
  attempt: 1,
  mutatorNames: ["BLACKOUT", "GIANTS"],
  medal: "silver",
};
const img = {} as CanvasImageSource;

// 6 rows: every fillText row baseline plus descender stays above the max
{
  const { ctx, calls } = fakeCtx();
  drawShareCard(ctx, full, { medalImg: img, markImg: img });
  const ys = calls.filter((c) => c.fn === "fillText").map((c) => c.args[2] as number);
  const rowYs = ys.filter((y) => y >= 360 && y < 940);
  assert.ok(Math.max(...rowYs) <= SHARE_ROWS_BOTTOM_MAX, "drawn rows end above the footer");
  // logo image drawn in the slot (x 112, y 126)
  const logo = calls.find((c) => c.fn === "drawImage" && c.args[1] === 112 && c.args[2] === 126);
  assert.ok(logo, "logo image drawn in the empty slot");
}

// fallback: no image -> ring arcs + core drawn with paths, no drawImage for the mark
{
  const { ctx, calls } = fakeCtx();
  drawShareCard(ctx, { ...full, medal: null, rank: null, mutatorNames: undefined }, { medalImg: null, markImg: null });
  assert.equal(calls.filter((c) => c.fn === "drawImage").length, 0, "no image calls on fallback");
  assert.ok(calls.filter((c) => c.fn === "arc").length >= 5, "four ring segments and the core drawn");
  assert.ok(calls.some((c) => c.fn === "fill"), "core filled");
}

console.log("PASS test-share-card");
