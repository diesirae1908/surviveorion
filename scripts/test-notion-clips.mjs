/**
 * Notion Clips mapper for Grok cutter uploads.
 * Run: node scripts/test-notion-clips.mjs
 */
import {
  buildNotionClipPage,
  clipFormatName,
  notionClipsEnabled,
  pushCutToNotion,
} from "../server/notion-clips.mjs";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

check("disabled without token", notionClipsEnabled({}) === false);
check("enabled with token", notionClipsEnabled({ NOTION_TOKEN: "secret" }) === true);
check("unknown format becomes Other", clipFormatName("mystery") === "Other");
check("sunday double maps via exact option", clipFormatName("TODAY'S PATROL") === "TODAY'S PATROL");

const page = buildNotionClipPage({
  id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  name: "THE PIT freeze",
  format: "close call",
  mutator: "THE PIT",
  sourceId: "orion_2026-08-27_day45_the-pit_1",
  notes: "graze",
  patrolDate: "2026-08-27",
  videoUrl: "https://surviveorion.com/clip-cuts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cut.mp4",
  posterUrl: "https://surviveorion.com/clip-cuts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/poster.jpg",
});
check("kind Cut", page.properties.Kind.select.name === "Cut");
check("format normalized", page.properties.Format.select.name === "CLOSE CALL");
check("hosted url set", page.properties["Hosted URL"].url.includes("/clip-cuts/"));
check("patrol date", page.properties["Patrol date"].date.start === "2026-08-27");
check("cover from poster", page.cover.external.url.endsWith("poster.jpg"));
check("video block present", page.children[0].type === "video");

const skipped = await pushCutToNotion({ name: "x" }, { env: {} });
check("push skips without token", skipped.skipped === true);

let fetched = 0;
const pushed = await pushCutToNotion(
  {
    name: "He Knew",
    format: "SPACE DUST",
    videoUrl: "https://example.test/cut.mp4",
  },
  {
    env: { NOTION_TOKEN: "ntn_test", NOTION_CLIPS_DATABASE_ID: "db-clips" },
    fetchImpl: async (url, opts) => {
      fetched++;
      const body = JSON.parse(opts.body);
      check("posts to Notion pages", url === "https://api.notion.com/v1/pages");
      check("uses override database", body.parent.database_id === "db-clips");
      return { ok: true, json: async () => ({ id: "page-cut" }), text: async () => "" };
    },
  },
);
check("push called fetch", fetched === 1);
check("push returns page id", pushed.id === "page-cut");

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log("ok");
