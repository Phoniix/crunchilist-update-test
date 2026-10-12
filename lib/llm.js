import { pickProviderModel, providerById } from "./providers.js";
import { compactProfile } from "./taste.js";
import { normalizeTitle } from "./title-match.js";

export const SYSTEM_PROMPT = [
  "You help someone pick anime from the saved Crunchyroll list they can play.",
  "Recommend only entries from the supplied candidates. Give each pick's n and its title copied exactly. Never invent a title.",
  "Read each candidate's tags and about before choosing; skip candidates that do not fit the request even if they are listed first.",
  "Prefer unwatched titles over in-progress ones.",
  "Do not recommend finished or dropped titles unless the user explicitly asks for those.",
  "Never pick a title with a hardAvoids tag.",
  "results are the best 3 to 5 titles. rank starts at 1 for the best fit.",
  "Each brief is one or two short sentences, under 220 characters: what makes this show fit the request, with one concrete detail from its about, year, or length.",
  "Do not start a brief with the title, and do not repeat the user's tastes back to them.",
  "confidence is how well it fits this request: 85 to 95 for a near-perfect fit, 60 to 80 for a good fit, 40 to 55 for a partial fit. Rank 1 gets the highest. Judge each pick on its own.",
  "mentions are up to 2 other titles that fit less well. They are not ranked. Each note is one short sentence. Do not repeat a title from results.",
  "Score on a title is a public average from 1 to 100.",
  "continues means the show follows an earlier season. hasSequel means a later season exists.",
  'Return JSON only: {"results":[{"n":4,"title":"exact title","rank":1,"brief":"one or two sentences","confidence":84}],"mentions":[{"n":9,"title":"exact title","note":"one short sentence"}]}',
].join(" ");

const FORMAT_LABELS = {
  TV: "TV",
  TV_SHORT: "short",
  MOVIE: "movie",
  SPECIAL: "special",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "music",
};

const SOURCE_LABELS = {
  ORIGINAL: "original",
  MANGA: "manga",
  LIGHT_NOVEL: "light novel",
  VISUAL_NOVEL: "visual novel",
  VIDEO_GAME: "game",
  GAME: "game",
  NOVEL: "novel",
  WEB_NOVEL: "web novel",
  LIVE_ACTION: "live action",
  ANIME: "anime",
  COMIC: "comic",
  DOUJINSHI: "doujinshi",
  MULTIMEDIA_PROJECT: "multimedia",
  PICTURE_BOOK: "picture book",
  OTHER: "other",
};

function focusSentence(text, focus) {
  if (!focus?.length) return "";
  const words = focus.map((word) => String(word).toLowerCase()).filter((word) => word.length >= 3);
  return text.split(/(?<=[.!?])\s+/).find((sentence) => {
    const lower = sentence.toLowerCase();
    return words.some((word) => new RegExp(`\\b${word.replace(/[^a-z0-9]/g, "")}`).test(lower));
  }) || "";
}

function clipAbout(value, max = 220, focus = null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const lead = clipPlain(text, max);
  const extra = focusSentence(text, focus);
  if (!extra || lead.includes(extra.slice(0, 40))) return lead;
  return `${clipPlain(text, Math.max(80, max - Math.min(extra.length, 160)))} … ${clipPlain(extra, 160)}`;
}

function clipPlain(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (stop >= 80) return cut.slice(0, stop + 1).trim();
  const word = cut.lastIndexOf(" ");
  return (word > 80 ? cut.slice(0, word) : cut).trim();
}

export function modelShowFacts(candidate, { aboutChars = 220, tagCount = 6 } = {}) {
  const row = {
    title: candidate.title,
    status: candidate.status || "unwatched",
  };
  const format = FORMAT_LABELS[candidate.format];
  if (format) row.format = format;
  const episodes = Number.isFinite(candidate.episodes) ? candidate.episodes : null;
  if (episodes) row.episodes = episodes;
  const minutes = Number.isFinite(candidate.duration) ? candidate.duration : null;
  if (minutes) row.minutes = minutes;
  if (Number.isInteger(candidate.year)) row.year = candidate.year;
  if (candidate.season) row.season = String(candidate.season).toLowerCase();
  const source = SOURCE_LABELS[candidate.source];
  if (source) row.source = source;
  if (Number.isInteger(candidate.score)) row.score = candidate.score;
  if (candidate.country && candidate.country !== "JP") row.country = candidate.country;
  if (candidate.releaseStatus === "RELEASING") row.airing = "ongoing";
  if (candidate.releaseStatus === "NOT_YET_RELEASED") row.airing = "upcoming";
  if (candidate.continues) row.continues = true;
  if (candidate.hasSequel) row.hasSequel = true;
  const tags = [...(candidate.genres || []), ...(candidate.tags || [])].filter(Boolean).slice(0, tagCount);
  if (tags.length) row.tags = tags;
  const about = clipAbout(candidate.about, aboutChars, candidate.focus);
  if (about) row.about = about;
  return row;
}

export function compactCandidate(candidate, n) {
  return {
    n,
    ...modelShowFacts({
      ...candidate,
      episodes: Number.isFinite(candidate.episodes) ? candidate.episodes : candidate.crEpisodes ?? null,
    }, { tagCount: 10 }),
    ...(candidate.audio && candidate.audio !== "unknown" ? { audio: candidate.audio } : {}),
  };
}

// n must stay the 1-based position in candidates; resolveModelResults maps it back by position.
export function selectPromptCandidates(candidates, limit = 40) {
  return (candidates || []).slice(0, limit).map((candidate, index) => compactCandidate(candidate, index + 1));
}

export function buildChatBody({ model, taste, candidates, userText, chip, maxTokens = 900 }) {
  return {
    model,
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          profile: compactProfile(taste),
          candidates: selectPromptCandidates(candidates, 40),
          request: userText,
          hint: chip || null,
        }),
      },
    ],
  };
}

export const CHROME_PICK_SCHEMA = {
  type: "object",
  required: ["results", "mentions"],
  properties: {
    results: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        required: ["n", "title", "rank", "brief", "confidence"],
        properties: {
          n: { type: "integer" },
          title: { type: "string", maxLength: 120 },
          rank: { type: "integer" },
          brief: { type: "string", maxLength: 220 },
          confidence: { type: "integer" },
        },
      },
    },
    mentions: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: {
        type: "object",
        required: ["n", "title", "note"],
        properties: {
          n: { type: "integer" },
          title: { type: "string", maxLength: 120 },
          note: { type: "string", maxLength: 140 },
        },
      },
    },
  },
};

export const MODEL_CANDIDATES = 20;
export const LIGHT_MODEL_CANDIDATES = 12;
const CHROME_FACTS = { aboutChars: 150, tagCount: 5 };

export const CHROME_SYSTEM = [
  "You pick anime from a numbered list the user can play on Crunchyroll.",
  "n is the number from that list and title is that entry's title copied exactly. Never invent a title.",
  "Read each entry's tags and about before choosing. Do not just take the first numbers; skip entries that do not fit the request.",
  "Prefer unwatched titles. Skip finished and dropped unless the user asks.",
  "results are the best 3 to 5 titles. rank starts at 1 for the best fit.",
  "Each brief is one sentence about that same entry only: why it fits, with one fact from its about, year, or length. Start the brief with its title.",
  "confidence is how well it fits this request: 85 to 95 only for a near-perfect fit, 60 to 80 for a good fit, 40 to 55 for a partial fit. Judge each pick on its own.",
  "mentions are 1 or 2 other entries worth a look that fit less well. They are not ranked. Each note is one short sentence about that entry. Do not repeat an entry from results.",
  "Score on a title is a public average from 1 to 100. Do not retell a whole synopsis.",
  "continues means the show follows an earlier season. hasSequel means a later season exists.",
  'Return JSON only: {"results":[{"n":4,"title":"exact title","rank":1,"brief":"one sentence","confidence":84}],"mentions":[{"n":9,"title":"exact title","note":"one short sentence"}]}',
].join(" ");

export function buildChromeMessages({ taste, candidates, userText, chip, limit = MODEL_CANDIDATES }) {
  const kept = (candidates || []).slice(0, limit);
  const list = kept.map((candidate, index) => ({
    n: index + 1,
    ...modelShowFacts(candidate, CHROME_FACTS),
  }));
  return {
    system: CHROME_SYSTEM,
    user: JSON.stringify({
      profile: compactProfile(taste),
      request: userText,
      hint: chip || null,
      list,
    }),
    candidates: kept,
  };
}

export function parseJsonBlob(text) {
  if (!text) return null;
  let raw = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const attempt = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      try {
        return JSON.parse(value.replace(/,\s*([}\]])/g, "$1"));
      } catch {
        return null;
      }
    }
  };
  const direct = attempt(raw);
  if (direct) return direct;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const object = attempt(raw.slice(start, end + 1));
    if (object) return object;
  }
  const arrayStart = raw.indexOf("[");
  const arrayEnd = raw.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) return attempt(raw.slice(arrayStart, arrayEnd + 1));
  return null;
}

function clipReason(value, candidate, max = 360) {
  const reason = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\s.,;]*\(?\bconfidence\s*[:=]?\s*\d{1,3}\s*%?\)?[\s.]*$/i, ".")
    .replace(/^\.$/, "")
    .replace(/^["']|["']$/g, "")
    .trim()
    .slice(0, max);
  if (!reason) return "";
  if (candidate && normalizeTitle(reason) === normalizeTitle(candidate.title)) return "";
  return reason;
}

function readConfidence(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace("%", "").trim());
  if (!Number.isFinite(n)) return null;
  const percent = n > 0 && n <= 1 ? Math.round(n * 100) : Math.round(n);
  if (percent < 1) return null;
  return Math.max(40, Math.min(95, percent));
}

function readRank(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export function resolveModelResults(candidates, text) {
  const list = candidates || [];
  const byId = new Map();
  const byTitle = new Map();
  list.forEach((candidate, index) => {
    if (!candidate?.id) return;
    byId.set(String(candidate.id), candidate);
    const bare = String(candidate.id).replace(/^sight:/, "");
    if (bare) byId.set(bare, candidate);
    byId.set(String(index + 1), candidate);
    const title = normalizeTitle(candidate.title);
    if (title && !byTitle.has(title)) byTitle.set(title, candidate);
  });

  function resolveToken(token) {
    const raw = token == null ? "" : String(token).trim();
    if (!raw) return null;
    if (byId.has(raw)) return byId.get(raw);
    const title = normalizeTitle(raw);
    if (!title) return null;
    if (byTitle.has(title)) return byTitle.get(title);
    if (title.length < 4) return null;
    const hits = [];
    for (const [key, candidate] of byTitle) {
      if (key.includes(title) || title.includes(key)) hits.push(candidate);
    }
    return hits.length === 1 ? hits[0] : null;
  }

  const compacts = list
    .filter((candidate) => candidate?.id)
    .map((candidate) => ({ candidate, key: normalizeTitle(candidate.title).replace(/\s+/g, "") }))
    .filter((entry) => entry.key.length >= 4)
    .sort((a, b) => b.key.length - a.key.length);

  function opener(reason) {
    const lead = normalizeTitle(reason).replace(/\s+/g, "");
    return compacts.find((entry) => lead.startsWith(entry.key))?.candidate || null;
  }

  function pick(item) {
    const byNumber = resolveToken(item.n ?? item.index ?? item.id);
    const byName = resolveToken(item.title);
    let candidate = byName || byNumber || resolveToken(item.id);
    const text = item.brief || item.reason || item.note || "";
    const lead = opener(text);
    if (lead && lead !== candidate) {
      const own = candidate ? normalizeTitle(candidate.title).replace(/\s+/g, "") : "";
      const body = normalizeTitle(text).replace(/\s+/g, "");
      if (!own || own.length < 4 || !body.includes(own)) candidate = lead;
    }
    return candidate;
  }

  const picked = [];
  const mentions = [];
  const seen = new Set();
  function add(candidate, reason, { mention = false, confidence = null, rank = null } = {}) {
    if (!candidate?.id || seen.has(candidate.id)) return;
    const bucket = mention ? mentions : picked;
    if (bucket.length >= (mention ? 3 : 5)) return;
    const text = clipReason(reason, candidate, mention ? 160 : 360);
    if (!text) {
      if (mention) return;
    }
    seen.add(candidate.id);
    bucket.push({
      id: candidate.id,
      reason: text || "Matches your request.",
      rank: mention ? null : readRank(rank),
      confidence: mention ? null : readConfidence(confidence),
      mention,
      order: bucket.length,
    });
  }

  function formulaic(values) {
    if (values.length < 3 || values.some((value) => value == null)) return false;
    const step = values[0] - values[1];
    return step > 0 && values.every((value, index) => index === 0 || values[index - 1] - value === step);
  }

  function ourConfidence(item) {
    const fit = Number(list.find((candidate) => candidate.id === item.id)?.fit);
    return Number.isFinite(fit) ? Math.round(45 + Math.max(0, Math.min(1, fit)) * 50) : null;
  }

  function finish() {
    if (!picked.length) return { ok: false, results: [] };
    picked.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.order - b.order);
    const patterned = formulaic(picked.map((item) => item.confidence));
    let previous = 96;
    picked.forEach((item, index) => {
      item.rank = index + 1;
      const ours = ourConfidence(item);
      if (patterned && ours != null) item.confidence = null;
      item.confidenceEstimated = item.confidence == null;
      const blended = item.confidence != null && ours != null ? Math.round(0.6 * ours + 0.4 * item.confidence) : null;
      const wanted = blended ?? item.confidence ?? ours ?? 90 - index * 8;
      item.confidence = Math.max(40, Math.min(wanted, previous - 1));
      previous = item.confidence;
      delete item.order;
    });
    for (const item of mentions) delete item.order;
    return { ok: true, results: picked, mentions };
  }

  const parsed = parseJsonBlob(text);
  const items = parsed
    ? (Array.isArray(parsed) ? parsed : parsed.results || parsed.recommendations || parsed.picks || null)
    : null;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      add(pick(item), item.brief || item.reason || item.why || item.note || "", {
        confidence: item.confidence ?? item.fit,
        rank: item.rank,
      });
    }
    const extras = parsed && !Array.isArray(parsed) ? parsed.mentions || parsed.honorable || null : null;
    if (Array.isArray(extras)) {
      for (const item of extras) {
        if (!item || typeof item !== "object") continue;
        add(pick(item), item.note || item.brief || item.reason || item.why || "", { mention: true });
      }
    }
    if (picked.length) return finish();
  }

  let pending = null;
  for (const line of String(text || "").split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("}")) continue;
    const numbered = trimmed.match(/^(\d+)\s*(?:[.):]|[-–—|])\s*(.+)$/);
    if (numbered) {
      const rest = numbered[2].trim();
      const parts = rest.split(/\s*[-–—:|]\s+/);
      const candidate = resolveToken(numbered[1]) || resolveToken(parts[0]) || resolveToken(rest);
      const reason = parts.length > 1 && resolveToken(parts[0]) ? parts.slice(1).join(": ") : rest;
      const usable = candidate && normalizeTitle(reason) !== normalizeTitle(candidate.title) ? reason : "";
      if (candidate && !usable) pending = candidate;
      else {
        pending = null;
        add(candidate, usable);
      }
      continue;
    }
    if (pending) {
      add(pending, trimmed);
      pending = null;
      continue;
    }
    const titled = trimmed.match(/^["']?(.+?)["']?\s*[-–—:]\s+(.+)$/);
    if (titled) add(resolveToken(titled[1]), titled[2]);
  }
  if (picked.length) return finish();

  for (const sentence of String(text || "").split(/(?<=[.!?])\s+|\n+/)) {
    const norm = normalizeTitle(sentence);
    if (norm.length < 8) continue;
    for (const [title, candidate] of byTitle) {
      if (title.length < 4 || !norm.includes(title)) continue;
      add(candidate, sentence);
    }
  }
  return finish();
}

export function parseRecommendationJson(text, allowedIds) {
  if (!text) return { ok: false, results: [] };
  let raw = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return { ok: false, results: [] };
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return { ok: false, results: [] };
    }
  }

  const list = Array.isArray(parsed) ? parsed : parsed.results || parsed.recommendations || [];
  if (!Array.isArray(list)) return { ok: false, results: [] };
  const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds || []);
  const results = [];
  const seen = new Set();
  for (const item of list) {
    const id = item?.id == null ? "" : String(item.id);
    if (!id || !allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    const reason = String(item.reason || "").replace(/\s+/g, " ").trim().slice(0, 180);
    results.push({ id, reason: reason || "Matches your request." });
    if (results.length >= 5) break;
  }
  if (!results.length) return { ok: false, results: [] };
  return { ok: true, results };
}

export function messageText(payload) {
  return payload?.choices?.[0]?.message?.content || "";
}

export function pickChatModel(ids, avoid = "") {
  return pickProviderModel(providerById("openai"), ids, avoid);
}
