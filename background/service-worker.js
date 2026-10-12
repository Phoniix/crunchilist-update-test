import { ENABLED_KEY, isEnabled } from "../lib/enabled.js";
import { currentActivity, watchActivity } from "./activity.js";
import { appData, setSeasonState } from "./app-data.js";
import { entryForSeries } from "../lib/library.js";
import { providerById } from "../lib/providers.js";
import { applySettingsPatch } from "../lib/settings.js";
import { sanitizeTaste } from "../lib/taste.js";
import {
  connectAnilist,
  disconnectAnilist,
  importAnilist,
  listenForAuth,
  pacedMinutes,
  refreshAnilist,
  retryPendingSync,
  setShowProgress,
  setShowStatus,
  startAnilistAuth,
  syncStatus,
} from "./anilist-sync.js";
import { catalogProgress, catalogSession, runCatalogProtocol } from "./catalog-sync.js";
import { episodeFinished, resolveAllNotices, resolveNotice } from "./episodes.js";
import { applyHistory, cancelHistory, historyPlan, historyProgress, scanHistory, skipHistory } from "./history-import.js";
import { modelStatus, originAllowed, resolveModel } from "./model.js";
import { currentView, makeView, pageUpdate, showForSeries } from "./page.js";
import { backToCrunchilist, keepTab, moveTab, playEpisode, switchTabs, tabRole, tokenArrived, undoMove, warmEpisodes, watchPlayerTabs } from "./player.js";
import { catalogRerank, catalogSearch, catalogSuggest, homeRows, searchInspired } from "./search.js";
import { loadCatalog, loadState, saveState } from "./store.js";
import { checkForUpdate, markUpdateAnnounced } from "./updates.js";

function seriesIdFrom(id) {
  return String(id || "").replace(/^sight:/, "");
}

async function setStatus(id, status) {
  const state = await loadState();
  const seriesId = seriesIdFrom(id);
  const show = showForSeries(state, await loadCatalog(), seriesId);
  const result = await setShowStatus(show, status ?? null);
  const entry = entryForSeries(result.state.library, seriesId, show.anilistId);
  return { view: await currentView(result.state), syncNote: result.syncNote, status: entry?.status || null };
}

async function markProgress(id, episode, undo = false) {
  const state = await loadState();
  const catalog = await loadCatalog();
  const seriesId = seriesIdFrom(id);
  let to = Number(episode);
  if (episode == null) {
    const offer = makeView(state, catalog).progressOffer;
    if (!offer || offer.id !== seriesId) throw new Error("Nothing new to mark watched.");
    to = offer.to;
  }
  if (!Number.isInteger(to) || to < (undo ? 0 : 1) || to > 5000) throw new Error("Missing episode");
  const show = showForSeries(state, catalog, seriesId);
  const entry = entryForSeries(state.library, seriesId, show.anilistId);
  if (undo) {
    const result = await setShowProgress(show, to);
    return { view: await currentView(result.state), syncNote: result.syncNote };
  }
  if (entry?.progress != null && entry.progress >= to) {
    return { view: await currentView(state), syncNote: `Episode ${to} was already marked watched.` };
  }
  const result = await setShowProgress(show, to);
  return { view: await currentView(result.state), syncNote: result.syncNote };
}

async function syncNow() {
  const result = await retryPendingSync({ force: true });
  const state = result?.state || await loadState();
  const { waiting, error } = syncStatus(state);
  if (result?.sending) {
    const count = waiting === 1 ? "1 change" : `${waiting} changes`;
    return { view: await currentView(state), syncNote: `Sending ${count} to AniList one at a time so it doesn't block them. About ${pacedMinutes(waiting)} min; progress shows next to the search button.` };
  }
  const syncNote = waiting ? `AniList was not updated: ${error || "try again later."}` : result?.synced ? "AniList is up to date." : "Nothing waiting to sync.";
  return { view: await currentView(state), syncNote };
}

async function updateTaste(taste) {
  const state = await loadState();
  state.taste = sanitizeTaste(taste);
  await saveState(state);
  return { view: await currentView(state) };
}

async function updateSettings(patch) {
  const state = await loadState();
  const clean = {};
  for (const key of ["apiKey", "providerKey", "aiService", "anilistUsername", "anilistClientId", "panelOpen", "panelCorner", "hideWatched", "useAi", "favorNamed", "episodeDialogs", "askModelDownload", "muteNotifications", "badgeStyle", "badgeCorner", "badgeSize", "badgeProgress", "badgeUnwatched", "badgeMotion", "liteMode", "openIn", "tabManage", "tabAuto", "backButton", "miniPlayer", "showTips"]) {
    if (patch?.[key] !== undefined) clean[key] = patch[key];
  }
  state.settings = applySettingsPatch(state.settings, clean);
  const saved = typeof clean.apiKey === "string" ? { id: "openai", key: clean.apiKey } : clean.providerKey;
  const provider = saved?.key ? providerById(saved.id) : null;
  let keyNote = "";
  if (provider) {
    try {
      const picked = await resolveModel(provider, state.settings.apiKeys[provider.id]);
      if (picked) state.settings = applySettingsPatch(state.settings, { providerModel: { id: provider.id, model: picked } });
      keyNote = `${provider.label} key saved.`;
    } catch (error) {
      keyNote = `${error.message} It was saved anyway; check it was pasted fully.`;
    }
  }
  await saveState(state);
  const result = { view: await currentView(state), keyNote };
  if (provider) {
    result.originOk = await originAllowed(provider.baseUrl);
    result.origin = new URL(provider.baseUrl).origin;
  }
  return result;
}

async function withView(promise) {
  const { state, ...rest } = await promise;
  return { ...rest, view: await currentView(state) };
}

async function handle(message, sender) {
  switch (message?.type) {
    case "pageUpdate":
      return pageUpdate(message.observation, sender);
    case "catalogSession": {
      const result = await catalogSession(message.token, message.locale);
      const arrived = sender?.tab?.id != null ? tokenArrived(sender.tab.id).catch(() => {}) : Promise.resolve();
      arrived.then(() => warmEpisodes([])).catch(() => {});
      return result;
    }
    case "playEpisode":
      return playEpisode(message, sender);
    case "warmEpisodes":
      warmEpisodes(message.requests).catch(() => {});
      return {};
    case "tabRole":
      return tabRole(sender);
    case "moveTab":
      return moveTab(sender?.tab?.id);
    case "keepTab":
      return keepTab(sender?.tab?.id);
    case "undoMove":
      return undoMove();
    case "backToCrunchilist":
      return backToCrunchilist(openApp, sender?.tab?.id);
    case "catalogSearch":
      return catalogSearch(message.query, message.chip, message.site, {
        sort: message.sort,
        tags: message.tags,
        without: message.without,
        offset: message.offset,
        limit: message.limit,
        browse: message.browse === true,
      });
    case "catalogSuggest":
      return catalogSuggest(message.query, message.chip, message.site);
    case "catalogRerank":
      return catalogRerank(message.query, message.chip, message.site, message.ids, { reroll: message.reroll, seen: message.seen, last: message.last, save: message.save });
    case "searchInspired":
      return searchInspired(message.searches, { ai: message.ai !== false, fresh: Boolean(message.fresh) });
    case "homeRows":
      return homeRows(message.searches, { ai: message.ai !== false, fresh: Boolean(message.fresh), nudge: typeof message.nudge === "string" ? message.nudge : undefined });
    case "catalogProgress":
      return catalogProgress();
    case "refreshCatalogCovers":
      return runCatalogProtocol();
    case "historyScan":
      return scanHistory();
    case "historyProgress":
      return historyProgress();
    case "historyPlan":
      return historyPlan(message.stale);
    case "historyApply":
      return applyHistory(message.stale, message.ids);
    case "historySkip":
      return skipHistory(message.ids);
    case "historyCancel":
      return cancelHistory();
    case "getActivity":
      return { tasks: currentActivity() };
    case "modelStatus":
      return { status: await modelStatus() };
    case "setStatus":
      return setStatus(message.id, message.status);
    case "syncAnilistProgress":
      return markProgress(message.id, message.episode, message.undo === true);
    case "syncNow":
      return syncNow();
    case "episodeFinished":
      return episodeFinished(message.id, message.episode);
    case "resolveNotice":
      return resolveNotice(message.id, message.action);
    case "resolveAllNotices":
      return resolveAllNotices(message.action);
    case "setTaste":
      return updateTaste(message.taste);
    case "setSettings":
      return updateSettings(message.patch || {});
    case "clearKey":
      return updateSettings({ providerKey: { id: message.id || "openai", key: "" } });
    case "setUi":
      return updateSettings({
        panelOpen: message.panelOpen,
        panelCorner: message.panelCorner,
        hideWatched: message.hideWatched,
      });
    case "importAnilist":
      return withView(importAnilist(message.username));
    case "startAnilistAuth":
      return withView(startAnilistAuth(message));
    case "connectAnilist":
      return withView(connectAnilist(message));
    case "disconnectAnilist":
      return withView(disconnectAnilist());
    case "refreshAnilist":
      return withView(refreshAnilist());
    case "openOptions":
      await chrome.runtime.openOptionsPage();
      return {};
    case "openApp":
      await openApp();
      return {};
    case "appData":
      return appData();
    case "setSeasonState":
      return setSeasonState(message.showId, message.changes);
    case "updateStatus":
      return { update: await checkForUpdate({ force: message.force === true }) };
    case "updateAnnounced":
      return markUpdateAnnounced(message.version);
    case "getShortcut":
      return { shortcut: await switchShortcut() };
    case "openShortcuts":
      return openShortcuts();
    case "getState":
      retryPendingSync().then(async (result) => {
        if (result) await chrome.runtime.sendMessage({ type: "enriched", view: await currentView(result.state) });
      }).catch(() => {});
      return { view: await currentView() };
    default:
      throw new Error("Unknown message");
  }
}

listenForAuth();
watchPlayerTabs();
allowTrailers();

// YouTube refuses to embed without a referrer (error 153), and extension pages don't send one.
// Only trailer frames the Crunchilist page itself opens get YouTube's own address as the referrer.
function allowTrailers() {
  chrome.declarativeNetRequest?.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: { type: "modifyHeaders", requestHeaders: [{ header: "referer", operation: "set", value: "https://www.youtube-nocookie.com/" }] },
      condition: { requestDomains: ["youtube-nocookie.com"], resourceTypes: ["sub_frame"], initiatorDomains: [chrome.runtime.id] },
    }],
  }).catch(() => {});
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "switch-crunchilist") switchTabs(openApp).catch(() => {});
});

// Chrome leaves the shortcut unassigned when another extension already uses the key, and an unpacked
// reload doesn't always apply a newly added one, so show what is really set.
async function switchShortcut() {
  const commands = await chrome.commands.getAll().catch(() => []);
  return commands.find((command) => command.name === "switch-crunchilist")?.shortcut || "";
}

async function openShortcuts() {
  await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  return {};
}

// Development bridge: the app page mockup served from localhost can start playback through the extension.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(sender?.url || "")) return false;
  const playback = async () => {
    const view = await currentView();
    const { openIn, tabManage, tabAuto, backButton, showTips, anilistConnected, anilistExpired, anilistViewerName } = view.settings || {};
    const name = anilistConnected || anilistExpired ? anilistViewerName || "" : view.importMeta?.username || "";
    const account = { name, connected: Boolean(anilistConnected && anilistViewerName), expired: Boolean(anilistExpired), avatar: name && view.importMeta?.username === name ? view.importMeta.avatar || "" : "", importedAt: view.importMeta?.importedAt || 0 };
    return { version: chrome.runtime.getManifest().version, shortcut: await switchShortcut(), account, playback: { openIn, tabManage, tabAuto, backButton, showTips } };
  };
  const pick = (patch) => Object.fromEntries(["openIn", "tabManage", "tabAuto", "backButton", "showTips"].filter((key) => patch?.[key] !== undefined).map((key) => [key, patch[key]]));
  const run = message?.type === "playEpisode" ? playEpisode(message, sender)
    : message?.type === "ping" ? playback()
    : message?.type === "setPlayback" ? updateSettings(pick(message.patch)).then(playback)
    : message?.type === "openShortcuts" ? openShortcuts()
    : Promise.reject(new Error("Unknown message"));
  run.then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || "Request failed" }));
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  loadState().then(saveState).catch(() => {});
  checkForUpdate({ force: true }).catch(() => {});
  if (details?.reason === "update") reopenAfterUpdate().catch(() => {});
});

// The Update button reloads the extension, which closes Crunchilist's tab; open it again on the new version.
async function reopenAfterUpdate() {
  const { crReopenApp } = await chrome.storage.local.get("crReopenApp");
  if (!crReopenApp) return;
  await chrome.storage.local.remove("crReopenApp");
  await chrome.storage.local.set({ crJustUpdated: chrome.runtime.getManifest().version });
  await openApp();
}
chrome.runtime.onStartup.addListener(() => {
  checkForUpdate().catch(() => {});
});

async function openApp() {
  const url = chrome.runtime.getURL("app/app.html");
  const [existing] = await chrome.tabs.query({ url });
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url });
}

function paintActionBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "" : "OFF" }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: "#5a4f47" }).catch(() => {});
  chrome.action.setTitle({ title: enabled ? "Crunchilist" : "Crunchilist (off on Crunchyroll)" }).catch(() => {});
}

isEnabled().then(paintActionBadge).catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ENABLED_KEY in changes) paintActionBadge(changes[ENABLED_KEY].newValue !== false);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "activity") return false;
  handle(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || "Request failed" }))
    .finally(() => watchActivity());
  return true;
});
