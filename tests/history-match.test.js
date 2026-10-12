import assert from "node:assert/strict";
import test from "node:test";
import { cleanSeasonTitle, continuedNumbers, episodeRange, historySearches, matchHistory, pickSeason } from "../lib/history-match.js";

const media = (id, english, episodes, extra = {}) => ({ id, format: "TV", episodes, popularity: 1000, title: { english, romaji: english }, synonyms: [], coverImage: { large: "" }, ...extra });

const ONE_PIECE = media(21, "ONE PIECE", null, { popularity: 750000 });
const FAIRY_TAIL = media(6702, "Fairy Tail", 175, { popularity: 380000 });
const FAIRY_TAIL_2 = media(20626, "Fairy Tail Series 2", 102, { popularity: 180000 });
const FAIRY_TAIL_3 = media(99749, "Fairy Tail Final Season", 51, { popularity: 140000 });
const HXH_1999 = media(136, "Hunter x Hunter", 62, { popularity: 135000 });
const HXH_2011 = media(11061, "Hunter x Hunter (2011)", 148, { popularity: 850000, title: { english: "Hunter x Hunter (2011)", romaji: "HUNTER×HUNTER (2011)" } });
const NARUTO = media(20, "Naruto", 220, { popularity: 730000 });
const SHIPPUDEN = media(1735, "Naruto: Shippuden", 500, { popularity: 610000 });
const BLACK_CLOVER = media(97940, "Black Clover", 170, { popularity: 590000 });
const BLACK_CLOVER_2 = media(195604, "Black Clover Season 2", null, { popularity: 88000 });
const JOJO_SC = media(20474, "JoJo's Bizarre Adventure: Stardust Crusaders", 24, { popularity: 348000 });
const JOJO_EGYPT = media(20799, "JoJo's Bizarre Adventure: Stardust Crusaders - Battle in Egypt", 24, { popularity: 294000 });
const SMOKING = media(196187, "Smoking Behind the Supermarket with You", 12);
const MASHLE = media(151801, "MASHLE: MAGIC AND MUSCLES", 12, { popularity: 290000 });
const MASHLE_2 = media(166610, "MASHLE: MAGIC AND MUSCLES Season 2", 12, { popularity: 185000 });
const IRREGULAR_3 = media(143271, "The Irregular at Magic High School Season 3", 13);
const FAIRIES = media(9001, "Fairies", 12);
const FAIRIES_2_ONLY_SUBTITLE = media(9002, "Fairies: Another Tale", 12);
const AOT_3 = media(99147, "Attack on Titan Season 3", 12, { popularity: 600000 });
const AOT_3_2 = media(104578, "Attack on Titan Season 3 Part 2", 10, { popularity: 650000 });
const REZERO_2 = media(108632, "Re:ZERO -Starting Life in Another World- Season 2", 13, { popularity: 400000 });
const REZERO_2_2 = media(119661, "Re:ZERO -Starting Life in Another World- Season 2 Part 2", 12, { popularity: 330000 });
const DUNGEON_4 = media(155211, "Is It Wrong to Try to Pick Up Girls in a Dungeon? IV", 11, { popularity: 120000 });
const IDOL_2 = media(166531, "Idol Stage Season 2", 13, { popularity: 200000 });

const SEARCH = {
  "One Piece": [ONE_PIECE, media(171630, "THE ONE PIECE", 7, { format: null, popularity: 28000 })],
  "Fairy Tail": [FAIRY_TAIL, FAIRY_TAIL_3, FAIRY_TAIL_2],
  "Hunter x Hunter": [HXH_1999, HXH_2011],
  Naruto: [NARUTO, SHIPPUDEN],
  "Black Clover": [BLACK_CLOVER, BLACK_CLOVER_2],
  "JoJo's Bizarre Adventure: Stardust Crusaders": [JOJO_SC, JOJO_EGYPT],
  "Smoking Behind the Supermarket with You": [SMOKING],
  "MASHLE: MAGIC AND MUSCLES": [MASHLE, MASHLE_2],
  "The Irregular at Magic High School Season 3": [IRREGULAR_3],
  Fairies: [FAIRIES, FAIRIES_2_ONLY_SUBTITLE],
  "Attack on Titan Season 3 Part 2": [AOT_3, AOT_3_2],
  "Attack on Titan Season 3": [AOT_3, AOT_3_2],
  "Re:ZERO -Starting Life in Another World Season 2": [REZERO_2, REZERO_2_2],
  "Is It Wrong to Try to Pick Up Girls in a Dungeon? Season 4": [],
  "Is It Wrong to Try to Pick Up Girls in a Dungeon?": [DUNGEON_4],
  "Idol Stage Season 2": [IDOL_2],
};
const SEQUELS = { 6702: FAIRY_TAIL_2, 20626: FAIRY_TAIL_3, 20474: JOJO_EGYPT, 108632: REZERO_2_2 };

function fakeAniList() {
  const searches = [];
  const ask = async (query, variables) => {
    const data = {};
    for (const [key, value] of Object.entries(variables)) {
      if (key.startsWith("s")) {
        searches.push(value);
        data[`p${key.slice(1)}`] = { media: SEARCH[value] || [] };
      } else {
        const sequel = SEQUELS[value];
        data[`m${key.slice(1)}`] = { id: value, relations: { edges: sequel ? [{ relationType: "SEQUEL", node: sequel }, { relationType: "SIDE_STORY", node: media(1, "Side", 1) }] : [] } };
      }
    }
    return { data };
  };
  return { ask, searches };
}

const span = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
let nextId = 0;
function group(seriesTitle, seasonTitle, [from, to], extra = {}) {
  const episodeList = span(from, to);
  nextId += 1;
  return {
    id: `season:${nextId}`,
    kind: "episode",
    seriesId: `G${nextId}`,
    seriesTitle,
    seasonTitle,
    seasonNumber: null,
    episodeList,
    partial: {},
    minEpisode: episodeList[0],
    maxEpisode: episodeList[episodeList.length - 1],
    watchedCount: episodeList.length,
    lastPlayed: 1,
    ...extra,
  };
}

async function run(groups, options = {}) {
  const api = fakeAniList();
  const result = await matchHistory(groups, { ask: api.ask, ...options });
  const byId = Object.fromEntries(result.items.map((item) => [item.anilistId, item]));
  return { ...result, byId, searches: api.searches };
}

test("season titles lose dub tags, episode ranges, and repeated season numbers", () => {
  assert.equal(cleanSeasonTitle("Season 01 (English Dub)"), "Season 01");
  assert.equal(cleanSeasonTitle("East Blue Special Edition HD, Subtitled (1-61)"), "East Blue Special Edition HD");
  assert.equal(cleanSeasonTitle("Season 1 Part 5 (126-150) (English Dub)"), "Season 1 Part 5");
  assert.equal(cleanSeasonTitle("Date A Live V (Season 5)"), "Date A Live V");
  assert.deepEqual(episodeRange("Zou (751-782)"), { from: 751, to: 782 });
  assert.deepEqual(episodeRange("Elbaph (1156-current)"), { from: 1156, to: null });
  assert.equal(episodeRange("Season 2"), null);
});

test("searches name the series alongside the season's own title", () => {
  const first = (seriesTitle, seasonTitle, seasonNumber = null) => historySearches({ kind: "episode", seriesTitle, seasonTitle, seasonNumber }).steps.map((step) => step.search);
  assert.deepEqual(first("Smoking Behind the Supermarket with You", "Season 1"), ["Smoking Behind the Supermarket with You"]);
  assert.deepEqual(first("Headhunted to Another World", "Season 01 (English Dub)"), ["Headhunted to Another World"]);
  assert.deepEqual(first("JoJo's Bizarre Adventure", "Season 4: Golden Wind", 4), ["JoJo's Bizarre Adventure: Golden Wind", "JoJo's Bizarre Adventure"]);
  assert.equal(first("Classroom of the Elite", "4th Season: Second Year, First Semester", 4)[0], "Classroom of the Elite: Second Year, First Semester");
  assert.equal(first("The Quintessential Quintuplets", "Specials")[0], "The Quintessential Quintuplets: Specials");
  assert.equal(first("The Testament of Sister New Devil", "The Testament of Sister New Devil: Season 2: Burst (English Dub)", 2)[0], "The Testament of Sister New Devil: Burst");
  assert.deepEqual(first("Black Clover", "Season 1 Part 3", 3), ["Black Clover"]);
  assert.deepEqual(first("Yamada-kun and the Seven Witches", "Yamada-kun and the Seven Witches"), ["Yamada-kun and the Seven Witches", "Yamada and the Seven Witches"]);
  const misfit = first("The Misfit of Demon King Academy", "The Misfit of Demon King Academy II: History's Strongest Demon King", 2);
  assert.ok(misfit.includes("The Misfit of Demon King Academy II"));
  assert.deepEqual(first("Kaguya-sama: Love is War", "Kaguya-sama: Love is War: Season 3.5: The First Kiss - Episodic Cut (English Dub)").slice(0, 2), [
    "Kaguya-sama: Love is War: The First Kiss - Episodic Cut",
    "Kaguya-sama: Love is War: The First Kiss",
  ]);
});

test("a numbered season picks the AniList entry carrying that number", () => {
  assert.equal(pickSeason("MASHLE: MAGIC AND MUSCLES", 2, [MASHLE, MASHLE_2])?.id, 166610);
  assert.equal(pickSeason("Fairies", 2, [FAIRIES, FAIRIES_2_ONLY_SUBTITLE]), null);
});

test("arc seasons with episode ranges land on the long-running entry", async () => {
  const { byId, unmatched, searches } = await run([
    group("One Piece", "Zou (751-782)", [751, 782]),
    group("One Piece", "East Blue Special Edition HD, Subtitled (1-61)", [1, 61]),
    group("One Piece", "Elbaph (1156-current)", [1156, 1160]),
  ]);
  assert.deepEqual(unmatched, []);
  assert.equal(byId[21].progress, 1160);
  assert.equal(byId[21].finished, false);
  assert.deepEqual(searches, ["One Piece"]);
});

test("Fairy Tail arcs split across AniList's three entries by episode number", async () => {
  const { byId } = await run([
    group("Fairy Tail", "Season 1 Part 6 (151-175)", [1, 175]),
    group("Fairy Tail", "Season 2 Part 2 (227-277)", [176, 277]),
    group("Fairy Tail", "Final Season (278-328)", [278, 300]),
  ]);
  assert.equal(byId[6702].progress, 175);
  assert.equal(byId[6702].finished, true);
  assert.equal(byId[20626].progress, 102);
  assert.equal(byId[20626].finished, true);
  assert.equal(byId[99749].progress, 23);
  assert.equal(byId[99749].finished, false);
});

test("arcs numbered from 1 inside Crunchyroll still use the range", async () => {
  const { byId } = await run([group("Fairy Tail", "Final Season (278-328)", [1, 51])]);
  assert.equal(byId[99749].progress, 51);
  assert.equal(byId[99749].finished, true);
});

test("an arc past the end of the older series picks the remake that holds it", async () => {
  const { byId } = await run([group("Hunter x Hunter", "Chimera Ant Arc (76-136)", [76, 136])]);
  assert.equal(byId[11061].progress, 136);
  assert.equal(byId[136], undefined);
});

test("a cached series that cannot hold the arc's episodes is searched again", async () => {
  const known = () => ({ settled: true, media: HXH_1999 });
  const { byId } = await run([group("Hunter x Hunter", "Chimera Ant Arc (76-136)", [76, 136])], { known });
  assert.equal(byId[11061].progress, 136);
});

test("a cached show that was still airing is looked up fresh", async () => {
  const stale = { settled: false, media: { ...SMOKING, episodes: null } };
  const { byId, searches } = await run([group("Smoking Behind the Supermarket with You", "Season 1", [1, 12])], { known: () => stale });
  assert.equal(byId[196187].finished, true);
  assert.deepEqual(searches, ["Smoking Behind the Supermarket with You"]);
});

test("later seasons with absolute numbering stay on the long single entry", async () => {
  const { byId } = await run([
    group("Naruto", "Season 1", [1, 35], { seasonNumber: 1 }),
    group("Naruto", "Season 5", [181, 220], { seasonNumber: 5 }),
    group("Black Clover", "Season 1 Part 1", [1, 51], { seasonNumber: 1 }),
    group("Black Clover", "Season 1 Part 3", [103, 170], { seasonNumber: 3 }),
  ]);
  assert.equal(byId[20].progress, 220);
  assert.equal(byId[20].finished, true);
  assert.equal(byId[1735], undefined);
  assert.equal(byId[97940].finished, true);
  assert.equal(byId[195604], undefined);
});

test("a later season numbered from 1 is never folded into season one", async () => {
  const { byId, unmatched } = await run([group("Fairies", "Fairies Season 2", [1, 12], { seasonNumber: 2 })]);
  assert.equal(byId[9001], undefined);
  assert.equal(unmatched.length, 1);
});

test("a long season continues into the sequel entry", async () => {
  const { byId } = await run([group("JoJo's Bizarre Adventure", "Season 2: Stardust Crusaders", [1, 48], { seasonNumber: 2 })]);
  assert.equal(byId[20474].finished, true);
  assert.equal(byId[20799].progress, 24);
  assert.equal(byId[20799].finished, true);
});

test("arc names fall back to the numbered season, dub seasons to the series", async () => {
  const { byId, unmatched } = await run([
    group("MASHLE: MAGIC AND MUSCLES", "The Divine Visionary Candidate Exam Arc", [1, 12], { seasonNumber: 2 }),
    group("The Irregular at Magic High School", "Season 03 (English Dub)", [1, 13], { seasonNumber: 3 }),
    group("Smoking Behind the Supermarket with You", "Season 1 (English Dub)", [1, 12], { seasonNumber: 1 }),
  ]);
  assert.deepEqual(unmatched, []);
  assert.equal(byId[166610].finished, true);
  assert.equal(byId[143271].finished, true);
  assert.equal(byId[196187].finished, true);
});

test("continued episode numbers restart at 1 only when they overflow the entry", () => {
  assert.deepEqual(continuedNumbers(span(12, 24), 13), span(1, 13));
  assert.deepEqual(continuedNumbers(span(26, 50), 13), span(1, 25));
  assert.deepEqual(continuedNumbers(span(1, 48), 24), span(1, 48));
  assert.deepEqual(continuedNumbers(span(3, 10), 12), span(3, 10));
  assert.deepEqual(continuedNumbers(span(5, 30), 13), span(5, 30));
  assert.deepEqual(continuedNumbers(span(26, 50), null), span(26, 50));
});

test("roman numerals and parts are read as season numbers", () => {
  const steps = (seriesTitle, seasonTitle, seasonNumber = null) => historySearches({ kind: "episode", seriesTitle, seasonTitle, seasonNumber }).steps;
  const dungeon = steps("Is It Wrong to Try to Pick Up Girls in a Dungeon?", "Season IV");
  assert.ok(dungeon.some((step) => step.season === 4));
  const titan = steps("Attack on Titan", "Season 3 Part 2", 4);
  assert.equal(titan[0].search, "Attack on Titan Season 3 Part 2");
});

test("Season N Part M lands on the part, not the first half", async () => {
  const { byId, unmatched } = await run([group("Attack on Titan", "Season 3 Part 2", [50, 59], { seasonNumber: 4 })]);
  assert.deepEqual(unmatched, []);
  assert.equal(byId[104578].progress, 10);
  assert.equal(byId[104578].finished, true);
  assert.equal(byId[99147], undefined);
});

test("a season numbered on from the last one fills both of its parts", async () => {
  const { byId } = await run([group("Re:ZERO -Starting Life in Another World-", "Season 2", [26, 50], { seasonNumber: 2 })]);
  assert.equal(byId[108632].finished, true);
  assert.equal(byId[119661].progress, 12);
  assert.equal(byId[119661].finished, true);
});

test("a season numbered on from the last one stays a single entry when it fits", async () => {
  const { byId } = await run([group("Idol Stage", "Season 2", [12, 24], { seasonNumber: 2 })]);
  assert.equal(byId[166531].progress, 13);
  assert.equal(byId[166531].finished, true);
});

test("roman-numbered seasons find the matching entry", async () => {
  const { byId, unmatched } = await run([group("Is It Wrong to Try to Pick Up Girls in a Dungeon?", "Season IV", [1, 11], { seasonNumber: 4 })]);
  assert.deepEqual(unmatched, []);
  assert.equal(byId[155211].finished, true);
});

test("canceling stops the matcher", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(run([group("Naruto", "Season 1", [1, 3])], { signal: controller.signal }), { name: "AbortError" });
});
