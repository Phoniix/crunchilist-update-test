import { normalizeTitle, pickMatch, searchableTitle, titlesOf } from "./title-match.js";

// Crunchyroll names seasons its own way ("Season 01 (English Dub)", "Zou (751-782)",
// "Season 2: Stardust Crusaders"), while AniList search drops a show when the query
// carries words its titles lack. Each group gets a short list of searches, most
// specific first, and episode numbers that run past one AniList entry follow its
// sequel chain.

export const HISTORY_SEARCH_BATCH = 6;
const CHAIN_HOPS = 8;
const ABSOLUTE_FROM = 14;
const SEQUEL_FORMATS = new Set(["TV", "TV_SHORT", "ONA"]);
const MEDIA_FIELDS = "id format episodes popularity seasonYear startDate { year } title { romaji english native } synonyms coverImage { large }";

const DUB_TAG = /\s*\((?:[a-z-]+\s+)?(?:dub|dubbed|sub|subbed|subtitled)\)/gi;
const DUB_WORD = /,?\s*\b(?:subtitled|dubbed)\b/gi;
const RANGE = /\s*\((\d+)\s*[-–]\s*(\d+|current)\)/i;
const PAREN_SEASON = /\s*\((?:season|part|cour)\s*\d+\)/gi;
const MARKER = /\b(?:season|part|cour)\s*\d+(?:\.\d+)?\b|\b\d+(?:st|nd|rd|th)\s+season\b/gi;
const LEAD_MARKER = /(^|:\s*)(?:season|part|cour)\s*\d+(?:\.\d+)?\s*(?::\s*|$)/i;

export function episodeRange(title) {
  const match = String(title || "").match(RANGE);
  if (!match) return null;
  const from = Number(match[1]);
  const to = /current/i.test(match[2]) ? null : Number(match[2]);
  return from > 0 && (to == null || to >= from) ? { from, to } : null;
}

export function cleanSeasonTitle(title) {
  return String(title || "")
    .replace(DUB_TAG, "")
    .replace(RANGE, "")
    .replace(PAREN_SEASON, "")
    .replace(DUB_WORD, "")
    .replace(/\s+/g, " ")
    .replace(/[\s:,–-]+$/, "")
    .trim();
}

const ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const ROMAN_TAIL = /\s+(ii|iii|iv|v|vi|vii|viii|ix|x)(?=\s*(?::|$))/i;

function romanSeasons(text) {
  return String(text || "").normalize("NFKC").replace(/\bseason\s+(ii|iii|iv|v|vi|vii|viii|ix|x)\b/gi, (_, roman) => `Season ${ROMAN[roman.toLowerCase()]}`);
}

function seasonNumberIn(text) {
  const plain = romanSeasons(text);
  const lower = plain.toLowerCase();
  const match = lower.match(/\bseason\s*0*(\d+)\b/) || lower.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/) || lower.match(/\b(?:part|cour)\s*0*(\d+)\b/);
  if (match) return Number(match[1]);
  const roman = plain.split(/:\s/)[0].match(ROMAN_TAIL);
  return roman ? ROMAN[roman[1].toLowerCase()] : null;
}

function partNumberIn(text) {
  const match = String(text || "").match(/\bseason\s*0*\d+\s+(?:part|cour)\s*0*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function withoutMarkers(text) {
  return String(text || "")
    .replace(MARKER, " ")
    .replace(/\s*:\s*(?::\s*)+/g, ": ")
    .replace(/\s+/g, " ")
    .replace(/[\s:,–-]+$/, "")
    .replace(/^[\s:,–-]+/, "")
    .trim();
}

function startsWithSeries(season, series) {
  const a = normalizeTitle(season);
  const b = normalizeTitle(series);
  return Boolean(b) && (a === b || a.startsWith(`${b} `));
}

export function historySearches(group) {
  const series = searchableTitle(cleanSeasonTitle(group.seriesTitle || group.seasonTitle));
  if (group.kind === "movie") return { range: null, steps: series ? [{ search: series, title: series, kind: "movie" }] : [] };
  const raw = group.seasonTitle || "";
  const range = episodeRange(raw);
  const season = romanSeasons(cleanSeasonTitle(raw));
  const number = seasonNumberIn(season) ?? group.seasonNumber ?? null;
  const part = partNumberIn(season);
  if (!series) return { range, steps: season ? [{ search: withoutMarkers(season), title: season }] : [] };
  const baseSteps = () => {
    const steps = [{ search: series, base: true }];
    const bare = withoutHonorifics(series);
    if (bare !== series) steps.push({ search: bare, base: true });
    return steps;
  };
  if (range) return { range, steps: baseSteps() };
  const rest = withoutMarkers(season);
  const generic = !rest || normalizeTitle(rest) === normalizeTitle(series);
  if (generic) {
    const partQuery = number > 1 && part ? `${series} Season ${number} Part ${part}` : "";
    const partStep = partQuery ? [{ search: partQuery, title: partQuery }] : [];
    if (!number || number <= 1) return { range, steps: [...partStep, ...baseSteps()] };
    const query = `${series} Season ${number}`;
    return { range, steps: [...partStep, { search: query, title: query }, { search: series, season: number }] };
  }
  const named = season.replace(LEAD_MARKER, "$1").replace(/:\s*$/, "").trim() || season;
  const full = startsWithSeries(named, series) ? named : `${series}: ${named}`;
  const steps = [{ search: withoutMarkers(full), title: full }];
  const dashHead = full.split(/\s+-\s+/)[0];
  if (dashHead !== full) steps.push({ search: withoutMarkers(dashHead), title: dashHead });
  const colonHead = named.split(/:\s/)[0];
  if (colonHead !== named && startsWithSeries(colonHead, series) && normalizeTitle(colonHead) !== normalizeTitle(series)) {
    steps.push({ search: withoutMarkers(colonHead), title: colonHead });
  }
  if (number > 1) steps.push({ search: series, season: number });
  return { range, steps };
}

function plainSearch(text) {
  return String(text || "").normalize("NFKD").replace(/\p{M}/gu, "");
}

function withoutHonorifics(text) {
  return String(text || "").replace(/-(?:kun|chan|san|sama|senpai|sensei)\b/gi, "");
}

function sameBase(seriesNorm, title) {
  const head = String(title || "").normalize("NFKC");
  const bare = head.match(ROMAN_TAIL) ? head.split(/:\s/)[0].replace(ROMAN_TAIL, "") : head;
  return [title, bare].some((candidate) => {
    const norm = normalizeTitle(candidate);
    return Boolean(norm) && norm.replace(/\s+/g, "") === seriesNorm.replace(/\s+/g, "");
  });
}

export function pickSeason(series, number, mediaList) {
  const seriesNorm = normalizeTitle(series);
  const found = (mediaList || []).filter((media) => SEQUEL_FORMATS.has(media.format)
    && titlesOf(media).some((title) => seasonNumberIn(title) === number && sameBase(seriesNorm, title)));
  const [first, second] = found.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  if (first && (!second || (first.popularity || 0) >= 1.5 * (second.popularity || 0))) return first;
  return null;
}

function confident(title, media, kind) {
  const match = pickMatch(title, media, { kind });
  return match.confidence === "high" ? match.media : null;
}

function covering(found, series, first, media) {
  if (found.episodes == null || found.episodes >= first) return found;
  const seriesNorm = normalizeTitle(series);
  const [longer] = (media || [])
    .filter((item) => item.id !== found.id && SEQUEL_FORMATS.has(item.format)
      && (item.episodes == null || item.episodes >= first)
      && titlesOf(item).some((title) => sameBase(seriesNorm, title)))
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return longer || found;
}

function judge(step, group, media, plan) {
  if (step.title) {
    const found = confident(step.title, media, step.kind || "series");
    return found ? { media: found } : null;
  }
  if (step.base) {
    const found = confident(step.search, media, "series");
    if (!found) return null;
    const first = shiftForRange(group.episodeList || [], plan.range)[0] || 0;
    return { media: plan.range || first >= ABSOLUTE_FROM ? covering(found, step.search, first, media) : found };
  }
  const seasonal = pickSeason(step.search, step.season, media);
  if (seasonal) return { media: seasonal };
  const found = confident(step.search, media, "series");
  if (found && group.minEpisode >= ABSOLUTE_FROM && (found.episodes == null || found.episodes >= group.minEpisode)) return { media: found, absolute: true };
  return null;
}

export function historySearchQuery(count) {
  const variables = [];
  const fields = [];
  for (let index = 0; index < count; index += 1) {
    variables.push(`$s${index}: String`);
    fields.push(`p${index}: Page(page: 1, perPage: 8) { media(search: $s${index}, type: ANIME) { ${MEDIA_FIELDS} } }`);
  }
  return `query (${variables.join(", ")}) {\n${fields.join("\n")}\n}`;
}

export function sequelQuery(count) {
  const variables = [];
  const fields = [];
  for (let index = 0; index < count; index += 1) {
    variables.push(`$i${index}: Int`);
    fields.push(`m${index}: Media(id: $i${index}) { id relations { edges { relationType node { ${MEDIA_FIELDS} } } } }`);
  }
  return `query (${variables.join(", ")}) {\n${fields.join("\n")}\n}`;
}

export function nextSequel(payloadMedia) {
  const edges = payloadMedia?.relations?.edges || [];
  return edges.find((edge) => edge?.relationType === "SEQUEL" && SEQUEL_FORMATS.has(edge.node?.format))?.node || null;
}

function shiftForRange(numbers, range) {
  if (!range || !numbers.length) return numbers;
  const span = range.to ? range.to - range.from + 1 : Infinity;
  const relative = numbers[0] < range.from && numbers[numbers.length - 1] <= span;
  return relative ? numbers.map((n) => n + range.from - 1) : numbers;
}

// Some seasons keep counting from the season before ([Oshi No Ko] S2 starts at 12, JJK S2 at 25).
// When the numbers run past the matched entry and either all sit beyond it, or start partway in but
// span no more than it holds, count them from 1 instead of spilling into the next entry.
export function continuedNumbers(numbers, total) {
  if (!total || !numbers.length) return numbers;
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  if (last <= total || first === 1) return numbers;
  const carried = first > total || last - first + 1 <= total;
  return carried ? numbers.map((n) => n - first + 1) : numbers;
}

function needsChain(numbers, media, absolute) {
  const total = media.episodes;
  if (!total || !numbers.length) return false;
  const last = numbers[numbers.length - 1];
  return last > total && (absolute || numbers[0] <= total);
}

function splitByChain(numbers, chain) {
  const parts = new Map();
  for (const n of numbers) {
    let link = chain.find(({ media, offset }) => n > offset && (media.episodes == null || n <= offset + media.episodes));
    if (!link) link = chain[chain.length - 1];
    if (!parts.has(link.media.id)) parts.set(link.media.id, { media: link.media, offset: link.offset, numbers: [] });
    parts.get(link.media.id).numbers.push(n - link.offset);
  }
  return [...parts.values()];
}

function hitOf(media) {
  return {
    anilistId: media.id,
    episodes: media.episodes ?? null,
    cover: media.coverImage?.large || "",
    title: media.title?.english || media.title?.romaji || media.title?.native || "",
  };
}

export async function matchHistory(groups, { ask, known = () => null, pause = async () => {}, onStep = () => {}, signal } = {}) {
  const results = new Map();
  const plans = new Map();
  const searched = new Map();
  const aborted = () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  };
  for (const group of groups) {
    const plan = historySearches(group);
    plans.set(group, { ...plan, at: 0 });
    const cached = known(group);
    const firstStep = plan.steps[0];
    const first = shiftForRange(group.episodeList || [], plan.range)[0] || 0;
    const fits = !plan.range || cached?.media?.episodes == null || cached.media.episodes >= first;
    if (cached?.settled && firstStep?.base && fits) results.set(group, { media: cached.media, absolute: Boolean(plan.range) });
  }
  const waiting = () => groups.filter((group) => !results.has(group) && plans.get(group).at < plans.get(group).steps.length);
  let round = waiting();
  while (round.length) {
    aborted();
    const needed = [...new Set(round.map((group) => plans.get(group).steps[plans.get(group).at].search).filter((search) => search && !searched.has(search)))];
    for (let index = 0; index < needed.length; index += HISTORY_SEARCH_BATCH) {
      aborted();
      const batch = needed.slice(index, index + HISTORY_SEARCH_BATCH);
      const variables = Object.fromEntries(batch.map((search, k) => [`s${k}`, plainSearch(search).slice(0, 120)]));
      const payload = await ask(historySearchQuery(batch.length), variables);
      batch.forEach((search, k) => searched.set(search, payload?.data?.[`p${k}`]?.media || []));
      onStep({ kind: "search", done: index + batch.length, total: needed.length });
      await pause();
    }
    for (const group of round) {
      const plan = plans.get(group);
      const step = plan.steps[plan.at];
      plan.at += 1;
      const found = judge(step, group, searched.get(step.search) || [], plan);
      if (found) results.set(group, { ...found, absolute: found.absolute || Boolean(plan.range) });
    }
    round = waiting();
  }

  const chains = new Map();
  const walkers = [];
  for (const [group, found] of results) {
    if (group.kind === "movie") continue;
    const ranged = shiftForRange(group.episodeList || [], plans.get(group).range);
    const numbers = found.absolute ? ranged : continuedNumbers(ranged, found.media.episodes);
    found.numbers = numbers;
    if (needsChain(numbers, found.media, found.absolute) && !chains.has(found.media.id)) {
      const chain = [{ media: found.media, offset: 0 }];
      chains.set(found.media.id, chain);
      walkers.push({ chain, need: numbers[numbers.length - 1] });
    }
  }
  for (const walker of walkers) {
    for (const [group, found] of results) {
      if (found.media.id === walker.chain[0].media.id && found.numbers?.length) walker.need = Math.max(walker.need, found.numbers[found.numbers.length - 1]);
    }
  }
  const relations = new Map();
  for (let hop = 0; hop < CHAIN_HOPS; hop += 1) {
    const open = walkers.filter((walker) => {
      const last = walker.chain[walker.chain.length - 1];
      return !walker.done && last.media.episodes && walker.need > last.offset + last.media.episodes;
    });
    if (!open.length) break;
    const ids = [...new Set(open.map((walker) => walker.chain[walker.chain.length - 1].media.id).filter((id) => !relations.has(id)))];
    for (let index = 0; index < ids.length; index += HISTORY_SEARCH_BATCH) {
      aborted();
      const batch = ids.slice(index, index + HISTORY_SEARCH_BATCH);
      const payload = await ask(sequelQuery(batch.length), Object.fromEntries(batch.map((id, k) => [`i${k}`, id])));
      batch.forEach((id, k) => relations.set(id, nextSequel(payload?.data?.[`m${k}`])));
      onStep({ kind: "sequel", done: index + batch.length, total: ids.length });
      await pause();
    }
    for (const walker of open) {
      const last = walker.chain[walker.chain.length - 1];
      const next = relations.get(last.media.id);
      if (!next || walker.chain.some((link) => link.media.id === next.id)) walker.done = true;
      else walker.chain.push({ media: next, offset: last.offset + last.media.episodes });
    }
  }

  return historyItems(groups, (group) => {
    const found = results.get(group);
    if (!found) return null;
    const primaryId = known(group)?.media?.id;
    if (group.kind === "movie") return [{ hit: hitOf(found.media), primary: found.media.id === primaryId }];
    const chain = chains.get(found.media.id);
    const numbers = found.numbers || [];
    const partial = shiftPartial(group.partial, group.episodeList, numbers);
    const parts = chain && needsChain(numbers, found.media, found.absolute) ? splitByChain(numbers, chain) : [{ media: found.media, offset: 0, numbers }];
    return parts.map((part) => ({
      hit: hitOf(part.media),
      primary: part.media.id === primaryId,
      numbers: part.numbers,
      partial: partialFor(partial, part),
    }));
  });
}

function shiftPartial(partial, original, shifted) {
  const delta = original?.length && shifted?.length ? shifted[0] - original[0] : 0;
  if (!delta) return partial || {};
  const out = {};
  for (const [episode, share] of Object.entries(partial || {})) out[Number(episode) + delta] = share;
  return out;
}

function partialFor(partial, part) {
  const out = {};
  for (const [episode, share] of Object.entries(partial || {})) {
    const n = Number(episode) - part.offset;
    if (n > 0 && (part.media.episodes == null || n <= part.media.episodes)) out[n] = share;
  }
  return out;
}

const FINAL_SHARE = 0.75;

export function historyItems(groups, resolve) {
  const byId = new Map();
  const unmatched = [];
  for (const group of groups || []) {
    const parts = resolve(group);
    if (!parts?.length) {
      unmatched.push(group.seasonTitle && group.seasonTitle !== group.seriesTitle ? `${group.seriesTitle} — ${group.seasonTitle}` : group.seriesTitle);
      continue;
    }
    for (const part of parts) {
      const { hit } = part;
      if (!hit?.anilistId) continue;
      let item = byId.get(hit.anilistId);
      if (!item) {
        item = { hit, kind: group.kind, numbers: new Set(), partial: {}, crSeriesId: null, lastPlayed: 0 };
        byId.set(hit.anilistId, item);
      }
      if (part.primary && !item.crSeriesId) item.crSeriesId = group.seriesId;
      for (const n of part.numbers || group.episodeList || []) item.numbers.add(n);
      for (const [n, share] of Object.entries(part.partial || {})) item.partial[n] = Math.max(item.partial[n] || 0, share);
      item.lastPlayed = Math.max(item.lastPlayed, group.lastPlayed || 0);
    }
  }
  const items = [];
  for (const item of byId.values()) {
    const { hit } = item;
    const episodes = item.kind === "movie" ? 1 : positive(hit.episodes);
    if (episodes && !item.numbers.has(episodes) && (item.partial[episodes] || 0) >= FINAL_SHARE && item.numbers.size) item.numbers.add(episodes);
    if (!item.numbers.size && item.kind !== "movie") continue;
    const progress = historyProgress({ kind: item.kind, maxEpisode: Math.max(0, ...item.numbers), watchedCount: item.numbers.size }, episodes);
    items.push({
      anilistId: hit.anilistId,
      crSeriesId: item.crSeriesId,
      title: hit.title,
      cover: hit.cover || "",
      episodes,
      progress,
      finished: Boolean(episodes && progress >= episodes),
      lastPlayed: item.lastPlayed,
    });
  }
  return { items, unmatched: [...new Set(unmatched.filter(Boolean))] };
}

function positive(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function historyProgress(group, total) {
  if (group.kind === "movie") return 1;
  const episodes = positive(total);
  if (episodes && group.maxEpisode > episodes) return Math.min(group.watchedCount, episodes);
  return group.maxEpisode;
}
