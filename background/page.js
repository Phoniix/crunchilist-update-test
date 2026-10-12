import {
  SEARCH_QUERY,
  cacheKeyForSeason,
  cacheKeyForSeries,
  matchTitleToMedia,
  mediaToCacheHit,
  missEntry,
  queriesForObservation,
  readCache,
} from "../lib/anilist.js";
import { entryForSeries, progressOffer, seriesMarks } from "../lib/library.js";
import { describeNotice, liveNotices } from "../lib/notices.js";
import { publicSettings } from "../lib/settings.js";
import { collectTagSuggestions } from "../lib/taste.js";
import { retryPendingSync, syncStatus } from "./anilist-sync.js";
import { anilist, delay, loadCatalog, loadState, saveState } from "./store.js";

let enrichToken = 0;

function currentSeason(observation) {
  if (!observation?.currentKey) return null;
  return (observation.seasons || []).find((season) => `${season.seriesId}|${season.seasonSlug}` === observation.currentKey) || null;
}

function hitTitle(hit) {
  return hit?.titles?.english || hit?.titles?.romaji || "";
}

export function showForSeries(state, catalog, seriesId, observation = state.lastObservation) {
  if (!seriesId) throw new Error("Missing show");
  const now = Date.now();
  const item = (catalog?.items || []).find((row) => row.id === seriesId)
    || (catalog?.newest || []).find((row) => row.id === seriesId)
    || null;
  const season = observation?.seriesId === seriesId ? currentSeason(observation) : null;
  const seasonHit = season ? readCache(state.anilistCache, cacheKeyForSeason(season.seriesId, season.seasonSlug), now) : null;
  const seriesHit = readCache(state.anilistCache, cacheKeyForSeries(seriesId), now);
  const hit = seasonHit?.kind === "hit" ? seasonHit : seriesHit?.kind === "hit" ? seriesHit : null;
  const sighting = (observation?.sightings || []).find((row) => row.seriesId === seriesId);
  return {
    crSeriesId: seriesId,
    anilistId: hit?.anilistId || item?.anilistId || null,
    title: (seasonHit?.kind === "hit" ? hitTitle(seasonHit) : "") || item?.title || season?.seriesTitle || sighting?.title || hitTitle(hit),
    cover: hit?.cover || item?.cover || "",
    labels: hit ? [...(hit.genres || []), ...(hit.tags || [])] : [],
    episodes: hit?.episodes ?? season?.episodeCount ?? item?.episodes ?? null,
  };
}

export function makeView(state, catalog, observation = state.lastObservation) {
  const kind = observation?.kind || "browse";
  const seriesId = kind === "series" || kind === "watch" ? observation?.seriesId || null : null;
  let current = null;
  let offer = null;
  if (seriesId) {
    const show = showForSeries(state, catalog, seriesId, observation);
    const entry = entryForSeries(state.library, seriesId, show.anilistId);
    current = { seriesId, title: show.title, status: entry?.status || "" };
    const watching = kind === "watch" ? currentSeason(observation)?.watchingEpisode : null;
    const next = progressOffer(entry, watching, show.episodes);
    if (next) offer = { ...next, id: seriesId };
  }
  return {
    settings: publicSettings(state.settings),
    taste: state.taste,
    tagSuggestions: collectTagSuggestions(state),
    kind,
    url: observation?.url || "",
    currentId: current?.seriesId || null,
    currentTitle: current?.title || "",
    currentStatus: current?.status || "",
    marks: seriesMarks(state.library),
    importMeta: state.importMeta,
    historyImport: state.historyImport,
    catalogUpdatedAt: Number(catalog?.updatedAt) || 0,
    catalogDetailsAt: Number(catalog?.detailsAt) || 0,
    catalogTitlesOwed: Boolean(catalog?.titlesOwed),
    progressOffer: offer,
    sync: syncStatus(state),
    notices: liveNotices(state.notices, state.library).map((row) => ({
      id: row.id,
      kind: row.kind,
      cover: row.show.cover,
      createdAt: row.createdAt,
      ...describeNotice(row),
    })),
  };
}

export async function currentView(state = null) {
  const loaded = state || await loadState();
  return makeView(loaded, await loadCatalog());
}

export async function pageUpdate(observation, sender) {
  if (!observation || typeof observation !== "object") throw new Error("Missing page");
  const state = await loadState();
  state.lastObservation = observation;
  await saveState(state);
  const tabId = sender?.tab?.id;
  retryPendingSync().then(async (result) => {
    if (result && tabId != null) await chrome.tabs.sendMessage(tabId, { type: "enriched", view: await currentView(result.state) });
  }).catch(() => {});
  if (tabId != null && (observation.kind === "series" || observation.kind === "watch")) {
    const token = ++enrichToken;
    enrich(tabId, token).catch(() => {});
  }
  return { view: await currentView(state) };
}

async function enrich(tabId, token) {
  const started = await loadState();
  const observation = started.lastObservation;
  if (!observation?.currentKey) return;
  const queries = queriesForObservation(started, observation, Date.now())
    .filter((query) => query.seasonKey === observation.currentKey)
    .slice(0, 2);
  const updates = {};
  for (const query of queries) {
    if (token !== enrichToken) return;
    try {
      const payload = await anilist(SEARCH_QUERY, { search: query.search });
      const match = matchTitleToMedia(query.matchTitle, payload?.data?.Page?.media || []);
      updates[query.cacheKey] = match.confidence === "high" ? mediaToCacheHit(match.media, Date.now()) : missEntry(Date.now());
    } catch {
      break;
    }
    await delay(280);
  }
  if (!Object.keys(updates).length || token !== enrichToken) return;
  const fresh = await loadState();
  fresh.anilistCache = { ...fresh.anilistCache, ...updates };
  await saveState(fresh);
  try {
    await chrome.tabs.sendMessage(tabId, { type: "enriched", view: await currentView(fresh) });
  } catch {
    // The tab can close before the season lookup finishes.
  }
}
