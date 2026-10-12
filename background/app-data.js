import { LIBRARY_STATUS, buildAppShows, libraryMirror, mediaWanted, seasonTarget } from "../lib/app-shows.js";
import { setEntryProgress, setEntryStatus } from "../lib/library.js";
import { CHAIN_DEPTH, EXTRAS_BATCH, EXTRAS_QUERY, extrasFrontier, keepReachable, mediaNode, missingNode } from "../lib/seasons.js";
import { changeLibrary } from "./anilist-sync.js";
import { makeView } from "./page.js";
import { anilist, delay, loadCatalog, loadMedia, loadState, saveMedia } from "./store.js";

async function loadShows(state) {
  const catalog = await loadCatalog();
  const media = await loadMedia();
  return { catalog, shows: buildAppShows({ catalog, cache: state.anilistCache, media, library: state.library }) };
}

// Everything the Crunchilist page shows. Secrets never leave the background: the view carries public settings only.
export async function appData() {
  const state = await loadState();
  const { catalog, shows } = await loadShows(state);
  refreshMediaExtras().catch(() => {});
  return { shows, library: libraryMirror(shows, state.library), view: makeView(state, catalog) };
}

export async function setSeasonState(showId, changes) {
  if (!Array.isArray(changes) || !changes.length) throw new Error("Nothing to change");
  const { shows } = await loadShows(await loadState());
  const show = shows.find((row) => row.id === showId);
  if (!show) throw new Error("That show isn't in the catalog anymore.");
  const result = await changeLibrary((library, now) => {
    let next = library;
    for (const change of changes) {
      const target = seasonTarget(show, Number(change?.index) || 0);
      const status = change?.status == null ? null : LIBRARY_STATUS[change.status];
      if (change?.status != null && !status) throw new Error("Unknown status");
      if (status === "in_progress" && Number.isInteger(change.progress)) next = setEntryProgress(next, target, change.progress, now);
      else next = setEntryStatus(next, target, status, now);
    }
    return next;
  }, show.anilistId ? "" : "Saved on this device.");
  return { library: libraryMirror(shows, result.state.library), view: makeView(result.state, await loadCatalog()), syncNote: result.syncNote };
}

let extrasJob = null;

// Trailers, studios, airing times and season links, fetched 50 shows per AniList request.
export function refreshMediaExtras(signal) {
  if (!extrasJob) extrasJob = fetchExtras(signal).finally(() => { extrasJob = null; });
  return extrasJob;
}

async function fetchExtras(signal) {
  const state = await loadState();
  const catalog = await loadCatalog();
  const { ids, catalogIds, offCatalog } = mediaWanted({ catalog, cache: state.anilistCache, library: state.library });
  if (!ids.length) return;
  const media = await loadMedia();
  let changed = false;
  for (let round = 0; round <= CHAIN_DEPTH; round += 1) {
    const frontier = extrasFrontier(ids, media, catalogIds, Date.now());
    if (!frontier.length) break;
    for (let index = 0; index < frontier.length; index += EXTRAS_BATCH) {
      if (signal?.aborted) return;
      const batch = frontier.slice(index, index + EXTRAS_BATCH);
      let payload;
      try {
        payload = await anilist(EXTRAS_QUERY, { ids: batch }, undefined, signal);
      } catch (error) {
        if (signal?.aborted || error?.name === "AbortError" || !/busy|429/i.test(String(error?.message))) {
          if (changed) await saveMedia(keepReachable(media, ids, catalogIds));
          return;
        }
        await delay(60_000, signal);
        payload = await anilist(EXTRAS_QUERY, { ids: batch }, undefined, signal).catch(() => null);
        if (!payload) break;
      }
      const now = Date.now();
      const rows = payload?.data?.Page?.media || [];
      const found = new Set();
      for (const row of rows) {
        if (!row?.id) continue;
        found.add(row.id);
        media[row.id] = mediaNode(row, now, { keepAbout: offCatalog.has(row.id) });
      }
      for (const id of batch) if (!found.has(id)) media[id] = missingNode(id, now);
      changed = true;
      if ((index / EXTRAS_BATCH) % 5 === 4) await saveMedia(media);
      await delay(1000, signal);
    }
  }
  if (changed) await saveMedia(keepReachable(media, ids, catalogIds));
}
