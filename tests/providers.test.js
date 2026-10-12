import assert from "node:assert/strict";
import test from "node:test";
import { modelDisplayName, pickProviderModel, providerById, remoteTargets } from "../lib/providers.js";
import { applySettingsPatch, defaultSettings, publicSettings, remoteSignature } from "../lib/settings.js";

test("each service picks a chat model from its own list", () => {
  const gemini = ["models/gemini-2.5-pro", "models/gemini-3.8-flash", "models/gemini-3.8-flash-tts", "models/gemini-3.1-flash-image", "models/gemini-embedding-2"];
  assert.equal(pickProviderModel(providerById("gemini"), gemini), "gemini-3.8-flash");
  assert.equal(pickProviderModel(providerById("gemini"), ["models/gemini-3.8-flash"], "gemini-3.8-flash"), null);
  assert.equal(pickProviderModel(providerById("groq"), ["whisper-large-v3", "openai/gpt-oss-safeguard-20b", "meta-llama/llama-prompt-guard-2-86m", "qwen/qwen3.8-27b"]), "qwen/qwen3.8-27b");
  const router = ["openai/gpt-4o", "nvidia/nemotron-3.5-content-safety:free", "thinkingmachines/inkling:free", "cohere/north-mini-code:free", "google/gemma-4-31b-it:free"];
  assert.equal(pickProviderModel(providerById("openrouter"), router), "google/gemma-4-31b-it:free");
});

test("model ids read as names with their numbers", () => {
  assert.equal(modelDisplayName("gpt-4o-mini"), "GPT-4o Mini");
  assert.equal(modelDisplayName("openai/gpt-oss-120b"), "GPT-OSS 120B");
  assert.equal(modelDisplayName("gemini-3.5-flash-lite"), "Gemini 3.5 Flash Lite");
  assert.equal(modelDisplayName("nvidia/nemotron-3-super-120b-a12b:free"), "Nemotron 3 Super 120B");
  assert.equal(modelDisplayName("google/gemma-4-31b-it:free"), "Gemma 4 31B");
  assert.equal(modelDisplayName("qwen/qwen3.8-27b"), "Qwen3.8 27B");
});

test("each model gets settings it accepts, and OpenRouter names backups", () => {
  assert.deepEqual(providerById("groq").tune("openai/gpt-oss-120b"), { reasoning_effort: "low", include_reasoning: false });
  assert.deepEqual(providerById("groq").tune("qwen/qwen3.8-27b"), { reasoning_effort: "none" });
  assert.equal(providerById("gemini").tune("gemini-3.5-flash-lite").reasoning_effort, "low");
  const router = providerById("openrouter").tune("google/gemma-4-31b-it:free");
  assert.equal(router.models[0], "google/gemma-4-31b-it:free");
  assert.equal(router.models.length, 3);
  assert.equal(new Set(router.models).size, 3);
});

test("models picked by an older version are dropped so new defaults apply", () => {
  const old = publicSettings({ apiKeys: { groq: "gsk_x", openrouter: "sk-or" }, models: { groq: "llama-3.3-70b-versatile", openrouter: "apodex/apodex-1.1-mini:free" } });
  assert.equal(old.models.groq, "openai/gpt-oss-120b");
  assert.equal(old.models.openrouter, "nvidia/nemotron-3-super-120b-a12b:free");
});

test("auto puts the last winner first and skips services cooling down", () => {
  const settings = { aiService: "auto", apiKeys: { openai: "sk-a", gemini: "g-b", groq: "gq-c" } };
  const now = 1_000;
  assert.deepEqual(remoteTargets(settings, { now }).map((row) => row.provider.id), ["groq", "gemini", "openai"]);
  assert.deepEqual(remoteTargets(settings, { now, health: { lastWinner: "openai" } }).map((row) => row.provider.id), ["openai", "groq", "gemini"]);
  const health = { gemini: { coolUntil: now + 60_000 }, lastWinner: "gemini" };
  assert.deepEqual(remoteTargets(settings, { now, health }).map((row) => row.provider.id), ["groq", "openai"]);
  const allCooling = { openai: { coolUntil: now + 1 }, gemini: { coolUntil: now + 1 }, groq: { coolUntil: now + 1 } };
  assert.equal(remoteTargets(settings, { now, health: allCooling }).length, 3);
});

test("a chosen service is used alone, and falls back to auto without a key", () => {
  const keys = { gemini: "g-b", groq: "gq-c" };
  assert.deepEqual(remoteTargets({ aiService: "groq", apiKeys: keys }).map((row) => row.provider.id), ["groq"]);
  assert.deepEqual(remoteTargets({ aiService: "openai", apiKeys: keys }).map((row) => row.provider.id), ["groq", "gemini"]);
  assert.deepEqual(remoteTargets({ aiService: "auto", apiKeys: {} }), []);
});

test("an old single OpenAI key moves to the OpenAI slot and keys never reach the view", () => {
  const legacy = publicSettings({ ...defaultSettings(), apiKey: "sk-old", model: "gpt-4.1-mini" });
  assert.equal(legacy.keys.openai, true);
  assert.equal(legacy.modelLabel, "gpt-4.1-mini");
  let settings = applySettingsPatch(defaultSettings(), { providerKey: { id: "gemini", key: " AIza-free " } });
  assert.equal(settings.apiKeys.gemini, "AIza-free");
  assert.equal(publicSettings(settings).modelLabel, "gemini-3.5-flash-lite");
  settings = applySettingsPatch(settings, { providerKey: { id: "groq", key: "gsk_x" } });
  const view = publicSettings(settings);
  assert.equal(view.modelLabel, "Auto");
  assert.deepEqual(view.keys, { openai: false, gemini: true, groq: true, openrouter: false });
  assert.doesNotMatch(JSON.stringify(view), /AIza|gsk_/);
  settings = applySettingsPatch(settings, { providerKey: { id: "gemini", key: "" } });
  assert.equal("gemini" in settings.apiKeys, false);
  assert.throws(() => applySettingsPatch(settings, { providerKey: { id: "evil", key: "x" } }), /Unknown AI service/);
  assert.throws(() => applySettingsPatch(settings, { providerKey: { id: "groq", key: "two words" } }), /doesn't look right/);
  assert.throws(() => applySettingsPatch(settings, { aiService: "evil" }), /Unknown AI service/);
});

test("badge settings default to the glow dot and only accept known choices", () => {
  const badgeView = (value) => {
    const view = publicSettings(value);
    return [view.badgeStyle, view.badgeCorner, view.badgeSize, view.badgeProgress, view.badgeUnwatched, view.badgeMotion];
  };
  assert.deepEqual(badgeView(defaultSettings()), ["glow", "bottom-left", "normal", true, "hover", "animated"]);
  let settings = applySettingsPatch(defaultSettings(), { badgeStyle: "footer", badgeCorner: "top-right", badgeSize: "small", badgeProgress: false, badgeUnwatched: "never", badgeMotion: "static" });
  assert.deepEqual(badgeView(settings), ["footer", "top-right", "small", false, "never", "static"]);
  settings = applySettingsPatch(settings, { badgeStyle: "<script>", badgeCorner: "middle", badgeUnwatched: 1, badgeMotion: "wiggle" });
  assert.equal(settings.badgeMotion, "static");
  assert.equal(publicSettings(defaultSettings()).liteMode, false);
  assert.equal(publicSettings(applySettingsPatch(defaultSettings(), { liteMode: true })).liteMode, true);
  assert.equal(settings.badgeStyle, "footer");
  assert.equal(settings.badgeCorner, "top-right");
  assert.equal(publicSettings({ badgeStyle: "weird" }).badgeStyle, "glow");
});

test("the mini player starts off and only takes a real on or off", () => {
  assert.equal(publicSettings(defaultSettings()).miniPlayer, false);
  assert.equal(publicSettings({}).miniPlayer, false);
  const on = applySettingsPatch(defaultSettings(), { miniPlayer: true });
  assert.equal(publicSettings(on).miniPlayer, true);
  assert.equal(applySettingsPatch(on, { miniPlayer: "yes" }).miniPlayer, true);
  assert.equal(applySettingsPatch(on, { miniPlayer: false }).miniPlayer, false);
});

test("the AI cache changes when the service setup changes", () => {
  const one = remoteSignature({ apiKeys: { gemini: "a" } });
  assert.notEqual(one, remoteSignature({ apiKeys: { gemini: "a", groq: "b" } }));
  assert.equal(one, remoteSignature({ apiKeys: { gemini: "different-key" } }));
  assert.equal(remoteSignature({}), "chrome");
});
