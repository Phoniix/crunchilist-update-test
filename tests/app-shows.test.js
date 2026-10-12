import assert from "node:assert/strict";
import test from "node:test";
import { applySeasonChanges, buildAppShows, libraryMirror, mediaWanted, playRequest, seasonTarget } from "../lib/app-shows.js";
import { setEntryStatus } from "../lib/library.js";
import { mediaNode } from "../lib/seasons.js";

const NOW = Date.UTC(2026, 9, 12);

const catalog = {
  items: [
    { id: "GR1", title: "Big Show", url: "https://www.crunchyroll.com/series/GR1/big-show", type: "series", episodes: 12, cover: "https://cr/1.jpg", anilistId: 1 },
    { id: "GR2", title: "Other Show", url: "https://www.crunchyroll.com/series/GR2", type: "series", episodes: 24, poster: "https://cr/2.jpg" },
  ],
  newest: [{ id: "GR3", title: "New Show", url: "https://www.crunchyroll.com/series/GR3", type: "series" }],
};

const cache = {
  "series:GR1": {
    kind: "hit", anilistId: 1, cover: "https://al/1.jpg", banner: "https://al/1b.jpg", color: "#aa0000",
    titles: { english: "Big Show", romaji: "Biggu", native: "ビッグ" }, genres: ["Action"], tags: ["Swords", "Magic"],
    about: "A big show. (Source: Somewhere)", year: 2019, season: "SPRING", score: 81, popularity: 9000, episodes: 12, duration: 24, releaseStatus: "FINISHED", format: "TV",
  },
  "series:GR2": { kind: "miss", expiresAt: NOW + 1e9 },
};

function node(id, extra = {}) {
  return mediaNode({
    id, format: "TV", episodes: 12, seasonYear: 2019, status: "FINISHED", title: { english: `Show ${id}` },
    coverImage: { large: `https://al/${id}c.jpg` }, relations: { edges: [] }, ...extra,
  }, NOW);
}

const media = {
  1: node(1, { trailer: { id: "abcdefgh", site: "youtube" }, studios: { nodes: [{ name: "Bones" }] }, relations: { edges: [{ relationType: "SEQUEL", node: { id: 11, type: "ANIME", format: "TV" } }] } }),
  11: node(11, { seasonYear: 2021, episodes: 13, title: { english: "Big Show Season 2" }, relations: { edges: [{ relationType: "PREQUEL", node: { id: 1, type: "ANIME", format: "TV" } }] } }),
};

test("buildAppShows joins the catalog, AniList details, extras and season chains", () => {
  const shows = buildAppShows({ catalog, cache, media, now: NOW });
  assert.deepEqual(shows.map((show) => show.id), ["GR1", "GR2", "GR3"]);
  const big = shows[0];
  assert.equal(big.native, "ビッグ");
  assert.equal(big.about, "A big show.");
  assert.equal(big.trailer, "abcdefgh");
  assert.equal(big.studio, "Bones");
  assert.equal(big.cover, "https://al/1.jpg");
  assert.deepEqual(big.seasons.map((season) => [season.anilistId, season.label, season.episodes]), [[1, "Season 1", 12], [11, "Season 2", 13]]);
  assert.equal(shows[2].fresh, true);
  assert.equal(shows[1].cover, "https://cr/2.jpg", "unmatched shows fall back to the Crunchyroll poster");
  assert.deepEqual(shows[1].seasons.map((season) => season.label), ["Season 1"]);
});

test("buildAppShows adds listed shows Crunchyroll doesn't carry, but not later seasons of catalog shows", () => {
  const library = {
    "anilist:500": { key: "anilist:500", anilistId: 500, status: "in_progress", progress: 3, title: "Elsewhere", labels: ["Drama"] },
    "anilist:11": { key: "anilist:11", anilistId: 11, status: "plan", title: "Big Show Season 2" },
  };
  const shows = buildAppShows({ catalog, cache, media: { ...media, 500: node(500, { title: { english: "Elsewhere" }, externalLinks: [{ site: "Netflix", url: "https://netflix.com/e", type: "STREAMING" }] }) }, library, now: NOW });
  const off = shows.find((show) => show.id === "al-500");
  assert.equal(off.onCrunchyroll, false);
  assert.deepEqual(off.streaming, [{ site: "Netflix", url: "https://netflix.com/e" }]);
  assert.equal(shows.some((show) => show.id === "al-11"), false);
});

test("mediaWanted lists catalog shows and off-catalog library shows", () => {
  const library = { "anilist:500": { key: "anilist:500", anilistId: 500, status: "plan" } };
  const wanted = mediaWanted({ catalog, cache, library, now: NOW });
  assert.deepEqual(wanted.ids.sort((a, b) => a - b), [1, 500]);
  assert.equal(wanted.offCatalog.has(500), true);
  assert.equal(wanted.catalogIds.has(500), false);
});

test("libraryMirror maps each season to its own AniList entry", () => {
  const shows = buildAppShows({ catalog, cache, media, now: NOW });
  const library = {
    "anilist:1": { key: "anilist:1", anilistId: 1, crSeriesId: "GR1", status: "finished", progress: 12 },
    "anilist:11": { key: "anilist:11", anilistId: 11, crSeriesId: "GR1", related: true, status: "in_progress", progress: 4 },
    "cr:GR2": { key: "cr:GR2", crSeriesId: "GR2", status: "plan", progress: null },
  };
  const mirror = libraryMirror(shows, library);
  assert.deepEqual(mirror.GR1, { at: 1, s: { 0: { status: "finished", progress: 12 }, 1: { status: "watching", progress: 4 } } });
  assert.deepEqual(mirror.GR2, { at: 0, s: { 0: { status: "plan", progress: 0 } } });
  assert.equal(mirror.GR3, undefined);
});

test("a later season's entry never stands in for season 1", () => {
  const shows = buildAppShows({ catalog, cache, media, now: NOW });
  const library = { "anilist:11": { key: "anilist:11", anilistId: 11, crSeriesId: "GR1", related: true, status: "in_progress", progress: 2 } };
  assert.deepEqual(libraryMirror(shows, library).GR1.s, { 1: { status: "watching", progress: 2 } });
});

test("saving season 2 creates its own entry and leaves season 1 alone", () => {
  const shows = buildAppShows({ catalog, cache, media, now: NOW });
  const start = { "anilist:1": { key: "anilist:1", anilistId: 1, crSeriesId: "GR1", status: "finished", progress: 12, title: "Big Show", labels: [], source: "local" } };
  const next = setEntryStatus(start, seasonTarget(shows[0], 1), "plan", NOW);
  assert.equal(next["anilist:1"].status, "finished");
  assert.equal(next["anilist:11"].status, "plan");
  assert.equal(next["anilist:11"].crSeriesId, "GR1");
  assert.equal(next["anilist:11"].related, true);
  const back = setEntryStatus(next, seasonTarget(shows[0], 0), "in_progress", NOW);
  assert.equal(back["anilist:1"].status, "in_progress");
  assert.equal(back["anilist:11"].status, "plan", "season 1 doesn't pick up season 2's entry");
});

test("applySeasonChanges updates seasons, moves the current season and drops empty shows", () => {
  const start = { GR1: { at: 0, s: { 0: { status: "watching", progress: 3 } } } };
  const finished = applySeasonChanges(start, "GR1", [{ index: 0, status: "finished", progress: 12 }, { index: 1, status: "watching", progress: 1 }]);
  assert.deepEqual(finished.GR1, { at: 1, s: { 0: { status: "finished", progress: 12 }, 1: { status: "watching", progress: 1 } } });
  assert.deepEqual(start.GR1.s, { 0: { status: "watching", progress: 3 } }, "the old copy is left alone");
  const planned = applySeasonChanges({}, "GR2", [{ index: 2, status: "plan" }, { index: 1, status: "plan" }]);
  assert.equal(planned.GR2.at, 1, "with only plans, the earliest planned season is current");
  assert.equal(applySeasonChanges(finished, "GR1", [{ index: 0, status: null }, { index: 1, status: null }]).GR1, undefined);
});

test("playRequest counts Crunchyroll seasons without the movies between them", () => {
  const show = {
    id: "GR1",
    title: "Big Show",
    seasons: [
      { label: "Season 1", format: "TV" },
      { label: "Movie", format: "MOVIE" },
      { label: "Season 2", format: "TV" },
    ],
  };
  assert.deepEqual(playRequest(show, 2, 5), { seriesId: "GR1", season: 1, episode: 5, title: "Big Show", seasonLabel: "Season 2" });
  assert.equal(playRequest(show, 0, 0).episode, 1, "episodes start at 1");
  assert.equal(playRequest(show, 9, 1).seasonLabel, "Season 2", "an out-of-range season clamps to the last one");
  assert.equal(playRequest({ id: "GR2", title: "Solo", seasons: [{ label: "Season 1", format: "TV" }] }, 0, 3).seasonLabel, "", "single-season shows don't name the season");
});
