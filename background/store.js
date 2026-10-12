import { normalizeCatalog } from "../lib/catalog.js";
import { MEDIA_KEY } from "../lib/seasons.js";
import { STORAGE_KEY, normalizeState } from "../lib/state.js";

const ANILIST_URL = "https://graphql.anilist.co";
export const CATALOG_KEY = "crCatalog";

export async function loadState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeState(stored[STORAGE_KEY]);
}

export async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function loadCatalog() {
  const stored = await chrome.storage.local.get(CATALOG_KEY);
  return normalizeCatalog(stored[CATALOG_KEY]);
}

export async function saveCatalog(catalog) {
  await chrome.storage.local.set({ [CATALOG_KEY]: catalog });
}

export async function loadMedia() {
  const stored = await chrome.storage.local.get(MEDIA_KEY);
  const media = stored[MEDIA_KEY];
  return media && typeof media === "object" ? media : {};
}

export async function saveMedia(media) {
  await chrome.storage.local.set({ [MEDIA_KEY]: media });
}

export function delay(ms, signal) {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function anilist(query, variables, token, signal) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(ANILIST_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("Can't reach AniList. You may be offline.");
  }
  const payload = await response.json().catch(() => null);
  const message = String(payload?.errors?.[0]?.message || "");
  if (response.status === 401 || (token && /invalid token|unauthori[sz]ed/i.test(message))) {
    throw new Error("AniList session expired. Connect again.");
  }
  if (response.status === 429) throw new Error("AniList is busy. Try again in a minute.");
  if (!response.ok) throw new Error(message ? `AniList: ${message}` : `AniList returned ${response.status}`);
  if (!payload) throw new Error("AniList sent an unreadable reply.");
  if (payload.errors?.length && !payload.data) {
    throw new Error(message || "AniList request failed");
  }
  return payload;
}
