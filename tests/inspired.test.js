import assert from "node:assert/strict";
import test from "node:test";
import { cleanSearches, inspiredRequest, interleave, recentlyWatched, rememberSearch } from "../lib/inspired.js";

test("remembering a search puts it first, drops repeats ignoring case and caps the list", () => {
  let list = [];
  for (const query of ["cozy", "big fights", "  Cozy  ", "mecha in germany"]) list = rememberSearch(list, query, 3);
  assert.deepEqual(list, ["mecha in germany", "Cozy", "big fights"]);
  assert.deepEqual(rememberSearch(list, "   ", 3), list);
  assert.equal(rememberSearch([], "x".repeat(200))[0].length, 80);
});

test("stored searches are tidied before use", () => {
  assert.deepEqual(cleanSearches(["a  b", "", null, "A B", "c", "d", "e"], 3), ["a b", "c", "d"]);
  assert.deepEqual(cleanSearches("not a list"), []);
});

test("candidates take turns across searches and never repeat", () => {
  const lists = [[{ id: 1 }, { id: 2 }, { id: 3 }], [{ id: 2 }, { id: 4 }], [{ id: 5 }]];
  assert.deepEqual(interleave(lists, 10).map((item) => item.id), [1, 2, 5, 4, 3]);
  assert.deepEqual(interleave(lists, 2).map((item) => item.id), [1, 2]);
  assert.deepEqual(interleave([], 5), []);
});

test("history uses watching and finished shows, newest first", () => {
  const entries = [
    { title: "Old", status: "finished", updatedAt: 1 },
    { title: "Planned", status: "plan", updatedAt: 9 },
    { title: "Now", status: "in_progress", updatedAt: 5 },
    { title: "Dropped", status: "dropped", updatedAt: 8 },
    { status: "finished", updatedAt: 7 },
  ];
  assert.deepEqual(recentlyWatched(entries), ["Now", "Old"]);
});

test("the request names the searches and the history", () => {
  const ask = inspiredRequest(["cozy", "like frieren"], ["Frieren"]);
  assert.match(ask, /"cozy", "like frieren"/);
  assert.match(ask, /watched or am watching: Frieren\./);
  assert.doesNotMatch(inspiredRequest(["cozy"], []), /watched or am watching/);
});
