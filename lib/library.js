export const LIBRARY_STATUSES = new Set(["in_progress", "finished", "dropped", "plan"]);

export function showKeyFor({ anilistId, crSeriesId } = {}) {
  if (Number(anilistId) > 0) return `anilist:${Number(anilistId)}`;
  if (crSeriesId) return `cr:${crSeriesId}`;
  return null;
}

function whole(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function cleanLabels(labels) {
  const seen = new Set();
  const out = [];
  for (const label of labels || []) {
    const text = String(typeof label === "string" ? label : label?.name || "").trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= 24) break;
  }
  return out;
}

function cleanEntry(raw, key) {
  if (!raw || typeof raw !== "object") return null;
  const status = LIBRARY_STATUSES.has(raw.status) ? raw.status : null;
  if (!status && !raw.removed) return null;
  return {
    key,
    anilistId: Number(raw.anilistId) > 0 ? Number(raw.anilistId) : null,
    crSeriesId: typeof raw.crSeriesId === "string" && raw.crSeriesId ? raw.crSeriesId : null,
    title: String(raw.title || "").slice(0, 180),
    cover: typeof raw.cover === "string" && raw.cover.startsWith("https://") ? raw.cover : "",
    labels: cleanLabels(raw.labels),
    status,
    progress: whole(raw.progress),
    episodes: whole(raw.episodes),
    score: whole(raw.score),
    anilistListId: Number(raw.anilistListId) > 0 ? Number(raw.anilistListId) : null,
    source: raw.source === "anilist" || raw.source === "public" ? raw.source : "local",
    updatedAt: Number(raw.updatedAt) || 0,
    syncedAt: Number(raw.syncedAt) || 0,
    dirty: Boolean(raw.dirty),
    removed: Boolean(raw.removed),
    related: Boolean(raw.related),
  };
}

export function normalizeLibrary(raw) {
  const library = {};
  if (!raw || typeof raw !== "object") return library;
  for (const [key, value] of Object.entries(raw)) {
    const entry = cleanEntry(value, key);
    if (entry) library[key] = entry;
  }
  return library;
}

function findKey(library, show) {
  const key = showKeyFor(show);
  if (key && library[key]) return key;
  // A later season shares its Crunchyroll show with season 1, so it must not take over season 1's entry.
  if (show?.exact && show.anilistId) return key;
  if (show?.crSeriesId) {
    const crKey = `cr:${show.crSeriesId}`;
    if (library[crKey]) return crKey;
    const linked = Object.values(library).find((entry) => entry.crSeriesId === show.crSeriesId && !entry.removed && !entry.related);
    if (linked) return linked.key;
  }
  return key;
}

function rekey(library, fromKey, show) {
  const target = showKeyFor(show);
  if (!target || target === fromKey || !library[fromKey]) return fromKey;
  library[target] = { ...library[fromKey], ...(library[target] || {}), key: target, anilistId: show.anilistId || library[fromKey].anilistId };
  delete library[fromKey];
  return target;
}

function describe(entry, show) {
  return {
    anilistId: Number(show?.anilistId) > 0 ? Number(show.anilistId) : entry?.anilistId ?? null,
    crSeriesId: show?.crSeriesId || entry?.crSeriesId || null,
    title: show?.title || entry?.title || "",
    cover: show?.cover || entry?.cover || "",
    labels: show?.labels?.length ? cleanLabels(show.labels) : entry?.labels || [],
    episodes: whole(show?.episodes) ?? entry?.episodes ?? null,
    related: typeof show?.related === "boolean" ? show.related : Boolean(entry?.related),
  };
}

export function setEntryStatus(library, show, status, now) {
  if (status != null && !LIBRARY_STATUSES.has(status)) throw new Error("Unknown status");
  const next = { ...library };
  let key = findKey(next, show);
  if (!key) throw new Error("Missing show");
  key = rekey(next, key, show);
  const previous = next[key];
  if (status == null) {
    if (!previous) return next;
    if (previous.anilistListId || previous.source === "anilist") {
      next[key] = { ...previous, status: null, removed: true, dirty: true, updatedAt: now };
    } else {
      delete next[key];
    }
    return next;
  }
  const facts = describe(previous, show);
  let progress = previous?.progress ?? null;
  if (status === "finished" && facts.episodes) progress = facts.episodes;
  next[key] = cleanEntry({
    ...(previous || {}),
    ...facts,
    status,
    progress,
    source: previous?.source || "local",
    removed: false,
    dirty: true,
    updatedAt: now,
  }, key);
  return next;
}

export function setEntryProgress(library, show, progress, now) {
  const value = whole(progress);
  if (value == null) throw new Error("Missing episode");
  const next = { ...library };
  let key = findKey(next, show);
  if (!key) throw new Error("Missing show");
  key = rekey(next, key, show);
  const previous = next[key];
  const facts = describe(previous, show);
  const done = facts.episodes && value >= facts.episodes;
  next[key] = cleanEntry({
    ...(previous || {}),
    ...facts,
    status: done ? "finished" : "in_progress",
    progress: value,
    source: previous?.source || "local",
    removed: false,
    dirty: true,
    updatedAt: now,
  }, key);
  return next;
}

function mediaTitle(media) {
  return media?.title?.english || media?.title?.romaji || media?.title?.native || "";
}

function mediaLabels(media) {
  return cleanLabels([...(media?.genres || []), ...(media?.tags || []).map((tag) => (typeof tag === "string" ? tag : tag?.name))]);
}

export function mergeAnilistList(library, entries, { now, lastPullAt = 0, source = "anilist" } = {}) {
  const next = { ...library };
  const pulled = new Set();
  for (const row of entries || []) {
    const anilistId = Number(row?.anilistId);
    if (!(anilistId > 0) || !LIBRARY_STATUSES.has(row.status)) continue;
    const key = `anilist:${anilistId}`;
    pulled.add(key);
    const previous = next[key];
    if (previous?.dirty && previous.updatedAt > lastPullAt) continue;
    next[key] = cleanEntry({
      ...(previous || {}),
      anilistId,
      title: previous?.title || mediaTitle(row.media),
      cover: previous?.cover || row.media?.coverImage?.large || "",
      labels: previous?.labels?.length ? previous.labels : mediaLabels(row.media),
      episodes: previous?.episodes || row.media?.episodes || null,
      status: row.status,
      progress: row.progress ?? null,
      score: row.score ?? previous?.score ?? null,
      anilistListId: source === "anilist" ? row.listId ?? previous?.anilistListId ?? null : previous?.anilistListId ?? null,
      source,
      dirty: false,
      removed: false,
      syncedAt: now,
      updatedAt: previous?.updatedAt || now,
    }, key);
  }
  for (const [key, entry] of Object.entries(next)) {
    if (pulled.has(key) || entry.dirty) continue;
    if (source === "anilist" && (entry.source !== "local" || entry.anilistListId)) delete next[key];
    if (source === "public" && entry.source === "public") delete next[key];
  }
  return next;
}

export function linkCatalog(library, pairs) {
  const next = { ...library };
  for (const { crSeriesId, anilistId, relatedIds, title, cover, labels, episodes } of pairs || []) {
    if (!crSeriesId) continue;
    for (const relatedId of relatedIds || []) {
      const related = next[`anilist:${Number(relatedId)}`];
      if (related && !related.crSeriesId) next[related.key] = { ...related, crSeriesId, related: true };
    }
    const alKey = Number(anilistId) > 0 ? `anilist:${Number(anilistId)}` : null;
    const crKey = `cr:${crSeriesId}`;
    if (alKey && next[crKey]) {
      const local = next[crKey];
      const remote = next[alKey];
      const winner = !remote || local.updatedAt >= remote.updatedAt ? { ...remote, ...local } : { ...local, ...remote };
      next[alKey] = { ...winner, key: alKey, anilistId: Number(anilistId), crSeriesId, dirty: local.dirty || Boolean(remote?.dirty) };
      delete next[crKey];
    }
    const key = alKey && next[alKey] ? alKey : next[crKey] ? crKey : null;
    if (!key) continue;
    const entry = next[key];
    next[key] = {
      ...entry,
      crSeriesId: entry.crSeriesId || crSeriesId,
      title: entry.title || title || "",
      cover: entry.cover || cover || "",
      labels: entry.labels?.length ? entry.labels : cleanLabels(labels),
      episodes: entry.episodes || whole(episodes),
    };
  }
  return next;
}

export function activeEntries(library) {
  return Object.values(library || {}).filter((entry) => entry.status && !entry.removed);
}

export function entryForSeries(library, crSeriesId, anilistId = null) {
  if (Number(anilistId) > 0) {
    const direct = library?.[`anilist:${Number(anilistId)}`];
    if (direct && !direct.removed) return direct;
  }
  if (!crSeriesId) return null;
  const crEntry = library?.[`cr:${crSeriesId}`];
  if (crEntry && !crEntry.removed) return crEntry;
  const linked = activeEntries(library).filter((entry) => entry.crSeriesId === crSeriesId);
  return linked.find((entry) => !entry.related) || linked[0] || null;
}

export function statusForSeries(library, crSeriesId, anilistId = null) {
  return entryForSeries(library, crSeriesId, anilistId)?.status || "unwatched";
}

export function seriesMarks(library) {
  const grouped = new Map();
  for (const entry of activeEntries(library)) {
    if (!entry.crSeriesId) continue;
    if (!grouped.has(entry.crSeriesId)) grouped.set(entry.crSeriesId, []);
    grouped.get(entry.crSeriesId).push(entry);
  }
  const marks = {};
  for (const [crSeriesId, entries] of grouped) {
    const statuses = entries.map((entry) => entry.status);
    const primary = entries.find((entry) => !entry.related) || entries[0];
    let mark = primary.status;
    if (statuses.includes("in_progress")) mark = "in_progress";
    else if (statuses.includes("finished") && statuses.some((status) => status !== "finished")) mark = "in_progress";
    marks[crSeriesId] = { mark, hide: statuses.every((status) => status === "finished") };
    const source = entries.find((entry) => entry.status === mark) || primary;
    if (source.progress > 0) marks[crSeriesId].progress = source.progress;
    if (source.episodes > 0) marks[crSeriesId].episodes = source.episodes;
  }
  return marks;
}

export function pendingSync(library) {
  return Object.values(library || {}).filter((entry) => entry.dirty && entry.anilistId);
}

export function markSynced(library, key, saved, now) {
  const next = { ...library };
  const entry = next[key];
  if (!entry) return next;
  if (entry.removed) {
    delete next[key];
    return next;
  }
  next[key] = {
    ...entry,
    anilistListId: Number(saved?.id) > 0 ? Number(saved.id) : entry.anilistListId,
    progress: saved?.progress ?? entry.progress,
    source: "anilist",
    dirty: false,
    syncedAt: now,
  };
  return next;
}

export function applySynced(library, results, now) {
  let next = library;
  for (const { key, saved, updatedAt } of results || []) {
    if (next?.[key]?.updatedAt !== updatedAt) continue;
    next = markSynced(next, key, saved, now);
  }
  return next;
}

export function progressOffer(entry, watchingEpisode, episodes = null) {
  const to = whole(watchingEpisode);
  if (!to) return null;
  if (entry?.status === "finished" || entry?.status === "dropped") return null;
  const from = entry?.progress ?? 0;
  if (to <= from) return null;
  const total = whole(episodes) || entry?.episodes || null;
  return {
    key: entry?.key || null,
    from,
    to,
    last: Boolean(total && to >= total),
    watching: entry?.status === "in_progress",
  };
}

export function libraryLabels(library) {
  const liked = [];
  const disliked = [];
  for (const entry of activeEntries(library)) {
    const strong = entry.score != null && entry.score >= 80;
    const weak = entry.score != null && entry.score > 0 && entry.score < 50;
    if (entry.status === "dropped" || weak) disliked.push(entry.labels);
    else if (entry.status === "finished" || entry.status === "in_progress") liked.push({ labels: entry.labels, weight: strong ? 2 : 1 });
  }
  return { liked, disliked };
}

function seasonTitle(record) {
  const series = record.seriesTitle || "";
  const season = record.seasonTitle || "";
  if (series && season && !/^season\s*\d*$/i.test(season) && season.toLowerCase() !== series.toLowerCase()) return `${series} — ${season}`;
  return series || season || "";
}

export function migrateSeasonState(raw, now) {
  const library = mergeAnilistList({}, Object.values(raw?.imports || {}), {
    now,
    source: raw?.importMeta?.source === "public" ? "public" : "anilist",
  });
  for (const record of Object.values(raw?.seasons || {})) {
    if (!record?.status || !LIBRARY_STATUSES.has(record.status) || !record.seriesId) continue;
    const anilistId = Number(record.anilistId) > 0 ? Number(record.anilistId) : null;
    const key = showKeyFor({ anilistId, crSeriesId: record.seriesId });
    const previous = library[key];
    const local = record.statusSource === "user" || record.statusSetByUser;
    if (previous && !local) {
      library[key] = { ...previous, crSeriesId: previous.crSeriesId || record.seriesId };
      continue;
    }
    library[key] = cleanEntry({
      ...(previous || {}),
      anilistId,
      crSeriesId: record.seriesId,
      title: previous?.title || seasonTitle(record),
      labels: previous?.labels || record.genres || [],
      status: record.status,
      progress: record.listProgress ?? record.episodesWatched ?? record.crEpisode ?? null,
      episodes: record.episodeCount ?? previous?.episodes ?? null,
      anilistListId: record.anilistListId ?? previous?.anilistListId ?? null,
      source: previous?.source || "local",
      dirty: local,
      updatedAt: record.updatedAt || now,
    }, key);
  }
  return library;
}
