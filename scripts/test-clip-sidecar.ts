// Clip sidecar basename + JSON shape, tsx style (see test-highlights.ts).
//
//   npx tsx scripts/test-clip-sidecar.ts

import { FIXED_DT } from "../src/config";
import {
  buildClipSidecar,
  CLIP_TRACK_CAP,
  CLIP_TRACK_INTERVAL,
  clipSidecarBasename,
  clipSidecarMutatorSlot,
  isDesktopChrome,
  isIosWebKit,
  roundTrackCoord,
  sampleShipTrack,
  sidecarMedal,
  type ClipSidecarInput,
  type ClipSidecarTrackSample,
} from "../src/clipSidecar";
import { createWorld, tick } from "../src/gameState";
import type { InputState } from "../src/input";
import { medalThresholdsFor } from "../src/medals";
import { getMutatorById } from "../src/mutators";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failures++;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function checkJson(label: string, actual: unknown, expected: unknown): void {
  const aJson = JSON.stringify(actual);
  const eJson = JSON.stringify(expected);
  if (aJson !== eJson) {
    failures++;
    console.error(`FAIL ${label}: expected ${eJson}, got ${aJson}`);
  }
}

const blackout = getMutatorById("blackout");
const giants = getMutatorById("giants");
if (!blackout || !giants) {
  console.error("FAIL: blackout/giants missing from MUTATOR_POOL");
  process.exit(1);
}

const now = new Date(Date.UTC(2026, 7, 24)); // 2026-08-24
const sunday = new Date(Date.UTC(2026, 7, 23)); // 2026-08-23, a Sunday

const closest = { time: 84.2, x: 3, y: 4, clearance: 0.1 };
const grazeA = { time: 10, x: 1, y: 2, clearance: 0.4 };
const grazeB = { time: 20, x: 8, y: 9, clearance: 0.2 };

const dailySunday: ClipSidecarInput = {
  score: 125_000.9,
  survivalTime: 91.5,
  closestCall: closest,
  topGrazes: [grazeB, grazeA],
  track: [],
  arena: { w: 17.8, h: 10 },
  view: { w: 1280, h: 720 },
  mutators: [blackout, giants],
  daily: true,
  gameMode: "classic",
  now: sunday,
};

check("Sunday mutator slot joins with +", clipSidecarMutatorSlot(dailySunday), "blackout+giants");
check(
  "Sunday basename uses + and integer score",
  clipSidecarBasename(dailySunday),
  "orion_2026-08-23_day41_blackout+giants_125000",
);

const emptyDaily: ClipSidecarInput = {
  ...dailySunday,
  mutators: [],
  now,
  score: 10,
};
check("empty daily mutators: none", clipSidecarMutatorSlot(emptyDaily), "none");
check("empty daily basename uses none", clipSidecarBasename(emptyDaily), "orion_2026-08-24_day42_none_10");

const fullgame: ClipSidecarInput = {
  score: 9_999,
  survivalTime: 30,
  closestCall: null,
  topGrazes: [],
  track: [[0, 0, 0]],
  arena: { w: 20, h: 12 },
  view: { w: 390, h: 844 },
  mutators: [],
  daily: false,
  gameMode: "ironrain",
  now,
};
check("fullgame mutator slot is game mode", clipSidecarMutatorSlot(fullgame), "ironrain");
check(
  "fullgame basename uses runGameMode",
  clipSidecarBasename(fullgame),
  "orion_2026-08-24_day42_ironrain_9999",
);

const payload = buildClipSidecar(dailySunday);
check("day is dailyNumber for that UTC date", payload.day, 41);
checkJson("mutatorIds", payload.mutatorIds, ["blackout", "giants"]);
checkJson("mutatorNames", payload.mutatorNames, [blackout.name, giants.name]);
check("score is floored", payload.score, 125000);
check("survivalTime is world.time", payload.survivalTime, 91.5);
checkJson("closestCall keeps x/y", payload.closestCall, closest);

const grazes = payload.topGrazes as Array<Record<string, unknown>>;
check("topGrazes length", grazes.length, 2);
check("topGrazes omits x", Object.prototype.hasOwnProperty.call(grazes[0], "x"), false);
check("topGrazes omits y", Object.prototype.hasOwnProperty.call(grazes[0], "y"), false);
checkJson("topGrazes is time+clearance only", payload.topGrazes, [
  { time: 20, clearance: 0.2 },
  { time: 10, clearance: 0.4 },
]);
checkJson("empty track ships as []", payload.track, []);
checkJson("arena is run-start world size", payload.arena, { w: 17.8, h: 10 });
checkJson("view is run-start CSS pixels", payload.view, { w: 1280, h: 720 });

const fullPayload = buildClipSidecar(fullgame);
checkJson("track copies samples", fullPayload.track, [[0, 0, 0]]);
checkJson("fullgame arena", fullPayload.arena, { w: 20, h: 12 });
checkJson("fullgame view", fullPayload.view, { w: 390, h: 844 });
fullgame.track[0][1] = 99;
fullgame.arena.w = 1;
check("buildClipSidecar freezes track", fullPayload.track[0][1], 0);
check("buildClipSidecar freezes arena", fullPayload.arena.w, 20);

const emptyPayload = buildClipSidecar(emptyDaily);
check("medal is null when no mutators", emptyPayload.medal, null);
check("sidecarMedal null with empty pool", sidecarMedal(500_000, []), null);

const thresholds = medalThresholdsFor([blackout, giants]);
const underCopper = thresholds.copper - 1;
check("medal null when under copper", sidecarMedal(underCopper, [blackout, giants]), null);

const goldScore = thresholds.gold;
check("this-run gold when score clears gold", sidecarMedal(goldScore, [blackout, giants]), "gold");

// --- ship track: cadence, cap, scripted run ---
check("track interval is 0.5s (2 Hz)", CLIP_TRACK_INTERVAL, 0.5);
check("track cap is 720 (6 min)", CLIP_TRACK_CAP, 720);

const unitTrack: ClipSidecarTrackSample[] = [];
sampleShipTrack(unitTrack, 0, 1.234, -5.678);
sampleShipTrack(unitTrack, 0.25, 9, 9);
sampleShipTrack(unitTrack, 0.5, 2.005, 3.994);
checkJson("sampler: t=0 then 0.5, mid-interval skipped, coords rounded", unitTrack, [
  [0, 1.23, -5.68],
  [0.5, 2.01, 3.99],
]);

const capTrack: ClipSidecarTrackSample[] = [];
for (let i = 0; i < CLIP_TRACK_CAP + 80; i++) {
  sampleShipTrack(capTrack, i * CLIP_TRACK_INTERVAL, i, -i);
}
check("cap holds at 720", capTrack.length, CLIP_TRACK_CAP);
check("first sample t is 0", capTrack[0][0], 0);
check("last sample t is 359.5", capTrack[CLIP_TRACK_CAP - 1][0], 359.5);
sampleShipTrack(capTrack, 400, 99, 99);
check("cap still holds after late sample", capTrack.length, CLIP_TRACK_CAP);

const drive: InputState = {
  turn: 0,
  thrust: 0,
  heading: null,
  moveVector: { x: 1, y: 0 },
  inertia: false,
  cruiseSpeed: 8,
};
const scripted = createWorld(20, 12, true);
checkJson("arena frozen at createWorld", scripted.clipArena, { w: 20, h: 12 });
checkJson("t=0 sample is origin", scripted.shipTrack[0], [0, 0, 0]);

const expected: ClipSidecarTrackSample[] = [];
function noteExpected(): void {
  const due = expected.length * CLIP_TRACK_INTERVAL;
  if (scripted.time + 1e-9 >= due && expected.length < CLIP_TRACK_CAP) {
    expected.push([
      roundTrackCoord(scripted.time),
      roundTrackCoord(scripted.ship.x),
      roundTrackCoord(scripted.ship.y),
    ]);
  }
}
noteExpected();
const scriptedSeconds = 2;
for (let i = 0; i < Math.round(scriptedSeconds / FIXED_DT); i++) {
  tick(scripted, drive, FIXED_DT);
  noteExpected();
}
check("scripted run has 5 samples (0..2.0 at 0.5s)", scripted.shipTrack.length, 5);
for (let i = 1; i < scripted.shipTrack.length; i++) {
  const dt = roundTrackCoord(scripted.shipTrack[i][0] - scripted.shipTrack[i - 1][0]);
  check(`cadence sample ${i} is 0.5s`, dt, CLIP_TRACK_INTERVAL);
}
checkJson("scripted track matches observed ship positions", scripted.shipTrack, expected);
check("scripted ship left the origin", scripted.shipTrack[scripted.shipTrack.length - 1][1] > 0, true);

const scriptedSidecar = buildClipSidecar({
  ...fullgame,
  track: scripted.shipTrack,
  arena: scripted.clipArena,
  view: { w: 390, h: 844 },
  survivalTime: scripted.time,
});
checkJson("sidecar track is the scripted run", scriptedSidecar.track, expected);

check("iOS iPhone detected", isIosWebKit({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", maxTouchPoints: 5 }), true);
check("iOS iPad detected", isIosWebKit({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", maxTouchPoints: 5 }), true);
check(
  "iPadOS-as-Mac + touch detected",
  isIosWebKit({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 }),
  true,
);
check(
  "desktop Mac without touch is not iOS",
  isIosWebKit({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0 }),
  false,
);
check(
  "desktop Chrome is not iOS",
  isIosWebKit({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    maxTouchPoints: 0,
  }),
  false,
);

const chromeLinux =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const chromeMac =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const chromeWin =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const edgeWin =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0";
const operaWin =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/114.0.0.0";
const androidChrome =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const safariMac =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const firefoxLinux = "Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0";

check("desktop Chrome Linux", isDesktopChrome({ userAgent: chromeLinux, maxTouchPoints: 0 }), true);
check("desktop Chrome Mac", isDesktopChrome({ userAgent: chromeMac, maxTouchPoints: 0 }), true);
check("desktop Chrome Windows", isDesktopChrome({ userAgent: chromeWin, maxTouchPoints: 0 }), true);
check("Edge is not desktop Chrome", isDesktopChrome({ userAgent: edgeWin, maxTouchPoints: 0 }), false);
check("Opera is not desktop Chrome", isDesktopChrome({ userAgent: operaWin, maxTouchPoints: 0 }), false);
check("Android Chrome is not desktop Chrome", isDesktopChrome({ userAgent: androidChrome, maxTouchPoints: 5 }), false);
check("Safari Mac is not desktop Chrome", isDesktopChrome({ userAgent: safariMac, maxTouchPoints: 0 }), false);
check("Firefox is not desktop Chrome", isDesktopChrome({ userAgent: firefoxLinux, maxTouchPoints: 0 }), false);
check(
  "iOS iPhone is not desktop Chrome",
  isDesktopChrome({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", maxTouchPoints: 5 }),
  false,
);
check(
  "iPadOS-as-Mac is not desktop Chrome",
  isDesktopChrome({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 }),
  false,
);

if (failures > 0) {
  console.error(`\n${failures} clip-sidecar check(s) FAILED.`);
  process.exit(1);
}
console.log(
  "ALL CHECKS PASSED: clip sidecar basename, JSON shape, medal, iOS/Chrome detect, ship track.",
);
