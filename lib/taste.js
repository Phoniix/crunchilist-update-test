import { libraryLabels } from "./library.js";
import { uniqueStrings } from "./text.js";

export const ANILIST_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Horror",
  "Mahou Shoujo",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
];

export function defaultTaste() {
  return {
    liked: [],
    disliked: [],
    dropped: [],
    subDub: "any",
    hardAvoids: [],
  };
}

export function sanitizeTaste(input) {
  const source = input || {};
  const taste = defaultTaste();
  taste.liked = uniqueStrings(source.liked);
  taste.disliked = uniqueStrings(source.disliked);
  taste.dropped = uniqueStrings(source.dropped);
  taste.hardAvoids = uniqueStrings(source.hardAvoids);
  taste.subDub = ["any", "sub", "dub"].includes(source.subDub) ? source.subDub : "any";
  return taste;
}

function bump(map, labels, amount) {
  for (const label of labels || []) {
    const key = String(label || "").trim().toLowerCase();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + amount);
  }
}

export function buildWeights(state) {
  const liked = new Map();
  const disliked = new Map();
  const taste = sanitizeTaste(state?.taste);
  bump(liked, taste.liked, 5);
  bump(disliked, taste.disliked, 5);
  bump(disliked, taste.dropped, 3);

  const history = libraryLabels(state?.library);
  for (const row of history.liked) bump(liked, row.labels, row.weight);
  for (const labels of history.disliked) bump(disliked, labels, 1);

  return { liked, disliked };
}

export function allowedByTaste(labels, taste) {
  const blocked = new Set((sanitizeTaste(taste).hardAvoids || []).map((item) => item.toLowerCase()));
  if (!blocked.size) return true;
  return !(labels || []).some((label) => blocked.has(String(label).toLowerCase()));
}

export function scoreLabels(labels, weights) {
  let score = 0;
  for (const label of labels || []) {
    const key = String(label || "").trim().toLowerCase();
    if (!key) continue;
    score += weights?.liked?.get(key) || 0;
    score -= weights?.disliked?.get(key) || 0;
  }
  return score;
}

export function collectTagSuggestions(state) {
  const values = [...ANILIST_GENRES];
  for (const row of Object.values(state?.anilistCache || {})) {
    if (row?.kind !== "hit") continue;
    values.push(...(row.genres || []), ...(row.tags || []));
  }
  for (const entry of Object.values(state?.library || {})) values.push(...(entry.labels || []));
  return uniqueStrings(values, 500).sort((a, b) => a.localeCompare(b));
}

export function filterTagSuggestions(query, options, exclude, limit = 8) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [];
  const skip = new Set((exclude || []).map((item) => String(item).toLowerCase()));
  const genres = new Set(ANILIST_GENRES.map((genre) => genre.toLowerCase()));
  const rank = (key) => (key === needle ? 0 : 1) + (genres.has(key) ? 0 : 2);
  const starts = [];
  const contains = [];
  for (const option of options || []) {
    const key = String(option).toLowerCase();
    if (skip.has(key)) continue;
    if (key.startsWith(needle)) starts.push(option);
    else if (key.includes(needle)) contains.push(option);
  }
  starts.sort((a, b) => rank(String(a).toLowerCase()) - rank(String(b).toLowerCase()));
  return [...starts, ...contains].slice(0, limit);
}

export function compactProfile(taste) {
  const profile = sanitizeTaste(taste);
  return {
    liked: profile.liked,
    disliked: profile.disliked,
    dropped: profile.dropped,
    hardAvoids: profile.hardAvoids,
    audioPreference: profile.subDub,
  };
}
