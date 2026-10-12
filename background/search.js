import { cacheKeyForSeries, readCache, showFactsFromHit } from "../lib/anilist.js";
import {
  applyCatalogChip,
  buildHomeSections,
  displayPoster,
  promptFallbackBrief,
} from "../lib/catalog.js";
import { tasteMatches } from "../lib/banner.js";
import { activitySignature, buildHomeRowsPrompt, cleanNudge, expiryFor, fallbackThemes, fillThemes, HOME_ROWS_SCHEMA, HOME_ROWS_TTL_MS, needsRefresh, parseHomeRows } from "../lib/home-rows.js";
import { cleanSearches, inspiredRequest, interleave, recentlyWatched } from "../lib/inspired.js";
import { activeEntries, statusForSeries } from "../lib/library.js";
import { hasIntent, parseQuery, placeVariants } from "../lib/query.js";
import { LIGHT_MODEL_CANDIDATES } from "../lib/llm.js";
import { remoteSignature } from "../lib/settings.js";
import { buildIndex, docFromShow, searchIndex } from "../lib/search-index.js";
import { allowedByTaste, buildWeights, compactProfile, scoreLabels } from "../lib/taste.js";
import { applyStoredCovers, currentToken, liveSearch, validBearer } from "./catalog-sync.js";
import { askJson, pickWithModel } from "./model.js";
import { loadCatalog, loadState } from "./store.js";

const CATALOG_CHIPS = new Set(["unwatched", "one-cour", "long", "movie", "in-progress", "plan", "new"]);
const PROMPT_CANDIDATES = 20;
const SETTING_EXTRAS = 5;
const REROLL_POOL = 60;
const RERANK_CACHE_LIMIT = 40;
const PAGE_SIZE = 24;

let cachedIndex = { key: "", index: null, docs: [] };

function hitFor(state, item) {
  const hit = readCache(state.anilistCache, cacheKeyForSeries(item.id), Date.now());
  return hit?.kind === "hit" ? hit : null;
}

function labelsFor(state, item) {
  const hit = hitFor(state, item);
  return hit ? [...(hit.genres || []), ...(hit.tags || [])] : [];
}

function posterFor(state, item) {
  return displayPoster(item) || hitFor(state, item)?.cover || "";
}

function withShowFacts(state, item) {
  const hit = hitFor(state, item);
  if (!hit) return item;
  return {
    ...item,
    episodes: hit.episodes || item.episodes || null,
    type: hit.format === "MOVIE" ? "movie" : item.type,
  };
}

function statusFor(state, item) {
  return statusForSeries(state.library, item.id, hitFor(state, item)?.anilistId || item.anilistId);
}

function docFor(state, item) {
  const hit = hitFor(state, item);
  return docFromShow({
    id: item.id,
    title: item.title,
    type: item.type,
    episodes: hit?.episodes || item.episodes || null,
    anilistId: hit?.anilistId || item.anilistId || null,
    titles: hit?.titles,
    synonyms: hit?.synonyms,
    genres: hit?.genres,
    tags: hit?.tags,
    hiddenTags: hit?.hiddenTags,
    tagRanks: hit?.tagRanks,
    about: hit?.about || "",
    format: hit?.format,
    year: hit?.year,
    score: hit?.score,
    popularity: hit?.popularity,
    sources: ["crunchyroll"],
    item,
  });
}

function cacheStamp(cache) {
  let latest = 0;
  let count = 0;
  for (const entry of Object.values(cache || {})) {
    count += 1;
    if (entry?.cachedAt > latest) latest = entry.cachedAt;
  }
  return `${count}:${latest}`;
}

function indexFor(state, catalog, pool) {
  const key = `${catalog.updatedAt}:${catalog.items.length}:${catalog.newest.length}:${cacheStamp(state.anilistCache)}`;
  if (cachedIndex.key !== key) {
    const seen = new Set();
    const docs = [];
    for (const item of [...catalog.items, ...catalog.newest]) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      docs.push(docFor(state, item));
    }
    cachedIndex = { key, index: buildIndex(docs), docs };
  }
  const extras = (pool || []).filter((item) => item?.id && !cachedIndex.index.byId.has(item.id));
  if (!extras.length) return cachedIndex.index;
  return buildIndex([...cachedIndex.docs, ...extras.map((item) => docFor(state, item))]);
}

function siteAllowed(doc, site) {
  return !site || site === "all" || (doc.sources || []).includes(site);
}

function rankPool(state, catalog, pool, text, { scoreFor, mode = "full", limit = 24, site = "" } = {}) {
  const index = indexFor(state, catalog, pool);
  const allowedIds = new Set(pool.map((item) => item.id));
  return searchIndex(index, parseQuery(text), {
    scoreFor: (doc) => scoreFor(doc.item),
    statusFor: (doc) => statusFor(state, doc.item),
    allowed: (doc) => allowedIds.has(doc.id) && siteAllowed(doc, site),
    favorNamed: state.settings.favorNamed !== false,
    mode,
    limit,
  }).results;
}

function withoutAvoids(state, items) {
  return (items || []).filter((item) => allowedByTaste(labelsFor(state, item), state.taste));
}

function avoidedTitleNote(state, catalog, text, scoreFor) {
  const avoids = new Set((state.taste?.hardAvoids || []).map((label) => String(label).toLowerCase()));
  if (!avoids.size) return "";
  const hidden = (catalog.items || []).filter((item) => !allowedByTaste(labelsFor(state, item), state.taste));
  if (!hidden.length) return "";
  const [best] = rankPool(state, catalog, hidden, text, { scoreFor, mode: "title", limit: 1 });
  if (!best || best.close < 0.8) return "";
  const label = labelsFor(state, best.doc.item).find((value) => avoids.has(String(value).toLowerCase()));
  return `${best.doc.title} is hidden because you avoid ${label || "one of its tags"}. Change this in Taste preferences.`;
}

function tasteRank(state) {
  const weights = buildWeights(state);
  return { weights, scoreFor: (item) => scoreLabels(labelsFor(state, item), weights) };
}

function forYouRanked(state, catalog, scoreFor) {
  const hide = Boolean(state.settings.hideWatched);
  return withoutAvoids(state, catalog.items || []).filter((item) => {
    const status = statusFor(state, item);
    if (hide && (status === "finished" || status === "dropped")) return false;
    return status === "unwatched" || status === "plan";
  }).sort((a, b) => scoreFor(b) - scoreFor(a) || String(a.title).localeCompare(String(b.title)));
}

function forYouIdsFor(state, catalog, scoreFor) {
  return new Set(forYouRanked(state, catalog, scoreFor).slice(0, 24).map((item) => item.id));
}

function rerollItems(state, catalog, scoreFor, seen, last) {
  const ranked = forYouRanked(state, catalog, scoreFor).slice(0, REROLL_POOL);
  const fresh = ranked.filter((item) => !seen.has(item.id));
  if (fresh.length >= 3) return { items: fresh.slice(0, LIGHT_MODEL_CANDIDATES), reset: false };
  return { items: ranked.filter((item) => !last.has(item.id)).slice(0, LIGHT_MODEL_CANDIDATES), reset: true };
}

function presentCatalogItem(state, item) {
  const status = statusFor(state, item);
  const movie = item.type === "movie" || hitFor(state, item)?.format === "MOVIE";
  const tags = [movie ? "Movie" : "Series"];
  if (item.episodes && !movie) tags.push(`${item.episodes} eps`);
  return {
    id: `sight:${item.id}`,
    title: item.title,
    url: item.url,
    reason: item.type === "movie" ? "Movie on Crunchyroll." : item.episodes ? `${item.episodes} episodes on Crunchyroll.` : "On Crunchyroll.",
    tags,
    status: status === "unwatched" ? null : status,
    poster: posterFor(state, item),
  };
}

function presentSuggestion(state, item, forYou, weights) {
  const presented = presentCatalogItem(state, item);
  if (forYou.has(item.id)) {
    presented.reason = "For you";
    return presented;
  }
  const liked = labelsFor(state, item).find((label) => weights.liked.has(String(label).toLowerCase()));
  if (liked) presented.reason = liked;
  return presented;
}

function candidateFromCatalogItem(state, item) {
  const matched = hitFor(state, item);
  return {
    id: `sight:${item.id}`,
    title: item.title,
    url: item.url,
    status: statusFor(state, item),
    episodes: matched?.episodes ?? item.episodes ?? null,
    format: matched?.format || (item.type === "movie" ? "MOVIE" : null),
    tags: matched?.tags || [],
    genres: matched?.genres || [],
    audio: "unknown",
    anilistMatched: Boolean(matched),
    poster: posterFor(state, item),
    ...showFactsFromHit(matched),
  };
}

function presentFromModel(candidates, parsed) {
  const rows = [...(parsed.results || []), ...(parsed.mentions || [])];
  return rows.map((item) => {
    const candidate = candidates.find((entry) => entry.id === item.id);
    return {
      id: item.id,
      title: candidate?.title || item.id,
      url: candidate?.url || "",
      reason: item.reason,
      rank: item.mention ? null : item.rank ?? null,
      confidence: item.mention ? null : item.confidence ?? null,
      mention: Boolean(item.mention),
      tags: [...(candidate?.genres || []), ...(candidate?.tags || [])].slice(0, 5),
      status: candidate?.status && candidate.status !== "unwatched" ? candidate.status : null,
      audio: candidate?.audio || "unknown",
      poster: candidate?.poster || "",
    };
  });
}

function mergePreferCatalog(savedItems, liveItems) {
  const map = new Map();
  for (const item of savedItems || []) if (item?.id) map.set(item.id, item);
  for (const item of liveItems || []) {
    if (item?.id && !map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()];
}

async function collectSearchItems(state, catalog, text, chip, live) {
  const catalogChip = CATALOG_CHIPS.has(chip) ? chip : "";
  let base = chip === "new" ? (catalog.newest || []) : (catalog.items || []);
  if (live && String(text || "").trim().length >= 2) {
    const token = await currentToken();
    if (validBearer(token)) {
      try {
        const found = applyStoredCovers(catalog, await liveSearch(token, text));
        const freshIds = new Set((catalog.newest || []).map((item) => item.id));
        const extra = chip === "new" ? found.filter((item) => freshIds.has(item.id)) : found;
        base = mergePreferCatalog(base, extra);
      } catch {
        // The saved list still ranks when live search misses.
      }
    }
  }
  base = base.map((item) => withShowFacts(state, item));
  const byId = new Map(base.map((item) => [item.id, item]));
  return withoutAvoids(state, applyCatalogChip(
    base,
    catalogChip,
    Boolean(state.settings.hideWatched),
    (id) => (byId.has(id) ? statusFor(state, byId.get(id)) : "unwatched"),
  ));
}

function continueFromCatalog(state, catalog) {
  const byId = new Map((catalog.items || []).map((item) => [item.id, item]));
  const items = [];
  const seen = new Set();
  const watching = activeEntries(state.library)
    .filter((entry) => entry.status === "in_progress" && entry.crSeriesId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  for (const entry of watching) {
    const item = byId.get(entry.crSeriesId);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= 12) break;
  }
  return items;
}

function presentResult(state, item, forYou, weights) {
  const presented = presentSuggestion(state, item, forYou, weights);
  const hit = hitFor(state, item);
  const snippet = promptFallbackBrief(item, "", [], hit?.about || "");
  if (snippet) presented.reason = snippet;
  presented.tags = [...presented.tags, ...(hit?.genres || []).slice(0, 3)];
  return presented;
}

function homeNote(catalog, token) {
  if (!catalog.items.length && !validBearer(token)) return "Open Crunchyroll while signed in so the catalog can load.";
  if (!catalog.items.length) return "The catalog has not loaded yet. Stay on Crunchyroll for a moment.";
  if (!catalog.complete) return `Catalog is still downloading. ${catalog.items.length} titles saved so far.`;
  return "";
}

function cleanTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag || "").trim()).filter(Boolean))].slice(0, 8);
}

function hasTags(state, item, tags, without = []) {
  if (!tags.length && !without.length) return true;
  const hit = hitFor(state, item);
  const labels = new Set([...(hit?.genres || []), ...(hit?.tags || []), ...(hit?.hiddenTags || [])].map((label) => String(label).toLowerCase()));
  return tags.every((tag) => labels.has(tag.toLowerCase())) && !without.some((tag) => labels.has(tag.toLowerCase()));
}

function titleKey(title) {
  return String(title || "").replace(/^[^\p{L}\p{N}]+/u, "") || String(title || "");
}

function sortItems(state, items, sort) {
  const facts = (item) => hitFor(state, item) || {};
  const by = {
    popular: (a, b) => (facts(b).popularity || 0) - (facts(a).popularity || 0),
    score: (a, b) => (facts(b).score || 0) - (facts(a).score || 0) || (facts(b).popularity || 0) - (facts(a).popularity || 0),
    newest: (a, b) => (facts(b).year || 0) - (facts(a).year || 0) || (facts(b).popularity || 0) - (facts(a).popularity || 0),
    title: (a, b) => titleKey(a.title).localeCompare(titleKey(b.title), undefined, { numeric: true, sensitivity: "base" }),
    shortest: (a, b) => (a.episodes || 9999) - (b.episodes || 9999),
    longest: (a, b) => (b.episodes || 0) - (a.episodes || 0),
  }[sort];
  return by ? [...items].sort(by) : items;
}

let lastList = { key: "", at: 0, items: [], rerank: false };
const LIST_TTL_MS = 120_000;

async function orderedItems(state, catalog, { text, chip, site, sort, tags, without, offset }, scoreFor) {
  const key = JSON.stringify([text, chip, site, sort, tags, without, catalog.updatedAt, state.settings.hideWatched, state.settings.favorNamed]);
  if (offset > 0 && lastList.key === key && Date.now() - lastList.at < LIST_TTL_MS) return lastList;
  const forYou = forYouIdsFor(state, catalog, scoreFor);
  const skip = text ? [...new Set([...without, ...parseQuery(text).without])] : without;
  const pool = (await collectSearchItems(state, catalog, text, chip, offset === 0)).filter((item) => hasTags(state, item, tags, skip));
  let items;
  let rerank = false;
  if (text) {
    const ranked = rankPool(state, catalog, pool, text, { scoreFor, limit: 2000, site });
    items = ranked.map((entry) => entry.doc.item);
    const parsed = parseQuery(text);
    const words = text.split(/\s+/).filter(Boolean).length;
    rerank = sort === "relevance" && ranked.length >= 3 && (hasIntent(parsed) || (words >= 3 && (ranked[0]?.close || 0) < 0.9));
  } else {
    items = [...pool].sort((a, b) => Number(forYou.has(b.id)) - Number(forYou.has(a.id)) || scoreFor(b) - scoreFor(a));
  }
  lastList = { key, at: Date.now(), items: sortItems(state, items, sort), rerank };
  return lastList;
}

export async function catalogSearch(query, chip, site = "", options = {}) {
  const state = await loadState();
  const catalog = await loadCatalog();
  const text = String(query || "").trim();
  const sort = ["popular", "score", "newest", "title", "shortest", "longest"].includes(options.sort) ? options.sort : "relevance";
  const tags = cleanTags(options.tags);
  const without = cleanTags(options.without);
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  const limit = Math.min(60, Math.max(1, Math.floor(Number(options.limit) || PAGE_SIZE)));
  const { weights, scoreFor } = tasteRank(state);
  if (!text && !CATALOG_CHIPS.has(chip) && !tags.length && !without.length && sort === "relevance" && !options.browse) {
    const byId = new Map([...catalog.items, ...catalog.newest].map((item) => [item.id, item]));
    const sections = buildHomeSections(
      {
        ...catalog,
        items: withoutAvoids(state, catalog.items),
        newest: withoutAvoids(state, catalog.newest),
        continueItems: withoutAvoids(state, continueFromCatalog(state, catalog)),
      },
      (id) => (byId.has(id) ? statusFor(state, byId.get(id)) : "unwatched"),
      Boolean(state.settings.hideWatched),
      scoreFor,
    );
    return {
      results: [],
      sections: sections.map((section) => {
        const matches = section.title === "For you" ? tasteMatches(section.items, scoreFor) : null;
        return {
          title: section.title,
          rerank: section.title === "For you" && section.items.length >= 3,
          items: section.items.map((item) => (matches ? { ...presentCatalogItem(state, item), match: matches.get(item.id) } : presentCatalogItem(state, item))),
        };
      }),
      note: homeNote(catalog, await currentToken()),
      notice: "",
    };
  }
  const forYou = forYouIdsFor(state, catalog, scoreFor);
  const list = await orderedItems(state, catalog, { text, chip, site, sort, tags, without, offset }, scoreFor);
  const chosen = list.items.slice(offset, offset + limit);
  const total = list.items.length;
  let note = "";
  if (offset === 0) {
    note = !total ? "No matches." : chip === "new" && !text ? "Newly added on Crunchyroll." : "";
    if (!catalog.items.length) note = homeNote(catalog, await currentToken());
    else if (!total && !catalog.complete) note = `No matches yet. The catalog is still loading (${catalog.items.length} titles so far).`;
    if (text) note = avoidedTitleNote(state, catalog, text, scoreFor) || note;
  }
  return {
    results: chosen.map((item) => presentResult(state, item, forYou, weights)),
    total,
    offset,
    hasMore: offset + chosen.length < total,
    rerank: offset === 0 && list.rerank,
    note,
    notice: "",
  };
}

export async function catalogSuggest(query, chip, site = "") {
  const text = String(query || "").trim();
  if (!text) return { suggestions: [] };
  const state = await loadState();
  const catalog = await loadCatalog();
  const { weights, scoreFor } = tasteRank(state);
  const forYou = forYouIdsFor(state, catalog, scoreFor);
  const pool = await collectSearchItems(state, catalog, text, chip, false);
  const chosen = rankPool(state, catalog, pool, text, { scoreFor, mode: "title", limit: 6, site }).map((entry) => entry.doc.item);
  return { suggestions: chosen.map((item) => presentSuggestion(state, item, forYou, weights)) };
}

function tasteRequest(weights) {
  const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label]) => label);
  const liked = top(weights.liked);
  const disliked = top(weights.disliked);
  const parts = ["Pick the shows I would most enjoy watching next."];
  if (liked.length) parts.push(`I like ${liked.join(", ")}.`);
  if (disliked.length) parts.push(`I tend to avoid ${disliked.join(", ")}.`);
  return parts.join(" ");
}

function rerankKey(parts) {
  const text = JSON.stringify(parts);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `rerank:${(hash >>> 0).toString(36)}`;
}

async function readRerank(key) {
  try {
    const stored = await chrome.storage.session.get(key);
    return Array.isArray(stored?.[key]?.results) ? stored[key] : null;
  } catch {
    return null;
  }
}

async function writeRerank(key, results, by) {
  try {
    const { rerankKeys = [] } = await chrome.storage.session.get("rerankKeys");
    const keys = [key, ...rerankKeys.filter((entry) => entry !== key)];
    const dropped = keys.splice(RERANK_CACHE_LIMIT);
    if (dropped.length) await chrome.storage.session.remove(dropped);
    await chrome.storage.session.set({ [key]: { results, by, savedAt: Date.now() }, rerankKeys: keys });
  } catch {
    // Session storage can be full or unavailable; the answer still shows.
  }
}

const bareIds = (ids) => [...new Set((ids || []).map((id) => String(id).replace(/^sight:/, "")))];

export async function catalogRerank(query, chip, site, ids, options = {}) {
  const request = String(query || "").trim();
  const state = await loadState();
  if (state.settings.useAi === false) return { results: [], off: true, note: "AI features are off." };
  const catalog = await loadCatalog();
  const byId = new Map([...catalog.items, ...catalog.newest].map((item) => [item.id, item]));
  const rowItems = bareIds(ids).slice(0, PROMPT_CANDIDATES).map((id) => byId.get(id)).filter(Boolean);
  const { weights, scoreFor } = tasteRank(state);
  const reroll = Boolean(options.reroll) && !request;
  let items = rowItems;
  let reset = false;
  if (reroll) {
    ({ items, reset } = rerollItems(state, catalog, scoreFor, new Set(bareIds(options.seen)), new Set(bareIds(options.last))));
  }
  if (items.length < 3) return { results: [], note: reroll ? "No other picks to try. Rate more shows to widen For you." : "Not enough matches for AI to rank." };
  let ask = request;
  let fits;
  let focus = null;
  if (request) {
    const parsed = parseQuery(request);
    if (parsed.setting?.length) {
      const have = new Set(items.map((item) => item.id));
      const extra = rankPool(state, catalog, withoutAvoids(state, catalog.items || []), request, { scoreFor, limit: 60, site })
        .filter((entry) => entry.settingHit && !have.has(entry.doc.id))
        .slice(0, SETTING_EXTRAS)
        .map((entry) => entry.doc.item);
      items = [...items, ...extra];
    }
    focus = [...parsed.setting.flatMap((word) => placeVariants(word) || [word]), ...parsed.terms];
    const scored = rankPool(state, catalog, items, request, { scoreFor, limit: items.length });
    fits = new Map(scored.map((entry) => [entry.doc.id, entry.fit]));
    const named = parsed.similarTo;
    if (named && state.settings.favorNamed !== false) ask = `${request} (Being close to ${named} matters more than the other words.)`;
  } else {
    ask = tasteRequest(weights);
    const scores = items.map((item) => Math.max(0, scoreFor(item)));
    const best = Math.max(1, ...scores);
    fits = new Map(items.map((item, index) => [item.id, 0.35 + 0.5 * (scores[index] / best)]));
  }
  const key = rerankKey([
    request.toLowerCase(),
    chip || "",
    site || "",
    rowItems.map((item) => item.id),
    state.taste,
    catalog.updatedAt,
    remoteSignature(state.settings),
    state.settings.favorNamed !== false,
  ]);
  if (!reroll) {
    const cached = await readRerank(key) || (!request ? await readForYouPicks(key) : null);
    if (cached) return { results: cached.results, by: cached.by || "", cached: true };
  }
  // save: false is the banner's reroll, which must not replace the For you row's cached ranking.
  const save = options.save !== false;
  const flightKey = reroll ? `${key}:reroll${save ? "" : ":banner"}` : key;
  if (rerankInFlight.has(flightKey)) return rerankInFlight.get(flightKey);
  const work = (async () => {
    const candidates = items.map((item) => ({ ...candidateFromCatalogItem(state, item), fit: fits.get(item.id) ?? 0, ...(focus?.length ? { focus } : {}) }));
    const answer = await pickWithModel(state, { candidates, request: ask, chip: chip || null, light: !request });
    if (answer.ok) {
      const results = presentFromModel(candidates, answer.parsed);
      const by = answer.by || "";
      if (!save) return { results, by, reset };
      await writeRerank(key, results, by);
      if (!request) await chrome.storage.local.set({ [FOR_YOU_PICKS_KEY]: { key, results, by, savedAt: Date.now() } }).catch(() => {});
      return { results, by, reset };
    }
    if (answer.downloading) return { results: [], downloading: true, progress: answer.progress, note: answer.note };
    return { results: [], note: answer.note };
  })();
  rerankInFlight.set(flightKey, work);
  try {
    return await work;
  } finally {
    rerankInFlight.delete(flightKey);
  }
}

// The search page's side panel: candidates come from the engine's results for each recent search (shows not yet
// watched, without hard avoids), then AI picks the ones that best connect those searches with the viewer's history.
// With AI off or unavailable, the engine's own blend is shown.
const INSPIRED_PER_SEARCH = 8;
const INSPIRED_SHOWN = 6;
export async function searchInspired(searches, { ai = true, fresh = false } = {}) {
  const queries = cleanSearches(searches);
  const state = await loadState();
  const catalog = await loadCatalog();
  const { scoreFor } = tasteRank(state);
  const pool = withoutAvoids(state, catalog.items || []).filter((item) => ["unwatched", "plan"].includes(statusFor(state, item)));
  const lists = queries.map((query) => rankPool(state, catalog, pool, query, { scoreFor, limit: INSPIRED_PER_SEARCH })
    .map((entry) => ({ ...entry.doc.item, matched: query })));
  if (!lists.some((list) => list.length)) lists.splice(0, lists.length, forYouRanked(state, catalog, scoreFor).slice(0, LIGHT_MODEL_CANDIDATES));
  const items = interleave(lists, LIGHT_MODEL_CANDIDATES);
  const fallback = items.slice(0, INSPIRED_SHOWN).map((item) => ({
    ...presentCatalogItem(state, item),
    reason: item.matched ? `Matches "${item.matched}"` : "Fits your taste",
  }));
  const base = { searches: queries, results: fallback, ai: false };
  if (!ai || state.settings.useAi === false || items.length < 3 || !queries.length) return base;
  const watched = recentlyWatched(activeEntries(state.library));
  const key = rerankKey(["inspired", queries.map((query) => query.toLowerCase()), items.map((item) => item.id), watched, state.taste, catalog.updatedAt, remoteSignature(state.settings)]);
  if (!fresh) {
    const cached = await readRerank(key);
    if (cached) return { ...base, results: cached.results, by: cached.by || "", ai: true, cached: true };
  }
  if (rerankInFlight.has(key)) return rerankInFlight.get(key);
  const work = (async () => {
    const scores = items.map((item) => Math.max(0, scoreFor(item)));
    const best = Math.max(1, ...scores);
    const candidates = items.map((item, index) => ({ ...candidateFromCatalogItem(state, item), fit: 0.35 + 0.5 * (scores[index] / best) }));
    const answer = await pickWithModel(state, { candidates, request: inspiredRequest(queries, watched), light: true });
    if (!answer.ok) return { ...base, note: answer.note, downloading: Boolean(answer.downloading) };
    const results = presentFromModel(candidates, answer.parsed).filter((row) => !row.mention).slice(0, INSPIRED_SHOWN);
    if (results.length < 3) return base;
    await writeRerank(key, results, answer.by || "");
    return { ...base, results, by: answer.by || "", ai: true };
  })();
  rerankInFlight.set(key, work);
  try {
    return await work;
  } finally {
    rerankInFlight.delete(key);
  }
}

const HOME_ROWS_KEY = "crHomeRows";
let homeRowsInFlight = null;

function likedTags(state, weights, limit = 8) {
  const avoids = new Set((state.taste?.hardAvoids || []).map((label) => String(label).toLowerCase()));
  return [...weights.liked.entries()]
    .filter(([label, weight]) => weight > 0 && !avoids.has(label))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label]) => label);
}

async function homeThemes(state, inputs, wantAi) {
  if (wantAi) {
    const prompt = buildHomeRowsPrompt({ profile: compactProfile(state.taste), ...inputs });
    const answer = await askJson(state, {
      ...prompt,
      schema: HOME_ROWS_SCHEMA,
      parse: (text) => parseHomeRows(text, state.taste?.hardAvoids),
    });
    if (answer.ok) return { themes: answer.parsed.rows, by: answer.by || "", ai: true };
  }
  return { themes: fallbackThemes(inputs), by: "", ai: false };
}

// nudge: text the viewer typed to steer the rows. undefined keeps the current one; "" clears it.
export async function homeRows(searches, { ai = true, fresh = false, nudge } = {}) {
  const state = await loadState();
  const catalog = await loadCatalog();
  const { weights, scoreFor } = tasteRank(state);
  const entries = activeEntries(state.library);
  const inputs = {
    liked: likedTags(state, weights),
    watched: recentlyWatched(entries, 6),
    searches: cleanSearches(searches),
  };
  const wantAi = ai && state.settings.useAi !== false;
  const signature = activitySignature({
    taste: state.taste,
    watchedIds: entries.filter((entry) => entry.status === "finished" || entry.status === "in_progress").map((entry) => entry.crSeriesId || entry.title),
    searches: inputs.searches,
    aiKey: wantAi ? remoteSignature(state.settings) || "chrome" : "off",
  });
  let saved = null;
  try {
    saved = (await chrome.storage.local.get(HOME_ROWS_KEY))[HOME_ROWS_KEY] || null;
  } catch {
    saved = null;
  }
  const now = Date.now();
  const typed = nudge !== undefined;
  const kept = saved?.nudge && now < (saved.nudgeUntil || 0) ? saved.nudge : "";
  inputs.nudge = typed ? cleanNudge(nudge) : kept;
  const nudgeUntil = !inputs.nudge ? 0 : typed ? now + HOME_ROWS_TTL_MS : saved.nudgeUntil;
  if (fresh || inputs.nudge !== (saved?.nudge || "") || needsRefresh(saved, signature, now)) {
    if (typed) await homeRowsInFlight?.catch(() => {});
    homeRowsInFlight ||= (async () => {
      const made = await homeThemes(state, inputs, wantAi);
      const record = { ...made, signature, nudge: inputs.nudge, nudgeUntil, createdAt: now, expiresAt: expiryFor({ wantedAi: wantAi, gotAi: made.ai, now }) };
      await chrome.storage.local.set({ [HOME_ROWS_KEY]: record }).catch(() => {});
      return record;
    })().finally(() => { homeRowsInFlight = null; });
    saved = await homeRowsInFlight;
  }
  const pool = withoutAvoids(state, catalog.items || []).filter((item) => ["unwatched", "plan"].includes(statusFor(state, item)));
  const rows = fillThemes(saved.themes, (query) => rankPool(state, catalog, pool, query, { scoreFor, limit: 40 }).map((entry) => entry.doc.item.id));
  return { rows, by: saved.by || "", ai: Boolean(saved.ai), nudge: saved.nudge || "", createdAt: saved.createdAt, expiresAt: saved.expiresAt };
}

const rerankInFlight = new Map();
const FOR_YOU_PICKS_KEY = "crForYouPicks";
const FOR_YOU_PICKS_TTL_MS = 12 * 60 * 60_000;

async function readForYouPicks(key) {
  try {
    const saved = (await chrome.storage.local.get(FOR_YOU_PICKS_KEY))[FOR_YOU_PICKS_KEY];
    if (saved?.key !== key || Date.now() - saved.savedAt > FOR_YOU_PICKS_TTL_MS) return null;
    return Array.isArray(saved.results) ? saved : null;
  } catch {
    return null;
  }
}

