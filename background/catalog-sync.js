import {
  CATALOG_MATCH_BATCH,
  DETAIL_BATCH,
  applyMediaDetails,
  cacheKeyForSeries,
  catalogMatchQuery,
  catalogMatchVariables,
  clearSeriesMisses,
  dropUnusedSeriesCache,
  localCoverStamps,
  matchesFromBatch,
  mediaDetailQuery,
  mediaDetailVariables,
  readCache,
  titlesNeedingAnilist,
  titlesNeedingDetail,
} from "../lib/anilist.js";
import {
  browseRequestUrl,
  catalogDue,
  mergeCatalogItems,
  normalizeLocale,
  parseBrowsePayload,
  parseSearchPayload,
  retainSeenCatalog,
  searchRequestUrl,
  stampCatalogCovers,
} from "../lib/catalog.js";
import { linkCatalog } from "../lib/library.js";
import { refreshMediaExtras } from "./app-data.js";
import { clearModelStall, modelDownloadNote, modelProgress, preloadChromeModel } from "./model.js";
import { anilist, delay, loadCatalog, loadState, saveCatalog, saveState } from "./store.js";

const OWED_RETRY_MS = 10 * 60 * 1000;

let catalogToken = "";
let catalogLocale = "en-US";
let catalogJob = null;
let anilistCatalogPass = false;
let catalogUi = { running: false, progress: 0, note: "", series: 0, movie: 0 };

const SECONDS_PER = { page: 0.7, match: 1.5, detail: 1.7 };
const BROWSE_PAGE = 50;
let work = freshWork();

function freshWork() {
  return {
    pages: { newest: 0, series: 0, movie_listing: 0 },
    pagesDone: { newest: 0, series: 0, movie_listing: 0 },
    match: 0,
    matchDone: 0,
    detail: 0,
    detailDone: 0,
  };
}

function workShare() {
  const pages = Object.values(work.pages).reduce((sum, value) => sum + value, 0);
  const pagesDone = Object.keys(work.pages).reduce((sum, key) => sum + Math.min(work.pagesDone[key], work.pages[key]), 0);
  const total = pages * SECONDS_PER.page + work.match * SECONDS_PER.match + work.detail * SECONDS_PER.detail;
  if (!total) return 0;
  const done = pagesDone * SECONDS_PER.page
    + Math.min(work.matchDone, work.match) * SECONDS_PER.match
    + Math.min(work.detailDone, work.detail) * SECONDS_PER.detail;
  return Math.min(0.99, done / total);
}

function bumpProgress() {
  catalogUi.running = true;
  catalogUi.progress = Math.max(catalogUi.progress || 0, workShare());
}

function planWork(catalog, state, { pages = true } = {}) {
  work = freshWork();
  if (pages) {
    const series = catalog.items.filter((item) => item.type !== "movie").length;
    const movies = catalog.items.length - series;
    work.pages = {
      newest: 1,
      series: Math.max(1, Math.ceil(series / BROWSE_PAGE) || 30),
      movie_listing: Math.max(1, Math.ceil(movies / BROWSE_PAGE) || 6),
    };
  }
  const now = Date.now();
  const items = [...catalog.items, ...catalog.newest];
  work.match = Math.ceil(titlesNeedingAnilist(items, state.anilistCache, now).length / CATALOG_MATCH_BATCH);
  work.detail = Math.ceil(titlesNeedingDetail(items, state.anilistCache, now).length / DETAIL_BATCH);
  catalogUi.progress = 0;
}

function finishCatalogUi() {
  if (catalogJob || anilistCatalogPass) return;
  catalogUi.running = false;
  catalogUi.progress = 1;
  catalogUi.automatic = false;
}

function noteScrape(type, loaded, total, page) {
  work.pagesDone[type] = page + 1;
  if (total > 0) work.pages[type] = Math.max(page + 1, Math.ceil(total / BROWSE_PAGE));
  else if (work.pagesDone[type] >= work.pages[type]) work.pages[type] = work.pagesDone[type] + 1;
  bumpProgress();
  if (catalogUi.automatic) catalogUi.phase = "Gathering the Crunchyroll list";
}
let anilistCatalogAbort = null;

function validBearer(token) {
  return typeof token === "string" && token.length >= 20 && token.length <= 4000 && !/\s/.test(token);
}

async function currentToken() {
  if (validBearer(catalogToken)) return catalogToken;
  try {
    const stored = await chrome.storage.session.get(["crCatalogToken", "crCatalogLocale"]);
    catalogToken = validBearer(stored.crCatalogToken) ? stored.crCatalogToken : "";
    if (stored.crCatalogLocale) catalogLocale = normalizeLocale(stored.crCatalogLocale);
  } catch {
    catalogToken = "";
  }
  return catalogToken;
}

function currentLocale() {
  return catalogLocale;
}

async function crGet(token, url) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  if (response.status === 401 || response.status === 403) {
    catalogToken = "";
    throw new Error("Crunchyroll session expired. Reload the page.");
  }
  if (!response.ok) throw new Error(`Crunchyroll returned ${response.status}`);
  return response.json();
}

async function syncCatalog({ forceMatch = false } = {}) {
  const token = await currentToken();
  if (!validBearer(token)) {
    finishCatalogUi();
    return;
  }
  catalogUi.running = true;
  if (!catalogUi.note) catalogUi.note = "Updating the Crunchyroll list and AniList matches.";
  let catalog = await loadCatalog();
  planWork(catalog, await loadState());
  catalog = { ...catalog, attemptedAt: Date.now(), locale: catalogLocale };
  await saveCatalog(catalog);
  const seen = new Set();
  try {
    const fresh = await crGet(token, browseRequestUrl({
      start: 0,
      type: "series",
      locale: catalogLocale,
      sort: "newly_added",
      pageSize: 24,
    }));
    const newest = parseBrowsePayload(fresh).items.slice(0, 24);
    for (const item of newest) if (item?.id) seen.add(item.id);
    catalog = { ...catalog, newest };
    await saveCatalog(catalog);
  } catch {
    // The popular list can still load if the new-release page fails.
  }
  work.pagesDone.newest = 1;
  bumpProgress();
  for (const type of ["series", "movie_listing"]) {
    let start = 0;
    for (let page = 0; page < 80; page += 1) {
      const payload = await crGet(await currentToken(), browseRequestUrl({ start, type, locale: catalogLocale }));
      const parsed = parseBrowsePayload(payload);
      for (const item of parsed.items) if (item?.id) seen.add(item.id);
      catalog = { ...catalog, items: mergeCatalogItems(catalog.items, parsed.items), complete: false };
      await saveCatalog(catalog);
      const loaded = start + parsed.items.length;
      noteScrape(type, loaded, parsed.total || (parsed.items.length < 50 ? loaded : 0), page);
      if (!parsed.items.length) break;
      if (parsed.total != null && start + parsed.items.length >= parsed.total) break;
      if (parsed.items.length < 50) break;
      start += parsed.items.length;
      await delay(120);
    }
  }
  if (!seen.size) {
    finishCatalogUi();
    return;
  }
  for (const item of catalog.newest || []) if (item?.id) seen.add(item.id);
  catalog.items = retainSeenCatalog(catalog.items, seen);
  catalog.newest = retainSeenCatalog(catalog.newest, seen);
  catalog.updatedAt = Date.now();
  catalog.complete = true;
  catalog.titlesOwed = false;
  for (const type of Object.keys(work.pages)) work.pages[type] = work.pagesDone[type];
  bumpProgress();
  await saveCatalog(catalog);
  const freshState = await loadState();
  freshState.anilistCache = dropUnusedSeriesCache(freshState.anilistCache, seen);
  await saveState(freshState);
  startAnilistCatalogMatch({ force: forceMatch });
}

function startAnilistCatalogMatch({ force = false } = {}) {
  if (anilistCatalogPass && !force) return;
  anilistCatalogAbort?.abort();
  anilistCatalogPass = true;
  const controller = new AbortController();
  anilistCatalogAbort = controller;
  matchCatalogCovers(controller.signal).catch((error) => {
    if (error?.name === "AbortError") return;
  }).finally(() => {
    if (anilistCatalogAbort !== controller) return;
    anilistCatalogPass = false;
    finishCatalogUi();
  });
}

async function runCatalogProtocol() {
  const state = await loadState();
  const catalog = await loadCatalog();
  const token = await currentToken();
  await clearModelStall();
  await preloadChromeModel(state);
  const modelNote = modelDownloadNote();
  if (!validBearer(token)) {
    if (!catalog.items.length) return { note: `Open Crunchyroll while signed in so the catalog can load.${modelNote}`, running: false, progress: 0 };
    state.anilistCache = clearSeriesMisses(state.anilistCache);
    await saveState(state);
    await saveCatalog({ ...catalog, titlesOwed: true });
    catalogUi = { ...catalogUi, running: true, progress: 0, note: `Updating AniList details. The Crunchyroll title list updates next time you open Crunchyroll.${modelNote}` };
    startAnilistCatalogMatch({ force: true });
    return { note: catalogUi.note, running: true, progress: catalogUi.progress, titlesOwed: true };
  }
  if (catalogJob || anilistCatalogPass) {
    return { note: catalogUi.note || `Catalog update is already running.${modelNote}`, running: true, progress: catalogUi.progress };
  }
  anilistCatalogAbort?.abort();
  state.anilistCache = clearSeriesMisses(state.anilistCache);
  await saveState(state);
  catalogUi = {
    running: true,
    progress: 0,
    note: `Updating the Crunchyroll list and AniList matches.${modelNote}`,
    series: 0,
    movie: 0,
  };
  catalogJob = syncCatalog({ forceMatch: true }).catch(() => {
    catalogUi.running = false;
  }).finally(() => {
    catalogJob = null;
    finishCatalogUi();
  });
  return { note: catalogUi.note, running: true, progress: 0 };
}

function catalogActivity() {
  const tasks = [];
  if (catalogUi.running) {
    const gathering = Boolean(catalogUi.automatic);
    tasks.push({
      id: "catalog",
      label: gathering ? catalogUi.phase || "Gathering the Crunchyroll list" : "Refreshing the catalog",
      progress: catalogUi.progress || 0,
      gathering,
    });
  }
  const model = modelProgress();
  if (model.modelDownloading) tasks.push({ id: "model", label: "Downloading Chrome's AI model", progress: model.modelProgress || 0 });
  return tasks;
}

function catalogProgress() {
  return {
    running: catalogUi.running,
    progress: catalogUi.progress,
    note: catalogUi.note,
    phase: catalogUi.phase || "",
    gathering: Boolean(catalogUi.automatic && catalogUi.running),
    ...modelProgress(),
  };
}

async function matchCatalogCovers(signal) {
  let state = await loadState();
  let catalog = await loadCatalog();
  const local = localCoverStamps([...catalog.items, ...catalog.newest], state, Date.now());
  if (Object.keys(local.cacheUpdates).length) {
    state.anilistCache = { ...state.anilistCache, ...local.cacheUpdates };
    await saveState(state);
  }
  if (Object.keys(local.stamps).length) {
    catalog = stampCatalogCovers(catalog, local.stamps);
    await saveCatalog(catalog);
  }
  const pending = titlesNeedingAnilist([...catalog.items, ...catalog.newest], state.anilistCache, Date.now());
  if (!catalogJob) {
    work = freshWork();
    work.detail = Math.ceil(titlesNeedingDetail([...catalog.items, ...catalog.newest], state.anilistCache, Date.now()).length / DETAIL_BATCH);
    catalogUi.progress = 0;
  }
  work.match = Math.ceil(pending.length / CATALOG_MATCH_BATCH);
  work.matchDone = 0;
  if (pending.length) {
    if (catalogUi.automatic) catalogUi.phase = "Matching titles with AniList";
  }
  for (let index = 0; index < pending.length; index += CATALOG_MATCH_BATCH) {
    if (signal?.aborted) return;
    const batch = pending.slice(index, index + CATALOG_MATCH_BATCH);
    const variables = catalogMatchVariables(batch.map((item) => item.title));
    let payload;
    try {
      payload = await anilist(catalogMatchQuery(batch.length), variables, undefined, signal);
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") return;
      if (!/429/.test(String(error?.message))) break;
      await delay(60_000, signal);
      try {
        payload = await anilist(catalogMatchQuery(batch.length), variables, undefined, signal);
      } catch (retryError) {
        if (signal?.aborted || retryError?.name === "AbortError") return;
        break;
      }
    }
    if (signal?.aborted) return;
    work.matchDone += 1;
    bumpProgress();
    const result = matchesFromBatch(batch, payload, Date.now());
    const fresh = await loadState();
    fresh.anilistCache = { ...fresh.anilistCache, ...result.cacheUpdates };
    await saveState(fresh);
    if (Object.keys(result.stamps).length) await saveCatalog(stampCatalogCovers(await loadCatalog(), result.stamps));
    await delay(800, signal);
  }
  await fillCatalogDetails(signal);
  await linkLibraryToCatalog();
  if (!signal?.aborted) await refreshMediaExtras(signal).catch(() => {});
  if (!signal?.aborted) await saveCatalog({ ...(await loadCatalog()), detailsAt: Date.now() });
  catalogUi.progress = 1;
}

async function storeDetailBatch(batch, signal) {
  if (!batch.length || signal?.aborted) return;
  let payload = null;
  try {
    payload = await anilist(mediaDetailQuery(batch.length), mediaDetailVariables(batch), undefined, signal);
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") throw error;
    if (/429/.test(String(error?.message))) {
      await delay(60_000, signal);
      try {
        payload = await anilist(mediaDetailQuery(batch.length), mediaDetailVariables(batch), undefined, signal);
      } catch (retryError) {
        if (signal?.aborted || retryError?.name === "AbortError") throw retryError;
        payload = null;
      }
    }
    if (!payload && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      await storeDetailBatch(batch.slice(0, mid), signal);
      await storeDetailBatch(batch.slice(mid), signal);
      return;
    }
    if (!payload) return;
  }
  const state = await loadState();
  state.anilistCache = { ...state.anilistCache, ...applyMediaDetails(batch, payload, Date.now(), state.anilistCache) };
  await saveState(state);
}

async function fillCatalogDetails(signal) {
  const state = await loadState();
  const catalog = await loadCatalog();
  const pending = titlesNeedingDetail([...catalog.items, ...catalog.newest], state.anilistCache, Date.now());
  work.match = work.matchDone;
  work.detail = Math.ceil(pending.length / DETAIL_BATCH);
  work.detailDone = 0;
  if (!pending.length) return;
  bumpProgress();
  if (catalogUi.automatic) catalogUi.phase = "Matching titles with AniList";
  for (let index = 0; index < pending.length; index += DETAIL_BATCH) {
    if (signal?.aborted) return;
    try {
      await storeDetailBatch(pending.slice(index, index + DETAIL_BATCH), signal);
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") return;
      return;
    }
    work.detailDone += 1;
    bumpProgress();
    await delay(800, signal);
  }
}

function applyStoredCovers(catalog, items) {
  const known = new Map();
  for (const item of [...catalog.items, ...catalog.newest]) {
    if (item?.cover) known.set(item.id, item);
  }
  return items.map((item) => {
    const saved = known.get(item.id);
    return saved ? { ...item, cover: saved.cover, anilistId: saved.anilistId || null } : item;
  });
}

async function catalogSession(token, locale) {
  if (!validBearer(token)) return {};
  catalogToken = token;
  catalogLocale = normalizeLocale(locale);
  try {
    await chrome.storage.session.set({ crCatalogToken: catalogToken, crCatalogLocale: catalogLocale });
  } catch {
    // The token for this visit stays in memory.
  }
  const catalog = await loadCatalog();
  preloadChromeModel(await loadState()).catch(() => {});
  const owed = catalog.titlesOwed && Date.now() - catalog.attemptedAt > OWED_RETRY_MS;
  if ((catalogDue(catalog) || owed) && !catalogJob) {
    catalogUi.automatic = true;
    catalogUi.running = true;
    catalogUi.progress = 0;
    catalogUi.phase = "Gathering the Crunchyroll list";
    catalogUi.note = catalogUi.phase;
    catalogJob = syncCatalog().catch(() => {}).finally(() => {
      catalogJob = null;
      finishCatalogUi();
    });
  } else if (catalog.items.length && !catalogJob) {
    startAnilistCatalogMatch();
  }
  return {
    catalog: { count: catalog.items.length, updatedAt: catalog.updatedAt, updating: Boolean(catalogJob) },
    gathering: Boolean(catalogUi.automatic && catalogUi.running),
    phase: catalogUi.phase || "",
  };
}

async function liveSearch(token, query) {
  const [seriesPayload, moviePayload] = await Promise.all([
    crGet(token, searchRequestUrl({ query, type: "series", locale: catalogLocale })),
    crGet(token, searchRequestUrl({ query, type: "movie_listing", locale: catalogLocale })),
  ]);
  const seen = new Set();
  const items = [];
  for (const item of [...parseSearchPayload(seriesPayload), ...parseSearchPayload(moviePayload)]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

const LINKED_RELATIONS = new Set(["SEQUEL", "PREQUEL"]);

function catalogPairs(state, catalog) {
  const now = Date.now();
  const pairs = [];
  for (const item of [...(catalog.items || []), ...(catalog.newest || [])]) {
    const hit = readCache(state.anilistCache, cacheKeyForSeries(item.id), now);
    const matched = hit?.kind === "hit" ? hit : null;
    pairs.push({
      crSeriesId: item.id,
      anilistId: matched?.anilistId || item.anilistId || null,
      relatedIds: (matched?.relations || []).filter((row) => LINKED_RELATIONS.has(row.type)).map((row) => row.anilistId),
      title: item.title,
      cover: item.cover || matched?.cover || "",
      labels: matched ? [...(matched.genres || []), ...(matched.tags || [])] : [],
      episodes: matched?.episodes ?? item.episodes ?? null,
    });
  }
  return pairs;
}

async function linkLibraryToCatalog() {
  const state = await loadState();
  const catalog = await loadCatalog();
  state.library = linkCatalog(state.library, catalogPairs(state, catalog));
  await saveState(state);
  return state;
}

export {
  applyStoredCovers,
  catalogActivity,
  catalogPairs,
  catalogProgress,
  catalogSession,
  crGet,
  currentLocale,
  currentToken,
  linkLibraryToCatalog,
  liveSearch,
  runCatalogProtocol,
  validBearer,
};
