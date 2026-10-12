// "Inspired by your searches": the search page's side panel blends recent searches with what the viewer has watched.
export const RECENT_LIMIT = 8;
export const INSPIRED_SEARCHES = 4;
const MAX_QUERY = 80;

const tidy = (query) => String(query || "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);

// Newest first, no repeats (ignoring case), at most limit entries.
export function rememberSearch(list, query, limit = RECENT_LIMIT) {
  const text = tidy(query);
  const kept = cleanSearches(list, limit);
  if (!text) return kept;
  return [text, ...kept.filter((item) => item.toLowerCase() !== text.toLowerCase())].slice(0, limit);
}

export function cleanSearches(list, limit = INSPIRED_SEARCHES) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const text = tidy(item);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

// Takes one from each list in turn, so every search gets a fair share of the candidates.
export function interleave(lists, limit) {
  const seen = new Set();
  const out = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let at = 0; at < longest && out.length < limit; at += 1) {
    for (const list of lists) {
      const item = list[at];
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= limit) break;
    }
  }
  return out;
}

// The shows most recently watched or finished, newest first.
export function recentlyWatched(entries, limit = 5) {
  return (entries || [])
    .filter((entry) => entry?.title && (entry.status === "in_progress" || entry.status === "finished"))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, limit)
    .map((entry) => entry.title);
}

export function inspiredRequest(searches, watched) {
  const quoted = searches.map((query) => `"${query}"`).join(", ");
  const parts = [`Pick the shows I would most want to watch next, based on what I searched for recently: ${quoted}.`];
  if (watched.length) parts.push(`Shows I have watched or am watching: ${watched.join(", ")}.`);
  parts.push("Favor shows that connect my searches with what I have watched, and say briefly which search or show each pick connects to.");
  return parts.join(" ");
}
