import { safeAvatar } from "./anilist.js";
import { migrateSeasonState, normalizeLibrary } from "./library.js";
import { normalizeNotices } from "./notices.js";
import { defaultSettings, withKeys } from "./settings.js";
import { defaultTaste, sanitizeTaste } from "./taste.js";

export const STORAGE_KEY = "crCornerState";
export const STATE_VERSION = 2;

export function defaultState() {
  return {
    version: STATE_VERSION,
    library: {},
    anilistCache: {},
    importMeta: { username: "", importedAt: 0, source: "", avatar: "" },
    historyImport: { at: 0, shows: 0 },
    lastPullAt: 0,
    taste: defaultTaste(),
    settings: defaultSettings(),
    lastObservation: null,
    notices: [],
  };
}

export function cloneState(state) {
  return structuredClone(state);
}

export function normalizeState(raw, now = Date.now()) {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  const legacy = !(Number(raw.version) >= STATE_VERSION);
  return {
    version: STATE_VERSION,
    library: legacy ? migrateSeasonState(raw, now) : normalizeLibrary(raw.library),
    anilistCache: raw.anilistCache && typeof raw.anilistCache === "object" ? raw.anilistCache : {},
    importMeta: {
      username: raw.importMeta?.username || "",
      importedAt: raw.importMeta?.importedAt || 0,
      source: raw.importMeta?.source === "account" || raw.importMeta?.source === "public" ? raw.importMeta.source : "",
      avatar: safeAvatar(raw.importMeta?.avatar),
    },
    historyImport: {
      at: Number(raw.historyImport?.at) || 0,
      shows: Number(raw.historyImport?.shows) || 0,
    },
    lastPullAt: legacy ? raw.importMeta?.importedAt || 0 : Number(raw.lastPullAt) || 0,
    taste: sanitizeTaste(raw.taste),
    settings: withKeys({ ...defaultSettings(), ...(raw.settings || {}) }),
    lastObservation: raw.lastObservation || null,
    notices: normalizeNotices(raw.notices),
  };
}
