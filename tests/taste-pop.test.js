import assert from "node:assert/strict";
import test from "node:test";
import { nextGenreField, placeLabel, tasteFieldOf } from "../app/prism-taste.js";

const base = { liked: ["Fantasy", "Isekai"], disliked: ["Gore"], dropped: ["Idol"], hardAvoids: ["Ecchi"], subDub: "sub" };

test("finds which taste list a label is in, ignoring case", () => {
  assert.equal(tasteFieldOf(base, "fantasy"), "liked");
  assert.equal(tasteFieldOf(base, "GORE"), "disliked");
  assert.equal(tasteFieldOf(base, "Idol"), "dropped");
  assert.equal(tasteFieldOf(base, "Ecchi"), "hardAvoids");
  assert.equal(tasteFieldOf(base, "Sports"), "");
});

test("placing a label moves it to one list and keeps everything else", () => {
  const moved = placeLabel(base, "fantasy", "disliked");
  assert.deepEqual(moved.liked, ["Isekai"]);
  assert.deepEqual(moved.disliked, ["Gore", "fantasy"]);
  assert.deepEqual(moved.hardAvoids, ["Ecchi"]);
  assert.equal(moved.subDub, "sub");
  const cleared = placeLabel(base, "Ecchi", "");
  assert.deepEqual(cleared.hardAvoids, []);
  assert.equal(tasteFieldOf(cleared, "Ecchi"), "");
  const added = placeLabel(base, "Time Travel", "liked");
  assert.deepEqual(added.liked, ["Fantasy", "Isekai", "Time Travel"]);
});

test("placing never duplicates a label across lists", () => {
  const twice = placeLabel(placeLabel(base, "Gore", "liked"), "gore", "liked");
  assert.deepEqual(twice.liked.filter((item) => item.toLowerCase() === "gore"), ["gore"]);
  assert.deepEqual(twice.disliked, []);
});

test("genre chips cycle none, like, dislike, none, and clear a dropped or avoided genre", () => {
  assert.equal(nextGenreField(""), "liked");
  assert.equal(nextGenreField("liked"), "disliked");
  assert.equal(nextGenreField("disliked"), "");
  assert.equal(nextGenreField("dropped"), "");
  assert.equal(nextGenreField("hardAvoids"), "");
});

test("placing tidies a malformed taste instead of passing it through", () => {
  const fixed = placeLabel({ subDub: "loud" }, "Mecha", "liked");
  assert.deepEqual(fixed.liked, ["Mecha"]);
  assert.equal(fixed.subDub, "any");
});
