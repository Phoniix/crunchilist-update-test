import { pickMatch, searchableTitle } from "./title-match.js";
import { isGenericSeasonTitle } from "./text.js";

export const MISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const CATALOG_MATCH_BATCH = 4;
export const DETAIL_BATCH = 5;
export const DETAIL_VERSION = 3;

const MEDIA_DETAIL_FIELDS = [
  "id",
  "idMal",
  "title { romaji english native }",
  "format",
  "status",
  "description(asHtml: false)",
  "startDate { year month day }",
  "endDate { year month day }",
  "season",
  "seasonYear",
  "episodes",
  "duration",
  "countryOfOrigin",
  "isLicensed",
  "source",
  "hashtag",
  "coverImage { extraLarge large medium color }",
  "bannerImage",
  "genres",
  "synonyms",
  "averageScore",
  "meanScore",
  "popularity",
  "favourites",
  "trending",
  "isAdult",
  "siteUrl",
  "tags { name category rank isGeneralSpoiler isMediaSpoiler }",
  "relations { edges { relationType node { id format title { romaji english } } } }",
  "rankings { rank type format year season allTime context }",
].join(" ");

const FRANCHISE_RELATIONS = new Set(["PREQUEL", "SEQUEL", "PARENT", "SIDE_STORY"]);

export const SEARCH_QUERY = `
query ($search: String) {
  Page(page: 1, perPage: 5) {
    media(search: $search, type: ANIME) {
      id
      format
      episodes
      title { romaji english native }
      synonyms
      genres
      tags { name rank isMediaSpoiler isGeneralSpoiler }
      relations { edges { relationType node { id } } }
      coverImage { large }
    }
  }
}`;

export const LIST_QUERY = `
query ($userName: String) {
  MediaListCollection(userName: $userName, type: ANIME) {
    user { avatar { medium } }
    lists {
      entries {
        id
        status
        progress
        score(format: POINT_100)
        media {
          id
          format
          episodes
          title { romaji english native }
          synonyms
          genres
          tags { name rank isMediaSpoiler isGeneralSpoiler }
          relations { edges { relationType node { id } } }
          coverImage { large }
        }
      }
    }
  }
}`;

export function safeAvatar(url) {
  const value = String(url || "");
  return /^https:\/\/([a-z0-9-]+\.)?anilist\.co\/[^\s"'<>]+$/i.test(value) ? value.slice(0, 300) : "";
}

export function listAvatar(payload) {
  return safeAvatar(payload?.data?.MediaListCollection?.user?.avatar?.medium);
}

export const STATUS_MAP = {
  COMPLETED: "finished",
  CURRENT: "in_progress",
  DROPPED: "dropped",
  PAUSED: "in_progress",
  PLANNING: "plan",
  REPEATING: "in_progress",
};

const STATUS_TO_ANILIST = {
  finished: "COMPLETED",
  in_progress: "CURRENT",
  dropped: "DROPPED",
  plan: "PLANNING",
};

export const VIEWER_QUERY = `
query {
  Viewer { id name }
}`;

export const SAVE_ENTRY_MUTATION = `
mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int) {
  SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress) {
    id
    status
    progress
  }
}`;

export const DELETE_ENTRY_MUTATION = `
mutation ($id: Int) {
  DeleteMediaListEntry(id: $id) { deleted }
}`;

export const MEDIA_LIST_QUERY = `
query ($mediaId: Int, $userId: Int) {
  MediaList(mediaId: $mediaId, userId: $userId) { id status progress }
}`;

export function mapListStatus(status) {
  return STATUS_MAP[status] || null;
}

export function toAnilistStatus(status) {
  return STATUS_TO_ANILIST[status] || null;
}

export function anilistAuthUrl(clientId, redirectUri) {
  const url = new URL("https://anilist.co/api/v2/oauth/authorize");
  url.searchParams.set("client_id", String(clientId));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export function parseCodeRedirect(redirectedUrl) {
  let url;
  try {
    url = new URL(String(redirectedUrl || ""));
  } catch {
    return { error: "AniList did not return a sign-in code." };
  }
  const error = url.searchParams.get("error");
  if (error) return { error: url.searchParams.get("error_description") || error };
  const code = url.searchParams.get("code") || "";
  if (!code) return { error: "AniList did not return a sign-in code." };
  return { code };
}

export function anilistTokenBody(clientId, clientSecret, redirectUri, code) {
  return {
    grant_type: "authorization_code",
    client_id: String(clientId),
    client_secret: String(clientSecret),
    redirect_uri: redirectUri,
    code: String(code),
  };
}

export function franchiseKeyFromMedia(media) {
  const ids = [media.id];
  for (const edge of media.relations?.edges || []) {
    if (FRANCHISE_RELATIONS.has(edge.relationType) && edge.node?.id) ids.push(edge.node.id);
  }
  return `al:${Math.min(...ids)}`;
}

export function cacheKeyForSeason(seriesId, seasonSlug) {
  return `season:${seriesId}|${seasonSlug}`;
}

export function cacheKeyForSeries(seriesId) {
  return `series:${seriesId}`;
}

export function readCache(cache, key, now) {
  const row = cache?.[key];
  if (!row) return null;
  if (row.kind === "miss" && row.expiresAt <= now) return null;
  return row;
}

export function missEntry(now) {
  return { kind: "miss", cachedAt: now, expiresAt: now + MISS_TTL_MS };
}

function usableTags(media) {
  return (media.tags || [])
    .filter((tag) => tag && !tag.isMediaSpoiler && !tag.isGeneralSpoiler && (tag.rank == null || tag.rank >= 40))
    .map((tag) => tag.name)
    .filter(Boolean)
    .slice(0, 15);
}

function hiddenTags(media) {
  return (media.tags || [])
    .filter((tag) => tag && (tag.isMediaSpoiler || tag.isGeneralSpoiler) && (tag.rank == null || tag.rank >= 60))
    .map((tag) => tag.name)
    .filter(Boolean)
    .slice(0, 6);
}

function tagRanks(media) {
  const ranks = {};
  for (const tag of media.tags || []) {
    if (tag?.name && Number.isInteger(tag.rank)) ranks[tag.name] = tag.rank;
  }
  return ranks;
}

function whole(value) {
  return Number.isInteger(value) ? value : null;
}

function httpsUrl(value) {
  return typeof value === "string" && value.startsWith("https://") ? value : "";
}

function fuzzyDate(date) {
  if (!whole(date?.year)) return null;
  return {
    year: date.year,
    month: whole(date.month),
    day: whole(date.day),
  };
}

export function plainAbout(value) {
  const text = String(value || "")
    .replace(/~![\s\S]*?!~/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 1200);
}

export function coverFromMedia(media) {
  const source = media?.coverImage?.large || media?.coverImage?.extraLarge || media?.coverImage?.medium || "";
  return typeof source === "string" && source.startsWith("https://") ? source : "";
}

export function mediaToCacheHit(media, now) {
  const started = fuzzyDate(media.startDate);
  return {
    kind: "hit",
    anilistId: media.id,
    idMal: whole(media.idMal),
    cover: coverFromMedia(media),
    banner: httpsUrl(media.bannerImage),
    color: typeof media.coverImage?.color === "string" ? media.coverImage.color : "",
    titles: media.title || {},
    synonyms: media.synonyms || [],
    tags: usableTags(media),
    hiddenTags: hiddenTags(media),
    tagRanks: tagRanks(media),
    genres: media.genres || [],
    episodes: media.episodes ?? null,
    format: media.format || null,
    releaseStatus: media.status || null,
    about: plainAbout(media.description),
    started,
    ended: fuzzyDate(media.endDate),
    year: started?.year || whole(media.seasonYear),
    season: media.season || null,
    seasonYear: whole(media.seasonYear),
    duration: whole(media.duration),
    country: media.countryOfOrigin || null,
    source: media.source || null,
    licensed: typeof media.isLicensed === "boolean" ? media.isLicensed : null,
    hashtag: typeof media.hashtag === "string" ? media.hashtag.slice(0, 80) : "",
    score: whole(media.averageScore),
    meanScore: whole(media.meanScore),
    popularity: whole(media.popularity),
    favourites: whole(media.favourites),
    trending: whole(media.trending),
    adult: media.isAdult === true,
    siteUrl: httpsUrl(media.siteUrl),
    rankings: (media.rankings || []).filter((row) => row?.rank).slice(0, 8).map((row) => ({
      rank: row.rank,
      type: row.type || null,
      format: row.format || null,
      year: whole(row.year),
      season: row.season || null,
      allTime: Boolean(row.allTime),
      context: typeof row.context === "string" ? row.context.slice(0, 80) : "",
    })),
    relations: (media.relations?.edges || [])
      .filter((edge) => edge?.relationType && edge.node?.id)
      .slice(0, 12)
      .map((edge) => ({
        type: edge.relationType,
        anilistId: edge.node.id,
        title: edge.node.title?.english || edge.node.title?.romaji || "",
      })),
    franchiseKey: franchiseKeyFromMedia(media),
    detailed: Object.prototype.hasOwnProperty.call(media, "description"),
    detailVersion: Object.prototype.hasOwnProperty.call(media, "description") ? DETAIL_VERSION : 0,
    cachedAt: now,
  };
}

export function showFactsFromHit(hit) {
  if (!hit || hit.kind === "miss") return {};
  return {
    duration: hit.duration ?? null,
    year: hit.year ?? null,
    season: hit.season || null,
    source: hit.source || null,
    score: hit.score ?? null,
    releaseStatus: hit.releaseStatus || null,
    country: hit.country || null,
    about: hit.about || "",
    continues: (hit.relations || []).some((edge) => edge.type === "PREQUEL"),
    hasSequel: (hit.relations || []).some((edge) => edge.type === "SEQUEL"),
  };
}

export function searchPlan(record) {
  const seasonTitle = record.seasonTitle || "";
  const seriesTitle = record.seriesTitle || "";
  if (seasonTitle && !isGenericSeasonTitle(seasonTitle)) {
    return { search: seasonTitle, matchTitle: seasonTitle };
  }
  if (seriesTitle && record.seasonNumber) {
    const query = `${seriesTitle} Season ${record.seasonNumber}`;
    return { search: query, matchTitle: query };
  }
  const title = seriesTitle || seasonTitle || record.title || "";
  return { search: title, matchTitle: title };
}

export function matchTitleToMedia(title, mediaList, options) {
  return pickMatch(title, mediaList, options);
}

export function flattenListCollection(payload) {
  const lists = payload?.data?.MediaListCollection?.lists || [];
  const byId = new Map();
  for (const list of lists) {
    for (const entry of list.entries || []) {
      const media = entry?.media;
      if (!media?.id) continue;
      const status = mapListStatus(entry.status);
      if (!status) continue;
      byId.set(media.id, {
        anilistId: media.id,
        listId: entry.id ?? null,
        status,
        progress: entry.progress ?? null,
        score: Number(entry.score) > 0 ? Number(entry.score) : null,
        media,
      });
    }
  }
  return [...byId.values()];
}

export function queriesForObservation(state, observation, now) {
  const queries = [];
  const seen = new Set();

  function push(item) {
    if (!item.search || !item.cacheKey || seen.has(item.cacheKey)) return;
    if (readCache(state.anilistCache, item.cacheKey, now)) return;
    seen.add(item.cacheKey);
    queries.push(item);
  }

  for (const season of observation?.seasons || []) {
    const plan = searchPlan(season);
    push({
      cacheKey: cacheKeyForSeason(season.seriesId, season.seasonSlug),
      seasonKey: `${season.seriesId}|${season.seasonSlug}`,
      search: plan.search,
      matchTitle: plan.matchTitle,
    });
  }

  for (const sighting of observation?.sightings || []) {
    const hasSeason = (observation.seasons || []).some((season) => season.seriesId === sighting.seriesId);
    if (hasSeason) continue;
    push({
      cacheKey: cacheKeyForSeries(sighting.seriesId),
      seriesId: sighting.seriesId,
      search: sighting.title,
      matchTitle: sighting.title,
    });
  }

  return queries;
}

export function catalogMatchQuery(count) {
  const variables = [];
  const fields = [];
  for (let index = 0; index < count; index += 1) {
    variables.push(`$s${index}: String`);
    fields.push(`p${index}: Page(page: 1, perPage: 5) { media(search: $s${index}, type: ANIME) { id format episodes popularity seasonYear startDate { year } title { romaji english native } synonyms genres tags { name rank isMediaSpoiler isGeneralSpoiler } coverImage { large } } }`);
  }
  return `query (${variables.join(", ")}) {\n${fields.join("\n")}\n}`;
}

export function catalogMatchVariables(titles) {
  const variables = {};
  titles.forEach((title, index) => {
    variables[`s${index}`] = searchableTitle(title).slice(0, 120);
  });
  return variables;
}

export function mediaDetailQuery(count) {
  const variables = [];
  const fields = [];
  for (let index = 0; index < count; index += 1) {
    variables.push(`$id${index}: Int`);
    fields.push(`m${index}: Media(id: $id${index}) { ${MEDIA_DETAIL_FIELDS} }`);
  }
  return `query (${variables.join(", ")}) {\n${fields.join("\n")}\n}`;
}

export function mediaDetailVariables(items) {
  const variables = {};
  items.forEach((item, index) => {
    variables[`id${index}`] = item.anilistId;
  });
  return variables;
}

export function titlesNeedingDetail(items, cache, now) {
  const seen = new Set();
  const pending = [];
  for (const item of items || []) {
    if (!item?.id || seen.has(item.id)) continue;
    const cached = readCache(cache, cacheKeyForSeries(item.id), now);
    if (cached?.kind !== "hit" || !cached.anilistId) continue;
    if (cached.detailed && (cached.detailVersion || 1) >= DETAIL_VERSION) continue;
    seen.add(item.id);
    pending.push({ id: item.id, anilistId: cached.anilistId });
  }
  return pending;
}

export function applyMediaDetails(items, payload, now, cache) {
  const updates = {};
  items.forEach((item, index) => {
    const key = cacheKeyForSeries(item.id);
    const previous = cache?.[key];
    const media = payload?.data?.[`m${index}`];
    if (!media?.id) {
      if (previous?.kind === "hit") updates[key] = { ...previous, detailed: true, detailVersion: DETAIL_VERSION };
      return;
    }
    const hit = mediaToCacheHit(media, now);
    updates[key] = { ...(previous?.kind === "hit" ? previous : {}), ...hit, detailed: true, detailVersion: DETAIL_VERSION };
  });
  return updates;
}

export function titlesNeedingAnilist(items, cache, now) {
  const seen = new Set();
  const pending = [];
  for (const item of items || []) {
    if (!item?.id || !item.title || seen.has(item.id) || item.cover) continue;
    const cached = readCache(cache, cacheKeyForSeries(item.id), now);
    if (cached?.kind === "miss") continue;
    if (cached?.kind === "hit" && cached.cover) continue;
    seen.add(item.id);
    pending.push(item);
  }
  return pending;
}

export function localCoverStamps(items, state, now) {
  const mediaList = Object.values(state?.imports || {}).map((entry) => entry.media).filter(Boolean);
  const cacheUpdates = {};
  const stamps = {};
  for (const item of items || []) {
    if (!item?.id || item.cover) continue;
    const key = cacheKeyForSeries(item.id);
    const cached = readCache(state?.anilistCache, key, now);
    if (cached?.kind === "hit" && cached.cover) {
      stamps[item.id] = { anilistId: cached.anilistId, cover: cached.cover };
      continue;
    }
    if (cached) continue;
    const match = matchTitleToMedia(item.title, mediaList);
    if (match.confidence !== "high") continue;
    const cover = coverFromMedia(match.media);
    if (!cover) continue;
    cacheUpdates[key] = mediaToCacheHit(match.media, now);
    stamps[item.id] = { anilistId: match.media.id, cover };
  }
  return { cacheUpdates, stamps };
}

export function matchesFromBatch(items, payload, now) {
  const cacheUpdates = {};
  const stamps = {};
  items.forEach((item, index) => {
    const page = payload?.data?.[`p${index}`];
    if (!page) return;
    const match = matchTitleToMedia(item.title, page.media || [], { kind: item.type === "movie" ? "movie" : "series" });
    const key = cacheKeyForSeries(item.id);
    if (match.confidence !== "high") {
      cacheUpdates[key] = missEntry(now);
      return;
    }
    const hit = mediaToCacheHit(match.media, now);
    cacheUpdates[key] = hit;
    if (hit.cover) stamps[item.id] = { anilistId: hit.anilistId, cover: hit.cover };
  });
  return { cacheUpdates, stamps };
}

export function dropUnusedSeriesCache(cache, seriesIds) {
  const keep = seriesIds instanceof Set ? seriesIds : new Set(seriesIds || []);
  const next = { ...(cache || {}) };
  for (const key of Object.keys(next)) {
    if (!key.startsWith("series:")) continue;
    if (!keep.has(key.slice("series:".length))) delete next[key];
  }
  return next;
}

export function clearSeriesMisses(cache) {
  const next = { ...(cache || {}) };
  for (const [key, row] of Object.entries(next)) {
    if (key.startsWith("series:") && row?.kind === "miss") delete next[key];
  }
  return next;
}

export function clearMisses(cache) {
  const next = { ...cache };
  for (const [key, row] of Object.entries(next)) {
    if (row?.kind === "miss") delete next[key];
  }
  return next;
}
