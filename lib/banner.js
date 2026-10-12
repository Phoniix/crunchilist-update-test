// Ordering for Home's banner and the Picked for you row, with and without AI.

// Turns taste scores into a 45-85 "match", inside the 40-95 range the AI uses for confidence.
// items arrive in the row's order; position breaks ties so equal scores don't all read the same.
export function tasteMatches(items, scoreFor) {
  const scores = items.map((item) => Math.max(0, Number(scoreFor(item)) || 0));
  const best = Math.max(1e-9, ...scores);
  const span = Math.max(1, items.length - 1);
  return new Map(items.map((item, index) => [item.id, Math.round(45 + 40 * (0.75 * (scores[index] / best) + 0.25 * (1 - index / span)))]));
}

const AI_RANK_DECAY = 0.08;

// AI picks first in the model's order, then its lower-ranked mentions, then the rest of the taste order.
export function orderForYou({ tasteIds = [], picks = null, tasteMatch = new Map() }) {
  const out = [];
  const seen = new Set();
  const add = (id, extra) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, match: tasteMatch.get(id) ?? null, reason: "", ai: false, ...extra });
  };
  const ranked = (picks || []).filter((pick) => !pick.mention).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  for (const pick of ranked) add(pick.id, { match: pick.confidence ?? tasteMatch.get(pick.id) ?? null, reason: pick.reason || "", ai: true });
  for (const pick of picks || []) if (pick.mention) add(pick.id, { reason: pick.reason || "", ai: true });
  for (const id of tasteIds) add(id);
  // The row is numbered, so a later card never shows a higher match than the one before it.
  let ceiling = Infinity;
  for (const row of out) {
    if (row.match == null) continue;
    row.match = Math.max(40, Math.min(row.match, ceiling));
    ceiling = row.match - 1;
  }
  return out;
}

const WEIGHTS = {
  ai: { ai: 0.4, trend: 0.25, taste: 0.2, fresh: 0.15 },
  plain: { ai: 0, trend: 0.4, taste: 0.35, fresh: 0.25 },
};
const TREND_POOL = 40;

const positionScore = (index, length) => (index < 0 || !length ? 0 : 1 - index / length);

// One blended score per show: AI rank and confidence, Crunchyroll popularity, taste, and a lift for shows you haven't started.
// Finished and dropped shows never appear, and at least one of the ten most popular always keeps a slot.
// exclude: ids a reroll has already shown.
export function rankBanner(options) {
  const { rows } = blendRows(options);
  return withTopTen(rows.slice(0, options.count ?? 6), rows);
}

const isTop = (row) => row.trend >= 0 && row.trend < 10;

function withTopTen(chosen, rows) {
  if (chosen.length && !chosen.some(isTop)) {
    const top = rows.find((row) => isTop(row) && !chosen.includes(row));
    if (top) chosen[chosen.length - 1] = top;
  }
  return chosen;
}

// The paged banner: count slides in pages of pageSize, mostly AI picks. AI's ranked picks lead, then its
// "also consider" mentions, then extraPicks (a second AI roll, AI-named Home rows). The last slide of each
// page goes to the blended order instead, and one of those is always a top-10 show. Without AI it is the blend.
export function galleryBanner(options) {
  const { count = 18, pageSize = 6, picks = null, extraPicks = [] } = options;
  const { rows, usable, trendIds, tasteMatch } = blendRows(options);
  const aiRows = [];
  const taken = new Set();
  const addAi = (pick) => {
    if (!pick?.id || taken.has(pick.id) || !usable(pick.id)) return;
    taken.add(pick.id);
    aiRows.push({ id: pick.id, score: 0, match: pick.confidence ?? tasteMatch.get(pick.id) ?? null, reason: pick.reason || "", ai: true, trend: trendIds.indexOf(pick.id) });
  };
  const ranked = (picks || []).filter((pick) => !pick.mention).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  ranked.forEach(addAi);
  (picks || []).filter((pick) => pick.mention).forEach(addAi);
  if (ranked.length) extraPicks.forEach(addAi);
  if (!aiRows.length) return withTopTen(rows.slice(0, count), rows);
  const others = rows.filter((row) => !taken.has(row.id));
  const top = others.findIndex(isTop);
  if (top > 0) others.unshift(...others.splice(top, 1));
  const out = [];
  for (let index = 0; index < count; index += 1) {
    const wantOther = index % pageSize === pageSize - 1;
    const next = (wantOther ? others.shift() : aiRows.shift()) || aiRows.shift() || others.shift();
    if (!next) break;
    out.push(next);
  }
  return out;
}

function blendRows({ shows, trending = [], tasteIds = [], picks = null, tasteMatch = new Map(), statusOf = () => "", hasArt = () => true, exclude = new Set() }) {
  const byId = new Map(shows.map((show) => [show.id, show]));
  const usable = (id) => {
    const show = byId.get(id);
    if (!show || exclude.has(id) || !hasArt(show)) return false;
    const status = statusOf(show);
    return status !== "finished" && status !== "dropped";
  };
  const trendIds = trending.filter(usable).slice(0, TREND_POOL);
  const tasteList = tasteIds.filter(usable);
  const aiPicks = (picks || []).filter((pick) => !pick.mention && usable(pick.id));
  const weights = aiPicks.length ? WEIGHTS.ai : WEIGHTS.plain;
  const aiById = new Map(aiPicks.map((pick) => [pick.id, pick]));
  const pool = [...new Set([...aiPicks.map((pick) => pick.id), ...tasteList, ...trendIds])];
  const rows = pool.map((id) => {
    const pick = aiById.get(id);
    const ai = pick ? ((pick.confidence ?? 60) / 100) * Math.max(0.4, 1 - ((pick.rank ?? aiPicks.length) - 1) * AI_RANK_DECAY) : 0;
    const trend = positionScore(trendIds.indexOf(id), trendIds.length);
    const taste = positionScore(tasteList.indexOf(id), tasteList.length);
    const fresh = statusOf(byId.get(id)) ? 0 : 1;
    const score = weights.ai * ai + weights.trend * trend + weights.taste * taste + weights.fresh * fresh;
    return {
      id,
      score,
      match: pick?.confidence ?? tasteMatch.get(id) ?? null,
      reason: pick?.reason || "",
      ai: Boolean(pick),
      trend: trendIds.indexOf(id),
    };
  });
  rows.sort((a, b) => b.score - a.score || (a.trend < 0 ? 1e9 : a.trend) - (b.trend < 0 ? 1e9 : b.trend));
  return { rows, usable, trendIds, tasteMatch };
}
