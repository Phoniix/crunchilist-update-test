// The page's only door to the extension: every read and write is a background message.
const WATCHED_KEYS = ["crCornerState", "crCatalog", "alMedia"];

export function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload }).catch((error) => ({ ok: false, error: error?.message || "Crunchilist isn't responding. Reload this page." }));
}

export function createData() {
  return {
    send,
    load: () => send("appData"),
    saveSeasons: (showId, changes) => send("setSeasonState", { showId, changes }),
    play: (request) => send("playEpisode", request),
    warm: (requests) => send("warmEpisodes", { requests }),
    // Calls back with "data" when the library, catalog or AniList extras change in storage, and with a view when the background pushes one.
    watch(onChange) {
      let timer = 0;
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !WATCHED_KEYS.some((key) => key in changes)) return;
        clearTimeout(timer);
        timer = setTimeout(() => onChange("data"), 700);
      });
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === "enriched" && message.view) onChange("view", message.view);
      });
    },
  };
}
