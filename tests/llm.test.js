import assert from "node:assert/strict";
import test from "node:test";
import { buildChromeMessages, modelShowFacts, pickChatModel, parseRecommendationJson, resolveModelResults } from "../lib/llm.js";

test("the model sees the synopsis sentence that matches the search, even late in a long synopsis", () => {
  const about = `${"Soldiers pilot giant suits against invading aliens while the front line slowly falls back. ".repeat(5)}The squad is stationed in East Germany on the Oder-Neisse line.`;
  const plain = modelShowFacts({ title: "Black Marks", about });
  assert.equal(/Germany/.test(plain.about), false);
  const focused = modelShowFacts({ title: "Black Marks", about, focus: ["germany", "german", "berlin"] });
  assert.match(focused.about, /^Soldiers pilot/);
  assert.match(focused.about, /stationed in East Germany/);
  assert.ok(focused.about.length <= 260);
});

test("picks a small chat model and skips embeddings and dated snapshots", () => {
  const picked = pickChatModel([
    "text-embedding-3-small",
    "whisper-1",
    "gpt-4o-mini-2024-07-18",
    "gpt-4o",
    "gpt-4o-mini",
  ]);
  assert.equal(picked, "gpt-4o-mini");
});

test("skips a model that just failed and uses the next choice", () => {
  const picked = pickChatModel(["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"], "gpt-4o-mini");
  assert.equal(picked, "gpt-4.1-mini");
});

test("uses another undated mini model when the preferred names are absent", () => {
  assert.equal(pickChatModel(["gpt-4.2-mini-2026-01-01", "gpt-4.2-mini"]), "gpt-4.2-mini");
});

test("returns null when the account only has non-chat models", () => {
  assert.equal(pickChatModel(["text-embedding-3-small", "whisper-1"]), null);
});

const searchShows = [
  { id: "sight:G1", title: "Frieren" },
  { id: "sight:G2", title: "Skip and Loafer" },
];

test("search uses the model sentence when chrome returns a number", () => {
  const parsed = resolveModelResults(
    searchShows,
    '{"results":[{"n":2,"reason":"A gentle school romance you have not started."}]}',
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.results[0].id, "sight:G2");
  assert.equal(parsed.results[0].reason, "A gentle school romance you have not started.");
  assert.notEqual(parsed.results[0].reason, "For you");
});

test("search uses the model sentence when chrome returns a title instead of an id", () => {
  const reply = '{"results":[{"title":"Skip and Loafer","reason":"A gentle school romance you have not started."}]}';
  const strict = parseRecommendationJson(reply, new Set(["sight:G2"]));
  assert.equal(strict.ok, false);
  const parsed = resolveModelResults(searchShows, reply);
  assert.equal(parsed.results[0].id, "sight:G2");
  assert.equal(parsed.results[0].reason, "A gentle school romance you have not started.");
});

test("a plain numbered line is enough for a search brief", () => {
  const parsed = resolveModelResults(searchShows, "2 | A gentle school romance you have not started.");
  assert.equal(parsed.results[0].id, "sight:G2");
  assert.equal(parsed.results[0].reason, "A gentle school romance you have not started.");
});

test("a title line and a prose sentence both keep the model brief", () => {
  const line = resolveModelResults(searchShows, "Skip and Loafer: A gentle school romance you have not started.");
  assert.equal(line.results[0].reason, "A gentle school romance you have not started.");
  const prose = resolveModelResults(
    searchShows,
    "Skip and Loafer is a gentle school romance you have not started.",
  );
  assert.equal(prose.results[0].id, "sight:G2");
  assert.match(prose.results[0].reason, /gentle school romance/);
});

test("ranked picks keep a brief and confidence, and mentions stay separate", () => {
  const shows = [
    { id: "sight:G1", title: "Frieren" },
    { id: "sight:G2", title: "Skip and Loafer" },
    { id: "sight:G3", title: "Another" },
  ];
  const parsed = resolveModelResults(shows, JSON.stringify({
    results: [
      { n: 2, rank: 2, brief: "A soft school romance. It is one cour.", confidence: 74 },
      { n: 1, rank: 1, brief: "A long fantasy about an elf. It has 28 episodes.", confidence: 88 },
    ],
    mentions: [
      { n: 1, note: "Already picked." },
      { n: 3, note: "A quieter horror aside." },
    ],
  }));
  assert.equal(parsed.results[0].id, "sight:G1");
  assert.equal(parsed.results[0].rank, 1);
  assert.equal(parsed.results[0].confidence, 88);
  assert.match(parsed.results[0].reason, /28 episodes/);
  assert.equal(parsed.results[1].rank, 2);
  assert.equal(parsed.results[1].confidence, 74);
  assert.equal(parsed.mentions.length, 1);
  assert.equal(parsed.mentions[0].id, "sight:G3");
  assert.equal(parsed.mentions[0].mention, true);
  assert.equal(parsed.mentions[0].rank, null);
  assert.equal(parsed.mentions[0].reason, "A quieter horror aside.");
});

const fiveShows = [
  { id: "sight:A", title: "Frieren" },
  { id: "sight:B", title: "Skip and Loafer" },
  { id: "sight:C", title: "Another" },
  { id: "sight:D", title: "Haikyu" },
  { id: "sight:E", title: "Monster" },
];

function assertRankedBriefs(parsed, label) {
  assert.equal(parsed.ok, true, `${label}: parsed`);
  assert.ok(parsed.results.length >= 1, `${label}: at least one pick`);
  parsed.results.forEach((item, index) => {
    assert.equal(item.rank, index + 1, `${label}: rank ${index + 1}`);
    assert.ok(Number.isInteger(item.confidence), `${label}: confidence is a whole number`);
    assert.ok(item.confidence >= 40 && item.confidence <= 95, `${label}: confidence ${item.confidence} in range`);
    assert.ok(item.reason && item.reason.length > 0, `${label}: brief present`);
    if (index > 0) assert.ok(item.confidence <= parsed.results[index - 1].confidence, `${label}: confidence falls with rank`);
  });
  for (const mention of parsed.mentions || []) {
    assert.equal(mention.rank, null, `${label}: mentions are unranked`);
    assert.equal(mention.confidence, null, `${label}: mentions have no confidence`);
  }
}

test("every pick gets a rank and confidence no matter how the model answers", () => {
  const replies = {
    "complete json": JSON.stringify({
      results: [
        { n: 1, rank: 1, brief: "Fits. It has 28 episodes.", confidence: 88 },
        { n: 2, rank: 2, brief: "Fits less. It is one cour.", confidence: 71 },
      ],
    }),
    "no rank or confidence": JSON.stringify({
      results: [{ n: 3, brief: "A horror pick." }, { n: 1, brief: "A fantasy pick." }, { n: 5, brief: "A thriller pick." }],
    }),
    "old reason field": '{"results":[{"n":2,"reason":"A gentle romance."},{"n":4,"reason":"A team sports show."}]}',
    "duplicate ranks": JSON.stringify({
      results: [
        { n: 1, rank: 1, brief: "One.", confidence: 80 },
        { n: 2, rank: 1, brief: "Two.", confidence: 80 },
        { n: 3, rank: 2, brief: "Three.", confidence: 80 },
      ],
    }),
    "confidence rises with rank": JSON.stringify({
      results: [
        { n: 1, rank: 1, brief: "One.", confidence: 60 },
        { n: 2, rank: 2, brief: "Two.", confidence: 85 },
      ],
    }),
    "fractions, percents, and out of range": JSON.stringify({
      results: [
        { n: 1, rank: 1, brief: "One.", confidence: "0.9" },
        { n: 2, rank: 2, brief: "Two.", confidence: "80%" },
        { n: 3, rank: 3, brief: "Three.", confidence: 140 },
        { n: 4, rank: 4, brief: "Four.", confidence: 5 },
        { n: 5, rank: 9, brief: "Five.", confidence: "high" },
      ],
    }),
    "fenced json with trailing comma": '```json\n{"results":[{"n":4,"rank":1,"brief":"Sports.","confidence":77},]}\n```',
    "numbered lines": "1 | A slow fantasy.\n3 | A creepy school.",
    "title lines": "Monster: A long thriller.\nHaikyu: A volleyball team.",
    "prose": "Skip and Loafer is a gentle romance. Another is a creepy horror.",
    "with mentions": JSON.stringify({
      results: [{ n: 1, rank: 1, brief: "One.", confidence: 90 }],
      mentions: [{ n: 2, note: "Softer." }, { n: 1, note: "Duplicate." }],
    }),
  };
  for (const [label, reply] of Object.entries(replies)) {
    assertRankedBriefs(resolveModelResults(fiveShows, reply), label);
  }
});

test("rank and confidence follow the model when it gives them", () => {
  const parsed = resolveModelResults(fiveShows, JSON.stringify({
    results: [
      { n: 2, rank: 2, brief: "Second.", confidence: 74 },
      { n: 1, rank: 1, brief: "First.", confidence: 88 },
    ],
  }));
  assert.deepEqual(parsed.results.map((item) => [item.id, item.rank, item.confidence, item.confidenceEstimated]), [
    ["sight:A", 1, 88, false],
    ["sight:B", 2, 74, false],
  ]);
  const missing = resolveModelResults(fiveShows, '{"results":[{"n":3,"brief":"x"},{"n":4,"brief":"y"}]}');
  assert.deepEqual(missing.results.map((item) => [item.confidence, item.confidenceEstimated]), [[90, true], [82, true]]);
  const odd = resolveModelResults(fiveShows, JSON.stringify({
    results: [
      { n: 1, rank: 1, brief: "a", confidence: "0.9" },
      { n: 2, rank: 2, brief: "b", confidence: "80%" },
      { n: 3, rank: 3, brief: "c", confidence: 140 },
    ],
  }));
  assert.deepEqual(odd.results.map((item) => item.confidence), [90, 80, 79]);
});

test("a brief about another show moves to the show it describes", () => {
  const sports = [
    { id: "sight:V", title: "2.43: Seiin High School Boys Volleyball Team" },
    { id: "sight:A", title: "Aoashi" },
    { id: "sight:E", title: "Eyeshield 21" },
    { id: "sight:B", title: "BLUE LOCK" },
    { id: "sight:C", title: "Chainsaw Man – The Movie: Reze Arc" },
  ];
  const parsed = resolveModelResults(sports, JSON.stringify({
    results: [
      { n: 1, rank: 1, brief: "Eyeshield 21 is an underdog football story. It runs 145 episodes.", confidence: 90 },
      { n: 2, title: "Aoashi", rank: 2, brief: "Aoashi follows a striker. It began in 2022.", confidence: 85 },
      { n: 3, rank: 3, brief: "Chain Saw Man – The Movie: Reze Arc is a thriller. It came out in 2025.", confidence: 80 },
      { n: 4, title: "BLUE LOCK", rank: 4, brief: "An intense striker academy, unlike Aoashi. BLUE LOCK aired in 2022.", confidence: 75 },
    ],
  }));
  assert.deepEqual(parsed.results.map((item) => item.id), ["sight:E", "sight:A", "sight:C", "sight:B"]);
});

test("the title wins when the number and title disagree", () => {
  const parsed = resolveModelResults(fiveShows, '{"results":[{"n":1,"title":"Monster","rank":1,"brief":"A long thriller. It has 74 episodes.","confidence":80}]}');
  assert.equal(parsed.results[0].id, "sight:E");
});

test("a confidence number written into the brief is removed from the text", () => {
  const parsed = resolveModelResults(fiveShows, '{"results":[{"n":5,"title":"Monster","rank":1,"brief":"A long thriller. It has 74 episodes. Confidence: 90","confidence":90}]}');
  assert.equal(parsed.results[0].reason, "A long thriller. It has 74 episodes.");
  assert.equal(parsed.results[0].confidence, 90);
});

test("evenly stepped confidence is replaced by our own fit score", () => {
  const shows = [
    { id: "sight:A", title: "Frieren", fit: 0.9 },
    { id: "sight:B", title: "Skip and Loafer", fit: 0.4 },
    { id: "sight:C", title: "Another", fit: 0.3 },
  ];
  const patterned = resolveModelResults(shows, JSON.stringify({
    results: [
      { n: 1, rank: 1, brief: "a", confidence: 90 },
      { n: 2, rank: 2, brief: "b", confidence: 85 },
      { n: 3, rank: 3, brief: "c", confidence: 80 },
    ],
  }));
  assert.deepEqual(patterned.results.map((item) => [item.confidence, item.confidenceEstimated]), [[90, true], [65, true], [60, true]]);
  const judged = resolveModelResults(shows, JSON.stringify({
    results: [
      { n: 1, rank: 1, brief: "a", confidence: 88 },
      { n: 2, rank: 2, brief: "b", confidence: 71 },
      { n: 3, rank: 3, brief: "c", confidence: 52 },
    ],
  }));
  assert.deepEqual(judged.results.map((item) => item.confidence), [89, 67, 57]);
  assert.equal(judged.results.some((item) => item.confidenceEstimated), false);
});

test("a model reply that names nothing on the list is not used", () => {
  const parsed = resolveModelResults(searchShows, "I recommend something else entirely.");
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.results, []);
});

test("chrome search asks for rank, confidence, a brief, and mentions", () => {
  const messages = buildChromeMessages({
    taste: { liked: ["Romance"] },
    candidates: [
      { id: "sight:G1", title: "Frieren", status: "unwatched", genres: ["Fantasy"], tags: ["Adventure"] },
      { id: "sight:G2", title: "Skip and Loafer", status: "plan", genres: ["Romance"], tags: ["School"] },
      ...Array.from({ length: 24 }, (_, index) => ({ id: `sight:extra${index}`, title: `Extra ${index}` })),
    ],
    userText: "a short romance I have not seen",
  });
  const user = JSON.parse(messages.user);
  assert.equal(user.request, "a short romance I have not seen");
  assert.equal(user.list.length, 20);
  assert.deepEqual(user.list.slice(0, 2).map((item) => item.n), [1, 2]);
  assert.equal(user.list[1].title, "Skip and Loafer");
  assert.equal(JSON.stringify(user.list).includes("sight:"), false);
  assert.equal(messages.candidates[1].id, "sight:G2");
  assert.match(messages.system, /rank starts at 1/);
  assert.match(messages.system, /confidence/);
  assert.match(messages.system, /mentions/);
  assert.equal(user.list[0].about, undefined);
  const rich = buildChromeMessages({
    taste: {},
    candidates: [{
      id: "sight:G2",
      title: "Skip and Loafer",
      status: "unwatched",
      format: "TV",
      episodes: 12,
      duration: 23,
      year: 2023,
      season: "SPRING",
      source: "MANGA",
      score: 82,
      genres: ["Romance"],
      tags: ["School"],
      about: "A girl starts over at a Tokyo high school.",
      continues: true,
      country: "JP",
    }],
    userText: "a short romance",
  });
  const row = JSON.parse(rich.user).list[0];
  assert.equal(row.about, "A girl starts over at a Tokyo high school.");
  assert.equal(row.episodes, 12);
  assert.equal(row.minutes, 23);
  assert.equal(row.year, 2023);
  assert.equal(row.season, "spring");
  assert.equal(row.source, "manga");
  assert.equal(row.score, 82);
  assert.equal(row.format, "TV");
  assert.equal(row.continues, true);
  assert.equal(row.popularity, undefined);
  assert.equal(row.country, undefined);
  assert.equal(JSON.stringify(row).includes("https://"), false);
});
