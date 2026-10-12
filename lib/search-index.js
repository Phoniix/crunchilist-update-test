import { placeVariants } from "./query.js";

const FIELD_WEIGHTS = { title: 3, alt: 2, labels: 1.6, about: 1 };
const K1 = 1.2;
const B = 0.75;
const SPINOFF = /\b(recap|compilation|special|specials|ova|oad|shorts?|chibi|mini|picture drama|on stage|concert|orchestra|behind the scenes|junior high)\b/i;
const STEM_SKIP = new Set(["is", "as", "us", "ss", "series", "news", "bus", "gas", "this", "anis"]);

export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .map(stem);
}

function stem(word) {
  if (word.length <= 4 || STEM_SKIP.has(word)) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("es") && /(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function docFromShow(show) {
  const titles = show.titles || {};
  const alt = [titles.english, titles.romaji, titles.native, ...(show.synonyms || [])]
    .filter((title) => title && title !== show.title);
  const format = show.format || (show.type === "movie" ? "MOVIE" : null);
  return {
    id: show.id,
    title: show.title,
    alt,
    labels: [...(show.genres || []), ...(show.tags || [])],
    hidden: show.hiddenTags || [],
    genres: show.genres || [],
    ranks: show.tagRanks || {},
    about: show.about || "",
    format,
    episodes: Number(show.episodes) > 0 ? Number(show.episodes) : null,
    year: Number(show.year) || null,
    score: Number(show.score) || null,
    popularity: Number(show.popularity) || null,
    anilistId: show.anilistId || null,
    sources: show.sources || [],
    item: show.item || show,
  };
}

export function buildIndex(shows) {
  const docs = (shows || []).map((show) => (show?.title && show?.id ? (show.alt ? show : docFromShow(show)) : null)).filter(Boolean);
  const df = new Map();
  const totals = { title: 0, alt: 0, labels: 0, about: 0 };
  const rows = docs.map((doc) => {
    const fields = {
      title: tokenize(doc.title),
      alt: tokenize(doc.alt.join(" ")),
      labels: tokenize([...doc.labels, ...(doc.hidden || [])].join(" ")),
      about: tokenize(doc.about),
    };
    const counts = {};
    const unique = new Set();
    for (const [name, tokens] of Object.entries(fields)) {
      totals[name] += tokens.length;
      const map = new Map();
      for (const token of tokens) {
        map.set(token, (map.get(token) || 0) + 1);
        unique.add(token);
      }
      counts[name] = { map, length: tokens.length };
    }
    for (const token of unique) df.set(token, (df.get(token) || 0) + 1);
    return {
      doc,
      counts,
      labelSet: new Set([...doc.labels, ...(doc.hidden || [])].map((label) => label.toLowerCase())),
      strength: labelStrength(doc),
      titleKey: tokenize(doc.title).join(" "),
      altKeys: doc.alt.map((title) => tokenize(title).join(" ")),
    };
  });
  const n = Math.max(1, docs.length);
  const avg = Object.fromEntries(Object.entries(totals).map(([name, total]) => [name, Math.max(1, total / n)]));
  const titleVocab = new Map();
  for (const row of rows) {
    for (const name of ["title", "alt"]) {
      for (const token of row.counts[name].map.keys()) {
        if (token.length >= 3 && /^[a-z]+$/.test(token)) titleVocab.set(token, (titleVocab.get(token) || 0) + 1);
      }
    }
  }
  const labelWords = new Map();
  const labelNames = new Set();
  for (const doc of docs) {
    for (const label of [...doc.labels, ...(doc.hidden || [])]) {
      labelNames.add(label.toLowerCase());
      const key = tokenize(label).join(" ");
      if (key && !key.includes(" ")) labelWords.set(key, label);
    }
  }
  return { rows, df, n, avg, labelWords, labelNames, titleVocab, byId: new Map(rows.map((row) => [row.doc.id, row])) };
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before = null;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let least = i;
    for (let j = 1; j <= b.length; j += 1) {
      let value = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (before && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, before[j - 2] + 1);
      row.push(value);
      least = Math.min(least, value);
    }
    if (least > max) return max + 1;
    before = previous;
    previous = row;
  }
  return previous[b.length];
}

export function correctWord(index, word) {
  if (!index.titleVocab || word.length < 4 || !/^[a-z]+$/.test(word) || index.df.has(word)) return word;
  const max = word.length >= 7 ? 2 : 1;
  let best = null;
  for (const [token, count] of index.titleVocab) {
    if (token[0] !== word[0]) continue;
    if (token.startsWith(word)) return word;
    if (Math.abs(token.length - word.length) > max) continue;
    const distance = editDistance(word, token, max);
    if (distance > max) continue;
    if (!best || distance < best.distance || (distance === best.distance && count > best.count)) best = { token, distance, count };
  }
  return best ? best.token : word;
}

function correctedKey(index, text) {
  return tokenize(text).map((word) => correctWord(index, word)).join(" ");
}

function labelStrength(doc) {
  const strength = new Map();
  const genres = new Set((doc.genres || []).map((genre) => genre.toLowerCase()));
  const ranks = doc.ranks || {};
  const genreStrength = Math.max(0.75, Math.min(0.85, 0.97 - 0.04 * genres.size));
  for (const label of [...doc.labels, ...(doc.hidden || [])]) {
    const key = label.toLowerCase();
    const rank = Number(ranks[label]);
    const value = genres.has(key) ? genreStrength : Number.isFinite(rank) && rank > 0 ? Math.min(1, rank / 100) : 0.7;
    strength.set(key, Math.max(strength.get(key) || 0, value));
  }
  return strength;
}

function idf(index, token) {
  const df = index.df.get(token) || 0;
  return Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
}

function bm25(index, row, terms) {
  let total = 0;
  let matched = 0;
  for (const term of terms) {
    let termScore = 0;
    for (const [name, weight] of Object.entries(FIELD_WEIGHTS)) {
      const field = row.counts[name];
      const tf = field.map.get(term) || 0;
      if (!tf) continue;
      const norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * field.length / index.avg[name]));
      termScore += weight * norm;
    }
    if (termScore > 0) matched += 1;
    total += termScore * idf(index, term);
  }
  return { total, matched };
}

function settingMatch(index, row, groups) {
  let total = 0;
  let matched = 0;
  for (const group of groups) {
    let best = 0;
    for (const term of group) best = Math.max(best, bm25(index, row, [term]).total);
    if (best > 0) matched += 1;
    total += best;
  }
  return { total, matched };
}

function titleCloseness(row, queryKey) {
  if (!queryKey) return 0;
  let best = 0;
  const words = queryKey.split(" ");
  const joined = words.length === 1 && queryKey.length >= 6 ? queryKey : "";
  [row.titleKey, ...row.altKeys].forEach((key, position) => {
    if (!key) return;
    const scale = position === 0 ? 1 : 0.9;
    if (key === queryKey) {
      best = Math.max(best, scale);
      return;
    }
    // "onepiece" or "chainsawman": a title typed without its spaces.
    if (joined && key.includes(" ")) {
      const compact = key.replace(/ /g, "");
      if (compact === joined) best = Math.max(best, scale * 0.95);
      else if (compact.startsWith(joined)) best = Math.max(best, scale * (0.55 + 0.4 * Math.min(1, joined.length / compact.length)));
    }
    const keyWords = key.split(" ");
    const all = words.every((word) => keyWords.some((part) => part === word || (word.length >= 3 && part.startsWith(word)) || (/[^\x00-\x7f]/.test(word) && part.includes(word))));
    if (!all) return;
    const starts = key.startsWith(queryKey) || keyWords[0].startsWith(words[0]);
    const tightness = Math.min(1, queryKey.length / key.length);
    best = Math.max(best, scale * ((starts ? 0.55 : 0.35) + 0.4 * tightness));
  });
  return best;
}

function conceptFit(row, concepts) {
  if (!concepts.length) return { fit: 0, hit: 0 };
  let sum = 0;
  let hit = 0;
  for (const concept of concepts) {
    let best = 0;
    for (const [label, weight] of Object.entries(concept.labels)) {
      const strength = row.strength.get(label.toLowerCase());
      if (strength) best = Math.max(best, weight * strength);
    }
    if (best > 0) hit += 1;
    let worst = 0;
    for (const [label, weight] of Object.entries(concept.avoid || {})) {
      const strength = row.strength.get(label.toLowerCase());
      if (strength) worst = Math.max(worst, weight * strength);
    }
    sum += Math.max(0, best - worst);
  }
  return { fit: sum / concepts.length, hit };
}

function filterFit(doc, filters) {
  const checks = [];
  let unknown = 0;
  const check = (known, passed) => {
    if (!known) unknown += 1;
    checks.push(known ? passed : null);
  };
  if (filters.format) check(Boolean(doc.format), doc.format === filters.format);
  if (filters.maxEpisodes) check(doc.format === "MOVIE" || doc.episodes != null, doc.format !== "MOVIE" && doc.episodes <= filters.maxEpisodes);
  if (filters.minEpisodes) check(doc.episodes != null, doc.episodes >= filters.minEpisodes);
  if (filters.yearFrom) check(doc.year != null, doc.year >= filters.yearFrom);
  if (filters.yearTo) check(doc.year != null, doc.year <= filters.yearTo);
  if (!checks.length) return { fit: 1, failed: false, unknown: 0, any: false };
  const passed = checks.filter((value) => value === true).length;
  return { fit: passed / checks.length, failed: checks.some((value) => value === false), unknown, any: true };
}

function similarity(row, target) {
  if (!target || row === target) return 0;
  const mine = row.labelSet;
  const theirs = target.labelSet;
  if (!mine.size || !theirs.size) return 0;
  let shared = 0;
  for (const label of mine) if (theirs.has(label)) shared += 1;
  return shared / (mine.size + theirs.size - shared);
}

function prior(doc) {
  const pop = doc.popularity ? Math.min(1, Math.log10(doc.popularity + 1) / 5.8) : 0;
  const quality = doc.score ? Math.max(0, Math.min(1, (doc.score - 55) / 35)) : 0.3;
  return { pop, quality, value: 0.6 * pop + 0.4 * quality };
}

function sameFranchise(a, b) {
  const first = (title) => tokenize(title).slice(0, 2).join(" ");
  return first(a.doc.title) && first(a.doc.title) === first(b.doc.title);
}

export function findTitle(index, text) {
  const key = correctedKey(index, text);
  if (!key) return null;
  let best = null;
  for (const row of index.rows) {
    const close = titleCloseness(row, key);
    if (!close) continue;
    const rank = close + 0.15 * prior(row.doc).pop - (SPINOFF.test(row.doc.title) ? 0.3 : 0);
    if (!best || rank > best.rank) best = { row, rank };
  }
  return best && best.rank >= 0.5 ? best.row : null;
}

export function searchIndex(index, parsed, {
  scoreFor = () => 0,
  statusFor = () => "unwatched",
  allowed = () => true,
  limit = 24,
  mode = "full",
  favorNamed = true,
} = {}) {
  const concepts = [];
  const terms = [];
  for (const concept of parsed.concepts || []) {
    const known = Object.keys(concept.labels).some((label) => index.labelNames?.has(label.toLowerCase()));
    if (known || mode !== "full") concepts.push(concept);
    else if (concept.word) terms.push(stem(concept.word));
  }
  for (const term of (parsed.terms || []).map((word) => correctWord(index, stem(word)))) {
    const label = mode === "full" ? index.labelWords?.get(term) : null;
    if (!label) {
      terms.push(term);
      continue;
    }
    const covered = concepts.some((concept) => Object.keys(concept.labels).some((name) => name.toLowerCase() === label.toLowerCase() && concept.labels[name] >= 0.5));
    if (!covered) concepts.push({ word: term, labels: { [label]: 1 } });
  }
  const settingGroups = (parsed.setting || []).map((word) => [...new Set((placeVariants(word) || [word]).map(stem))]);
  const filters = parsed.filters || {};
  const target = parsed.similarTo ? findTitle(index, parsed.similarTo) : null;
  const vague = mode === "full" && !terms.length && !concepts.length && !target && !settingGroups.length;
  const hasFilter = Object.values(filters).some(Boolean);
  if (vague && !hasFilter && !tokenize(parsed.raw || "").length) return { results: [], target: null };
  const queryKey = vague ? "" : correctedKey(index, parsed.raw || "");
  const keyWords = queryKey ? queryKey.split(" ").length : 0;
  const wantsSpinoff = SPINOFF.test(parsed.raw || "");
  const scored = [];
  for (const row of index.rows) {
    const { doc } = row;
    if (!allowed(doc)) continue;
    const status = statusFor(doc) || "unwatched";
    if (filters.unwatched && status !== "unwatched" && status !== "plan") continue;
    const close = titleCloseness(row, queryKey);
    if (mode === "title") {
      if (!close) continue;
      const rank = close * 100 + prior(doc).pop * 15 - (SPINOFF.test(doc.title) && !wantsSpinoff ? 25 : 0);
      scored.push({ doc, score: rank, fit: close, close });
      continue;
    }
    const text = terms.length ? bm25(index, row, terms) : { total: 0, matched: 0 };
    const place = settingGroups.length ? settingMatch(index, row, settingGroups) : { total: 0, matched: 0 };
    const concept = conceptFit(row, concepts);
    const filter = filterFit(doc, filters);
    const like = target ? similarity(row, target) : 0;
    if (target && (row === target || sameFranchise(row, target))) continue;
    const quality = prior(doc);
    const taste = Math.max(-1, Math.min(1, (Number(scoreFor(doc)) || 0) / 20));

    const parts = [];
    if (concepts.length) parts.push([concept.fit, target && favorNamed ? 2 : 3]);
    if (terms.length) parts.push([Math.min(1, text.matched / terms.length) * Math.min(1, text.total / (4 * terms.length)), concepts.length ? 1.5 : 3]);
    if (settingGroups.length) parts.push([(place.matched / settingGroups.length) * (0.6 + 0.4 * Math.min(1, place.total / (3 * settingGroups.length))), concepts.length || target ? 3.5 : 5]);
    if (filter.any) parts.push([filter.fit, 1.5]);
    if (target) parts.push([Math.min(1, like * 2.2), favorNamed ? 5 : 3]);
    if (filters.quality) parts.push([quality.quality, 1]);
    const weight = parts.reduce((sum, [, w]) => sum + w, 0);
    const fit = weight ? parts.reduce((sum, [value, w]) => sum + value * w, 0) / weight : 0;

    let score = fit * 100;
    const namesTitle = close >= 0.85 || (keyWords >= 2 && close >= 0.6);
    score += close * ((concepts.length || target) && !namesTitle ? 20 : 120);
    score += quality.value * (filters.quality ? 32 : concepts.length || target ? 26 : 12);
    score += taste * 10;
    if (status === "finished" || status === "dropped") score -= filters.rewatch ? 0 : 25;
    if (SPINOFF.test(doc.title) && !wantsSpinoff) score -= 18;
    const relevant = close > 0 || concept.hit > 0 || text.matched > 0 || place.matched > 0 || like > 0.08 || (!concepts.length && !terms.length && !target && !settingGroups.length);
    if (!relevant || filter.failed) continue;
    score -= filter.unknown * 20;
    scored.push({ doc, score, fit: Math.max(0, Math.min(1, fit)), close, conceptHits: concept.hit, settingHit: place.matched > 0 });
  }
  scored.sort((a, b) => b.score - a.score || (b.doc.popularity || 0) - (a.doc.popularity || 0) || String(a.doc.title).localeCompare(String(b.doc.title)));
  return { results: scored.slice(0, limit), target: target?.doc || null };
}
