import assert from "node:assert/strict";
import test from "node:test";
import { hasIntent, parseQuery } from "../lib/query.js";
import { buildIndex, correctWord, findTitle, searchIndex, tokenize } from "../lib/search-index.js";

const NOW = new Date("2026-10-10T12:00:00Z");

function show(id, title, extra = {}) {
  return { id, title, genres: [], tags: [], about: "", episodes: 12, format: "TV", popularity: 10000, score: 70, ...extra };
}

const SHOWS = [
  show("frieren", "Frieren: Beyond Journey's End", { genres: ["Adventure", "Fantasy", "Drama"], popularity: 500000, score: 90, episodes: 28 }),
  show("loafer", "Skip and Loafer", { genres: ["Comedy", "Romance", "Slice of Life"], popularity: 130000 }),
  show("another", "Another", { genres: ["Horror", "Mystery"], popularity: 300000 }),
  show("kaya", "Kaya-chan Isn't Scary", { genres: ["Comedy", "Slice of Life"] }),
  show("dramatical", "DRAMAtical Murder", { genres: ["Action"], tags: ["Boys' Love"] }),
  show("april", "Your Lie in April", {
    genres: ["Drama", "Music", "Romance"],
    hiddenTags: ["Tragedy"],
    tagRanks: { Tragedy: 92 },
    popularity: 600000,
    episodes: 22,
  }),
  show("grim", "Grim Tragedy", { genres: ["Drama", "Horror"], tags: ["Gore", "Tragedy"], tagRanks: { Gore: 90, Tragedy: 90 }, popularity: 600000 }),
  show("silent", "A Silent Voice", { genres: ["Drama"], format: "MOVIE", episodes: 1, popularity: 700000 }),
  show("moviename", "Movie", { format: "TV", episodes: null }),
  show("bocchi", "BOCCHI THE ROCK!", { genres: ["Comedy", "Music"], popularity: 400000 }),
  show("hitori", "Hitoribocchi no Marumaruseikatsu", { synonyms: ["Bocchi Seikatsu"], genres: ["Comedy"], about: "Bocchi tries to make friends. Bocchi is shy.", popularity: 70000 }),
  show("bocchi-recap", "BOCCHI THE ROCK! Recap Part 1", { genres: ["Comedy", "Music"], format: "MOVIE", popularity: 26000 }),
  show("vampire", "Night Class", { about: "Students hide a vampire in their class.", episodes: 24 }),
  show("plain", "Plain Show", { about: "A sports team trains for a tournament.", popularity: 900000 }),
  show("long", "Long Romance", { genres: ["Romance"], episodes: 50, popularity: 900000 }),
];

const index = buildIndex(SHOWS);
const ids = (query, options = {}) => searchIndex(index, parseQuery(query, { now: NOW }), options).results.map((row) => row.doc.id);

test("parseQuery turns moods into labels and length words into filters", () => {
  const parsed = parseQuery("a short romance I have not seen", { now: NOW });
  assert.deepEqual(parsed.terms, []);
  assert.equal(parsed.concepts[0].labels.Romance, 1);
  assert.equal(parsed.filters.maxEpisodes, 13);
  assert.equal(parsed.filters.unwatched, true);
  assert.equal(parseQuery("a movie for tonight").filters.format, "MOVIE");
  assert.equal(parseQuery("something from the 90s").filters.yearTo, 1999);
  assert.equal(parseQuery("like Frieren but funnier").similarTo, "frieren");
  assert.equal(hasIntent(parseQuery("frieren")), false);
  assert.equal(hasIntent(parseQuery("something scary")), true);
});

test("without, no, and not turn a mood or tag into an exclusion instead of a wish", () => {
  const isekai = parseQuery("isekai without harem");
  assert.deepEqual(isekai.without, ["Male Harem", "Female Harem"]);
  assert.deepEqual(isekai.concepts.map((concept) => concept.word), ["isekai"]);
  assert.deepEqual(parseQuery("fantasy with no gore").without, ["Gore"]);
  assert.deepEqual(parseQuery("romance that isn't too sad").without, ["Tragedy"]);
  assert.deepEqual(parseQuery("a short romance I have not seen").without, []);
  assert.equal(parseQuery("a short romance I have not seen").filters.unwatched, true);
});

test("tokenize folds case, accents, punctuation, and plurals", () => {
  assert.deepEqual(tokenize("Pokémon: Battles!"), ["pokemon", "battle"]);
});

test("an exact title wins over a description that repeats the word", () => {
  assert.equal(ids("frieren")[0], "frieren");
  assert.equal(ids("bocchi")[0], "bocchi");
  assert.equal(ids("bocchi", { mode: "title" })[0], "bocchi");
  assert.ok(ids("bocchi").indexOf("bocchi-recap") > ids("bocchi").indexOf("bocchi"));
  assert.equal(findTitle(index, "bocchi the rock").doc.id, "bocchi");
});

test("misspelled titles still find the show, but partial words are left alone", () => {
  assert.equal(ids("frieran")[0], "frieren");
  assert.equal(ids("skip and loafre")[0], "loafer");
  assert.equal(correctWord(index, "frie"), "frie");
  assert.equal(correctWord(index, "frieran"), "frieren");
  assert.deepEqual(ids("xqzv blorp"), []);
  assert.equal(findTitle(index, "frieran").doc.id, "frieren");
});

test("a title typed without its spaces still finds the show", () => {
  assert.equal(ids("skipandloafer")[0], "loafer");
  assert.equal(ids("bocchitherock")[0], "bocchi");
  assert.equal(ids("bocchithe")[0], "bocchi");
  assert.equal(findTitle(index, "skipandloafer").doc.id, "loafer");
  assert.equal(ids("ock").includes("bocchi"), false);
});

test("messy input from real users never throws and never matches junk", () => {
  assert.equal(ids("  FRIEREN  ")[0], "frieren");
  assert.equal(ids("Frieren!!!")[0], "frieren");
  assert.deepEqual(ids(""), []);
  assert.deepEqual(ids("   "), []);
  assert.deepEqual(ids("<img src=x onerror=alert(1)>"), []);
  assert.deepEqual(ids("%"), []);
  assert.deepEqual(ids("x".repeat(500)), []);
  assert.deepEqual(ids("zzzzqqq"), []);
});

test("rom com needs both romance and comedy, and filler words alone match no title", () => {
  const parsed = parseQuery("a rom-com");
  assert.equal(parsed.concepts.length, 2);
  assert.equal(ids("rom com")[0], "loafer");
  assert.notEqual(ids("anything")[0], "kaya");
});

test("mood searches use labels, not matching words in titles", () => {
  assert.ok(ids("something scary").slice(0, 2).includes("another"));
  assert.equal(ids("something scary").includes("kaya"), false);
  assert.equal(ids("a sad drama that will make me cry").includes("dramatical"), false);
  assert.equal(ids("a short romance I have not seen")[0], "loafer");
  assert.equal(ids("a short romance I have not seen").includes("long"), false);
});

test("spoiler tags count for search, and gory shows fall behind tearjerkers", () => {
  const sad = ids("a sad drama that will make me cry");
  assert.ok(sad.includes("april"));
  assert.ok(sad.indexOf("april") < sad.indexOf("grim"));
});

test("format filters keep movies and skip titles that only say movie", () => {
  const movie = ids("a movie for tonight");
  assert.equal(movie[0], "silent");
  assert.equal(movie.includes("moviename"), false);
});

test("description words find a show when no label matches", () => {
  assert.equal(ids("a vampire story")[0], "vampire");
});

test("status and site limits apply, and fit stays between 0 and 1", () => {
  const parsed = parseQuery("a short romance I have not seen", { now: NOW });
  const watched = searchIndex(index, parsed, { statusFor: (doc) => (doc.id === "loafer" ? "finished" : "unwatched") }).results;
  assert.equal(watched.some((row) => row.doc.id === "loafer"), false);
  const limited = searchIndex(index, parseQuery("romance"), { allowed: (doc) => doc.id !== "loafer" }).results;
  assert.equal(limited.some((row) => row.doc.id === "loafer"), false);
  for (const row of searchIndex(index, parseQuery("something scary")).results) {
    assert.ok(row.fit >= 0 && row.fit <= 1);
  }
});

test("like-this searches skip the named show and rank shared labels", () => {
  const similar = ids("like Your Lie in April");
  assert.equal(similar.includes("april"), false);
  assert.ok(similar.slice(0, 3).includes("silent"));
  assert.ok(similar.indexOf("silent") < similar.indexOf("bocchi"));
});

test("like-this plus a mood favors the named show unless that is turned off", () => {
  const favored = searchIndex(index, parseQuery("like Your Lie in April but funny"), { favorNamed: true }).results;
  const balanced = searchIndex(index, parseQuery("like Your Lie in April but funny"), { favorNamed: false }).results;
  const rankOf = (rows, id) => rows.findIndex((row) => row.doc.id === id);
  assert.ok(rankOf(favored, "silent") >= 0);
  assert.ok(rankOf(favored, "silent") <= rankOf(balanced, "silent") || rankOf(balanced, "silent") < 0);
});

test("setting phrases become setting words instead of search words", () => {
  const placed = parseQuery("anime that take place in germany and is a mecha anime");
  assert.deepEqual(placed.setting, ["germany"]);
  assert.deepEqual(placed.terms, []);
  assert.deepEqual(placed.concepts.map((concept) => concept.word), ["mecha"]);
  const twist = parseQuery("Like 86, but in germany");
  assert.equal(twist.similarTo, "86");
  assert.deepEqual(twist.setting, ["germany"]);
  assert.deepEqual(parseQuery("a romance set in paris").setting, ["paris"]);
  assert.deepEqual(parseQuery("germany mecha").setting, ["germany"]);
  assert.deepEqual(parseQuery("mecha set in space").setting, []);
  assert.ok(parseQuery("mecha set in space").concepts.some((concept) => concept.word === "space"));
  const decade = parseQuery("fantasy that takes place in the 1980s");
  assert.equal(decade.filters.yearFrom, null);
  assert.deepEqual(decade.setting, []);
  assert.deepEqual(parseQuery("anime set in 1983").setting, ["1983"]);
  assert.equal(parseQuery("80s mecha").filters.yearFrom, 1980);
  assert.ok(hasIntent(parseQuery("anime set in france")));
});

test("a setting matches its place names and finds shows that only say it late in the synopsis", () => {
  const filler = "A long opening about soldiers, aliens, and a war that has gone on for years. ".repeat(6);
  const settingIndex = buildIndex([
    show("marks", "Black Marks", { genres: ["Mecha", "Sci-Fi"], tags: ["Military", "War"], about: `${filler}The squad is stationed in East Germany.`, popularity: 20000 }),
    show("eighty", "Eighty", { genres: ["Mecha", "Sci-Fi", "Drama"], tags: ["Military", "War"], popularity: 300000 }),
    show("robots", "Robot Brawl", { genres: ["Mecha", "Action"], popularity: 400000 }),
    show("bakery", "Berlin Bakery", { genres: ["Slice of Life"], about: "A baker opens a shop in Berlin.", popularity: 50000 }),
    show("paris", "Paris Nights", { genres: ["Romance"], about: "Two French students fall in love.", popularity: 50000 }),
  ]);
  const top = (query) => searchIndex(settingIndex, parseQuery(query)).results.map((row) => row.doc.id);
  assert.equal(top("anime that take place in germany and is a mecha anime")[0], "marks");
  assert.equal(top("Like Eighty, but in germany")[0], "marks");
  assert.ok(top("set in germany").includes("bakery"));
  assert.equal(top("romance set in france")[0], "paris");
  const rows = searchIndex(settingIndex, parseQuery("mecha in germany")).results;
  assert.equal(rows.find((row) => row.doc.id === "marks").settingHit, true);
  assert.equal(rows.find((row) => row.doc.id === "robots").settingHit, false);
});

test("binge no longer means short", () => {
  assert.equal(parseQuery("something to binge in a weekend").filters.maxEpisodes, null);
});
