import assert from "node:assert/strict";
import test from "node:test";
import { galleryBanner, orderForYou, rankBanner, tasteMatches } from "../lib/banner.js";

const shows = "abcdefghijklmnop".split("").map((id) => ({ id }));
const trending = shows.map((show) => show.id);

test("taste scores map onto the 45-85 match scale, best first", () => {
  const scores = { a: 10, b: 5, c: 0, d: -3 };
  const matches = tasteMatches([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], (item) => scores[item.id]);
  assert.deepEqual([...matches.values()], [85, 67, 48, 45]);
  assert.equal(tasteMatches([{ id: "x" }], () => 0).get("x"), 55);
});

test("equal taste scores still step down the row", () => {
  const values = [...tasteMatches([{ id: "a" }, { id: "b" }, { id: "c" }], () => 4).values()];
  assert.deepEqual(values, [85, 80, 75]);
});

test("For you puts AI picks first in rank order, then mentions, then the taste order", () => {
  const rows = orderForYou({
    tasteIds: ["a", "b", "c", "d", "e"],
    picks: [
      { id: "d", rank: 2, confidence: 80, reason: "two" },
      { id: "c", rank: 1, confidence: 91, reason: "one" },
      { id: "e", mention: true, reason: "also" },
    ],
    tasteMatch: new Map([["a", 85], ["b", 70], ["e", 50]]),
  });
  assert.deepEqual(rows.map((row) => row.id), ["c", "d", "e", "a", "b"]);
  assert.deepEqual(rows.map((row) => row.match), [91, 80, 50, 49, 48], "matches only step down the numbered row");
  assert.deepEqual(rows.map((row) => row.ai), [true, true, true, false, false]);
  assert.equal(rows[0].reason, "one");
});

test("For you without AI keeps the taste order and taste matches", () => {
  const rows = orderForYou({ tasteIds: ["b", "a"], picks: null, tasteMatch: new Map([["a", 60]]) });
  assert.deepEqual(rows.map((row) => [row.id, row.match, row.ai]), [["b", null, false], ["a", 60, false]]);
});

test("banner skips finished, dropped and art-less shows", () => {
  const status = { a: "finished", b: "dropped" };
  const rows = rankBanner({ shows, trending, statusOf: (show) => status[show.id] || "", hasArt: (show) => show.id !== "c" });
  const ids = rows.map((row) => row.id);
  assert.equal(rows.length, 6);
  for (const id of ["a", "b", "c"]) assert.equal(ids.includes(id), false);
  assert.equal(ids[0], "d");
});

test("banner lifts AI picks and never-started taste matches over plain popularity", () => {
  const rows = rankBanner({
    shows,
    trending,
    tasteIds: ["m", "n", "o"],
    picks: [{ id: "p", rank: 1, confidence: 92, reason: "Fits your love of slow fantasy." }],
    tasteMatch: new Map([["m", 85]]),
    statusOf: (show) => (show.id === "a" ? "watching" : ""),
  });
  const ids = rows.map((row) => row.id);
  assert.equal(ids[0], "p");
  assert.equal(rows[0].match, 92);
  assert.equal(rows[0].ai, true);
  assert.ok(ids.includes("m"), "a strong taste match makes the cut");
  assert.ok(ids.indexOf("b") < ids.indexOf("a") || !ids.includes("a"), "in-progress shows get no lift for being unstarted");
});

test("banner keeps at least one top-10 trending show", () => {
  const status = Object.fromEntries(trending.slice(0, 10).map((id) => [id, "plan"]));
  const rows = rankBanner({
    shows,
    trending,
    tasteIds: ["k", "l", "m", "n", "o", "p"],
    picks: ["k", "l", "m", "n", "o", "p"].map((id, index) => ({ id, rank: index + 1, confidence: 90 - index })),
    statusOf: (show) => status[show.id] || "",
  });
  assert.equal(rows.length, 6);
  assert.ok(rows.some((row) => row.trend >= 0 && row.trend < 10));
});

test("a banner reroll leaves out the shows it already showed", () => {
  const first = rankBanner({ shows, trending });
  const exclude = new Set(first.map((row) => row.id));
  const next = rankBanner({ shows, trending, exclude });
  assert.equal(next.length, 6);
  assert.ok(next.every((row) => !exclude.has(row.id)));
  assert.ok(next.some((row) => row.trend >= 0 && row.trend < 10), "a top-10 show still keeps a slot when one is left");
  const picks = [{ id: first[0].id, rank: 1, confidence: 95 }, { id: "o", rank: 2, confidence: 70 }];
  const rolled = rankBanner({ shows, trending, picks, exclude });
  assert.equal(rolled.some((row) => row.id === first[0].id), false, "excluded AI picks stay out too");
  assert.equal(rolled.find((row) => row.id === "o")?.ai, true);
});

test("banner without AI blends trending, taste and unstarted shows", () => {
  const rows = rankBanner({ shows, trending, tasteIds: ["j"], picks: null, tasteMatch: new Map([["j", 85]]) });
  assert.ok(rows.every((row) => !row.ai));
  assert.ok(rows.map((row) => row.id).includes("j"));
  assert.equal(rows.find((row) => row.id === "j").match, 85);
});

const many = Array.from({ length: 40 }, (_, n) => ({ id: `s${n}` }));
const manyTrending = many.map((show) => show.id);

test("the paged banner fills three pages of six, mostly AI picks, one blended slide per page", () => {
  const picks = ["s30", "s31", "s32", "s33", "s34"].map((id, index) => ({ id, rank: index + 1, confidence: 90 - index, reason: `why ${id}` }));
  picks.push({ id: "s35", mention: true, reason: "also" });
  const extraPicks = ["s20", "s21", "s22", "s23", "s24", "s25", "s26", "s27", "s28", "s29"].map((id) => ({ id, reason: `row ${id}` }));
  const rows = galleryBanner({ shows: many, trending: manyTrending, picks, extraPicks, count: 18 });
  assert.equal(rows.length, 18);
  assert.deepEqual(rows.slice(0, 5).map((row) => row.id), ["s30", "s31", "s32", "s33", "s34"], "ranked picks lead in rank order");
  assert.equal(rows[6].id, "s35", "mentions follow the ranked picks");
  for (const index of [5, 11, 17]) assert.equal(rows[index].ai, false, `slide ${index + 1} closes its page with a blended pick`);
  assert.equal(rows.filter((row) => row.ai).length, 15);
  assert.ok(rows.some((row) => row.trend >= 0 && row.trend < 10), "a top-10 show keeps a slot");
  assert.equal(new Set(rows.map((row) => row.id)).size, 18);
  assert.equal(rows.find((row) => row.id === "s20").reason, "row s20");
});

test("the paged banner tops up with the blend when AI picks run short, and skips unusable ones", () => {
  const status = { s31: "finished" };
  const picks = [{ id: "s30", rank: 1, confidence: 88 }, { id: "s31", rank: 2, confidence: 80 }];
  const rows = galleryBanner({ shows: many, trending: manyTrending, picks, extraPicks: [{ id: "missing" }, { id: "s30" }], statusOf: (show) => status[show.id] || "", count: 18 });
  assert.equal(rows.length, 18);
  assert.equal(rows[0].id, "s30");
  assert.equal(rows.filter((row) => row.ai).length, 1);
  assert.equal(rows.some((row) => row.id === "s31"), false);
});

test("without AI the paged banner is the plain blend", () => {
  const rows = galleryBanner({ shows: many, trending: manyTrending, extraPicks: [{ id: "s39" }], count: 18 });
  assert.equal(rows.length, 18);
  assert.ok(rows.every((row) => !row.ai));
});
