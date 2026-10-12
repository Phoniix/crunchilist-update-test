import assert from "node:assert/strict";
import test from "node:test";
import { describeModelStatus } from "../lib/model-status.js";

test("chrome's model reads online, offline, or unknown", () => {
  const ready = describeModelStatus({ chromePresent: true, availability: "available" });
  assert.deepEqual([ready.state, ready.label], ["online", "Online"]);
  const failed = describeModelStatus({ chromePresent: true, availability: "available", chromeFailed: true });
  assert.deepEqual([failed.state, failed.label], ["unknown", "Error"]);
  const fetching = describeModelStatus({ chromePresent: true, availability: "downloading", downloading: true, progress: 0.42 });
  assert.equal(fetching.state, "offline");
  assert.match(fetching.detail, /42%/);
  const stalled = describeModelStatus({ chromePresent: true, availability: "downloading", stalled: true });
  assert.deepEqual([stalled.state, stalled.label], ["unknown", "Error"]);
  assert.match(stalled.detail, /22 GB/);
  assert.equal(describeModelStatus({ chromePresent: true, availability: "downloadable" }).state, "offline");
  assert.equal(describeModelStatus({ chromePresent: true, availability: "unavailable" }).state, "offline");
  assert.equal(describeModelStatus({ chromePresent: false }).state, "unknown");
  assert.equal(describeModelStatus({ chromePresent: true, availabilityError: true }).label, "Error");
  assert.equal(describeModelStatus({ chromePresent: true, availability: "something new" }).state, "unknown");
});

test("an api key reads online only after a request works", () => {
  assert.deepEqual(
    [describeModelStatus({ hasKey: true, modelName: "gpt-4o-mini" }).state, describeModelStatus({ hasKey: true }).label],
    ["unknown", "Unknown"],
  );
  assert.equal(describeModelStatus({ hasKey: true, remoteOk: true }).state, "online");
  const broken = describeModelStatus({ hasKey: true, remoteOk: false, remoteError: "Model request failed (401)" });
  assert.deepEqual([broken.state, broken.label, broken.detail], ["unknown", "Error", "Model request failed (401)"]);
});
