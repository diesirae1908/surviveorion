/**
 * OVERDRIVE presentation checks: ring sweep, heat predicate, form labels,
 * and "nothing happens when ui.overdriveFx is off". Run: npx tsx scripts/test-overdrive-fx.ts
 */
import assert from "node:assert/strict";
import { PALETTE } from "../src/config.ts";
import { clearActiveMutators, getMutatorById, setActiveMutators } from "../src/mutators.ts";
import {
  BURST_NAME,
  DEFAULT_HOT_RADIUS,
  HEAT_INNER,
  drawDroneTint,
  drawShipOverlay,
  formLabel,
  isHeated,
  onEvent,
  ringSweep,
} from "../src/fx/overdriveFx.ts";
import { firstFlightHint, FIRST_FLIGHT_OVERDRIVE_HINT } from "../src/save.ts";
import type { FxContext, GameEvent, World } from "../src/types.ts";

// ring angle
assert.equal(ringSweep(0), 0);
assert.equal(ringSweep(0.5), Math.PI);
assert.equal(ringSweep(1), Math.PI * 2);
assert.equal(ringSweep(2), Math.PI * 2);
assert.equal(ringSweep(-1), 0);

// form labels
const expect: Record<string, string> = {
  pulse: "PULSE FAN",
  shield: "SHIELD NOVA",
  freeze: "CRYO CHAIN",
  magnet: "MAGNET SWEEP",
  shockwave: "ECHO WAVE",
  missiles: "MISSILE STORM",
  starshell: "STAR NOVA",
  arc: "ARC STORM",
  autocannon: "TWIN CANNON",
  meteors: "METEOR SIEGE",
  razor: "BLADE DANCE",
  thunder: "THUNDER WALL",
  cloak: "GHOST BOMBS",
  flare: "LONG FLARE",
  ion: "ION SURGE",
  howlers: "PACK HOWL",
  vortex: "DEEP VORTEX",
};
for (const [p, label] of Object.entries(expect)) {
  assert.equal(formLabel(p as never, true), label);
  assert.equal(formLabel(p as never, false), BURST_NAME);
}
assert.equal(formLabel("afterburner", true), BURST_NAME);
assert.equal(BURST_NAME, "OVERDRIVE");

// heat predicate
const fxOn = { heatTint: true, formPopup: true, stings: true };
const mkWorld = (hot: boolean, hotRadius?: number) =>
  ({
    ship: { x: 0, y: 0 },
    overdrive: { charge: hot ? 1 : 0.3, hot },
    rules: { overdrive: hotRadius === undefined ? null : { hotRadius } },
  }) as unknown as World;
const drone = (x: number, y: number, extra: object = {}) => ({ x, y, frozen: 0, ...extra }) as never;
assert.equal(isHeated(mkWorld(true, 3), drone(2.9, 0), fxOn), true);
assert.equal(isHeated(mkWorld(true, 3), drone(3.1, 0), fxOn), false);
assert.equal(isHeated(mkWorld(true), drone(DEFAULT_HOT_RADIUS - 0.1, 0), fxOn), true);
assert.equal(isHeated(mkWorld(false, 3), drone(1, 0), fxOn), false, "not hot");
assert.equal(isHeated(mkWorld(true, 3), drone(1, 0), null), false, "switch off");
assert.equal(isHeated(mkWorld(true, 3), drone(1, 0), { ...fxOn, heatTint: false }), false, "heatTint off");
assert.equal(isHeated(mkWorld(true, 3), drone(1, 0, { allied: true }), fxOn), false);
assert.equal(isHeated(mkWorld(true, 3), drone(1, 0, { frozen: 1 }), fxOn), false);
assert.equal(isHeated(mkWorld(true, 3), drone(1, 0, { assembly: {} }), fxOn), false);
assert.equal(drawDroneTint(mkWorld(true, 3), drone(1, 0), PALETTE.redBright, fxOn), HEAT_INNER);
assert.notEqual(HEAT_INNER, PALETTE.redBright);
assert.equal(drawDroneTint(mkWorld(false, 3), drone(1, 0), PALETTE.redBright, fxOn), PALETTE.redBright);

// always-hot tint (OVERCHARGE + alwaysHotScale > 1): near drones read heated even when the ship is not HOT
{
  const ahWorld = (scale: number | undefined, hooks = true) =>
    ({
      ship: { x: 0, y: 0 },
      overdrive: { charge: 0.3, hot: false },
      rules: { overdrive: { hotRadius: 3, mutatorHooks: hooks, alwaysHotScale: scale } },
    }) as unknown as World;
  setActiveMutators([getMutatorById("overcharge")!], "2026-12-09");
  assert.equal(isHeated(ahWorld(1.5), drone(2, 0), fxOn), true, "always hot: tinted");
  assert.equal(isHeated(ahWorld(1.5), drone(3.5, 0), fxOn), false, "always hot: outside hotRadius");
  assert.equal(isHeated(ahWorld(1.5), drone(2, 0), { ...fxOn, heatTint: false }), false, "always hot: heatTint off");
  assert.equal(isHeated(ahWorld(1), drone(2, 0), fxOn), false, "alwaysHotScale 1 = no tint");
  assert.equal(isHeated(ahWorld(undefined), drone(2, 0), fxOn), false, "older row = no tint");
  assert.equal(isHeated(ahWorld(1.5, false), drone(2, 0), fxOn), false, "mutatorHooks off = no tint");
  clearActiveMutators();
  assert.equal(isHeated(ahWorld(1.5), drone(2, 0), fxOn), false, "no OVERCHARGE = no tint");
}

// events: recorder context
function recorder(fx: typeof fxOn | null, effects: "full" | "lite" = "full") {
  const log = { bursts: 0, rings: 0, popups: [] as string[], sounds: [] as string[] };
  const ctx = {
    world: { ship: { x: 1, y: 2 } },
    particles: { burst: () => void log.bursts++, ringPulse: () => void log.rings++ },
    popups: { spawn: (_x: number, _y: number, t: string) => void log.popups.push(t) },
    audio: {
      overdriveHot: () => void log.sounds.push("hot"),
      overdriveFire: () => void log.sounds.push("fire"),
      overdriveCool: () => void log.sounds.push("cool"),
    },
    holdSim: () => {},
    flags: { overdriveFx: fx, hud: null, result: null },
    effects,
  } as unknown as FxContext;
  return { ctx, log };
}
const hot: GameEvent = { type: "overdriveHot" };
const cool: GameEvent = { type: "overdriveCool" };
const fire = (power: string, form: boolean) => ({ type: "overdriveFire", power, x: 0, y: 0, form }) as GameEvent;

// off: nothing emitted
{
  const { ctx, log } = recorder(null);
  for (const e of [hot, cool, fire("pulse", true)]) onEvent(e, ctx);
  assert.deepEqual(log, { bursts: 0, rings: 0, popups: [], sounds: [] });
}
// on: popups per form and burst; stings gated
{
  const { ctx, log } = recorder(fxOn);
  onEvent(hot, ctx);
  onEvent(cool, ctx);
  for (const [p, label] of Object.entries(expect)) onEvent(fire(p, true), ctx);
  onEvent(fire("pulse", false), ctx);
  assert.deepEqual(log.popups, [...Object.values(expect), "OVERDRIVE"]);
  assert.equal(log.sounds[0], "hot");
  assert.equal(log.rings, 1, "ring pulses once when HOT starts");
  assert.ok(log.bursts >= 8);
}
{
  const { ctx, log } = recorder({ heatTint: true, formPopup: false, stings: false });
  onEvent(hot, ctx);
  onEvent(fire("pulse", true), ctx);
  assert.deepEqual(log.popups, []);
  assert.deepEqual(log.sounds, []);
  assert.ok(log.bursts > 0);
}

// ship overlay draws nothing when off, or when empty and not HOT
{
  let calls = 0;
  const g = new Proxy({}, { get: () => () => void calls++ }) as unknown as CanvasRenderingContext2D;
  const opts = (fx: typeof fxOn | null) => ({ flags: { overdriveFx: fx }, effects: "full", uiTime: 0 }) as never;
  drawShipOverlay(g, mkWorld(true, 3), opts(null), 0, 0, 40);
  assert.equal(calls, 0, "off draws nothing");
  const empty = { ...mkWorld(false, 3), overdrive: { charge: 0, hot: false } } as World;
  drawShipOverlay(g, empty, opts(fxOn), 0, 0, 40);
  assert.equal(calls, 0, "empty ring draws nothing");
  drawShipOverlay(g, mkWorld(false, 3), opts(fxOn), 0, 0, 40);
  assert.ok(calls > 0, "charged ring draws");
}

// First Flight line
assert.equal(firstFlightHint(10, true), "Grab the glowing orb, it fires itself");
assert.equal(firstFlightHint(10, true, true), FIRST_FLIGHT_OVERDRIVE_HINT);
assert.equal(firstFlightHint(1, true, true), "Drag anywhere to fly");
assert.ok(!FIRST_FLIGHT_OVERDRIVE_HINT.includes("—"));

console.log("PASS overdrive presentation");
