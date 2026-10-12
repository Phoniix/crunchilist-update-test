import { PROVIDERS } from "../lib/providers.js";
import { filterTagSuggestions } from "../lib/taste.js";
import { BADGE_CORNERS, BADGE_CSS, BADGE_STYLES, badgeOptions, paintBadge } from "./badge-style.js";
import { ROUNDED, el, fillStatusSelect, icon, progressMeter, setAvatar } from "./dom.js";
import { HISTORY_CSS, createHistoryView } from "./history-view.js";

const PREVIEW_SHOWS = [
  { mark: "in_progress", progress: 7, episodes: 24, art: "linear-gradient(160deg, #5b2a86 0%, #b23a48 55%, #1b1b2f 100%)" },
  { mark: "finished", progress: 64, episodes: 64, art: "linear-gradient(160deg, #c9822b 0%, #6b3a1f 50%, #141414 100%)" },
  { mark: "plan", progress: null, episodes: 148, art: "linear-gradient(160deg, #2f7a5b 0%, #1f4e79 55%, #0f1a24 100%)" },
  { mark: "unwatched", progress: null, episodes: 26, art: "linear-gradient(160deg, #3a4a7a 0%, #1a2340 55%, #0b0f1c 100%)" },
];

export const SETTINGS_CSS = `
  ${BADGE_CSS}
  ${HISTORY_CSS}
  .st-preview { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 4px 0 10px; }
  .st-poster { position: relative; min-width: 0; aspect-ratio: 2 / 3; border-radius: 6px; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); }
  .st-poster::after { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 70% 25%, rgba(255,255,255,.18), transparent 45%); pointer-events: none; }
  .st-poster .crl-badge { z-index: 1; }
  .st-stack { display: flex; flex-direction: column; gap: 10px; min-width: 0; margin-bottom: 14px; }
  .st-stack select { width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; }
  .st-stack .st-field + .st-field { margin-top: 0; }
  .st { display: flex; flex-direction: column; gap: 14px; }
  .st-title { margin: 0; font: 800 17px/1.2 ${ROUNDED}; }
  .st-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .st-head .switch { align-items: center; gap: 8px; }
  .st-head .switch-label { color: var(--muted); font-size: 12.5px; }
  .st-card {
    display: flex; flex-direction: column; gap: 10px; padding: 14px;
    border-radius: 16px; background: var(--pane); border: 1px solid var(--line);
    transition: border-color .18s var(--ease);
  }
  .st-card:hover { border-color: var(--line-strong); }
  .st-account { display: flex; align-items: center; gap: 12px; }
  .st-avatar { display: grid; place-items: center; width: 34px; height: 34px; flex: none; color: var(--muted); font: 800 16px/1 ${ROUNDED}; }
  .st-avatar.is-connected { color: var(--accent-text); }
  .st-avatar.has-photo img { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; box-shadow: 0 0 0 1px var(--line-strong); }
  .st-account-copy { flex: 1; min-width: 0; }
  .st-name { margin: 0; font: 800 14.5px/1.25 ${ROUNDED}; }
  .st-meta { margin: 2px 0 0; color: var(--muted); font: 600 12.5px/1.35 ${ROUNDED}; }
  .st-sync { display: flex; align-items: center; gap: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
  .st-sync-text { flex: 1; min-width: 0; color: var(--muted); font: 600 12.5px/1.35 ${ROUNDED}; }
  .st-sync .btn { min-height: 30px; padding: 4px 11px; font-size: 12.5px; }
  .st-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .st-row input { flex: 1; min-width: 0; }
  .st-section-title { margin: 0; color: var(--faint); font: 800 11.5px/1.2 ${ROUNDED}; letter-spacing: .08em; text-transform: uppercase; }
  .st-context { display: flex; flex-direction: column; gap: 8px; }
  .st-context-title { margin: 0; font: 700 13.5px/1.3 ${ROUNDED}; }
  .st-field { display: flex; flex-direction: column; gap: 6px; }
  .st-field + .st-field { margin-top: 6px; }
  .st-label { font: 800 13px/1.2 ${ROUNDED}; }
  .st-hint { color: var(--faint); font: 600 12px/1.35 ${ROUNDED}; }
  .st-tokens { display: flex; flex-wrap: wrap; gap: 5px; }
  .st-token {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; border: 0; border-radius: 9px; cursor: pointer;
    background: rgba(255, 226, 196, .07); color: var(--text); font: 700 12px/1.2 ${ROUNDED};
    transition: background .14s var(--ease);
  }
  .st-token:hover { background: rgba(255, 122, 47, .16); }
  .st-token svg { opacity: .55; }
  .st-suggest { position: relative; }
  .st-suggest input { width: 100%; }
  .st-list {
    position: absolute; z-index: 4; left: 0; right: 0; top: calc(100% + 4px);
    display: flex; flex-direction: column; gap: 2px; padding: 4px; max-height: 180px; overflow: auto;
    border-radius: 12px; background: var(--glass-strong); border: 1px solid var(--line-strong);
  }
  .st-list button { text-align: left; border: 0; border-radius: 8px; padding: 6px 8px; cursor: pointer; background: transparent; color: var(--text); font: 600 13px/1.2 ${ROUNDED}; }
  .st-list button.is-on, .st-list button:hover { background: rgba(255, 226, 196, .08); }
  details.st-card > summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font: 800 14px/1.2 ${ROUNDED}; }
  details.st-card > summary::-webkit-details-marker { display: none; }
  details.st-card > summary::after { content: "+"; color: var(--faint); font: 700 18px/1 ${ROUNDED}; transition: transform .18s var(--ease); }
  details.st-card[open] > summary::after { transform: rotate(45deg); }
  .st-model { margin: 0; color: var(--muted); font: 600 13px/1.4 ${ROUNDED}; }
  .st-model strong { color: var(--text); }
  .st-model-detail { display: block; margin-top: 2px; color: var(--faint); font-size: 12px; }
  .st-status { min-height: 1.3em; margin: 0; color: var(--muted); font: 600 12.5px/1.4 ${ROUNDED}; }
  .st-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .st-refreshed { margin: 0 0 -6px; }
  .st-provider { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid var(--line); }
  .st-provider-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .st-free { padding: 2px 7px; border-radius: 999px; background: rgba(120, 220, 160, .12); color: #9fe3b8; font: 800 10.5px/1.3 ${ROUNDED}; letter-spacing: .04em; text-transform: uppercase; }
  .st-provider-state { color: var(--muted); font: 700 12px/1.2 ${ROUNDED}; }
  .st-link { margin-left: auto; color: var(--accent-text); font: 700 12.5px/1.2 ${ROUNDED}; text-decoration: none; }
  .st-link:hover { text-decoration: underline; }
  .st-provider + .switch, .st-actions + .switch { margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--line); }
`;

export function createSettingsView({ send, onView = () => {}, pageContext = false, extras = [] } = {}) {
  let view = null;
  let catalogPoll = 0;
  const focused = () => root.getRootNode()?.activeElement || document.activeElement;

  const avatar = el("span", { class: "st-avatar" }, [icon("user", 22)]);
  const name = el("p", { class: "st-name", text: "Not connected" });
  const meta = el("p", { class: "st-meta", text: "Connect AniList to keep your list in sync." });
  const accountButton = el("button", { class: "btn primary", type: "button", text: "Set up" });
  const userInput = el("input", { type: "text", placeholder: "Public AniList username", "aria-label": "Public AniList username" });
  const importButton = el("button", { class: "btn", type: "submit", text: "Import" });
  const publicRow = el("form", { class: "st-row" }, [userInput, importButton]);
  const syncText = el("span", { class: "st-sync-text" });
  const syncButton = el("button", { class: "btn", type: "button", title: "Send waiting changes to AniList" }, [icon("refresh", 14), el("span", { text: "Retry" })]);
  const syncRow = el("div", { class: "st-sync", hidden: true }, [syncText, syncButton]);
  const historyText = el("span", { class: "st-sync-text" });
  const historyButton = el("button", { class: "btn", type: "button" }, [icon("history", 14), el("span", { text: "Import history" })]);
  const historyRow = el("div", { class: "st-sync", hidden: true }, [historyText, historyButton]);
  let historyWaiting = false;
  const account = el("div", { class: "st-card" }, [
    el("div", { class: "st-account" }, [avatar, el("div", { class: "st-account-copy" }, [name, meta]), accountButton]),
    syncRow,
    historyRow,
    publicRow,
  ]);

  const contextTitle = el("p", { class: "st-context-title" });
  const currentStatus = el("select", { "aria-label": "Status for this show" });
  fillStatusSelect(currentStatus, "");
  const progressButton = el("button", { class: "btn", type: "button", hidden: true });
  const context = el("div", { class: "st-card st-context", hidden: true }, [
    el("p", { class: "st-section-title", text: "On this page" }),
    contextTitle,
    currentStatus,
    progressButton,
  ]);

  const tasteBox = el("div");
  const taste = el("details", { class: "st-card" }, [el("summary", { text: "Taste preferences" }), tasteBox]);
  const modelLine = el("p", { class: "st-model" });
  const service = el("select", { "aria-label": "AI service" });
  service.append(el("option", { value: "auto", text: "Auto (recommended)" }));
  for (const provider of PROVIDERS) service.append(el("option", { value: provider.id, text: provider.free ? `${provider.label} (free)` : provider.label }));
  const serviceHint = el("span", { class: "st-hint" });
  const providerRows = PROVIDERS.map((provider) => {
    const input = el("input", { type: "password", autocomplete: "off", spellcheck: "false", "aria-label": `${provider.label} API key`, placeholder: `${provider.label} API key` });
    const save = el("button", { class: "btn primary", type: "button", text: "Save" });
    const remove = el("button", { class: "btn", type: "button", text: "Remove", hidden: true });
    const state = el("span", { class: "st-provider-state" });
    save.addEventListener("click", () => {
      const key = input.value.trim();
      if (!key) return;
      input.value = "";
      say(`Checking the ${provider.label} key…`);
      act("setSettings", { patch: { providerKey: { id: provider.id, key } } }, (response) => (
        response.originOk === false ? `${response.keyNote || "Key saved."} Allow ${response.origin} in extension settings first.` : response.keyNote || "Key saved."
      ));
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") save.click();
    });
    remove.addEventListener("click", () => act("clearKey", { id: provider.id }, `${provider.label} key removed.`));
    const row = el("div", { class: "st-provider" }, [
      el("div", { class: "st-provider-head" }, [
        el("span", { class: "st-label", text: provider.label }),
        provider.free ? el("span", { class: "st-free", text: "Free" }) : null,
        state,
        el("a", { class: "st-link", href: provider.keyUrl, target: "_blank", rel: "noopener noreferrer", text: provider.free ? "Get a free key" : "Get a key" }),
      ]),
      el("span", { class: "st-hint", text: provider.hint }),
      el("div", { class: "st-row" }, [input, save, remove]),
    ]);
    return { provider, input, remove, state, row };
  });
  service.addEventListener("change", () => act("setSettings", { patch: { aiService: service.value } }, "Saved."));
  const ai = el("details", { class: "st-card" }, [
    el("summary", { text: "AI preferences" }),
    modelLine,
    el("div", { class: "st-field" }, [el("span", { class: "st-label", text: "AI service" }), service, serviceHint]),
    ...providerRows.map((item) => item.row),
  ]);

  const switches = {};
  function switchRow(key, label, hint) {
    const box = el("input", { type: "checkbox", role: "switch" });
    box.addEventListener("change", () => act("setSettings", { patch: { [key]: box.checked } }, "Saved."));
    switches[key] = box;
    return el("label", { class: "switch" }, [
      box,
      el("span", { class: "switch-copy" }, [el("span", { class: "switch-label", text: label }), el("span", { class: "switch-hint", text: hint })]),
    ]);
  }
  ai.append(switchRow("askModelDownload", "Ask before downloading the AI model", "Chrome's built-in model is a one-time download of a few GB."));
  const tracking = el("details", { class: "st-card" }, [
    el("summary", { text: "Notification preferences" }),
    switchRow("episodeDialogs", "Episode update dialogs", "Ask before updating your list when you finish an episode, and confirm automatic updates. When off, updates happen without a dialog and show up in Notifications."),
    switchRow("muteNotifications", "Mute notifications", "No pop-ups on Crunchyroll and no count on the Find button. Notifications still collect under the bell."),
  ]);
  const badgeSelect = (key, label, choices) => {
    const select = el("select", { "aria-label": label });
    for (const [value, text] of choices) select.append(el("option", { value, text }));
    select.addEventListener("change", () => act("setSettings", { patch: { [key]: select.value } }, "Saved."));
    return select;
  };
  const badgeStyle = badgeSelect("badgeStyle", "Badge style", BADGE_STYLES);
  const badgeCorner = badgeSelect("badgeCorner", "Badge corner", BADGE_CORNERS);
  const badgeSize = badgeSelect("badgeSize", "Badge size", [["normal", "Normal"], ["small", "Small"]]);
  const badgeUnwatched = badgeSelect("badgeUnwatched", "Unwatched shows", [["hover", "Show on hover"], ["always", "Always show"], ["never", "Never show"]]);
  const badgeMotion = badgeSelect("badgeMotion", "Badge animation", [["animated", "Animated"], ["static", "Static"]]);
  const cornerHint = el("span", { class: "st-hint", text: "The glass footer always sits along the bottom.", hidden: true });
  const previewPosters = PREVIEW_SHOWS.map((show) => {
    const badge = el("span");
    badge.addEventListener("click", (event) => event.preventDefault());
    const poster = el("div", { class: "st-poster", "data-crl-card": "1", style: `background:${show.art}` }, [badge]);
    return { show, badge, poster };
  });
  function paintPreview(settings) {
    const options = badgeOptions(settings);
    for (const { show, badge } of previewPosters) {
      badge.hidden = show.mark === "unwatched" && options.unwatched === "never";
      if (!badge.hidden) paintBadge(badge, show.mark, show, options);
      badge.setAttribute("tabindex", "-1");
      badge.removeAttribute("role");
      badge.removeAttribute("aria-haspopup");
      badge.title = "";
    }
  }
  const badges = el("details", { class: "st-card" }, [
    el("summary", { text: "Status badge preferences" }),
    el("span", { class: "st-hint", text: "Hover a poster to preview. On Crunchyroll, click a badge to change the show's status." }),
    el("div", { class: "st-preview" }, previewPosters.map((item) => item.poster)),
    el("div", { class: "st-stack" }, [
      el("div", { class: "st-field" }, [el("span", { class: "st-label", text: "Style" }), badgeStyle]),
      el("div", { class: "st-field" }, [el("span", { class: "st-label", text: "Corner" }), badgeCorner]),
      el("div", { class: "st-field" }, [el("span", { class: "st-label", text: "Size" }), badgeSize]),
      el("div", { class: "st-field" }, [el("span", { class: "st-label", text: "Unwatched shows" }), badgeUnwatched]),
      el("div", { class: "st-field" }, [el("span", { class: "st-label", text: "Animation" }), badgeMotion]),
    ]),
    cornerHint,
    switchRow("badgeProgress", "Show episode progress", "Adds the episode you're on, like 7/24, to in-progress and dropped shows."),
  ]);

  const search = el("details", { class: "st-card" }, [
    el("summary", { text: "Search preferences" }),
    switchRow("favorNamed", "Favor the named show", "In searches like “like Frieren but sadder,” being close to the named show counts more than the other words."),
  ]);

  const liteBox = el("input", { type: "checkbox", role: "switch", "aria-label": "Performance mode" });
  liteBox.addEventListener("change", () => act("setSettings", { patch: { liteMode: liteBox.checked } }, liteBox.checked ? "Performance mode on." : "Performance mode off."));
  const liteSwitch = el("label", {
    class: "switch",
    title: "Turns off blur, glow animations, and transitions, and checks Crunchyroll pages less often. Try it if things feel slow.",
  }, [liteBox, el("span", { class: "switch-label", text: "Performance mode" })]);

  const refreshCatalog = el("button", { class: "btn", type: "button", title: "Update Crunchyroll titles and AniList details" }, [icon("refresh", 15), el("span", { text: "Refresh catalog" })]);
  const refreshedLine = el("span", { class: "st-hint st-refreshed", text: "" });
  const statusMeter = progressMeter("Catalog progress");
  const statusBar = statusMeter.root;
  const status = el("p", { class: "st-status", role: "status" });
  const root = el("div", { class: "st" }, [
    el("div", { class: "st-head" }, [el("h2", { class: "st-title", text: "Settings" }), liteSwitch]),
    account,
    context,
    taste,
    search,
    tracking,
    badges,
    ai,
    refreshedLine,
    el("div", { class: "st-actions" }, [refreshCatalog, ...extras]),
    statusBar,
    status,
  ]);
  const history = createHistoryView({ send, onView, onClose: () => checkHistory() });
  root.append(history.root);

  async function checkHistory() {
    const job = await send("historyProgress");
    historyWaiting = Boolean(job?.ok && (job.waiting || job.running));
    paintHistoryRow();
  }

  function paintHistoryRow() {
    const settings = view?.settings || {};
    historyRow.hidden = !(settings.anilistConnected && settings.anilistViewerName);
    const done = view?.historyImport?.at
      ? `Added ${view.historyImport.shows === 1 ? "1 show" : `${view.historyImport.shows} shows`} from Crunchyroll on ${new Date(view.historyImport.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`
      : "";
    historyText.textContent = historyWaiting
      ? "Your Crunchyroll history is ready to review."
      : done || "Add the shows you've watched on Crunchyroll to AniList.";
    historyButton.lastChild.textContent = historyWaiting ? "Review" : done ? "Import again" : "Import history";
  }

  historyButton.addEventListener("click", () => {
    if (historyWaiting) history.resume();
    else history.start();
  });
  checkHistory();

  function say(text, progress) {
    status.textContent = text || "";
    statusMeter.set(progress);
  }

  async function act(type, payload, done) {
    const response = await send(type, payload);
    if (!response?.ok) {
      say(response?.error || "Something went wrong.");
      return null;
    }
    if (response.view) onView(response.view);
    if (done) say(typeof done === "function" ? done(response) : done);
    return response;
  }

  function tokenList(container, values, field) {
    container.replaceChildren();
    for (const value of values || []) {
      const button = el("button", { class: "st-token", type: "button", "aria-label": `Remove ${value}` }, [el("span", { text: value }), icon("close", 12)]);
      button.addEventListener("click", () => {
        act("setTaste", { taste: { ...view.taste, [field]: view.taste[field].filter((item) => item !== value) } });
      });
      container.append(button);
    }
  }

  function tasteField(field, label, hint) {
    const tokens = el("div", { class: "st-tokens" });
    const input = el("input", { type: "text", placeholder: "Type a tag", "aria-label": label, autocomplete: "off" });
    const list = el("div", { class: "st-list", role: "listbox", hidden: true });
    let matches = [];
    let active = -1;
    const paint = () => {
      list.replaceChildren();
      list.hidden = !matches.length;
      matches.forEach((match, index) => {
        const option = el("button", { type: "button", role: "option", text: match });
        option.classList.toggle("is-on", index === active);
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          add(match);
        });
        list.append(option);
      });
    };
    const close = () => {
      matches = [];
      active = -1;
      paint();
    };
    const add = (value) => {
      const next = String(value || "").trim();
      input.value = "";
      close();
      if (!next || !view) return;
      if ((view.taste[field] || []).some((item) => item.toLowerCase() === next.toLowerCase())) return;
      act("setTaste", { taste: { ...view.taste, [field]: [...view.taste[field], next] } });
    };
    input.addEventListener("input", () => {
      matches = filterTagSuggestions(input.value, view?.tagSuggestions || [], view?.taste?.[field] || []);
      active = matches.length ? 0 : -1;
      paint();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !list.hidden) {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (!list.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        active = (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
        paint();
      } else if (event.key === "Enter") {
        event.preventDefault();
        add(!list.hidden && active >= 0 ? matches[active] : input.value);
      }
    });
    input.addEventListener("blur", close);
    tasteBox.append(el("div", { class: "st-field" }, [
      el("span", { class: "st-label", text: label }),
      el("span", { class: "st-hint", text: hint }),
      tokens,
      el("div", { class: "st-suggest" }, [input, list]),
    ]));
    return tokens;
  }

  const fields = {
    liked: tasteField("liked", "What I like", "Shows with these tags rank higher."),
    disliked: tasteField("disliked", "What I don't like", "Shows with these tags rank lower."),
    dropped: tasteField("dropped", "Dropped", "A softer dislike for tags on shows you stopped."),
    hardAvoids: tasteField("hardAvoids", "Hard avoids", "Shows with these tags never appear."),
  };
  const audio = el("select", { "aria-label": "Sub or dub" });
  for (const [value, label] of [["any", "Any audio"], ["sub", "Prefer sub"], ["dub", "Prefer dub"]]) audio.append(el("option", { value, text: label }));
  tasteBox.append(el("div", { class: "st-field" }, [el("span", { class: "st-label", text: "Sub or dub" }), audio]));
  audio.addEventListener("change", () => view && act("setTaste", { taste: { ...view.taste, subDub: audio.value } }));

  accountButton.addEventListener("click", () => {
    if (view?.settings?.anilistConnected) {
      say("Refreshing AniList…");
      act("refreshAnilist", {}, (response) => `Refreshed ${response.imported} anime from AniList.`);
    } else {
      send("openOptions");
    }
  });
  publicRow.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = userInput.value.trim();
    if (!username) return;
    say("Importing AniList list…");
    act("importAnilist", { username }, (response) => `Imported ${response.imported} anime.`);
  });
  currentStatus.addEventListener("change", () => {
    if (!view?.currentId || !currentStatus.value) return;
    act("setStatus", { id: view.currentId, status: currentStatus.value === "clear" ? null : currentStatus.value }, (response) => response.syncNote || "Saved.");
  });
  progressButton.addEventListener("click", () => {
    if (view?.progressOffer) act("syncAnilistProgress", { id: view.progressOffer.id }, (response) => response.syncNote || "Saved.");
  });
  syncButton.addEventListener("click", () => {
    say("Sending changes to AniList…");
    act("syncNow", {}, (response) => response.syncNote || "Done.");
  });
  refreshCatalog.addEventListener("click", async () => {
    window.clearInterval(catalogPoll);
    say("Updating the catalog…", 0);
    const response = await send("refreshCatalogCovers");
    const text = response?.ok ? response.note : response?.error || "Could not update the catalog.";
    if (!response?.running) {
      say(text);
      return;
    }
    say(text, response.progress || 0);
    catalogPoll = window.setInterval(async () => {
      const progress = await send("catalogProgress");
      if (!progress?.ok || !progress.running) {
        window.clearInterval(catalogPoll);
        say(!progress?.ok ? "" : response.titlesOwed
          ? "AniList details updated. The Crunchyroll title list will refresh the next time you open Crunchyroll while signed in."
          : "Catalog is up to date.");
        const fresh = await send("getState");
        if (fresh?.view) onView(fresh.view);
        return;
      }
      say(progress.note || text, progress.progress || 0);
    }, 600);
  });

  async function refreshModel() {
    const response = await send("modelStatus");
    const state = response?.ok ? response.status : { label: "Unknown" };
    modelLine.replaceChildren(
      document.createTextNode(`${view?.settings?.modelLabel || "Chrome"} model: `),
      el("strong", { text: state.label || "Unknown" }),
      state.detail ? el("span", { class: "st-model-detail", text: state.detail }) : null,
    );
  }
  ai.addEventListener("toggle", () => ai.open && refreshModel());

  return {
    root,
    setView(next) {
      view = next || view;
      if (!view) return;
      const settings = view.settings || {};
      const connected = Boolean(settings.anilistConnected && settings.anilistViewerName);
      const importedAt = view.importMeta?.importedAt
        ? new Date(view.importMeta.importedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : "";
      avatar.classList.toggle("is-connected", connected);
      const shownName = connected || settings.anilistExpired ? settings.anilistViewerName : view.importMeta?.username || "";
      const photo = shownName && view.importMeta?.username === shownName ? view.importMeta.avatar : "";
      const initial = () => (shownName ? document.createTextNode(shownName.slice(0, 1).toUpperCase()) : icon("user", 22));
      setAvatar(avatar, photo, initial);
      if (connected) {
        name.textContent = settings.anilistViewerName;
        meta.textContent = importedAt ? `AniList · synced ${importedAt}` : "AniList";
        accountButton.textContent = "Refresh";
        accountButton.className = "btn";
      } else if (settings.anilistExpired && settings.anilistViewerName) {
        name.textContent = settings.anilistViewerName;
        meta.textContent = "AniList sign-in expired";
        accountButton.textContent = "Reconnect";
        accountButton.className = "btn primary";
      } else {
        name.textContent = view.importMeta?.username || "Not connected";
        meta.textContent = view.importMeta?.username
          ? (importedAt ? `Public list · ${importedAt}` : "Public list")
          : "Tracking stays on this device until you connect.";
        accountButton.textContent = "Set up";
        accountButton.className = "btn primary";
      }
      publicRow.hidden = connected || Boolean(settings.anilistExpired);
      paintHistoryRow();
      const waiting = view.sync?.waiting || 0;
      syncRow.hidden = !waiting;
      const sending = Boolean(view.sync?.sending);
      syncButton.hidden = Boolean(settings.anilistExpired) || sending;
      const changeCount = waiting === 1 ? "1 change" : `${waiting} changes`;
      syncText.textContent = !waiting
        ? ""
        : sending
          ? `Sending ${changeCount} to AniList…`
          : `${changeCount} waiting to sync${view.sync?.error ? ` · ${view.sync.error}` : ""}`;
      if (focused() !== userInput && settings.anilistUsername) userInput.value = settings.anilistUsername;
      const when = (time) => new Date(time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const titles = view.catalogUpdatedAt ? `Titles ${when(view.catalogUpdatedAt)}` : "Titles not refreshed yet";
      const details = view.catalogDetailsAt > view.catalogUpdatedAt + 30 * 60 * 1000 ? ` · AniList details ${when(view.catalogDetailsAt)}` : "";
      refreshedLine.textContent = `Last refresh: ${titles}${details}`;
      refreshedLine.title = view.catalogTitlesOwed ? "The title list refreshes the next time you open Crunchyroll while signed in." : "";
      context.hidden = !pageContext || !view.currentId;
      contextTitle.textContent = view.currentTitle || "This show";
      if (focused() !== currentStatus) fillStatusSelect(currentStatus, view.currentStatus || "");
      const offer = view.progressOffer;
      progressButton.hidden = !offer;
      progressButton.textContent = offer ? (offer.last ? "Mark completed" : `Mark episode ${offer.to} watched`) : "";
      for (const [key, box] of Object.entries(switches)) box.checked = settings[key] !== false;
      liteBox.checked = Boolean(settings.liteMode);
      const themeHost = root.closest(".cl-theme") || root.getRootNode()?.host;
      themeHost?.classList.toggle("cl-lite", Boolean(settings.liteMode));
      const badgeChoices = badgeOptions(settings);
      for (const [select, value] of [[badgeStyle, badgeChoices.style], [badgeCorner, badgeChoices.corner], [badgeSize, badgeChoices.size], [badgeUnwatched, badgeChoices.unwatched], [badgeMotion, badgeChoices.motion]]) {
        if (focused() !== select) select.value = value;
      }
      badgeCorner.disabled = badgeChoices.style === "footer";
      cornerHint.hidden = badgeChoices.style !== "footer";
      paintPreview(settings);
      for (const [field, tokens] of Object.entries(fields)) tokenList(tokens, view.taste?.[field], field);
      if (focused() !== audio) audio.value = view.taste?.subDub || "any";
      const keys = settings.keys || {};
      const savedCount = Object.values(keys).filter(Boolean).length;
      if (focused() !== service) service.value = settings.aiService || "auto";
      serviceHint.textContent = !savedCount
        ? "No key saved, so Chrome's built-in model runs on this PC. A free key from Gemini, Groq, or OpenRouter is faster."
        : service.value === "auto"
          ? savedCount > 1
            ? "Tries the service that answered last first. If it takes more than about 12 seconds, hits a limit, or fails, the next saved service answers instead."
            : "Save a second key so Auto has a backup when one service is slow or out of free requests."
          : keys[service.value]
            ? "Only this service is used."
            : "This service has no key yet, so Auto is used.";
      for (const item of providerRows) {
        const saved = Boolean(keys[item.provider.id]);
        item.remove.hidden = !saved;
        item.state.textContent = saved ? "Saved" : "";
        item.input.placeholder = saved ? "Paste to replace" : `${item.provider.label} API key`;
      }
      if (ai.open) refreshModel();
    },
    say,
    async openHistory() {
      await checkHistory();
      if (historyWaiting) history.resume();
      else history.start();
    },
    historyWaiting: () => historyWaiting,
  };
}
