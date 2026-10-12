import assert from "node:assert/strict";
import test from "node:test";
import { cachedLink, mainSeasons, rememberLinks, resolveEpisode, seasonForAbsolute, seasonLinks, watchUrl } from "../lib/episode-link.js";

const ep = (id, number, slug = `ep-${number}`) => ({ id, episode_number: number, sequence_number: number, slug_title: slug });

function fakeApi(seasons, episodes) {
  const calls = [];
  const fetchJson = async (url) => {
    calls.push(url);
    if (/\/series\/[^/]+\/seasons/.test(url)) return { data: seasons };
    const id = /\/seasons\/([^/]+)\/episodes/.exec(url)?.[1];
    return { data: episodes[id] || [] };
  };
  return { fetchJson, calls };
}

test("dub seasons collapse to the original-language season for each season number", () => {
  const picked = mainSeasons({ data: [
    { id: "S1-EN", season_sequence_number: 1, title: "Show (English Dub)", audio_locale: "en-US" },
    { id: "S1", season_sequence_number: 1, title: "Show", audio_locale: "ja-JP", is_subbed: true },
    { id: "S2", season_sequence_number: 2, title: "Show Season 2", audio_locale: "ja-JP" },
  ] });
  assert.deepEqual(picked.map((season) => season.id), ["S1", "S2"]);
});

test("watch links use the episode id and a cleaned slug", () => {
  assert.equal(watchUrl({ id: "GABC123", slug_title: "the-journeys-end" }), "https://www.crunchyroll.com/watch/GABC123/the-journeys-end");
  assert.equal(watchUrl({ id: "GABC123", slug_title: "<bad>" }), "https://www.crunchyroll.com/watch/GABC123/bad");
  assert.equal(watchUrl(null), null);
});

test("season 2 episode 4 opens that exact episode", async () => {
  const api = fakeApi(
    [{ id: "S1", season_sequence_number: 1, number_of_episodes: 28 }, { id: "S2", season_sequence_number: 2, number_of_episodes: 10 }],
    { S1: [ep("A1", 1)], S2: [ep("B3", 3), ep("B4", 4, "season-two-four")] },
  );
  const result = await resolveEpisode(api.fetchJson, { seriesId: "GG5H5XQX4", season: 1, episode: 4 });
  assert.deepEqual(result, { url: "https://www.crunchyroll.com/watch/B4/season-two-four", exact: true });
  assert.equal(api.calls.length, 2);
});

test("absolute numbering across Crunchyroll seasons finds the right arc", async () => {
  const seasons = [
    { id: "EB", season_sequence_number: 1, number_of_episodes: 61 },
    { id: "AL", season_sequence_number: 2, number_of_episodes: 74 },
    { id: "SK", season_sequence_number: 3, number_of_episodes: 60 },
  ];
  assert.deepEqual(seasonForAbsolute(seasons, 140), { index: 2, offset: 5 });
  const api = fakeApi(seasons, { EB: [ep("E1", 1)], SK: [ep("K140", 140)] });
  const result = await resolveEpisode(api.fetchJson, { seriesId: "OP", season: 0, episode: 140 });
  assert.equal(result.url, "https://www.crunchyroll.com/watch/K140/ep-140");
});

test("episodes without numbers fall back to their position in the season", async () => {
  const api = fakeApi([{ id: "S1", season_sequence_number: 1, number_of_episodes: 3 }], { S1: [{ id: "X1", slug_title: "a" }, { id: "X2", slug_title: "b" }, { id: "X3", slug_title: "c" }] });
  assert.equal((await resolveEpisode(api.fetchJson, { seriesId: "S", episode: 2 })).url, "https://www.crunchyroll.com/watch/X2/b");
});

test("an unknown episode opens the series page instead", async () => {
  const api = fakeApi([{ id: "S1", season_sequence_number: 1, number_of_episodes: 12 }], { S1: [ep("A1", 1)] });
  assert.deepEqual(await resolveEpisode(api.fetchJson, { seriesId: "SER", episode: 40 }), { url: "https://www.crunchyroll.com/series/SER", exact: false });
});

test("a season Crunchyroll doesn't list never borrows another season's episode by position", async () => {
  const api = fakeApi([{ id: "S1", season_sequence_number: 1, number_of_episodes: 2 }, { id: "S2", season_sequence_number: 2, number_of_episodes: 6 }], { S1: [ep("A1", 1)], S2: [{ id: "X1", slug_title: "a" }, { id: "X2", slug_title: "b" }, { id: "X3", slug_title: "c" }, { id: "X4", slug_title: "d" }, { id: "X5", slug_title: "e" }] });
  assert.deepEqual(await resolveEpisode(api.fetchJson, { seriesId: "SER", season: 2, episode: 5 }), { url: "https://www.crunchyroll.com/series/SER", exact: false });
});

test("fetched season lists become cached links that expire after a month", () => {
  const links = seasonLinks({ data: [ep("E1", 1), ep("E2", 2), { id: "", episode_number: 3 }] });
  assert.deepEqual(links, { 1: "https://www.crunchyroll.com/watch/E1/ep-1", 2: "https://www.crunchyroll.com/watch/E2/ep-2" });
  const now = 1_000_000_000_000;
  const store = rememberLinks({}, "GSERIES1", 1, links, now);
  assert.equal(cachedLink(store, { seriesId: "GSERIES1", season: 1, episode: 2 }, now), links[2]);
  assert.equal(cachedLink(store, { seriesId: "GSERIES1", season: 0, episode: 2 }, now), null);
  assert.equal(cachedLink(store, { seriesId: "GSERIES1", season: 1, episode: 2 }, now + 31 * 24 * 60 * 60 * 1000), null);
});

test("the link cache keeps the most recently used shows", () => {
  let store = {};
  for (let n = 0; n < 160; n += 1) store = rememberLinks(store, `GS${String(n).padStart(6, "0")}`, 0, { 1: `https://www.crunchyroll.com/watch/E${n}` }, 1000 + n);
  assert.equal(Object.keys(store).length, 150);
  assert.equal(store.GS000000, undefined);
  assert.ok(store.GS000159);
});

test("every season list fetched along the way is reported", async () => {
  const api = fakeApi([{ id: "S1", season_number: 1, number_of_episodes: 2 }, { id: "S2", season_number: 2, number_of_episodes: 2 }], { S1: [ep("A1", 1), ep("A2", 2)], S2: [ep("B3", 3), ep("B4", 4)] });
  const seen = [];
  const found = await resolveEpisode(api.fetchJson, { seriesId: "GSERIES1", season: 0, episode: 4 }, (index, list) => seen.push([index, list.data.length]));
  assert.equal(found.exact, true);
  assert.deepEqual(seen, [[0, 2], [1, 2]]);
});
