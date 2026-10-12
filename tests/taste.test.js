import assert from "node:assert/strict";
import test from "node:test";
import { allowedByTaste, collectTagSuggestions, filterTagSuggestions, scoreLabels } from "../lib/taste.js";

test("tag suggestions prefer the start of a saved genre and skip tags already chosen", () => {
  const options = collectTagSuggestions({
    anilistCache: {
      a: { kind: "hit", genres: ["Romance"], tags: ["Love Triangle"] },
      b: { kind: "miss" },
    },
    imports: {
      1: { media: { genres: ["Drama"], tags: [{ name: "Tragic" }] } },
    },
  });
  assert.ok(options.includes("Romance"));
  assert.ok(options.includes("Love Triangle"));
  assert.ok(options.includes("Action"));
  assert.equal(filterTagSuggestions("ro", options, [])[0], "Romance");
  assert.equal(filterTagSuggestions("ro", options, ["Romance"]).includes("Romance"), false);
  assert.deepEqual(filterTagSuggestions("lov", options, []), ["Love Triangle"]);
  assert.deepEqual(filterTagSuggestions("act", ["Acting", "Action", "Outdoor Activities"], []), ["Action", "Acting", "Outdoor Activities"]);
});

test("hard avoids drop a matched show and likes outrank dislikes", () => {
  assert.equal(allowedByTaste(["Horror", "Action"], { hardAvoids: ["Horror"] }), false);
  assert.equal(allowedByTaste(["Action"], { hardAvoids: ["Horror"] }), true);
  const weights = { liked: new Map([["romance", 5]]), disliked: new Map([["horror", 5]]) };
  assert.ok(scoreLabels(["Romance"], weights) > scoreLabels(["Horror"], weights));
});
