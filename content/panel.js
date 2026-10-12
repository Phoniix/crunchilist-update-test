import { ROUNDED, el, icon, progressMeter, roundedFontFace } from "../ui/dom.js";
import { SEARCH_CSS, createSearchView } from "../ui/search-view.js";
import { NOTICES_CSS, createNoticesView, noticeBadge, paintBadge } from "../ui/notices-view.js";
import { SETTINGS_CSS, createSettingsView } from "../ui/settings-view.js";
import { THEME_CSS } from "../ui/theme.js";

const CORNERS = ["bottom-right", "bottom-left", "top-left", "top-right"];

const SHELL_CSS = `
  :host { pointer-events: none; }
  .launcher, .backdrop, .panel, .drawer, .gather, .toast { pointer-events: auto; color: var(--text); font: 400 15px/1.45 ${ROUNDED}; }
  .toast {
    display: flex; align-items: center; gap: 10px; width: min(340px, calc(100vw - 36px)); margin: 0 0 10px; padding: 10px 8px 10px 16px;
    border-radius: 18px; animation: shell-toast .26s var(--ease) both;
  }
  @keyframes shell-toast { from { opacity: 0; transform: translateY(8px); } }
  .toast-copy { flex: 1; min-width: 0; }
  .toast-title { margin: 0; font: 800 13.5px/1.3 ${ROUNDED}; }
  .toast-meta { margin: 2px 0 0; color: var(--muted); font: 600 12px/1.35 ${ROUNDED}; }
  .launcher .nt-badge { top: -6px; right: -6px; }
  :host(.fullscreen) .launcher .nt-badge { display: none; }
  .toast-opt { display: flex; align-items: center; gap: 6px; margin-top: 6px; color: var(--faint); font: 700 11.5px/1.2 ${ROUNDED}; cursor: pointer; }
  .toast-opt:hover { color: var(--muted); }
  .toast-opt input { width: 13px; height: 13px; margin: 0; accent-color: var(--accent); }
  .toast .btn { flex: none; min-height: 32px; padding: 5px 12px; font-size: 12.5px; }
  :host(.fullscreen) .toast { display: none !important; }
  :host(.at-top) .toast, :host(.at-top) .gather { margin: 10px 0 0; }
  .launcher {
    position: relative; z-index: 2; display: grid; place-items: center;
    width: 52px; height: 52px; padding: 0; border-radius: 16px; cursor: pointer;
    color: var(--text); background: var(--glass);
    -webkit-backdrop-filter: blur(18px) saturate(150%); backdrop-filter: blur(18px) saturate(150%);
    border: 1px solid var(--line-strong);
    box-shadow: 0 14px 36px rgba(0, 0, 0, .45), inset 0 1px 0 rgba(255, 255, 255, .06);
    transition: transform .18s var(--ease), color .18s var(--ease), border-color .18s var(--ease), background .18s var(--ease);
  }
  .launcher:hover { transform: translateY(-2px); color: var(--accent-text); border-color: rgba(255, 154, 92, .4); background: var(--glass-strong); }
  .launcher:active { transform: translateY(0); }
  .launcher.is-locked { cursor: progress; }
  .launcher.is-locked svg { animation: shell-pulse 1.4s ease-in-out infinite; }
  @keyframes shell-pulse { 50% { opacity: .35; } }
  .gather {
    display: flex; align-items: center; gap: 10px; width: 252px; box-sizing: border-box; margin: 0 0 10px; padding: 10px 14px;
    border-radius: 14px; color: var(--text); font: 700 12.5px/1.35 ${ROUNDED}; pointer-events: none;
  }
  .gather > svg { flex: none; color: var(--accent-text); animation: shell-pulse 1.4s ease-in-out infinite; }
  .gather-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .gather-copy > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .backdrop {
    position: fixed; inset: 0; z-index: 1; display: none; padding: 0; margin: 0; border: 0; cursor: pointer;
    background: rgba(8, 6, 4, .42);
    -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);
  }
  .backdrop.is-open { display: block; animation: shell-fade .2s var(--ease) both; }
  @keyframes shell-fade { from { opacity: 0; } }
  .panel {
    position: fixed; z-index: 2; left: 50%; top: 8vh; transform: translateX(-50%);
    width: min(660px, calc(100vw - 28px)); max-height: min(84vh, 860px);
    display: none; flex-direction: column; overflow: hidden; border-radius: 26px;
    background: var(--glass-strong);
  }
  .panel.is-open { display: flex; animation: shell-rise .24s var(--ease) both; }
  @keyframes shell-rise { from { opacity: 0; transform: translate(-50%, 10px) scale(.985); } }
  .topbar { display: flex; align-items: center; gap: 2px; padding: 12px 12px 0 20px; flex: none; }
  .brand { margin: 0; flex: 1; color: var(--muted); font: 800 13px/1 ${ROUNDED}; letter-spacing: .1em; text-transform: uppercase; }
  .body { flex: 1; min-height: 0; overflow: auto; padding: 10px 16px 18px; }
  .body .sv-bar { position: sticky; top: 0; z-index: 3; background: rgba(20, 17, 14, .92); }
  .drawer {
    position: fixed; z-index: 2; display: none; overflow: auto; padding: 18px; border-radius: 24px;
    background: var(--glass-strong);
  }
  .drawer.is-open { display: block; animation: shell-fade .18s var(--ease) both; }
  :host(.fullscreen) .launcher { width: 12px; height: 60px; border-radius: 8px 0 0 8px; opacity: .5; }
  :host(.fullscreen) .launcher svg { display: none; }
  :host(.fullscreen) .panel, :host(.fullscreen) .backdrop, :host(.fullscreen) .drawer { display: none !important; }
`;

export function createPanel(doc, { send, onOpenChange = () => {}, onCorner = () => {}, onView = () => {} }) {
  const host = doc.createElement("div");
  host.id = "cr-corner-host";
  host.className = "cl-theme";
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = roundedFontFace() + THEME_CSS + SEARCH_CSS + SETTINGS_CSS + NOTICES_CSS + SHELL_CSS;

  const launcherBadge = noticeBadge();
  const launcher = el("button", { class: "launcher", type: "button", "aria-expanded": "false", "aria-label": "Open Crunchilist search", title: "Search with Crunchilist" }, [icon("search", 22), launcherBadge]);
  const gatherText = el("span", { text: "Gathering the Crunchyroll list" });
  const gatherMeter = progressMeter("Background progress");
  const gather = el("div", { class: "gather glass", role: "status", hidden: true }, [icon("sparkle", 15), el("div", { class: "gather-copy" }, [gatherText, gatherMeter.root])]);
  const backdrop = el("button", { class: "backdrop", type: "button", "aria-label": "Close Crunchilist", tabindex: "-1" });
  const panel = el("section", { class: "panel glass", role: "dialog", "aria-label": "Crunchilist search", hidden: true });
  const drawer = el("section", { class: "drawer glass", role: "dialog", "aria-label": "Crunchilist settings", hidden: true });
  const toastTitle = el("p", { class: "toast-title" });
  const toastMeta = el("p", { class: "toast-meta" });
  const toastAction = el("button", { class: "btn primary", type: "button" });
  const toastClose = el("button", { class: "icon-btn", type: "button", "aria-label": "Dismiss", title: "Dismiss" }, [icon("close", 16)]);
  const toastOptBox = el("input", { type: "checkbox" });
  const toastOptText = el("span");
  const toastOpt = el("label", { class: "toast-opt", hidden: true }, [toastOptBox, toastOptText]);
  const toast = el("div", { class: "toast glass", role: "status", hidden: true }, [el("div", { class: "toast-copy" }, [toastTitle, toastMeta, toastOpt]), toastAction, toastClose]);
  shadow.append(style, backdrop, launcher, gather, toast, panel, drawer);

  let open = false;
  let drawerOpen = false;
  let fullscreen = false;
  let gathering = false;
  let tasks = [];
  let corner = "bottom-right";
  let hydrated = false;

  const search = createSearchView({ send, site: "crunchyroll", onView });
  const moveButton = el("button", { class: "btn", type: "button", title: "Move the search button to the next corner" }, [icon("corner", 15), el("span", { text: "Move button" })]);
  const settings = createSettingsView({ send, onView, pageContext: true, extras: [moveButton] });
  const notices = createNoticesView({ send, onView });
  const fullButton = el("button", { class: "icon-btn", type: "button", "aria-label": "Open the full page", title: "Open the full page" }, [icon("external")]);
  const bellBadge = noticeBadge();
  const bellButton = el("button", { class: "icon-btn nt-bell", type: "button", "aria-label": "Notifications", title: "Notifications", "aria-expanded": "false" }, [icon("bell"), bellBadge]);
  const settingsButton = el("button", { class: "icon-btn", type: "button", "aria-label": "Settings", title: "Settings", "aria-expanded": "false" }, [icon("sliders")]);
  const closeButton = el("button", { class: "icon-btn", type: "button", "aria-label": "Close", title: "Close" }, [icon("close")]);
  const body = el("div", { class: "body" }, [search.root]);
  panel.append(
    el("div", { class: "topbar" }, [el("p", { class: "brand", text: "Crunchilist" }), fullButton, bellButton, settingsButton, closeButton]),
    body,
  );
  search.setScrollRoot(body);
  drawer.append(settings.root, notices.root);
  let drawerPane = "settings";

  function place() {
    const edge = {
      "bottom-right": "right:18px;bottom:18px;",
      "bottom-left": "left:18px;bottom:18px;",
      "top-left": "left:18px;top:18px;",
      "top-right": "right:18px;top:18px;",
    };
    const align = corner.endsWith("left") ? "flex-start" : "flex-end";
    const column = corner.startsWith("bottom") ? "column-reverse" : "column";
    const base = `all:initial;position:fixed;z-index:2147483646;display:flex;flex-direction:${column};align-items:${align};pointer-events:none;`;
    host.classList.toggle("fullscreen", fullscreen);
    host.classList.toggle("at-top", !fullscreen && corner.startsWith("top"));
    host.style.cssText = fullscreen ? `${base}top:40%;right:0;` : `${base}${edge[corner] || edge["bottom-right"]}`;
    placeDrawer();
  }

  function placeDrawer() {
    if (!drawerOpen) return;
    const rect = panel.getBoundingClientRect();
    const width = 340;
    const right = rect.right + 12;
    const left = rect.left - 12 - width;
    if (right + width <= window.innerWidth - 8 || left >= 8) {
      drawer.style.top = `${Math.max(8, rect.top)}px`;
      drawer.style.left = `${right + width <= window.innerWidth - 8 ? right : left}px`;
      drawer.style.width = `${width}px`;
      drawer.style.maxHeight = `${Math.max(280, rect.height)}px`;
      return;
    }
    const topbarHeight = 52;
    drawer.style.top = `${rect.top + topbarHeight}px`;
    drawer.style.left = `${rect.left + 8}px`;
    drawer.style.width = `${Math.max(240, rect.width - 16)}px`;
    drawer.style.maxHeight = `${Math.max(240, rect.height - topbarHeight - 8)}px`;
  }

  function setDrawer(next, pane = drawerPane) {
    drawerPane = pane;
    drawerOpen = Boolean(next) && open && !fullscreen;
    drawer.hidden = !drawerOpen;
    drawer.classList.toggle("is-open", drawerOpen);
    settings.root.hidden = pane !== "settings";
    notices.root.hidden = pane !== "notices";
    drawer.setAttribute("aria-label", pane === "notices" ? "Crunchilist notifications" : "Crunchilist settings");
    for (const [button, name] of [[settingsButton, "settings"], [bellButton, "notices"]]) {
      const on = drawerOpen && pane === name;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-expanded", on ? "true" : "false");
    }
    placeDrawer();
  }

  function toggleDrawer(pane) {
    setDrawer(!drawerOpen || drawerPane !== pane, pane);
  }

  function paint() {
    const shown = open && !fullscreen;
    panel.hidden = !shown;
    panel.classList.toggle("is-open", shown);
    backdrop.classList.toggle("is-open", shown);
    launcher.setAttribute("aria-expanded", shown ? "true" : "false");
    if (!shown) setDrawer(false);
    const showGather = !fullscreen && (gathering || (tasks.length > 0 && !shown));
    gather.hidden = !showGather;
    launcher.classList.toggle("is-locked", gathering);
    launcher.disabled = fullscreen || gathering;
    launcher.title = gathering ? gatherText.textContent : shown ? "Close Crunchilist" : "Search with Crunchilist";
  }

  function setOpen(next, { silent = false } = {}) {
    if (next && (fullscreen || gathering)) return;
    open = Boolean(next);
    paint();
    if (!silent) onOpenChange(open);
    if (open) {
      search.open();
      search.focus();
    } else {
      search.clearSuggestions();
    }
  }

  launcher.addEventListener("click", () => setOpen(!open));
  backdrop.addEventListener("click", () => setOpen(false));
  closeButton.addEventListener("click", () => {
    setOpen(false);
    launcher.focus();
  });
  settingsButton.addEventListener("click", () => toggleDrawer("settings"));
  bellButton.addEventListener("click", () => toggleDrawer("notices"));
  fullButton.addEventListener("click", () => send("openApp"));
  moveButton.addEventListener("click", () => {
    corner = CORNERS[(CORNERS.indexOf(corner) + 1) % CORNERS.length];
    place();
    onCorner(corner);
  });
  window.addEventListener("resize", placeDrawer);
  host.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key !== "Escape" || !open || fullscreen) return;
    if (drawerOpen) setDrawer(false);
    else {
      setOpen(false);
      launcher.focus();
    }
  });
  host.addEventListener("click", (event) => event.stopPropagation());

  let toastTimer = 0;
  let toastHandler = null;
  let toastOptOut = null;
  function hideToast() {
    window.clearTimeout(toastTimer);
    toast.hidden = true;
    toastHandler = null;
    toastOptOut = null;
  }
  function showToast({ title, meta = "", action = "", onAction = null, optOut = null, timeout = 30_000 }) {
    toastTitle.textContent = title;
    toastMeta.textContent = meta;
    toastMeta.hidden = !meta;
    toastOptOut = optOut;
    toastOpt.hidden = !optOut;
    toastOptBox.checked = false;
    toastOptText.textContent = optOut?.label || "Don't show again";
    toastAction.textContent = action;
    toastAction.hidden = !action;
    toastAction.disabled = false;
    toastHandler = onAction;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, timeout);
  }
  toastAction.addEventListener("click", async () => {
    const handler = toastHandler;
    if (!handler) return;
    toastAction.disabled = true;
    await handler();
  });
  toastClose.addEventListener("click", hideToast);
  toastOptBox.addEventListener("change", () => toastOptOut?.onChange?.(toastOptBox.checked));
  toast.addEventListener("pointerenter", () => window.clearTimeout(toastTimer));
  toast.addEventListener("pointerleave", () => {
    if (!toast.hidden) toastTimer = window.setTimeout(hideToast, 6000);
  });

  place();
  paint();

  return {
    host,
    setView(view, { syncOpen = false } = {}) {
      if (!view) return;
      search.setView(view);
      settings.setView(view);
      notices.setView(view);
      const count = view.notices?.length || 0;
      paintBadge(bellBadge, count);
      paintBadge(launcherBadge, view.settings?.muteNotifications ? 0 : count);
      launcher.setAttribute("aria-label", count && !view.settings?.muteNotifications ? `Open Crunchilist search, ${count} notifications` : "Open Crunchilist search");
      if (syncOpen && !hydrated) {
        hydrated = true;
        corner = view.settings?.panelCorner || corner;
        place();
      }
    },
    setGathering(on, message) {
      gathering = Boolean(on);
      if (message) gatherText.textContent = message;
      if (gathering && open) setOpen(false, { silent: true });
      paint();
    },
    setActivity(next) {
      tasks = Array.isArray(next) ? next : [];
      const [first] = tasks;
      if (first) {
        gatherText.textContent = tasks.length > 1 ? `${first.label} +${tasks.length - 1}` : first.label;
        gatherMeter.set(first.progress);
        gather.title = tasks.map((task) => `${task.label}: ${task.percent}%`).join("\n");
      } else {
        gatherMeter.set(null);
        gather.title = "";
      }
      paint();
    },
    setFullscreen(on) {
      fullscreen = Boolean(on);
      place();
      paint();
    },
    showToast,
    hideToast,
  };
}
