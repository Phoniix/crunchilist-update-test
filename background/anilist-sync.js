import {
  DELETE_ENTRY_MUTATION,
  LIST_QUERY,
  MEDIA_LIST_QUERY,
  SAVE_ENTRY_MUTATION,
  VIEWER_QUERY,
  anilistAuthUrl,
  anilistTokenBody,
  clearMisses,
  flattenListCollection,
  listAvatar,
  parseCodeRedirect,
  toAnilistStatus,
} from "../lib/anilist.js";
import { applySynced, linkCatalog, mergeAnilistList, pendingSync, setEntryProgress, setEntryStatus } from "../lib/library.js";
import { anilistSession, applySettingsPatch, validateClientId, validateClientSecret } from "../lib/settings.js";
import { catalogPairs } from "./catalog-sync.js";
import { anilist, delay, loadCatalog, loadState, saveState } from "./store.js";

async function saveListEntry(token, input) {
  const variables = { mediaId: input.mediaId, status: input.status };
  if (input.progress != null) variables.progress = input.progress;
  const payload = await anilist(SAVE_ENTRY_MUTATION, variables, token);
  const saved = payload?.data?.SaveMediaListEntry;
  if (!saved?.id) throw new Error("AniList did not save that entry.");
  return saved;
}

async function deleteListEntry(session, entry) {
  let listId = entry.anilistListId || null;
  if (!listId && session.viewerId && entry.anilistId) {
    const payload = await anilist(MEDIA_LIST_QUERY, { mediaId: entry.anilistId, userId: session.viewerId }, session.token);
    listId = payload?.data?.MediaList?.id || null;
  }
  if (!listId) return;
  await anilist(DELETE_ENTRY_MUTATION, { id: listId }, session.token);
}

const RETRY_MS = 2 * 60_000;
let lastSyncError = "";
let lastRetryAt = 0;
let retrying = null;

function stopsQueue(error) {
  return /expired|connect again|busy|reach|401|403|failed to fetch|network/i.test(String(error?.message || error));
}

async function pushPending(library, settings) {
  const session = anilistSession(settings);
  const queue = pendingSync(library);
  if (!session.connected || !queue.length) return { results: [], error: "" };
  const results = [];
  let error = "";
  for (const entry of queue) {
    try {
      let saved = null;
      if (entry.removed) {
        await deleteListEntry(session, entry);
      } else {
        const input = { mediaId: entry.anilistId, status: toAnilistStatus(entry.status) };
        if (entry.progress != null) input.progress = entry.progress;
        saved = await saveListEntry(session.token, input);
      }
      results.push({ key: entry.key, saved, updatedAt: entry.updatedAt });
    } catch (failure) {
      error = String(failure?.message || "AniList did not answer.");
      if (stopsQueue(failure)) break;
    }
  }
  lastSyncError = error;
  return { results, error };
}

const PACE_MS = 2500;
const BUSY_WAIT_MS = 60_000;
const BUSY_TRIES = 3;
const QUICK_LIMIT = 3;
let pacedRuns = 0;
let backgroundSync = null;
let backgroundProgress = { done: 0, total: 0 };

export async function syncKeysPaced(keys, { onStep = () => {}, signal } = {}) {
  let synced = 0;
  let error = "";
  pacedRuns += 1;
  try {
    for (let index = 0; index < keys.length; index += 1) {
      if (signal?.aborted) break;
      const state = await loadState();
      const entry = state.library[keys[index]];
      if (entry?.dirty && entry.anilistId) {
        let result = await pushPending({ [entry.key]: entry }, state.settings);
        for (let tries = 0; /busy/i.test(result.error) && tries < BUSY_TRIES; tries += 1) {
          await delay(BUSY_WAIT_MS, signal).catch(() => {});
          if (signal?.aborted) break;
          result = await pushPending({ [entry.key]: entry }, state.settings);
        }
        if (result.results.length) {
          const fresh = await loadState();
          fresh.library = applySynced(fresh.library, result.results, Date.now());
          await saveState(fresh);
          synced += result.results.length;
        }
        if (result.error) {
          error = result.error;
          if (stopsQueue(result.error)) break;
        } else {
          error = "";
        }
        if (index < keys.length - 1) await delay(PACE_MS, signal).catch(() => {});
      }
      onStep(index + 1);
    }
  } finally {
    pacedRuns -= 1;
  }
  lastSyncError = error;
  return { synced, error };
}

export function syncActivity() {
  if (!backgroundSync || !backgroundProgress.total) return null;
  return {
    id: "sync",
    label: "Syncing changes to AniList",
    progress: backgroundProgress.done / backgroundProgress.total,
  };
}

function startBackgroundSync(keys) {
  if (backgroundSync || pacedRuns) return backgroundSync;
  backgroundProgress = { done: 0, total: keys.length };
  lastSyncError = "";
  backgroundSync = syncKeysPaced(keys, {
    onStep: (done) => {
      backgroundProgress.done = done;
    },
  }).catch(() => ({ synced: 0, error: "" })).finally(() => {
    backgroundSync = null;
    backgroundProgress = { done: 0, total: 0 };
  });
  return backgroundSync;
}

export function pacedMinutes(count) {
  return Math.max(1, Math.ceil((count * PACE_MS) / 60_000));
}

export async function syncPending(state) {
  const { results, error } = await pushPending(state.library, state.settings);
  state.library = applySynced(state.library, results, Date.now());
  return { synced: results.length, waiting: pendingSync(state.library).length, error };
}

const EXPIRED_NOTE = "AniList sign-in expired. Reconnect to sync.";

export function syncStatus(state) {
  const session = anilistSession(state.settings);
  if (!session.connected && !session.expired) return { waiting: 0, error: "" };
  const waiting = pendingSync(state.library).length;
  if (session.expired) return { waiting, error: waiting ? EXPIRED_NOTE : "", sending: false };
  const sending = pacedRuns > 0;
  return { waiting, error: waiting && !sending ? lastSyncError : "", sending };
}

export function retryPendingSync({ force = false } = {}) {
  if (retrying) return retrying;
  if (pacedRuns) return Promise.resolve(force ? { sending: true } : null);
  if (!force && Date.now() - lastRetryAt < RETRY_MS) return Promise.resolve(null);
  lastRetryAt = Date.now();
  retrying = (async () => {
    const state = await loadState();
    const { waiting } = syncStatus(state);
    if (!waiting) return force ? { state, synced: 0, error: "" } : null;
    if (waiting > QUICK_LIMIT && anilistSession(state.settings).connected) {
      startBackgroundSync(pendingSync(state.library).map((entry) => entry.key));
      return force ? { state, synced: 0, error: "", sending: true, waiting } : null;
    }
    const { results, error } = await pushPending(state.library, state.settings);
    if (results.length) {
      const fresh = await loadState();
      fresh.library = applySynced(fresh.library, results, Date.now());
      await saveState(fresh);
      return { state: fresh, synced: results.length, error };
    }
    return { state, synced: 0, error };
  })().finally(() => {
    retrying = null;
  });
  return retrying;
}

function syncNoteFor(state, result) {
  const session = anilistSession(state.settings);
  if (session.expired) return `Saved on this device. ${EXPIRED_NOTE}`;
  if (!session.connected) return "";
  if (result.error) return `Saved on this device. AniList was not updated: ${result.error}`;
  return result.synced ? "Updated your AniList list." : "";
}

async function linkToCatalog(state) {
  state.library = linkCatalog(state.library, catalogPairs(state, await loadCatalog()));
}

export async function setShowStatus(show, status) {
  const state = await loadState();
  state.library = setEntryStatus(state.library, show, status, Date.now());
  const result = await syncPending(state);
  await saveState(state);
  const note = syncNoteFor(state, result);
  return { state, syncNote: note || (show.anilistId ? "" : "Saved on this device.") };
}

// Several library changes saved and synced together, like marking a season finished along with the ones before it.
export async function changeLibrary(change, fallbackNote = "") {
  const state = await loadState();
  state.library = change(state.library, Date.now());
  const result = await syncPending(state);
  await saveState(state);
  return { state, syncNote: syncNoteFor(state, result) || fallbackNote };
}

export async function setShowProgress(show, episode) {
  const state = await loadState();
  state.library = setEntryProgress(state.library, show, episode, Date.now());
  const result = await syncPending(state);
  await saveState(state);
  const note = syncNoteFor(state, result);
  return { state, syncNote: note || `Marked episode ${episode} watched.` };
}

async function pullAccountList(state) {
  const session = anilistSession(state.settings);
  if (!session.connected) throw new Error("Connect AniList in settings first.");
  await syncPending(state);
  const payload = await anilist(LIST_QUERY, { userName: session.viewerName }, session.token);
  const entries = flattenListCollection(payload);
  const now = Date.now();
  state.library = mergeAnilistList(state.library, entries, { now, lastPullAt: state.lastPullAt, source: "anilist" });
  state.lastPullAt = now;
  state.importMeta = { username: session.viewerName, importedAt: now, source: "account", avatar: listAvatar(payload) };
  state.anilistCache = clearMisses(state.anilistCache);
  await linkToCatalog(state);
  return entries.length;
}

let pendingAuth = null;

function considerAuthNavigation(tabId, url, frameId) {
  if (!pendingAuth || pendingAuth.tabId !== tabId) return;
  if (frameId != null && frameId !== 0) return;
  if (!url || !url.startsWith(pendingAuth.redirectUri)) return;
  const current = pendingAuth;
  pendingAuth = null;
  clearTimeout(current.timer);
  chrome.tabs.remove(tabId).catch(() => {});
  current.resolve(url);
}

function watchAuthNavigation(details) {
  considerAuthNavigation(details.tabId, details.url, details.frameId);
}

export function listenForAuth() {
  chrome.webNavigation.onBeforeNavigate.addListener(watchAuthNavigation);
  chrome.webNavigation.onCommitted.addListener(watchAuthNavigation);
  chrome.webNavigation.onErrorOccurred.addListener(watchAuthNavigation);
  chrome.webNavigation.onReferenceFragmentUpdated.addListener(watchAuthNavigation);
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    considerAuthNavigation(tabId, info.url, 0);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (!pendingAuth || pendingAuth.tabId !== tabId) return;
    const current = pendingAuth;
    pendingAuth = null;
    clearTimeout(current.timer);
    current.reject(new Error("The AniList tab was closed before sign-in finished."));
  });
}

async function exchangeAnilistCode({ clientId, clientSecret, redirectUri, code }) {
  const response = await fetch("https://anilist.co/api/v2/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(anilistTokenBody(clientId, clientSecret, redirectUri, code)),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    const codeName = payload?.error || "";
    if (codeName === "invalid_client") {
      throw new Error("AniList rejected the client secret. Copy it again from your AniList app.");
    }
    throw new Error(payload?.message || payload?.hint || `AniList returned ${response.status}`);
  }
  return { token: payload.access_token, expiresIn: Number(payload.expires_in) || 0 };
}

export async function startAnilistAuth({ clientId, clientSecret }) {
  const cleanId = validateClientId(clientId);
  if (!cleanId) throw new Error("AniList client id should be the number from your AniList app.");
  const saved = await loadState();
  const secret = validateClientSecret(clientSecret) || validateClientSecret(saved.settings.anilistClientSecret);
  if (!secret) throw new Error("Paste the client secret from your AniList app. AniList requires it to finish sign-in.");
  if (pendingAuth) {
    const previous = pendingAuth;
    pendingAuth = null;
    clearTimeout(previous.timer);
    chrome.tabs.remove(previous.tabId).catch(() => {});
    previous.reject(new Error("Started another AniList sign-in."));
  }
  const redirectUri = chrome.identity.getRedirectURL();
  const tab = await chrome.tabs.create({ url: "about:blank", active: true });
  const redirected = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pendingAuth || pendingAuth.tabId !== tab.id) return;
      pendingAuth = null;
      chrome.tabs.remove(tab.id).catch(() => {});
      reject(new Error("AniList sign-in timed out. Try Connect again."));
    }, 3 * 60 * 1000);
    pendingAuth = { tabId: tab.id, redirectUri, resolve, reject, timer };
  });
  try {
    await chrome.tabs.update(tab.id, { url: anilistAuthUrl(cleanId, redirectUri) });
  } catch (error) {
    if (pendingAuth?.tabId === tab.id) {
      const current = pendingAuth;
      pendingAuth = null;
      clearTimeout(current.timer);
      chrome.tabs.remove(tab.id).catch(() => {});
      current.reject(error);
    }
  }
  const parsed = parseCodeRedirect(await redirected);
  if (parsed.error) throw new Error(parsed.error);
  const exchanged = await exchangeAnilistCode({
    clientId: cleanId,
    clientSecret: secret,
    redirectUri,
    code: parsed.code,
  });
  const latest = await loadState();
  latest.settings = { ...latest.settings, anilistClientId: cleanId, anilistClientSecret: secret };
  await saveState(latest);
  return connectAnilist({ token: exchanged.token, expiresIn: exchanged.expiresIn, clientId: cleanId });
}

export async function connectAnilist({ token, expiresIn, clientId }) {
  const cleanId = String(clientId || "").trim();
  if (!/^\d{1,20}$/.test(cleanId)) throw new Error("Enter the AniList client id.");
  if (!token) throw new Error("AniList did not return a token.");
  const expiresAt = Date.now() + Math.max(0, Number(expiresIn) || 0) * 1000;
  if (expiresAt <= Date.now()) throw new Error("AniList token expired. Connect again.");
  const viewerPayload = await anilist(VIEWER_QUERY, {}, token);
  const viewer = viewerPayload?.data?.Viewer;
  if (!viewer?.id || !viewer?.name) throw new Error("Could not read the AniList account.");
  const state = await loadState();
  state.settings = {
    ...state.settings,
    anilistClientId: cleanId,
    anilistToken: token,
    anilistExpiresAt: expiresAt,
    anilistViewerId: viewer.id,
    anilistViewerName: viewer.name,
  };
  const imported = await pullAccountList(state);
  await saveState(state);
  return { state, imported, viewerName: viewer.name };
}

export async function disconnectAnilist() {
  const state = await loadState();
  state.settings = {
    ...state.settings,
    anilistToken: "",
    anilistExpiresAt: 0,
    anilistViewerId: null,
    anilistViewerName: "",
  };
  await saveState(state);
  return { state };
}

export async function refreshAnilist() {
  const state = await loadState();
  const imported = await pullAccountList(state);
  await saveState(state);
  return { state, imported };
}

export async function importAnilist(username) {
  const name = String(username || "").trim();
  if (!/^[\w-]{2,50}$/.test(name)) throw new Error("Enter a public AniList username.");
  const state = await loadState();
  if (anilistSession(state.settings).connected) {
    throw new Error("Disconnect AniList to import a public username instead.");
  }
  const payload = await anilist(LIST_QUERY, { userName: name });
  const entries = flattenListCollection(payload);
  const now = Date.now();
  state.settings = applySettingsPatch(state.settings, { anilistUsername: name });
  state.library = mergeAnilistList(state.library, entries, { now, lastPullAt: state.lastPullAt, source: "public" });
  state.lastPullAt = now;
  state.importMeta = { username: name, importedAt: now, source: "public", avatar: listAvatar(payload) };
  state.anilistCache = clearMisses(state.anilistCache);
  await linkToCatalog(state);
  await saveState(state);
  return { state, imported: entries.length };
}
