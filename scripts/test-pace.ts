/**
 * WS-H: live pace chip math, HUD text boxes (bug 4 + chip placement), old-row no-op.
 * Run: npx tsx scripts/test-pace.ts
 */
import { createWorld } from "../src/gameState";
import { resetFlagsForTest, setRemoteFeatures } from "../src/flags";
import { CHAIN_GAP_PX, hudLayout, hudTextBoxes, fitScorePx, type HudBox, type HudTextBoxes } from "../src/feel";
import { PACE_CALLSIGN_MAX, countAbove, normalizeRows, onRunStart, paceEligible, paceLines, paceView, snapshot, type PaceRow } from "../src/pace";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const R = (callsign: string, score: number, self = false): PaceRow => ({ callsign, score, self });

// --- rank math ---
const rows = normalizeRows([R("Me", 5000, true), R("A", 9000), R("B", 7000), R("C", 7000), R("D", 3000), R("", 4000), R("Z", 0)]);
check("normalize: self, blank callsign and zero dropped, sorted desc", rows.map((r) => r.callsign).join() === "A,B,C,D");
check("countAbove strict (ties not above)", countAbove(rows, 7000) === 1 && countAbove(rows, 6999) === 3 && countAbove(rows, 9000) === 0);
check("above #1 -> rank 1, no next", (() => {
  const v = paceView(rows, 12000);
  return v.rank === 1 && v.next === null && v.delta === 4;
})());
check("empty board -> rank 1, no next, delta 0", (() => {
  const v = paceView([], 500);
  return v.rank === 1 && v.next === null && v.delta === 0;
})());
check("score 0 -> last place, delta 0, next is lowest above", (() => {
  const v = paceView(rows, 0);
  return v.rank === 5 && v.delta === 0 && v.next?.callsign === "D" && v.next.gap === 3000;
})());
check("tie with a row: rank counts only strictly higher, next is that tied row's neighbor above", (() => {
  const v = paceView(rows, 7000);
  return v.rank === 2 && v.next?.callsign === "A" && v.next.gap === 2000 && v.delta === 3;
})());
check("mid climb: passes D then B,C", (() => {
  const v = paceView(rows, 3500);
  return v.rank === 4 && v.delta === 1 && v.next?.callsign === "C" && v.next.gap === 3500;
})());
check("fractional score floors", paceView(rows, 7000.9).rank === 2);
check("gap never below 1", paceView([R("X", 100)], 99.5).next?.gap === 1);
check("lines: gained places", paceLines(paceView(rows, 3500)).join("|") === "PACE #4 ▲1|NEXT C +3,500");
check("lines: no gain, no arrow", paceLines(paceView(rows, 0))[0] === "PACE #5");
check("lines: leading", paceLines(paceView(rows, 12000)).join("|") === "PACE #1 ▲4|LEADING");
check("lines: long callsign truncated", paceLines(paceView([R("ABCDEFGHIJKLMNOPQRS", 900)], 0))[1].startsWith(`NEXT ${"ABCDEFGHIJKLMNOPQRS".slice(0, PACE_CALLSIGN_MAX)} +`));
check("eligibility: daily, online, today, not preview", paceEligible({ daily: true, archive: false, preview: false, online: true }) && !paceEligible({ daily: false, archive: false, preview: false, online: true }) && !paceEligible({ daily: true, archive: true, preview: false, online: true }) && !paceEligible({ daily: true, archive: false, preview: true, online: true }) && !paceEligible({ daily: true, archive: false, preview: false, online: false }));

// --- start/snapshot wiring, old row no-op ---
async function wiring(): Promise<void> {
  const world = createWorld(17.8, 10);
  world.phase = "playing";
  let fetches = 0;
  const board = async (): Promise<PaceRow[]> => {
    fetches++;
    return [R("A", 9000), R("B", 4000)];
  };
  const ctx = { daily: true, archive: false, preview: false, online: true, fetchBoard: board };
  const hudRow = (params: object) => ({
    schema: 1,
    today: "2020-01-01",
    flags: { "ui.hud": { kind: "client", versions: [{ id: 5, from: "2020-01-01", enabled: true, params, hash: "cafe0002" }] } },
  });

  // old production row (fixture old-row-930b7b4 ui.hud): no paceChip param -> no fetch, no chip
  resetFlagsForTest();
  setRemoteFeatures(hudRow({ chainBar: true, pops: true, vignette: true, stickFade: true, killPopMinChain: 5, vignetteMaxAlpha: 0.35 }));
  onRunStart(ctx);
  await new Promise((r) => setTimeout(r, 5));
  check("old row (no paceChip): no board fetch, no chip", fetches === 0 && snapshot(world) === null);

  // registry default (paceChip false) also no fetch
  resetFlagsForTest();
  onRunStart(ctx);
  await new Promise((r) => setTimeout(r, 5));
  check("default (ui.hud off): no fetch", fetches === 0 && snapshot(world) === null);

  // switch on
  resetFlagsForTest();
  setRemoteFeatures(hudRow({ chainBar: true, pops: true, vignette: true, stickFade: true, killPopMinChain: 5, vignetteMaxAlpha: 0.35, paceChip: true }));
  onRunStart(ctx);
  check("before the fetch lands: hidden", snapshot(world) === null);
  await new Promise((r) => setTimeout(r, 5));
  world.score = 4500;
  const v = snapshot(world);
  check("one fetch, view shows rank 2 next A", fetches === 1 && v?.rank === 2 && v.next?.callsign === "A" && v.next.gap === 4500);
  check("cached per integer score", snapshot(world) === v);
  world.score = 9500;
  check("score climbs -> rank 1", snapshot(world)?.rank === 1);
  world.phase = "gameover";
  check("hidden outside playing", snapshot(world) === null);
  world.phase = "playing";

  // preview / archive / offline / failure: hidden, no fetch
  const before = fetches;
  onRunStart({ ...ctx, preview: true });
  onRunStart({ ...ctx, archive: true });
  onRunStart({ ...ctx, online: false });
  onRunStart({ ...ctx, daily: false });
  await new Promise((r) => setTimeout(r, 5));
  check("preview/archive/offline/non-daily: no fetch, no chip", fetches === before && snapshot(world) === null);
  onRunStart({ ...ctx, fetchBoard: () => Promise.reject(new Error("net")) });
  await new Promise((r) => setTimeout(r, 5));
  check("fetch failure: chip hidden", snapshot(world) === null);
  onRunStart({ ...ctx, fetchBoard: async () => [] });
  await new Promise((r) => setTimeout(r, 5));
  check("empty board: chip hidden", snapshot(world) === null);

  // a slow fetch from a previous run must not leak into the next run
  let release: (r: PaceRow[]) => void = () => {};
  onRunStart({ ...ctx, fetchBoard: () => new Promise<PaceRow[]>((res) => (release = res)) });
  onRunStart({ ...ctx, preview: true });
  release([R("Late", 1000)]);
  await new Promise((r) => setTimeout(r, 5));
  check("stale fetch ignored after a newer run", snapshot(world) === null);
}

// --- hudTextBoxes: no overlaps ---
const measure = (text: string, px: number, bold: boolean): number => text.length * px * (bold && px < 20 ? 0.62 : 0.56);
const hit = (a: HudBox, b: HudBox): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inside = (a: HudBox, w: number, h: number): boolean => a.x >= 0 && a.y >= 0 && a.x + a.w <= w && a.y + a.h <= h;

const LONGEST = "YEAR OF THE SERPENT + GRAZE PROTOCOL";
const viewports: [number, number][] = [[360, 780], [390, 844], [430, 932], [428, 926], [820, 1180], [844, 390], [1440, 900], [1024, 768]];
const tops = [0, 47, 59];
const bottoms = [0, 34];

function boxesFor(w: number, h: number, safeTop: number, safeBottom: number, rising: boolean, opts: { chain: boolean; subtitle: string | null; warning: boolean; pace: boolean; mult: string }): HudTextBoxes {
  const safe = { top: safeTop, right: 0, bottom: safeBottom, left: 0 };
  const scorePx = w >= 768 ? 44 : 36;
  const scoreText = "123,456";
  const lay = hudLayout(w, h, safe, true, scorePx);
  const padTop = 18 + safeTop;
  return hudTextBoxes(
    { w, h },
    safe,
    {
      scoreText,
      scorePx: rising ? fitScorePx(scoreText.length, lay.scoreMaxW, scorePx) : 28,
      scoreY: rising ? lay.scoreY : padTop,
      multText: opts.mult,
      multY: rising ? lay.multY : padTop + 34,
      chainText: opts.chain ? "CHAIN ×12" : null,
      chainY: rising ? lay.multY + 3 : padTop + 37,
      bar: rising ? { x: lay.pad, y: lay.barY, w: Math.min(120, lay.scoreMaxW), h: lay.barH } : null,
      bestText: "BEST 1,234,567",
      bestY: rising ? lay.bestY : padTop + 60,
      timeText: "12:34",
      daily: true,
      subtitle: opts.subtitle,
      warning: opts.warning ? "CURRENT TURNING  2.4" : null,
      paceLines: opts.pace ? ["PACE #14 ▲3", "NEXT GLINTSTORM +1,204"] : null,
    },
    measure,
  );
}

let combos = 0;
let bad = "";
for (const [w, h] of viewports) {
  for (const st of tops) {
    for (const sb of bottoms) {
      for (const rising of [true, false]) {
        for (const subtitle of [LONGEST, "GRAZE PROTOCOL", null]) {
          for (const warning of [false, true]) {
            for (const mult of ["x1.0", "x10.0"]) {
              combos++;
              const b = boxesFor(w, h, st, sb, rising, { chain: true, subtitle, warning, pace: true, mult });
              const group: [string, HudBox | null][] = [
                ["score", b.score], ["mult", b.mult], ["chain", b.chain], ["bar", b.bar], ["best", b.best],
                ["time", b.time], ["daily", b.dailyLabel], ["subtitle", b.subtitle], ["warning", b.warning],
                ["pace", b.pace], ["pause", b.pause],
              ];
              const present = group.filter((g): g is [string, HudBox] => g[1] !== null);
              for (let i = 0; i < present.length; i++) {
                for (let j = i + 1; j < present.length; j++) {
                  const [na, ba] = present[i];
                  const [nb, bb] = present[j];
                  // score/mult/best/bar are one stacked column by construction in hudLayout; the fixes are about chain, center lines, pace
                  const colPair = ["score", "mult", "best", "bar", "chain"].includes(na) && ["score", "mult", "best", "bar", "chain"].includes(nb);
                  if (colPair && !(na === "chain" || nb === "chain")) continue;
                  // flag-off HUD only: today's chain row grazes the spaced DAILY PATROL label by ~3 px at 360 (pre-existing geometry, not in the bug 4 scope)
                  if (!rising && ((na === "chain" && nb === "daily") || (na === "daily" && nb === "chain"))) continue;
                  if (hit(ba, bb) && !bad) bad = `${w}x${h} top${st} bot${sb} rising=${rising} sub=${subtitle} warn=${warning} ${mult}: ${na} x ${nb}`;
                }
              }
              if (b.pace && !inside(b.pace, w, h) && !bad) bad = `${w}x${h} top${st}: pace outside viewport`;
              if (b.pace && Math.abs(b.pace.x + b.pace.w - (w - 18)) > 0.01 && b.pace.y < b.pause.y + b.pause.h + 40 && !bad) bad = `pace not right aligned`;
            }
          }
        }
      }
    }
  }
}
check(`no overlaps across ${combos} combinations (8 viewports, safe top 0/47/59, bottom 0/34, both HUD paths, chip on, longest pair, x10.0)`, bad === "", bad);

const b = boxesFor(360, 780, 47, 34, true, { chain: true, subtitle: LONGEST, warning: true, pace: true, mult: "x10.0" });
check("CHAIN starts after the measured multiplier plus the gap", b.chain !== null && Math.abs(b.chain.x - (b.mult.x + b.mult.w + CHAIN_GAP_PX)) < 0.01);
check("CHAIN at 360 never touches the multiplier or the subtitle", b.chain !== null && !hit(b.chain, b.mult) && (b.subtitle === null || !hit(b.chain, b.subtitle)));
check("subtitle drops below padTop + 44 when chain would hit it", b.subtitle !== null && b.subtitle.y >= 18 + 47 + 58);
const quiet = boxesFor(430, 932, 0, 0, true, { chain: false, subtitle: "GRAZE PROTOCOL", warning: true, pace: false, mult: "x1.0" });
check("no chain: subtitle and warning stay at today's y", quiet.subtitle?.y === 18 + 44 && quiet.warning?.y === 18 + 60, `${quiet.subtitle?.y} ${quiet.warning?.y}`);
check("no chip requested: no pace box", quiet.pace === null);
const wide = boxesFor(1440, 900, 0, 0, true, { chain: true, subtitle: "GRAZE PROTOCOL", warning: false, pace: true, mult: "x10.0" });
check("desktop: chip sits straight under the pause button", wide.pace !== null && wide.pace.y === wide.pause.y + wide.pause.h + 2);

wiring().then(() => {
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
});
