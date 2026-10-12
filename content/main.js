import { applyBadges, clearBadges } from "./badges.js";
import { createPanel } from "./panel.js";
import { createPlayerBar, pauseVideos } from "./player-bar.js";
import { scanDocument } from "./scan.js";
import { ENABLED_KEY, isEnabled } from "../lib/enabled.js";
import { buildObservation, parseCmsObjects, parseCmsSeasons } from "../lib/page-model.js";

if (!globalThis.__crCornerBooted) {
  globalThis.__crCornerBooted = true;
  boot();
}

function boot() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "pauseVideo") pauseVideos(document);
  });
  const begin = async () => {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !(ENABLED_KEY in changes)) return;
      if (changes[ENABLED_KEY].newValue === false) stop();
      else start();
    });
    if (await isEnabled().catch(() => true)) start();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", begin, { once: true });
  else begin();
}

let active = false;
let panel;
let playerBar;
let observer;
let cmsEpisodes = [];
let cmsSeasons = [];
let lastPath = location.pathname;
let scanTimer = 0;
let scanGeneration = 0;
let lastSignature = "";
let latestView = null;
let offeredEpisode = "";
const EPISODE_MIN_SECONDS = 240;
const EPISODE_DONE_RATIO = 0.9;

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload }).catch((error) => ({
    ok: false,
    error: /context invalidated/i.test(error?.message || "")
      ? "Crunchilist was updated. Reload this tab to keep using it."
      : error?.message || "Extension unavailable",
  }));
}

function start() {
  if (active) return;
  active = true;
  if (!panel) {
    panel = createPanel(document, {
      send,
      onOpenChange: (panelOpen) => send("setUi", { panelOpen }),
      onCorner: (panelCorner) => send("setUi", { panelCorner }),
      onView: (view) => renderView(view),
    });
    playerBar = createPlayerBar(document, { send, tips: true });
    window.addEventListener("message", onPageMessage);
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "enriched" && message.view) renderView(message.view);
      if (message?.type === "activity") renderActivity(message.tasks);
      if (message?.type === "tabRoleChanged" && active) playerBar.refresh(message.note);
    });
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
    document.addEventListener("timeupdate", onVideoTime, true);
    document.addEventListener("ended", onVideoTime, true);
    window.addEventListener("resize", syncFullscreen);
    observer = new MutationObserver(() => schedule());
  }
  document.documentElement.append(panel.host, playerBar.host);
  playerBar.refresh();
  observer.observe(document.documentElement, { childList: true, subtree: true });
  lastSignature = "";
  send("getActivity").then((response) => {
    if (response?.ok) renderActivity(response.tasks);
  });
  schedule();
}

function stop() {
  if (!active) return;
  active = false;
  observer?.disconnect();
  window.clearTimeout(scanTimer);
  panel?.setActivity([]);
  panel?.setGathering(false);
  panel?.host.remove();
  playerBar?.host.remove();
  clearBadges(document);
}

function beginGather(phase) {
  panel.setGathering(true, phase || "Gathering the Crunchyroll list");
}

function renderActivity(tasks) {
  if (!active || !panel) return;
  const list = Array.isArray(tasks) ? tasks : [];
  panel.setActivity(list);
  const gathering = list.find((task) => task.gathering);
  panel.setGathering(Boolean(gathering), gathering?.label);
}

function onPageMessage(event) {
  if (!active || event.source !== window || event.data?.source !== "cr-corner-hook") return;
  const message = event.data;
  if (message.kind === "auth" && message.token) {
    const locale = document.documentElement.lang || navigator.language || "en-US";
    send("catalogSession", { token: message.token, locale }).then((response) => {
      if (response?.gathering) beginGather(response.phase);
    });
    return;
  }
  if (message.kind === "nav") {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      cmsEpisodes = [];
      cmsSeasons = [];
    }
    schedule();
    return;
  }
  if (message.kind !== "cms" || (message.page && message.page !== location.href)) return;
  if (/\/cms\/objects\//.test(message.url || "")) {
    cmsEpisodes = cmsEpisodes.concat(parseCmsObjects(message.data)).slice(-120);
  } else if (/\/cms\/series\/[^/]+\/seasons/.test(message.url || "")) {
    cmsSeasons = parseCmsSeasons(message.data);
  }
  schedule();
}

function schedule() {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(runScan, latestView?.settings?.liteMode ? 1200 : 450);
}

function observationSignature(observation) {
  return JSON.stringify({
    kind: observation.kind,
    url: observation.url,
    currentKey: observation.currentKey,
    seasons: (observation.seasons || []).map((season) => [
      season.seriesId,
      season.seasonSlug,
      season.episodeCount,
      season.watchingEpisode,
      season.audio,
      season.genres,
    ]),
    sightings: (observation.sightings || []).map((sighting) => [sighting.seriesId, sighting.title]),
  });
}

async function runScan() {
  if (!active) return;
  const generation = ++scanGeneration;
  let observation;
  try {
    observation = buildObservation({
      ...scanDocument(document, location.href),
      cmsEpisodes,
      cmsSeasons,
    });
  } catch {
    return;
  }
  syncFullscreen();
  const signature = observationSignature(observation);
  if (signature === lastSignature) {
    if (latestView) paintMarks(latestView);
    return;
  }
  const response = await send("pageUpdate", { observation });
  if (!active || generation !== scanGeneration || !response?.ok || !response.view) return;
  lastSignature = signature;
  latestView = response.view;
  renderView(response.view, { syncOpen: true });
}

function paintMarks(view) {
  if (!active) return;
  if (observer) observer.disconnect();
  try {
    applyBadges(document, view.marks || {}, view.settings || {}, { onPick: pickStatus });
  } finally {
    observer?.observe(document.documentElement, { childList: true, subtree: true });
  }
}

function renderView(view, { syncOpen = false } = {}) {
  latestView = view;
  if (!active) return;
  panel.setView(view, { syncOpen });
  paintMarks(view);
}

const STATUS_WORDS = { in_progress: "In progress", finished: "Watched", plan: "Plan", dropped: "Dropped" };

async function saveStatus(seriesId, status) {
  const response = await send("setStatus", { id: seriesId, status: status === "unwatched" ? null : status });
  if (response?.view) renderView(response.view);
  return response;
}

async function pickStatus({ seriesId, status, previous, previousProgress }) {
  const response = await saveStatus(seriesId, status);
  if (!response?.ok) {
    panel.showToast({ title: response?.error || "Could not change the status.", timeout: 6000 });
    return;
  }
  const title = status === "unwatched" ? "Removed from your list." : `Changed to ${STATUS_WORDS[status] || status}.`;
  panel.showToast({
    title,
    meta: response.syncNote && !/^Saved/i.test(response.syncNote) ? response.syncNote : "",
    action: "Undo",
    timeout: 8000,
    onAction: async () => {
      let undone = await saveStatus(seriesId, previous);
      if (undone?.ok && previous === "in_progress" && previousProgress != null) {
        undone = await send("syncAnilistProgress", { id: seriesId, episode: previousProgress, undo: true });
        if (undone?.view) renderView(undone.view);
      }
      panel.showToast({ title: undone?.ok ? "Undone." : undone?.error || "Could not undo that.", timeout: 4000 });
    },
  });
}

function onVideoTime(event) {
  const video = event.target;
  if (!active || !(video instanceof HTMLVideoElement)) return;
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration < EPISODE_MIN_SECONDS) return;
  if (event.type !== "ended" && video.currentTime < duration * EPISODE_DONE_RATIO) return;
  const offer = latestView?.progressOffer;
  if (!offer) return;
  const key = `${offer.id}:${offer.to}`;
  if (key === offeredEpisode) return;
  offeredEpisode = key;
  send("episodeFinished", { id: offer.id, episode: offer.to }).then((response) => {
    if (response?.view) renderView(response.view);
    if (!response?.ok) {
      if (!latestView?.settings?.muteNotifications) panel.showToast({ title: response?.error || "Could not save that.", timeout: 6000 });
      return;
    }
    if (!response.toast || response.mode === "none") return;
    showEpisodeToast(response);
  });
}

function problemIn(note) {
  return note && !/^Marked episode/.test(note) ? note : "";
}

function showEpisodeToast({ mode, offer, noticeId, syncNote }) {
  const title = latestView?.currentTitle || "";
  const optOut = {
    label: "Don't show again (change in Settings)",
    onChange: (checked) => send("setSettings", { patch: { episodeDialogs: !checked } }),
  };
  const done = offer.last ? `Marked ${title || "this show"} completed.` : `Marked episode ${offer.to} watched.`;
  if (mode === "auto") {
    panel.showToast({
      title: done,
      meta: problemIn(syncNote) || (offer.last ? "" : title),
      action: "Undo",
      optOut,
      timeout: 8000,
      onAction: async () => {
        const undone = await send("syncAnilistProgress", { id: offer.id, episode: offer.from, undo: true });
        if (undone?.view) renderView(undone.view);
        panel.showToast({ title: undone?.ok ? "Undone." : undone?.error || "Could not undo that.", timeout: 4000 });
      },
    });
    return;
  }
  panel.showToast({
    title: offer.last ? `Finished ${title || "the last episode"}?` : `Finished episode ${offer.to}?`,
    meta: offer.last ? "That was the last episode. It stays in Notifications if you skip this." : `${title ? `${title} · ` : ""}It stays in Notifications if you skip this.`,
    action: offer.last ? "Mark completed" : "Set to Watching",
    optOut,
    onAction: async () => {
      const response = await send("resolveNotice", { id: noticeId, action: "update" });
      if (response?.view) renderView(response.view);
      panel.showToast({ title: response?.ok ? problemIn(response.syncNote) || done : response?.error || "Could not save that.", timeout: 4000 });
    },
  });
}

function syncFullscreen() {
  if (!panel) return;
  const video = document.querySelector("video");
  const element = document.fullscreenElement || document.webkitFullscreenElement;
  const videoFullscreen = Boolean(video && (element === video || video.webkitDisplayingFullscreen));
  panel.setFullscreen(Boolean(element || videoFullscreen));
  playerBar?.setFullscreen(Boolean(element || videoFullscreen));
}
