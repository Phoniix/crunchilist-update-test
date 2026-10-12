export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
export const CATALOG_RETRY_MS = 60 * 60 * 1000;
export const CATALOG_PAGE_SIZE = 50;

export function normalizeLocale(input) {
  const value = String(input || "").replace("_", "-").trim();
  const match = /^([a-zA-Z]{2})-([a-zA-Z]{2})$/.exec(value);
  if (match) return `${match[1].toLowerCase()}-${match[2].toUpperCase()}`;
  if (/^en$/i.test(value) || !value) return "en-US";
  return "en-US";
}

export function normalizeCatalog(raw) {
  const items = Array.isArray(raw?.items) ? raw.items.map(normalizeTitle).filter(Boolean) : [];
  const newest = Array.isArray(raw?.newest) ? raw.newest.map(normalizeTitle).filter(Boolean).slice(0, 24) : [];
  return {
    updatedAt: Number(raw?.updatedAt) || 0,
    attemptedAt: Number(raw?.attemptedAt) || 0,
    detailsAt: Number(raw?.detailsAt) || 0,
    titlesOwed: Boolean(raw?.titlesOwed),
    locale: normalizeLocale(raw?.locale),
    complete: Boolean(raw?.complete),
    items,
    newest,
  };
}

export function catalogDue(meta, now = Date.now()) {
  if (!meta?.complete || !meta.updatedAt) {
    if (meta?.attemptedAt && now - meta.attemptedAt < CATALOG_RETRY_MS) return false;
    return true;
  }
  return now - meta.updatedAt >= CATALOG_TTL_MS;
}

export function browseRequestUrl({ start = 0, type, locale, sort, pageSize } = {}) {
  const url = new URL("https://www.crunchyroll.com/content/v2/discover/browse");
  url.searchParams.set("n", String(pageSize || CATALOG_PAGE_SIZE));
  url.searchParams.set("start", String(start));
  url.searchParams.set("sort_by", sort === "newly_added" ? "newly_added" : "popularity");
  url.searchParams.set("ratings", "true");
  url.searchParams.set("locale", normalizeLocale(locale));
  if (type) url.searchParams.set("type", type);
  return url.toString();
}

export function searchRequestUrl({ query, type, locale } = {}) {
  const url = new URL("https://www.crunchyroll.com/content/v2/discover/search");
  url.searchParams.set("q", String(query || ""));
  url.searchParams.set("type", type);
  url.searchParams.set("limit", "8");
  url.searchParams.set("start", "0");
  url.searchParams.set("locale", normalizeLocale(locale));
  return url.toString();
}

export function normalizeTitle(raw) {
  const id = String(raw?.id || "").trim();
  const title = String(raw?.title || raw?.name || "").replace(/\s+/g, " ").trim();
  if (!/^[A-Z0-9]{6,}$/i.test(id) || !title) return null;
  const typeRaw = String(raw?.type || raw?.media_type || "");
  const type = /movie/i.test(typeRaw) ? "movie" : "series";
  const count = raw?.series_metadata?.episode_count ?? raw?.episode_count ?? raw?.episodes ?? null;
  const episodes = Number.isFinite(Number(count)) && Number(count) > 0 ? Number(count) : null;
  const slug = String(raw?.slug_title || "").replace(/[^a-z0-9-]/gi, "");
  const savedUrl = typeof raw?.url === "string" && raw.url.startsWith(`https://www.crunchyroll.com/series/${id}`) ? raw.url : "";
  const url = slug
    ? `https://www.crunchyroll.com/series/${id}/${slug}`
    : savedUrl || `https://www.crunchyroll.com/series/${id}`;
  const nested = posterFrom(raw);
  const saved = httpsUrl(raw?.poster);
  const cover = httpsUrl(raw?.cover);
  const anilistId = Number(raw?.anilistId) > 0 ? Number(raw.anilistId) : null;
  return { id, title: title.slice(0, 180), url, type, episodes, poster: nested || saved, cover, anilistId };
}

function httpsUrl(value) {
  return typeof value === "string" && value.startsWith("https://") ? value : "";
}

export function displayPoster(item) {
  return httpsUrl(item?.cover) || httpsUrl(item?.poster) || "";
}

export function stampCatalogCovers(catalog, stamps) {
  const stamp = (item) => {
    const update = stamps?.[item.id];
    if (!update?.cover) return item;
    return { ...item, cover: update.cover, anilistId: update.anilistId || item.anilistId || null };
  };
  return {
    ...catalog,
    items: (catalog?.items || []).map(stamp),
    newest: (catalog?.newest || []).map(stamp),
  };
}

function posterFrom(raw) {
  const piles = [].concat(raw?.images?.poster_tall || [], raw?.images?.poster_wide || []);
  const sources = piles.flat(Infinity).map((item) => (typeof item === "string" ? item : item?.source));
  return sources.find((source) => typeof source === "string" && source.startsWith("https://")) || "";
}

export function buildHomeSections(catalog, statusFor, hideWatched, scoreFor = () => 0) {
  const statusOf = (item) => statusFor(item.id) || "unwatched";
  const visible = (item) => {
    const status = statusOf(item);
    return !(hideWatched && (status === "finished" || status === "dropped"));
  };
  const popular = (catalog?.items || []).filter(visible).slice(0, 12);
  const fresh = (catalog?.newest || []).filter(visible).slice(0, 12);
  const forYou = (catalog?.items || []).filter(visible).filter((item) => {
    const status = statusOf(item);
    return status === "unwatched" || status === "plan";
  }).sort((a, b) => scoreFor(b) - scoreFor(a));
  const forYouShown = forYou.slice(0, 12);
  const sameAsPopular = forYouShown.length > 0 && forYouShown.every((item, index) => popular[index]?.id === item.id);
  const sections = [];
  if (catalog?.continueItems?.length) sections.push({ title: "Continue", items: catalog.continueItems.slice(0, 12) });
  if (!sameAsPopular && forYouShown.length) sections.push({ title: "For you", items: forYouShown });
  if (fresh.length) sections.push({ title: "New releases", items: fresh });
  if (popular.length) sections.push({ title: "Popular", items: popular });
  return sections;
}

export function parseBrowsePayload(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const items = data.map(normalizeTitle).filter(Boolean);
  const total = Number(payload?.total ?? payload?.meta?.total);
  return { items, total: Number.isFinite(total) ? total : null };
}

export function parseSearchPayload(payload) {
  const groups = Array.isArray(payload?.data) ? payload.data : [];
  const items = [];
  const seen = new Set();
  for (const group of groups) {
    const list = Array.isArray(group?.items) ? group.items : group?.id ? [group] : [];
    for (const raw of list) {
      const item = normalizeTitle(raw);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

export function retainSeenCatalog(items, seenIds) {
  const seen = seenIds instanceof Set ? seenIds : new Set(seenIds || []);
  return (items || []).filter((item) => item?.id && seen.has(item.id));
}

export function mergeCatalogItems(previous, incoming) {
  const map = new Map();
  for (const item of previous || []) if (item?.id) map.set(item.id, item);
  for (const item of incoming || []) {
    if (!item?.id) continue;
    const prev = map.get(item.id) || {};
    const next = { ...prev, ...item };
    if (!item.cover && prev.cover) next.cover = prev.cover;
    if (!item.anilistId && prev.anilistId) next.anilistId = prev.anilistId;
    map.set(item.id, next);
  }
  return [...map.values()].slice(0, 5000);
}

export function promptFallbackBrief(item, query, labels = [], about = "") {
  const sentence = String(about || "").split(/(?<=[.!?])\s/)[0].replace(/\s+/g, " ").trim();
  if (sentence.length > 180) return `${sentence.slice(0, 178).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "")}…`;
  if (sentence) return sentence;
  return (labels || []).slice(0, 3).join(", ");
}

export function filterCatalog(items, query, limit = 8) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return (items || []).slice(0, limit);
  const scored = [];
  for (const item of items || []) {
    const title = item.title.toLowerCase();
    if (words.some((word) => !title.includes(word))) continue;
    scored.push({ item, starts: words.length && title.startsWith(words[0]) ? 0 : 1 });
  }
  scored.sort((a, b) => a.starts - b.starts || a.item.title.localeCompare(b.item.title));
  return scored.slice(0, limit).map((entry) => entry.item);
}

export function applyCatalogChip(items, chip, hideWatched, statusFor) {
  return (items || []).filter((item) => {
    const status = statusFor(item.id) || "unwatched";
    if (hideWatched && (status === "finished" || status === "dropped")) return false;
    if (chip === "movie" && item.type !== "movie") return false;
    if (chip === "one-cour" && !(item.type !== "movie" && item.episodes >= 1 && item.episodes <= 13)) return false;
    if (chip === "long" && !(item.type !== "movie" && item.episodes >= 24)) return false;
    if (chip === "unwatched" && status !== "unwatched" && status !== "plan") return false;
    if (chip === "in-progress" && status !== "in_progress") return false;
    if (chip === "plan" && status !== "plan") return false;
    return true;
  });
}
