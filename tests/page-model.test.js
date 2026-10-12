import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildObservation,
  episodeNumberFromLabel,
  inferAudioMode,
  parseAnchorSnippets,
  parseCmsObjects,
  parseCmsSeasons,
  seriesIdFromHref,
} from "../lib/page-model.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("parses crunchyroll cms episode and season payloads", () => {
  const episodes = parseCmsObjects({
    data: [{
      id: "EP1",
      type: "episode",
      episode_metadata: {
        episode_number: "3",
        season_id: "SE1",
        season_number: 1,
        season_title: "Season 1",
        season_slug_title: "cour-1",
        series_id: "G1",
        series_slug_title: "demo",
        series_title: "Demo Show",
        audio_locale: "ja-JP",
      },
    }],
  });
  const seasons = parseCmsSeasons([{
    id: "SE1",
    title: "Season 1",
    season_number: 1,
    series_id: "G1",
    slug_title: "cour-1",
    number_of_episodes: 12,
  }]);
  assert.equal(episodes[0].seasonSlug, "cour-1");
  assert.equal(seasons[0].episodeCount, 12);

  const observation = buildObservation({
    kind: "watch",
    pathname: "/watch/EP1/demo",
    pageUrl: "https://www.crunchyroll.com/watch/EP1/demo",
    watchId: "EP1",
    seriesTitle: "",
    cmsEpisodes: episodes,
    cmsSeasons: seasons,
    anchors: [],
  });
  assert.equal(observation.seasons.length, 1);
  assert.equal(observation.seasons[0].episodeCount, 12);
  assert.equal(observation.seasons[0].watchingEpisode, 3);
  assert.equal(observation.audio, "sub");
  assert.equal(observation.currentKey, "G1|cour-1");
});

test("reads a browse fixture the same way series links are collected", () => {
  const html = fs.readFileSync(path.join(root, "fixtures", "browse.html"), "utf8");
  const anchors = parseAnchorSnippets(html);
  const observation = buildObservation({
    kind: "browse",
    pathname: "/videos/popular",
    pageUrl: "https://www.crunchyroll.com/videos/popular",
    anchors,
  });
  assert.deepEqual(observation.sightings.map((item) => item.seriesId), ["G111", "G222"]);
  assert.equal(observation.sightings[0].title, "Demon Slayer");
  assert.equal(observation.seasons.length, 0);
  assert.equal(seriesIdFromHref("/de/series/G999/slug"), "G999");
  assert.equal(episodeNumberFromLabel("E12 - The end"), 12);
  assert.equal(inferAudioMode("Japanese", "English").mode, "sub");
  assert.equal(inferAudioMode("English", "English").mode, "dub");
});

test("dom fallback creates one season when cms metadata is missing", () => {
  const observation = buildObservation({
    kind: "series",
    pathname: "/series/G50/demo",
    pageUrl: "https://www.crunchyroll.com/series/G50/demo",
    seriesId: "G50",
    seriesTitle: "Demo",
    activeSeasonTitle: "Cour One",
    audioText: "Japanese",
    subtitleText: "English",
    genres: ["Action", "Action"],
    domEpisodeCount: 12,
    anchors: [],
  });
  assert.equal(observation.seasons.length, 1);
  assert.equal(observation.seasons[0].seasonSlug, "dom-cour-one");
  assert.equal(observation.seasons[0].episodeCount, 12);
  assert.deepEqual(observation.seasons[0].genres, ["Action"]);
  assert.equal(observation.audio, "sub");
});
