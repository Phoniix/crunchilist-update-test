import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTitle, pickMatch, tagsFromConfidentMatch, titlesOf } from "../lib/title-match.js";

function media(names, id, extra = {}) {
  const [english, romaji, native, ...synonyms] = names;
  return {
    id,
    title: { english: english || null, romaji: romaji || null, native: native || null },
    synonyms,
    tags: extra.tags || [],
    ...extra,
  };
}

test("normalizes case, punctuation, and season suffixes", () => {
  assert.equal(normalizeTitle("Dr. Stone!"), normalizeTitle("dr stone"));
  assert.equal(normalizeTitle("Attack on Titan Season 2"), "attack on titan");
  assert.equal(normalizeTitle("Attack on Titan 2nd Season"), "attack on titan");
  assert.equal(normalizeTitle("Demo Cour 1"), "demo");
});

test("matches english, romaji, native, and synonyms", () => {
  const show = media(["Demon Slayer", "Kimetsu no Yaiba", "鬼滅の刃", "KnY"], 10);
  assert.equal(pickMatch("Demon Slayer", [show]).media.id, 10);
  assert.equal(pickMatch("Kimetsu no Yaiba", [show]).media.id, 10);
  assert.equal(pickMatch("鬼滅の刃", [show]).media.id, 10);
  assert.equal(pickMatch("KnY", [show]).confidence, "high");
  assert.ok(titlesOf(show).includes("鬼滅の刃"));
});

test("punctuation-only differences are confident and partial titles are not", () => {
  const stone = media(["Dr. Stone"], 3);
  assert.equal(pickMatch("Dr Stone", [stone]).confidence, "high");
  const shippuden = media(["Naruto Shippuden"], 8);
  const naruto = media(["Naruto"], 7);
  assert.equal(pickMatch("Naruto", [naruto, shippuden]).media.id, 7);
  assert.equal(pickMatch("Boruto", [naruto]).confidence, "none");
});

test("several equal hits stay unmatched unless a season number breaks the tie", () => {
  const first = media(["Attack on Titan"], 1);
  const second = media(["Attack on Titan Season 2"], 2);
  const tied = pickMatch("Same Show", [media(["Same Show"], 4), media(["Same Show"], 5)]);
  assert.equal(tied.confidence, "none");
  assert.equal(tied.reason, "ambiguous");
  assert.equal(tagsFromConfidentMatch(tied).length, 0);

  const season2 = pickMatch("Attack on Titan Season 2", [first, second]);
  assert.equal(season2.confidence, "high");
  assert.equal(season2.media.id, 2);
  assert.equal(pickMatch("Attack on Titan", [first, second]).media.id, 1);
});

test("an ordinal season title does not block the exact first season", () => {
  const first = media(["BOCCHI THE ROCK!", "Bocchi the Rock!"], 130003);
  const second = media(["Bocchi the Rock! 2nd Season"], 186712);
  assert.equal(pickMatch("BOCCHI THE ROCK!", [first, second]).media.id, 130003);
  assert.equal(pickMatch("Bocchi the Rock! 2nd Season", [first, second]).media.id, 186712);
});

test("a special that borrows the name as a synonym loses to the real title", () => {
  const show = media(["Horimiya", "Horimiya"], 124080, { format: "TV", popularity: 547557 });
  const ova = media([null, "Hori-san to Miyamura-kun", null, "Horimiya"], 14753, { format: "OVA", popularity: 43740 });
  assert.equal(pickMatch("Horimiya", [show, ova]).media.id, 124080);
  const nisekoi = media(["Nisekoi", "Nisekoi"], 18897, { format: "TV", popularity: 270182 });
  const sequel = media(["Nisekoi:", "Nisekoi:"], 20876, { format: "TV", popularity: 166896 });
  assert.equal(pickMatch("Nisekoi", [nisekoi, sequel]).media.id, 18897);
  assert.equal(pickMatch("Same Show", [media(["Same Show"], 4, { popularity: 100 }), media(["Same Show"], 5, { popularity: 90 })]).confidence, "none");
});

test("dub labels, curly quotes, years, and movie wording still match", () => {
  assert.equal(pickMatch("Free! Starting Days (English Dub)", [media(["Free! Starting Days"], 1)]).media.id, 1);
  assert.equal(pickMatch("Knight’s & Magic", [media(["Knight's & Magic"], 2)]).media.id, 2);
  const old = media(["Fruits Basket"], 3, { startDate: { year: 2001 } });
  const remake = media(["Fruits Basket"], 4, { startDate: { year: 2019 } });
  assert.equal(pickMatch("Fruits Basket (2001)", [old, remake]).media.id, 3);
  assert.equal(pickMatch("Fruits Basket (2001)", [remake]).confidence, "none");
  assert.equal(pickMatch("Laid-Back Camp Movie", [media(["Laid-Back Camp The Movie"], 5, { format: "MOVIE" })], { kind: "movie" }).media.id, 5);
});

test("a short name links to the clearly most popular subtitled series only", () => {
  const first = media(["Code Geass: Lelouch of the Rebellion"], 1575, { format: "TV", popularity: 700000 });
  const second = media(["Code Geass: Lelouch of the Rebellion R2"], 2904, { format: "TV", popularity: 300000 });
  assert.equal(pickMatch("Code Geass", [first, second]).media.id, 1575);
  const close = media(["Magi: The Kingdom of Magic"], 3, { format: "TV", popularity: 600000 });
  assert.equal(pickMatch("Magi", [media(["Magi: The Labyrinth of Magic"], 2, { format: "TV", popularity: 700000 }), close]).confidence, "none");
});

test("low-confidence matches do not contribute tags", () => {
  const noisy = media(["Other"], 9, { tags: [{ name: "Mecha" }] });
  const match = pickMatch("Missing", [noisy]);
  assert.deepEqual(tagsFromConfidentMatch(match), []);
});
