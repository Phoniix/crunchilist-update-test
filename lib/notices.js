import { entryForSeries } from "./library.js";

export const NOTICE_LIMIT = 30;
const KINDS = new Set(["ask", "done"]);

function whole(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function cleanShow(show) {
  if (!show?.crSeriesId) return null;
  return {
    crSeriesId: String(show.crSeriesId),
    anilistId: Number(show.anilistId) > 0 ? Number(show.anilistId) : null,
    title: String(show.title || "").slice(0, 180),
    cover: typeof show.cover === "string" && show.cover.startsWith("https://") ? show.cover : "",
    episodes: whole(show.episodes) || null,
  };
}

function cleanNotice(raw) {
  if (!raw || typeof raw !== "object" || !KINDS.has(raw.kind)) return null;
  const show = cleanShow(raw.show);
  const episode = whole(raw.episode);
  if (!show || !episode || !raw.id) return null;
  return {
    id: String(raw.id),
    kind: raw.kind,
    show,
    episode,
    from: whole(raw.from) ?? 0,
    last: Boolean(raw.last),
    createdAt: Number(raw.createdAt) || 0,
  };
}

export function normalizeNotices(raw) {
  return (Array.isArray(raw) ? raw : []).map(cleanNotice).filter(Boolean).slice(0, NOTICE_LIMIT);
}

export function addNotice(notices, notice, now) {
  const clean = cleanNotice({ ...notice, id: notice.id || `${notice.kind}:${notice.show?.crSeriesId}:${notice.episode}:${now}`, createdAt: now });
  if (!clean) return notices || [];
  const rest = (notices || []).filter((row) => !(row.show.crSeriesId === clean.show.crSeriesId && (row.kind === "ask" || clean.kind === "ask")));
  return [clean, ...rest].slice(0, NOTICE_LIMIT);
}

export function removeNotices(notices, ids) {
  const drop = new Set(ids);
  return (notices || []).filter((row) => !drop.has(row.id));
}

export function liveNotices(notices, library) {
  return (notices || []).filter((row) => {
    if (row.kind !== "ask") return true;
    const entry = entryForSeries(library, row.show.crSeriesId, row.show.anilistId);
    if (entry?.status === "finished" || entry?.status === "dropped") return false;
    return !(entry?.progress != null && entry.progress >= row.episode);
  });
}

export function describeNotice(row) {
  const title = row.show.title || "This show";
  if (row.kind === "ask") {
    return {
      title,
      message: row.last ? "You finished the last episode. Mark it completed?" : `You finished episode ${row.episode}. Set it to Watching?`,
      action: row.last ? "Mark completed" : "Set to Watching",
    };
  }
  return { title, message: row.last ? "Marked completed after the last episode." : `Marked episode ${row.episode} watched.`, action: "" };
}
