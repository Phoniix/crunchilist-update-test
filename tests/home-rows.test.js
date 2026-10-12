import assert from "node:assert/strict";
import test from "node:test";
import {
  activitySignature,
  buildHomeRowsPrompt,
  cleanNudge,
  expiryFor,
  fallbackThemes,
  fillThemes,
  HOME_ROWS_ACTIVITY_MS,
  HOME_ROWS_MAX,
  HOME_ROWS_MIN,
  HOME_ROWS_RETRY_MS,
  HOME_ROWS_TTL_MS,
  needsRefresh,
  NUDGE_MAX,
  parseHomeRows,
  shortTitle,
} from "../lib/home-rows.js";

const row = (title, query, why = "Because.") => ({ title, query, why });

test("the AI's rows are read from JSON, tidied, deduplicated and capped at six", () => {
  const text = "```json\n" + JSON.stringify({ rows: [
    row("  Cozy   evenings ", "cozy slice of life"),
    row("cozy evenings", "something else"),
    row("Space wars", "COZY SLICE OF LIFE"),
    row("", "no title"),
    row("No query", ""),
    row("Dark fantasy", "dark fantasy revenge"),
    row("Sports", "short sports"),
    row("Mystery", "underrated mystery"),
    row("Mecha", "mecha"),
    row("Music", "music idol"),
    row("Romance", "romance comedy"),
  ] }) + "\n```";
  const parsed = parseHomeRows(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, HOME_ROWS_MAX);
  assert.deepEqual(parsed.rows[0], { title: "Cozy evenings", query: "cozy slice of life", why: "Because." });
  assert.deepEqual(parsed.rows.map((r) => r.title), ["Cozy evenings", "Dark fantasy", "Sports", "Mystery", "Mecha", "Music"]);
  assert.equal(parseHomeRows(JSON.stringify({ rows: [row("A", "a"), row("B", "b")] })).ok, false, "fewer than three rows is not usable");
  assert.equal(parseHomeRows("not json").ok, false);
  assert.equal(parseHomeRows(JSON.stringify([row("A", "a"), row("B", "b"), row("C", "c")])).ok, true, "a bare array is accepted");
});

test("rows whose query uses a hard-avoided tag are dropped", () => {
  const text = JSON.stringify({ rows: [row("Gore fest", "gore horror"), row("A", "a"), row("B", "b"), row("C", "c"), row("Gory", "gory")] });
  const parsed = parseHomeRows(text, ["Gore"]);
  assert.deepEqual(parsed.rows.map((r) => r.title), ["A", "B", "C", "Gory"], "matches whole words only");
});

test("the prompt carries taste, top tags, recent watching and recent searches", () => {
  const prompt = buildHomeRowsPrompt({ profile: { liked: ["Action"] }, liked: ["action", "drama"], watched: ["Frieren"], searches: ["space opera"] });
  const user = JSON.parse(prompt.user);
  assert.deepEqual(user, { profile: { liked: ["Action"] }, topTags: ["action", "drama"], recentlyWatched: ["Frieren"], recentSearches: ["space opera"] });
  assert.match(prompt.system, /5 to 6 rows/);
  assert.match(prompt.system, /hardAvoids/);
});

test("fallback themes come from history, tags and searches, and always fill at least five rows", () => {
  const full = fallbackThemes({ liked: ["slice of life", "comedy", "mystery"], watched: ["Frieren", "Dandadan"], searches: ["space opera"] });
  assert.equal(full.length, HOME_ROWS_MAX);
  assert.deepEqual(full[0], { title: "Because you watched Frieren", query: "like Frieren", why: "Shows that share the most with Frieren." });
  assert.ok(full.some((r) => r.title === "More Slice Of Life" && r.query === "slice of life"));
  assert.ok(full.some((r) => r.query === "space opera"));
  const empty = fallbackThemes({});
  assert.ok(empty.length >= HOME_ROWS_MIN && empty.length <= HOME_ROWS_MAX);
  assert.ok(empty.every((r) => r.title && r.query));
});

test("a typed nudge goes into the prompt only when there is one, tidied and capped", () => {
  assert.equal(JSON.parse(buildHomeRowsPrompt({ profile: {} }).user).nudge, undefined);
  assert.equal(JSON.parse(buildHomeRowsPrompt({ profile: {}, nudge: "rainy day" }).user).nudge, "rainy day");
  assert.match(buildHomeRowsPrompt({ profile: {} }).system, /nudge, not a filter/);
  assert.equal(cleanNudge("  rainy   day  "), "rainy day");
  assert.equal(cleanNudge("x".repeat(200)).length, NUDGE_MAX);
  assert.equal(cleanNudge(null), "");
});

test("without AI a nudge leads the fallback rows and the usual taste rows follow", () => {
  const rows = fallbackThemes({ liked: ["comedy", "romance"], watched: ["Frieren"], nudge: "rainy day" });
  assert.deepEqual(rows.slice(0, 2).map((r) => r.query), ["rainy day", "rainy day comedy"]);
  assert.equal(rows[0].title, 'Inspired by "rainy day"');
  assert.ok(rows.some((r) => r.query === "like Frieren"), "taste rows still appear");
  assert.equal(rows.length, HOME_ROWS_MAX);
});

test("long show titles are shortened in row names and clipped on a word", () => {
  const rows = fallbackThemes({ watched: ["Frieren: Beyond Journey's End"], liked: ["fantasy"] });
  assert.deepEqual(rows[0], { title: "Because you watched Frieren", query: "like Frieren: Beyond Journey's End", why: "Shows that share the most with Frieren." });
  assert.equal(shortTitle("Re:ZERO -Starting Life in Another World-"), "Re:ZERO -Starting Life in Another World-");
  assert.equal(shortTitle("Spy x Family - Season 2"), "Spy x Family");
  const [long] = parseHomeRows(JSON.stringify({ rows: [row("An extremely long row name that keeps going and going on", "a"), row("B", "b"), row("C", "c")] })).rows;
  assert.equal(long.title, "An extremely long row name that keeps going…");
});

test("rows refresh after 12 hours, or after an hour when activity changed", () => {
  const now = 1_000_000_000_000;
  const saved = { themes: [row("A", "a")], signature: "s1", createdAt: now, expiresAt: now + HOME_ROWS_TTL_MS };
  assert.equal(needsRefresh(null, "s1", now), true);
  assert.equal(needsRefresh({ ...saved, themes: [] }, "s1", now), true);
  assert.equal(needsRefresh(saved, "s1", now + 60_000), false);
  assert.equal(needsRefresh(saved, "s1", now + HOME_ROWS_TTL_MS - 1), false);
  assert.equal(needsRefresh(saved, "s1", now + HOME_ROWS_TTL_MS), true);
  assert.equal(needsRefresh(saved, "s2", now + HOME_ROWS_ACTIVITY_MS - 1), false, "new activity waits at least an hour");
  assert.equal(needsRefresh(saved, "s2", now + HOME_ROWS_ACTIVITY_MS), true);
  assert.equal(needsRefresh(saved, "s1", now - 1), true, "a clock that went backwards regenerates");
});

test("a failed AI attempt retries within the hour; a good one lasts 12 hours", () => {
  assert.equal(expiryFor({ wantedAi: true, gotAi: false, now: 0 }), HOME_ROWS_RETRY_MS);
  assert.equal(expiryFor({ wantedAi: true, gotAi: true, now: 0 }), HOME_ROWS_TTL_MS);
  assert.equal(expiryFor({ wantedAi: false, gotAi: false, now: 0 }), HOME_ROWS_TTL_MS);
});

test("the activity signature follows taste, watched shows, top searches and AI setup", () => {
  const base = { taste: { liked: ["a"] }, watchedIds: ["2", "1"], searches: ["x", "y", "z"], aiKey: "k" };
  const sig = activitySignature(base);
  assert.equal(activitySignature({ ...base, watchedIds: ["1", "2"] }), sig, "order of watched ids doesn't matter");
  assert.equal(activitySignature({ ...base, searches: ["X", "Y", "other"] }), sig, "only the two newest searches count, ignoring case");
  assert.notEqual(activitySignature({ ...base, watchedIds: ["1", "2", "3"] }), sig);
  assert.notEqual(activitySignature({ ...base, taste: { liked: ["b"] } }), sig);
  assert.notEqual(activitySignature({ ...base, aiKey: "off" }), sig);
});

test("filling rows keeps each show in one row and drops thin rows", () => {
  const results = { a: ["1", "2", "3", "4", "5", "6"], b: ["1", "2", "7"], c: ["6", "7", "8", "9", "10", "11", "12"] };
  const rows = fillThemes([row("A", "a"), row("B", "b"), row("C", "c")], (query) => results[query], { perRow: 5, minRow: 3 });
  assert.deepEqual(rows.map((r) => [r.title, r.ids]), [
    ["A", ["1", "2", "3", "4", "5"]],
    ["C", ["6", "7", "8", "9", "10"]],
  ]);
});
