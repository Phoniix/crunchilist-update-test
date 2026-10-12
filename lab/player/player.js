// The player screen as a mountable module: mountPlayer(container, { episodes, startId }) draws into any element,
// so Prism can embed it later the same way this lab page does.
import { actionForKey, formatTime, loadResume, nextEpisode, resumeAt, savePosition, sourceKind, stepSpeed, storeResume, youtubeId } from "./player-core.js";

const ICONS = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor" stroke="none"/>',
  back: '<path d="M11 6 5 12l6 6M19 6l-6 6 6 6"/>',
  forward: '<path d="m13 6 6 6-6 6M5 6l6 6-6 6"/>',
  next: '<path d="M6 5v14l9-7zM18 5v14" fill="currentColor"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  muted: '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/>',
  captions: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
};
const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const IDLE_MS = 2600;

export function mountPlayer(container, { episodes = [], startId = null, storage = globalThis.localStorage, onEpisode = () => {} } = {}) {
  let list = episodes.slice();
  let current = null;
  let resume = loadResume(storage);
  let idleTimer = 0;
  let saveTimer = 0;

  container.classList.add("clp");
  container.innerHTML = `
    <div class="clp-stage" tabindex="0" aria-label="Video player">
      <video class="clp-video" playsinline preload="metadata"></video>
      <iframe class="clp-embed" hidden allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Video"></iframe>
      <div class="clp-flash" aria-hidden="true"></div>
      <div class="clp-top"><div class="clp-title"></div></div>
      <div class="clp-controls">
        <div class="clp-seek"><input type="range" min="0" max="1000" value="0" step="1" aria-label="Seek"><div class="clp-buffer"></div></div>
        <div class="clp-row">
          <button data-do="toggle" aria-label="Play">${icon("play")}</button>
          <button data-do="back10" aria-label="Back 10 seconds">${icon("back")}</button>
          <button data-do="forward10" aria-label="Forward 10 seconds">${icon("forward")}</button>
          <button data-do="next" aria-label="Next episode">${icon("next")}</button>
          <button data-do="mute" aria-label="Mute">${icon("volume")}</button>
          <input class="clp-volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume">
          <span class="clp-time">0:00 / 0:00</span>
          <span class="clp-grow"></span>
          <button data-do="speed" class="clp-speed" aria-label="Playback speed">1×</button>
          <button data-do="captions" aria-label="Captions">${icon("captions")}</button>
          <button data-do="episodes" aria-label="Episodes">${icon("list")}</button>
          <button data-do="fullscreen" aria-label="Fullscreen">${icon("full")}</button>
        </div>
      </div>
    </div>
    <aside class="clp-side"><h3>Episodes</h3><ol class="clp-list"></ol></aside>`;

  const $ = (selector) => container.querySelector(selector);
  const stage = $(".clp-stage");
  const video = $(".clp-video");
  const embed = $(".clp-embed");
  const seek = $(".clp-seek input");
  const volume = $(".clp-volume");

  const embedded = () => !embed.hidden;
  const flash = (text) => {
    const el = $(".clp-flash");
    el.textContent = text;
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  };
  const wake = () => {
    stage.classList.remove("idle");
    clearTimeout(idleTimer);
    if (!video.paused) idleTimer = setTimeout(() => stage.classList.add("idle"), IDLE_MS);
  };
  const paintList = () => {
    $(".clp-list").innerHTML = list.map((episode) => `<li><button data-episode="${esc(episode.id)}" class="${episode.id === current?.id ? "on" : ""}">
      <b>${esc(episode.label || "")}</b><span>${esc(episode.title)}</span></button></li>`).join("");
  };
  const paintTime = () => {
    const duration = video.duration || 0;
    $(".clp-time").textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
    if (document.activeElement !== seek) seek.value = duration ? Math.round((video.currentTime / duration) * 1000) : 0;
    const end = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
    $(".clp-buffer").style.width = `${duration ? (end / duration) * 100 : 0}%`;
  };
  const paintPlay = () => {
    const button = $('[data-do="toggle"]');
    button.innerHTML = icon(video.paused ? "play" : "pause");
    button.setAttribute("aria-label", video.paused ? "Play" : "Pause");
    stage.classList.toggle("paused", video.paused);
  };
  const paintVolume = () => {
    const quiet = video.muted || video.volume === 0;
    $('[data-do="mute"]').innerHTML = icon(quiet ? "muted" : "volume");
    volume.value = video.muted ? 0 : video.volume;
  };
  const captionTrack = () => [...video.textTracks].find((track) => track.kind === "subtitles" || track.kind === "captions");
  const remember = () => {
    if (!current || embedded() || !video.duration) return;
    resume = savePosition(resume, current.id, video.currentTime);
    storeResume(storage, resume);
  };

  function load(id, { autoplay = true } = {}) {
    const episode = list.find((item) => item.id === id);
    if (!episode) return false;
    const kind = sourceKind(episode.src);
    if (!kind) return false;
    remember();
    current = episode;
    $(".clp-title").innerHTML = `${episode.label ? `<b>${esc(episode.label)}</b>` : ""}<span>${esc(episode.title)}</span>`;
    video.querySelectorAll("track").forEach((track) => track.remove());
    if (kind === "youtube") {
      video.pause();
      video.removeAttribute("src");
      video.load();
      embed.src = `https://www.youtube-nocookie.com/embed/${youtubeId(episode.src)}?autoplay=${autoplay ? 1 : 0}&rel=0&modestbranding=1`;
      embed.hidden = false;
      stage.classList.add("embedded");
    } else {
      embed.hidden = true;
      embed.removeAttribute("src");
      stage.classList.remove("embedded");
      for (const track of episode.tracks || []) {
        const el = document.createElement("track");
        Object.assign(el, { kind: "subtitles", src: track.src, srclang: track.lang || "en", label: track.label || track.lang || "Subtitles" });
        video.append(el);
      }
      video.src = episode.src;
      video.addEventListener("loadedmetadata", () => {
        const at = resumeAt(resume[episode.id]?.at, video.duration);
        if (at) { video.currentTime = at; flash(`Resumed at ${formatTime(at)}`); }
        if (autoplay) video.play().catch(() => paintPlay());
      }, { once: true });
    }
    paintList();
    onEpisode(episode);
    return true;
  }

  const actions = {
    toggle: () => (video.paused ? video.play().catch(() => {}) : video.pause()),
    back10: () => { video.currentTime -= 10; flash("−10s"); },
    forward10: () => { video.currentTime += 10; flash("+10s"); },
    back5: () => { video.currentTime -= 5; flash("−5s"); },
    forward5: () => { video.currentTime += 5; flash("+5s"); },
    volumeUp: () => { video.muted = false; video.volume = Math.min(1, video.volume + 0.1); flash(`${Math.round(video.volume * 100)}%`); },
    volumeDown: () => { video.volume = Math.max(0, video.volume - 0.1); flash(`${Math.round(video.volume * 100)}%`); },
    mute: () => { video.muted = !video.muted; flash(video.muted ? "Muted" : "Sound on"); },
    faster: () => setSpeed(1),
    slower: () => setSpeed(-1),
    speed: () => setSpeed(video.playbackRate >= 2 ? -99 : 1),
    captions: () => {
      const track = captionTrack();
      if (!track) return flash("No captions");
      track.mode = track.mode === "showing" ? "hidden" : "showing";
      flash(track.mode === "showing" ? "Captions on" : "Captions off");
    },
    fullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : container.requestFullscreen?.()),
    episodes: () => { $(".clp-side").hidden = !$(".clp-side").hidden; },
    next: () => { const next = nextEpisode(list, current?.id); if (next) load(next.id); },
  };
  function setSpeed(direction) {
    video.playbackRate = direction === -99 ? 1 : stepSpeed(video.playbackRate, direction);
    $(".clp-speed").textContent = `${video.playbackRate}×`;
    flash(`${video.playbackRate}×`);
  }
  const run = (name) => {
    if (name.startsWith("seek")) {
      if (video.duration) video.currentTime = (Number(name.slice(4)) / 10) * video.duration;
      return;
    }
    if (embedded() && !["fullscreen", "episodes", "next"].includes(name)) return;
    actions[name]?.();
    wake();
  };

  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-do], [data-episode]");
    if (button?.dataset.episode) return load(button.dataset.episode);
    if (button) return run(button.dataset.do);
    if (event.target === video) run("toggle");
  });
  video.addEventListener("dblclick", () => run("fullscreen"));
  stage.addEventListener("keydown", (event) => {
    if (event.target.matches("input[type=range]") && event.key.startsWith("Arrow")) return;
    const name = actionForKey(event);
    if (!name) return;
    event.preventDefault();
    run(name);
  });
  stage.addEventListener("pointermove", wake);
  seek.addEventListener("input", () => { if (video.duration) video.currentTime = (seek.value / 1000) * video.duration; });
  volume.addEventListener("input", () => { video.volume = Number(volume.value); video.muted = video.volume === 0; });
  video.addEventListener("timeupdate", () => {
    paintTime();
    if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = 0; remember(); }, 5000);
  });
  video.addEventListener("progress", paintTime);
  video.addEventListener("durationchange", paintTime);
  video.addEventListener("play", () => { paintPlay(); wake(); });
  video.addEventListener("pause", () => { paintPlay(); wake(); remember(); });
  video.addEventListener("volumechange", paintVolume);
  video.addEventListener("ended", () => {
    resume = savePosition(resume, current?.id, 0);
    storeResume(storage, resume);
    actions.next();
  });
  video.addEventListener("error", () => flash("This source can't be played"));
  const onLeave = () => remember();
  addEventListener("pagehide", onLeave);

  paintList();
  paintPlay();
  if (list.length) load(startId && list.some((e) => e.id === startId) ? startId : list[0].id, { autoplay: false });

  return {
    load,
    setEpisodes(next, { play = null } = {}) {
      list = next.slice();
      paintList();
      if (play) load(play);
    },
    current: () => current,
    destroy() {
      remember();
      clearTimeout(idleTimer); clearTimeout(saveTimer);
      removeEventListener("pagehide", onLeave);
      video.pause();
      container.innerHTML = "";
      container.classList.remove("clp");
    },
  };
}
