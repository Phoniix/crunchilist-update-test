export const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    free: false,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    hint: "Paid. About a tenth of a cent per AI pick.",
    match: /^gpt-/i,
    skip: /embed|whisper|tts|dall-e|moderation|realtime|audio|transcribe|image|vision|instruct|davinci|babbage|curie|search|sora|\bada\b/i,
    prefer: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-5-mini", "gpt-4.1", "gpt-4o", "gpt-5"],
    maxTokens: 900,
    autoRank: 2,
    tune: () => ({}),
  },
  {
    id: "gemini",
    label: "Google Gemini",
    free: true,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.5-flash-lite",
    keyUrl: "https://aistudio.google.com/apikey",
    hint: "Free tier with daily limits.",
    match: /^gemini-([\d.]+-)?flash/i,
    skip: /preview|exp|tts|image|live|embedding|audio|transcribe|robotics|computer|native/i,
    prefer: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash"],
    maxTokens: 4096,
    autoRank: 1,
    tune: () => ({ reasoning_effort: "low" }),
  },
  {
    id: "groq",
    label: "Groq",
    free: true,
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    keyUrl: "https://console.groq.com/keys",
    hint: "Free tier. Very fast.",
    match: /gpt-oss|qwen|llama|kimi|gemma|mistral|deepseek/i,
    skip: /guard|safeguard|whisper|tts|orpheus|vision|prompt|playai|compound|allam/i,
    prefer: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
    maxTokens: 2000,
    autoRank: 0,
    tune: (model) => {
      if (/gpt-oss/i.test(model)) return { reasoning_effort: "low", include_reasoning: false };
      if (/qwen/i.test(model)) return { reasoning_effort: "none" };
      return {};
    },
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    free: true,
    baseUrl: "https://openrouter.ai/api/v1",
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    keyUrl: "https://openrouter.ai/keys",
    hint: "Free models with daily limits.",
    match: /:free$/i,
    skip: /safety|guard|code|coder|omni|vision|lfm|laguna|inkling|nano|-r1/i,
    prefer: ["nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3-ultra-550b-a55b:free"],
    maxTokens: 2000,
    autoRank: 3,
    tune(model) {
      const backups = this.prefer.filter((name) => name !== model).slice(0, 2);
      return { reasoning: { enabled: false }, models: [model, ...backups] };
    },
  },
];

export const MODELS_VERSION = 2;

export const PROVIDER_IDS = PROVIDERS.map((provider) => provider.id);

export function providerById(id) {
  return PROVIDERS.find((provider) => provider.id === id) || null;
}

export function modelDisplayName(id) {
  const base = String(id || "").split("/").pop().replace(/:.*$/, "");
  const words = base.split("-").filter((word) => word && !/^a\d+b$/i.test(word) && !/^(it|instruct)$/i.test(word)).map((word) => {
    if (/^\d+(\.\d+)?b$/i.test(word) || /^(gpt|oss)$/i.test(word)) return word.toUpperCase();
    return /^\d/.test(word) ? word : word[0].toUpperCase() + word.slice(1);
  });
  if (words[0] === "GPT" && words.length > 1) words.splice(0, 2, `GPT-${words[1]}`);
  return words.join(" ") || "AI";
}

export function backupModel(provider, current, isUsed) {
  return (provider?.prefer || []).find((name) => name !== current && !isUsed(name)) || null;
}

export function pickProviderModel(provider, ids, avoid = "") {
  if (!provider) return null;
  const names = [...new Set((ids || []).map((id) => String(id || "").trim().replace(/^models\//, "")).filter(Boolean))];
  const usable = names.filter((id) => id !== avoid && provider.match.test(id) && !provider.skip.test(id));
  for (const name of provider.prefer) {
    if (usable.includes(name)) return name;
  }
  const undated = usable.filter((id) => !/\d{4}-\d{2}-\d{2}/.test(id));
  return undated.find((id) => /mini|flash|instant|versatile/i.test(id)) || undated[0] || usable[0] || null;
}

export function cleanKeys(raw) {
  const keys = {};
  for (const id of PROVIDER_IDS) {
    const value = typeof raw?.[id] === "string" ? raw[id].trim() : "";
    if (value && value.length <= 400 && !/\s/.test(value)) keys[id] = value;
  }
  return keys;
}

export function savedProviders(settings) {
  const keys = cleanKeys(settings?.apiKeys);
  return PROVIDERS.filter((provider) => keys[provider.id]);
}

export function remoteTargets(settings, { health = {}, now = Date.now() } = {}) {
  const keys = cleanKeys(settings?.apiKeys);
  const service = settings?.aiService || "auto";
  const models = settings?.models || {};
  const target = (provider) => ({ provider, key: keys[provider.id], model: models[provider.id] || provider.model });
  const chosen = service !== "auto" ? providerById(service) : null;
  if (chosen && keys[chosen.id]) return [target(chosen)];
  const saved = PROVIDERS.filter((provider) => keys[provider.id]);
  const ready = saved.filter((provider) => !(health[provider.id]?.coolUntil > now));
  const pool = ready.length ? ready : saved;
  const winner = health.lastWinner;
  return [...pool].sort((a, b) => Number(b.id === winner) - Number(a.id === winner) || a.autoRank - b.autoRank).map(target);
}
