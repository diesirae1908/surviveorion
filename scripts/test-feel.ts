/**
 * Rising Gold in-run feel: pure helpers, layout, and the OFF path.
 * Run: npx tsx scripts/test-feel.ts
 */
import { PALETTE, SCORING } from "../src/config";
import { createWorld } from "../src/gameState";
import type { HudParams } from "../src/flags";
import {
  STICK_FADE_ALPHA,
  chainBarFill,
  chainBarFlicker,
  fitScorePx,
  hudLayout,
  hudHitStopMs,
  radarChevron,
  EDGE_RADAR_MAX,
  EDGE_RADAR_HORIZON_S,
  GRAZE_POP_MIN_GAP_MS,
  COUNT_POP_MIN_GAP_MS,
  countPop,
  killPopAllowed,
  onEvent,
  resetKillPopBudget,
  KILL_POP_MIN_GAP_MS,
  KILL_POP_AFTER_FIRE_MS,
  pickupLabelSuppressed,
  stickAlpha,
  vignetteAmount,
} from "../src/feel";
import type { Drone, FxContext, GameEvent } from "../src/types";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const HUD: HudParams = {
  chainBar: true,
  pops: true,
  vignette: true,
  stickFade: true,
  killPopMinChain: 5,
  vignetteMaxAlpha: 0.35,
};
const world = () => createWorld(17.8, 10);
const drone = (x: number, y: number, extra: Partial<Drone> = {}): Drone =>
  ({ x, y, prevX: x, prevY: y, vx: 0, vy: 0, scale: 1, speedMultiplier: 1, mass: 1, jitterSeed: 0, spin: 0, frozen: 0, alive: true, ...extra }) as Drone;

// chain bar
{
  const w = world();
  w.multiplier = 1;
  check("chainBarFill: x1 is empty", chainBarFill(w) === 0);
  w.multiplier = 3;
  w.multiplierDecayTimer = SCORING.multiplierDecayDelay;
  check("chainBarFill: full right after a kill", chainBarFill(w) === 1);
  w.multiplierDecayTimer = SCORING.multiplierDecayDelay / 2;
  check("chainBarFill: drains with the hold timer", Math.abs(chainBarFill(w) - 0.5) < 1e-9);
  w.multiplierDecayTimer = 0;
  check("chainBarFill: empty once decaying", chainBarFill(w) === 0);
  w.multiplier = 1.5;
  w.multiplierDecayTimer = 0.3;
  check("chainBarFlicker: below x2 and nearly out", chainBarFlicker(w));
  w.multiplierDecayTimer = 1.5;
  check("chainBarFlicker: calm while the timer is high", !chainBarFlicker(w));
  w.multiplier = 4;
  w.multiplierDecayTimer = 0.3;
  check("chainBarFlicker: never at x2 and above", !chainBarFlicker(w));
}

// stick
check("stickAlpha: flag off is always 1", stickAlpha(5, false, null) === 1 && stickAlpha(5, true, null) === 1);
check("stickAlpha: stickFade false is always 1", stickAlpha(5, true, { ...HUD, stickFade: false }) === 1);
check("stickAlpha: full for the first second", stickAlpha(0.5, false, HUD) === 1 && stickAlpha(1, false, HUD) === 1);
check("stickAlpha: dims to the floor", Math.abs(stickAlpha(3, false, HUD) - STICK_FADE_ALPHA) < 1e-9);
check("stickAlpha: eases between", stickAlpha(1.2, false, HUD) < 1 && stickAlpha(1.2, false, HUD) > STICK_FADE_ALPHA);
check("stickAlpha: hidden when idle", stickAlpha(0.1, true, HUD) === 0);

// vignette
{
  const w = world();
  w.ship.x = 0;
  w.ship.y = 0;
  check("vignetteAmount: empty field is 0", vignetteAmount(w) === 0);
  w.drones.push(drone(50, 50), drone(0.5, 0.2), drone(0.3, -0.3, { frozen: 2 }), drone(0.2, 0.2, { alive: false }));
  const one = vignetteAmount(w);
  check("vignetteAmount: counts only near, live, mobile drones", one > 0 && one < 1, String(one));
  for (let i = 0; i < 6; i++) w.drones.push(drone(0.4, 0.4));
  check("vignetteAmount: saturates at 1", vignetteAmount(w) === 1);
}

// kill pop gate
check("killPopAllowed: needs the chain", !killPopAllowed(4, HUD, "full") && killPopAllowed(5, HUD, "full"));
check("killPopAllowed: flag off", !killPopAllowed(20, null, "full"));
check("killPopAllowed: pops false", !killPopAllowed(20, { ...HUD, pops: false }, "full"));
check("killPopAllowed: lite", !killPopAllowed(20, HUD, "lite"));
check("killPopAllowed: respects killPopMinChain", killPopAllowed(2, { ...HUD, killPopMinChain: 2 }, "full"));

// layout: never overlaps the pause button or the time readout, stays on screen
{
  const viewports: Array<[number, number]> = [[390, 844], [428, 926], [1440, 900], [1024, 768]];
  const tops = [0, 47, 59];
  const bottoms = [0, 34];
  let bad = "";
  for (const [w, h] of viewports) {
    for (const top of tops) {
      for (const bottom of bottoms) {
        for (const daily of [false, true]) {
          const px = w >= 768 ? 40 : 34;
          const safe = { top, right: 0, bottom, left: 0 };
          const L = hudLayout(w, h, safe, daily, px);
          // widest realistic score (8 chars) after fitting
          const fitted = fitScorePx(8, L.scoreMaxW, px);
          const textRight = L.pad + 8 * 0.56 * fitted;
          const blockBottom = L.bestY + 14;
          const p = L.pauseRect;
          const hitsPause = textRight > p.x && blockBottom > p.y;
          const timeLeft = w / 2 - 24;
          const hitsTime = textRight > timeLeft && L.scoreY < 30 + top;
          const topOk = L.scoreY >= top && L.multY > L.scoreY + fitted * 0.9 && L.barY > L.multY + 18 && L.bestY > L.barY + L.barH;
          const bottomOk = L.leftRect.h < L.bottomLimit - 120;
          if (hitsPause || hitsTime || !topOk || !bottomOk) bad += ` ${w}x${h}/t${top}/b${bottom}/${daily ? "d" : "n"}`;
        }
      }
    }
  }
  check("hudLayout: no overlap with pause/time, ordered, in bounds", bad === "", bad);
  const L = hudLayout(390, 844, { top: 59, right: 0, bottom: 34, left: 0 }, false, 34);
  check("hudLayout: keeps today's corner padding", L.pad === 18 && L.padTop === 18 + 59 && L.bottomLimit === 844 - 34);
  check("fitScorePx: shrinks a long score, never grows", fitScorePx(12, 150, 34) < 34 && fitScorePx(3, 150, 34) === 34);
}

// OFF path and ON path through onEvent
type Call = [string, ...unknown[]];
function run(e: GameEvent, hud: HudParams | null, effects: "full" | "lite", chain: number, odFx: unknown = null): Call[] {
  const calls: Call[] = [];
  const w = world();
  w.chainCount = chain;
  const ctx = {
    world: w,
    particles: {
      burst: (...a: unknown[]) => calls.push(["burst", ...a]),
      grazeArc: (...a: unknown[]) => calls.push(["grazeArc", ...a]),
      ringPulse: (...a: unknown[]) => calls.push(["ring", ...a]),
    },
    popups: {
      spawn: (...a: unknown[]) => calls.push(["popup", ...a]),
      spawnRising: (...a: unknown[]) => calls.push(["rising", ...a]),
    },
    audio: { droneKill: () => calls.push(["droneKill"]), graze: () => calls.push(["grazeSfx"]) },
    holdSim: () => {},
    flags: { overdriveFx: odFx, hud, result: null },
    effects,
  } as unknown as FxContext;
  onEvent(e, ctx);
  return calls;
}
let clockNow = 1000;
resetKillPopBudget(() => clockNow);
const kill: GameEvent = { type: "droneKilled", x: 1, y: 2, scale: 1, wasFrozen: false, points: 120 };
const graze: GameEvent = { type: "graze", x: 3, y: 1, points: 42 };
const names = (c: Call[]) => c.map((x) => x[0]).join(",");
function advance(ms: number): void {
  clockNow += ms;
}
check("OFF: kill is burst + sfx, even deep in a chain", names(run(kill, null, "full", 30)) === "burst,droneKill");
check("OFF: graze unchanged (burst, arc, sfx, popup)", names(run(graze, null, "full", 0)) === "burst,grazeArc,grazeSfx,popup");
check("ON: short chain kill has no pop", names(run(kill, HUD, "full", 2)) === "burst,droneKill");
{
  const c = run(kill, HUD, "full", 7);
  check("ON: chain kill adds a rising +N", names(c) === "burst,droneKill,rising" && c[2][3] === "+120" && c[2][4] === PALETTE.goldPale);
}
{
  // budget: 30 kills in one tick yield one pop; one more after the gap
  advance(1000);
  let pops = 0;
  for (let i = 0; i < 30; i++) pops += run(kill, HUD, "full", 20).filter((c) => c[0] === "rising").length;
  check("ON: 30 kills in one tick make 1 pop", pops === 1, String(pops));
  advance(KILL_POP_MIN_GAP_MS);
  check("ON: next pop after the gap", run(kill, HUD, "full", 20).some((c) => c[0] === "rising"));
  // overdriveFire suppresses pops for KILL_POP_AFTER_FIRE_MS
  advance(1000);
  const fxOn = { heatTint: true, formPopup: true, stings: true };
  run({ type: "overdriveFire", power: "pulse", x: 0, y: 0, form: true } as unknown as GameEvent, HUD, "full", 20, fxOn);
  advance(KILL_POP_AFTER_FIRE_MS - 10);
  check("ON: no pop right after a fire (overdriveFx formPopup on)", !run(kill, HUD, "full", 20, fxOn).some((c) => c[0] === "rising"));
  check("ui.hud on + overdriveFx off: kill pops keep showing after a fire", run(kill, HUD, "full", 20, null).some((c) => c[0] === "rising"));
  advance(1000);
  advance(20);
  check("ON: pop resumes after the fire window", run(kill, HUD, "full", 20, fxOn).some((c) => c[0] === "rising"));
  advance(1000);
}
{
  // form fire: graze pops hold back for the window, only with ui.overdriveFx formPopup on; pickup label dropped
  const fx = { heatTint: true, formPopup: true, stings: true };
  const fire = { type: "overdriveFire", power: "pulse", x: 0, y: 0, form: true } as unknown as GameEvent;
  advance(1000);
  run(fire, HUD, "full", 0, fx);
  check("fire window: graze pop suppressed (fx on)", !names(run(graze, HUD, "full", 0, fx)).includes("popup"));
  check("fire window: graze pop kept when overdriveFx is off", names(run(graze, HUD, "full", 0, null)).includes("popup"));
  advance(KILL_POP_AFTER_FIRE_MS + 10);
  check("after the window: graze pop back", names(run(graze, HUD, "full", 0, fx)).includes("popup"));
  check("window is 500 ms", KILL_POP_AFTER_FIRE_MS === 500);
  const ctxOf = (o: unknown) => ({ flags: { overdriveFx: o } }) as unknown as FxContext;
  const evs = [{ type: "pickup", power: "pulse", x: 0, y: 0 }, fire] as unknown as GameEvent[];
  check("pickup label dropped for the form's own pickup", pickupLabelSuppressed(evs, "pulse", ctxOf(fx)));
  check("pickup label kept: other power", !pickupLabelSuppressed(evs, "shield", ctxOf(fx)));
  check("pickup label kept: burst-only fire", !pickupLabelSuppressed([{ ...(fire as object), form: false } as unknown as GameEvent], "pulse", ctxOf(fx)));
  check("pickup label kept: fx off", !pickupLabelSuppressed(evs, "pulse", ctxOf(null)));
  advance(1000);
}
check("ON + lite: no pop, no ring", names(run(kill, HUD, "lite", 9)) === "burst,droneKill" && names(run(graze, HUD, "lite", 0)) === "burst,grazeArc,grazeSfx,popup");
advance(200); // bug 5: popups coalesce within 150 ms
check("ON: graze adds a gold ring", names(run(graze, HUD, "full", 0)) === "burst,grazeArc,grazeSfx,popup,ring");
advance(200);
check("ON pops=false: graze has no ring", names(run(graze, { ...HUD, pops: false }, "full", 0)) === "burst,grazeArc,grazeSfx,popup");

// --- WS-K: shield hit-stop, graze coalescing (bug 5), edge radar math ---
{
  const timers: { fn: () => void; at: number; id: number }[] = [];
  let nextId = 1;
  let t = 5000;
  resetKillPopBudget(() => t, {
    set: (fn, ms) => {
      const id = nextId++;
      timers.push({ fn, at: t + ms, id });
      return id;
    },
    clear: (h) => {
      const i = timers.findIndex((x) => x.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const tick = (ms: number) => {
    t += ms;
    for (const x of timers.filter((q) => q.at <= t).sort((a, b) => a.at - b.at)) {
      timers.splice(timers.indexOf(x), 1);
      x.fn();
    }
  };
  const holds: number[] = [];
  const pops: string[] = [];
  const bursts: unknown[][] = [];
  const mk = (hud: HudParams | null, effects: "full" | "lite" = "full"): FxContext =>
    ({
      world: world(),
      particles: { burst: (...a: unknown[]) => bursts.push(a), grazeArc() {}, ringPulse() {} },
      popups: { spawn: (_x: number, _y: number, text: string) => pops.push(text), spawnRising() {} },
      audio: { droneKill() {}, graze() {} },
      holdSim: (ms: number) => holds.push(ms),
      flags: { overdriveFx: null, hud, result: null },
      effects,
    }) as unknown as FxContext;
  const det: GameEvent = { type: "shieldDetonate", x: 1, y: 1 };

  onEvent(det, mk(null));
  check("hit-stop: old row (hud null) does nothing", holds.length === 0 && bursts.length === 0);
  onEvent(det, mk({ ...HUD }));
  check("hit-stop: hitStop absent = no hold", holds.length === 0);
  onEvent(det, mk({ ...HUD, hitStop: true }));
  check("hit-stop: on holds the default 60 ms", holds.length === 1 && holds[0] === 60);
  onEvent(det, mk({ ...HUD, hitStop: true, hitStopShieldMs: 90 }));
  check("hit-stop: registry ms is used", holds[1] === 90);
  onEvent(det, mk({ ...HUD, hitStop: true }, "lite"));
  check("hit-stop: lite effects get none", holds.length === 2);
  check("hit-stop: ms clamped to [0,150]", hudHitStopMs({ ...HUD, hitStopShieldMs: 900 }) === 150 && hudHitStopMs({ ...HUD, hitStopShieldMs: -5 }) === 0);
  const before = bursts.length;
  onEvent(det, mk({ ...HUD, pops: true, hitStop: false }));
  check("shield shards follow hud.pops", bursts.length === before + 1);
  onEvent(det, mk({ ...HUD, pops: false, hitStop: true }));
  check("no shards with pops off", bursts.length === before + 1);

  // graze coalescing: 10 grazes 20 ms apart, 10 pts each
  pops.length = 0;
  resetKillPopBudget(undefined);
  const g = (p: number): GameEvent => ({ type: "graze", x: 0, y: 0, points: p });
  for (let i = 0; i < 10; i++) {
    onEvent(g(10), mk(null));
    if (i < 9) tick(20);
  }
  tick(GRAZE_POP_MIN_GAP_MS + 5);
  const shown = pops.reduce((a, x) => a + Number(x.replace("+", "")), 0);
  check("graze: popups coalesce (fewer than grazes)", pops.length > 0 && pops.length <= 3, `${pops.length} popups`);
  check("graze: shown total equals earned total", shown === 100, `shown ${shown}`);
  check("graze: first graze pops at once", pops[0] === "+10");
  // spaced grazes are untouched
  pops.length = 0;
  for (let i = 0; i < 3; i++) {
    onEvent(g(7), mk(null));
    tick(GRAZE_POP_MIN_GAP_MS + 1);
  }
  check("graze: spaced grazes pop one each", pops.join() === "+7,+7,+7");
  check("graze gap is 150 ms", GRAZE_POP_MIN_GAP_MS === 150);

  // CHAIN / PULSE xN: 35 events in 0.5 s show at most 2 pops (first + trailing), latest value wins
  resetKillPopBudget(undefined);
  pops.length = 0;
  for (let i = 1; i <= 35; i++) {
    countPop(mk(null), "chain", i, 0, 0);
    if (i < 35) tick(14);
  }
  tick(COUNT_POP_MIN_GAP_MS + 5);
  check("count pops: 35 chain events in 0.5 s make at most 3 pops", pops.length >= 1 && pops.length <= 3, String(pops.length));
  check("count pops: first shows at once, trailing shows the latest value", pops[0] === "CHAIN \u00d71" && pops[pops.length - 1] === "CHAIN \u00d735", pops.join("|"));
  tick(2 * COUNT_POP_MIN_GAP_MS);
  pops.length = 0;
  countPop(mk(null), "pulse", 3, 0, 0);
  countPop(mk(null), "chain", 4, 0, 0);
  check("count pops: kinds are independent", pops.join("|") === "PULSE \u00d73|CHAIN \u00d74");
  tick(2 * COUNT_POP_MIN_GAP_MS);
  pops.length = 0;
  for (let i = 0; i < 3; i++) {
    countPop(mk(null), "pulse", 2 + i, 0, 0);
    tick(COUNT_POP_MIN_GAP_MS + 1);
  }
  check("count pops: spaced events pop one each", pops.length === 3, String(pops.length));
  check("count pop gap is 300 ms", COUNT_POP_MIN_GAP_MS === 300);
  resetKillPopBudget(() => clockNow);
}
{
  const near = radarChevron(1, 4);
  const far = radarChevron(10, 1);
  check("radar: imminent beats distant (alpha, size)", near.alpha > far.alpha && near.size > far.size);
  let mono = true;
  let prev = radarChevron(0, 3);
  for (let d = 0.25; d <= 12; d += 0.25) {
    const c = radarChevron(d, 3);
    if (c.alpha > prev.alpha + 1e-12 || c.size > prev.size + 1e-12) mono = false;
    prev = c;
  }
  check("radar: alpha and size fall monotonically with distance", mono);
  check("radar: tti clamped to 0..3 s", radarChevron(0, 5).tti === 0 && radarChevron(99, 1).tti === EDGE_RADAR_HORIZON_S && radarChevron(5, 0).tti === EDGE_RADAR_HORIZON_S);
  const c0 = radarChevron(0, 3);
  check("radar: alpha within 0..1", c0.alpha <= 1 && radarChevron(99, 0).alpha >= 0.3);
  check("radar cap is 24", EDGE_RADAR_MAX === 24);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
