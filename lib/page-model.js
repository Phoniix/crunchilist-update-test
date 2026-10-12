import { numberOrNull, slugify, uniqueStrings } from "./text.js";

export function seriesIdFromHref(href) {
  if (!href) return null;
  const path = String(href).split("?")[0].split("#")[0];
  const match = path.match(/\/series\/([A-Za-z0-9]+)(?:\/|$)/);
  return match ? match[1] : null;
}

export function pageKindFromPath(pathname) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  const seriesAt = parts.indexOf("series");
  const watchAt = parts.indexOf("watch");
  if (seriesAt >= 0) {
    return {
      kind: "series",
      seriesId: parts[seriesAt + 1] || null,
      slug: parts[seriesAt + 2] || null,
    };
  }
  if (watchAt >= 0) {
    return { kind: "watch", seriesId: null, watchId: parts[watchAt + 1] || null };
  }
  return { kind: "browse", seriesId: null };
}

export function crunchyrollSeriesUrl(seriesId, slug) {
  const suffix = slug ? `/${slug}` : "";
  return `https://www.crunchyroll.com/series/${seriesId}${suffix}`;
}

function asList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
  if (payload.type === "episode" || payload.episode_metadata) return [payload];
  return [];
}

export function parseCmsObjects(payload) {
  const episodes = [];
  for (const item of asList(payload)) {
    if (item?.type && item.type !== "episode" && !item.episode_metadata) continue;
    const meta = item?.episode_metadata || item;
    if (!meta?.series_id) continue;
    const seasonSlug = meta.season_slug_title || (meta.season_id ? `id-${meta.season_id}` : "");
    if (!seasonSlug) continue;
    episodes.push({
      episodeId: item.id || meta.id || null,
      episodeNumber: numberOrNull(meta.episode_number),
      seasonId: meta.season_id || null,
      seasonNumber: numberOrNull(meta.season_number),
      seasonTitle: meta.season_title || "",
      seasonSlug,
      seriesId: meta.series_id,
      seriesSlug: meta.series_slug_title || "",
      seriesTitle: meta.series_title || "",
      audioLocale: meta.audio_locale || "",
      isDubbed: Boolean(meta.is_dubbed),
    });
  }
  return episodes;
}

export function parseCmsSeasons(payload) {
  const seasons = [];
  for (const item of asList(payload)) {
    if (!item?.series_id) continue;
    const seasonSlug = item.slug_title || (item.id ? `id-${item.id}` : "");
    if (!seasonSlug) continue;
    seasons.push({
      seasonId: item.id || null,
      title: item.title || "",
      seasonNumber: numberOrNull(item.season_number),
      seriesId: item.series_id,
      seasonSlug,
      episodeCount: numberOrNull(item.number_of_episodes),
    });
  }
  return seasons;
}

export function episodeNumberFromLabel(text) {
  if (!text) return null;
  const match = String(text).match(/\bE(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

export function episodeCountFromText(text) {
  if (!text) return null;
  const match = String(text).match(/\b(\d+)\s+episodes?\b/i);
  return match ? Number(match[1]) : null;
}

export function audioModeFromLocales(locales, dubbedFlags) {
  const values = (locales || []).map((locale) => String(locale || "").toLowerCase()).filter(Boolean);
  const japanese = values.some((locale) => locale.startsWith("ja"));
  const english = values.some((locale) => locale.startsWith("en"));
  if ((dubbedFlags || []).some(Boolean) && japanese) return "unknown";
  if ((dubbedFlags || []).some(Boolean) && !japanese) return "dub";
  if (japanese && english) return "unknown";
  if (japanese) return "sub";
  if (english) return "dub";
  return "unknown";
}

export function inferAudioMode(audioText, subtitleText) {
  const audio = String(audioText || "");
  const subs = String(subtitleText || "");
  const audioLower = audio.toLowerCase();
  const dub = /\bdub(?:bed)?\b/.test(audioLower) || (/\benglish\b/.test(audioLower) && !/\bjapanese\b/.test(audioLower));
  const sub = /\bsub(?:titled|titles)?\b/.test(audioLower) || /\bjapanese\b/.test(audioLower);
  let mode = "unknown";
  if (sub && dub) mode = "unknown";
  else if (dub) mode = "dub";
  else if (sub) mode = "sub";
  else if (/\benglish\b/.test(subs.toLowerCase()) && !audio) mode = "sub";
  return { mode, audioText: audio, subtitleText: subs };
}

function absoluteUrl(href, seriesId, slug) {
  if (href && /^https?:\/\//i.test(href)) return href.split("?")[0];
  if (href && href.startsWith("/")) return `https://www.crunchyroll.com${href.split("?")[0]}`;
  return crunchyrollSeriesUrl(seriesId, slug || "");
}

export function dedupeAnchors(anchors) {
  const map = new Map();
  for (const anchor of anchors || []) {
    const seriesId = anchor.seriesId || seriesIdFromHref(anchor.href);
    if (!seriesId) continue;
    const title = String(anchor.title || "").replace(/\s+/g, " ").trim();
    const previous = map.get(seriesId);
    if (!previous) {
      map.set(seriesId, {
        seriesId,
        title: title.slice(0, 140),
        href: anchor.href || "",
        url: absoluteUrl(anchor.href, seriesId, ""),
      });
    } else if (!previous.title && title) {
      previous.title = title.slice(0, 140);
    }
  }
  return [...map.values()];
}

export function buildObservation(facts) {
  const kindInfo = facts.kindInfo || pageKindFromPath(facts.pathname || "");
  const kind = facts.kind || kindInfo.kind || "browse";
  const cmsSeriesId = facts.cmsEpisodes?.find((episode) => episode.seriesId)?.seriesId
    || facts.cmsSeasons?.find((season) => season.seriesId)?.seriesId
    || null;
  const seriesId = facts.seriesId || kindInfo.seriesId || (kind === "watch" ? cmsSeriesId : null);
  const inferred = inferAudioMode(facts.audioText, facts.subtitleText);
  const locales = (facts.cmsEpisodes || []).map((episode) => episode.audioLocale);
  const cmsAudio = audioModeFromLocales(locales, (facts.cmsEpisodes || []).map((episode) => episode.isDubbed));
  const audio = inferred.mode !== "unknown" ? inferred.mode : cmsAudio;
  const pageGenres = uniqueStrings(facts.genres || []);
  const seasons = [];
  const seasonIndex = new Map();

  function addSeason(partial) {
    if (!partial.seriesId || !partial.seasonSlug) return null;
    const key = `${partial.seriesId}|${partial.seasonSlug}`;
    let row = seasonIndex.get(key);
    if (!row) {
      row = {
        seriesId: partial.seriesId,
        seasonSlug: partial.seasonSlug,
        seasonId: null,
        seasonNumber: null,
        seasonTitle: "",
        seriesTitle: "",
        seriesSlug: "",
        episodeCount: null,
        url: "",
        audio,
        subtitles: facts.subtitleText || "",
        genres: [],
        watchingEpisode: null,
        movieSignal: Boolean(facts.movieSignal),
      };
      seasonIndex.set(key, row);
      seasons.push(row);
    }
    if (partial.seasonId) row.seasonId = partial.seasonId;
    if (partial.seasonNumber != null) row.seasonNumber = partial.seasonNumber;
    if (partial.seasonTitle) row.seasonTitle = partial.seasonTitle;
    if (partial.seriesTitle) row.seriesTitle = partial.seriesTitle;
    if (partial.seriesSlug) row.seriesSlug = partial.seriesSlug;
    if (partial.episodeCount != null) row.episodeCount = partial.episodeCount;
    if (partial.watchingEpisode != null) row.watchingEpisode = partial.watchingEpisode;
    row.audio = audio;
    row.url = crunchyrollSeriesUrl(row.seriesId, row.seriesSlug);
    if (partial.seriesId === seriesId) row.genres = pageGenres.slice();
    return row;
  }

  for (const season of facts.cmsSeasons || []) addSeason({
    seriesId: season.seriesId,
    seasonSlug: season.seasonSlug,
    seasonId: season.seasonId,
    seasonNumber: season.seasonNumber,
    seasonTitle: season.title,
    episodeCount: season.episodeCount,
    seriesTitle: facts.seriesTitle || "",
    seriesSlug: kindInfo.slug || "",
  });

  for (const episode of facts.cmsEpisodes || []) {
    addSeason({
      seriesId: episode.seriesId,
      seasonSlug: episode.seasonSlug,
      seasonId: episode.seasonId,
      seasonNumber: episode.seasonNumber,
      seasonTitle: episode.seasonTitle,
      seriesTitle: episode.seriesTitle,
      seriesSlug: episode.seriesSlug,
    });
    if (kind === "watch" && facts.watchId && episode.episodeId === facts.watchId && episode.episodeNumber != null) {
      addSeason({
        seriesId: episode.seriesId,
        seasonSlug: episode.seasonSlug,
        watchingEpisode: episode.episodeNumber,
      });
    }
  }

  if ((kind === "series" || kind === "watch") && !seasons.length && seriesId && (facts.seriesTitle || facts.activeSeasonTitle)) {
    addSeason({
      seriesId,
      seasonSlug: `dom-${slugify(facts.activeSeasonTitle || "season") || "season"}`,
      seasonTitle: facts.activeSeasonTitle || "",
      seriesTitle: facts.seriesTitle || "",
      seriesSlug: kindInfo.slug || "",
      episodeCount: facts.domEpisodeCount ?? null,
    });
  }

  if (seasons.length === 1 && facts.domEpisodeCount != null && seasons[0].episodeCount == null) {
    seasons[0].episodeCount = facts.domEpisodeCount;
  }
  if (kind === "watch" && facts.domEpisodeNumber != null && seasons.length === 1 && seasons[0].watchingEpisode == null) {
    seasons[0].watchingEpisode = facts.domEpisodeNumber;
  }

  const sightings = dedupeAnchors(facts.anchors).map((anchor) => ({
    seriesId: anchor.seriesId,
    title: anchor.title,
    url: anchor.url,
    genres: anchor.seriesId === seriesId ? pageGenres.slice() : [],
    audio: anchor.seriesId === seriesId ? audio : "unknown",
  }));

  if (seriesId && (kind === "series" || kind === "watch") && !sightings.some((item) => item.seriesId === seriesId)) {
    const title = facts.seriesTitle || seasons.find((season) => season.seriesId === seriesId)?.seriesTitle || "";
    sightings.push({
      seriesId,
      title,
      url: crunchyrollSeriesUrl(seriesId, kindInfo.slug || seasons[0]?.seriesSlug || ""),
      genres: pageGenres.slice(),
      audio,
    });
  }

  let currentKey = null;
  const ownSeasons = seriesId ? seasons.filter((season) => season.seriesId === seriesId) : seasons;
  if (facts.activeSeasonTitle) {
    const wantSlug = slugify(facts.activeSeasonTitle);
    const wantText = facts.activeSeasonTitle.trim().toLowerCase();
    const found = ownSeasons.find((season) => {
      const title = (season.seasonTitle || "").trim().toLowerCase();
      const loose = wantText.length >= 4 && title && (title.includes(wantText) || wantText.includes(title));
      return slugify(season.seasonTitle) === wantSlug || season.seasonSlug === wantSlug || season.seasonSlug === `dom-${wantSlug}` || loose;
    });
    if (found) currentKey = `${found.seriesId}|${found.seasonSlug}`;
  }
  if (!currentKey) {
    const watching = seasons.find((season) => season.watchingEpisode != null);
    if (watching) currentKey = `${watching.seriesId}|${watching.seasonSlug}`;
  }
  if (!currentKey && ownSeasons.length === 1) currentKey = `${ownSeasons[0].seriesId}|${ownSeasons[0].seasonSlug}`;
  if (!currentKey && kind === "watch" && seasons[0]) currentKey = `${seasons[0].seriesId}|${seasons[0].seasonSlug}`;

  return {
    kind,
    url: facts.pageUrl || "",
    seriesId,
    watchId: facts.watchId || kindInfo.watchId || null,
    seasons,
    sightings,
    currentKey,
    audio,
  };
}

export function parseAnchorSnippets(html) {
  const anchors = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const attrs = match[1];
    const hrefMatch = attrs.match(/href="([^"]+)"/i);
    if (!hrefMatch || !hrefMatch[1].includes("/series/")) continue;
    const body = match[2];
    const alt = body.match(/alt="([^"]+)"/i);
    const heading = body.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const title = (alt?.[1] || heading?.[1] || body.replace(/<[^>]+>/g, " ") || "").replace(/\s+/g, " ").trim();
    anchors.push({ href: hrefMatch[1], title });
  }
  return anchors;
}
