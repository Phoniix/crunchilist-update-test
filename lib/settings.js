import { cleanKeys, MODELS_VERSION, PROVIDER_IDS, providerById, savedProviders } from "./providers.js";

export function defaultSettings() {
  return {
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    aiService: "auto",
    apiKeys: {},
    models: {},
    anilistUsername: "",
    anilistClientId: "",
    anilistClientSecret: "",
    anilistToken: "",
    anilistExpiresAt: 0,
    anilistViewerId: null,
    anilistViewerName: "",
    panelOpen: false,
    panelCorner: "bottom-right",
    hideWatched: false,
    useAi: true,
    favorNamed: true,
    episodeDialogs: true,
    askModelDownload: true,
    muteNotifications: false,
    badgeStyle: "glow",
    badgeCorner: "bottom-left",
    badgeSize: "normal",
    badgeProgress: true,
    badgeUnwatched: "hover",
    badgeMotion: "animated",
    liteMode: false,
    openIn: "tab",
    tabManage: true,
    tabAuto: false,
    backButton: true,
    miniPlayer: false,
    showTips: true,
  };
}

const SWITCHES = ["panelOpen", "hideWatched", "useAi", "favorNamed", "episodeDialogs", "askModelDownload", "muteNotifications", "badgeProgress", "liteMode", "tabManage", "tabAuto", "backButton", "miniPlayer", "showTips"];
const OPEN_IN = new Set(["tab", "window", "new"]);

const CORNERS = new Set(["bottom-right", "bottom-left", "top-right", "top-left"]);
const BADGE_CHOICES = {
  badgeStyle: new Set(["glow", "tinted", "footer", "corner"]),
  badgeCorner: CORNERS,
  badgeSize: new Set(["small", "normal"]),
  badgeUnwatched: new Set(["hover", "always", "never"]),
  badgeMotion: new Set(["animated", "static"]),
};

function badgeChoice(settings, key) {
  return BADGE_CHOICES[key].has(settings?.[key]) ? settings[key] : defaultSettings()[key];
}

export function validateBaseUrl(input) {
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path === "/" ? "" : path}`;
}

export function validateClientId(input) {
  const clientId = String(input || "").trim();
  if (!/^\d{1,20}$/.test(clientId)) return null;
  return clientId;
}

export function validateClientSecret(input) {
  const secret = String(input || "").trim();
  if (secret.length < 8 || secret.length > 200 || /\s/.test(secret)) return null;
  return secret;
}

export function anilistSession(settings, now = Date.now()) {
  const token = settings?.anilistToken || "";
  const expiresAt = Number(settings?.anilistExpiresAt) || 0;
  const connected = Boolean(token) && expiresAt > now;
  return {
    connected,
    expired: Boolean(token) && !connected,
    token: connected ? token : "",
    expiresAt,
    viewerId: settings?.anilistViewerId || null,
    viewerName: settings?.anilistViewerName || "",
    clientId: settings?.anilistClientId || "",
  };
}

export function validateModel(input) {
  const model = String(input || "").trim();
  if (!model || model.length > 80) return null;
  if (!/^[A-Za-z0-9_.:/-]+$/.test(model)) return null;
  return model;
}

export function withKeys(settings) {
  const next = { ...settings, apiKeys: cleanKeys(settings?.apiKeys), models: { ...(settings?.models || {}) } };
  if (next.apiKey) {
    if (!next.apiKeys.openai) next.apiKeys.openai = String(next.apiKey).trim();
    if (!next.models.openai && next.model) next.models.openai = next.model;
    next.apiKey = "";
  }
  if (next.aiService !== "auto" && !providerById(next.aiService)) next.aiService = "auto";
  if (next.modelsVersion !== MODELS_VERSION) {
    next.models = next.models.openai ? { openai: next.models.openai } : {};
    next.modelsVersion = MODELS_VERSION;
  }
  return next;
}

export function hasRemote(settings) {
  return savedProviders(withKeys(settings || {})).length > 0;
}

export function remoteSignature(raw) {
  const settings = withKeys(raw || {});
  const saved = savedProviders(settings);
  if (!saved.length) return "chrome";
  return [settings.aiService, ...saved.map((provider) => `${provider.id}:${settings.models?.[provider.id] || provider.model}`)].join("|");
}

function modelLabelFor(settings) {
  const saved = savedProviders(settings);
  if (!saved.length) return "Chrome";
  const chosen = settings.aiService !== "auto" ? providerById(settings.aiService) : saved.length === 1 ? saved[0] : null;
  if (!chosen) return "Auto";
  return settings.models?.[chosen.id] || chosen.model;
}

export function publicSettings(raw, now = Date.now()) {
  const settings = withKeys(raw || {});
  const session = anilistSession(settings, now);
  const keys = Object.fromEntries(PROVIDER_IDS.map((id) => [id, Boolean(settings.apiKeys[id])]));
  return {
    hasKey: Object.values(keys).some(Boolean),
    keys,
    aiService: settings.aiService || "auto",
    models: Object.fromEntries(PROVIDER_IDS.map((id) => [id, settings.models?.[id] || providerById(id).model])),
    modelLabel: modelLabelFor(settings),
    anilistUsername: settings?.anilistUsername || "",
    anilistConnected: session.connected,
    anilistExpired: session.expired,
    anilistViewerName: session.viewerName,
    anilistClientId: session.clientId,
    hasAnilistSecret: Boolean(settings?.anilistClientSecret),
    panelOpen: Boolean(settings?.panelOpen),
    panelCorner: CORNERS.has(settings?.panelCorner) ? settings.panelCorner : "bottom-right",
    hideWatched: Boolean(settings?.hideWatched),
    useAi: settings?.useAi !== false,
    favorNamed: settings?.favorNamed !== false,
    episodeDialogs: settings?.episodeDialogs !== false,
    askModelDownload: settings?.askModelDownload !== false,
    muteNotifications: Boolean(settings?.muteNotifications),
    badgeStyle: badgeChoice(settings, "badgeStyle"),
    badgeCorner: badgeChoice(settings, "badgeCorner"),
    badgeSize: badgeChoice(settings, "badgeSize"),
    badgeProgress: settings?.badgeProgress !== false,
    badgeUnwatched: badgeChoice(settings, "badgeUnwatched"),
    badgeMotion: badgeChoice(settings, "badgeMotion"),
    liteMode: Boolean(settings?.liteMode),
    openIn: OPEN_IN.has(settings?.openIn) ? settings.openIn : "tab",
    tabManage: settings?.tabManage !== false,
    tabAuto: Boolean(settings?.tabAuto),
    backButton: settings?.backButton !== false,
    miniPlayer: Boolean(settings?.miniPlayer),
    showTips: settings?.showTips !== false,
  };
}

export function applySettingsPatch(settings, patch) {
  const next = withKeys({ ...defaultSettings(), ...settings });
  if (typeof patch.apiKey === "string") patch = { ...patch, providerKey: { id: "openai", key: patch.apiKey } };
  if (patch.providerKey) {
    const provider = providerById(patch.providerKey.id);
    if (!provider) throw new Error("Unknown AI service.");
    const key = String(patch.providerKey.key || "").trim();
    if (key && (key.length > 400 || /\s/.test(key))) throw new Error("That key doesn't look right. Paste it again without spaces.");
    next.apiKeys = { ...next.apiKeys };
    if (key) next.apiKeys[provider.id] = key;
    else delete next.apiKeys[provider.id];
  }
  if (patch.clearKeys === true) next.apiKeys = {};
  if (patch.aiService != null) {
    if (patch.aiService !== "auto" && !providerById(patch.aiService)) throw new Error("Unknown AI service.");
    next.aiService = patch.aiService;
  }
  if (patch.providerModel) {
    const provider = providerById(patch.providerModel.id);
    const model = validateModel(patch.providerModel.model);
    if (!provider || !model) throw new Error("Model name looks invalid.");
    next.models = { ...next.models, [provider.id]: model };
  }
  if (patch.baseUrl != null) {
    const baseUrl = validateBaseUrl(patch.baseUrl);
    if (!baseUrl) throw new Error("API base URL must be https, or http on localhost.");
    next.baseUrl = baseUrl;
  }
  if (patch.model != null) {
    const model = validateModel(patch.model);
    if (!model) throw new Error("Model name looks invalid.");
    next.model = model;
    next.models = { ...next.models, openai: model };
  }
  if (typeof patch.anilistUsername === "string") next.anilistUsername = patch.anilistUsername.trim();
  if (patch.anilistClientId != null) {
    const clientId = validateClientId(patch.anilistClientId);
    if (!clientId) throw new Error("AniList client id should be the number from your AniList app.");
    next.anilistClientId = clientId;
  }
  if (CORNERS.has(patch.panelCorner)) next.panelCorner = patch.panelCorner;
  if (OPEN_IN.has(patch.openIn)) next.openIn = patch.openIn;
  for (const [key, allowed] of Object.entries(BADGE_CHOICES)) if (allowed.has(patch[key])) next[key] = patch[key];
  for (const key of SWITCHES) if (typeof patch[key] === "boolean") next[key] = patch[key];
  return next;
}
