// Share card: rows always inside the frame and above the footer; the logo slot
// is drawn (image, or canvas-path fallback when the SVG will not load).
import assert from "node:assert/strict";
import {
  MEDAL_WORD_COLOR,
  effectiveShareFormat,
  useShareV2,
  SHARE_ROW_PITCH_MIN,
  SHARE_ROWS_BOTTOM_MAX,
  drawShareCard,
  shareRowLayout,
  type ShareStats,
} from "../src/share";
import {
  CARD_W,
  SHARE_MARGIN,
  STORY_HEIGHT,
  STORY_SAFE,
  drawShareCardV2,
  fitTextTo,
  fitTracePoints,
  shareCardV2Model,
  type ShareCardFormat,
} from "../src/shareCardV2";

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

// --- medal word colors (v1 nit): silver and copper are not gold ---
{
  assert.equal(MEDAL_WORD_COLOR.silver, "#d7d7d7");
  assert.equal(MEDAL_WORD_COLOR.copper, "#cd7f32");
  for (const tier of ["gold", "silver", "copper"] as const) {
    // fillStyle is assigned, not called: record it through a setter
    const styles: unknown[] = [];
    const sctx = new Proxy({} as Record<string, unknown>, {
      get: (t, k: string) => (k in t ? t[k] : () => ({ addColorStop() {} })),
      set: (t, k: string, v) => (k === "fillStyle" && styles.push(v), (t[k] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    drawShareCard(sctx, { ...full, medal: tier }, { medalImg: null, markImg: null });
    assert.ok(styles.includes(MEDAL_WORD_COLOR[tier]), `v1 medal row uses the ${tier} color`);
  }
}

// --- v2 model: every box inside the frame and the story safe zones ---
function track(n: number, spread = 1): Array<[number, number]> {
  return Array.from({ length: n }, (_, i) => [500 + Math.sin(i / 9) * 300 * spread, 900 - (i / n) * 800 * spread] as [number, number]);
}
function withTrace(base: ShareStats, n = 120): ShareStats {
  const pts = track(n);
  const death = pts[pts.length - 1];
  return {
    ...base,
    trace: { points: pts, death, project: (x: number, y: number) => [x, y] },
    kills: 41,
    grazes: 12,
    causeLabel: "Rammed by a Lancer at 1:12",
  };
}
const longNames = ["RED ALERT", "BLACKOUT + GIANTS + HOWLERS + SKYFALL", "A".repeat(80)];
const variants: ShareStats[] = [];
for (const rank of [null, 3, 12345]) {
  for (const medal of [null, "gold", "silver", "copper"] as const) {
    for (const names of [undefined, ...longNames.map((n) => [n])]) {
      for (const score of [0, 999, 129848, 1129848, 12345678]) {
        variants.push({
          ...full,
          rank,
          medal,
          mutatorNames: names,
          score,
          time: 3599,
          maxMultiplier: 12.5,
          preview: score === 999,
        });
      }
    }
  }
}
for (const fmt of ["square", "story"] as ShareCardFormat[]) {
  const h = fmt === "story" ? STORY_HEIGHT : CARD_W;
  for (const v of variants) {
    for (const stats of [withTrace(v), { ...v, kills: 3 }, { ...withTrace(v), causeLabel: undefined }]) {
      const m = shareCardV2Model(stats, fmt);
      assert.equal(m.w, CARD_W);
      assert.equal(m.h, h);
      for (const b of m.boxes) {
        assert.ok(b.x >= SHARE_MARGIN - 1, `${fmt} ${b.id} left ${b.x}`);
        assert.ok(b.x + b.w <= CARD_W - SHARE_MARGIN + 1, `${fmt} ${b.id} right ${b.x + b.w} (${stats.score}, ${stats.rank})`);
        assert.ok(b.y >= m.contentTop - 1, `${fmt} ${b.id} top ${b.y}`);
        assert.ok(b.y + b.h <= m.contentBottom + 1, `${fmt} ${b.id} bottom ${b.y + b.h}`);
        if (fmt === "story") {
          assert.ok(b.y >= STORY_SAFE.top, `story ${b.id} in the top ${STORY_SAFE.top} zone`);
          assert.ok(b.y + b.h <= STORY_HEIGHT - STORY_SAFE.bottom, `story ${b.id} in the bottom ${STORY_SAFE.bottom} zone`);
        }
      }
      // the stats row never runs into the footer
      const lastCol = m.stats[m.stats.length - 1].value;
      const colEnd = lastCol.x + lastCol.text.length * lastCol.size * 0.56;
      assert.ok(colEnd < m.footer.x - m.footer.text.length * m.footer.size * 0.56, `${fmt} stats clear the footer`);
      // trace points all inside the trace box, death among them
      if (m.trace.points) {
        const b = m.trace.box;
        for (const [x, y] of m.trace.points) {
          assert.ok(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h, `${fmt} trace point inside the art box`);
        }
        assert.ok(m.trace.death, "death mark kept");
      } else {
        assert.ok(m.trace.markBox, "lobby share draws the big mark");
      }
      // score hero is the biggest text
      assert.ok(m.score.size >= 80, "score stays a hero");
    }
  }
}

// trace fit: uniform scale, centered, tiny flights are not blown up
{
  const box = { x: 72, y: 200, w: 936, h: 500 };
  const out = fitTracePoints([[0, 0], [100, 0], [100, 50]], box);
  const xs = out.map((p) => p[0]);
  const ys = out.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  assert.ok(Math.abs(cx - (box.x + box.w / 2)) < 0.01, "centered");
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 100 * 2.2 + 0.01, "scale capped");
  assert.ok(Math.min(...ys) >= box.y && Math.max(...ys) <= box.y + box.h);
  const dot = fitTracePoints([[5, 5], [5, 5]], box);
  assert.ok(Number.isFinite(dot[0][0]) && Number.isFinite(dot[0][1]), "degenerate trace is finite");
}
assert.ok(fitTextTo("X".repeat(200), 26, 0, 500).endsWith("…"));
assert.equal(fitTextTo("SHORT", 26, 0, 500), "SHORT");

// without a trace: the lobby share gets the big ORION mark, no trace points
{
  const m = shareCardV2Model(full, "square");
  assert.equal(m.trace.points, null);
  assert.ok(m.trace.markBox && m.trace.markBox.w >= 300, "big mark");
  const { ctx, calls } = fakeCtx();
  drawShareCardV2(ctx, m, { medalImg: img, markImg: img, markFallback: () => {} });
  assert.ok(calls.filter((c) => c.fn === "drawImage").length >= 3, "mark x2 and medal drawn");
}

// drawing with a trace runs against a recording context, with and without images
for (const fmt of ["square", "story"] as ShareCardFormat[]) {
  const m = shareCardV2Model(withTrace(full), fmt);
  const a = fakeCtx();
  drawShareCardV2(a.ctx, m, { medalImg: img, markImg: img, markFallback: () => {} });
  assert.ok(a.calls.some((c) => c.fn === "quadraticCurveTo"), "trace curve drawn");
  assert.ok(a.calls.some((c) => c.fn === "fillText" && c.args[0] === "61,204"), "hero score drawn");
  let fell = 0;
  const b = fakeCtx();
  drawShareCardV2(b.ctx, m, { medalImg: null, markImg: null, markFallback: () => void fell++ });
  assert.equal(fell, 1, "mark fallback used once");
}

// --- switches: off = today's card; stories need shareV2 and stories ---
{
  assert.equal(useShareV2(full), false, "no params: v1");
  assert.equal(useShareV2({ ...full, resultParams: null }), false);
  assert.equal(useShareV2({ ...full, resultParams: { shareV2: false } }), false);
  assert.equal(useShareV2({ ...full, resultParams: { shareV2: true } }), true);
  assert.equal(effectiveShareFormat(full, "story"), "square", "story falls back to square with no params");
  assert.equal(effectiveShareFormat({ ...full, resultParams: { shareV2: true } }, "story"), "square", "stories off");
  assert.equal(effectiveShareFormat({ ...full, resultParams: { stories: true } }, "story"), "square", "stories alone is not enough");
  assert.equal(effectiveShareFormat({ ...full, resultParams: { shareV2: true, stories: true } }, "story"), "story");
  assert.equal(effectiveShareFormat({ ...full, resultParams: { shareV2: true, stories: true } }, "square"), "square");
}

console.log("PASS test-share-card");
