// Clip sidecar basename + JSON shape, tsx style (see test-highlights.ts).
//
//   npx tsx scripts/test-clip-sidecar.ts

import {
  buildClipSidecar,
  clipSidecarBasename,
  clipSidecarMutatorSlot,
  isIosWebKit,
  sidecarMedal,
  type ClipSidecarInput,
} from "../src/clipSidecar";
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

const emptyPayload = buildClipSidecar(emptyDaily);
check("medal is null when no mutators", emptyPayload.medal, null);
check("sidecarMedal null with empty pool", sidecarMedal(500_000, []), null);

const thresholds = medalThresholdsFor([blackout, giants]);
const underCopper = thresholds.copper - 1;
check("medal null when under copper", sidecarMedal(underCopper, [blackout, giants]), null);

const goldScore = thresholds.gold;
check("this-run gold when score clears gold", sidecarMedal(goldScore, [blackout, giants]), "gold");

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

if (failures > 0) {
  console.error(`\n${failures} clip-sidecar check(s) FAILED.`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED: clip sidecar basename, JSON shape, medal, iOS detect.");
