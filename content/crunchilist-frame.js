(() => {
  // ui/dom.js
  var ROUNDED = '"Crunchilist Rounded", "Trebuchet MS", Candara, sans-serif';
  function roundedFontFace() {
    let url = "/fonts/nunito-latin.woff2";
    try {
      if (globalThis.chrome?.runtime?.getURL) url = chrome.runtime.getURL("fonts/nunito-latin.woff2");
    } catch {
      url = "/fonts/nunito-latin.woff2";
    }
    return `@font-face{font-family:"Crunchilist Rounded";src:url("${url}") format("woff2");font-weight:400 800;font-style:normal;font-display:swap;}`;
  }

  // content/player-bar.js
  var CSS = `
  ${roundedFontFace()}
  :host { all: initial; }
  .bar {
    position: fixed; top: 72px; right: 16px; transform: translateY(-8px); z-index: 2147483000;
    display: flex; align-items: center; gap: 6px; max-width: min(900px, calc(100vw - 24px)); padding: 5px;
    border-radius: 999px; background: rgba(20, 16, 13, .86); border: 1px solid rgba(255, 226, 196, .14);
    box-shadow: 0 10px 30px rgba(0, 0, 0, .45); -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4);
    color: #f7efe9; font: 700 13px/1.2 ${ROUNDED}; opacity: 0; pointer-events: none;
    transition: opacity .2s ease, transform .2s ease;
  }
  .bar.show { opacity: 1; transform: none; pointer-events: auto; }
  button {
    display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px; border: 0; border-radius: 999px; cursor: pointer;
    font: 800 13px/1 ${ROUNDED}; color: #f7efe9; background: rgba(255, 226, 196, .08); white-space: nowrap;
    transition: background .15s ease, color .15s ease;
  }
  button:hover { background: rgba(255, 226, 196, .16); }
  button.primary { background: #f47521; color: #1a0d05; }
  button.primary:hover { background: #ff8a3d; }
  .back { padding-left: 8px; }
  .back svg { width: 20px; height: 20px; flex: none; }
  .pip { padding: 0 10px 0 12px; }
  .pip svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .pip i { position: relative; width: 26px; height: 15px; flex: none; border-radius: 999px; background: rgba(255, 226, 196, .22); transition: background .2s ease; }
  .pip i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%; background: #f7efe9; transition: transform .2s ease; }
  .pip[aria-checked="true"] i { background: #f47521; }
  .pip[aria-checked="true"] i::after { transform: translateX(11px); }
  .msg { display: flex; align-items: center; gap: 8px; padding: 0 6px 0 10px; min-width: 0; flex: 0 1 auto; }
  .msg span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .spin { width: 14px; height: 14px; flex: none; border-radius: 50%; border: 2px solid rgba(255, 226, 196, .2); border-top-color: #f47521; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .tip {
    position: fixed; z-index: 2147483001; box-sizing: border-box; width: 250px; padding: 12px 14px 11px; border-radius: 14px;
    background: #f47521; color: #1a0d05; box-shadow: 0 12px 32px rgba(0, 0, 0, .45); font: 700 12px/1.3 ${ROUNDED};
    opacity: 0; transform: translateY(6px); pointer-events: none; transition: opacity .45s ease, transform .45s ease;
  }
  .tip.show { opacity: 1; transform: none; pointer-events: auto; }
  .tip::before {
    content: ""; position: absolute; top: -6px; left: var(--arrow, 28px); width: 14px; height: 14px;
    background: inherit; border-radius: 3px 0 0 0; transform: rotate(45deg);
  }
  .tip b { display: block; font: 800 14px/1.2 ${ROUNDED}; }
  .tip small { display: block; margin-top: 3px; font: inherit; opacity: .78; }
  .tip label { display: flex; align-items: center; gap: 7px; margin-top: 10px; cursor: pointer; user-select: none; }
  .tip input { width: 14px; height: 14px; margin: 0; accent-color: #1a0d05; cursor: pointer; }
  .ask {
    position: fixed; inset: 0; z-index: 2147483002; display: grid; place-items: center; cursor: pointer;
    background: rgba(8, 6, 5, .55); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
    font: 700 13px/1.35 ${ROUNDED}; color: #f7efe9; animation: ask-in .25s ease;
  }
  @keyframes ask-in { from { opacity: 0; } }
  .ask-card {
    display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: min(340px, calc(100% - 32px)); padding: 18px 22px 14px;
    border-radius: 18px; text-align: center; background: rgba(20, 16, 13, .9); border: 1px solid rgba(255, 226, 196, .16); box-shadow: 0 18px 50px rgba(0, 0, 0, .5);
  }
  .ask-card svg { width: 30px; height: 30px; color: #f47521; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .ask-card b { font: 800 16px/1.2 ${ROUNDED}; }
  .ask-card small { font: inherit; font-weight: 600; opacity: .75; }
  .ask .later { height: 28px; margin-top: 6px; padding: 0 12px; font-size: 12px; background: transparent; color: rgba(247, 239, 233, .7); }
  .ask .later:hover { color: #f7efe9; background: rgba(255, 226, 196, .1); }
  [hidden] { display: none !important; }
`;
  var LOGO = `<svg viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="clb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8f3f"/><stop offset="1" stop-color="#ef5418"/></linearGradient></defs><path fill="url(#clb)" d="M406.51,82.09A230,230 0 1 0 406.51,429.91A190,190 0 1 1 406.51,82.09Z"/><path transform="translate(210 116) scale(.153)" fill="#ffc54d" stroke="#ffc54d" stroke-width="60" stroke-linejoin="round" fill-rule="evenodd" d="M68.98,29.53l1862.04,315.6L952.66,692.29V1970.47L116.32,234.67l867.9,110.46H305.68L873.76,1591.75V613.39l710.1-268.26Z"/></svg>`;
  var PLAYER = ".video-player-wrapper, iframe.video-player, iframe[src*='vilos']";
  var IDLE_MS = 3e3;
  var GAP = 12;
  var TIP_MS = 9e3;
  var TIP_WIDTH = 250;
  var TIP_SEEN = "crunchilist-back-tip";
  function playerBox(doc) {
    const video = doc.querySelector("video");
    for (const node of [...doc.querySelectorAll(PLAYER), video]) {
      const rect = node?.getBoundingClientRect();
      if (rect && rect.width > 240 && rect.height > 135) return rect;
    }
    return null;
  }
  function headerBottom(doc) {
    const header = doc.querySelector(".erc-large-header");
    const bar = header && [...header.querySelectorAll("*")].find((node) => node.getBoundingClientRect().height > 30);
    const rect = bar?.getBoundingClientRect();
    return rect && rect.top <= 1 ? Math.max(0, rect.bottom) : 0;
  }
  var PIP_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><rect x="12" y="11.5" width="7" height="5.5" rx="1" fill="currentColor" stroke="none"/></svg>`;
  var PIP_MESSAGE = "crunchilist-pip";
  function pauseVideos(doc) {
    for (const video of doc.querySelectorAll("video")) if (!video.paused) video.pause();
  }
  function mainVideo(videos) {
    let best = null;
    let bestArea = 0;
    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (rect.width > 240 && rect.height > 135 && area > bestArea) {
        best = video;
        bestArea = area;
      }
    }
    return best;
  }
  function createPlayerBar(doc, { send, tips = false, frame = false }) {
    const win = doc.defaultView;
    const host = doc.createElement("div");
    host.id = "crunchilist-tabbar";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${CSS}</style><div class="bar" role="region" aria-label="Crunchilist">
    <button class="pip" type="button" role="switch" aria-checked="false" title="Float the episode in a small player that stays above your other windows" hidden>${PIP_ICON}<span>Always on top</span><i></i></button>
    <button class="back" type="button" hidden>${LOGO}<span>Back to Crunchilist</span></button>
    <div class="msg" hidden><i class="spin" hidden></i><span></span></div>
    <button class="act primary" type="button" hidden></button>
    <button class="act2" type="button" hidden></button>
  </div><div class="tip" role="status" hidden>
    <b>Click here to go back</b><small>Returns to your Crunchilist tab whenever you're done watching.</small>
    <label><input type="checkbox">Don't show again</label>
  </div><div class="ask" role="dialog" aria-label="Open the mini player" hidden>
    <div class="ask-card">${PIP_ICON}<b>Click anywhere to open the mini player</b>
      <small>The episode floats above your other windows. Chrome needs one click on the player first.</small>
      <button class="later" type="button">Not now</button></div>
  </div>`;
    const bar = shadow.querySelector(".bar");
    const back = shadow.querySelector(".back");
    const pip = shadow.querySelector(".pip");
    const ask = shadow.querySelector(".ask");
    const msg = shadow.querySelector(".msg");
    const spin = shadow.querySelector(".spin");
    const text = msg.querySelector("span");
    const act = shadow.querySelector(".act");
    const act2 = shadow.querySelector(".act2");
    const tip = shadow.querySelector(".tip");
    const tipOff = tip.querySelector("input");
    let role = null;
    let tipState = "idle";
    let tipTimer = 0;
    let note = "";
    let noteTimer = 0;
    let undoUntil = 0;
    let fullscreen = false;
    let covered = false;
    let awake = false;
    let hovered = false;
    let idleTimer = 0;
    let placeFrame = 0;
    let seq = 0;
    let canPip = false;
    let frameRoom = 0;
    let sentRoom = -1;
    function adopt() {
      if (!host.parentNode) return;
      const element = doc.fullscreenElement || doc.webkitFullscreenElement;
      covered = Boolean(element && /^(IFRAME|VIDEO)$/.test(element.tagName));
      const parent = element && !covered ? element : doc.documentElement;
      if (host.parentNode !== parent) parent.append(host);
    }
    function place() {
      placeFrame = 0;
      if (!host.isConnected) return;
      const width = doc.documentElement.clientWidth || win.innerWidth;
      let top = headerBottom(doc) + GAP;
      let right = 16;
      if (fullscreen) {
        top = 16;
        right = 16;
      } else {
        const box = playerBox(doc);
        if (box && box.bottom > top + 60) {
          top = Math.max(box.top, top - GAP) + GAP;
          right = Math.max(GAP, width - box.right + GAP) + frameRoom;
        }
      }
      bar.style.top = `${Math.round(top)}px`;
      bar.style.right = `${Math.round(right)}px`;
      placeTip();
      tellRoom();
    }
    function tellRoom() {
      if (!frame) return;
      const room = !fullscreen && bar.classList.contains("show") ? Math.ceil(bar.getBoundingClientRect().width) + 6 : 0;
      if (room === sentRoom) return;
      sentRoom = room;
      win.top.postMessage({ type: PIP_MESSAGE, room }, "*");
    }
    if (!frame) {
      win.addEventListener("message", (event) => {
        if (event.data?.type !== PIP_MESSAGE || !/(^|\.)crunchyroll\.com$/.test(new URL(event.origin).hostname)) return;
        const room = Math.max(0, Math.min(400, Number(event.data.room) || 0));
        if (room === frameRoom) return;
        frameRoom = room;
        schedulePlace();
      });
    }
    const pipVideo = () => mainVideo(doc.querySelectorAll("video"));
    function syncPip() {
      syncAsk();
      const next = Boolean(doc.pictureInPictureEnabled && (doc.pictureInPictureElement || pipVideo()));
      const on = Boolean(doc.pictureInPictureElement);
      if (next === canPip && String(on) === pip.getAttribute("aria-checked")) return;
      canPip = next;
      pip.setAttribute("aria-checked", String(on));
      pip.title = on ? "The episode is floating above your other windows. Click to put it back" : "Float the episode in a small player that stays above your other windows";
      paint();
    }
    pip.addEventListener("click", async () => {
      try {
        if (doc.pictureInPictureElement) {
          await doc.exitPictureInPicture();
        } else {
          const video = pipVideo();
          if (!video) return flash("Start the episode first.");
          video.disablePictureInPicture = false;
          await video.requestPictureInPicture();
        }
      } catch {
        flash("Chrome couldn't float this video. Click the video once, then try again.");
      }
      syncPip();
    });
    doc.addEventListener("enterpictureinpicture", syncPip, true);
    doc.addEventListener("leavepictureinpicture", syncPip, true);
    let autoFor = null;
    let sessionHooked = false;
    const episodeOf = (video) => video?.currentSrc || video?.src || "";
    const pending = () => {
      const video = pipVideo();
      return Boolean(role?.miniPlayer && canPip && video && !doc.pictureInPictureElement && autoFor !== episodeOf(video));
    };
    async function floatEpisode() {
      const video = pipVideo();
      autoFor = episodeOf(video);
      syncAsk();
      try {
        video.disablePictureInPicture = false;
        await video.requestPictureInPicture();
      } catch {
        flash("Chrome couldn't float this video. Use the Always on top switch to try again.");
      }
    }
    function syncAsk() {
      const show = pending();
      if (ask.hidden === !show) return;
      ask.hidden = !show;
      if (show) hideTip();
    }
    ask.addEventListener("click", (event) => {
      if (event.target.closest(".later")) {
        autoFor = episodeOf(pipVideo());
        return syncAsk();
      }
      floatEpisode();
    });
    function autoFloat(event) {
      if (event.composedPath().includes(host) || event.key === "Escape" || !pending()) return;
      floatEpisode();
    }
    doc.addEventListener("pointerdown", autoFloat, true);
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !ask.hidden) {
        autoFor = episodeOf(pipVideo());
        return syncAsk();
      }
      autoFloat(event);
    }, true);
    function hookSession() {
      if (sessionHooked || !role?.miniPlayer || !canPip) return;
      sessionHooked = true;
      try {
        win.navigator.mediaSession.setActionHandler("enterpictureinpicture", () => {
          if (role?.miniPlayer && !doc.pictureInPictureElement) pipVideo()?.requestPictureInPicture().catch(() => {
          });
        });
      } catch {
      }
    }
    function schedulePlace() {
      if (!placeFrame) placeFrame = win.requestAnimationFrame(place);
    }
    function seenTip() {
      try {
        return win.sessionStorage.getItem(TIP_SEEN) === "1";
      } catch {
        return false;
      }
    }
    function placeTip() {
      if (tip.hidden) return;
      const anchor = back.getBoundingClientRect();
      const width = doc.documentElement.clientWidth || win.innerWidth;
      const center = anchor.left + anchor.width / 2;
      const left = Math.min(Math.max(8, center - 35), width - TIP_WIDTH - 8, bar.getBoundingClientRect().right - TIP_WIDTH);
      tip.style.top = `${Math.round(anchor.bottom + 12)}px`;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.setProperty("--arrow", `${Math.round(center - left - 7)}px`);
    }
    const barVisible = () => !back.hidden && bar.classList.contains("show") && !fullscreen;
    function maybeTip() {
      if (!tips || tipState !== "idle" || !role?.showTips || !barVisible() || seenTip()) return;
      if (!/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?watch\//i.test(win.location.pathname)) return;
      tipState = "waiting";
      tipTimer = win.setTimeout(showTip, 900);
    }
    function showTip() {
      if (!barVisible()) {
        tipState = "idle";
        return;
      }
      tipState = "showing";
      try {
        win.sessionStorage.setItem(TIP_SEEN, "1");
      } catch {
      }
      tip.hidden = false;
      placeTip();
      void tip.offsetWidth;
      tip.classList.add("show");
      tipTimer = win.setTimeout(hideTip, TIP_MS);
    }
    function hideTip() {
      win.clearTimeout(tipTimer);
      if (tipState !== "showing") return;
      tipState = "done";
      tip.classList.remove("show");
      win.setTimeout(() => {
        tip.hidden = true;
      }, 500);
    }
    tip.addEventListener("pointerenter", () => win.clearTimeout(tipTimer));
    tip.addEventListener("pointerleave", () => {
      win.clearTimeout(tipTimer);
      if (tipState === "showing") tipTimer = win.setTimeout(hideTip, 3e3);
    });
    tipOff.addEventListener("change", () => {
      send("setSettings", { patch: { showTips: !tipOff.checked } });
      if (tipOff.checked) {
        win.clearTimeout(tipTimer);
        tipTimer = win.setTimeout(hideTip, 900);
      }
    });
    function wake() {
      if (!fullscreen || !host.isConnected) return;
      win.clearTimeout(idleTimer);
      idleTimer = win.setTimeout(() => {
        awake = false;
        paint();
      }, IDLE_MS);
      if (!awake) {
        awake = true;
        paint();
      }
    }
    bar.addEventListener("pointerenter", () => {
      hovered = true;
      paint();
    });
    bar.addEventListener("pointerleave", () => {
      hovered = false;
      wake();
      paint();
    });
    doc.addEventListener("mousemove", wake, { passive: true, capture: true });
    doc.addEventListener("pointerdown", wake, { passive: true, capture: true });
    doc.addEventListener("pointerdown", (event) => {
      if (tipState === "showing" && !event.composedPath().includes(host)) hideTip();
    }, { passive: true, capture: true });
    win.addEventListener("scroll", schedulePlace, { passive: true, capture: true });
    win.addEventListener("resize", schedulePlace, { passive: true });
    win.setInterval(() => {
      if (!host.isConnected) return;
      syncPip();
      schedulePlace();
      maybeTip();
    }, 1e3);
    back.addEventListener("click", async () => {
      hideTip();
      const response = await send("backToCrunchilist");
      if (!response?.ok) flash(response?.error || "Couldn't find your Crunchilist tab.");
    });
    const button = (node, label, onClick) => {
      node.hidden = !label;
      node.textContent = label || "";
      node.onclick = onClick || null;
    };
    function paint() {
      const r = role || {};
      hookSession();
      syncAsk();
      const inline = frame && !fullscreen;
      const showBack = Boolean(r.backButton && r.home && r.role !== "moving" && !inline);
      const showPip = Boolean(role && canPip && r.role !== "moving" && r.role !== "stray");
      back.hidden = !showBack;
      pip.hidden = !showPip;
      let message = "";
      let busy = false;
      button(act, "");
      button(act2, "");
      if (inline) {
        message = note;
      } else if (r.role === "stray") {
        message = "You already have a Crunchyroll tab open";
        button(act, "Move it there", () => run("moveTab"));
        button(act2, "Keep this tab", () => run("keepTab"));
      } else if (r.role === "moving") {
        message = "Moving to your Crunchyroll tab\u2026";
        busy = true;
      } else if (r.pending) {
        message = `Opening ${r.pending}\u2026`;
        busy = true;
      } else if (Date.now() < undoUntil) {
        message = "Moved here from your other Crunchyroll tab";
        button(act2, "Undo", () => run("undoMove"));
      } else if (note) {
        message = note;
      }
      msg.hidden = !message;
      text.textContent = message;
      spin.hidden = !busy;
      place();
      bar.classList.toggle("show", !covered && (!fullscreen || awake || hovered) && (showBack || showPip || Boolean(message)));
      if (tipState === "showing" && !barVisible()) hideTip();
      maybeTip();
      tellRoom();
    }
    async function run(type) {
      button(act, "");
      button(act2, "");
      const response = await send(type);
      if (!response?.ok) flash(response?.error || "That didn't work.");
      if (type === "undoMove") undoUntil = 0;
      refresh();
    }
    function flash(value, ms = 8e3) {
      note = value;
      window.clearTimeout(noteTimer);
      noteTimer = window.setTimeout(() => {
        note = "";
        paint();
      }, ms);
      paint();
    }
    async function refresh(extraNote) {
      const id = ++seq;
      const response = await send("tabRole");
      if (id !== seq || !response?.ok) return;
      role = response;
      undoUntil = response.undoFor > 0 ? Date.now() + response.undoFor : 0;
      if (undoUntil) window.setTimeout(paint, response.undoFor + 100);
      if (extraNote) flash(extraNote);
      else paint();
    }
    return {
      host,
      refresh,
      setFullscreen(value) {
        const next = Boolean(value);
        if (next === fullscreen) return;
        fullscreen = next;
        awake = false;
        hovered = false;
        win.clearTimeout(idleTimer);
        adopt();
        paint();
      },
      clear() {
        role = null;
        paint();
      }
    };
  }

  // content/frame.js
  if (window.top !== window) {
    const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, ...payload }).catch((error) => ({ ok: false, error: error?.message || "Extension unavailable" }));
    const bar = createPlayerBar(document, { send, frame: true });
    document.documentElement.append(bar.host);
    bar.refresh();
    const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    const sync = () => bar.setFullscreen(isFullscreen());
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "tabRoleChanged") bar.refresh(isFullscreen() ? message.note : void 0);
      if (message?.type === "pauseVideo") pauseVideos(document);
    });
  }
})();
