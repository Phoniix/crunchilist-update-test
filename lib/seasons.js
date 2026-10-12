import { plainAbout } from "./anilist.js";

export const MEDIA_KEY = "alMedia";
export const EXTRAS_BATCH = 50;
export const CHAIN_DEPTH = 8;
const SEASON_FORMATS = new Set(["TV", "TV_SHORT", "ONA", "MOVIE"]);
const DAY = 24 * 60 * 60 * 1000;
const SETTLED_TTL = 30 * DAY;
const LIVE_TTL = DAY;

export const EXTRAS_QUERY = `query ($ids: [Int]) { Page(perPage: ${EXTRAS_BATCH}) { media(id_in: $ids, type: ANIME) {
  id format episodes duration season seasonYear status averageScore genres
  title { english romaji native } coverImage { large color } bannerImage description(asHtml: false)
  trailer { id site } studios(isMain: true) { nodes { name } } nextAiringEpisode { airingAt episode }
  externalLinks { site url type }
  relations { edges { relationType node { id type format } } } } } }`;

function whole(value) {
  return Number.isInteger(value) ? value : null;
}

function httpsUrl(value) {
  return typeof value === "string" && value.startsWith("https://") ? value.slice(0, 400) : "";
}

function linked(media, type) {
  return (media.relations?.edges || [])
    .filter((edge) => edge?.relationType === type && edge.node?.type === "ANIME" && SEASON_FORMATS.has(edge.node.format) && edge.node.id)
    .sort((a, b) => (a.node.format === "MOVIE") - (b.node.format === "MOVIE"))
    .map((edge) => edge.node.id);
}

// The full description is only kept for shows Crunchyroll doesn't carry, since catalog shows already have it.
export function mediaNode(media, now, { keepAbout = false } = {}) {
  const trailer = media.trailer?.site === "youtube" && /^[\w-]{6,20}$/.test(media.trailer.id || "") ? media.trailer.id : "";
  const next = media.nextAiringEpisode;
  return {
    id: media.id,
    format: media.format || null,
    episodes: whole(media.episodes),
    duration: whole(media.duration),
    season: media.season || null,
    year: whole(media.seasonYear),
    status: media.status || null,
    score: whole(media.averageScore),
    genres: (media.genres || []).slice(0, 8),
    title: media.title?.english || media.title?.romaji || "",
    romaji: media.title?.romaji || "",
    native: media.title?.native || "",
    cover: httpsUrl(media.coverImage?.large),
    color: typeof media.coverImage?.color === "string" ? media.coverImage.color : "",
    banner: httpsUrl(media.bannerImage),
    about: keepAbout ? plainAbout(media.description) : "",
    trailer,
    studio: String(media.studios?.nodes?.[0]?.name || "").slice(0, 80),
    airing: next && whole(next.airingAt) && whole(next.episode) ? { at: next.airingAt, episode: next.episode } : null,
    streaming: (media.externalLinks || [])
      .filter((link) => link?.type === "STREAMING" && httpsUrl(link.url))
      .slice(0, 4)
      .map((link) => ({ site: String(link.site || "").slice(0, 40), url: httpsUrl(link.url) })),
    sequels: linked(media, "SEQUEL"),
    prequels: linked(media, "PREQUEL"),
    fetchedAt: now,
  };
}

// AniList can drop an id (merged or removed entries); remembering that stops it being asked for again every run.
export function missingNode(id, now) {
  return { id, missing: true, fetchedAt: now };
}

export function keepReachable(nodes, baseIds, catalogIds) {
  const keep = new Set(baseIds);
  for (const id of baseIds) for (const season of seasonChain(id, nodes, catalogIds)) keep.add(season.anilistId);
  return Object.fromEntries(Object.entries(nodes).filter(([id, node]) => keep.has(Number(id)) || node?.missing));
}

// Airing shows change every week, so they refresh daily; finished ones monthly.
export function nodeStale(node, now) {
  if (!node?.fetchedAt) return true;
  const live = node.status === "RELEASING" || node.status === "NOT_YET_RELEASED";
  if (node.airing && node.airing.at * 1000 < now) return true;
  return now - node.fetchedAt > (live ? LIVE_TTL : SETTLED_TTL);
}

function walk(baseId, nodes, catalogIds, type, visit) {
  const seen = new Set([baseId]);
  const yearOf = (id) => nodes[id]?.year;
  const inOrder = (at, id) => !yearOf(at) || !yearOf(id) || (type === "prequels" ? yearOf(id) <= yearOf(at) : yearOf(id) >= yearOf(at));
  let at = baseId;
  const out = [];
  while (out.length < CHAIN_DEPTH) {
    const options = (nodes[at]?.[type] || []).filter((id) => !seen.has(id) && !catalogIds.has(id));
    visit?.(options);
    const step = options.find((id) => nodes[id] && !nodes[id].missing && inOrder(at, id));
    if (!step) break;
    seen.add(step);
    out.push(step);
    at = step;
  }
  return out;
}

// Season entries Crunchyroll lists as their own show stay separate, so the chain stops at them.
export function seasonChain(baseId, nodes, catalogIds) {
  if (!baseId || !nodes[baseId] || nodes[baseId].missing) return [];
  const ids = [...walk(baseId, nodes, catalogIds, "prequels").reverse(), baseId, ...walk(baseId, nodes, catalogIds, "sequels")];
  const films = ids.filter((id) => nodes[id]?.format === "MOVIE").length;
  let number = 0;
  let film = 0;
  return ids.map((id) => {
    const row = nodes[id];
    const movie = row.format === "MOVIE";
    if (movie) film += 1;
    else number += 1;
    return {
      anilistId: id,
      label: movie ? (films > 1 ? `Movie ${film}` : "Movie") : `Season ${number}`,
      title: row.title || "",
      format: row.format || "TV",
      episodes: row.episodes,
      year: row.year,
      season: row.season,
      status: row.status,
      score: row.score,
      cover: row.cover,
    };
  });
}

// Ids still to fetch: the given shows themselves, then the next unknown link along each season chain.
export function extrasFrontier(baseIds, nodes, catalogIds, now) {
  const want = new Set();
  for (const id of baseIds) {
    if (!id) continue;
    if (nodeStale(nodes[id], now)) {
      want.add(id);
      continue;
    }
    for (const type of ["prequels", "sequels"]) {
      walk(id, nodes, catalogIds, type, (options) => {
        for (const other of options) if (nodeStale(nodes[other], now)) want.add(other);
      });
    }
  }
  return [...want];
}
