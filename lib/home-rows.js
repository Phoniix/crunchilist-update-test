// Generated home rows: the AI (or a fallback) names 5-6 themes, and the search engine fills each one with real shows.
import { parseJsonBlob } from "./llm.js";

export const HOME_ROWS_MIN = 5;
export const HOME_ROWS_MAX = 6;
export const HOME_ROWS_TTL_MS = 12 * 60 * 60_000;
export const HOME_ROWS_ACTIVITY_MS = 60 * 60_000;
export const HOME_ROWS_RETRY_MS = 60 * 60_000;
const MAX_TITLE = 48;
const MAX_QUERY = 80;
const MAX_WHY = 120;
export const NUDGE_MAX = 80;

function tidy(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}
const titleCase = (label) => String(label || "").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

// "Frieren: Beyond Journey's End" reads as "Frieren" in a row title.
export function shortTitle(title) {
  const text = String(title || "").trim();
  const head = text.split(/\s*[:–—]\s+|\s+-\s+/)[0].trim();
  return head.length >= 3 ? head : text;
}

export const HOME_ROWS_SCHEMA = {
  type: "object",
  required: ["rows"],
  properties: {
    rows: {
      type: "array",
      minItems: HOME_ROWS_MIN,
      maxItems: HOME_ROWS_MAX,
      items: {
        type: "object",
        required: ["title", "query", "why"],
        properties: {
          title: { type: "string", maxLength: MAX_TITLE },
          query: { type: "string", maxLength: MAX_QUERY },
          why: { type: "string", maxLength: MAX_WHY },
        },
      },
    },
  },
};

export const HOME_ROWS_SYSTEM = [
  "You name rows for an anime streaming home page, like Netflix category rows, personalised for one viewer.",
  `Return ${HOME_ROWS_MIN} to ${HOME_ROWS_MAX} rows. Each row has a title, a query and a why.`,
  `title is a short, catchy row name under ${MAX_TITLE} characters. Do not name a specific show in the title unless the row is "Because you watched" that show.`,
  "query is a short search phrase that finds shows for the row. Use genres, tags, moods, settings or eras, for example \"cozy slice of life\", \"dark fantasy revenge\", \"short sports\", \"underrated mystery\", \"set in space\", or \"like <a show the viewer watched>\". Do not put show titles in the query except after \"like\".",
  "why is one short sentence telling the viewer why the row is for them, mentioning their taste, a show they watched, or a recent search.",
  "Make every row different: vary genres, moods and lengths. Never use a hardAvoids tag. At most two rows may use \"like\".",
  "If nudge is given, the viewer typed it to steer today's rows. Let it influence most rows by blending it with their taste and history, for example a mood, setting or theme mixed with genres they like. It is a nudge, not a filter: keep variety, and keep at least one row purely from their taste.",
  'Return JSON only: {"rows":[{"title":"Cozy evenings","query":"cozy slice of life","why":"You keep coming back to gentle slice of life."}]}',
].join(" ");

export function cleanNudge(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, NUDGE_MAX).trim();
}

export function buildHomeRowsPrompt({ profile, liked = [], watched = [], searches = [], nudge = "" }) {
  return {
    system: HOME_ROWS_SYSTEM,
    user: JSON.stringify({
      profile,
      topTags: liked.slice(0, 8),
      recentlyWatched: watched.slice(0, 6),
      recentSearches: searches.slice(0, 4),
      ...(nudge ? { nudge } : {}),
    }),
  };
}

export function cleanThemes(rows, avoids = []) {
  const blocked = (avoids || []).map((label) => String(label).toLowerCase()).filter(Boolean);
  const titles = new Set();
  const queries = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const title = tidy(row?.title, MAX_TITLE);
    const query = String(row?.query || "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY).trim();
    const why = tidy(row?.why, MAX_WHY);
    if (!title || !query) continue;
    const lower = query.toLowerCase();
    if (titles.has(title.toLowerCase()) || queries.has(lower)) continue;
    if (blocked.some((label) => new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower))) continue;
    titles.add(title.toLowerCase());
    queries.add(lower);
    out.push({ title, query, why });
    if (out.length >= HOME_ROWS_MAX) break;
  }
  return out;
}

export function parseHomeRows(text, avoids = []) {
  const blob = parseJsonBlob(text);
  const rows = cleanThemes(Array.isArray(blob) ? blob : blob?.rows, avoids);
  return rows.length >= 3 ? { ok: true, rows } : { ok: false, rows: [] };
}

// Themes built from history and taste alone, for when AI is off or fails.
export function fallbackThemes({ liked = [], watched = [], searches = [], nudge = "" }) {
  const rows = [];
  const tags = liked.map(titleCase);
  if (nudge) {
    rows.push({ title: `Inspired by "${nudge}"`, query: nudge, why: "Steered by what you typed." });
    if (tags[0]) rows.push({ title: `${tags[0]} with a "${nudge}" twist`, query: `${nudge} ${liked[0]}`, why: `What you typed, mixed with ${tags[0].toLowerCase()}, a favorite tag.` });
  }
  const watchedRow = (title) => ({ title: `Because you watched ${shortTitle(title)}`, query: `like ${title}`, why: `Shows that share the most with ${shortTitle(title)}.` });
  if (watched[0]) rows.push(watchedRow(watched[0]));
  if (tags[0]) rows.push({ title: `More ${tags[0]}`, query: liked[0], why: `${tags[0]} is one of your favorite tags.` });
  if (searches[0]) rows.push({ title: `More like "${searches[0]}"`, query: searches[0], why: "Based on something you searched for recently." });
  if (tags[1]) rows.push({ title: `${tags[1]} picks`, query: liked[1], why: `You often watch ${tags[1].toLowerCase()} shows.` });
  if (tags[0]) rows.push({ title: `Short ${tags[0]} binges`, query: `short ${liked[0]}`, why: "Quick series you can finish in a weekend." });
  if (watched[1]) rows.push(watchedRow(watched[1]));
  if (tags[2]) rows.push({ title: `Hidden ${tags[2]} gems`, query: `underrated ${liked[2]}`, why: `Less talked-about ${tags[2].toLowerCase()} shows.` });
  if (searches[1]) rows.push({ title: `More like "${searches[1]}"`, query: searches[1], why: "Based on something you searched for recently." });
  if (rows.length < HOME_ROWS_MIN) {
    rows.push(
      { title: "Hidden gems", query: "underrated", why: "Well-rated shows that fly under the radar." },
      { title: "Quick binges", query: "short", why: "Series you can finish in a weekend." },
      { title: "Acclaimed classics", query: "classic acclaimed", why: "Older shows that still hold up." },
      { title: "Movie night", query: "movie", why: "Films for when you want a whole story in one sitting." },
      { title: "Crowd favorites", query: "popular", why: "What lots of viewers keep watching." },
    );
  }
  return cleanThemes(rows);
}

// Changes when the viewer's taste, history, recent searches or AI setup change.
export function activitySignature({ taste, watchedIds = [], searches = [], aiKey = "" }) {
  const profile = taste || {};
  return JSON.stringify([
    profile.liked || [],
    profile.disliked || [],
    profile.hardAvoids || [],
    [...watchedIds].map(String).sort(),
    searches.slice(0, 2).map((query) => String(query).toLowerCase()),
    aiKey,
  ]);
}

// Regenerate after 12 hours, or after an hour when the viewer has done something new since.
export function needsRefresh(saved, signature, now = Date.now()) {
  if (!saved || !Array.isArray(saved.themes) || !saved.themes.length) return true;
  if (now >= (saved.expiresAt || 0)) return true;
  if (now < (saved.createdAt || 0)) return true;
  return saved.signature !== signature && now - (saved.createdAt || 0) >= HOME_ROWS_ACTIVITY_MS;
}

export function expiryFor({ wantedAi, gotAi, now = Date.now() }) {
  return now + (wantedAi && !gotAi ? HOME_ROWS_RETRY_MS : HOME_ROWS_TTL_MS);
}

// Each show appears in only one row; rows too thin to scroll are dropped.
export function fillThemes(themes, ranker, { perRow = 14, minRow = 5 } = {}) {
  const used = new Set();
  const out = [];
  for (const theme of themes) {
    const ids = [];
    for (const id of ranker(theme.query)) {
      if (used.has(id) || ids.includes(id)) continue;
      ids.push(id);
      if (ids.length >= perRow) break;
    }
    if (ids.length < minRow) continue;
    ids.forEach((id) => used.add(id));
    out.push({ ...theme, ids });
  }
  return out;
}
