// Crunchyroll tab management: Play reuses one Crunchyroll tab (or pop-out window) that Crunchilist opened,
// stray Crunchyroll tabs can be folded into it, and every Crunchyroll tab can jump back to the Crunchilist tab.
import { cachedLink, rememberLinks, resolveEpisode, seasonLinks, seriesUrl } from "../lib/episode-link.js";
import { crGet, currentLocale, currentToken, validBearer } from "./catalog-sync.js";
import { loadState } from "./store.js";

const KEY = "crPlayer";
const LINKS_KEY = "crEpisodeLinks";
const WARM_KEY = "crWarmEpisodes";
const MOVE_UNDO_MS = 20000;
const CR_URL = /^https:\/\/([a-z0-9-]+\.)?crunchyroll\.com\//i;
const CR_TABS = ["https://www.crunchyroll.com/*", "https://*.crunchyroll.com/*"];
const DEV_PAGE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

export const isCrunchyroll = (url) => CR_URL.test(String(url || ""));

async function load() {
  try {
    const { [KEY]: saved } = await chrome.storage.session.get(KEY);
    return { tabId: null, windowId: null, mode: "tab", homeTabId: null, pending: null, kept: [], lastMove: null, ...(saved || {}) };
  } catch {
    return { tabId: null, windowId: null, mode: "tab", homeTabId: null, pending: null, kept: [], lastMove: null };
  }
}

async function save(player) {
  await chrome.storage.session.set({ [KEY]: player }).catch(() => {});
}

async function tabById(id) {
  if (id == null) return null;
  return chrome.tabs.get(id).catch(() => null);
}

async function settings() {
  return (await loadState()).settings || {};
}

async function focus(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
}

async function tellCrunchyrollTabs() {
  const tabs = await chrome.tabs.query({ url: CR_TABS }).catch(() => []);
  for (const tab of tabs) if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: "tabRoleChanged" }).catch(() => {});
}

async function playerTab(player) {
  const tab = await tabById(player.tabId);
  return tab && (isCrunchyroll(tab.pendingUrl || tab.url) || player.pending?.tabId === tab.id) ? tab : null;
}

const newestFirst = (a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0);

// Session storage is wiped when the extension reloads or updates, so look for an open
// Crunchilist page (the app, or the localhost mockup during development) before giving up.
async function homeTab(player) {
  const saved = await tabById(player.homeTabId);
  if (saved) return saved;
  const app = chrome.runtime?.getURL?.("app/app.html") || "chrome-extension://";
  const tabs = await chrome.tabs.query({}).catch(() => []);
  const found = tabs.filter((tab) => String(tab.url || "").startsWith(app) || DEV_PAGE.test(tab.url || "")).sort(newestFirst)[0];
  if (!found) return null;
  player.homeTabId = found.id;
  await save(player);
  return found;
}

// A pop-out from before the extension reloaded: reuse it rather than stacking another window.
async function earlierPopup() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["popup"] }).catch(() => []);
  return windows.flatMap((win) => win.tabs || []).filter((tab) => isCrunchyroll(tab.pendingUrl || tab.url)).sort(newestFirst)[0] || null;
}

function episodeLabel(request) {
  const title = request.title.length > 32 ? `${request.title.slice(0, request.title.lastIndexOf(" ", 30) > 10 ? request.title.lastIndexOf(" ", 30) : 30).replace(/[:,\s]+$/, "")}…` : request.title;
  const where = `${request.seasonLabel ? `${request.seasonLabel.replace(/^Season /, "S")} ` : ""}E${request.episode}`;
  return title ? `${title} ${where}` : `episode ${request.episode}`;
}

async function loadLinks() {
  try {
    return (await chrome.storage.local.get(LINKS_KEY))[LINKS_KEY] || {};
  } catch {
    return {};
  }
}

// Episode links come from Crunchyroll's season lists, which need a sign-in that only lasts minutes.
// Every list fetched is kept, so a later Play can open the episode straight away without one.
async function resolveAndRemember(token, request) {
  const fetched = [];
  const found = await resolveEpisode((url) => crGet(token, url), { ...request, locale: currentLocale() }, (index, list) => fetched.push([index, seasonLinks(list)]));
  let links = await loadLinks();
  for (const [index, seasonMap] of fetched) links = rememberLinks(links, request.seriesId, index, seasonMap);
  if (found.exact) links = rememberLinks(links, request.seriesId, request.season, { [request.episode]: found.url });
  if (fetched.length) await chrome.storage.local.set({ [LINKS_KEY]: links }).catch(() => {});
  return found;
}

// null means "wait for Crunchyroll's sign-in", which happens once the opened page loads.
async function lookUp(request) {
  const known = cachedLink(await loadLinks(), request);
  if (known) return { url: known, exact: true };
  const token = await currentToken();
  if (!validBearer(token)) return null;
  try {
    return await resolveAndRemember(token, request);
  } catch (error) {
    if (/expired/i.test(String(error?.message))) return null;
    return { url: seriesUrl(request.seriesId), exact: false };
  }
}

const WARM_MAX = 16;
let warming = null;

function cleanRequest(request) {
  const seriesId = String(request?.seriesId || "").trim();
  if (!/^[A-Z0-9]{6,16}$/i.test(seriesId)) return null;
  return {
    seriesId,
    season: Math.max(0, Math.floor(Number(request.season) || 0)),
    episode: Math.max(1, Math.floor(Number(request.episode) || 1)),
  };
}

// Looks up the episodes Play is likely to open next (the banner, Continue watching) while a sign-in is fresh.
// Without one, the list waits until a Crunchyroll page shares a sign-in.
export async function warmEpisodes(requests) {
  const wanted = (Array.isArray(requests) ? requests : []).map(cleanRequest).filter(Boolean).slice(0, WARM_MAX);
  if (wanted.length) await chrome.storage.session.set({ [WARM_KEY]: wanted }).catch(() => {});
  if (warming) return {};
  warming = (async () => {
    const list = wanted.length ? wanted : (await chrome.storage.session.get(WARM_KEY).catch(() => ({})))[WARM_KEY] || [];
    for (const request of list) {
      if (cachedLink(await loadLinks(), request)) continue;
      const token = await currentToken();
      if (!validBearer(token)) return;
      try {
        await resolveAndRemember(token, request);
      } catch (error) {
        if (/expired/i.test(String(error?.message))) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  })().finally(() => { warming = null; });
  await warming;
  return {};
}

async function openTab(url, mode, player, home) {
  let current = player.mode === mode ? await playerTab(player) : null;
  if (!current && mode === "window") current = await earlierPopup();
  if (current && mode !== "new") {
    await chrome.tabs.update(current.id, { url, active: true });
    await focus(current);
    return current;
  }
  if (mode === "window") {
    const win = await chrome.windows.create({ url, type: "popup", width: 1280, height: 780, focused: true });
    return win.tabs[0];
  }
  const near = home && home.windowId != null ? { windowId: home.windowId, index: home.index + 1, openerTabId: home.id } : {};
  const tab = await chrome.tabs.create({ url, active: true, ...near });
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  return tab;
}

// request: { seriesId, season (index among Crunchyroll seasons), episode, title, seasonLabel }
export async function playEpisode(request, sender) {
  const base = cleanRequest(request);
  if (!base) throw new Error("This show isn't on Crunchyroll.");
  const { seriesId } = base;
  const clean = {
    ...base,
    title: String(request.title || "").slice(0, 160),
    seasonLabel: String(request.seasonLabel || "").slice(0, 40),
  };
  const mode = (await settings()).openIn || "tab";
  const player = await load();
  const home = sender?.tab && !isCrunchyroll(sender.tab.url) ? sender.tab : null;
  if (home) player.homeTabId = home.id;
  const found = await lookUp(clean);
  const tab = await openTab(found?.url || seriesUrl(seriesId), mode, player, home);
  player.tabId = tab.id;
  player.windowId = tab.windowId;
  player.mode = mode;
  player.kept = player.kept.filter((id) => id !== tab.id);
  player.pending = found ? null : { ...clean, tabId: tab.id, label: episodeLabel(clean) };
  await save(player);
  await tellCrunchyrollTabs();
  return { exact: Boolean(found?.exact), waiting: !found, mode, label: episodeLabel(clean) };
}

// The Crunchyroll page hands over its sign-in token once it loads. Finish a Play that was waiting for it.
export async function tokenArrived(tabId) {
  const player = await load();
  if (!player.pending || player.pending.tabId !== tabId) return;
  const request = player.pending;
  const found = await lookUp(request);
  if (!found) return;
  player.pending = null;
  await save(player);
  if (found.exact) await chrome.tabs.update(tabId, { url: found.url }).catch(() => {});
  else chrome.tabs.sendMessage(tabId, { type: "tabRoleChanged", note: `Couldn't find ${request.label} on Crunchyroll, so this is the show page.` }).catch(() => {});
}

export async function tabRole(sender) {
  const tab = sender?.tab;
  const prefs = await settings();
  const player = await load();
  const home = await homeTab(player);
  const main = await playerTab(player);
  const base = { backButton: prefs.backButton !== false, showTips: prefs.showTips !== false, home: Boolean(home), miniPlayer: prefs.miniPlayer === true };
  if (!tab || !isCrunchyroll(tab.url)) return { ...base, role: "other" };
  if (main?.id === tab.id) {
    const undoFor = player.lastMove?.tabId === tab.id ? Math.max(0, MOVE_UNDO_MS - (Date.now() - player.lastMove.at)) : 0;
    return { ...base, role: "player", pending: player.pending?.tabId === tab.id ? player.pending.label : "", undoFor };
  }
  const managing = prefs.tabManage !== false && prefs.openIn !== "new" && main && !player.kept.includes(tab.id);
  if (!managing) return { ...base, role: "other" };
  if (prefs.tabAuto) {
    await moveTab(tab.id);
    return { ...base, role: "moving" };
  }
  return { ...base, role: "stray", playerTitle: main.title || "" };
}

export async function moveTab(tabId) {
  const player = await load();
  const main = await playerTab(player);
  const stray = await tabById(tabId);
  if (!main || !stray || stray.id === main.id || !isCrunchyroll(stray.url)) throw new Error("Your Crunchyroll tab isn't open anymore.");
  player.lastMove = { tabId: main.id, at: Date.now(), strayUrl: stray.url, strayWindowId: stray.windowId, strayIndex: stray.index, previousUrl: main.url };
  player.pending = null;
  await save(player);
  await chrome.tabs.update(main.id, { url: stray.url, active: true });
  await focus(main);
  await chrome.tabs.remove(stray.id).catch(() => {});
  return {};
}

export async function undoMove() {
  const player = await load();
  const move = player.lastMove;
  if (!move) throw new Error("Nothing to undo.");
  player.lastMove = null;
  const tab = await chrome.tabs.create({ url: move.strayUrl, active: true, ...(move.strayWindowId != null ? { windowId: move.strayWindowId, index: move.strayIndex } : {}) }).catch(() => chrome.tabs.create({ url: move.strayUrl }));
  player.kept = [...player.kept, tab.id].slice(-50);
  await save(player);
  if (move.previousUrl && isCrunchyroll(move.previousUrl)) await chrome.tabs.update(move.tabId, { url: move.previousUrl }).catch(() => {});
  return {};
}

export async function keepTab(tabId) {
  const player = await load();
  if (!player.kept.includes(tabId)) player.kept = [...player.kept, tabId].slice(-50);
  await save(player);
  return {};
}

// Sent without a frameId so it reaches Crunchyroll's player iframe as well as the page.
function pauseTab(tabId) {
  if (tabId != null) chrome.tabs.sendMessage(tabId, { type: "pauseVideo" }).catch(() => {});
}

export async function backToCrunchilist(openApp, fromTabId) {
  pauseTab(fromTabId);
  const player = await load();
  const home = await homeTab(player);
  if (home) await focus(home);
  else await openApp();
  return {};
}

// Keyboard shortcut: on Crunchyroll go back to Crunchilist, anywhere else go to the Crunchyroll tab.
export async function switchTabs(openApp) {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const player = await load();
  if (active && isCrunchyroll(active.url)) return backToCrunchilist(openApp, active.id);
  let main = await playerTab(player);
  if (!main) {
    const open = await chrome.tabs.query({ url: CR_TABS }).catch(() => []);
    main = open.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null;
  }
  if (main) {
    if (active && !isCrunchyroll(active.url) && active.id !== main.id) {
      player.homeTabId = active.url?.startsWith("chrome-extension://") || DEV_PAGE.test(active.url || "") ? active.id : player.homeTabId;
      await save(player);
    }
    await focus(main);
  }
  return {};
}

export function watchPlayerTabs() {
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const player = await load();
    let changed = false;
    if (player.tabId === tabId) { player.tabId = null; player.pending = null; changed = true; }
    if (player.homeTabId === tabId) { player.homeTabId = null; changed = true; }
    if (player.kept.includes(tabId)) { player.kept = player.kept.filter((id) => id !== tabId); changed = true; }
    if (!changed) return;
    await save(player);
    await tellCrunchyrollTabs();
  });
  chrome.tabs.onUpdated.addListener(async (tabId, info) => {
    if (!info.url) return;
    const player = await load();
    if (player.tabId !== tabId || isCrunchyroll(info.url)) return;
    player.tabId = null;
    player.pending = null;
    await save(player);
    await tellCrunchyrollTabs();
  });
}
