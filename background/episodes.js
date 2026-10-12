import { entryForSeries, progressOffer } from "../lib/library.js";
import { addNotice, liveNotices, removeNotices } from "../lib/notices.js";
import { setShowProgress } from "./anilist-sync.js";
import { currentView, showForSeries } from "./page.js";
import { loadCatalog, loadState, saveState } from "./store.js";

async function broadcast(view) {
  chrome.runtime.sendMessage({ type: "enriched", view }).catch(() => {});
  try {
    const tabs = await chrome.tabs.query({ url: ["https://www.crunchyroll.com/*", "https://*.crunchyroll.com/*"] });
    for (const tab of tabs) if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: "enriched", view }).catch(() => {});
  } catch {
    // Tabs can close while the update is sent.
  }
}

async function finishWith(state, extra = {}) {
  const view = await currentView(state);
  broadcast(view);
  return { ...extra, view };
}

export async function episodeFinished(id, episode) {
  const state = await loadState();
  if (!Number.isInteger(Number(episode)) || Number(episode) < 1 || Number(episode) > 5000) return { mode: "none", view: await currentView(state) };
  const seriesId = String(id || "").replace(/^sight:/, "");
  const show = showForSeries(state, await loadCatalog(), seriesId);
  const entry = entryForSeries(state.library, seriesId, show.anilistId);
  const offer = progressOffer(entry, episode, show.episodes);
  if (!offer) return { mode: "none", view: await currentView(state) };
  const dialogs = state.settings.episodeDialogs !== false;
  const muted = Boolean(state.settings.muteNotifications);
  const notice = {
    show: { crSeriesId: seriesId, anilistId: show.anilistId, title: show.title, cover: show.cover, episodes: show.episodes },
    episode: offer.to,
    from: offer.from,
    last: offer.last,
  };
  if (offer.watching || !dialogs) {
    const result = await setShowProgress(show, offer.to);
    const toast = dialogs && !muted;
    if (!toast) {
      result.state.notices = addNotice(result.state.notices, { ...notice, kind: "done" }, Date.now());
      await saveState(result.state);
    }
    return finishWith(result.state, { mode: "auto", toast, offer, syncNote: result.syncNote });
  }
  state.notices = addNotice(state.notices, { ...notice, kind: "ask" }, Date.now());
  await saveState(state);
  return finishWith(state, { mode: "ask", toast: !muted, offer, noticeId: state.notices[0].id });
}

async function applyNotice(row) {
  const result = await setShowProgress(row.show, row.episode);
  return result;
}

export async function resolveNotice(id, action) {
  const state = await loadState();
  const row = liveNotices(state.notices, state.library).find((notice) => notice.id === id);
  state.notices = removeNotices(state.notices, [id]);
  await saveState(state);
  if (!row || action !== "update" || row.kind !== "ask") return finishWith(state);
  const result = await applyNotice(row);
  return finishWith(result.state, { syncNote: result.syncNote });
}

export async function resolveAllNotices(action) {
  const state = await loadState();
  const asks = action === "update" ? liveNotices(state.notices, state.library).filter((row) => row.kind === "ask") : [];
  state.notices = [];
  await saveState(state);
  let latest = state;
  let syncNote = "";
  for (const row of asks) {
    const result = await applyNotice(row);
    latest = result.state;
    if (result.syncNote && !/^Marked episode/.test(result.syncNote)) syncNote = result.syncNote;
  }
  return finishWith(latest, { syncNote: syncNote || (asks.length ? `Updated ${asks.length === 1 ? "1 show" : `${asks.length} shows`}.` : "Cleared.") });
}
