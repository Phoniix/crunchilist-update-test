// Turns "season N, episode M" of a Crunchyroll series into a /watch/ link using Crunchyroll's own season and episode lists.

const ORIGIN = "https://www.crunchyroll.com";

export function seriesUrl(seriesId) {
  return `${ORIGIN}/series/${encodeURIComponent(seriesId)}`;
}

export function watchUrl(episode) {
  if (!episode?.id) return null;
  const slug = String(episode.slug_title || "").replace(/[^a-z0-9-]/gi, "");
  return `${ORIGIN}/watch/${encodeURIComponent(episode.id)}${slug ? `/${slug}` : ""}`;
}

export function seasonsRequest(seriesId, locale = "en-US") {
  return `${ORIGIN}/content/v2/cms/series/${encodeURIComponent(seriesId)}/seasons?locale=${encodeURIComponent(locale)}`;
}

export function episodesRequest(seasonId, locale = "en-US") {
  return `${ORIGIN}/content/v2/cms/seasons/${encodeURIComponent(seasonId)}/episodes?locale=${encodeURIComponent(locale)}`;
}

const DUB_TITLE = /\((?:[a-z -]+ )?dub\)|\bdub(?:bed)?\b/i;

// Older shows list every dub as its own season. Keep one per season number, preferring the original audio.
export function mainSeasons(payload) {
  const rows = (payload?.data || []).filter((season) => season?.id);
  const groups = new Map();
  for (const season of rows) {
    const key = Number(season.season_sequence_number ?? season.season_number ?? 0);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(season);
  }
  const score = (season) => (season.audio_locale === "ja-JP" ? 4 : 0)
    + ((season.versions || []).some((version) => version.original && version.guid === season.id) ? 2 : 0)
    + (DUB_TITLE.test(season.title || "") ? -3 : 0)
    + (season.is_subbed ? 1 : 0);
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, group]) => group.sort((a, b) => score(b) - score(a))[0]);
}

export function episodeCount(season) {
  const count = Number(season?.number_of_episodes);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function findEpisode(payload, number) {
  const rows = (payload?.data || []).filter((episode) => episode?.id);
  return rows.find((episode) => Number(episode.episode_number) === number)
    || rows.find((episode) => Number(episode.sequence_number) === number)
    || null;
}

// Some shows (One Piece) keep counting across Crunchyroll seasons. Guess which season holds an absolute episode number.
export function seasonForAbsolute(seasons, number) {
  let seen = 0;
  for (let index = 0; index < seasons.length; index += 1) {
    const count = episodeCount(seasons[index]);
    if (!count) return null;
    if (number <= seen + count) return { index, offset: number - seen };
    seen += count;
  }
  return null;
}

// Every episode of one fetched season list, by episode number, so later Plays can skip the lookup.
export function seasonLinks(payload) {
  const links = {};
  for (const row of payload?.data || []) {
    const number = Number(row?.episode_number ?? row?.sequence_number);
    const url = watchUrl(row);
    if (Number.isInteger(number) && number > 0 && url && !links[number]) links[number] = url;
  }
  return links;
}

const LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LINK_SERIES_MAX = 150;

export function cachedLink(store, { seriesId, season = 0, episode = 1 }, now = Date.now()) {
  const entry = store?.[seriesId];
  if (!entry || now - (entry.at || 0) > LINK_TTL_MS) return null;
  return entry.seasons?.[season]?.[episode] || null;
}

export function rememberLinks(store, seriesId, season, links, now = Date.now()) {
  if (!Object.keys(links || {}).length) return store || {};
  const next = { ...(store || {}) };
  const fresh = next[seriesId] && now - (next[seriesId].at || 0) <= LINK_TTL_MS ? next[seriesId] : { seasons: {} };
  next[seriesId] = { at: now, seasons: { ...fresh.seasons, [season]: { ...(fresh.seasons?.[season] || {}), ...links } } };
  const ids = Object.keys(next);
  if (ids.length > LINK_SERIES_MAX) {
    ids.sort((a, b) => (next[a].at || 0) - (next[b].at || 0)).slice(0, ids.length - LINK_SERIES_MAX).forEach((id) => delete next[id]);
  }
  return next;
}

// fetchJson(url) returns parsed JSON. Returns { url, exact } where exact is false when only the series page was found.
// onSeason(index, payload) sees every episode list fetched along the way.
export async function resolveEpisode(fetchJson, { seriesId, season = 0, episode = 1, locale = "en-US" }, onSeason = () => {}) {
  const fallback = { url: seriesUrl(seriesId), exact: false };
  const number = Math.max(1, Math.floor(Number(episode) || 1));
  const seasons = mainSeasons(await fetchJson(seasonsRequest(seriesId, locale)));
  if (!seasons.length) return fallback;
  const tried = new Set();
  const lookIn = async (index, wanted, position = 0) => {
    const target = seasons[index];
    if (!target) return null;
    const list = await fetchJson(episodesRequest(target.id, locale));
    tried.add(index);
    onSeason(index, list);
    const hit = findEpisode(list, wanted) || (position ? (list?.data || [])[position - 1] || null : null);
    return hit ? watchUrl(hit) : null;
  };
  const index = Math.max(0, Math.floor(Number(season) || 0));
  const inRange = index < seasons.length;
  const direct = await lookIn(inRange ? index : seasons.length - 1, number, inRange ? number : 0);
  if (direct) return { url: direct, exact: true };
  const absolute = seasonForAbsolute(seasons, number);
  if (absolute && !tried.has(absolute.index)) {
    const url = await lookIn(absolute.index, number, absolute.offset);
    if (url) return { url, exact: true };
  }
  return fallback;
}
