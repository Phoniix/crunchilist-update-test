import { buildChatBody, buildChromeMessages, CHROME_PICK_SCHEMA, LIGHT_MODEL_CANDIDATES, MODEL_CANDIDATES, messageText, resolveModelResults } from "../lib/llm.js";
import { describeModelStatus } from "../lib/model-status.js";
import { backupModel, modelDisplayName, pickProviderModel, providerById, remoteTargets, savedProviders } from "../lib/providers.js";
import { applySettingsPatch, hasRemote, withKeys } from "../lib/settings.js";
import { loadState, saveState } from "./store.js";

function originPattern(baseUrl) {
  return `${new URL(baseUrl).origin}/*`;
}

async function originAllowed(baseUrl) {
  try {
    return await chrome.permissions.contains({ origins: [originPattern(baseUrl)] });
  } catch {
    return false;
  }
}

function apiUrl(provider, path) {
  return `${provider.baseUrl.replace(/\/$/, "")}${path}`;
}

const AUTO_TRY_MS = 15_000;
const SINGLE_TRY_MS = 30_000;
const COOL_RATE_MS = 5 * 60_000;
const COOL_KEY_MS = 30 * 60_000;
const COOL_SLOW_MS = 2 * 60_000;

class RemoteError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

const remoteHealth = { lastWinner: "", last: null };

async function postChat({ provider, key }, body, timeoutMs) {
  if (!(await originAllowed(provider.baseUrl))) throw new RemoteError("blocked", `Allow ${new URL(provider.baseUrl).origin} in extension settings.`);
  try {
    return await fetch(apiUrl(provider, "/chat/completions"), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new RemoteError("slow", `${provider.label} took too long to answer.`);
    throw new RemoteError("offline", `Can't reach ${provider.label}. You may be offline.`);
  }
}

async function readModelError(response) {
  let raw = "";
  let payload = {};
  try {
    raw = await response.text();
    payload = JSON.parse(raw);
  } catch {
    payload = {};
  }
  if (Array.isArray(payload)) payload = payload[0] || {};
  const code = String(payload?.error?.code || payload?.error?.status || "");
  const message = String(payload?.error?.message || "");
  const missing = response.status === 404 || code === "model_not_found"
    || /does not exist|model_not_found|invalid model|not found for api version|no longer available|only available|not available|decommissioned|deprecated/i.test(message);
  const badArgument = response.status === 400 && !missing && /invalid argument|not supported|unsupported|unknown (field|parameter)|unrecognized|thinking level/i.test(message);
  const wait = Number(message.match(/try again in ([\d.]+)\s*s/i)?.[1])
    || Number(raw.match(/"retryDelay"\s*:\s*"([\d.]+)s"/)?.[1])
    || Number(response.headers?.get?.("retry-after")) || 0;
  const daily = /per day|daily|\bRPD\b/i.test(message) || /PerDay/.test(raw);
  return { missing, badArgument, status: response.status, message, wait, daily };
}

function errorFromResponse(provider, info) {
  const keyProblem = info.status === 401 || /api key|invalid_api_key|unauthori[sz]ed|authentication/i.test(info.message);
  if (keyProblem && !info.missing) return new RemoteError("key", `${provider.label} rejected your key.`);
  if (info.status === 429 || /quota|billing|insufficient|rate limit|resource.?exhausted/i.test(info.message)) {
    const error = new RemoteError("rate", info.daily ? `${provider.label} used up today's free requests.` : `${provider.label} is busy or rate limited.`);
    error.wait = info.daily ? 0 : info.wait;
    error.daily = info.daily;
    return error;
  }
  return new RemoteError("failed", info.message ? `${provider.label}: ${info.message.slice(0, 140)}` : `${provider.label} could not answer.`);
}

async function resolveModel(provider, key, avoid = "") {
  let response;
  try {
    response = await fetch(apiUrl(provider, "/models"), {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }
  if (response.status === 401 || response.status === 403) throw new Error(`${provider.label} rejected that key.`);
  if (!response.ok) return null;
  try {
    const payload = await response.json();
    return pickProviderModel(provider, (payload.data || payload.models || []).map((item) => item?.id || item?.name), avoid);
  } catch {
    return null;
  }
}

const USED_UP_MS = 6 * 60 * 60_000;

async function askOne(state, target, body, timeoutMs) {
  const { provider } = target;
  const usedUp = remoteHealth.usedUp || (remoteHealth.usedUp = {});
  const isUsed = (name) => usedUp[`${provider.id}:${name}`] > Date.now();
  const model = isUsed(target.model) ? backupModel(provider, target.model, isUsed) || target.model : target.model;
  try {
    return await askModel(state, { ...target, model }, body, timeoutMs);
  } catch (error) {
    if (error?.kind !== "rate" || !error.daily) throw error;
    usedUp[`${provider.id}:${model}`] = Date.now() + USED_UP_MS;
    const backup = backupModel(provider, model, isUsed);
    if (!backup) throw error;
    return askModel(state, { ...target, model: backup }, body, timeoutMs);
  }
}

async function askModel(state, target, body, timeoutMs) {
  const { provider } = target;
  let model = target.model;
  const plain = new Set(remoteHealth.plainModels || []);
  const request = (name) => ({
    ...body,
    ...(plain.has(`${provider.id}:${name}`) ? {} : provider.tune?.(name) || {}),
    model: name,
    max_tokens: provider.maxTokens,
  });
  let response = await postChat(target, request(model), timeoutMs);
  let info = response.ok ? null : await readModelError(response);
  if (info?.badArgument && !plain.has(`${provider.id}:${model}`)) {
    plain.add(`${provider.id}:${model}`);
    remoteHealth.plainModels = [...plain];
    response = await postChat(target, request(model), timeoutMs);
    info = response.ok ? null : await readModelError(response);
  }
  if (info) {
    if (!info.missing) throw errorFromResponse(provider, info);
    const picked = await resolveModel(provider, target.key, model);
    if (!picked || picked === model) throw errorFromResponse(provider, info);
    model = picked;
    state.settings = applySettingsPatch(state.settings, { providerModel: { id: provider.id, model } });
    await saveState(state);
    response = await postChat(target, request(model), timeoutMs);
    if (!response.ok) throw errorFromResponse(provider, await readModelError(response));
  }
  const payload = await response.json();
  const text = messageText(payload);
  if (!String(text || "").trim()) {
    const cut = payload?.choices?.[0]?.finish_reason === "length";
    throw new RemoteError("failed", cut ? `${provider.label} ran out of room before answering.` : `${provider.label} sent an empty answer.`);
  }
  return { payload, model };
}

function coolDown(provider, error, now = Date.now()) {
  let span = { rate: COOL_RATE_MS, key: COOL_KEY_MS, slow: COOL_SLOW_MS }[error?.kind] || 0;
  if (error?.kind === "rate" && error.wait > 0) span = Math.min(COOL_RATE_MS, Math.max(5_000, error.wait * 1000));
  remoteHealth[provider.id] = { coolUntil: span ? now + span : 0, error: error?.message || "" };
}

async function askRemote(state, body, { candidates, parse = (text) => resolveModelResults(candidates, text) } = {}) {
  const targets = remoteTargets(state.settings, { health: remoteHealth });
  if (!targets.length) throw new RemoteError("none", "No AI service key is saved.");
  const auto = targets.length > 1;
  const tried = [];
  for (const [index, target] of targets.entries()) {
    const started = Date.now();
    const timeoutMs = auto && index < targets.length - 1 ? AUTO_TRY_MS : SINGLE_TRY_MS;
    try {
      const { payload, model } = await askOne(state, target, body, timeoutMs);
      const parsed = parse(messageText(payload));
      if (!parsed.ok) throw new RemoteError("failed", `${target.provider.label}'s answer could not be read.`);
      remoteHealth.lastWinner = target.provider.id;
      remoteHealth[target.provider.id] = { coolUntil: 0, error: "" };
      remoteHealth.last = { ok: true, label: target.provider.label, model, ms: Date.now() - started, skipped: tried.map((row) => row.label) };
      return { parsed, provider: target.provider, model, skipped: tried };
    } catch (error) {
      coolDown(target.provider, error);
      tried.push({ label: target.provider.label, kind: error?.kind || "failed", message: error?.message || "" });
    }
  }
  remoteHealth.last = { ok: false, error: tried.map((row) => row.message).join(" ") };
  const error = new RemoteError(tried.at(-1)?.kind || "failed", tried.length > 1 ? `Every AI service failed: ${tried.map((row) => row.message).join(" ")}` : tried[0]?.message || "The assistant could not answer.");
  throw error;
}

const CHROME_MODEL = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

function languageModel() {
  return globalThis.LanguageModel || null;
}

async function chromeModelStatus() {
  const model = languageModel();
  if (!model?.availability) return "unavailable";
  try {
    return await model.availability(CHROME_MODEL);
  } catch {
    return "unavailable";
  }
}

let chromeSession = null;
let chromeSessionKey = "";
let chromeModelDownload = null;
let modelDownloadRatio = 0;
let chromeDownloadAbort = null;
let modelDownloadStartedAt = 0;
let modelDownloadMovedAt = 0;
let modelStalledAt = 0;
let modelStallTimer = 0;
const MODEL_STALL_KEY = "crModelStall";
const MODEL_STALL_MS = 60_000;
const MODEL_STALL_RETRY_MS = 30 * 60_000;
const MODEL_PRELOAD_RETRY_MS = 24 * 60 * 60_000;
const MODEL_STALLED_NOTE = "Chrome's model isn't downloading. Chrome needs about 22 GB of free disk space and a supported device; chrome://on-device-internals shows why.";
const MODEL_UNAVAILABLE_NOTE = "Chrome's model isn't available on this device.";
const MODEL_SLOW_NOTE = "Chrome's AI took too long on this PC, so it was stopped. An API key in AI preferences runs AI off your PC instead.";
const MODEL_DOWNLOADING_NOTE = "Chrome is downloading its model. Ask again when that finishes.";

function destroyChromeSession() {
  const session = chromeSession;
  chromeSession = null;
  chromeSessionKey = "";
  try {
    session?.destroy?.();
  } catch {
    // The previous session was already closed.
  }
}

function startChromeModelDownload() {
  const model = languageModel();
  if (!model?.create || chromeModelDownload || chromeSession) return;
  chromeDownloadAbort?.abort();
  const controller = new AbortController();
  chromeDownloadAbort = controller;
  modelDownloadStartedAt = Date.now();
  modelDownloadMovedAt = 0;
  clearInterval(modelStallTimer);
  modelStallTimer = setInterval(() => {
    if (!chromeModelDownload) clearInterval(modelStallTimer);
    else checkModelStall();
  }, 15_000);
  chromeModelDownload = model.create({
    ...CHROME_MODEL,
    signal: controller.signal,
    monitor(download) {
      download.addEventListener("downloadprogress", (event) => {
        const ratio = Number(event.loaded);
        if (!Number.isFinite(ratio)) return;
        if (ratio > modelDownloadRatio) modelDownloadMovedAt = Date.now();
        modelDownloadRatio = Math.max(modelDownloadRatio, Math.min(0.99, ratio));
      });
    },
  }).then((session) => {
    if (controller.signal.aborted) {
      session?.destroy?.();
      return false;
    }
    destroyChromeSession();
    chromeSession = session;
    modelStalledAt = 0;
    chrome.storage.local.remove(MODEL_STALL_KEY).catch(() => {});
    return true;
  }).catch(() => false).finally(() => {
    if (chromeDownloadAbort !== controller) return;
    chromeDownloadAbort = null;
    chromeModelDownload = null;
    modelDownloadRatio = 0;
    modelDownloadStartedAt = 0;
    modelDownloadMovedAt = 0;
  });
}

function checkModelStall() {
  if (!chromeModelDownload) return false;
  const since = modelDownloadMovedAt || modelDownloadStartedAt;
  if (Date.now() - since < MODEL_STALL_MS) return false;
  modelStalledAt = Date.now();
  chrome.storage.local.set({ [MODEL_STALL_KEY]: modelStalledAt }).catch(() => {});
  clearInterval(modelStallTimer);
  chromeDownloadAbort?.abort();
  chromeDownloadAbort = null;
  chromeModelDownload = null;
  modelDownloadRatio = 0;
  modelDownloadStartedAt = 0;
  modelDownloadMovedAt = 0;
  return true;
}

async function modelRecentlyStalled(span = MODEL_STALL_RETRY_MS) {
  if (!modelStalledAt) {
    try {
      modelStalledAt = Number((await chrome.storage.local.get(MODEL_STALL_KEY))[MODEL_STALL_KEY]) || 0;
    } catch {
      modelStalledAt = 0;
    }
  }
  return modelStalledAt > 0 && Date.now() - modelStalledAt < span;
}

async function preloadChromeModel(state) {
  if (hasRemote(state.settings) || state.settings.useAi === false) return "";
  const status = await chromeModelStatus();
  if (status !== "downloadable" && status !== "downloading") return status;
  if (chromeModelDownload || await modelRecentlyStalled(MODEL_PRELOAD_RETRY_MS)) return status;
  startChromeModelDownload();
  return status;
}

function modelDownloadNote() {
  return chromeModelIsDownloading() ? " Chrome's model is downloading." : "";
}

const CHROME_IDLE_MS = 60_000;
let chromeQueue = Promise.resolve();
let chromeIdleTimer = 0;

function askChrome(system, user, schema = CHROME_PICK_SCHEMA) {
  const run = chromeQueue.then(() => askChromeNow(system, user, schema));
  chromeQueue = run.catch(() => {});
  return run;
}

function releaseWhenIdle() {
  clearTimeout(chromeIdleTimer);
  chromeIdleTimer = setTimeout(() => {
    if (!chromeModelDownload) destroyChromeSession();
  }, CHROME_IDLE_MS);
}

async function askChromeNow(system, user, schema) {
  clearTimeout(chromeIdleTimer);
  const model = languageModel();
  if (!model?.create) throw new Error("Chrome model unavailable");
  if (!chromeSession || chromeSessionKey !== system) {
    destroyChromeSession();
    chromeDownloadAbort?.abort();
    let sampling = {};
    try {
      const params = await model.params();
      const topK = Number(params?.defaultTopK);
      const temperature = Math.min(0.2, Number(params?.maxTemperature));
      if (topK > 0 && Number.isFinite(temperature)) sampling = { temperature, topK };
    } catch {
      sampling = {};
    }
    chromeSession = await model.create({
      ...CHROME_MODEL,
      ...sampling,
      initialPrompts: [{ role: "system", content: system }],
    });
    chromeSessionKey = system;
  }
  const input = String(user || "");
  const copies = [];
  const freshSession = async () => {
    try {
      const copy = typeof chromeSession.clone === "function" ? await chromeSession.clone() : null;
      if (copy) copies.push(copy);
      return copy || chromeSession;
    } catch {
      return chromeSession;
    }
  };
  try {
    try {
      const constrained = await promptWithin(await freshSession(), input, { responseConstraint: schema });
      if (constrained.trim()) {
        chromeLastFailed = false;
        return constrained;
      }
    } catch (error) {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") throw error;
      // Chrome rejected the schema before answering. Ask once more in plain text.
    }
    const plain = await promptWithin(await freshSession(), input);
    chromeLastFailed = !plain.trim();
    return plain;
  } catch (error) {
    chromeLastFailed = true;
    if (!copies.length) destroyChromeSession();
    throw error;
  } finally {
    for (const copy of copies) {
      try {
        copy.destroy();
      } catch {
        // The copy was already closed.
      }
    }
    if (!copies.length) destroyChromeSession();
    releaseWhenIdle();
  }
}

const CHROME_PROMPT_MS = 30000;

async function promptWithin(session, input, options = {}) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), CHROME_PROMPT_MS);
  try {
    return String(await session.prompt(input, { ...options, signal: stop.signal }) || "");
  } finally {
    clearTimeout(timer);
  }
}

let chromeLastFailed = false;

function remoteName(settings) {
  const last = remoteHealth.last;
  if (last?.ok) return `${last.label} (${last.model})`;
  const saved = savedProviders(settings);
  if (settings.aiService === "auto" && saved.length > 1) return `Auto (${saved.map((provider) => provider.label).join(", ")})`;
  const provider = providerById(settings.aiService) || saved[0];
  return provider ? `${provider.label} (${settings.models?.[provider.id] || provider.model})` : "";
}

async function modelStatus() {
  const state = await loadState();
  const settings = withKeys(state.settings);
  const hasKey = hasRemote(settings);
  let availability = "";
  let availabilityError = false;
  const model = languageModel();
  if (!hasKey && model?.availability) {
    try {
      availability = await model.availability(CHROME_MODEL);
    } catch {
      availabilityError = true;
    }
  }
  return describeModelStatus({
    hasKey,
    modelName: remoteName(settings),
    remoteOk: remoteHealth.last ? remoteHealth.last.ok : null,
    remoteError: remoteHealth.last?.error || "",
    skipped: remoteHealth.last?.skipped || [],
    chromePresent: Boolean(model?.availability),
    availability,
    availabilityError,
    downloading: chromeModelIsDownloading(),
    progress: modelDownloadRatio,
    stalled: await modelRecentlyStalled(),
    chromeFailed: chromeLastFailed,
  });
}

function chromeModelIsDownloading() {
  checkModelStall();
  return Boolean(chromeModelDownload);
}

async function answerWithChrome(system, user, candidates, { schema = CHROME_PICK_SCHEMA, parse = (text) => resolveModelResults(candidates, text) } = {}) {
  const status = await chromeModelStatus();
  if (status === "available" || (chromeSession && !chromeModelDownload)) {
    try {
      const parsed = parse(await askChrome(system, user, schema));
      if (!parsed.ok) return { ok: false, failed: true, note: "Chrome's model gave an answer that could not be read." };
      return { ok: true, parsed };
    } catch (error) {
      const slow = error?.name === "AbortError" || error?.name === "TimeoutError";
      return { ok: false, failed: true, note: slow ? MODEL_SLOW_NOTE : "" };
    }
  }
  if (status === "downloadable" || status === "downloading") {
    if (chromeModelIsDownloading()) return { ok: false, downloading: true };
    if (await modelRecentlyStalled()) return { ok: false, failed: true, note: MODEL_STALLED_NOTE };
    startChromeModelDownload();
    if (chromeModelDownload) return { ok: false, downloading: true };
  }
  return { ok: false, failed: true, note: status === "unavailable" ? MODEL_UNAVAILABLE_NOTE : "" };
}

async function clearModelStall() {
  modelStalledAt = 0;
  await chrome.storage.local.remove(MODEL_STALL_KEY).catch(() => {});
}

function modelProgress() {
  return {
    modelDownloading: chromeModelIsDownloading(),
    modelProgress: modelDownloadRatio,
    modelStalled: !chromeModelDownload && modelStalledAt > 0 && Date.now() - modelStalledAt < MODEL_STALL_RETRY_MS,
    modelNote: MODEL_STALLED_NOTE,
  };
}

async function pickWithModel(state, { candidates, request, chip = null, light = false }) {
  state.settings = withKeys(state.settings);
  if (!hasRemote(state.settings)) {
    try {
      const prompt = buildChromeMessages({ taste: state.taste, candidates, userText: request, chip, limit: light ? LIGHT_MODEL_CANDIDATES : MODEL_CANDIDATES });
      const answer = await answerWithChrome(prompt.system, prompt.user, prompt.candidates);
      if (answer.downloading) return { ok: false, downloading: true, progress: modelDownloadRatio, note: MODEL_DOWNLOADING_NOTE };
      if (!answer.ok) return { ok: false, note: answer.note || "Chrome's model could not be used." };
      return { ok: true, parsed: answer.parsed, by: "Gemini Nano" };
    } catch {
      return { ok: false, note: "Chrome's model could not answer." };
    }
  }
  try {
    const body = buildChatBody({ model: "", taste: state.taste, candidates, userText: request, chip });
    const answer = await askRemote(state, body, { candidates });
    return { ok: true, parsed: answer.parsed, service: answer.provider.label, by: modelDisplayName(answer.model) };
  } catch (error) {
    return { ok: false, note: error?.message || "The assistant could not answer." };
  }
}

async function askJson(state, { system, user, schema, parse, temperature = 0.6 }) {
  state.settings = withKeys(state.settings);
  if (!hasRemote(state.settings)) {
    try {
      const answer = await answerWithChrome(system, user, [], { schema, parse });
      if (answer.downloading) return { ok: false, downloading: true, note: MODEL_DOWNLOADING_NOTE };
      if (!answer.ok) return { ok: false, note: answer.note || "Chrome's model could not be used." };
      return { ok: true, parsed: answer.parsed, by: "Gemini Nano" };
    } catch {
      return { ok: false, note: "Chrome's model could not answer." };
    }
  }
  try {
    const body = { model: "", temperature, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
    const answer = await askRemote(state, body, { parse });
    return { ok: true, parsed: answer.parsed, service: answer.provider.label, by: modelDisplayName(answer.model) };
  } catch (error) {
    return { ok: false, note: error?.message || "The assistant could not answer." };
  }
}

export {
  askJson,
  clearModelStall,
  modelDownloadNote,
  modelProgress,
  modelStatus,
  originAllowed,
  pickWithModel,
  preloadChromeModel,
  resolveModel,
};
