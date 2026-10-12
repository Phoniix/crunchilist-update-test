// Live AI benchmark. Runs the real search and For you paths against each saved AI service,
// then replays the same shows with other prompt styles. Keys come from env vars
// (OPENAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY) or from the keys
// saved in Crunchilist in the local Chrome profile. Keys are only held in memory.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CHROME_SYSTEM, resolveModelResults } from "../lib/llm.js";
import { PROVIDERS, providerById } from "../lib/providers.js";

const EXTENSION_ID = "gnipbjamobhdlakdlgpjhfcjcbbjoefh";
const snapshot = JSON.parse(readFileSync(new URL("../fixtures/catalog-snapshot.json", import.meta.url), "utf8"));
const NOW = Date.now();
const args = process.argv.slice(2);
const only = args.find((arg) => !arg.startsWith("--"));
const skipVariants = args.includes("--no-variants");
const detailFile = args.find((arg) => arg.startsWith("--out="))?.slice(6);
const caseFilter = args.find((arg) => arg.startsWith("--cases="))?.slice(8).split(",").map(Number);
// --tune=openrouter:{"reasoning":{"enabled":false}} replaces a service's per-model extras for this run.
for (const arg of args.filter((value) => value.startsWith("--tune="))) {
  const spec = arg.slice(7);
  const at = spec.indexOf(":");
  const provider = providerById(spec.slice(0, at));
  const extra = JSON.parse(spec.slice(at + 1));
  const original = provider.tune;
  provider.tune = function tune(model) {
    const base = original.call(this, model);
    return { ...base, ...extra };
  };
}
// --models=gemini:gemini-3.8-flash|gemini-2.5-flash,groq:openai/gpt-oss-20b
const modelSweep = Object.fromEntries((args.find((arg) => arg.startsWith("--models="))?.slice(9) || "")
  .split(",").filter(Boolean).map((part) => {
    const at = part.indexOf(":");
    return [part.slice(0, at), part.slice(at + 1).split("|")];
  }));

const CASES = [
  { name: "For you", query: "", want: ["Romance"], avoid: ["Female Harem"] },
  { name: "short romance", query: "a short romance I haven't seen", want: ["Romance"], short: true },
  { name: "like Frieren but sadder", query: "like Frieren but sadder", want: ["Drama", "Tragedy"] },
  { name: "dark fantasy fights", query: "dark fantasy with strong fights", want: ["Fantasy", "Action"] },
  { name: "funny sports", query: "funny sports anime", want: ["Sports", "Comedy"] },
  { name: "isekai, no harem", query: "isekai without harem", want: ["Isekai"], avoid: ["Female Harem", "Male Harem"] },
];

function profileDir() {
  const root = join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data");
  try {
    for (const name of readdirSync(root)) {
      const dir = join(root, name, "Local Extension Settings", EXTENSION_ID);
      try {
        if (statSync(dir).isDirectory()) return dir;
      } catch {
        // Not this profile.
      }
    }
  } catch {
    // No Chrome profile on this machine.
  }
  return "";
}

function unsnappy(input) {
  let pos = 0;
  let size = 0;
  for (let shift = 0; ; shift += 7) {
    const byte = input[pos++];
    size |= (byte & 0x7f) << shift;
    if (byte < 0x80) break;
  }
  const out = Buffer.alloc(size);
  let at = 0;
  while (pos < input.length) {
    const tag = input[pos++];
    const kind = tag & 3;
    if (kind === 0) {
      let length = tag >> 2;
      if (length >= 60) {
        const bytes = length - 59;
        length = 0;
        for (let index = 0; index < bytes; index += 1) length |= input[pos++] << (8 * index);
      }
      length += 1;
      input.copy(out, at, pos, pos + length);
      pos += length;
      at += length;
      continue;
    }
    let length;
    let offset;
    if (kind === 1) {
      length = ((tag >> 2) & 7) + 4;
      offset = ((tag >> 5) << 8) | input[pos++];
    } else if (kind === 2) {
      length = (tag >> 2) + 1;
      offset = input.readUInt16LE(pos);
      pos += 2;
    } else {
      length = (tag >> 2) + 1;
      offset = input.readUInt32LE(pos);
      pos += 4;
    }
    for (let index = 0; index < length; index += 1, at += 1) out[at] = out[at - offset];
  }
  return out;
}

function varint(buffer, state) {
  let value = 0;
  for (let shift = 0; ; shift += 7) {
    const byte = buffer[state.pos++];
    value += (byte & 0x7f) * 2 ** shift;
    if (byte < 0x80) return value;
  }
}

function tableBlock(file, offset, size) {
  const raw = file.subarray(offset, offset + size);
  return file[offset + size] === 1 ? unsnappy(raw) : raw;
}

function tableText(file) {
  const footer = { pos: file.length - 48 };
  varint(file, footer);
  varint(file, footer);
  const index = tableBlock(file, varint(file, footer), varint(file, footer));
  const restarts = index.readUInt32LE(index.length - 4);
  const end = index.length - 4 - 4 * restarts;
  const state = { pos: 0 };
  const parts = [];
  while (state.pos < end) {
    varint(index, state);
    const unshared = varint(index, state);
    const valueLength = varint(index, state);
    state.pos += unshared;
    const handle = { pos: 0 };
    const value = index.subarray(state.pos, state.pos + valueLength);
    state.pos += valueLength;
    try {
      parts.push(tableBlock(file, varint(value, handle), varint(value, handle)).toString("utf8"));
    } catch {
      // A damaged block only hides that block.
    }
  }
  return parts.join("\n");
}

function chromeStorageText() {
  const dir = profileDir();
  if (!dir) return "";
  return readdirSync(dir)
    .filter((name) => /\.(log|ldb)$/.test(name))
    .sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs)
    .map((name) => {
      const file = readFileSync(join(dir, name));
      if (name.endsWith(".log")) return file.toString("utf8");
      try {
        return tableText(file);
      } catch {
        return "";
      }
    })
    .join("\n");
}

function loadKeys(text) {
  const env = { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY, groq: process.env.GROQ_API_KEY, openrouter: process.env.OPENROUTER_API_KEY };
  const keys = Object.fromEntries(Object.entries(env).filter(([, value]) => value));
  if (Object.keys(keys).length) return { keys, source: "environment" };
  const block = text.match(/apiKeys\\?"\s*:\s*\{([^}]{0,800})\}/)?.[1] || "";
  for (const [, id, value] of block.matchAll(/\\?"([a-z]+)\\?"\s*:\s*\\?"([^"\\]+)/g)) keys[id] = value;
  return { keys, source: "Chrome profile" };
}

function loadTaste(text) {
  const raw = text.match(/\\?"taste\\?"\s*:\s*(\{[^{}]*\})/)?.[1];
  try {
    return JSON.parse(raw.replace(/\\"/g, "\""));
  } catch {
    return { liked: ["Romance"], disliked: ["Female Harem"], dropped: [], hardAvoids: [], subDub: "dub" };
  }
}

function mask(key) {
  return key ? `${key.slice(0, 4)}…${key.slice(-2)} (${key.length} chars)` : "none";
}

function catalogFrom(shows) {
  const pick = (show) => ({ id: show.id, title: show.title, type: show.type, episodes: show.episodes, anilistId: show.anilistId });
  return {
    updatedAt: NOW, attemptedAt: NOW, locale: "en-US", complete: true,
    items: shows.map(pick),
    newest: snapshot.newest.map((id) => shows.find((show) => show.id === id)).filter(Boolean).map(pick),
  };
}

function cacheFrom(shows) {
  const cache = {};
  for (const show of shows) {
    cache[`series:${show.id}`] = show.anilistId
      ? {
        kind: "hit", anilistId: show.anilistId, cover: "", titles: show.titles || {}, synonyms: show.synonyms || [],
        tags: show.tags || [], hiddenTags: show.hiddenTags || [], tagRanks: show.tagRanks || {}, genres: show.genres || [],
        episodes: show.episodes ?? null, format: show.format || null, releaseStatus: show.releaseStatus || null,
        about: show.about || "", year: show.year ?? null, score: show.score ?? null, popularity: show.popularity ?? null,
        relations: show.relations || [], detailed: true, detailVersion: 2, cachedAt: NOW,
      }
      : { kind: "miss", cachedAt: NOW, expiresAt: NOW + 864e5 };
  }
  return cache;
}

function store(seed = {}) {
  const data = structuredClone(seed);
  return {
    async get(keys) {
      if (keys == null) return structuredClone(data);
      const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]));
    },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(keys) { for (const key of [].concat(keys)) delete data[key]; },
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lastCall = {};
async function pace(providerId) {
  const gap = { gemini: 6500, openrouter: 3500, groq: 2200, openai: 500 }[providerId] || 1000;
  const since = Date.now() - (lastCall[providerId] || 0);
  if (since < gap) await wait(gap - since);
  lastCall[providerId] = Date.now();
}

const calls = [];
const realFetch = globalThis.fetch;
function installFetch() {
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    const provider = PROVIDERS.find((row) => url.startsWith(row.baseUrl));
    if (!provider) {
      if (url.includes("anilist.co")) return new Response(JSON.stringify({ data: {} }), { status: 200 });
      throw new TypeError("Failed to fetch");
    }
    if (url.endsWith("/chat/completions")) await pace(provider.id);
    const started = Date.now();
    const row = { provider: provider.id, url, body: init.body ? JSON.parse(init.body) : null };
    calls.push(row);
    try {
      const response = await realFetch(url, init);
      const text = await response.text();
      const limits = Object.fromEntries([...response.headers].filter(([name]) => /ratelimit|retry-after/i.test(name)));
      Object.assign(row, { status: response.status, ms: Date.now() - started, text, limits });
      return new Response(text, { status: response.status, headers: response.headers });
    } catch (error) {
      Object.assign(row, { status: 0, ms: Date.now() - started, error: error?.name || String(error) });
      throw error;
    }
  };
}

function chatInfo(row) {
  let payload = null;
  try {
    payload = JSON.parse(row.text || "");
  } catch {
    payload = null;
  }
  if (Array.isArray(payload)) payload = payload[0];
  const choice = payload?.choices?.[0];
  return {
    content: choice?.message?.content || "",
    finish: choice?.finish_reason || "",
    model: payload?.model || row.body?.model || "",
    outTokens: payload?.usage?.completion_tokens ?? null,
    inTokens: payload?.usage?.prompt_tokens ?? null,
    error: payload?.error?.message || (row.status && row.status !== 200 ? (row.text || "").slice(0, 200) : row.error || ""),
  };
}

function candidatesFromBody(body) {
  const user = JSON.parse(body.messages.at(-1).content);
  return { user, list: (user.candidates || []).map((row) => ({ ...row, id: row.id || `n${row.n}` })) };
}

function judge(caseInfo, list, parsed) {
  const byId = new Map(list.map((row) => [row.id, row]));
  const picks = (parsed?.results || []).map((item) => byId.get(item.id)).filter(Boolean);
  const mismatched = (parsed?.results || []).filter((item) => {
    const title = byId.get(item.id)?.title || "";
    const others = list.filter((row) => row.id !== item.id && row.title.length > 6);
    return others.some((row) => (item.reason || "").toLowerCase().includes(row.title.toLowerCase().slice(0, 18))) && !(item.reason || "").toLowerCase().includes(title.toLowerCase().slice(0, 12));
  }).length;
  const has = (row, tags) => tags.some((tag) => (row.tags || []).includes(tag));
  const fit = caseInfo.want ? picks.filter((row) => has(row, caseInfo.want)).length : null;
  const avoided = caseInfo.avoid ? picks.filter((row) => has(row, caseInfo.avoid)).length : 0;
  const seen = picks.filter((row) => row.status === "finished" || row.status === "dropped").length;
  const long = caseInfo.short ? picks.filter((row) => (row.episodes || 0) > 13).length : 0;
  const confidences = (parsed?.results || []).map((item) => item.confidence);
  const briefs = (parsed?.results || []).map((item) => ({ text: item.reason || "", title: byId.get(item.id)?.title || "" }));
  return {
    mismatched,
    briefChars: briefs.length ? Math.round(briefs.reduce((sum, row) => sum + row.text.length, 0) / briefs.length) : 0,
    parrot: briefs.filter((row) => /your (love|preference|taste|interest)|you (like|love|enjoy|prefer)|matching your|fits your|harem/i.test(row.text)).length,
    titleStart: briefs.filter((row) => row.title && row.text.toLowerCase().startsWith(row.title.toLowerCase().slice(0, 12))).length,
    picks: picks.length,
    mentions: (parsed?.mentions || []).length,
    fit: picks.length ? fit / picks.length : 0,
    bad: avoided + seen + long,
    spread: confidences.length ? Math.max(...confidences) - Math.min(...confidences) : 0,
    titles: picks.map((row) => row.title),
    briefs: (parsed?.results || []).map((item) => item.reason),
  };
}

const VARIANTS = {
  json: (body) => ({ ...body, response_format: { type: "json_object" } }),
  numbered: (body) => {
    const { user } = candidatesFromBody(body);
    const list = user.candidates.map((row, index) => {
      const { id, audio, matched, ...facts } = row;
      return { n: index + 1, ...facts };
    });
    return {
      ...body,
      messages: [
        { role: "system", content: CHROME_SYSTEM },
        { role: "user", content: JSON.stringify({ profile: user.profile, request: user.request, hint: user.hint, list }) },
      ],
    };
  },
};

async function direct(provider, key, body, attempt = 0) {
  const result = await directOnce(provider, key, body);
  if (result.status !== 429 || attempt >= 2) return result;
  const hint = Number(String(result.text || "").match(/try again in ([\d.]+)\s*s/i)?.[1]) || Number(String(result.text || "").match(/"retryDelay"\s*:\s*"([\d.]+)s"/)?.[1]) || 20;
  process.stdout.write(`    rate limited, waiting ${Math.ceil(hint)} s\n`);
  await wait(Math.min(65, hint + 1) * 1000);
  return direct(provider, key, body, attempt + 1);
}

async function directOnce(provider, key, body) {
  await pace(provider.id);
  const started = Date.now();
  try {
    const response = await realFetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    const text = await response.text();
    return { status: response.status, ms: Date.now() - started, text, body };
  } catch (error) {
    return { status: 0, ms: Date.now() - started, error: error?.name || String(error), body };
  }
}

export { chromeStorageText, loadKeys };

async function main() {
  const text = chromeStorageText();
  const { keys, source } = loadKeys(text);
  if (args.includes("--keys-only")) {
    console.log(`Keys from ${source}: ${PROVIDERS.map((row) => `${row.label} ${mask(keys[row.id])}`).join(", ")}`);
    process.exit(0);
  }
  const taste = loadTaste(text);
  console.log(`Keys from ${source}: ${PROVIDERS.map((row) => `${row.label} ${mask(keys[row.id])}`).join(", ")}`);
  console.log(`Taste: likes ${taste.liked.join(", ") || "nothing"}, dislikes ${taste.disliked.join(", ") || "nothing"}, audio ${taste.subDub}`);
  const shows = snapshot.shows;
  globalThis.chrome = {
    storage: {
      local: store({
        crCatalog: catalogFrom(shows),
        crCornerState: {
          version: 2, library: {}, anilistCache: cacheFrom(shows), importMeta: { username: "", importedAt: 0, source: "" }, lastPullAt: 0,
          taste, settings: { aiService: "auto", apiKeys: keys }, lastObservation: null,
        },
      }),
      session: store(),
      onChanged: { addListener() {}, removeListener() {} },
    },
    runtime: { id: "bench", onMessage: { addListener: (fn) => { globalThis.__listen = fn; } }, onInstalled: { addListener() {} }, getURL: (path) => path, sendMessage: async () => {}, openOptionsPage: async () => {} },
    action: { onClicked: { addListener() {} }, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    tabs: { onUpdated: { addListener() {} }, onRemoved: { addListener() {} }, query: async () => [], create: async (info) => info, update: async () => ({}), remove: async () => {}, sendMessage: async () => {} },
    windows: { update: async () => {} },
    identity: { getRedirectURL: () => "https://bench.chromiumapp.org/" },
    permissions: { contains: async () => true },
    webNavigation: { onBeforeNavigate: { addListener() {} }, onCommitted: { addListener() {} }, onErrorOccurred: { addListener() {} }, onReferenceFragmentUpdated: { addListener() {} } },
  };
  installFetch();
  await import("../background/service-worker.js");
  const send = (type, payload = {}) => new Promise((resolve) => globalThis.__listen({ type, ...payload }, { id: "bench" }, resolve));

  const home = await send("catalogSearch", { query: "", site: "all" });
  const forYou = home.sections?.find((section) => section.title === "For you")?.items || [];
  const idsFor = {};
  idsFor["For you"] = forYou.map((item) => item.id);
  for (const item of CASES.filter((row) => row.query)) {
    const found = await send("catalogSearch", { query: item.query, site: "all" });
    idsFor[item.name] = (found.results || []).slice(0, 20).map((row) => row.id);
  }

  const services = PROVIDERS.filter((row) => keys[row.id] && (!only || row.id === only));
  const runs = services.flatMap((provider) => (modelSweep[provider.id] || [""]).map((model) => ({ provider, model })));
  const cases = CASES.filter((_, index) => !caseFilter || caseFilter.includes(index));
  const rows = [];
  const details = [];
  for (const { provider, model: forced } of runs) {
    await send("setSettings", { patch: { aiService: provider.id } });
    if (forced) {
      const saved = (await chrome.storage.local.get("crCornerState")).crCornerState;
      saved.settings.models = { ...(saved.settings.models || {}), [provider.id]: forced };
      await chrome.storage.local.set({ crCornerState: saved });
    }
    let shownLimits = false;
    for (const item of cases) {
      let before;
      let started;
      let answer;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        before = calls.length;
        started = Date.now();
        answer = await send("catalogRerank", { query: item.query, site: "all", ids: idsFor[item.name] });
        if (answer.results?.length || !/rate limit|quota/i.test(answer.note || "")) break;
        const last = calls.at(-1);
        const hint = Number(String(last?.text || "").match(/try again in ([\d.]+)s/i)?.[1]) || Number(String(last?.text || "").match(/"retryDelay"\s*:\s*"([\d.]+)s"/)?.[1]) || Number(last?.limits?.["retry-after"]) || 20;
        process.stdout.write(`    rate limited, waiting ${Math.ceil(hint)} s\n`);
        await wait(Math.min(65, hint + 1) * 1000);
      }
      const ms = Date.now() - started;
      const chat = calls.slice(before).filter((row) => row.url.endsWith("/chat/completions")).at(-1);
      if (chat?.limits && !shownLimits && Object.keys(chat.limits).length) {
        shownLimits = true;
        console.log(`    limits ${chat.body?.model}: ${Object.entries(chat.limits).map(([k, v]) => `${k.replace(/^x-ratelimit-/, "")}=${v}`).join(" ")}`);
      }
      const info = chat ? chatInfo(chat) : {};
      const list = chat?.body ? candidatesFromBody(chat.body).list : [];
      const parsed = chat && info.content ? resolveModelResults(list, info.content) : null;
      const verdict = judge(item, list, parsed?.ok ? parsed : null);
      const label = `${provider.label} ${chat?.body?.model || forced || ""}`.trim();
      const row = { service: label, prompt: "current (in extension)", case: item.name, ok: Boolean(answer.results?.length), ms, note: answer.note || "", finish: info.finish, model: info.model, inTokens: info.inTokens, outTokens: info.outTokens, ...verdict };
      rows.push(row);
      details.push({ ...row, content: info.content, error: info.error });
      process.stdout.write(`  ${label.padEnd(40)} current   ${item.name.padEnd(24)} ${row.ok ? "ok " : "ERR"} ${String(ms).padStart(6)} ms ${row.ok ? `${verdict.picks} picks, fit ${Math.round(verdict.fit * 100)}%, bad ${verdict.bad}` : `${row.note} ${info.error || ""}`.slice(0, 160)}\n`);
      if (skipVariants || !chat?.body) continue;
      for (const [variant, make] of Object.entries(VARIANTS)) {
        const body = make({ ...chat.body, model: info.model || chat.body.model });
        const result = await direct(provider, keys[provider.id], body);
        const vinfo = chatInfo(result);
        const vparsed = vinfo.content ? resolveModelResults(list, vinfo.content) : null;
        const vverdict = judge(item, list, vparsed?.ok ? vparsed : null);
        const vrow = { service: label, prompt: variant, case: item.name, ok: Boolean(vparsed?.ok), ms: result.ms, note: vinfo.error || (vparsed?.ok ? "" : "unreadable"), finish: vinfo.finish, model: vinfo.model, inTokens: vinfo.inTokens, outTokens: vinfo.outTokens, ...vverdict };
        rows.push(vrow);
        details.push({ ...vrow, content: vinfo.content });
        process.stdout.write(`  ${label.padEnd(40)} ${variant.padEnd(9)} ${item.name.padEnd(24)} ${vrow.ok ? "ok " : "ERR"} ${String(result.ms).padStart(6)} ms ${vrow.ok ? `${vverdict.picks} picks, fit ${Math.round(vverdict.fit * 100)}%, bad ${vverdict.bad}` : vrow.note.slice(0, 160)}\n`);
      }
    }
  }

  if (services.length > 1 && !only) {
    await send("setSettings", { patch: { aiService: "auto" } });
    const started = Date.now();
    const answer = await send("catalogRerank", { query: "something cozy", site: "all", ids: idsFor["short romance"] });
    const status = await send("modelStatus");
    console.log(`\nAuto: ${answer.results?.length ? "ok" : "ERR"} in ${Date.now() - started} ms. ${status.status?.detail || answer.note || ""}`);
  }

  console.log("\nSummary (fit = picks carrying the wanted tags; bad = finished, disliked, or too long for 'short')");
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.service} | ${row.prompt}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const [key, list] of groups) {
    const ok = list.filter((row) => row.ok);
    const avg = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
    console.log(`  ${key.padEnd(64)} ok ${ok.length}/${list.length}  avg ${Math.round(avg(list.map((row) => row.ms)))} ms  fit ${Math.round(avg(ok.map((row) => row.fit)) * 100)}%  bad ${ok.reduce((a, row) => a + row.bad, 0)}  cut off ${list.filter((row) => row.finish === "length").length}  picks ${avg(ok.map((row) => row.picks)).toFixed(1)}  mentions ${avg(ok.map((row) => row.mentions)).toFixed(1)}  in/out tokens ${Math.round(avg(ok.map((row) => row.inTokens || 0)))}/${Math.round(avg(ok.map((row) => row.outTokens || 0)))}  brief ${Math.round(avg(ok.map((row) => row.briefChars)))} chars  parrot ${ok.reduce((a, row) => a + row.parrot, 0)}  title-first ${ok.reduce((a, row) => a + row.titleStart, 0)}`);
  }
  if (detailFile) writeFileSync(detailFile, JSON.stringify(details, null, 2));
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
