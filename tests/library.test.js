import assert from "node:assert/strict";
import test from "node:test";
import {
  applySynced,
  entryForSeries,
  linkCatalog,
  markSynced,
  mergeAnilistList,
  migrateSeasonState,
  normalizeLibrary,
  pendingSync,
  progressOffer,
  seriesMarks,
  setEntryProgress,
  setEntryStatus,
  showKeyFor,
} from "../lib/library.js";
import { normalizeState } from "../lib/state.js";
import { buildWeights } from "../lib/taste.js";

const frieren = { crSeriesId: "GFRIEREN", anilistId: 154587, title: "Frieren", episodes: 28, labels: ["Fantasy", "Adventure"] };

test("shows are keyed by anilist id, or by crunchyroll id until matched", () => {
  assert.equal(showKeyFor({ anilistId: 5, crSeriesId: "G1" }), "anilist:5");
  assert.equal(showKeyFor({ crSeriesId: "G1" }), "cr:G1");
  assert.equal(showKeyFor({}), null);
});

test("a local status is saved without anilist and waits to sync", () => {
  let library = setEntryStatus({}, { crSeriesId: "G1", title: "Alpha" }, "plan", 10);
  assert.equal(library["cr:G1"].status, "plan");
  assert.equal(library["cr:G1"].dirty, true);
  assert.deepEqual(pendingSync(library), [], "an unmatched show cannot sync yet");
  library = linkCatalog(library, [{ crSeriesId: "G1", anilistId: 7 }]);
  assert.equal(library["cr:G1"], undefined);
  assert.equal(library["anilist:7"].status, "plan");
  assert.equal(library["anilist:7"].crSeriesId, "G1");
  assert.equal(pendingSync(library).length, 1);
});

test("a sync result only clears entries that did not change while it ran", () => {
  let library = setEntryStatus({}, frieren, "in_progress", 10);
  library = setEntryStatus(library, { anilistId: 21, crSeriesId: "G2", title: "Beta" }, "plan", 10);
  const results = pendingSync(library).map((entry) => ({ key: entry.key, saved: { id: 900 }, updatedAt: entry.updatedAt }));
  library = setEntryProgress(library, frieren, 4, 20);
  library = applySynced(library, results, 30);
  assert.equal(library["anilist:154587"].dirty, true, "the newer local edit still needs to sync");
  assert.equal(library["anilist:154587"].progress, 4);
  assert.equal(library["anilist:21"].dirty, false);
  assert.equal(library["anilist:21"].anilistListId, 900);
  assert.deepEqual(pendingSync(library).map((entry) => entry.key), ["anilist:154587"]);
});

test("finishing a show fills progress to the episode count", () => {
  const library = setEntryStatus({}, frieren, "finished", 1);
  assert.equal(library["anilist:154587"].progress, 28);
});

test("marking episodes moves a show to in progress, then finished on the last one", () => {
  let library = setEntryProgress({}, frieren, 3, 1);
  assert.equal(library["anilist:154587"].status, "in_progress");
  assert.equal(library["anilist:154587"].progress, 3);
  library = setEntryProgress(library, frieren, 28, 2);
  assert.equal(library["anilist:154587"].status, "finished");
});

test("removing a synced show leaves a removal to send, then drops it", () => {
  let library = mergeAnilistList({}, [{ anilistId: 9, listId: 3, status: "finished", progress: 12 }], { now: 1 });
  library = setEntryStatus(library, { anilistId: 9 }, null, 2);
  assert.equal(library["anilist:9"].removed, true);
  assert.equal(pendingSync(library).length, 1);
  library = markSynced(library, "anilist:9", null, 3);
  assert.equal(library["anilist:9"], undefined);
  assert.equal(setEntryStatus({}, { crSeriesId: "G2" }, null, 1)["cr:G2"], undefined);
});

test("a pull keeps local edits made after the last pull and drops shows removed on anilist", () => {
  let library = mergeAnilistList({}, [
    { anilistId: 1, listId: 11, status: "plan", progress: 0 },
    { anilistId: 2, listId: 12, status: "in_progress", progress: 4 },
  ], { now: 100 });
  library = setEntryStatus(library, { anilistId: 1 }, "dropped", 150);
  library = mergeAnilistList(library, [{ anilistId: 1, listId: 11, status: "plan", progress: 0 }], { now: 200, lastPullAt: 100 });
  assert.equal(library["anilist:1"].status, "dropped", "the newer local edit wins");
  assert.equal(library["anilist:2"], undefined, "removed on anilist");
  library = setEntryStatus(library, { crSeriesId: "G3" }, "plan", 210);
  library = mergeAnilistList(library, [], { now: 300, lastPullAt: 200 });
  assert.equal(library["cr:G3"].status, "plan", "local-only shows survive a pull");
});

test("importing another public user replaces the previous public list", () => {
  let library = mergeAnilistList({}, [{ anilistId: 1, status: "finished" }], { now: 1, source: "public" });
  library = mergeAnilistList(library, [{ anilistId: 2, status: "plan" }], { now: 2, source: "public" });
  assert.deepEqual(Object.keys(library), ["anilist:2"]);
  assert.equal(pendingSync(library).length, 0);
});

test("card marks combine a show with its linked sequels", () => {
  let library = mergeAnilistList({}, [
    { anilistId: 1, status: "finished" },
    { anilistId: 2, status: "plan" },
    { anilistId: 3, status: "finished" },
  ], { now: 1 });
  library = linkCatalog(library, [
    { crSeriesId: "SHOW", anilistId: 1, relatedIds: [2] },
    { crSeriesId: "DONE", anilistId: 3 },
  ]);
  const marks = seriesMarks(library);
  assert.deepEqual(marks.SHOW, { mark: "in_progress", hide: false });
  assert.deepEqual(marks.DONE, { mark: "finished", hide: true });
  assert.equal(entryForSeries(library, "SHOW").anilistId, 1);
});

test("card marks carry episode progress for the badge", () => {
  let library = mergeAnilistList({}, [{ anilistId: 7, status: "in_progress", progress: 7, media: { episodes: 24 } }], { now: 1 });
  library = linkCatalog(library, [{ crSeriesId: "JJK", anilistId: 7 }]);
  assert.deepEqual(seriesMarks(library).JJK, { mark: "in_progress", hide: false, progress: 7, episodes: 24 });
});

test("the episode offer only appears past saved progress", () => {
  const entry = { key: "anilist:1", status: "in_progress", progress: 3 };
  assert.deepEqual(progressOffer(entry, 4), { key: "anilist:1", from: 3, to: 4, last: false, watching: true });
  assert.equal(progressOffer(entry, 3), null);
  assert.equal(progressOffer({ ...entry, status: "finished" }, 9), null);
  assert.deepEqual(progressOffer(null, 1), { key: null, from: 0, to: 1, last: false, watching: false });
});

test("the episode offer knows the last episode of the anilist entry", () => {
  const planned = { key: "anilist:1", status: "plan", progress: null, episodes: 12 };
  assert.equal(progressOffer(planned, 11).last, false);
  assert.equal(progressOffer(planned, 12).last, true);
  assert.equal(progressOffer(planned, 12).watching, false);
  assert.equal(progressOffer({ key: "anilist:2", status: "in_progress", progress: 10 }, 13, 13).last, true);
});

test("version 1 season records migrate into the library once", () => {
  const legacy = {
    importMeta: { username: "me", importedAt: 50, source: "account" },
    imports: { 9: { anilistId: 9, listId: 3, status: "finished", progress: 12, media: { id: 9, title: { english: "Nine" }, genres: ["Drama"] } } },
    seasons: {
      "G1|s1": { seriesId: "G1", seasonSlug: "s1", seriesTitle: "One", status: "dropped", statusSource: "user", updatedAt: 60 },
      "G9|s1": { seriesId: "G9", seasonSlug: "s1", anilistId: 9, status: "finished", statusSource: "anilist" },
    },
  };
  const state = normalizeState(legacy, 100);
  assert.equal(state.version, 2);
  assert.equal(state.library["cr:G1"].status, "dropped");
  assert.equal(state.library["cr:G1"].dirty, true);
  assert.equal(state.library["anilist:9"].crSeriesId, "G9");
  assert.equal(state.library["anilist:9"].dirty, false);
  assert.equal(state.lastPullAt, 50);
  assert.equal("seasons" in state, false);
  assert.deepEqual(normalizeState(state, 200).library, normalizeLibrary(state.library));
  assert.deepEqual(migrateSeasonState({}, 1), {});
});

test("taste weights come from library history and scores", () => {
  const library = mergeAnilistList({}, [
    { anilistId: 1, status: "finished", score: 90, media: { genres: ["Drama"] } },
    { anilistId: 2, status: "dropped", media: { genres: ["Ecchi"] } },
  ], { now: 1 });
  const weights = buildWeights({ library, taste: {} });
  assert.equal(weights.liked.get("drama"), 2);
  assert.equal(weights.disliked.get("ecchi"), 1);
});
