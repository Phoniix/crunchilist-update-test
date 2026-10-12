import assert from "node:assert/strict";
import test from "node:test";
import { actionForKey, formatTime, loadResume, nextEpisode, resumeAt, savePosition, sourceKind, stepSpeed, storeResume, youtubeId } from "./player-core.js";

test("times read as m:ss, or h:mm:ss past an hour", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(3725), "1:02:05");
  assert.equal(formatTime(NaN), "0:00");
  assert.equal(formatTime(-4), "0:00");
});

test("YouTube links of every shape give the video id", () => {
  assert.equal(youtubeId("https://www.youtube.com/watch?v=abcdefghijk&t=10"), "abcdefghijk");
  assert.equal(youtubeId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(youtubeId("https://www.youtube-nocookie.com/embed/abcdefghijk"), "abcdefghijk");
  assert.equal(youtubeId("https://m.youtube.com/shorts/abcdefghijk"), "abcdefghijk");
  assert.equal(youtubeId("https://evil.example/watch?v=abcdefghijk"), "");
  assert.equal(youtubeId("not a url"), "");
});

test("sources are YouTube, local files or plain video links, nothing else", () => {
  assert.equal(sourceKind("https://youtu.be/abcdefghijk"), "youtube");
  assert.equal(sourceKind("blob:chrome-extension://x/1234"), "file");
  assert.equal(sourceKind("https://example.com/video.mp4"), "direct");
  assert.equal(sourceKind("javascript:alert(1)"), "");
  assert.equal(sourceKind(""), "");
});

test("keys map to player actions and leave browser shortcuts alone", () => {
  assert.equal(actionForKey({ key: " " }), "toggle");
  assert.equal(actionForKey({ key: "K" }), "toggle");
  assert.equal(actionForKey({ key: "ArrowRight" }), "forward5");
  assert.equal(actionForKey({ key: "7" }), "seek7");
  assert.equal(actionForKey({ key: "f", ctrlKey: true }), "");
  assert.equal(actionForKey({ key: "q" }), "");
});

test("speed steps stop at the ends", () => {
  assert.equal(stepSpeed(1, 1), 1.25);
  assert.equal(stepSpeed(2, 1), 2);
  assert.equal(stepSpeed(0.5, -1), 0.5);
  assert.equal(stepSpeed(1.1, -1), 0.75);
});

test("resume skips the opening seconds and the credits", () => {
  assert.equal(resumeAt(5, 1400), 0);
  assert.equal(resumeAt(600, 1400), 600);
  assert.equal(resumeAt(1350, 1400), 0);
  assert.equal(resumeAt(600, NaN), 600);
});

test("saved positions keep the hundred most recent and survive a bad store", () => {
  let store = {};
  for (let n = 0; n < 105; n += 1) store = savePosition(store, `ep${n}`, n * 10, 1000 + n);
  assert.equal(Object.keys(store).length, 100);
  assert.equal(store.ep0, undefined);
  assert.equal(store.ep104.at, 1040);
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  storeResume(storage, store);
  assert.equal(loadResume(storage).ep104.at, 1040);
  memory.set("cl-lab-resume", "{broken");
  assert.deepEqual(loadResume(storage), {});
});

test("next episode follows the list and ends at the last one", () => {
  const list = [{ id: "a" }, { id: "b" }];
  assert.equal(nextEpisode(list, "a").id, "b");
  assert.equal(nextEpisode(list, "b"), null);
  assert.equal(nextEpisode(list, "zz"), null);
});
