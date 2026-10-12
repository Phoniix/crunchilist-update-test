import assert from "node:assert/strict";
import test from "node:test";
import { translatedTrack } from "../lib/captions.js";

test("trailers with an English track are left to YouTube's own English pick", () => {
  assert.equal(translatedTrack([{ languageCode: "ja" }, { languageCode: "en" }]), null);
  assert.equal(translatedTrack([{ languageCode: "en-US", kind: "" }]), null);
  assert.equal(translatedTrack([{ languageCode: "EN" }]), null);
});

test("a hand-made track in another language is translated to English", () => {
  assert.deepEqual(translatedTrack([{ languageCode: "ja", kind: "asr" }, { languageCode: "ja", kind: "" }]), { languageCode: "ja", translationLanguage: { languageCode: "en" } });
  assert.deepEqual(translatedTrack([{ languageCode: "es" }]), { languageCode: "es", translationLanguage: { languageCode: "en" } });
});

test("auto-generated tracks alone, or no tracks, give nothing", () => {
  assert.equal(translatedTrack([{ languageCode: "ja", kind: "asr" }]), null);
  assert.equal(translatedTrack([]), null);
  assert.equal(translatedTrack(undefined), null);
  assert.equal(translatedTrack([{ kind: "" }, null]), null);
});
