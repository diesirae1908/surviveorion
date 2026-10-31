/**
 * WS-K sky: tint by mutator, switch gating, resize debounce, parallax, plan.
 * Run: npx tsx scripts/test-sky.ts
 */
import { MUTATOR_POOL } from "../src/mutators";
import { createWorld } from "../src/gameState";
import type { ClientFlags } from "../src/flags";
import {
  PARALLAX_FAR,
  PARALLAX_NEAR,
  SKY_RESIZE_DEBOUNCE_MS,
  SKY_TOKEN_COLORS,
  SkyScheduler,
  drawSky,
  hashTint,
  parallaxOffset,
  planSky,
  skyEnabled,
  skyTintFor,
  skyTintOf,
  type SkyKey,
} from "../src/sky";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

// tint: every pool entry maps to token colors
{
  let ok = true;
  const seen = new Set<string>();
  for (const m of MUTATOR_POOL) {
    const t = skyTintOf(m);
    seen.add(t.name);
    if (!SKY_TOKEN_COLORS.has(t.color) || !SKY_TOKEN_COLORS.has(t.accent) || t.alpha <= 0 || t.alpha > 0.5) ok = false;
  }
  check("skyTintOf: every MUTATOR_POOL entry returns token colors", ok, `${MUTATOR_POOL.length} entries`);
  check("skyTintOf: the pool shows at least 3 distinct looks", seen.size >= 3, [...seen].join());
  const byId = (id: string) => MUTATOR_POOL.find((m) => m.id === id)!;
  check("override flags win: redTint is red, blackoutPulse is void, meteor rain is gold", skyTintOf(byId("red-alert")).name === "red" && skyTintOf(byId("blackout")).name === "void" && skyTintOf(byId("starfall")).name === "gold");
  check("flood surge is red", skyTintOf(byId("the-flood")).name === "red");
}
{
  const fake = { id: "future-day", tags: [], overrides: {} } as never;
  const t = skyTintOf(fake);
  check("unknown mutator falls back to a hashed token tint", SKY_TOKEN_COLORS.has(t.color) && hashTint("future-day") === t.name);
  check("hash is stable", hashTint("abc") === hashTint("abc"));
  const none = skyTintFor([]);
  check("no mutators: neutral void", none.far.name === "void" && none.near.name === "void");
  const pair = skyTintFor([MUTATOR_POOL.find((m) => m.id === "red-alert")!, MUTATOR_POOL.find((m) => m.id === "starfall")!]);
  check("Sunday pair: second mutator tints the near layer", pair.far.name === "red" && pair.near.name === "gold");
}

// switch gating
{
  const w = createWorld(17.8, 10);
  const base = {
    viewport: { cssW: 800, cssH: 450, viewW: 17.8, viewH: 10 },
    field: { scale: 45, ox: 0, oy: 0, fieldCssW: 800, fieldCssH: 450 },
    world: w,
    mutators: [],
    uiTime: 0,
  };
  const on = { hud: { sky: true } } as unknown as ClientFlags;
  const off = { hud: { sky: false } } as unknown as ClientFlags;
  const none = { hud: null } as unknown as ClientFlags;
  const ctx = {} as CanvasRenderingContext2D;
  check("off returns false", drawSky(ctx, { ...base, flags: off, effects: "full" }) === false);
  check("old row (hud null) returns false", drawSky(ctx, { ...base, flags: none, effects: "full" }) === false);
  check("lite effects return false even when on", drawSky(ctx, { ...base, flags: on, effects: "lite" }) === false);
  check("skyEnabled only for on + full", skyEnabled(on, "full") && !skyEnabled(on, "lite") && !skyEnabled(off, "full") && !skyEnabled(none, "full"));
  check("no canvas (node): falls back to stars rather than throwing", drawSky(ctx, { ...base, flags: on, effects: "full" }) === false);
}

// debounce
{
  const s = new SkyScheduler();
  const k = (viewW: number, far: SkyKey["far"] = "void"): SkyKey => ({ viewW, viewH: 10, scale: 40, far, near: far });
  check("first build is immediate", s.shouldBuild(k(17.8), 0) === true);
  check("same key: no rebuild", s.shouldBuild(k(17.8), 10) === false);
  check("resize waits", s.shouldBuild(k(16), 100) === false);
  check("resize still waiting inside the window", s.shouldBuild(k(16), 100 + SKY_RESIZE_DEBOUNCE_MS - 1) === false);
  check("resize builds after 200 ms stable", s.shouldBuild(k(16), 100 + SKY_RESIZE_DEBOUNCE_MS) === true);
  check("a moving resize restarts the timer", s.shouldBuild(k(15), 1000) === false && s.shouldBuild(k(14), 1150) === false && s.shouldBuild(k(14), 1300) === false && s.shouldBuild(k(14), 1350) === true);
  check("tint change builds at once", s.shouldBuild(k(14, "red"), 1400) === true);
  check("debounce is 200 ms", SKY_RESIZE_DEBOUNCE_MS === 200);
}

// parallax
{
  const a = parallaxOffset(0, 0, 8.9, 5, PARALLAX_NEAR);
  check("parallax: centered ship = no offset", a.x === 0 && a.y === 0);
  const e = parallaxOffset(8.9, -5, 8.9, 5, PARALLAX_NEAR);
  check("parallax: edge = max travel, opposite direction", Math.abs(e.x + PARALLAX_NEAR) < 1e-9 && Math.abs(e.y - PARALLAX_NEAR) < 1e-9);
  const o = parallaxOffset(99, 99, 8.9, 5, PARALLAX_FAR);
  check("parallax: clamped outside the arena", Math.abs(o.x) <= PARALLAX_FAR && Math.abs(o.y) <= PARALLAX_FAR);
  check("far layer moves less than near", PARALLAX_FAR === 0.4 && PARALLAX_NEAR === 0.8);
}

// plan: deterministic with injected rng, covers the overscan, bounded size
{
  let seed = 7;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = planSky(17.8, 10, rng);
  check("plan covers the view plus parallax overscan", p.w >= 17.8 + 2 * PARALLAX_NEAR && p.h >= 10 + 2 * PARALLAX_NEAR);
  check("plan has band + clouds, dust and flares", p.blobs.length >= 8 && p.dust.length > 100 && p.flares.length >= 5);
  check("plan points stay inside the layer", p.dust.every((d) => Math.abs(d.x) <= p.w / 2 && Math.abs(d.y) <= p.h / 2));
  const big = planSky(40, 22.5);
  check("dust count scales with area but stays bounded", big.dust.length < 6000, `${big.dust.length}`);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
