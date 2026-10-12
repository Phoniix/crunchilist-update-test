import assert from "node:assert/strict";
import test from "node:test";
import { mainVideo } from "../content/player-bar.js";

const video = (name, width, height) => ({ name, getBoundingClientRect: () => ({ width, height }) });

test("Always on top floats the episode, not a thumbnail or a hidden ad slot", () => {
  const thumb = video("thumb", 200, 112);
  const hidden = video("ad", 0, 0);
  const episode = video("episode", 1280, 720);
  const preview = video("preview", 480, 270);
  assert.equal(mainVideo([thumb, hidden, preview, episode]).name, "episode");
  assert.equal(mainVideo([thumb, hidden]), null);
  assert.equal(mainVideo([]), null);
});
