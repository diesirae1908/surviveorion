// Push Grok cutter cuts into the Orion Clips database (Notion).
// Fail-soft: missing token or a Notion error never fails the cut upload.
//
//   NOTION_TOKEN                 # internal integration secret (Render + server/.env)
//   NOTION_CLIPS_DATABASE_ID     # optional override; default is Praetor Lab Clips

export const DEFAULT_CLIPS_DATABASE_ID = "464e297722b648c58cd3f9a4e98e561a";
const NOTION_VERSION = "2022-06-28";

export const CLIP_FORMATS = [
  "CLOSE CALL",
  "SPACE DUST",
  "THE BOARD",
  "TODAY'S PATROL",
  "FLIGHT SCHOOL",
  "TRAILER",
  "WASTED",
  "NEW BEST",
  "BUG",
  "Other",
];

export function notionClipsEnabled(env = process.env) {
  return Boolean(env.NOTION_TOKEN);
}

export function clipFormatName(raw) {
  const s = String(raw ?? "").trim();
  if (CLIP_FORMATS.includes(s)) return s;
  const upper = s.toUpperCase();
  const hit = CLIP_FORMATS.find((f) => f.toUpperCase() === upper);
  return hit || "Other";
}

function titleFor(cut) {
  const name = String(cut.name ?? "").replace(/\s+/g, " ").trim();
  if (name) return name.slice(0, 80);
  const format = clipFormatName(cut.format);
  const mutator = String(cut.mutator ?? "").trim();
  if (mutator) return `${format} · ${mutator}`.slice(0, 80);
  return "Cut";
}

export function buildNotionClipPage(cut, env = process.env) {
  const databaseId = env.NOTION_CLIPS_DATABASE_ID || DEFAULT_CLIPS_DATABASE_ID;
  const format = clipFormatName(cut.format);
  const notesBits = [];
  if (cut.sourceId) notesBits.push(`source ${cut.sourceId}`);
  if (cut.notes) notesBits.push(String(cut.notes));
  const notes = notesBits.join(" · ").slice(0, 2000);
  const properties = {
    Name: { title: [{ text: { content: titleFor(cut) } }] },
    Kind: { select: { name: "Cut" } },
    Format: { select: { name: format } },
    Mutator: { rich_text: cut.mutator ? [{ text: { content: String(cut.mutator).slice(0, 200) } }] : [] },
    "Hosted URL": cut.videoUrl ? { url: String(cut.videoUrl) } : { url: null },
    "Local path": {
      rich_text: cut.id ? [{ text: { content: `/data/clip-inbox/cuts/${cut.id}/` } }] : [],
    },
    Notes: { rich_text: notes ? [{ text: { content: notes } }] : [] },
  };
  if (cut.patrolDate) {
    properties["Patrol date"] = { date: { start: String(cut.patrolDate) } };
  }
  const children = [];
  if (cut.videoUrl) {
    children.push({
      object: "block",
      type: "video",
      video: { type: "external", external: { url: String(cut.videoUrl) } },
    });
    children.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: { content: "Play cut", link: { url: String(cut.videoUrl) } },
          },
        ],
      },
    });
  }
  const page = {
    parent: { database_id: databaseId },
    properties,
    children,
  };
  if (cut.posterUrl) {
    page.cover = { type: "external", external: { url: String(cut.posterUrl) } };
    page.icon = { type: "external", external: { url: String(cut.posterUrl) } };
  }
  return page;
}

export async function pushCutToNotion(cut, { env = process.env, fetchImpl = fetch } = {}) {
  if (!notionClipsEnabled(env)) return { skipped: true };
  const token = env.NOTION_TOKEN;
  const body = buildNotionClipPage(cut, env);
  const res = await fetchImpl("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Notion ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json().catch(() => ({}));
  return { skipped: false, id: json.id ?? null };
}
