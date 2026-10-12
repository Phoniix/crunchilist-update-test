import assert from "node:assert/strict";
import test from "node:test";
import {
  MISS_TTL_MS,
  anilistAuthUrl,
  anilistTokenBody,
  franchiseKeyFromMedia,
  mapListStatus,
  catalogMatchQuery,
  mediaDetailQuery,
  titlesNeedingDetail,
  applyMediaDetails,
  mediaToCacheHit,
  plainAbout,
  clearSeriesMisses,
  dropUnusedSeriesCache,
  coverFromMedia,
  localCoverStamps,
  matchesFromBatch,
  missEntry,
  parseCodeRedirect,
  readCache,
  titlesNeedingAnilist,
  toAnilistStatus,
  listAvatar,
  safeAvatar,
} from "../lib/anilist.js";
import { messageText, parseRecommendationJson } from "../lib/llm.js";

test("profile pictures come from the list query and only from AniList's own image host", () => {
  const url = "https://s4.anilist.co/file/anilistcdn/user/avatar/medium/b123-abc.png";
  assert.equal(listAvatar({ data: { MediaListCollection: { user: { avatar: { medium: url } }, lists: [] } } }), url);
  assert.equal(listAvatar({ data: { MediaListCollection: { lists: [] } } }), "");
  assert.equal(safeAvatar("http://s4.anilist.co/a.png"), "");
  assert.equal(safeAvatar("https://evil.example/anilist.co/a.png"), "");
  assert.equal(safeAvatar("https://anilist.co.evil.example/a.png"), "");
  assert.equal(safeAvatar("javascript:alert(1)"), "");
});
import { publicSettings } from "../lib/settings.js";
test("maps public anilist list statuses onto season statuses", () => {
  assert.equal(mapListStatus("COMPLETED"), "finished");
  assert.equal(mapListStatus("CURRENT"), "in_progress");
  assert.equal(mapListStatus("DROPPED"), "dropped");
  assert.equal(mapListStatus("PAUSED"), "in_progress");
  assert.equal(mapListStatus("PLANNING"), "plan");
  assert.equal(mapListStatus("REPEATING"), "in_progress");
});

test("a miss expires and a franchise key uses related ids without merging seasons", () => {
  const miss = missEntry(1_000);
  assert.equal(readCache({ a: miss }, "a", 1_000 + MISS_TTL_MS - 1).kind, "miss");
  assert.equal(readCache({ a: miss }, "a", 1_000 + MISS_TTL_MS), null);
  assert.equal(franchiseKeyFromMedia({
    id: 10,
    relations: {
      edges: [
        { relationType: "PREQUEL", node: { id: 4 } },
        { relationType: "SEQUEL", node: { id: 12 } },
        { relationType: "CHARACTER", node: { id: 1 } },
      ],
    },
  }), "al:4");
});

test("authorization code redirect keeps the code and reports anilist errors", () => {
  const ok = parseCodeRedirect("https://abc.chromiumapp.org/?code=abc123");
  assert.equal(ok.code, "abc123");
  assert.equal(parseCodeRedirect("https://abc.chromiumapp.org/?error=access_denied&error_description=nope").error, "nope");
  assert.match(anilistAuthUrl("123", "https://abc.chromiumapp.org/"), /response_type=code/);
  assert.equal(anilistTokenBody("123", "secret", "https://abc.chromiumapp.org/", "abc123").grant_type, "authorization_code");
  assert.equal(toAnilistStatus("finished"), "COMPLETED");
  assert.equal(toAnilistStatus("in_progress"), "CURRENT");
});

test("public settings omit the anilist token", () => {
  const view = publicSettings({
    anilistToken: "secret",
    anilistExpiresAt: Date.now() + 60_000,
    anilistViewerName: "me",
    anilistClientId: "42",
    anilistClientSecret: "supersecret",
    apiKey: "sk-test",
  });
  assert.equal(view.anilistConnected, true);
  assert.equal(view.anilistViewerName, "me");
  assert.equal(view.hasAnilistSecret, true);
  assert.equal("anilistToken" in view, false);
  assert.equal("anilistClientSecret" in view, false);
  assert.equal("apiKey" in view, false);
  assert.equal(view.episodeDialogs, true);
  assert.equal(view.askModelDownload, true);
  assert.equal(view.favorNamed, true);
  assert.equal(publicSettings({ episodeDialogs: false }).episodeDialogs, false);
  assert.equal(view.useAi, true);
  assert.equal(view.modelLabel, "gpt-4o-mini");
  assert.equal(publicSettings({}).modelLabel, "Chrome");
  assert.equal(publicSettings({ useAi: false }).useAi, false);
});

test("llm results reject ids that were not candidates", () => {
  const parsed = parseRecommendationJson(
    "```json\n{\"results\":[{\"id\":\"keep\",\"reason\":\"Short.\"},{\"id\":\"invented\",\"reason\":\"No.\"}]}\n```",
    new Set(["keep"]),
  );
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.results, [{ id: "keep", reason: "Short." }]);
  assert.equal(parseRecommendationJson("{}", ["keep"]).ok, false);
  assert.equal(messageText({ choices: [{ message: { content: "hi" } }] }), "hi");
});

test("catalog matching reuses saved covers and only asks anilist for the rest", () => {
  const frieren = {
    id: "G6NQ5DWZ6",
    title: "Frieren",
    cover: "",
  };
  const cached = {
    id: "GAAAAAAAA",
    title: "Cached Show",
    cover: "",
  };
  const missed = { id: "GBBBBBBBB", title: "Missed Show", cover: "" };
  const covered = { id: "GCCCCCCCC", title: "Covered", cover: "https://s4.anilist.co/file/have.jpg" };
  const cache = {
    [ `series:${cached.id}` ]: { kind: "hit", anilistId: 4, cover: "https://s4.anilist.co/file/cached.jpg", cachedAt: 1 },
    [ `series:${missed.id}` ]: missEntry(Date.now()),
  };
  const pending = titlesNeedingAnilist([frieren, cached, missed, covered], cache, Date.now());
  assert.deepEqual(pending.map((item) => item.id), [frieren.id]);
  const local = localCoverStamps([cached, frieren], {
    anilistCache: cache,
    imports: {
      9: { media: { id: 9, title: { english: "Frieren" }, coverImage: { large: "https://s4.anilist.co/file/frieren.jpg" } } },
    },
  }, Date.now());
  assert.equal(local.stamps[cached.id].cover, "https://s4.anilist.co/file/cached.jpg");
  assert.equal(local.stamps[frieren.id].anilistId, 9);
  assert.equal(coverFromMedia({ coverImage: { large: "http://insecure.example/a.jpg" } }), "");
  const query = catalogMatchQuery(2);
  assert.match(query, /\$s0: String/);
  assert.match(query, /\$s1: String/);
  assert.match(query, /coverImage \{ large \}/);
  const batch = matchesFromBatch([frieren, { id: "GDDDDDDDD", title: "Nope" }], {
    data: {
      p0: { media: [{ id: 9, title: { english: "Frieren" }, coverImage: { large: "https://s4.anilist.co/file/frieren.jpg" } }] },
      p1: { media: [{ id: 3, title: { english: "Something Else" } }] },
    },
  }, 50);
  assert.equal(batch.stamps[frieren.id].cover, "https://s4.anilist.co/file/frieren.jpg");
  assert.equal(batch.cacheUpdates[`series:GDDDDDDDD`].kind, "miss");
  const skipped = matchesFromBatch([{ id: "GEEEEEEEE", title: "Dropped" }], { data: {} }, 50);
  assert.equal(skipped.cacheUpdates["series:GEEEEEEEE"], undefined);
  const cleared = clearSeriesMisses({
    "series:G1": { kind: "miss" },
    "series:G2": { kind: "hit", cover: "https://s4.anilist.co/file/a.jpg" },
    "season:S|s1": { kind: "miss" },
  });
  assert.equal(cleared["series:G1"], undefined);
  assert.equal(cleared["series:G2"].kind, "hit");
  assert.equal(cleared["season:S|s1"].kind, "miss");
  const recycled = dropUnusedSeriesCache(cleared, ["G2"]);
  assert.equal(recycled["series:G2"].kind, "hit");
  assert.equal(recycled["season:S|s1"].kind, "miss");
});

test("show details keep the synopsis and cover, and leave out people and streams", () => {
  const query = mediaDetailQuery(1);
  assert.match(query, /description\(asHtml: false\)/);
  assert.match(query, /bannerImage/);
  assert.match(query, /coverImage \{ extraLarge large medium color \}/);
  for (const excluded of ["trailer", "characters", "staff", "studios", "streamingEpisodes", "airingSchedule", "externalLinks", "reviews", "recommendations"]) {
    assert.equal(query.includes(excluded), false, excluded);
  }
  const about = plainAbout("A girl finds a door. <br>~!The door eats her.!~ &amp; more.");
  assert.equal(about, "A girl finds a door. & more.");
  const hit = mediaToCacheHit({
    id: 9,
    description: "A quiet elf walks through a long life.",
    startDate: { year: 2023, month: 9, day: 29 },
    season: "FALL",
    seasonYear: 2023,
    episodes: 28,
    duration: 24,
    source: "MANGA",
    averageScore: 91,
    coverImage: { large: "https://s4.anilist.co/file/frieren.jpg" },
    bannerImage: "https://s4.anilist.co/file/banner.jpg",
    status: "FINISHED",
    relations: { edges: [{ relationType: "PREQUEL", node: { id: 3, title: { english: "Earlier" } } }] },
  }, 50);
  assert.equal(hit.detailed, true);
  assert.equal(hit.about, "A quiet elf walks through a long life.");
  assert.equal(hit.year, 2023);
  assert.equal(hit.score, 91);
  assert.equal(hit.cover, "https://s4.anilist.co/file/frieren.jpg");
  assert.equal(hit.banner, "https://s4.anilist.co/file/banner.jpg");
  assert.equal(hit.continues, undefined);
  assert.equal(hit.relations[0].title, "Earlier");
  assert.equal(mediaToCacheHit({ id: 4, title: { english: "Thin" } }, 50).detailed, false);
  const cache = { "series:G1": { kind: "hit", anilistId: 9, detailed: false } };
  assert.deepEqual(titlesNeedingDetail([{ id: "G1" }, { id: "G2" }], cache, 50), [{ id: "G1", anilistId: 9 }]);
  const updates = applyMediaDetails([{ id: "G1", anilistId: 9 }], {
    data: { m0: { id: 9, description: "Filled in.", episodes: 12 } },
  }, 60, cache);
  assert.equal(updates["series:G1"].detailed, true);
  assert.equal(updates["series:G1"].about, "Filled in.");
  assert.equal(updates["series:G1"].anilistId, 9);
  const older = { "series:G1": { kind: "hit", anilistId: 9, detailed: true } };
  assert.deepEqual(titlesNeedingDetail([{ id: "G1" }], older, 50), [{ id: "G1", anilistId: 9 }]);
  assert.deepEqual(titlesNeedingDetail([{ id: "G1" }], updates, 70), []);
});

test("spoiler tags are kept apart for search with their ranks", () => {
  const hit = mediaToCacheHit({
    id: 5,
    title: { english: "Your Lie in April" },
    description: "",
    tags: [
      { name: "Classical Music", rank: 93 },
      { name: "Tragedy", rank: 92, isGeneralSpoiler: true },
      { name: "Minor Twist", rank: 30, isMediaSpoiler: true },
    ],
  }, 50);
  assert.deepEqual(hit.tags, ["Classical Music"]);
  assert.deepEqual(hit.hiddenTags, ["Tragedy"]);
  assert.equal(hit.tagRanks.Tragedy, 92);
});
