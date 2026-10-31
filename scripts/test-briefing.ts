// WS-B: mission briefing pure logic (shouldShow truth table, briefingModel rows).
import { briefingModel, briefingRows, shouldShow, sublineSentences, shouldRecordSeen, BRIEFING_MS, SKIP_AFTER_MS, type BriefingContext } from "../src/lobby/briefing";
import { patrolDateStr } from "../src/patrolDate";
import { clientFlagsSnapshot } from "../src/flags";

let failed = 0;
function check(name: string, ok: boolean): void {
  if (!ok) {
    failed++;
    console.error(`FAIL ${name}`);
  }
}

const params = { enabled: true, tabBar: true, briefing: true, pilotTab: true } as unknown as NonNullable<BriefingContext["params"]>;
const base: BriefingContext = {
  patrolDate: "2026-11-02",
  patrolNumber: 108,
  mutators: [{ name: "OVERCHARGE", subline: "Powers hit far bigger. Drops are normal. Chains run hot. Extra.", hudRule: "Drops normal. Powers hit far bigger.", tags: ["power"] }],
  quick: false,
  mode: "daily",
  archive: false,
  preview: false,
  effects: "full",
  shake: true,
  params,
  allowed: true,
  playStamp: () => {},
};
const show = (o: Partial<BriefingContext>, seen: string | null = null) => shouldShow({ ...base, ...o }, seen);

// truth table
check("daily first launch shows", show({}) === true);
check("same-day second launch does not", show({}, "2026-11-02") === false);
check("seen yesterday shows today", show({}, "2026-11-01") === true);
check("quick retry never", show({ quick: true }) === false);
check("archive never", show({ archive: true }) === false);
for (const m of ["training", "classic", "ironrain", "tutorial", "firstFlight"] as const) check(`mode ${m} never`, show({ mode: m }) === false);
check("not allowed (native) never", show({ allowed: false }) === false);
check("params null (old row / lobby off) never", show({ params: null }) === false);
check("briefing param off never", show({ params: { ...params, briefing: false } }) === false);

// PT midnight: the date key flips with patrolDateStr, not UTC
const lateEvening = new Date("2026-11-03T06:30:00Z"); // 10:30 PM PT Nov 2
const afterMidnight = new Date("2026-11-03T08:30:00Z"); // 12:30 AM PT Nov 3
const d1 = patrolDateStr(lateEvening);
const d2 = patrolDateStr(afterMidnight);
check("PT dates differ across PT midnight", d1 === "2026-11-02" && d2 === "2026-11-03");
check("seen at 10:30 PM PT hides until PT midnight", show({ patrolDate: d1 }, d1) === false);
check("shows again after PT midnight", show({ patrolDate: d2 }, d1) === true);

// old production row: flags resolve with lobby null, so never shows
check("no flag rows: lobby params null so briefing never shows", clientFlagsSnapshot().lobby === null && show({ params: clientFlagsSnapshot().lobby }) === false);

// preview shows (it is a daily mode run) and is tagged
check("preview still shows", show({ preview: true }) === true);
check("preview tag in model", briefingModel({ ...base, preview: true }).previewTag === true);
check("no preview tag by default", briefingModel(base).previewTag === false);

check("preview never writes the seen key", !shouldRecordSeen({ ...base, preview: true }, true));
check("launch writes, escape does not", shouldRecordSeen(base, true) && !shouldRecordSeen(base, false));

// model rows
const one = briefingModel(base);
check("1 mutator: one row, the short hudRule", one.rows.length === 1 && one.rows[0].title === "Drops normal. Powers hit far bigger." && one.rows[0].detail === "");
check("1 mutator: same-run line", one.sameRunLine === "SAME RUN FOR EVERY PILOT TODAY");
check("header", one.header === "INCOMING TRANSMISSION");
check("timings", one.briefingMs === BRIEFING_MS && one.skipAfterMs === SKIP_AFTER_MS && BRIEFING_MS === 4000 && SKIP_AFTER_MS === 600);
const two = briefingModel({
  ...base,
  mutators: [
    { name: "BLACKOUT", subline: "Some flickers are fakes. Dark.", hudRule: "Fake flickers. Real ones go dark.", tags: [] },
    { name: "RED ALERT", subline: "Everything faster.", hudRule: "More threats, faster.", tags: [] },
  ],
});
check("2 mutators: one row each", two.rows.length === 2 && two.rows[0].title === "BLACKOUT" && two.rows[1].detail === "More threats, faster.");
check("2 mutators: names", two.names.join("|") === "BLACKOUT|RED ALERT");
check("3 mutators cap at 3", briefingRows([1, 2, 3, 4].map((i) => ({ name: `M${i}`, subline: "x.", hudRule: "r", tags: [] }))).length === 3);
check("no mutators: no rows, no same-run line", briefingModel({ ...base, mutators: [] }).rows.length === 0 && briefingModel({ ...base, mutators: [] }).sameRunLine === null);
check("no hudRule: falls back to a clipped first subline sentence", briefingRows([{ name: "A", subline: "x".repeat(300) + ".", hudRule: "", tags: [] }])[0].title.length <= 140);
import { MUTATOR_POOL } from "../src/mutators";
check("every mutator briefing row is its short hudRule (<= 44 chars)", MUTATOR_POOL.every((m) => { const r = briefingRows([{ name: m.name, subline: m.subline, hudRule: m.hudRule, tags: m.tags }]); return r.length === 1 && r[0].title === m.hudRule && r[0].title.length <= 44; }));
check("sentence split", sublineSentences("One. Two! Three?").length === 3);

// effects / shake
check("full effects animate + shake", one.animate && one.shake);
check("shake setting off", briefingModel({ ...base, shake: false }).shake === false);
check("lite is static, no shake", (() => { const m = briefingModel({ ...base, effects: "lite" }); return !m.animate && !m.shake; })());

if (failed) {
  console.error(`${failed} briefing check(s) failed`);
  process.exit(1);
}
console.log("PASS briefing");
