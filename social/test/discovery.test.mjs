import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FIRST_COMMENT,
  KEYWORD_LINE,
  assertDiscovery,
  ensureCaptionKeywords,
  ensureSearchableTitle,
  ensureYoutubeDescription,
  searchableTitle,
  tiktokBufferMetadata,
  youtubeBufferMetadata,
  youtubeInsertBody,
  youtubeTags,
} from "../src/discovery.mjs";

const day43 = {
  day: 43,
  mutatorIds: ["arsenal"],
  mutatorNames: ["ARSENAL"],
  score: 3490380,
  medal: "gold",
  survivalTime: 270,
  closestCall: null,
  topGrazes: [],
};

describe("discovery", () => {
  it("searchable titles name the format and a search phrase", () => {
    assert.equal(searchableTitle("WASTED", day43), "WASTED on ARSENAL day | daily dodge game");
    assert.match(searchableTitle("NEW_BEST", day43), /daily dodge game/);
    assert.equal(ensureSearchableTitle("ORION Trailer"), "ORION Trailer");
    assert.equal(ensureSearchableTitle("He Knew"), "He Knew | daily dodge game");
  });

  it("IG/TT captions get a keyword line when they have no search phrase", () => {
    assert.equal(ensureCaptionKeywords("nice clip\n\n#fail"), `nice clip\n\n${KEYWORD_LINE}\n\n#fail`);
    assert.equal(ensureCaptionKeywords("daily dodge game already"), "daily dodge game already");
  });

  it("YouTube descriptions always get #Shorts, keywords, and surviveorion.com", () => {
    const desc = ensureYoutubeDescription("He flew too close.", { tags: ["#fail"] });
    assert.match(desc, /#Shorts/);
    assert.match(desc, /daily dodge game/i);
    assert.match(desc, /#fail/);
    assert.ok(desc.trimEnd().endsWith("surviveorion.com"));
    assertDiscovery(desc, { youtube: true, label: "desc" });
    assert.throws(() => assertDiscovery("no keywords here", { youtube: true }), /#Shorts/);
  });

  it("Buffer and Data API YouTube metadata mark not-for-kids", () => {
    const buf = youtubeBufferMetadata({ title: "ORION Trailer" });
    assert.equal(buf.madeForKids, false);
    assert.equal(buf.categoryId, "20");
    assert.equal(buf.license, "youtube");
    assert.equal(buf.isAiGenerated, false);
    assert.deepEqual(tiktokBufferMetadata(), { isAiGenerated: false });

    const body = youtubeInsertBody({
      title: "ORION Trailer",
      description: "Play: https://surviveorion.com\n\n#Shorts",
      tags: ["#indiegame"],
      privacy: "public",
    });
    assert.equal(body.status.selfDeclaredMadeForKids, false);
    assert.equal(body.snippet.defaultLanguage, "en");
    assert.ok(youtubeTags(["#indiegame"]).includes("daily dodge game"));
    assert.ok(FIRST_COMMENT.includes("surviveorion.com"));
  });
});
