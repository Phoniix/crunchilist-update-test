// Title equality is only for linking a Crunchyroll name to AniList.
// A sequel can share a franchise key and still keep its own season record.

const DUB_SUFFIX = /\s*\((?:[a-z-]+\s+)?(?:dub|dubbed|sub|subbed|subtitled)\)\s*$/i;
const YEAR_SUFFIX = /\s*\((19|20)\d{2}\)\s*$/;

export function searchableTitle(input) {
  return String(input || "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(DUB_SUFFIX, "")
    .replace(YEAR_SUFFIX, "")
    .replace(/[\s:]+$/, "")
    .trim();
}

function titleYear(input) {
  const match = String(input || "").match(/\(((?:19|20)\d{2})\)\s*$/);
  return match ? Number(match[1]) : null;
}

function mediaYear(media) {
  return media?.startDate?.year || media?.seasonYear || null;
}

export function normalizeTitle(input) {
  if (input == null) return "";
  let text = searchableTitle(String(input).normalize("NFKC")).toLowerCase();
  text = text.replace(/\b(\d+)(st|nd|rd|th)\s+season\b/g, " ");
  text = text.replace(/\b(season|part|cour)\s*\d+\b/g, " ");
  text = text.replace(/[^\p{L}\p{N}\s]/gu, " ");
  return text.replace(/\s+/g, " ").trim();
}

function compactTitle(normalized) {
  return normalized.replace(/\s+/g, "");
}

export function titlesOf(media) {
  if (!media) return [];
  const title = media.title || {};
  return [title.english, title.romaji, title.native, ...(media.synonyms || [])].filter(Boolean);
}

function seasonMarker(text) {
  const lower = String(text || "").toLowerCase();
  const match = lower.match(/\b(?:season|part|cour)\s*(\d+)\b/) || lower.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/);
  return match ? Number(match[1]) : null;
}

function strictTitle(text) {
  return String(text || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function sameTitle(queryNorm, title) {
  const normalized = normalizeTitle(title);
  if (!normalized) return false;
  if (normalized === queryNorm) return true;
  if (compactTitle(normalized) === compactTitle(queryNorm)) return true;
  const withoutThe = (text) => compactTitle(text.replace(/\bthe\b/g, " "));
  return withoutThe(normalized) === withoutThe(queryNorm);
}

function subtitleMatch(queryNorm, mediaList, kind) {
  const prefixed = (mediaList || []).filter((media) => {
    if (kind === "movie" ? media.format !== "MOVIE" : media.format !== "TV") return false;
    return [media.title?.english, media.title?.romaji].some((title) => {
      const head = String(title || "").split(/:\s/)[0];
      return head !== title && normalizeTitle(head) === queryNorm;
    });
  });
  const [first, second] = prefixed.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  if (first?.popularity && first.popularity >= 2 * (second?.popularity || 0)) return { confidence: "high", media: first };
  return { confidence: "none", reason: "no-equal" };
}

function narrow(list, keep) {
  const kept = list.filter(keep);
  return kept.length ? kept : list;
}

export function pickMatch(query, mediaList, { kind = "" } = {}) {
  const queryNorm = normalizeTitle(query);
  if (!queryNorm) return { confidence: "none", reason: "empty" };

  const year = titleYear(query);
  const hits = [];
  for (const media of mediaList || []) {
    if (year && mediaYear(media) && mediaYear(media) !== year) continue;
    if (titlesOf(media).some((title) => sameTitle(queryNorm, title))) hits.push(media);
  }

  if (hits.length === 1) return { confidence: "high", media: hits[0] };
  if (hits.length === 0) return year ? { confidence: "none", reason: "no-equal" } : subtitleMatch(queryNorm, mediaList, kind);

  const querySeason = seasonMarker(query);
  const refined = hits.filter((media) => {
    const markers = titlesOf(media).map(seasonMarker);
    if (querySeason == null) return markers.every((marker) => marker == null);
    return markers.some((marker) => marker === querySeason);
  });

  if (refined.length === 1) return { confidence: "high", media: refined[0] };
  const exact = strictTitle(searchableTitle(query));
  let pool = refined.length ? refined : hits;
  const steps = [
    (media) => titlesOf(media).some((title) => strictTitle(title) === exact),
    (media) => [media.title?.english, media.title?.romaji].some((title) => title && sameTitle(queryNorm, title)),
    (media) => !kind || (kind === "movie" ? media.format === "MOVIE" : media.format !== "MOVIE" && media.format !== "MUSIC"),
  ];
  for (const step of steps) {
    pool = narrow(pool, step);
    if (pool.length === 1) return { confidence: "high", media: pool[0] };
  }
  const [first, second] = [...pool].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  if (first?.popularity && first.popularity >= 1.5 * (second?.popularity || 0)) return { confidence: "high", media: first };
  return { confidence: "none", reason: "ambiguous" };
}

export function tagsFromConfidentMatch(match) {
  if (!match || match.confidence !== "high" || !match.media) return [];
  return (match.media.tags || []).map((tag) => (typeof tag === "string" ? tag : tag?.name)).filter(Boolean);
}
