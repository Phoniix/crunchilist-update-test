import { cacheKeyForSeries, readCache } from "./anilist.js";
import { displayPoster } from "./catalog.js";
import { activeEntries } from "./library.js";
import { seasonChain } from "./seasons.js";

export const APP_STATUS = { in_progress: "watching", plan: "plan", finished: "finished", dropped: "dropped" };
export const LIBRARY_STATUS = { watching: "in_progress", plan: "plan", finished: "finished", dropped: "dropped" };

function clip(text, max) {
  const clean = String(text || "").replace(/\s*\(Source:[^)]*\)\s*$/i, "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.lastIndexOf(" ", max);
  return `${clean.slice(0, cut > 0 ? cut : max)}…`;
}

function singleSeason(show) {
  return [{
    anilistId: show.anilistId,
    label: show.type === "movie" ? "Movie" : "Season 1",
    title: show.title,
    format: show.type === "movie" ? "MOVIE" : show.format || "TV",
    episodes: show.episodes,
    year: show.year,
    season: show.season,
    status: show.status,
    score: show.score,
    cover: show.cover,
  }];
}

function withSeasons(show, nodes, catalogIds) {
  const chain = show.anilistId ? seasonChain(show.anilistId, nodes, catalogIds) : [];
  const seasons = chain.length ? chain.map((season) => (season.anilistId === show.anilistId
    ? { ...season, episodes: season.episodes || show.episodes || null, cover: season.cover || show.cover }
    : season)) : singleSeason(show);
  return { ...show, seasons };
}

// One Prism show per Crunchyroll catalog title (popular order first), plus listed shows Crunchyroll doesn't carry.
export function buildAppShows({ catalog, cache, media = {}, library = {}, now = Date.now() }) {
  const nodes = media || {};
  const seen = new Set();
  const newest = new Set((catalog?.newest || []).map((item) => item.id));
  const rows = [...(catalog?.items || []), ...(catalog?.newest || [])].filter((item) => item?.id && !seen.has(item.id) && seen.add(item.id));
  const hits = new Map(rows.map((item) => {
    const hit = readCache(cache, cacheKeyForSeries(item.id), now);
    return [item.id, hit?.kind === "hit" ? hit : null];
  }));
  const catalogIds = new Set(rows.map((item) => hits.get(item.id)?.anilistId || item.anilistId).filter(Boolean));
  const shows = rows.map((item, rank) => {
    const hit = hits.get(item.id);
    const anilistId = hit?.anilistId || item.anilistId || null;
    const node = (anilistId && nodes[anilistId]) || {};
    return withSeasons({
      id: item.id,
      anilistId,
      title: item.title || hit?.titles?.english || hit?.titles?.romaji || "",
      romaji: hit?.titles?.romaji || "",
      native: hit?.titles?.native || "",
      genres: hit?.genres || [],
      tags: (hit?.tags || []).slice(0, 10),
      about: clip(hit?.about, 900),
      year: hit?.year || node.year || null,
      season: hit?.season || node.season || null,
      score: hit?.score ?? node.score ?? null,
      popularity: hit?.popularity ?? null,
      episodes: hit?.episodes ?? item.episodes ?? null,
      duration: hit?.duration ?? node.duration ?? null,
      studio: node.studio || "",
      status: hit?.releaseStatus || node.status || null,
      format: hit?.format || node.format || null,
      type: item.type,
      cover: hit?.cover || node.cover || displayPoster(item),
      banner: hit?.banner || node.banner || "",
      color: hit?.color || node.color || "",
      trailer: node.trailer || "",
      airing: node.airing || null,
      url: item.url,
      rank,
      fresh: newest.has(item.id),
      onCrunchyroll: true,
    }, nodes, catalogIds);
  });
  const chained = new Set(shows.flatMap((show) => show.seasons.map((season) => season.anilistId)).filter(Boolean));
  for (const entry of activeEntries(library)) {
    if (!entry.anilistId || entry.crSeriesId || chained.has(entry.anilistId)) continue;
    const node = nodes[entry.anilistId] || {};
    const labels = entry.labels || [];
    const genres = node.genres?.length ? node.genres : [];
    const show = withSeasons({
      id: `al-${entry.anilistId}`,
      anilistId: entry.anilistId,
      title: entry.title || node.title || "",
      romaji: node.romaji || "",
      native: node.native || "",
      genres,
      tags: labels.filter((label) => !genres.includes(label)).slice(0, 10),
      about: clip(node.about, 900),
      year: node.year || null,
      season: node.season || null,
      score: node.score ?? null,
      popularity: null,
      episodes: node.episodes ?? entry.episodes ?? null,
      duration: node.duration ?? null,
      studio: node.studio || "",
      status: node.status || null,
      format: node.format || null,
      type: node.format === "MOVIE" ? "movie" : "series",
      cover: node.cover || entry.cover || "",
      banner: node.banner || "",
      color: node.color || "",
      trailer: node.trailer || "",
      airing: node.airing || null,
      url: "",
      rank: shows.length,
      fresh: false,
      onCrunchyroll: false,
      streaming: node.streaming || [],
    }, nodes, catalogIds);
    for (const season of show.seasons) chained.add(season.anilistId);
    shows.push(show);
  }
  return shows;
}

// AniList ids the page needs extras for: every show, plus listed shows Crunchyroll doesn't carry (which also want a description).
export function mediaWanted({ catalog, cache, library = {}, now = Date.now() }) {
  const base = new Set();
  for (const item of [...(catalog?.items || []), ...(catalog?.newest || [])]) {
    const hit = readCache(cache, cacheKeyForSeries(item?.id), now);
    const id = hit?.kind === "hit" ? hit.anilistId : item?.anilistId;
    if (id) base.add(id);
  }
  const catalogIds = new Set(base);
  const offCatalog = new Set();
  for (const entry of activeEntries(library)) {
    if (entry.anilistId && !entry.crSeriesId && !catalogIds.has(entry.anilistId)) {
      base.add(entry.anilistId);
      offCatalog.add(entry.anilistId);
    }
  }
  return { ids: [...base], catalogIds, offCatalog };
}

function seasonEntry(library, show, index) {
  const season = show.seasons[index];
  const direct = season?.anilistId ? library[`anilist:${season.anilistId}`] : null;
  if (direct?.status && !direct.removed) return direct;
  if (index > 0 || !show.onCrunchyroll) return null;
  const crEntry = library[`cr:${show.id}`];
  if (crEntry?.status && !crEntry.removed) return crEntry;
  const chain = new Set(show.seasons.map((row) => row.anilistId).filter(Boolean));
  return activeEntries(library).find((entry) => entry.crSeriesId === show.id && !entry.related && !chain.has(entry.anilistId)) || null;
}

// Prism's per-season view of the library: { [showId]: { at, s: { [seasonIndex]: { status, progress } } } }.
export function libraryMirror(shows, library = {}) {
  const mirror = {};
  for (const show of shows) {
    const s = {};
    show.seasons.forEach((season, index) => {
      const entry = seasonEntry(library, show, index);
      if (!entry) return;
      const status = APP_STATUS[entry.status];
      const episodes = season.episodes || entry.episodes || 0;
      s[index] = { status, progress: status === "finished" && episodes ? episodes : entry.progress || 0 };
    });
    const indexes = Object.keys(s).map(Number);
    if (!indexes.length) continue;
    const active = indexes.filter((index) => s[index].status !== "plan");
    mirror[show.id] = { at: active.length ? Math.max(...active) : Math.min(...indexes), s };
  }
  return mirror;
}

// The page's copy of a change before the background confirms it. Status null clears that season.
export function applySeasonChanges(mirror, showId, changes) {
  const next = { ...mirror };
  const s = { ...(next[showId]?.s || {}) };
  for (const change of changes || []) {
    const index = Number(change?.index) || 0;
    if (change?.status == null) delete s[index];
    else s[index] = { status: change.status, progress: Math.max(0, Number(change.progress) || 0) };
  }
  const indexes = Object.keys(s).map(Number);
  if (!indexes.length) {
    delete next[showId];
    return next;
  }
  const active = indexes.filter((index) => s[index].status !== "plan");
  next[showId] = { at: active.length ? Math.max(...active) : Math.min(...indexes), s };
  return next;
}

// Crunchyroll numbers a show's seasons without its movies, so a season's place on Crunchyroll skips the movies before it.
export function playRequest(show, index, episode) {
  const seasons = show.seasons?.length ? show.seasons : [{ label: "Season 1", format: "TV" }];
  const at = Math.min(Math.max(0, Number(index) || 0), seasons.length - 1);
  return {
    seriesId: show.id,
    season: seasons.slice(0, at).filter((season) => season.format !== "MOVIE").length,
    episode: Math.max(1, Math.floor(Number(episode) || 1)),
    title: show.title,
    seasonLabel: seasons.length > 1 ? seasons[at].label : "",
  };
}

// What to save for a season: the AniList entry for that season, linked to the Crunchyroll show it belongs to.
export function seasonTarget(show, index) {
  const season = show.seasons[index];
  if (!season) throw new Error("Unknown season");
  return {
    anilistId: season.anilistId || null,
    crSeriesId: show.onCrunchyroll ? show.id : null,
    title: index > 0 ? season.title || `${show.title} ${season.label}` : show.title,
    cover: season.cover || show.cover,
    labels: [...show.genres, ...show.tags],
    episodes: season.episodes || null,
    exact: index > 0,
    related: index > 0,
  };
}
