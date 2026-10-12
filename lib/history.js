import { setEntryProgress, setEntryStatus } from "./library.js";

export { historyItems, historyProgress, historySearches, matchHistory } from "./history-match.js";

export const HISTORY_PAGE_SIZE = 100;
export const HISTORY_MAX_PAGES = 100;
export const STALE_MS = 180 * 24 * 60 * 60 * 1000;
export const STALE_CHOICES = new Set(["watching", "dropped", "skip"]);

const WATCHED_SHARE = 0.9;
const PARTIAL_SHARE = 0.5;

export function historyPageUrl(accountId, page, locale = "en-US") {
  const params = new URLSearchParams({ page: String(page), page_size: String(HISTORY_PAGE_SIZE), locale });
  return `https://www.crunchyroll.com/content/v2/${encodeURIComponent(accountId)}/watch-history?${params}`;
}

function text(value, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function positive(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function watchedShare(row, durationMs) {
  if (row?.fully_watched === true) return 1;
  const playhead = Number(row?.playhead);
  return Number.isFinite(playhead) && durationMs > 0 ? Math.min(1, (playhead * 1000) / durationMs) : 0;
}

function historyRow(row) {
  const panel = row?.panel;
  if (!panel || typeof panel !== "object") return null;
  const playedAt = Date.parse(row.date_played) || 0;
  const movie = panel.movie_metadata;
  if (panel.type === "movie" || movie) {
    const listingId = text(movie?.movie_listing_id || row.parent_id, 60);
    if (!listingId) return null;
    const share = watchedShare(row, Number(movie?.duration_ms));
    return {
      kind: "movie",
      groupId: `movie:${listingId}`,
      seriesId: listingId,
      seriesTitle: text(movie?.movie_listing_title || panel.title),
      seasonTitle: "",
      seasonNumber: null,
      episode: 1,
      watched: share >= WATCHED_SHARE,
      share,
      playedAt,
    };
  }
  const meta = panel.episode_metadata;
  const seasonId = text(meta?.season_id, 60);
  const seriesId = text(meta?.series_id || row.parent_id, 60);
  if (!meta || !seasonId || !seriesId) return null;
  const share = watchedShare(row, Number(meta.duration_ms));
  return {
    kind: "episode",
    groupId: `season:${seasonId}`,
    seriesId,
    seriesTitle: text(meta.series_title),
    seasonTitle: text(meta.season_title),
    seasonNumber: positive(meta.season_number),
    episode: positive(meta.episode_number),
    watched: share >= WATCHED_SHARE,
    share,
    playedAt,
  };
}

export function nextHistoryUrl(next) {
  if (typeof next !== "string" || !next) return "";
  try {
    const url = new URL(next, "https://www.crunchyroll.com");
    return url.hostname === "www.crunchyroll.com" && url.pathname.includes("/watch-history") ? url.href : "";
  } catch {
    return "";
  }
}

export function parseHistoryPage(payload, seenSoFar = 0) {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const rows = data.map(historyRow).filter(Boolean);
  const next = payload?.meta?.next_page;
  const total = Number(payload?.total);
  let more;
  if (typeof next === "string") more = next.length > 0;
  else if (Number.isFinite(total) && total > 0) more = seenSoFar + data.length < total;
  else more = data.length >= HISTORY_PAGE_SIZE;
  return { rows, more: more && data.length > 0, nextUrl: more && data.length > 0 ? nextHistoryUrl(next) : "" };
}

export function groupHistory(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!row?.groupId) continue;
    let group = groups.get(row.groupId);
    if (!group) {
      group = {
        id: row.groupId,
        kind: row.kind,
        seriesId: row.seriesId,
        seriesTitle: row.seriesTitle,
        seasonTitle: row.seasonTitle,
        seasonNumber: row.seasonNumber,
        episodes: new Set(),
        partial: {},
        lastPlayed: 0,
      };
      groups.set(row.groupId, group);
    }
    group.lastPlayed = Math.max(group.lastPlayed, row.playedAt || 0);
    if (!row.episode) continue;
    if (row.watched) group.episodes.add(row.episode);
    else if (row.share >= PARTIAL_SHARE) group.partial[row.episode] = Math.max(group.partial[row.episode] || 0, row.share);
  }
  return [...groups.values()]
    .filter((group) => group.episodes.size && (group.seriesTitle || group.seasonTitle))
    .map(({ episodes, partial, ...group }) => {
      const episodeList = [...episodes].sort((a, b) => a - b);
      const open = Object.fromEntries(Object.entries(partial).filter(([episode]) => !episodes.has(Number(episode))));
      return {
        ...group,
        episodeList,
        partial: open,
        minEpisode: episodeList[0],
        maxEpisode: episodeList[episodeList.length - 1],
        watchedCount: episodeList.length,
      };
    });
}

function existingEntry(library, anilistId) {
  const entry = library?.[`anilist:${anilistId}`];
  return entry && !entry.removed ? entry : null;
}

export function planHistoryImport(library, items, { now, stale = "watching" } = {}) {
  const choice = STALE_CHOICES.has(stale) ? stale : "watching";
  const changes = [];
  let current = 0;
  let staleCount = 0;
  for (const item of items || []) {
    const entry = existingEntry(library, item.anilistId);
    const isStale = !item.finished && now - item.lastPlayed > STALE_MS;
    if (entry && (entry.status === "finished" || entry.status === "dropped")) {
      current += 1;
      continue;
    }
    if (entry && entry.status === "in_progress" && (entry.progress ?? 0) >= item.progress && !item.finished) {
      current += 1;
      continue;
    }
    if (isStale) staleCount += 1;
    if (isStale && choice === "skip") continue;
    const status = item.finished ? "finished" : isStale && choice === "dropped" ? "dropped" : "in_progress";
    changes.push({ ...item, status, stale: isStale, isNew: !entry, fromStatus: entry?.status || null, fromProgress: entry?.progress ?? null });
  }
  return { changes, current, staleCount };
}

export function applyHistoryChanges(library, changes, now) {
  let next = library;
  const keys = [];
  for (const change of changes || []) {
    const show = {
      anilistId: change.anilistId,
      crSeriesId: change.crSeriesId,
      title: change.title,
      cover: change.cover,
      episodes: change.episodes,
    };
    next = setEntryProgress(next, show, change.progress, now);
    if (change.status === "dropped") next = setEntryStatus(next, show, "dropped", now);
    else if (change.status === "finished" && next[`anilist:${change.anilistId}`]?.status !== "finished") next = setEntryStatus(next, show, "finished", now);
    keys.push(`anilist:${change.anilistId}`);
  }
  return { library: next, keys };
}

export function historySummary(plan, unmatched) {
  const added = plan.changes.filter((change) => change.isNew);
  return {
    total: plan.changes.length,
    finished: added.filter((change) => change.status === "finished").length,
    watching: added.filter((change) => change.status === "in_progress").length,
    dropped: added.filter((change) => change.status === "dropped").length,
    updated: plan.changes.length - added.length,
    current: plan.current,
    stale: plan.staleCount,
    unmatched: unmatched.length,
  };
}
