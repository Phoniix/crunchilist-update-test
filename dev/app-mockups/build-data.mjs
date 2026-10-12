// Builds data.js for the app page mockups: popular catalog shows plus AniList art.
// Run: node dev/app-mockups/build-data.mjs
import { readFileSync, writeFileSync } from "node:fs";

const snapshot = JSON.parse(readFileSync(new URL("../../fixtures/catalog-snapshot.json", import.meta.url), "utf8"));
const must = [/schwarzesmarken/i, /kaze no stigma/i, /frieren/i, /86/];
const pool = snapshot.shows.filter((show) => show.anilistId && show.type === "series" && show.about);
const picked = new Map();
for (const pattern of must) {
  const hit = pool.find((show) => pattern.test(show.title));
  if (hit) picked.set(hit.anilistId, hit);
}
const byPopularity = [...pool].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
for (const show of byPopularity) {
  if (picked.size >= 48) break;
  picked.set(show.anilistId, show);
}
// Shows still airing, so the Airing page has a week to fill.
for (const show of byPopularity.filter((row) => row.releaseStatus === "RELEASING").slice(0, 16)) picked.set(show.anilistId, show);

const query = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) {
  id bannerImage coverImage { extraLarge color } season seasonYear duration trailer { id site } studios(isMain: true) { nodes { name } }
  nextAiringEpisode { airingAt episode } } } }`;
const media = new Map();
const pickedIds = [...picked.keys()];
for (let i = 0; i < pickedIds.length; i += 50) {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query, variables: { ids: pickedIds.slice(i, i + 50) } }),
  });
  for (const row of (await response.json())?.data?.Page?.media || []) media.set(row.id, row);
}

// Seasons: follow AniList sequel/prequel links, stopping at entries Crunchyroll lists as their own show.
const catalogIds = new Set(snapshot.shows.map((show) => show.anilistId).filter(Boolean));
const seasonFormats = new Set(["TV", "TV_SHORT", "ONA", "MOVIE"]);
const seasonQuery = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) {
  id format episodes season seasonYear status averageScore title { english romaji } coverImage { large }
  relations { edges { relationType node { id type format } } } } } }`;
const nodes = new Map();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function fetchNodes(ids) {
  for (let i = 0; i < ids.length; i += 50) {
    const reply = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: seasonQuery, variables: { ids: ids.slice(i, i + 50) } }),
    });
    for (const row of (await reply.json())?.data?.Page?.media || []) nodes.set(row.id, row);
    await sleep(800);
  }
}
const linked = (id, type) => (nodes.get(id)?.relations?.edges || [])
  .filter((edge) => edge.relationType === type && edge.node.type === "ANIME" && seasonFormats.has(edge.node.format))
  .sort((a, b) => (a.node.format === "MOVIE") - (b.node.format === "MOVIE"))
  .map((edge) => edge.node.id);
// A few well-known shows that aren't on Crunchyroll, so the mockup can show what that looks like.
const OFF_CRUNCHYROLL = [120377, 21827, 35526, 153518];
const offQuery = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) {
  id title { english romaji native } genres tags { name rank isMediaSpoiler } description(asHtml: false) episodes duration status
  season seasonYear averageScore bannerImage coverImage { extraLarge color } trailer { id site } studios(isMain: true) { nodes { name } }
  externalLinks { site url type } nextAiringEpisode { airingAt episode } } } }`;
const offReply = await fetch("https://graphql.anilist.co", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({ query: offQuery, variables: { ids: OFF_CRUNCHYROLL } }),
});
const offMedia = ((await offReply.json())?.data?.Page?.media || []).filter((row) => !catalogIds.has(row.id));
await sleep(800);

let frontier = [...picked.keys(), ...offMedia.map((row) => row.id)];
for (let depth = 0; depth < 8 && frontier.length; depth++) {
  await fetchNodes(frontier.filter((id) => !nodes.has(id)));
  const next = new Set();
  for (const id of frontier) {
    if (depth > 0 && catalogIds.has(id)) continue;
    for (const other of [...linked(id, "SEQUEL"), ...linked(id, "PREQUEL")]) if (!nodes.has(other) && !catalogIds.has(other)) next.add(other);
  }
  frontier = [...next];
}
function seasonChain(baseId) {
  const seen = new Set([baseId]);
  const yearOf = (id) => nodes.get(id)?.seasonYear;
  const inOrder = (at, id, type) => !yearOf(at) || !yearOf(id) || (type === "PREQUEL" ? yearOf(id) <= yearOf(at) : yearOf(id) >= yearOf(at));
  const walk = (type) => {
    const out = [];
    let at = baseId;
    while (out.length < 8) {
      const step = linked(at, type).find((id) => nodes.has(id) && !seen.has(id) && !catalogIds.has(id) && inOrder(at, id, type));
      if (!step) break;
      seen.add(step);
      out.push(step);
      at = step;
    }
    return out;
  };
  const back = walk("PREQUEL").reverse();
  const ids = [...back, baseId, ...walk("SEQUEL")];
  let number = 0;
  let film = 0;
  const films = ids.filter((id) => nodes.get(id)?.format === "MOVIE").length;
  return ids.map((id) => {
    const row = nodes.get(id) || {};
    const movie = row.format === "MOVIE";
    if (movie) film += 1;
    else number += 1;
    return {
      anilistId: id,
      label: movie ? (films > 1 ? `Movie ${film}` : "Movie") : `Season ${number}`,
      title: row.title?.english || row.title?.romaji || "",
      format: row.format || "TV",
      episodes: row.episodes || null,
      year: row.seasonYear || null,
      season: row.season || null,
      status: row.status || null,
      score: row.averageScore || null,
      cover: row.coverImage?.large || "",
    };
  });
}

function clip(text, max) {
  const clean = String(text || "").replace(/\s*\(Source:[^)]*\)\s*$/i, "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, clean.lastIndexOf(" ", max))}…`;
}

const shows = [...picked.values()].map((show) => {
  const art = media.get(show.anilistId) || {};
  return {
    id: show.id,
    anilistId: show.anilistId,
    title: show.title,
    native: show.titles?.native || "",
    romaji: show.titles?.romaji || "",
    genres: show.genres || [],
    tags: (show.tags || []).slice(0, 8),
    about: clip(show.about, 1200),
    year: show.year || art.seasonYear || null,
    season: art.season || null,
    score: show.score || null,
    episodes: show.episodes || null,
    duration: art.duration || null,
    studio: art.studios?.nodes?.[0]?.name || "",
    status: show.releaseStatus || null,
    cover: art.coverImage?.extraLarge || "",
    banner: art.bannerImage || "",
    color: art.coverImage?.color || "#f47521",
    trailer: art.trailer?.site === "youtube" ? art.trailer.id : "",
    airing: art.nextAiringEpisode ? { at: art.nextAiringEpisode.airingAt, episode: art.nextAiringEpisode.episode } : null,
    seasons: seasonChain(show.anilistId).map((season) => season.anilistId === show.anilistId ? { ...season, episodes: season.episodes || show.episodes || null } : season),
    onCrunchyroll: true,
  };
}).filter((show) => show.cover);

for (const [order, row] of offMedia.entries()) {
  const seasons = seasonChain(row.id);
  shows.splice(Math.min(shows.length, 5 + order * 8), 0, {
    id: `al-${row.id}`,
    anilistId: row.id,
    title: row.title?.english || row.title?.romaji || "",
    native: row.title?.native || "",
    romaji: row.title?.romaji || "",
    genres: row.genres || [],
    tags: (row.tags || []).filter((tag) => !tag.isMediaSpoiler).sort((a, b) => b.rank - a.rank).slice(0, 8).map((tag) => tag.name),
    about: clip(String(row.description || "").replace(/<[^>]+>/g, ""), 1200),
    year: row.seasonYear || null,
    season: row.season || null,
    score: row.averageScore || null,
    episodes: row.episodes || null,
    duration: row.duration || null,
    studio: row.studios?.nodes?.[0]?.name || "",
    status: row.status || null,
    cover: row.coverImage?.extraLarge || "",
    banner: row.bannerImage || "",
    color: row.coverImage?.color || "#888888",
    trailer: row.trailer?.site === "youtube" ? row.trailer.id : "",
    airing: row.nextAiringEpisode ? { at: row.nextAiringEpisode.airingAt, episode: row.nextAiringEpisode.episode } : null,
    seasons: seasons.map((season) => season.anilistId === row.id ? { ...season, episodes: season.episodes || row.episodes || null } : season),
    onCrunchyroll: false,
    streaming: (row.externalLinks || []).filter((link) => link.type === "STREAMING").map((link) => ({ site: link.site, url: link.url })),
  });
}

writeFileSync(new URL("./data.js", import.meta.url), `// Generated by build-data.mjs from the catalog snapshot and AniList art.\nwindow.MOCK_SHOWS = ${JSON.stringify(shows, null, 1)};\n`);
console.log(`wrote ${shows.length} shows, ${shows.filter((show) => show.banner).length} with banners`);
