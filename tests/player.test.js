import assert from "node:assert/strict";
import test from "node:test";

// A small in-memory Chrome: tabs, windows, and storage, enough for the player-tab manager.
function fakeChrome(settings = {}) {
  const tabs = new Map();
  const local = { crCornerState: { settings } };
  const session = {};
  const messages = [];
  let nextId = 100;
  const activate = (props) => { if (props.active) for (const tab of tabs.values()) tab.active = false; };
  const add = (url, extra = {}) => {
    activate(extra);
    const tab = { id: nextId++, windowId: 1, index: tabs.size, url, active: false, title: "", ...extra };
    tabs.set(tab.id, tab);
    return tab;
  };
  const chrome = {
    storage: {
      local: { get: async (key) => ({ [key]: local[key] }), set: async (patch) => Object.assign(local, patch) },
      session: {
        get: async (keys) => Object.fromEntries([].concat(keys).map((key) => [key, session[key]])),
        set: async (patch) => Object.assign(session, structuredClone(patch)),
      },
    },
    tabs: {
      get: async (id) => {
        if (!tabs.has(id)) throw new Error("No tab");
        return { ...tabs.get(id) };
      },
      query: async (props = {}) => [...tabs.values()].filter((tab) => (props.active ? tab.active : props.url ? /crunchyroll\.com/.test(tab.url) : true)),
      create: async (props) => add(props.url, { active: Boolean(props.active), windowId: props.windowId ?? 1 }),
      update: async (id, props) => {
        if (!tabs.has(id)) throw new Error("No tab");
        activate(props);
        Object.assign(tabs.get(id), props);
        return { ...tabs.get(id) };
      },
      remove: async (id) => { tabs.delete(id); },
      sendMessage: async (id, message) => { messages.push([id, message]); },
    },
    windows: {
      update: async () => ({}),
      create: async (props) => ({ id: 2, tabs: [add(props.url, { windowId: 2, popup: true })] }),
      getAll: async () => [{ id: 2, type: "popup", tabs: [...tabs.values()].filter((tab) => tab.popup) }],
    },
  };
  return { chrome, tabs, add, session, local, messages };
}

const player = await import("../background/player.js");

function setup(settings) {
  const env = fakeChrome(settings);
  globalThis.chrome = env.chrome;
  const app = env.add("chrome-extension://abc/app/app.html", { active: true });
  return { ...env, app, sender: (tab) => ({ tab }) };
}

test("Play opens the series page next to Crunchilist and waits for Crunchyroll's sign-in", async () => {
  const env = setup();
  const reply = await player.playEpisode({ seriesId: "GG5H5XQX4", season: 1, episode: 5, title: "Frieren: Beyond Journey's End", seasonLabel: "Season 2" }, env.sender(env.app));
  assert.equal(reply.waiting, true);
  assert.equal(reply.label, "Frieren: Beyond Journey's End S2 E5");
  const opened = [...env.tabs.values()].find((tab) => tab.id !== env.app.id);
  assert.equal(opened.url, "https://www.crunchyroll.com/series/GG5H5XQX4");
  assert.equal(env.session.crPlayer.homeTabId, env.app.id);
  assert.equal(env.session.crPlayer.pending.tabId, opened.id);
  const long = await player.playEpisode({ seriesId: "GRDV0019R", episode: 2, title: "That Time I Got Reincarnated as a Slime" }, env.sender(env.app));
  assert.equal(long.label, "That Time I Got Reincarnated… E2");
});

test("a second Play reuses the same Crunchyroll tab instead of opening another", async () => {
  const env = setup();
  await player.playEpisode({ seriesId: "GG5H5XQX4", episode: 1, title: "Frieren" }, env.sender(env.app));
  await player.playEpisode({ seriesId: "GDKHZEJ0K", episode: 3, title: "Steins;Gate" }, env.sender(env.app));
  const crTabs = [...env.tabs.values()].filter((tab) => player.isCrunchyroll(tab.url));
  assert.equal(crTabs.length, 1);
  assert.equal(crTabs[0].url, "https://www.crunchyroll.com/series/GDKHZEJ0K");
});

test("shows that aren't on Crunchyroll are refused before any tab opens", async () => {
  const env = setup();
  await assert.rejects(player.playEpisode({ seriesId: "al-120377", episode: 1, title: "Edgerunners" }, env.sender(env.app)), /isn't on Crunchyroll/);
  await assert.rejects(player.playEpisode({ seriesId: "../../evil", episode: 1 }, env.sender(env.app)), /isn't on Crunchyroll/);
  assert.equal(env.tabs.size, 1);
});

test("a user who closed their Crunchilist tab still gets somewhere from Back to Crunchilist", async () => {
  const env = setup();
  await player.playEpisode({ seriesId: "GG5H5XQX4", episode: 1, title: "Frieren" }, env.sender(env.app));
  await env.chrome.tabs.remove(env.app.id);
  let opened = 0;
  await player.backToCrunchilist(async () => { opened += 1; });
  assert.equal(opened, 1);
  const crTab = [...env.tabs.values()][0];
  const role = await player.tabRole(env.sender(crTab));
  assert.equal(role.home, false);
});

test("leaving Crunchyroll by the button or the shortcut pauses the episode left behind", async () => {
  const env = setup();
  await player.playEpisode({ seriesId: "GG5H5XQX4", episode: 1, title: "Frieren" }, env.sender(env.app));
  const crTab = [...env.tabs.values()].find((tab) => player.isCrunchyroll(tab.url));
  await player.backToCrunchilist(async () => {}, crTab.id);
  assert.deepEqual(env.messages.at(-1), [crTab.id, { type: "pauseVideo" }]);
  assert.equal(env.tabs.get(env.app.id).active, true);
  await player.switchTabs(async () => {});
  assert.equal(env.tabs.get(crTab.id).active, true);
  env.messages.length = 0;
  await player.switchTabs(async () => {});
  assert.deepEqual(env.messages, [[crTab.id, { type: "pauseVideo" }]]);
  assert.equal(env.tabs.get(env.app.id).active, true);
});

test("the shortcut still finds a Crunchyroll tab that Crunchilist didn't open", async () => {
  const env = setup();
  const own = env.add("https://www.crunchyroll.com/watch/G7PU4MZ1G/the-journeys-end", { lastAccessed: 5 });
  env.add("https://www.crunchyroll.com/simulcasts", { lastAccessed: 1 });
  await player.switchTabs(async () => {});
  assert.equal(env.tabs.get(own.id).active, true);
});

test("pop-out mode reuses one window, even after the extension reloads and forgets it", async () => {
  const env = setup({ openIn: "window" });
  await player.playEpisode({ seriesId: "GG5H5XQX4", episode: 1, title: "Frieren" }, env.sender(env.app));
  await player.playEpisode({ seriesId: "GDKHZEJ0K", episode: 3, title: "Steins;Gate" }, env.sender(env.app));
  const popups = () => [...env.tabs.values()].filter((tab) => tab.popup);
  assert.equal(popups().length, 1);
  for (const key of Object.keys(env.session)) delete env.session[key];
  await player.playEpisode({ seriesId: "GG5H5XQX4", episode: 2, title: "Frieren" }, env.sender(env.app));
  assert.equal(popups().length, 1);
  assert.equal(popups()[0].url, "https://www.crunchyroll.com/series/GG5H5XQX4");
});

test("after a reload wipes the remembered tabs, Back to Crunchilist still finds the Crunchilist page", async () => {
  const env = setup({ openIn: "window" });
  await player.playEpisode({ seriesId: "GG5H5XQX4", episode: 1, title: "Frieren" }, env.sender(env.app));
  for (const key of Object.keys(env.session)) delete env.session[key];
  const popup = [...env.tabs.values()].find((tab) => tab.popup);
  const role = await player.tabRole(env.sender(popup));
  assert.equal(role.home, true);
  let opened = 0;
  await player.backToCrunchilist(async () => { opened += 1; }, popup.id);
  assert.equal(opened, 0);
  assert.equal(env.tabs.get(env.app.id).active, true);
});

test("a stray Crunchyroll tab is offered a move, and Keep this tab stops asking", async () => {
  const env = setup();
  await player.playEpisode({ seriesId: "GG5H5XQX4", episode: 1, title: "Frieren" }, env.sender(env.app));
  const stray = env.add("https://www.crunchyroll.com/videos/popular");
  assert.equal((await player.tabRole(env.sender(stray))).role, "stray");
  await player.keepTab(stray.id);
  assert.equal((await player.tabRole(env.sender(stray))).role, "other");
});

test("moving a stray tab folds it into the player tab, and Undo brings it back", async () => {
  const env = setup();
  await player.playEpisode({ seriesId: "GG5H5XQX4", episode: 1, title: "Frieren" }, env.sender(env.app));
  const main = [...env.tabs.values()].find((tab) => player.isCrunchyroll(tab.url));
  const stray = env.add("https://www.crunchyroll.com/simulcasts");
  await player.moveTab(stray.id);
  assert.equal(env.tabs.has(stray.id), false);
  assert.equal(env.tabs.get(main.id).url, "https://www.crunchyroll.com/simulcasts");
  const role = await player.tabRole(env.sender(env.tabs.get(main.id)));
  assert.equal(role.role, "player");
  assert.ok(role.undoFor > 0 && role.undoFor <= 20000);
  assert.equal(role.pending, "");
  await player.undoMove();
  const reopened = [...env.tabs.values()].find((tab) => tab.url === "https://www.crunchyroll.com/simulcasts");
  assert.ok(reopened);
  assert.equal(env.tabs.get(main.id).url, "https://www.crunchyroll.com/series/GG5H5XQX4");
  assert.equal((await player.tabRole(env.sender(reopened))).role, "other");
  await assert.rejects(player.undoMove(), /Nothing to undo/);
});

test("automatic mode moves strays without asking", async () => {
  const env = setup({ tabAuto: true });
  await player.playEpisode({ seriesId: "GG5H5XQX4", episode: 1, title: "Frieren" }, env.sender(env.app));
  const stray = env.add("https://www.crunchyroll.com/news");
  assert.equal((await player.tabRole(env.sender(stray))).role, "moving");
  assert.equal(env.tabs.has(stray.id), false);
});

test("tab management stays out of the way when it's off, set to new tabs, or the player tab left Crunchyroll", async () => {
  for (const settings of [{ tabManage: false }, { openIn: "new" }]) {
    const env = setup(settings);
    await player.playEpisode({ seriesId: "GG5H5XQX4", episode: 1, title: "Frieren" }, env.sender(env.app));
    const stray = env.add("https://www.crunchyroll.com/videos/popular");
    assert.equal((await player.tabRole(env.sender(stray))).role, "other", JSON.stringify(settings));
  }
  const env = setup();
  await player.playEpisode({ seriesId: "GG5H5XQX4", episode: 1, title: "Frieren" }, env.sender(env.app));
  const main = [...env.tabs.values()].find((tab) => player.isCrunchyroll(tab.url));
  env.session.crPlayer.pending = null;
  await env.chrome.tabs.update(main.id, { url: "https://www.youtube.com/" });
  const stray = env.add("https://www.crunchyroll.com/videos/popular");
  assert.equal((await player.tabRole(env.sender(stray))).role, "other");
  await assert.rejects(player.moveTab(stray.id), /isn't open anymore/);
});

test("tips and the back button follow their settings", async () => {
  const env = setup({ showTips: false, backButton: false });
  const tab = env.add("https://www.crunchyroll.com/watch/G7PU4MZ1G/the-journeys-end");
  const role = await player.tabRole(env.sender(tab));
  assert.equal(role.showTips, false);
  assert.equal(role.backButton, false);
  const defaults = setup();
  assert.equal((await player.tabRole(defaults.sender(tab))).showTips, true);
  assert.equal((await player.tabRole(defaults.sender(tab))).miniPlayer, false);
  const mini = setup({ miniPlayer: true });
  assert.equal((await player.tabRole(mini.sender(mini.add("https://www.crunchyroll.com/watch/G7PU4MZ1G/the-journeys-end")))).miniPlayer, true);
});

test("once signed in, Play goes straight to the exact episode", async () => {
  const env = setup();
  env.session.crCatalogToken = "x".repeat(40);
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const body = /\/seasons\?/.test(url)
      ? { data: [{ id: "S1", season_sequence_number: 1, season_number: 1, audio_locale: "ja-JP" }, { id: "S2", season_sequence_number: 2, season_number: 2, audio_locale: "ja-JP" }] }
      : { data: [{ id: "EP25", episode_number: 5, sequence_number: 5, slug_title: "the-hero" }] };
    return { ok: true, status: 200, json: async () => body };
  };
  const reply = await player.playEpisode({ seriesId: "GG5H5XQX4", season: 1, episode: 5, title: "Frieren", seasonLabel: "Season 2" }, env.sender(env.app));
  assert.equal(reply.exact, true);
  assert.equal(reply.waiting, false);
  const opened = [...env.tabs.values()].find((tab) => player.isCrunchyroll(tab.url));
  assert.equal(opened.url, "https://www.crunchyroll.com/watch/EP25/the-hero");
  assert.ok(calls.some((url) => url.includes("/seasons/S2/episodes")));
  assert.equal(env.session.crPlayer.pending, null);
  delete globalThis.fetch;
});

test("a remembered episode link plays straight away, even without a sign-in", async () => {
  const env = setup();
  env.local.crEpisodeLinks = { GG5H5XQX4: { at: Date.now(), seasons: { 0: { 3: "https://www.crunchyroll.com/watch/EP3/three" } } } };
  const reply = await player.playEpisode({ seriesId: "GG5H5XQX4", season: 0, episode: 3, title: "Frieren" }, env.sender(env.app));
  assert.equal(reply.exact, true);
  assert.equal(reply.waiting, false);
  const opened = [...env.tabs.values()].find((tab) => player.isCrunchyroll(tab.url));
  assert.equal(opened.url, "https://www.crunchyroll.com/watch/EP3/three");
});

test("an expired sign-in waits for the page's fresh one instead of stopping on the show page", async () => {
  const env = setup();
  env.session.crCatalogToken = "y".repeat(40);
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const reply = await player.playEpisode({ seriesId: "GG5H5XQX4", season: 0, episode: 2, title: "Frieren" }, env.sender(env.app));
  assert.equal(reply.waiting, true);
  const opened = [...env.tabs.values()].find((tab) => player.isCrunchyroll(tab.url));
  assert.equal(env.session.crPlayer.pending.tabId, opened.id);
  delete globalThis.fetch;
});

test("warming looks up the next episodes so a later Play needs no sign-in", async () => {
  const env = setup();
  env.session.crCatalogToken = "z".repeat(40);
  globalThis.fetch = async (url) => {
    const body = /\/seasons\?/.test(url)
      ? { data: [{ id: "S1", season_sequence_number: 1, season_number: 1, audio_locale: "ja-JP" }] }
      : { data: [{ id: "EP1", episode_number: 1, slug_title: "one" }, { id: "EP2", episode_number: 2, slug_title: "two" }] };
    return { ok: true, status: 200, json: async () => body };
  };
  await player.warmEpisodes([{ seriesId: "GG5H5XQX4", season: 0, episode: 1 }, { seriesId: "../bad", episode: 1 }]);
  delete globalThis.fetch;
  delete env.session.crCatalogToken;
  const reply = await player.playEpisode({ seriesId: "GG5H5XQX4", season: 0, episode: 2, title: "Frieren" }, env.sender(env.app));
  assert.equal(reply.exact, true);
  assert.equal([...env.tabs.values()].find((tab) => player.isCrunchyroll(tab.url)).url, "https://www.crunchyroll.com/watch/EP2/two");
});
