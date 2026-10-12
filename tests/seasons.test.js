import assert from "node:assert/strict";
import test from "node:test";
import { extrasFrontier, keepReachable, mediaNode, missingNode, nodeStale, seasonChain } from "../lib/seasons.js";

const NOW = Date.UTC(2026, 9, 12);
const DAY = 864e5;

function media(id, extra = {}) {
  return {
    id,
    format: "TV",
    episodes: 12,
    seasonYear: 2020,
    status: "FINISHED",
    title: { english: `Show ${id}`, romaji: `Show ${id} romaji`, native: "番組" },
    coverImage: { large: `https://img/${id}.jpg`, color: "#123456" },
    relations: { edges: [] },
    ...extra,
  };
}

const sequel = (id, format = "TV") => ({ relationType: "SEQUEL", node: { id, type: "ANIME", format } });
const prequel = (id, format = "TV") => ({ relationType: "PREQUEL", node: { id, type: "ANIME", format } });

test("mediaNode keeps trailers, studio, airing and season links", () => {
  const node = mediaNode(media(1, {
    trailer: { id: "GuV7NbcoNy4", site: "youtube" },
    studios: { nodes: [{ name: "Madhouse" }] },
    nextAiringEpisode: { airingAt: 1_800_000_000, episode: 5 },
    externalLinks: [{ site: "Netflix", url: "https://netflix.com/x", type: "STREAMING" }, { site: "Twitter", url: "https://x.com/a", type: "SOCIAL" }],
    description: "A <b>story</b>.",
    relations: { edges: [sequel(3, "MOVIE"), sequel(2), prequel(9), { relationType: "SEQUEL", node: { id: 8, type: "MANGA", format: "MANGA" } }, { relationType: "SIDE_STORY", node: { id: 7, type: "ANIME", format: "TV" } }] },
  }), NOW);
  assert.equal(node.trailer, "GuV7NbcoNy4");
  assert.equal(node.studio, "Madhouse");
  assert.deepEqual(node.airing, { at: 1_800_000_000, episode: 5 });
  assert.deepEqual(node.streaming, [{ site: "Netflix", url: "https://netflix.com/x" }]);
  assert.deepEqual(node.sequels, [2, 3], "TV seasons come before movies, manga is left out");
  assert.deepEqual(node.prequels, [9]);
  assert.equal(node.about, "", "descriptions are only kept when asked for");
  assert.equal(mediaNode(media(1, { description: "A <b>story</b>." }), NOW, { keepAbout: true }).about, "A story.");
});

test("mediaNode drops trailers that aren't YouTube", () => {
  assert.equal(mediaNode(media(1, { trailer: { id: "x123456", site: "dailymotion" } }), NOW).trailer, "");
  assert.equal(mediaNode(media(1, { trailer: { id: "bad id <script>", site: "youtube" } }), NOW).trailer, "");
});

test("airing shows refresh daily, finished ones monthly, and passed airing times right away", () => {
  assert.equal(nodeStale(null, NOW), true);
  assert.equal(nodeStale({ status: "FINISHED", fetchedAt: NOW - 10 * DAY }, NOW), false);
  assert.equal(nodeStale({ status: "FINISHED", fetchedAt: NOW - 31 * DAY }, NOW), true);
  assert.equal(nodeStale({ status: "RELEASING", fetchedAt: NOW - 2 * DAY }, NOW), true);
  assert.equal(nodeStale({ status: "RELEASING", fetchedAt: NOW - 3600e3, airing: { at: (NOW - 1000) / 1000, episode: 3 } }, NOW), true);
  assert.equal(nodeStale({ status: "RELEASING", fetchedAt: NOW - 3600e3, airing: { at: (NOW + DAY) / 1000, episode: 3 } }, NOW), false);
});

function nodes(...rows) {
  return Object.fromEntries(rows.map((row) => [row.id, mediaNode(row, NOW)]));
}

test("seasonChain follows prequels and sequels in order and labels movies", () => {
  const all = nodes(
    media(1, { seasonYear: 2019, relations: { edges: [sequel(2)] } }),
    media(2, { seasonYear: 2021, relations: { edges: [prequel(1), sequel(3, "MOVIE")] } }),
    media(3, { seasonYear: 2022, format: "MOVIE", episodes: 1, relations: { edges: [prequel(2)] } }),
  );
  const chain = seasonChain(2, all, new Set([2]));
  assert.deepEqual(chain.map((row) => [row.anilistId, row.label]), [[1, "Season 1"], [2, "Season 2"], [3, "Movie"]]);
});

test("seasonChain stops at entries Crunchyroll lists as their own show", () => {
  const all = nodes(
    media(1, { relations: { edges: [sequel(2)] } }),
    media(2, { seasonYear: 2021, relations: { edges: [prequel(1)] } }),
  );
  assert.deepEqual(seasonChain(1, all, new Set([1, 2])).map((row) => row.anilistId), [1]);
});

test("seasonChain skips links that go back in time and missing entries", () => {
  const all = nodes(
    media(1, { seasonYear: 2020, relations: { edges: [sequel(2), sequel(4)] } }),
    media(2, { seasonYear: 2015 }),
  );
  all[4] = missingNode(4, NOW);
  assert.deepEqual(seasonChain(1, all, new Set([1])).map((row) => row.anilistId), [1]);
  assert.deepEqual(seasonChain(4, all, new Set()), []);
});

test("extrasFrontier asks for unknown shows first, then the next unknown season link", () => {
  assert.deepEqual(extrasFrontier([1, 2], {}, new Set([1, 2]), NOW), [1, 2]);
  const known = nodes(media(1, { relations: { edges: [sequel(5)] } }), media(2));
  assert.deepEqual(extrasFrontier([1, 2], known, new Set([1, 2]), NOW), [5]);
  const deeper = { ...known, ...nodes(media(5, { seasonYear: 2021, relations: { edges: [prequel(1), sequel(6)] } })) };
  assert.deepEqual(extrasFrontier([1, 2], deeper, new Set([1, 2]), NOW), [6]);
  deeper[6] = missingNode(6, NOW);
  assert.deepEqual(extrasFrontier([1, 2], deeper, new Set([1, 2]), NOW), []);
});

test("keepReachable drops entries no show uses anymore", () => {
  const all = nodes(media(1, { relations: { edges: [sequel(5)] } }), media(5, { seasonYear: 2021 }), media(77));
  all[9] = missingNode(9, NOW);
  assert.deepEqual(Object.keys(keepReachable(all, [1], new Set([1]))).sort(), ["1", "5", "9"]);
});
