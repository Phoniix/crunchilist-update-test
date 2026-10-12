import assert from "node:assert/strict";
import test from "node:test";
import { addNotice, describeNotice, liveNotices, normalizeNotices, removeNotices } from "../lib/notices.js";
import { normalizeState } from "../lib/state.js";

const show = { crSeriesId: "SHOW", anilistId: 7, title: "Show", cover: "https://img/x.jpg", episodes: 12 };

test("a newer question about the same show replaces the older one", () => {
  let notices = addNotice([], { kind: "ask", show, episode: 3, from: 2 }, 1);
  notices = addNotice(notices, { kind: "done", show: { ...show, crSeriesId: "OTHER" }, episode: 5, from: 4 }, 2);
  notices = addNotice(notices, { kind: "ask", show, episode: 4, from: 2 }, 3);
  assert.deepEqual(notices.map((row) => [row.kind, row.show.crSeriesId, row.episode]), [["ask", "SHOW", 4], ["done", "OTHER", 5]]);
  assert.deepEqual(removeNotices(notices, [notices[0].id]).map((row) => row.show.crSeriesId), ["OTHER"]);
});

test("questions disappear once the list already covers that episode", () => {
  const notices = addNotice([], { kind: "ask", show, episode: 4, from: 2 }, 1);
  assert.equal(liveNotices(notices, {}).length, 1);
  assert.equal(liveNotices(notices, { "anilist:7": { key: "anilist:7", anilistId: 7, crSeriesId: "SHOW", status: "in_progress", progress: 4 } }).length, 0);
  assert.equal(liveNotices(notices, { "anilist:7": { key: "anilist:7", anilistId: 7, crSeriesId: "SHOW", status: "finished", progress: 12 } }).length, 0);
});

test("notices explain themselves and survive a reload", () => {
  const ask = addNotice([], { kind: "ask", show, episode: 12, from: 11, last: true }, 1)[0];
  assert.equal(describeNotice(ask).action, "Mark completed");
  assert.match(describeNotice({ ...ask, kind: "done", last: false, episode: 5 }).message, /episode 5 watched/);
  assert.equal(normalizeState({ version: 2, notices: [ask, { kind: "bogus" }] }).notices.length, 1);
  assert.deepEqual(normalizeNotices("nope"), []);
});
