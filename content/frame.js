import { createPlayerBar, pauseVideos } from "./player-bar.js";

// Crunchyroll's player runs in a static.crunchyroll.com iframe and goes fullscreen from inside it,
// where the top page's bar can't be drawn, so the frame shows its own copy while fullscreen.
// Outside fullscreen that copy only holds the Always on top switch, which has to be clicked in here.
if (window.top !== window) {
  const send = (type, payload = {}) =>
    chrome.runtime.sendMessage({ type, ...payload }).catch((error) => ({ ok: false, error: error?.message || "Extension unavailable" }));
  const bar = createPlayerBar(document, { send, frame: true });
  document.documentElement.append(bar.host);
  bar.refresh();

  const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  const sync = () => bar.setFullscreen(isFullscreen());

  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
  chrome.runtime.onMessage.addListener((message) => {
    // Outside fullscreen the top page's bar already shows the note.
    if (message?.type === "tabRoleChanged") bar.refresh(isFullscreen() ? message.note : undefined);
    if (message?.type === "pauseVideo") pauseVideos(document);
  });
}
