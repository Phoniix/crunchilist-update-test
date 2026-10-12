import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
const snapshot = JSON.parse(readFileSync(new URL("../fixtures/catalog-snapshot.json", import.meta.url), "utf8"));
const NOW = Date.now();
const MOOD = "a short romance I haven't seen";

function catalogFrom(shows, { complete = true } = {}) {
  const pick = (show) => ({ id: show.id, title: show.title, type: show.type, episodes: show.episodes, anilistId: show.anilistId });
  return {
    updatedAt: complete ? NOW : 0,
    attemptedAt: NOW,
    locale: "en-US",
    complete,
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

function libraryWith(entries, { dirty = false } = {}) {
  const library = {};
  for (const [index, status] of entries) {
    const show = snapshot.shows.filter((row) => row.anilistId)[index];
    library[`anilist:${show.anilistId}`] = {
      anilistId: show.anilistId, crSeriesId: show.id, title: show.title, labels: [...(show.genres || []), ...(show.tags || [])],
      status, progress: status === "in_progress" ? 3 : null, episodes: show.episodes || null, dirty, updatedAt: NOW - 1000,
    };
  }
  return library;
}

const CONNECTED = { anilistClientId: "1", anilistToken: "token", anilistExpiresAt: NOW + 864e5, anilistViewerId: 7, anilistViewerName: "Mika" };

function anilistReply(body) {
  if (/SaveMediaListEntry/.test(body)) return { data: { SaveMediaListEntry: { id: 555, status: "PLANNING", progress: 0 } } };
  return { data: {} };
}

function chatReply(note = "fits") {
  const results = [1, 2, 3, 4, 5].map((n) => ({ n, rank: n, brief: `Picked by the service, it ${note}.`, confidence: 82 - n * 4 }));
  return { status: 200, body: { choices: [{ message: { content: JSON.stringify({ results, mentions: [] }) } }] } };
}

function goodModel(delay = 30) {
  return {
    availability: async () => "available",
    params: async () => ({ defaultTopK: 3, maxTemperature: 1 }),
    create: async () => ({
      async prompt(input) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        const list = JSON.parse(String(input)).list || [];
        return JSON.stringify({
          results: list.slice(0, 5).map((item, index) => ({ n: item.n, title: item.title, rank: index + 1, brief: `${item.title} fits. It is short.`, confidence: 80 - index * 6 })),
          mentions: list.slice(5, 7).map((item) => ({ n: item.n, title: item.title, note: "A looser fit." })),
        });
      },
      clone: async function clone() { return this; },
      destroy() {},
    }),
  };
}

const full = snapshot.shows;
const series = (count) => full.filter((show) => show.anilistId && show.type !== "movie" && show.episodes === count);
const entryOf = (state, show) => Object.values(state.library || {}).find((entry) => entry.crSeriesId === show.id || entry.anilistId === show.anilistId) || null;

const SCENARIOS = {
  "new user, no AniList account": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, see, expect }) {
      const state = await send("getState");
      expect("account card", !state.view.settings.anilistConnected && !state.view.sync.waiting, "not connected, nothing waiting");
      const home = await send("catalogSearch", { query: "", site: "all" });
      const titles = (home.sections || []).map((section) => section.title);
      see("home rails", titles.join(", "));
      expect("home has For you and no Continue", titles.includes("For you") && !titles.includes("Continue"), titles.join(", "));
      const mood = await send("catalogSearch", { query: MOOD, site: "all" });
      expect("instant results with AI rerank offered", mood.results?.length >= 5 && mood.rerank, `${mood.results?.length} results, rerank ${mood.rerank}`);
      const ranked = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
      expect("AI top picks", ranked.results?.filter((row) => !row.mention).length >= 3, ranked.results?.map((row) => row.title).slice(0, 5).join(" | ") || ranked.note);
      const saved = await send("setStatus", { id: mood.results[0].id, status: "plan" });
      see("status saved note", saved.syncNote || "(none)");
      expect("saved locally", saved.status === "plan", saved.error || saved.status);
    },
  },

  "browsing with the length and movie chips": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, see, expect }) {
      const episodesOf = (row) => Number((row.tags || []).find((tag) => / eps$/.test(tag))?.split(" ")[0]);
      for (const [chip, fits] of [["long", (row) => episodesOf(row) >= 24], ["one-cour", (row) => episodesOf(row) <= 13], ["movie", (row) => row.tags?.[0] === "Movie"]]) {
        for (const site of ["all", "crunchyroll"]) {
          const browse = await send("catalogSearch", { query: "", chip, site });
          const found = browse.results || [];
          see(`${chip} on ${site}`, `${found.length} results: ${found.slice(0, 3).map((row) => `${row.title} (${row.tags?.slice(0, 2).join(", ")})`).join(" | ")}`);
          expect(`${chip} on ${site} finds matching shows`, found.length >= 5 && found.every(fits), `${found.length} results`);
        }
        const typed = await send("catalogSearch", { query: "romance", chip, site: "all" });
        expect(`${chip} with a search finds matching shows`, (typed.results || []).length >= 1 && typed.results.every(fits), `${typed.results?.length || 0} results`);
      }
    },
  },

  "scrolling, sorting, and tag filters": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, see, expect }) {
      const first = await send("catalogSearch", { query: "", browse: true, site: "all" });
      const second = await send("catalogSearch", { query: "", browse: true, site: "all", offset: first.results.length });
      see("browse all", `${first.total} total, pages of ${first.results.length} and ${second.results.length}`);
      const firstIds = new Set(first.results.map((row) => row.id));
      expect("browse all pages without repeats", first.hasMore && second.results.length > 0 && second.results.every((row) => !firstIds.has(row.id)), `${second.results.length} on page two`);
      const titled = await send("catalogSearch", { query: "", sort: "title", site: "all" });
      const names = titled.results.map((row) => row.title);
      see("sorted by title", names.slice(0, 4).join(" | "));
      expect("title sort starts with a letter or number", /^[\p{L}\p{N}]/u.test(names[0] || ""), names[0]);
      const longest = await send("catalogSearch", { query: "", sort: "longest", chip: "long", site: "all" });
      const counts = longest.results.map((row) => Number((row.tags || []).find((tag) => / eps$/.test(tag))?.split(" ")[0]) || 0);
      expect("longest sort goes from most episodes down", counts.every((count, index) => index === 0 || counts[index - 1] >= count), counts.slice(0, 5).join(", "));
      const tagged = await send("catalogSearch", { query: "", tags: ["Comedy"], site: "all" });
      see("tagged Comedy", `${tagged.total} total: ${tagged.results.slice(0, 3).map((row) => row.title).join(" | ")}`);
      const plain = await send("catalogSearch", { query: "", browse: true, site: "all" });
      expect("a tag narrows the list", tagged.total > 0 && tagged.total < plain.total, `${tagged.total} of ${plain.total}`);
      const without = await send("catalogSearch", { query: "", without: ["Comedy"], site: "all" });
      const both = await send("catalogSearch", { query: "", tags: ["Romance"], without: ["Comedy"], site: "all" });
      const romance = await send("catalogSearch", { query: "", tags: ["Romance"], site: "all" });
      see("excluding Comedy", `${without.total} total; Romance without Comedy ${both.total} of ${romance.total}`);
      expect("excluding a tag leaves the rest", without.total === plain.total - tagged.total, `${without.total} + ${tagged.total} vs ${plain.total}`);
      expect("include and exclude combine", both.total > 0 && both.total < romance.total, `${both.total} of ${romance.total}`);
    },
  },

  "binge watcher finishing a whole 12-episode show": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, see, expect, read }) {
      const show = series(12)[0];
      const first = await send("episodeFinished", { id: show.id, episode: 1 });
      expect("first episode asks first", first.mode === "ask" && first.toast, `${first.mode} toast ${first.toast}`);
      const accepted = await send("resolveNotice", { id: first.noticeId, action: "update" });
      let entry = entryOf(await read(), show);
      expect("accepting sets Watching at 1", entry?.status === "in_progress" && entry?.progress === 1, `${entry?.status} ${entry?.progress} ${accepted.syncNote || ""}`);
      const modes = [];
      for (let episode = 2; episode <= 12; episode += 1) modes.push((await send("episodeFinished", { id: show.id, episode })).mode);
      entry = entryOf(await read(), show);
      see("modes for 2..12", modes.join(","));
      expect("later episodes update on their own", modes.every((mode) => mode === "auto"), modes.join(","));
      expect("the last episode completes the show", entry?.status === "finished" && entry?.progress === 12, `${entry?.status} ${entry?.progress}`);
      const again = await send("episodeFinished", { id: show.id, episode: 12 });
      expect("rewatching the finale changes nothing", again.mode === "none", again.mode);
      const state = await send("getState");
      expect("no leftover notifications", state.view.notices.length === 0, `${state.view.notices.length} notices`);
    },
  },

  "skipping around and undoing": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, see, expect, read }) {
      const show = series(24)[0] || series(12)[1];
      await send("setStatus", { id: show.id, status: "in_progress" });
      await send("syncAnilistProgress", { id: show.id, episode: 5 });
      const back = await send("episodeFinished", { id: show.id, episode: 3 });
      expect("an earlier episode does not lower progress", back.mode === "none" && entryOf(await read(), show)?.progress === 5, `${back.mode} ${entryOf(await read(), show)?.progress}`);
      const ahead = await send("episodeFinished", { id: show.id, episode: 8 });
      expect("jumping ahead updates progress", ahead.mode === "auto" && entryOf(await read(), show)?.progress === 8, `${ahead.mode} ${entryOf(await read(), show)?.progress}`);
      const undo = await send("syncAnilistProgress", { id: show.id, episode: ahead.offer.from, undo: true });
      const entry = entryOf(await read(), show);
      see("undo note", undo.syncNote || undo.error || "(none)");
      expect("undo restores the earlier progress and status", entry?.progress === 5 && entry?.status === "in_progress", `${entry?.status} ${entry?.progress}`);
    },
  },

  "rewatching a finished show": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, expect, read }) {
      const show = series(12)[2];
      await send("setStatus", { id: show.id, status: "finished" });
      const replay = await send("episodeFinished", { id: show.id, episode: 2 });
      const entry = entryOf(await read(), show);
      expect("a finished show stays finished", replay.mode === "none" && entry?.status === "finished", `${replay.mode} ${entry?.status} ${entry?.progress}`);
    },
  },

  "pop-ups off and notifications muted": {
    storage: { crCatalog: catalogFrom(full), state: { settings: { episodeDialogs: false, muteNotifications: true } } },
    model: goodModel(),
    async steps({ send, see, expect, read }) {
      const show = series(12)[3];
      const done = await send("episodeFinished", { id: show.id, episode: 3 });
      const entry = entryOf(await read(), show);
      expect("updates quietly", done.mode === "auto" && !done.toast, `${done.mode} toast ${done.toast}`);
      expect("show is now Watching at 3", entry?.status === "in_progress" && entry?.progress === 3, `${entry?.status} ${entry?.progress}`);
      const state = await send("getState");
      see("notice", state.view.notices.map((row) => `${row.kind}: ${row.title} — ${row.message}`).join(" | "));
      expect("a notification explains what changed", state.view.notices.length === 1 && state.view.notices[0].kind === "done", `${state.view.notices.length}`);
    },
  },

  "ignoring dozens of episode prompts": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, see, expect, read }) {
      const shows = series(12).slice(0, 35);
      for (const show of shows) await send("episodeFinished", { id: show.id, episode: 1 });
      await send("episodeFinished", { id: shows[34].id, episode: 2 });
      const state = await send("getState");
      expect("notifications are capped at 30", state.view.notices.length === 30, `${state.view.notices.length}`);
      expect("a newer prompt replaces the older one for the same show", state.view.notices.filter((row) => row.title === state.view.notices[0].title).length === 1, state.view.notices[0].message);
      const all = await send("resolveAllNotices", { action: "update" });
      see("update all note", all.syncNote);
      const saved = await read();
      const watching = shows.filter((show) => entryOf(saved, show)?.status === "in_progress").length;
      expect("update all sets every listed show to Watching", watching === 30 && all.view.notices.length === 0, `${watching} watching, ${all.view.notices.length} left`);
    },
  },

  "a stale prompt after changing the show by hand": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, expect, read }) {
      const show = series(12)[5];
      const ask = await send("episodeFinished", { id: show.id, episode: 3 });
      await send("setStatus", { id: show.id, status: "finished" });
      const state = await send("getState");
      expect("the stale prompt is hidden", state.view.notices.length === 0, `${state.view.notices.length}`);
      await send("resolveNotice", { id: ask.noticeId, action: "update" });
      const entry = entryOf(await read(), show);
      expect("acting on it later does not undo the change", entry?.status === "finished", entry?.status);
    },
  },

  "odd things typed into search": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, see, expect }) {
      const queries = ["   ", "<script>alert(1)</script>", "進撃の巨人", "🔥 anime", "FRIEREN", "frieren!!!", "a".repeat(5000), "'; DROP TABLE shows;--", "rom com", "something like one piece but shorter", "0", "the", "%%%"];
      for (const query of queries) {
        const started = Date.now();
        const result = await send("catalogSearch", { query, site: "all" });
        const took = Date.now() - started;
        const label = query.length > 30 ? `${query.slice(0, 12)}… (${query.length} chars)` : JSON.stringify(query);
        see(label, `${result.ok === false ? `error ${result.error}` : `${result.results?.length ?? 0} results${result.sections ? ` / ${result.sections.length} home rows` : ""}`} in ${took} ms; first: ${result.results?.[0]?.title || "-"}${result.note ? `; note: ${result.note}` : ""}`);
        expect(`${label} answers without error, quickly`, result.ok !== false && took < 1500, `${took} ms`);
      }
      const shouty = await send("catalogSearch", { query: "FRIEREN", site: "all" });
      expect("capitals still find the show", /frieren/i.test(shouty.results?.[0]?.title || ""), shouty.results?.[0]?.title);
      const native = await send("catalogSearch", { query: "進撃の巨人", site: "all" });
      expect("a Japanese title finds the show", /attack on titan/i.test(native.results?.[0]?.title || ""), native.results?.[0]?.title);
      const partial = await send("catalogSearch", { query: "巨人", site: "all" });
      see("part of a Japanese title", partial.results.slice(0, 3).map((row) => row.title).join(" | ") || "(nothing)");
      const accented = await send("catalogSearch", { query: "friéren", site: "all" });
      expect("accents still match", /frieren/i.test(accented.results?.[0]?.title || ""), accented.results?.[0]?.title);
      for (const query of ["%%%", "0", "🔥"]) {
        const junk = await send("catalogSearch", { query, site: "all" });
        expect(`${JSON.stringify(query)} says no matches instead of a random list`, (junk.results || []).length === 0, `${junk.results?.length} results`);
      }
      const suggest = await send("catalogSuggest", { query: "<img src=x onerror=alert(1)>", site: "all" });
      expect("suggestions handle markup safely", suggest.ok !== false, suggest.error || "ok");
    },
  },

  "filter and paging extremes": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, see, expect }) {
      const clash = await send("catalogSearch", { query: "", tags: ["Comedy"], without: ["comedy"], site: "all" });
      see("include and exclude the same tag", `${clash.total} results; note: ${clash.note || "(none)"}`);
      expect("the same tag both ways gives nothing", clash.total === 0, clash.total);
      const unknown = await send("catalogSearch", { query: "", tags: ["Not A Real Tag"], site: "all" });
      expect("an unknown tag gives nothing", unknown.total === 0, unknown.total);
      const past = await send("catalogSearch", { query: "", browse: true, offset: 999999, site: "all" });
      expect("paging past the end is empty and stops", (past.results || []).length === 0 && !past.hasMore, `${past.results?.length} hasMore ${past.hasMore}`);
      const negative = await send("catalogSearch", { query: "", browse: true, offset: -50, site: "all" });
      expect("a negative offset starts at the top", negative.offset === 0 && negative.results.length > 0, `${negative.offset}`);
      const huge = await send("catalogSearch", { query: "", browse: true, limit: 100000, site: "all" });
      expect("page size is capped", huge.results.length <= 60, huge.results.length);
      const junk = await send("catalogSearch", { query: "", sort: "chaos", tags: "Comedy", without: null, site: "all" });
      expect("bad sort and tag values are ignored", junk.ok !== false, junk.error || `${junk.results?.length ?? junk.sections?.length}`);
      const movies = await send("catalogSearch", { query: "", chip: "movie", sort: "shortest", site: "all" });
      see("movies by fewest episodes", movies.results.slice(0, 3).map((row) => row.title).join(" | "));
      const all = [];
      let offset = 0;
      for (let page = 0; page < 200; page += 1) {
        const next = await send("catalogSearch", { query: "", tags: ["Comedy"], sort: "title", offset, site: "all" });
        all.push(...next.results);
        offset += next.results.length;
        if (!next.hasMore) break;
      }
      expect("paging through a whole filter returns each show once", all.length === new Set(all.map((row) => row.id)).size && all.length === (await send("catalogSearch", { query: "", tags: ["Comedy"], site: "all" })).total, `${all.length} rows, ${new Set(all.map((row) => row.id)).size} unique`);
    },
  },

  "marking shows while scrolling": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, see, expect }) {
      const before = await send("catalogSearch", { query: "", browse: true, limit: 48, site: "all" });
      const first = await send("catalogSearch", { query: "", browse: true, site: "all" });
      for (const row of first.results.slice(0, 3)) await send("setStatus", { id: row.id, status: "plan" });
      await send("setStatus", { id: first.results[5].id, status: "finished" });
      const second = await send("catalogSearch", { query: "", browse: true, offset: first.results.length, site: "all" });
      const seen = new Set(first.results.map((row) => row.id));
      const repeats = second.results.filter((row) => seen.has(row.id));
      see("page two after marking", `${second.results.length} rows, ${repeats.length} repeats: ${repeats.map((row) => row.title).join(" | ")}`);
      expect("page two does not repeat page one", repeats.length === 0, `${repeats.length} repeats`);
      const skipped = before.results.slice(24).filter((row) => !second.results.some((next) => next.id === row.id));
      expect("nothing gets skipped between pages", skipped.length === 0, `${skipped.length} skipped`);
      const restart = await send("catalogSearch", { query: "", browse: true, site: "all" });
      const marked = restart.results.find((row) => row.id === first.results[0].id);
      see("a fresh search shows the new status", marked ? `${marked.title}: ${marked.status}` : "moved off page one");
    },
  },

  "tampering with settings": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, see, expect, read }) {
      await send("setSettings", { patch: { episodeDialogs: "no", favorNamed: 1, muteNotifications: "yes", anilistToken: "stolen", anilistViewerId: 1 } });
      const saved = (await read()).settings;
      see("saved switches", `dialogs ${saved.episodeDialogs}, favorNamed ${saved.favorNamed}, mute ${saved.muteNotifications}`);
      expect("a token cannot be set from a page", !saved.anilistToken && saved.anilistViewerId == null, `${saved.anilistToken} ${saved.anilistViewerId}`);
      expect("switches stay true or false", [saved.episodeDialogs, saved.favorNamed, saved.muteNotifications].every((value) => value === undefined || typeof value === "boolean"), JSON.stringify([saved.episodeDialogs, saved.favorNamed, saved.muteNotifications]));
      await send("setSettings", { patch: { baseUrl: "javascript:alert(1)" } });
      const after = (await read()).settings;
      expect("a page cannot change the AI address", !/^javascript:/i.test(after.baseUrl || ""), after.baseUrl);
      const evil = await send("setSettings", { patch: { providerKey: { id: "evil.example", key: "x" }, aiService: "evil" } });
      expect("an unknown AI service is refused", evil.ok === false, evil.error || "accepted");
      await send("setSettings", { patch: { apiKey: "sk-secret-123" } });
      await send("setSettings", { patch: { providerKey: { id: "gemini", key: "AIza-secret-456" } } });
      const view = (await send("getState")).view;
      const json = JSON.stringify(view);
      expect("secrets never reach the page", !json.includes("sk-secret-123") && !json.includes("AIza-secret-456") && !json.includes("stolen"), "checked view JSON");
      expect("the page only learns which services have keys", view.settings.keys?.openai === true && view.settings.keys?.gemini === true, JSON.stringify(view.settings.keys));
    },
  },

  "a huge library": {
    storage: {
      crCatalog: catalogFrom(full),
      state: { library: libraryWith(full.filter((show) => show.anilistId).slice(0, 1500).map((_, index) => [index, ["finished", "plan", "in_progress", "dropped"][index % 4]])) },
    },
    model: goodModel(),
    async steps({ send, see, expect }) {
      // A single timing swings with whatever else the machine is doing, so each step runs three times:
      // the median must meet the limit, and the first (cold) run gets twice the room.
      const timed = async (run) => {
        const times = [];
        let reply;
        for (let i = 0; i < 3; i += 1) {
          const started = Date.now();
          reply = await run();
          times.push(Date.now() - started);
        }
        return { reply, first: times[0], median: [...times].sort((a, b) => a - b)[1] };
      };
      const state = await timed(() => send("getState"));
      const home = await timed(() => send("catalogSearch", { query: "", site: "all" }));
      const mood = await timed(() => send("catalogSearch", { query: MOOD, site: "all" }));
      const save = await timed(() => send("setStatus", { id: mood.reply.results[0].id, status: "plan" }));
      const limits = [[state, 800], [home, 1500], [mood, 1500], [save, 800]];
      const shown = limits.map(([t]) => `${t.median} (first ${t.first})`).join(" / ");
      see("timings, median of 3", `getState ${state.median} ms, home ${home.median} ms, mood ${mood.median} ms, save ${save.median} ms; first runs ${state.first}/${home.first}/${mood.first}/${save.first} ms; ${Object.keys(state.reply.view).length} view keys`);
      expect("stays fast with 1500 shows tracked", limits.every(([t, limit]) => t.median < limit && t.first < limit * 2), shown);
      const unseen = await send("catalogSearch", { query: MOOD, site: "all" });
      const watchedShown = (unseen.results || []).filter((row) => row.status === "finished").length;
      see("finished shows in an 'I haven't seen' search", watchedShown);
      expect("'haven't seen' leaves out finished shows", watchedShown === 0, watchedShown);
    },
  },

  "a hard avoid on horror": {
    storage: { crCatalog: catalogFrom(full), state: { taste: { liked: [], disliked: [], dropped: [], hardAvoids: ["Horror"], subDub: "any" } } },
    model: goodModel(),
    async steps({ send, see, expect }) {
      const isHorror = (row) => full.find((show) => `sight:${show.id}` === row.id || show.id === row.id)?.genres?.includes("Horror");
      const browse = await send("catalogSearch", { query: "", browse: true, limit: 60, site: "all" });
      expect("browsing leaves out horror", !browse.results.some(isHorror), browse.results.filter(isHorror).map((row) => row.title).join(" | ") || "none");
      const asked = await send("catalogSearch", { query: "horror", site: "all" });
      see("searching 'horror' anyway", `${asked.results.length} results; ${asked.results.filter(isHorror).length} horror; note: ${asked.note || "(none)"}`);
      const named = await send("catalogSearch", { query: "chainsaw man", site: "all" });
      see("searching a horror show by name", `${named.results.slice(0, 3).map((row) => row.title).join(" | ") || "(nothing)"}; note: ${named.note || "(none)"}`);
      expect("explains the named show is hidden by the avoid list", /chainsaw man.*avoid horror/i.test(named.note || ""), named.note || "(none)");
      const plain = await send("catalogSearch", { query: "frieren", site: "all" });
      expect("no avoid note for unrelated searches", !/avoid/i.test(plain.note || ""), plain.note || "(none)");
    },
  },

  "search side panel inspired by recent searches": (() => {
    const prompts = [];
    const model = goodModel();
    const create = model.create;
    model.create = async (...args) => {
      const session = await create(...args);
      const prompt = session.prompt;
      session.prompt = async (input) => { prompts.push(String(input)); return prompt.call(session, input); };
      return session;
    };
    return {
      storage: {
        crCatalog: catalogFrom(full),
        state: { library: libraryWith([[0, "finished"], [1, "in_progress"], [2, "dropped"]]), taste: { liked: ["Romance"], disliked: [], dropped: [], hardAvoids: ["Horror"], subDub: "any" } },
      },
      model,
      async steps({ send, see, expect, read }) {
        const state = await read();
        const watchedIds = new Set(Object.values(state.library).filter((entry) => entry.status !== "plan").map((entry) => `sight:${entry.crSeriesId}`));
        const watchedTitles = Object.values(state.library).filter((entry) => ["finished", "in_progress"].includes(entry.status)).map((entry) => entry.title);
        const isHorror = (row) => full.find((show) => `sight:${show.id}` === row.id)?.genres?.includes("Horror");
        const empty = await send("searchInspired", { searches: [] });
        see("with no searches", `${empty.results.length} picks, ai ${empty.ai}: ${empty.results.slice(0, 3).map((row) => `${row.title} (${row.reason})`).join(" | ")}`);
        expect("no searches yet still fills the panel from taste, without AI", empty.results.length >= 3 && !empty.ai && empty.results.every((row) => row.reason === "Fits your taste"), `${empty.results.length} picks`);
        const searches = ["sports anime about a team", "a short romance I have not seen", "something scary"];
        const plain = await send("searchInspired", { searches, ai: false });
        see("engine blend", plain.results.map((row) => `${row.title} (${row.reason})`).join(" | "));
        expect("the engine blend takes from more than one search", new Set(plain.results.map((row) => row.reason)).size >= 2, [...new Set(plain.results.map((row) => row.reason))].join(" | "));
        const picked = await send("searchInspired", { searches });
        see("AI picks", `${picked.by}: ${picked.results.map((row) => row.title).join(" | ")}`);
        expect("AI picks from the searches", picked.ai && picked.results.length >= 3, picked.note || `${picked.results.length} picks`);
        const all = [...plain.results, ...picked.results, ...empty.results];
        expect("never suggests shows already watched, watching or dropped", !all.some((row) => watchedIds.has(row.id)), all.filter((row) => watchedIds.has(row.id)).map((row) => row.title).join(" | ") || "none");
        expect("respects hard avoids even when a search asks for them", !all.some(isHorror), all.filter(isHorror).map((row) => row.title).join(" | ") || "none");
        const ask = prompts.at(-1) || "";
        expect("the AI request names the searches and the watch history", searches.every((query) => ask.includes(query)) && watchedTitles.every((title) => ask.includes(title)), ask.slice(0, 160));
        const again = await send("searchInspired", { searches });
        expect("asking again with the same searches reuses the answer", again.cached === true && prompts.length === 1, `cached ${again.cached}, ${prompts.length} model calls`);
        await send("setSettings", { patch: { useAi: false } });
        const off = await send("searchInspired", { searches });
        expect("with AI off the engine blend shows", !off.ai && off.results.length >= 3, `ai ${off.ai}, ${off.results.length} picks`);
      },
    };
  })(),

  "generated home rows": (() => {
    const prompts = [];
    const themes = [
      { title: "Scary nights", query: "horror", why: "Spooky." },
      { title: "Heart flutters", query: "romance", why: "You love romance." },
      { title: "Laugh tracks", query: "comedy", why: "Light and funny." },
      { title: "Big fights", query: "action", why: "Action you'll like." },
      { title: "Other worlds", query: "fantasy", why: "Fantasy picks." },
      { title: "Game day", query: "sports", why: "Team spirit." },
    ];
    const base = goodModel();
    const model = {
      ...base,
      create: async (options) => {
        const session = await base.create(options);
        return {
          ...session,
          async prompt(input, extra) {
            if (!String(input).includes("topTags")) return session.prompt(input, extra);
            prompts.push(String(input));
            if (globalThis.__homeBroken) return "sorry, no JSON today";
            return JSON.stringify({ rows: themes });
          },
          clone: async function clone() { return this; },
        };
      },
    };
    return {
      storage: {
        crCatalog: catalogFrom(full),
        state: { library: libraryWith([[0, "finished"], [1, "in_progress"], [2, "dropped"]]), taste: { liked: ["Romance"], disliked: [], dropped: [], hardAvoids: ["Horror"], subDub: "any" } },
      },
      model,
      async steps({ send, see, expect, read }) {
        const state = await read();
        const watchedIds = new Set(Object.values(state.library).map((entry) => entry.crSeriesId));
        const watchedTitles = Object.values(state.library).filter((entry) => ["finished", "in_progress"].includes(entry.status)).map((entry) => entry.title);
        const known = new Set(full.map((show) => show.id));
        const isHorror = (id) => full.find((show) => show.id === id)?.genres?.includes("Horror");
        const saved = async () => (await chrome.storage.local.get("crHomeRows")).crHomeRows;
        const age = async (patch) => chrome.storage.local.set({ crHomeRows: { ...(await saved()), ...patch } });

        const first = await send("homeRows", { searches: ["space adventure"] });
        see("rows", first.rows.map((row) => `${row.title} [${row.query}] ${row.ids.length}`).join(" | "));
        expect("AI names 4-6 rows filled by the search engine", first.ai && first.rows.length >= 4 && first.rows.length <= 6 && first.rows.every((row) => row.ids.length >= 5), `ai ${first.ai}, ${first.rows.length} rows`);
        const ids = first.rows.flatMap((row) => row.ids);
        expect("every show is a real catalog show", ids.every((id) => known.has(id)), ids.filter((id) => !known.has(id)).join(" ") || "all known");
        expect("no show appears in two rows", new Set(ids).size === ids.length, `${ids.length} ids, ${new Set(ids).size} unique`);
        expect("no watched, watching or dropped shows", !ids.some((id) => watchedIds.has(id)), ids.filter((id) => watchedIds.has(id)).join(" ") || "none");
        expect("a row asking for a hard-avoided tag is dropped, and no avoided shows appear", !first.rows.some((row) => row.title === "Scary nights") && !ids.some(isHorror), first.rows.map((row) => row.title).join(" | "));
        const ask = prompts.at(-1) || "";
        expect("the prompt carries recent watching and searches", watchedTitles.every((title) => ask.includes(title)) && ask.includes("space adventure"), ask.slice(0, 160));

        const again = await send("homeRows", { searches: ["space adventure"] });
        expect("a later visit reuses the saved rows", prompts.length === 1 && again.createdAt === first.createdAt, `${prompts.length} model calls`);
        await send("homeRows", { searches: ["giant robots", "space adventure"] });
        expect("new activity within the hour keeps the rows", prompts.length === 1, `${prompts.length} model calls`);
        await age({ createdAt: Date.now() - 2 * 60 * 60_000 });
        await send("homeRows", { searches: ["giant robots", "space adventure"] });
        expect("new activity after an hour makes new rows", prompts.length === 2, `${prompts.length} model calls`);
        await send("homeRows", { searches: ["giant robots", "space adventure"] });
        expect("no new activity keeps them", prompts.length === 2, `${prompts.length} model calls`);
        await age({ expiresAt: Date.now() - 1 });
        await send("homeRows", { searches: ["giant robots", "space adventure"] });
        expect("12 hours later they are remade", prompts.length === 3, `${prompts.length} model calls`);
        await send("homeRows", { searches: [], fresh: true });
        expect("New rows remakes them on demand", prompts.length === 4, `${prompts.length} model calls`);
        const record = await saved();
        expect("good AI rows last 12 hours", Math.round((record.expiresAt - record.createdAt) / 3_600_000) === 12, `${(record.expiresAt - record.createdAt) / 3_600_000} h`);

        const nudged = await send("homeRows", { searches: [], nudge: "  rainy   day " });
        const nudgeAsk = JSON.parse(prompts.at(-1) || "{}");
        expect("typing a nudge remakes the rows with it in the prompt", prompts.length === 5 && nudgeAsk.nudge === "rainy day" && nudged.nudge === "rainy day", `${prompts.length} calls, nudge ${nudgeAsk.nudge}`);
        await age({ createdAt: Date.now() - 2 * 60 * 60_000 });
        const carried = await send("homeRows", { searches: ["mecha"] });
        expect("an activity refresh keeps the nudge", prompts.length === 6 && JSON.parse(prompts.at(-1)).nudge === "rainy day" && carried.nudge === "rainy day", `${prompts.length} calls, nudge ${carried.nudge}`);
        await send("homeRows", { searches: ["mecha"] });
        expect("a plain visit keeps the nudged rows", prompts.length === 6, `${prompts.length} calls`);
        await age({ nudgeUntil: Date.now() - 1 });
        const lapsed = await send("homeRows", { searches: ["mecha"] });
        expect("12 hours after typing, the rows go back to plain taste", prompts.length === 7 && !("nudge" in JSON.parse(prompts.at(-1))) && lapsed.nudge === "", `${prompts.length} calls, nudge "${lapsed.nudge}"`);
        await send("homeRows", { searches: [], nudge: "found family" });
        const cleared = await send("homeRows", { searches: [], nudge: "" });
        expect("Clear drops the nudge and remakes the rows", prompts.length === 9 && cleared.nudge === "" && !("nudge" in JSON.parse(prompts.at(-1))), `${prompts.length} calls, nudge "${cleared.nudge}"`);

        globalThis.__homeBroken = true;
        const broken = await send("homeRows", { searches: ["space adventure"], fresh: true });
        see("fallback rows", broken.rows.map((row) => `${row.title} ${row.ids.length}`).join(" | "));
        const failed = await saved();
        expect("an unreadable AI answer falls back to taste rows", !broken.ai && broken.rows.length >= 4, `ai ${broken.ai}, ${broken.rows.length} rows`);
        expect("and tries AI again within the hour", Math.round((failed.expiresAt - failed.createdAt) / 60_000) === 60, `${(failed.expiresAt - failed.createdAt) / 60_000} min`);
        globalThis.__homeBroken = false;

        await send("setSettings", { patch: { useAi: false } });
        const calls = prompts.length;
        const off = await send("homeRows", { searches: ["space adventure"], fresh: true });
        expect("with AI off the rows come from taste and history only", !off.ai && off.rows.length >= 4 && prompts.length === calls, `ai ${off.ai}, ${off.rows.length} rows, ${prompts.length - calls} model calls`);
        expect("fallback rows also skip watched and avoided shows", !off.rows.flatMap((row) => row.ids).some((id) => watchedIds.has(id) || isHorror(id)), "checked");
        const offNudge = await send("homeRows", { searches: [], nudge: "sports" });
        see("AI off with a nudge", offNudge.rows.map((row) => row.title).join(" | "));
        expect("with AI off a nudge still steers the first rows", !offNudge.ai && offNudge.rows[0]?.title === 'Inspired by "sports"' && offNudge.rows.length >= 4, offNudge.rows[0]?.title);
        const avoided = await send("homeRows", { searches: [], nudge: "horror" });
        expect("a nudge for a hard-avoided tag never brings those shows in", !avoided.rows.flatMap((row) => row.ids).some(isHorror) && avoided.rows.length >= 4, avoided.rows.map((row) => row.title).join(" | "));
      },
    };
  })(),

  "generated home rows through an AI service": (() => {
    const bodies = [];
    let reply = { rows: [
      { title: "Heart flutters", query: "romance", why: "You love romance." },
      { title: "Laugh tracks", query: "comedy", why: "Light and funny." },
      { title: "Big fights", query: "action", why: "Action you'll like." },
      { title: "Other worlds", query: "fantasy", why: "Fantasy picks." },
      { title: "Game day", query: "sports", why: "Team spirit." },
    ] };
    return {
      storage: { crCatalog: catalogFrom(full), state: { settings: { aiService: "groq", apiKeys: { groq: "gsk_test" } } } },
      model: null,
      fetch: (url, init) => {
        if (!url.endsWith("/chat/completions")) return null;
        bodies.push(JSON.parse(String(init.body || "{}")));
        return { status: 200, body: { choices: [{ message: { content: typeof reply === "string" ? reply : JSON.stringify(reply) } }] } };
      },
      async steps({ send, see, expect }) {
        const made = await send("homeRows", { searches: ["space adventure"] });
        see("rows", `${made.by}: ${made.rows.map((row) => `${row.title} ${row.ids.length}`).join(" | ")}`);
        expect("the service names the rows", made.ai && made.rows.length === 5 && made.by, `ai ${made.ai}, ${made.rows.length} rows, by ${made.by}`);
        const body = bodies.at(-1) || {};
        expect("the request carries the home-row prompt, not the pick prompt", /rows for an anime streaming home page/.test(body.messages?.[0]?.content || "") && /space adventure/.test(body.messages?.[1]?.content || ""), (body.messages?.[0]?.content || "").slice(0, 80));
        reply = "I can't help with that.";
        const broken = await send("homeRows", { searches: [], fresh: true });
        expect("an unreadable answer falls back to taste rows", !broken.ai && broken.rows.length >= 4, `ai ${broken.ai}, ${broken.rows.length} rows`);
      },
    };
  })(),

  "invalid input from the page": {
    storage: { crCatalog: catalogFrom(full) },
    model: goodModel(),
    async steps({ send, see, expect }) {
      const cases = [
        ["setStatus unknown show", { type: "setStatus", id: "sight:NOPE", status: "plan" }],
        ["setStatus bad status", { type: "setStatus", id: series(12)[0].id, status: "binge" }],
        ["episodeFinished unknown show", { type: "episodeFinished", id: "NOPE", episode: 1 }],
        ["episodeFinished text episode", { type: "episodeFinished", id: series(12)[0].id, episode: "abc" }],
        ["episodeFinished negative", { type: "episodeFinished", id: series(12)[0].id, episode: -4 }],
        ["episodeFinished huge", { type: "episodeFinished", id: series(12)[0].id, episode: 1e9 }],
        ["resolveNotice unknown", { type: "resolveNotice", id: "nope", action: "update" }],
        ["resolveAllNotices odd action", { type: "resolveAllNotices", action: "explode" }],
        ["unknown message", { type: "selfDestruct" }],
      ];
      for (const [label, message] of cases) {
        const { type, ...rest } = message;
        const reply = await send(type, rest);
        see(label, reply.ok === false ? `error: ${reply.error}` : `ok ${JSON.stringify({ mode: reply.mode, status: reply.status, note: reply.syncNote }).slice(0, 120)}`);
      }
      const saved = (await send("getState")).view;
      expect("an invalid status is never saved", !JSON.stringify(saved).includes("binge"), "checked view JSON");
      const huge = await send("getState");
      expect("no runaway episode offers", !huge.view.notices.some((row) => /1000000000/.test(row.message)), huge.view.notices.map((row) => row.message).join(" | ") || "none");
    },
  },

  "pressing AI picks on For you": {
    storage: { crCatalog: catalogFrom(full) },
    model: (() => {
      const base = goodModel(200);
      globalThis.__prompts = [];
      return {
        ...base,
        create: async (options) => {
          const session = await base.create(options);
          return { ...session, prompt: (input, extra) => { globalThis.__prompts.push(String(input).length); return session.prompt(input, extra); }, clone: async function clone() { return this; } };
        },
      };
    })(),
    async steps({ send, see, expect }) {
      const home = await send("catalogSearch", { query: "", site: "all" });
      const row = home.sections.find((section) => section.title === "For you");
      const ids = row.items.map((item) => item.id);
      const [one, two] = await Promise.all([
        send("catalogRerank", { query: "", ids, site: "all" }),
        send("catalogRerank", { query: "", ids, site: "all" }),
      ]);
      see("model calls for two quick clicks", `${globalThis.__prompts.length} call(s), prompt ${globalThis.__prompts[0]} chars`);
      expect("two quick clicks run the model once", globalThis.__prompts.length === 1 && one.results.length >= 3 && two.results.length === one.results.length, `${globalThis.__prompts.length} calls`);
      expect("the For you prompt stays small", globalThis.__prompts[0] < 4500, `${globalThis.__prompts[0]} chars`);
      const again = await send("catalogRerank", { query: "", ids, site: "all" });
      expect("pressing again reuses the picks", again.cached && globalThis.__prompts.length === 1, `cached ${again.cached}, ${globalThis.__prompts.length} calls`);
      expect("saved picks still name Chrome's model", one.by === "Gemini Nano" && again.by === "Gemini Nano", `${one.by} / ${again.by}`);
      const shown = again.results.map((item) => item.id);
      const rolled = await send("catalogRerank", { query: "", ids, site: "all", reroll: true, seen: shown, last: shown });
      const repeats = rolled.results.filter((item) => shown.includes(item.id)).length;
      see("reroll", `${rolled.results.length} picks, ${repeats} repeated, ${globalThis.__prompts.length} calls`);
      expect("reroll asks the model again for different shows", globalThis.__prompts.length === 2 && rolled.results.length >= 3 && repeats === 0, `${globalThis.__prompts.length} calls, ${repeats} repeats`);
      const kept = await send("catalogRerank", { query: "", ids, site: "all" });
      expect("the rerolled picks stay after reopening", kept.cached && kept.results.map((item) => item.id).join() === rolled.results.map((item) => item.id).join(), `cached ${kept.cached}`);
      const rolledIds = rolled.results.map((item) => item.id);
      const bannerRoll = await send("catalogRerank", { query: "", ids, site: "all", reroll: true, seen: [...shown, ...rolledIds], last: rolledIds, save: false });
      const stillFor = await send("catalogRerank", { query: "", ids, site: "all" });
      expect("a banner reroll gets fresh picks without replacing For you's", bannerRoll.results.length >= 3 && stillFor.cached && stillFor.results.map((item) => item.id).join() === rolledIds.join(), `${bannerRoll.results.length} picks, cached ${stillFor.cached}`);
      const prompts = globalThis.__prompts.length;
      const mood = await send("catalogSearch", { query: MOOD, site: "all" });
      const both = await Promise.all([
        send("catalogRerank", { query: MOOD, ids: mood.results.map((item) => item.id), site: "all" }),
        send("catalogRerank", { query: "a dark fantasy", ids: mood.results.map((item) => item.id), site: "all" }),
      ]);
      see("search prompts", globalThis.__prompts.slice(prompts).join(", "));
      expect("different requests take turns and both answer", both.every((answer) => answer.results.length >= 3), both.map((answer) => answer.results.length).join(","));
    },
  },

  "AI features switched off": {
    storage: { crCatalog: catalogFrom(full) },
    model: (() => {
      const base = goodModel(200);
      globalThis.__offPrompts = 0;
      return {
        ...base,
        create: async (options) => {
          const session = await base.create(options);
          return { ...session, prompt: (input, extra) => { globalThis.__offPrompts += 1; return session.prompt(input, extra); }, clone: async function clone() { return this; } };
        },
      };
    })(),
    async steps({ send, see, expect }) {
      const home = await send("catalogSearch", { query: "", site: "all" });
      const row = home.sections.find((section) => section.title === "For you");
      const matches = row.items.map((item) => item.match);
      see("For you taste matches", matches.slice(0, 6).join(", "));
      expect("For you rows carry a taste match from 45 to 85, best first", matches.every((match) => match >= 45 && match <= 85) && matches[0] === Math.max(...matches), matches.slice(0, 6).join(","));
      expect("other Home rows carry no match", home.sections.filter((section) => section.title !== "For you").every((section) => section.items.every((item) => item.match === undefined)), "");
      await send("setSettings", { patch: { useAi: false } });
      const ids = row.items.map((item) => item.id);
      const off = await send("catalogRerank", { query: "", ids, site: "all" });
      const mood = await send("catalogSearch", { query: MOOD, site: "all" });
      const offMood = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((item) => item.id) });
      see("with AI off", `${off.note} / search found ${mood.results.length}`);
      expect("ranking refuses without calling a model", off.off && offMood.off && !off.results.length && globalThis.__offPrompts === 0, `${globalThis.__offPrompts} calls`);
      expect("plain search still answers", mood.results.length >= 3, `${mood.results.length}`);
      await send("setSettings", { patch: { useAi: true } });
      const on = await send("catalogRerank", { query: "", ids, site: "all" });
      expect("turning AI back on ranks again", on.results.length >= 3 && globalThis.__offPrompts === 1, `${on.results.length} picks, ${globalThis.__offPrompts} calls`);
      expect("AI picks carry rank and confidence", on.results.filter((item) => !item.mention).every((item) => Number.isInteger(item.rank) && Number.isFinite(item.confidence)), "");
    },
  },

  "Chrome's model times out on a slow PC": {
    storage: { crCatalog: catalogFrom(full) },
    model: {
      availability: async () => "available",
      params: async () => ({}),
      create: async () => ({
        prompt: async () => {
          globalThis.__timeouts = (globalThis.__timeouts || 0) + 1;
          throw new DOMException("The operation was aborted.", "AbortError");
        },
        clone: async function clone() { return this; },
        destroy() {},
      }),
    },
    async steps({ send, see, expect }) {
      const home = await send("catalogSearch", { query: "", site: "all" });
      const ids = home.sections.find((section) => section.title === "For you").items.map((item) => item.id);
      const answer = await send("catalogRerank", { query: "", ids, site: "all" });
      see("note", answer.note || "(none)");
      expect("a timed-out attempt is not run a second time", globalThis.__timeouts === 1, `${globalThis.__timeouts} attempts`);
      expect("explains it was too slow and offers another way", /too long/i.test(answer.note || ""), answer.note || "(none)");
      expect("the row still shows without AI picks", !answer.results.length, `${answer.results.length}`);
    },
  },

  "too little disk for Chrome's model": {
    storage: { crCatalog: catalogFrom(full) },
    model: {
      availability: async () => "downloadable",
      params: async () => ({}),
      create: () => new Promise(() => {}),
    },
    async steps({ send, see, expect }) {
      const status = await send("modelStatus");
      see("model status", `${status.status?.label} — ${status.status?.detail || ""}`);
      const mood = await send("catalogSearch", { query: MOOD, site: "all" });
      const started = Date.now();
      const ranked = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
      expect("rerank answers quickly", Date.now() - started < 3000, `${Date.now() - started} ms`);
      see("rerank note", ranked.note || "(none)");
      expect("instant results stay usable", mood.results.length >= 5 && !ranked.error, ranked.error || "kept instant results");
    },
  },

  "Chrome's model is not supported": {
    storage: { crCatalog: catalogFrom(full) },
    model: { availability: async () => "unavailable", params: async () => ({}), create: async () => { throw new Error("NotSupportedError"); } },
    async steps({ send, see, expect }) {
      const status = await send("modelStatus");
      see("model status", `${status.status?.label} — ${status.status?.detail || ""}`);
      const mood = await send("catalogSearch", { query: MOOD, site: "all" });
      const ranked = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
      expect("explains the model is unavailable", /isn't available|not available|unavailable/i.test(ranked.note || ""), ranked.note || "(none)");
    },
  },

  "signed out of Crunchyroll, no catalog yet": {
    storage: {},
    model: goodModel(),
    async steps({ send, see, expect }) {
      const home = await send("catalogSearch", { query: "", site: "crunchyroll" });
      see("home note", home.note || "(none)");
      expect("tells the user how to load the catalog", /crunchyroll/i.test(home.note || ""), home.note || "(none)");
      const title = await send("catalogSearch", { query: "frieren", site: "crunchyroll" });
      see("title search", `${title.results?.length ?? 0} results, note: ${title.note || "(none)"}`);
      expect("title search explains the empty catalog", Boolean(title.note), title.note || "(no note)");
      const progress = await send("catalogProgress");
      see("catalog progress", JSON.stringify({ gathering: progress.gathering, running: progress.running, note: progress.note }));
    },
  },

  "catalog half loaded": {
    storage: { crCatalog: catalogFrom(full.slice(0, 300), { complete: false }) },
    model: goodModel(),
    async steps({ send, see, expect }) {
      const title = await send("catalogSearch", { query: "frieren", site: "crunchyroll" });
      expect("search works on what loaded", title.results?.[0]?.title?.startsWith("Frieren"), title.results?.[0]?.title || "(none)");
      const home = await send("catalogSearch", { query: "", site: "crunchyroll" });
      see("home note", home.note || "(none)");
    },
  },

  "expired AniList token with unsynced changes": {
    storage: { crCatalog: catalogFrom(full), state: { settings: { ...CONNECTED, anilistExpiresAt: NOW - 1000 }, library: libraryWith([[0, "in_progress"], [4, "plan"]], { dirty: true }) } },
    model: goodModel(),
    async steps({ send, see, expect }) {
      const state = await send("getState");
      see("account card", `connected ${state.view.settings.anilistConnected}, expired ${state.view.settings.anilistExpired}, name ${state.view.settings.anilistViewerName}`);
      expect("account says the sign-in expired", Boolean(state.view.settings.anilistExpired), `expired flag ${state.view.settings.anilistExpired}`);
      expect("waiting changes are visible", state.view.sync.waiting === 2, `waiting ${state.view.sync.waiting}`);
      const saved = await send("setStatus", { id: `sight:${full.find((show) => show.anilistId).id}`, status: "finished" });
      see("status saved note", saved.syncNote || "(none)");
      expect("note asks to reconnect", /reconnect|sign in|connect again|expired/i.test(saved.syncNote || ""), saved.syncNote || "(none)");
    },
  },

  "invalid OpenAI key": {
    storage: { crCatalog: catalogFrom(full), state: { settings: { apiKey: "sk-wrong", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" } } },
    model: null,
    fetch: (url) => (url.includes("api.openai.com")
      ? { status: 401, body: { error: { message: "Incorrect API key provided: sk-wrong.", code: "invalid_api_key" } } }
      : null),
    async steps({ send, see, expect }) {
      const mood = await send("catalogSearch", { query: MOOD, site: "all" });
      const ranked = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
      see("rerank note", ranked.note || "(none)");
      expect("says the key was rejected", /key/i.test(ranked.note || ""), ranked.note || "(none)");
      const status = await send("modelStatus");
      see("model status", `${status.status?.label} — ${status.status?.detail || ""}`);
    },
  },

  "offline mid-search": {
    storage: { crCatalog: catalogFrom(full), state: { settings: CONNECTED, library: {} } },
    model: goodModel(),
    offline: true,
    async steps({ send, see, expect }) {
      const mood = await send("catalogSearch", { query: MOOD, site: "all" });
      expect("instant results work offline", mood.results?.length >= 5, `${mood.results?.length} results`);
      const ranked = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
      expect("Chrome's model still ranks offline", ranked.results?.length >= 3, ranked.note || `${ranked.results?.length || 0} picks`);
      const saved = await send("setStatus", { id: mood.results[0].id, status: "plan" });
      see("status saved note", saved.syncNote || "(none)");
      expect("offline note is plain language", /offline|connection|reach/i.test(saved.syncNote || "") && !/failed to fetch/i.test(saved.syncNote || ""), saved.syncNote || "(none)");
      const sync = await send("syncNow");
      see("retry note", sync.syncNote || sync.error || "(none)");
    },
  },

  "offline with an OpenAI key": {
    storage: { crCatalog: catalogFrom(full), state: { settings: { apiKey: "sk-ok", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" } } },
    model: null,
    offline: true,
    async steps({ send, see, expect }) {
      const mood = await send("catalogSearch", { query: MOOD, site: "all" });
      const ranked = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
      see("rerank note", ranked.note || "(none)");
      expect("says the connection is the problem", /offline|connection|reach/i.test(ranked.note || ""), ranked.note || "(none)");
    },
  },

  "auto: slow Gemini hands off to Groq": (() => {
    const calls = [];
    return {
      storage: { crCatalog: catalogFrom(full), state: { settings: { aiService: "auto", apiKeys: { gemini: "AIza-test", groq: "gsk_test" } } } },
      model: null,
      fetch: (url) => {
        if (!url.endsWith("/chat/completions")) return null;
        const host = new URL(url).host;
        calls.push(host);
        if (host.includes("groq")) return { throws: "TimeoutError" };
        if (host.includes("googleapis")) return chatReply("came from Gemini");
        return null;
      },
      async steps({ send, see, expect }) {
        const mood = await send("catalogSearch", { query: MOOD, site: "all" });
        const ranked = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
        see("calls", calls.join(" then "));
        expect("Gemini answered after Groq timed out", ranked.results?.length >= 3 && calls.join() === "api.groq.com,generativelanguage.googleapis.com", ranked.note || `${ranked.results?.length} picks`);
        expect("the picks name the model that ranked them", ranked.by === "Gemini 3.5 Flash Lite", ranked.by || "(none)");
        const status = await send("modelStatus");
        see("model status", `${status.status?.label}: ${status.status?.detail}`);
        expect("status names the service that answered and the one skipped", /Google Gemini/.test(status.status?.detail || "") && /Groq was skipped/.test(status.status?.detail || ""), status.status?.detail);
        calls.length = 0;
        const other = await send("catalogSearch", { query: "funny sports anime", site: "all" });
        await send("catalogRerank", { query: "funny sports anime", site: "all", ids: other.results.map((row) => row.id) });
        expect("the slow service rests and the winner goes first next time", calls.join() === "generativelanguage.googleapis.com", calls.join(" then "));
      },
    };
  })(),

  "auto: every service fails": {
    storage: { crCatalog: catalogFrom(full), state: { settings: { aiService: "auto", apiKeys: { openrouter: "sk-or-test", groq: "gsk_test" } } } },
    model: null,
    fetch: (url) => {
      if (url.includes("groq")) return { status: 429, body: { error: { message: "Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 7000, Requested 3000. Please try again in 7.5s." } } };
      if (url.includes("openrouter")) return { status: 401, body: { error: { message: "No auth credentials found", code: 401 } } };
      return null;
    },
    async steps({ send, see, expect }) {
      const mood = await send("catalogSearch", { query: MOOD, site: "all" });
      const ranked = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
      see("rerank note", ranked.note || "(none)");
      expect("instant results stay and the note names both problems", !ranked.results?.length && /Groq is busy or rate limited/.test(ranked.note || "") && /OpenRouter rejected your key/.test(ranked.note || ""), ranked.note || "(none)");
    },
  },

  "a short per-minute limit only rests a service briefly": (() => {
    const calls = [];
    let groqBusy = true;
    return {
      storage: { crCatalog: catalogFrom(full), state: { settings: { aiService: "auto", apiKeys: { gemini: "AIza-test", groq: "gsk_test" } } } },
      model: null,
      fetch: (url) => {
        if (!url.endsWith("/chat/completions")) return null;
        calls.push(new URL(url).host);
        if (url.includes("groq") && groqBusy) return { status: 429, body: { error: { message: "Rate limit reached on tokens per minute (TPM). Please try again in 0.2s." } } };
        if (url.includes("googleapis") && !groqBusy) return { throws: "TimeoutError" };
        return chatReply();
      },
      async steps({ send, see, expect }) {
        const mood = await send("catalogSearch", { query: MOOD, site: "all" });
        const first = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
        expect("Gemini covers while Groq is busy", first.results?.length >= 3 && calls.join() === "api.groq.com,generativelanguage.googleapis.com", calls.join(" then "));
        groqBusy = false;
        await new Promise((resolve) => setTimeout(resolve, 5200));
        calls.length = 0;
        const other = await send("catalogSearch", { query: "funny sports anime", site: "all" });
        await send("catalogRerank", { query: "funny sports anime", site: "all", ids: other.results.map((row) => row.id) });
        see("calls after the wait", calls.join(" then "));
        expect("Groq is back in the rotation seconds later, not minutes", calls.includes("api.groq.com"), calls.join(" then "));
      },
    };
  })(),

  "a model's free daily quota runs out": (() => {
    const models = [];
    return {
      storage: { crCatalog: catalogFrom(full), state: { settings: { aiService: "gemini", apiKeys: { gemini: "AIza-test" } } } },
      model: null,
      fetch: (url, init) => {
        if (!url.endsWith("/chat/completions")) return null;
        const body = JSON.parse(init.body);
        models.push(body.model);
        if (body.model === "gemini-3.5-flash-lite") {
          return { status: 429, body: [{ error: { code: 429, message: "You exceeded your current quota, please check your plan and billing details.", status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } }] };
        }
        return chatReply();
      },
      async steps({ send, see, expect }) {
        const mood = await send("catalogSearch", { query: MOOD, site: "all" });
        const first = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
        see("models asked", models.join(" then "));
        expect("another Gemini model answers right away", first.results?.length >= 3 && models.join() === "gemini-3.5-flash-lite,gemini-3.1-flash-lite", first.note || models.join());
        models.length = 0;
        const other = await send("catalogSearch", { query: "funny sports anime", site: "all" });
        await send("catalogRerank", { query: "funny sports anime", site: "all", ids: other.results.map((row) => row.id) });
        expect("the used-up model is skipped next time", models.join() === "gemini-3.1-flash-lite", models.join(" then "));
      },
    };
  })(),

  "a model that rejects an option or was withdrawn": (() => {
    const bodies = [];
    return {
      storage: { crCatalog: catalogFrom(full), state: { settings: { aiService: "gemini", apiKeys: { gemini: "AIza-test" }, models: { gemini: "gemini-3.5-flash-lite" }, modelsVersion: 2 } } },
      model: null,
      fetch: (url, init) => {
        if (url.endsWith("/models")) return { status: 200, body: { data: [{ id: "models/gemini-3.8-flash" }, { id: "models/gemini-3.5-flash-lite" }] } };
        if (!url.endsWith("/chat/completions")) return null;
        const body = JSON.parse(init.body);
        bodies.push(body);
        if (body.model === "gemini-3.5-flash-lite" && body.reasoning_effort) return { status: 400, body: [{ error: { code: 400, message: "Thinking level LOW is not supported for this model.", status: "INVALID_ARGUMENT" } }] };
        if (body.model === "gemini-3.5-flash-lite") return { status: 404, body: [{ error: { code: 404, message: "This model models/gemini-3.5-flash-lite is no longer available to new users." } }] };
        return chatReply();
      },
      async steps({ send, see, expect, read }) {
        const mood = await send("catalogSearch", { query: MOOD, site: "all" });
        const ranked = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
        see("requests", bodies.map((body) => `${body.model}${body.reasoning_effort ? ` (thinking ${body.reasoning_effort})` : ""}`).join(" then "));
        expect("retries without the option, then moves to a model that exists", ranked.results?.length >= 3 && bodies.length === 3 && !bodies[1].reasoning_effort && bodies[2].model === "gemini-3.8-flash", ranked.note || "");
        expect("the working model is remembered", (await read()).settings.models.gemini === "gemini-3.8-flash", (await read()).settings.models.gemini);
      },
    };
  })(),

  "a chosen service is used alone": (() => {
    const calls = [];
    return {
      storage: { crCatalog: catalogFrom(full), state: { settings: { aiService: "openrouter", apiKeys: { gemini: "AIza-test", openrouter: "sk-or-test" } } } },
      model: null,
      fetch: (url) => {
        if (!url.endsWith("/chat/completions")) return null;
        calls.push(new URL(url).host);
        return url.includes("openrouter") ? { throws: "TimeoutError" } : chatReply();
      },
      async steps({ send, see, expect }) {
        const mood = await send("catalogSearch", { query: MOOD, site: "all" });
        const ranked = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
        see("rerank note", ranked.note || "(none)");
        expect("no other service is tried", calls.join() === "openrouter.ai" && /OpenRouter took too long/.test(ranked.note || ""), calls.join(" then "));
      },
    };
  })(),

  "runaway model reply": {
    storage: { crCatalog: catalogFrom(full) },
    model: {
      availability: async () => "available",
      params: async () => ({}),
      create: async () => ({ prompt: async () => "lorem ipsum ".repeat(20000), clone: async function clone() { return this; }, destroy() {} }),
    },
    async steps({ send, see, expect }) {
      const mood = await send("catalogSearch", { query: MOOD, site: "all" });
      const started = Date.now();
      const ranked = await send("catalogRerank", { query: MOOD, site: "all", ids: mood.results.map((row) => row.id) });
      see("rerank note", `${ranked.note || "(none)"} after ${Date.now() - started} ms`);
      expect("falls back without inventing picks", !ranked.results?.length && Boolean(ranked.note), JSON.stringify(ranked).slice(0, 160));
    },
  },
};

async function runOne(name) {
  const scenario = SCENARIOS[name];
  const rows = [];
  const see = (label, text) => rows.push({ kind: "see", label, text: String(text) });
  const expect = (label, ok, text) => rows.push({ kind: ok ? "pass" : "fail", label, text: String(text) });
  const store = (seed = {}) => {
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
  };
  const seed = {};
  if (scenario.storage.crCatalog) seed.crCatalog = scenario.storage.crCatalog;
  const catalogShows = scenario.storage.crCatalog ? full.filter((show) => scenario.storage.crCatalog.items.some((item) => item.id === show.id)) : [];
  seed.crCornerState = {
    version: 2, library: {}, anilistCache: cacheFrom(catalogShows), importMeta: { username: "", importedAt: 0, source: "" }, lastPullAt: 0,
    taste: { liked: ["Romance"], disliked: [], dropped: [], hardAvoids: [], subDub: "any" }, settings: {}, lastObservation: null,
    ...(scenario.storage.state || {}),
  };
  const listeners = [];
  const event = () => ({ addListener() {}, removeListener() {} });
  globalThis.chrome = {
    storage: { local: store(seed), session: store(), onChanged: event() },
    runtime: {
      id: "scenario",
      onMessage: { addListener: (fn) => listeners.push(fn) },
      onMessageExternal: event(),
      onInstalled: event(),
      getManifest: () => ({ version: "0.0.0" }),
      getURL: (path) => `chrome-extension://scenario/${path}`,
      sendMessage: async () => undefined,
      openOptionsPage: async () => {},
    },
    action: { onClicked: event(), setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    tabs: { onUpdated: event(), onRemoved: event(), query: async () => [], get: async () => { throw new Error("No tab"); }, create: async (info) => info, update: async () => ({}), remove: async () => {}, sendMessage: async () => {} },
    windows: { update: async () => {}, create: async (info) => info, getAll: async () => [] },
    commands: { onCommand: event(), getAll: async () => [] },
    identity: { getRedirectURL: () => "https://scenario.chromiumapp.org/" },
    permissions: { contains: async () => true },
    webNavigation: { onBeforeNavigate: event(), onCommitted: event(), onErrorOccurred: event(), onReferenceFragmentUpdated: event() },
  };
  if (scenario.model) globalThis.LanguageModel = scenario.model;
  const unexpected = new Set();
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    if (scenario.offline) throw new TypeError("Failed to fetch");
    const custom = scenario.fetch?.(url, init);
    if (custom?.throws) throw new DOMException("The operation timed out.", custom.throws);
    if (custom) return new Response(JSON.stringify(custom.body), { status: custom.status, headers: { "content-type": "application/json" } });
    if (url.includes("graphql.anilist.co")) return new Response(JSON.stringify(anilistReply(String(init.body || ""))), { status: 200 });
    unexpected.add(new URL(url).host);
    throw new TypeError("Failed to fetch");
  };
  await import("../background/service-worker.js");
  const send = (type, payload = {}) => new Promise((resolve) => {
    listeners[0]({ type, ...payload }, { id: "scenario" }, resolve);
  });
  try {
    const read = async () => (await chrome.storage.local.get("crCornerState")).crCornerState;
    await scenario.steps({ send, see, expect, read });
  } catch (error) {
    rows.push({ kind: "fail", label: "crashed", text: String(error?.stack || error).slice(0, 400) });
  }
  if (unexpected.size) see("unexpected network", [...unexpected].join(", "));
  process.stdout.write(`${JSON.stringify(rows)}\n`);
  process.exit(0);
}

function runAll() {
  const only = process.argv.slice(2).join(" ").toLowerCase();
  let failures = 0;
  for (const name of Object.keys(SCENARIOS)) {
    if (only && !name.toLowerCase().includes(only)) continue;
    const child = spawnSync(process.execPath, [self, "--run", name], { encoding: "utf8", timeout: 90_000 });
    console.log(`\n${name}`);
    let rows;
    try {
      rows = JSON.parse(child.stdout.trim().split("\n").pop());
    } catch {
      rows = [{ kind: "fail", label: "did not finish", text: (child.stderr || child.error?.message || "").slice(0, 400) }];
    }
    for (const row of rows) {
      const mark = row.kind === "pass" ? "  ok  " : row.kind === "fail" ? "  FAIL" : "  sees";
      if (row.kind === "fail") failures += 1;
      console.log(`${mark} ${row.label}: ${row.text}`);
    }
  }
  console.log(failures ? `\n${failures} expectation(s) failed.` : "\nAll scenarios behaved as expected.");
  process.exit(failures ? 1 : 0);
}

if (process.argv[2] === "--run") runOne(process.argv.slice(3).join(" "));
else runAll();
