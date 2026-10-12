import { filterTagSuggestions } from "../lib/taste.js";
import { ROUNDED, el, fillStatusSelect, icon } from "./dom.js";

export const SEARCH_CSS = `
  .sv { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
  .sv-bar {
    position: relative; display: flex; align-items: center; gap: 6px;
    min-height: 54px; padding: 0 8px 0 16px; border-radius: 18px;
    background: rgba(16, 14, 12, .62); border: 1px solid var(--line-strong);
    transition: border-color .18s var(--ease), background .18s var(--ease), box-shadow .18s var(--ease);
  }
  .sv-bar:hover { border-color: rgba(255, 226, 196, .3); }
  .sv-bar:focus-within { border-color: rgba(255, 154, 92, .5); background: rgba(16, 14, 12, .78); box-shadow: 0 0 0 4px rgba(255, 122, 47, .08); }
  .sv-bar::after {
    content: ""; position: absolute; left: 18px; right: 18px; bottom: -1px; height: 2px; border-radius: 2px;
    background: linear-gradient(90deg, transparent, rgba(255, 154, 92, .85), transparent);
    background-size: 40% 100%; background-repeat: no-repeat; opacity: 0;
  }
  .sv-bar.is-busy::after { opacity: 1; animation: sv-sweep 1.1s var(--ease) infinite; }
  @keyframes sv-sweep { from { background-position: -40% 0; } to { background-position: 140% 0; } }
  .sv-lead { display: grid; place-items: center; color: var(--faint); flex: none; }
  .sv-input {
    flex: 1; min-width: 0; height: 52px; padding: 0 4px; border: 0; border-radius: 0; background: transparent;
    font: 700 17px/1.2 ${ROUNDED}; color: var(--text);
  }
  .sv-input:hover, .sv-input:focus { border: 0; background: transparent; }
  .sv-input::placeholder { color: var(--faint); font-weight: 600; }
  .sv-ai {
    display: inline-flex; align-items: center; gap: 6px; flex: none;
    height: 36px; padding: 0 12px; border: 0; border-radius: 12px; cursor: pointer;
    background: transparent; color: var(--faint); font: 800 12px/1 ${ROUNDED}; letter-spacing: .06em;
    transition: color .16s var(--ease), background .16s var(--ease);
  }
  .sv-ai:hover { color: var(--text); background: rgba(255, 226, 196, .06); }
  .sv-ai.is-on { color: var(--accent-text); }
  .sv-ai.is-on.is-offline { color: var(--muted); }
  .sv-ai-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .35; }
  .sv-ai.is-online .sv-ai-dot { opacity: 1; }
  .sv-drop {
    position: absolute; z-index: 5; left: 0; right: 0; top: calc(100% + 8px);
    display: flex; flex-direction: column; gap: 2px; padding: 6px; max-height: 360px; overflow: auto;
    border-radius: 16px; background: var(--glass-strong);
  }
  .sv-drop a {
    display: flex; align-items: center; gap: 12px; padding: 6px 8px; border-radius: 12px;
    color: var(--text); text-decoration: none; transition: background .14s var(--ease);
  }
  .sv-drop a.is-on, .sv-drop a:hover { background: rgba(255, 226, 196, .07); }
  .sv-drop-art { width: 34px; height: 48px; border-radius: 8px; object-fit: cover; flex: none; background: var(--raised); }
  .sv-drop-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .sv-drop-title { font: 700 14px/1.25 ${ROUNDED}; }
  .sv-drop-reason { color: var(--muted); font: 600 12px/1.3 ${ROUNDED}; }
  .sv-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .sv-chips, .sv-toggles { display: flex; flex-wrap: wrap; gap: 6px; }
  .sv-chips { flex: 1; }
  .sv-chip, .sv-toggle {
    display: inline-flex; align-items: center; gap: 6px;
    min-height: 30px; padding: 4px 12px; border-radius: 999px; cursor: pointer;
    border: 1px solid var(--line); background: var(--pane); color: var(--muted);
    font: 700 12.5px/1 ${ROUNDED};
    transition: color .16s var(--ease), background .16s var(--ease), border-color .16s var(--ease);
  }
  .sv-chip:hover, .sv-toggle:hover { color: var(--text); border-color: var(--line-strong); background: var(--pane-hover); }
  .sv-chip.is-on { color: #1a0d05; background: var(--accent); border-color: transparent; }
  .sv-toggle svg { opacity: .35; }
  .sv-toggle.is-on { color: var(--text); border-color: var(--line-strong); }
  .sv-toggle.is-on svg { opacity: 1; color: var(--accent-text); }
  .sv-refine { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px 12px; padding-top: 12px; border-top: 1px solid rgba(255, 226, 196, .07); }
  .sv-refine-group { display: flex; flex-direction: column; align-items: stretch; gap: 6px; min-width: 0; flex: 1 1 140px; max-width: 220px; }
  .sv-refine-group .sv-under { justify-content: flex-start; }
  .sv-refine-group.is-end { align-items: flex-end; flex: 0 0 auto; max-width: none; }
  .sv-refine-group .sv-tag-input { flex: 1; width: auto; min-width: 0; }
  .sv-under { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; max-width: 340px; }
  .sv-clear {
    border: 0; background: transparent; padding: 2px 4px; border-radius: 6px; cursor: pointer;
    color: var(--muted); font: 700 11.5px/1.2 ${ROUNDED}; transition: color .16s var(--ease), opacity .16s var(--ease);
  }
  .sv-clear:hover:not(:disabled) { color: var(--accent-text); }
  .sv-clear:disabled { opacity: .35; cursor: default; }
  .is-exclude .sv-tag-pick:focus-within { border-color: rgba(255, 105, 97, .5); color: #ff8a80; }
  .is-exclude .sv-tag-token { background: rgba(255, 69, 58, .12); color: #ff8a80; }
  .is-exclude .sv-tag-token span { text-decoration: line-through; text-decoration-color: rgba(255, 138, 128, .55); }
  .is-exclude .sv-tag-token:hover { background: rgba(255, 69, 58, .2); }
  .sv-tag-pick {
    position: relative; display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 4px 0 10px; border-radius: 999px;
    border: 1px solid var(--line); background: var(--pane); color: var(--faint);
    transition: border-color .16s var(--ease), background .16s var(--ease);
  }
  .sv-tag-pick:hover { border-color: var(--line-strong); background: var(--pane-hover); }
  .sv-tag-pick:focus-within { border-color: rgba(255, 154, 92, .5); color: var(--accent-text); }
  .sv-tag-input { width: 130px; height: 30px; padding: 0 6px 0 0; border: 0; border-radius: 0; background: transparent; font: 700 12.5px/1 ${ROUNDED}; }
  .sv-tag-input:hover, .sv-tag-input:focus { border: 0; background: transparent; }
  .sv-tag-input::placeholder { color: var(--faint); }
  .sv-tag-list {
    position: absolute; z-index: 6; left: 0; top: calc(100% + 6px); width: 220px; max-height: 240px; overflow: auto;
    display: flex; flex-direction: column; gap: 2px; padding: 5px; border-radius: 14px; background: var(--glass-strong);
  }
  .sv-tag-list button { text-align: left; border: 0; border-radius: 9px; padding: 7px 9px; cursor: pointer; background: transparent; color: var(--text); font: 700 12.5px/1.2 ${ROUNDED}; }
  .sv-tag-list button.is-on, .sv-tag-list button:hover { background: rgba(255, 226, 196, .08); }
  .sv-tag-tokens { display: flex; flex-wrap: wrap; gap: 6px; }
  .sv-tag-token {
    display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 9px 0 12px; border: 0; border-radius: 999px; cursor: pointer;
    background: var(--accent-soft); color: var(--accent-text); font: 800 12px/1 ${ROUNDED};
    transition: background .16s var(--ease);
  }
  .sv-tag-token:hover { background: rgba(255, 122, 47, .24); }
  .sv-refine-spacer { flex: 1; }
  .sv-sort-wrap { display: inline-flex; align-items: center; gap: 8px; color: var(--faint); font: 700 12px/1 ${ROUNDED}; }
  .sv-sort { height: 32px; padding: 0 10px; border-radius: 10px; font: 700 12.5px/1 ${ROUNDED}; background: rgba(255, 226, 196, .04); }
  .sv-more { height: 1px; }
  .sv-more.is-loading { height: 44px; display: grid; place-items: center; }
  .sv-more.is-loading::after {
    content: ""; width: 22px; height: 22px; border-radius: 50%;
    border: 2px solid rgba(255, 226, 196, .14); border-top-color: var(--accent); animation: sv-spin .8s linear infinite;
  }
  @keyframes sv-spin { to { transform: rotate(360deg); } }
  .sv-note {
    position: relative; overflow: hidden; margin: 0; padding: 9px 12px; border-radius: 12px;
    background: var(--pane); border: 1px solid var(--line); color: var(--muted); font: 600 13px/1.4 ${ROUNDED};
  }
  .sv-note-fill { position: absolute; left: 0; bottom: 0; height: 2px; width: 0; background: rgba(255, 154, 92, .7); transition: width .35s var(--ease); }
  .sv-note-text { position: relative; }
  .sv-results { display: flex; flex-direction: column; gap: 22px; }
  .sv-section { display: flex; flex-direction: column; gap: 10px; }
  .sv-head { display: flex; align-items: center; gap: 10px; min-height: 28px; }
  .sv-head h2 { margin: 0; font: 800 15px/1.2 ${ROUNDED}; letter-spacing: .01em; }
  .sv-head .sv-count { color: var(--faint); font: 700 12px/1 ${ROUNDED}; }
  .sv-head-spacer { flex: 1; }
  .sv-ai-state {
    display: inline-flex; align-items: center; gap: 6px; color: var(--faint); font: 700 12px/1 ${ROUNDED};
  }
  .sv-ai-state.is-busy { color: var(--accent-text); }
  .sv-ai-state.is-busy svg { animation: sv-pulse 1.4s ease-in-out infinite; }
  @keyframes sv-pulse { 50% { opacity: .35; transform: scale(.88); } }
  .sv-link-btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 0; border-radius: 10px; cursor: pointer;
    background: transparent; color: var(--accent-text); font: 800 12px/1 ${ROUNDED};
    transition: background .16s var(--ease), color .16s var(--ease);
  }
  .sv-link-btn:hover { background: var(--accent-soft); color: #ffb185; }
  .sv-head-actions { display: inline-flex; align-items: center; gap: 6px; }
  .sv-list, .sv-page { display: flex; flex-direction: column; gap: 8px; }
  .sv-page .sv-card { content-visibility: auto; contain-intrinsic-size: auto 112px; }
  .sv-card {
    position: relative; display: flex; gap: 14px; align-items: flex-start;
    padding: 10px; border-radius: 16px; background: var(--pane); border: 1px solid var(--line);
    transition: background .18s var(--ease), border-color .18s var(--ease), transform .18s var(--ease), box-shadow .18s var(--ease);
  }
  .sv-card:hover { background: var(--pane-hover); border-color: var(--line-strong); transform: translateY(-1px); box-shadow: 0 12px 30px rgba(0, 0, 0, .25); }
  .sv-card.is-appear { animation: sv-rise .32s var(--ease) both; }
  @keyframes sv-rise { from { opacity: 0; transform: translateY(6px); } }
  .sv-card-art { flex: none; display: block; border-radius: 12px; overflow: hidden; text-decoration: none; }
  .sv-card-art img, .sv-card-art .sv-fallback { width: 64px; height: 90px; object-fit: cover; display: block; background: var(--raised); transition: transform .3s var(--ease); }
  .sv-card:hover .sv-card-art img { transform: scale(1.04); }
  .sv-fallback { display: grid !important; place-items: center; color: var(--accent-text); font: 800 22px/1 ${ROUNDED}; }
  .sv-card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .sv-card-head { display: flex; align-items: baseline; gap: 10px; }
  .sv-rank { flex: none; color: var(--accent-text); font: 800 16px/1 ${ROUNDED}; min-width: 14px; }
  .sv-title { flex: 1; min-width: 0; color: var(--text); text-decoration: none; font: 800 15.5px/1.25 ${ROUNDED}; transition: color .14s var(--ease); }
  .sv-title:hover { color: #ffb185; }
  .sv-reason { margin: 0; color: var(--muted); font: 500 13.5px/1.45 ${ROUNDED}; }
  .sv-foot { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .sv-tag { padding: 3px 8px; border-radius: 8px; background: rgba(255, 226, 196, .06); color: var(--muted); font: 700 11.5px/1.3 ${ROUNDED}; }
  .sv-foot-spacer { flex: 1; }
  .sv-status-select {
    height: 30px; padding: 0 10px; border-radius: 10px; font: 700 12px/1 ${ROUNDED};
    background: rgba(255, 226, 196, .04); border-color: var(--line-strong); color: var(--text);
  }
  .sv-status-select:hover { background: rgba(255, 226, 196, .08); }
  .sv-status-select.has-status { color: var(--accent-text); border-color: rgba(255, 154, 92, .45); background: var(--accent-soft); }
  .sv-meter { display: inline-flex; align-items: center; gap: 8px; flex: none; color: var(--text); font: 800 12px/1 ${ROUNDED}; }
  .sv-meter-bar { width: 54px; height: 4px; border-radius: 4px; background: rgba(255, 226, 196, .1); overflow: hidden; }
  .sv-meter-bar span { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, rgba(255, 154, 92, .65), var(--accent)); }
  .sv-card.is-mention { padding: 8px 10px; gap: 12px; align-items: center; }
  .sv-card.is-mention .sv-card-art img, .sv-card.is-mention .sv-fallback { width: 40px; height: 56px; }
  .sv-card.is-mention .sv-title { font-size: 14px; }
  .sv-card.is-mention .sv-reason { font-size: 12.5px; }
  .sv-rail { display: flex; gap: 12px; overflow-x: auto; padding: 2px 2px 8px; scroll-snap-type: x proximity; }
  .sv-poster { width: 124px; flex: none; display: flex; flex-direction: column; gap: 6px; scroll-snap-align: start; }
  .sv-poster-link { display: flex; flex-direction: column; gap: 7px; color: var(--text); text-decoration: none; }
  .sv-poster-art { position: relative; border-radius: 14px; overflow: hidden; border: 1px solid var(--line); transition: border-color .18s var(--ease), transform .18s var(--ease), box-shadow .18s var(--ease); }
  .sv-poster-art img, .sv-poster-art .sv-fallback { width: 124px; height: 176px; object-fit: cover; display: block; background: var(--raised); transition: transform .35s var(--ease); }
  .sv-poster-link:hover .sv-poster-art { border-color: var(--line-strong); transform: translateY(-2px); box-shadow: 0 14px 30px rgba(0, 0, 0, .35); }
  .sv-poster-link:hover .sv-poster-art img { transform: scale(1.05); }
  .sv-poster-title { font: 700 13px/1.25 ${ROUNDED}; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sv-poster-link:hover .sv-poster-title { color: #ffb185; }
  .sv-status { display: inline-flex; align-items: center; gap: 2px; }
  .sv-plan {
    display: grid; place-items: center; flex: none; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 10px; cursor: pointer;
    background: transparent; color: var(--faint); transition: color .16s var(--ease), background .16s var(--ease), transform .16s var(--ease);
  }
  .sv-plan:hover { color: var(--accent-text); background: rgba(255, 226, 196, .06); }
  .sv-plan:active { transform: scale(.9); }
  .sv-plan.is-on { color: var(--accent-text); }
  .sv-plan[hidden] { display: none; }
  .sv-poster .sv-status { display: flex; }
  .sv-poster .sv-plan { width: 28px; height: 28px; }
  .sv-poster .sv-status-select { flex: 1; min-width: 0; height: 28px; font-size: 11.5px; }
  .sv-ask {
    display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: 14px;
    background: var(--pane); border: 1px solid var(--line-strong); color: var(--text); font: 600 13.5px/1.45 ${ROUNDED};
  }
  .sv-ask[hidden] { display: none; }
  .sv-ask-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .sv-ask .btn { min-height: 32px; padding: 5px 12px; font-size: 12.5px; }
  .sv-ask-opt { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; color: var(--faint); font: 700 12px/1.2 ${ROUNDED}; cursor: pointer; }
  .sv-ask-opt:hover { color: var(--muted); }
  .sv-ask-opt input { width: 13px; height: 13px; margin: 0; accent-color: var(--accent); }
  .sv-mark {
    position: absolute; left: 8px; top: 8px; padding: 3px 7px; border-radius: 8px;
    background: rgba(16, 14, 12, .72); color: var(--text); font: 800 10.5px/1.2 ${ROUNDED};
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  }
  .sv-empty { padding: 36px 12px; text-align: center; color: var(--muted); font: 600 14px/1.5 ${ROUNDED}; }
  .sv-empty strong { display: block; margin-bottom: 4px; color: var(--text); font: 800 16px/1.3 ${ROUNDED}; }
`;

const CHIPS = [
  ["in-progress", "Watching", "Shows you have started"],
  ["plan", "Plan to watch", "Shows you plan to watch"],
  ["unwatched", "Not started", "Shows you have not begun"],
  ["new", "New", "Newly added on Crunchyroll"],
  ["one-cour", "Short series", "13 episodes or fewer"],
  ["long", "Long series", "24 episodes or more"],
  ["movie", "Movies", "Movies only"],
];

const SORTS = [
  ["relevance", "Best match"],
  ["popular", "Most popular"],
  ["score", "Highest rated"],
  ["newest", "Newest"],
  ["title", "A to Z"],
  ["shortest", "Fewest episodes"],
  ["longest", "Most episodes"],
];

const STATUS_LABEL = { in_progress: "Watching", plan: "Planned", finished: "Finished", dropped: "Dropped" };

export function createSearchView({
  send,
  site = "all",
  siteToggle = true,
  newTab = false,
  onView = () => {},
  placeholder = "Search anime or describe a mood",
  linkFor = (item) => item.url || "#",
  onSearch = () => {},
} = {}) {
  let chip = "";
  let currentSite = site;
  let useAi = true;
  let hideWatched = false;
  let seq = 0;
  let suggestSeq = 0;
  let suggestTimer = 0;
  let modelPoll = 0;
  let suggestions = [];
  let activeSuggestion = -1;
  let modelOnline = null;
  let lastRun = null;
  let askDownload = true;
  let downloadDeclined = false;
  let askResolve = null;
  let sort = "relevance";
  let tagOptions = [];
  let pager = null;
  let pageObserver = null;
  let forYouSeen = new Set();
  let forYouBy = "";
  const pages = new Set();
  const pageItems = new WeakMap();

  const input = el("input", {
    class: "sv-input",
    type: "text",
    placeholder,
    "aria-label": "Search anime",
    autocomplete: "off",
    spellcheck: "false",
  });
  const clearButton = el("button", { class: "icon-btn", type: "button", "aria-label": "Clear search", hidden: true }, [icon("close", 16)]);
  const aiButton = el("button", { class: "sv-ai is-on", type: "button", "aria-pressed": "true" }, [
    icon("sparkle", 16),
    el("span", { text: "AI" }),
    el("span", { class: "sv-ai-dot", "aria-hidden": "true" }),
  ]);
  const drop = el("div", { class: "sv-drop glass", role: "listbox", hidden: true });
  const form = el("form", { class: "sv-bar", role: "search" }, [
    el("span", { class: "sv-lead" }, [icon("search", 19)]),
    input,
    clearButton,
    aiButton,
    drop,
  ]);
  const chipRow = el("div", { class: "sv-chips" });
  const chipButtons = new Map();
  for (const [id, label, hint] of CHIPS) {
    const button = el("button", { class: "sv-chip", type: "button", text: label, title: hint, "aria-pressed": "false" });
    button.addEventListener("click", () => {
      chip = chip === id ? "" : id;
      paintChips();
      run();
    });
    chipButtons.set(id, button);
    chipRow.append(button);
  }
  const siteButton = el("button", { class: "sv-toggle", type: "button", title: "Only shows you can watch on Crunchyroll" }, [
    icon("check", 14),
    el("span", { text: "Crunchyroll only" }),
  ]);
  siteButton.hidden = !siteToggle;
  const hideButton = el("button", { class: "sv-toggle", type: "button", title: "Leave out finished and dropped shows" }, [
    icon("eye", 14),
    el("span", { text: "Hide watched" }),
  ]);
  const filters = el("div", { class: "sv-filters" }, [chipRow, el("div", { class: "sv-toggles" }, [siteButton, hideButton])]);
  const include = tagPicker({ label: "Filter by tag", glyph: "tag", removeLabel: "Remove tag", others: () => exclude.values });
  const exclude = tagPicker({ label: "Exclude tag", glyph: "tagOff", removeLabel: "Stop excluding", others: () => include.values, tone: "is-exclude" });
  const sortSelect = el("select", { class: "sv-sort", "aria-label": "Sort results" });
  for (const [value, label] of SORTS) sortSelect.append(el("option", { value, text: label }));
  const sortClear = el("button", { class: "sv-clear", type: "button", text: "Clear", title: "Back to best match" });
  const refine = el("div", { class: "sv-refine" }, [
    include.root,
    exclude.root,
    el("span", { class: "sv-refine-spacer" }),
    el("div", { class: "sv-refine-group is-end" }, [
      el("label", { class: "sv-sort-wrap" }, [el("span", { text: "Sort" }), sortSelect]),
      el("div", { class: "sv-under" }, [sortClear]),
    ]),
  ]);

  function tagPicker({ label, glyph, removeLabel, others, tone = "" }) {
    const picker = { values: [] };
    let matches = [];
    let active = -1;
    const field = el("input", { class: "sv-tag-input", type: "text", placeholder: label, "aria-label": label, autocomplete: "off", spellcheck: "false" });
    const list = el("div", { class: "sv-tag-list glass", role: "listbox", hidden: true });
    const tokens = el("div", { class: "sv-tag-tokens" });
    const clear = el("button", { class: "sv-clear", type: "button", text: "Clear", title: `Clear ${label.toLowerCase()}` });
    picker.root = el("div", { class: `sv-refine-group ${tone}` }, [
      el("div", { class: "sv-tag-pick" }, [icon(glyph, 15), field, list]),
      el("div", { class: "sv-under" }, [tokens, clear]),
    ]);

    const change = (next) => {
      picker.values = next;
      paintTokens();
      run();
    };
    function paintTokens() {
      tokens.replaceChildren(...picker.values.map((tag) => {
        const token = el("button", { class: "sv-tag-token", type: "button", "aria-label": `${removeLabel} ${tag}`, title: "Remove" }, [el("span", { text: tag }), icon("close", 12)]);
        token.addEventListener("click", () => change(picker.values.filter((value) => value !== tag)));
        return token;
      }));
      clear.disabled = !picker.values.length;
    }
    function paintList() {
      list.replaceChildren(...matches.map((match, index) => {
        const option = el("button", { type: "button", role: "option", text: match, class: index === active ? "is-on" : "" });
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          add(match);
        });
        return option;
      }));
      list.hidden = !matches.length;
    }
    function closeList() {
      matches = [];
      active = -1;
      paintList();
    }
    function add(value) {
      const wanted = String(value || "").trim().toLowerCase();
      const known = tagOptions.find((option) => option.toLowerCase() === wanted);
      field.value = "";
      closeList();
      const taken = [...picker.values, ...others()].some((tag) => tag.toLowerCase() === wanted);
      if (known && !taken) change([...picker.values, known]);
    }

    field.addEventListener("input", () => {
      matches = filterTagSuggestions(field.value, tagOptions, [...picker.values, ...others()]);
      active = matches.length ? 0 : -1;
      paintList();
    });
    field.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !list.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeList();
      } else if (!list.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        active = (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
        paintList();
      } else if (event.key === "Enter") {
        event.preventDefault();
        add(!list.hidden && active >= 0 ? matches[active] : field.value);
      } else if (event.key === "Tab" && !event.shiftKey && !list.hidden && active >= 0) {
        event.preventDefault();
        add(matches[active]);
      } else if (event.key === "Backspace" && !field.value && picker.values.length) {
        change(picker.values.slice(0, -1));
      }
    });
    field.addEventListener("blur", () => window.setTimeout(closeList, 120));
    clear.addEventListener("click", () => change([]));
    paintTokens();
    return picker;
  }
  const noteFill = el("span", { class: "sv-note-fill", "aria-hidden": "true" });
  const noteText = el("span", { class: "sv-note-text" });
  const note = el("p", { class: "sv-note", role: "status", hidden: true }, [noteFill, noteText]);
  const results = el("div", { class: "sv-results" });
  const askYes = el("button", { class: "btn primary", type: "button", text: "Download" });
  const askNo = el("button", { class: "btn", type: "button", text: "Not now" });
  const askBox = el("input", { type: "checkbox" });
  const ask = el("div", { class: "sv-ask", role: "dialog", "aria-label": "Download Chrome's AI model", hidden: true }, [
    el("span", { text: "AI ranking uses Chrome's built-in model. It's a one-time download of a few GB. Download it now?" }),
    el("div", { class: "sv-ask-row" }, [
      askYes,
      askNo,
      el("label", { class: "sv-ask-opt" }, [askBox, el("span", { text: "Don't ask again (change this in Settings)" })]),
    ]),
  ]);
  const sentinel = el("div", { class: "sv-more", "aria-hidden": "true" });
  const root = el("div", { class: "sv" }, [form, filters, refine, note, ask, results, sentinel]);

  function writeNote(text, { progress } = {}) {
    note.hidden = !text;
    const hasProgress = typeof progress === "number" && Number.isFinite(progress);
    const percent = hasProgress ? Math.floor(Math.max(0, Math.min(1, progress)) * 100) : 0;
    noteText.textContent = hasProgress && text ? `${text} ${percent}%` : text || "";
    noteFill.style.width = hasProgress ? `${percent}%` : "";
  }

  function paintChips() {
    for (const [id, button] of chipButtons) {
      button.classList.toggle("is-on", id === chip);
      button.setAttribute("aria-pressed", id === chip ? "true" : "false");
    }
  }

  function paintToggles() {
    const siteOn = currentSite === "crunchyroll";
    siteButton.classList.toggle("is-on", siteOn);
    siteButton.setAttribute("aria-pressed", siteOn ? "true" : "false");
    hideButton.classList.toggle("is-on", hideWatched);
    hideButton.setAttribute("aria-pressed", hideWatched ? "true" : "false");
  }

  function paintAi() {
    aiButton.classList.toggle("is-on", useAi);
    aiButton.classList.toggle("is-online", modelOnline === true);
    aiButton.classList.toggle("is-offline", modelOnline === false);
    aiButton.setAttribute("aria-pressed", useAi ? "true" : "false");
    const state = modelOnline === true ? "Model ready." : modelOnline === false ? "Model not available." : "";
    aiButton.title = `${useAi ? "AI ranking is on" : "AI ranking is off"}. ${state}`.trim();
  }

  function linkAttrs(item, extra = {}) {
    return newTab ? { ...extra, href: linkFor(item), target: "_blank", rel: "noreferrer" } : { ...extra, href: linkFor(item) };
  }

  function art(item, size) {
    if (item.poster) return el("img", { src: item.poster, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer", width: size?.[0], height: size?.[1] });
    return el("span", { class: "sv-fallback", text: (item.title || "?").slice(0, 1).toUpperCase() });
  }

  function statusControl(item) {
    const select = el("select", { class: "sv-status-select", "aria-label": `Status for ${item.title}` });
    const plan = el("button", { class: "sv-plan", type: "button" });
    const paint = () => {
      const planned = item.status === "plan";
      fillStatusSelect(select, item.status || "");
      select.classList.toggle("has-status", Boolean(item.status));
      plan.hidden = Boolean(item.status) && !planned;
      plan.classList.toggle("is-on", planned);
      plan.setAttribute("aria-pressed", planned ? "true" : "false");
      plan.setAttribute("aria-label", planned ? `Remove ${item.title} from Plan to watch` : `Add ${item.title} to Plan to watch`);
      plan.title = planned ? "Planned. Click to remove." : "Plan to watch";
      plan.replaceChildren(icon(planned ? "check" : "plus", 17));
    };
    const save = async (status) => {
      select.disabled = true;
      plan.disabled = true;
      const response = await send("setStatus", { id: item.id, status });
      select.disabled = false;
      plan.disabled = false;
      if (!response?.ok) {
        paint();
        writeNote(response?.error || "Could not save that status.");
        return;
      }
      item.status = response.status || null;
      paint();
      if (response.syncNote) writeNote(response.syncNote);
      if (response.view) onView(response.view);
    };
    select.addEventListener("change", () => {
      if (select.value) save(select.value === "clear" ? null : select.value);
    });
    plan.addEventListener("click", (event) => {
      event.preventDefault();
      save(item.status === "plan" ? null : "plan");
    });
    paint();
    return el("span", { class: "sv-status" }, [plan, select]);
  }

  function card(item, kind = "result", index = 0) {
    const confidence = kind === "pick" && Number.isInteger(item.confidence) ? item.confidence : null;
    const head = el("div", { class: "sv-card-head" }, [
      kind === "pick" && Number.isInteger(item.rank) ? el("span", { class: "sv-rank", text: String(item.rank) }) : null,
      el("a", linkAttrs(item, { class: "sv-title", text: item.title })),
      confidence != null
        ? el("span", { class: "sv-meter", title: `${confidence}% match` }, [
          el("span", { class: "sv-meter-bar" }, [el("span", { style: `width:${confidence}%` })]),
          el("span", { text: `${confidence}%` }),
        ])
        : null,
    ]);
    const foot = el("div", { class: "sv-foot" });
    if (kind !== "mention") for (const tag of (item.tags || []).slice(0, 5)) foot.append(el("span", { class: "sv-tag", text: tag }));
    foot.append(el("span", { class: "sv-foot-spacer" }), statusControl(item));
    const node = el("article", { class: `sv-card is-${kind}${index >= 0 ? " is-appear" : ""}` }, [
      el("a", linkAttrs(item, { class: "sv-card-art", tabindex: "-1", "aria-hidden": "true" }), [art(item)]),
      el("div", { class: "sv-card-body" }, [head, item.reason ? el("p", { class: "sv-reason", text: item.reason }) : null, foot]),
    ]);
    if (index >= 0) node.style.animationDelay = `${Math.min(index, 8) * 28}ms`;
    return node;
  }

  function section(title, children, { count, extra } = {}) {
    return el("section", { class: "sv-section" }, [
      el("div", { class: "sv-head" }, [
        el("h2", { text: title }),
        count ? el("span", { class: "sv-count", text: String(count) }) : null,
        el("span", { class: "sv-head-spacer" }),
        extra || null,
      ]),
      ...children,
    ]);
  }

  function poster(item) {
    const mark = STATUS_LABEL[item.status];
    return el("article", { class: "sv-poster" }, [
      el("a", linkAttrs(item, { class: "sv-poster-link" }), [
        el("span", { class: "sv-poster-art" }, [art(item), mark ? el("span", { class: "sv-mark", text: mark }) : null]),
        el("span", { class: "sv-poster-title", text: item.title }),
      ]),
      statusControl(item),
    ]);
  }

  function aiState(text, busy) {
    return el("span", { class: busy ? "sv-ai-state is-busy" : "sv-ai-state" }, [icon("sparkle", 14), el("span", { text })]);
  }

  function empty(title, detail) {
    return el("div", { class: "sv-empty" }, [el("strong", { text: title }), el("span", { text: detail })]);
  }

  function renderHome(payload, picked = null, by = "") {
    results.replaceChildren();
    const forYouRow = (payload.sections || []).find((row) => row.rerank);
    if (picked?.length) {
      let reroll = null;
      if (forYouRow && useAi) {
        reroll = el("button", { class: "sv-link-btn", type: "button", title: "Ask AI for different picks" }, [icon("refresh", 14), el("span", { text: "Reroll" })]);
        reroll.addEventListener("click", () => pickForYou(forYouRow, payload, reroll, picked));
      }
      results.append(rankedSections(picked, [], { title: "Picked for you", action: reroll, by }));
    }
    for (const row of payload.sections || []) {
      let extra = null;
      if (row.rerank && useAi && !picked) {
        extra = el("button", { class: "sv-link-btn", type: "button", title: "Let AI pick from this row" }, [icon("sparkle", 14), el("span", { text: "AI picks" })]);
        extra.addEventListener("click", () => pickForYou(row, payload, extra));
      }
      results.append(section(row.title, [el("div", { class: "sv-rail" }, row.items.map(poster))], { extra }));
    }
    if (!results.childElementCount) {
      results.append(empty("Nothing here yet", payload.note || "Open Crunchyroll so the catalog can load."));
      return;
    }
    const list = el("div", { class: "sv-list" });
    results.append(section("Browse all", [list]));
    startPager(seq, { query: "", chip: "", site: currentSite, sort, tags: include.values, without: exclude.values, browse: true }, list, [], true);
  }

  function renderInstant(items, { pending, note = "", total = items.length }) {
    results.replaceChildren();
    if (!items.length) {
      const hint = currentSite === "crunchyroll" ? "Try fewer words, or turn off Crunchyroll only." : "Try fewer words, or turn off a filter.";
      results.append(empty("No matches", note && note !== "No matches." ? note : hint));
      return null;
    }
    const extra = pending ? aiState("Ranking with AI", true) : null;
    const list = el("div", { class: "sv-list" }, [cardPage(items)]);
    results.append(section("Results", [list], { count: total, extra }));
    return list;
  }

  function cardPage(items) {
    for (const page of pages) {
      if (page.isConnected) continue;
      pages.delete(page);
      pageObserver?.unobserve(page);
    }
    const page = el("div", { class: "sv-page" }, items.map((item, index) => card(item, "result", index)));
    pageItems.set(page, items);
    pages.add(page);
    pageObserver?.observe(page);
    return page;
  }

  function onPages(entries) {
    for (const entry of entries) {
      const page = entry.target;
      if (!page.isConnected) {
        pages.delete(page);
        pageObserver.unobserve(page);
        continue;
      }
      const asleep = page.classList.contains("is-asleep");
      if (entry.isIntersecting && asleep) {
        page.classList.remove("is-asleep");
        page.style.height = "";
        page.replaceChildren(...pageItems.get(page).map((item) => card(item, "result", -1)));
      } else if (!entry.isIntersecting && !asleep && entry.boundingClientRect.height > 0 && !page.contains(page.getRootNode().activeElement)) {
        page.style.height = `${entry.boundingClientRect.height}px`;
        page.classList.add("is-asleep");
        page.replaceChildren();
      }
    }
  }

  function startPager(id, params, target, loaded, hasMore) {
    pager = { id, params, target, loaded: [...loaded], offset: loaded.length, hasMore, loading: false };
    if (hasMore) window.requestAnimationFrame(() => sentinelVisible && loadMore());
  }

  async function loadMore() {
    const current = pager;
    if (!current || current.loading || !current.hasMore || current.id !== seq || !current.target?.isConnected) return;
    current.loading = true;
    sentinel.classList.add("is-loading");
    const response = await send("catalogSearch", { ...current.params, offset: current.offset });
    current.loading = false;
    sentinel.classList.remove("is-loading");
    if (current !== pager || current.id !== seq || !response?.ok) return;
    const items = response.results || [];
    current.loaded.push(...items);
    current.offset += items.length;
    current.hasMore = Boolean(response.hasMore) && items.length > 0;
    if (items.length) current.target.append(cardPage(items));
    if (current.hasMore) window.requestAnimationFrame(() => sentinelVisible && loadMore());
  }

  function rankedSections(ranked, instant, { title = "Top picks", moreTarget = null, action = null, by = "" } = {}) {
    const ranker = aiState(`Ranked by ${by || "AI"}`, false);
    const picks = ranked.filter((item) => !item.mention);
    const mentions = ranked.filter((item) => item.mention);
    const wrap = el("div", { class: "sv-results" });
    const statusById = new Map(instant.map((item) => [item.id, item.status]));
    for (const item of ranked) if (item.status == null && statusById.has(item.id)) item.status = statusById.get(item.id);
    wrap.append(section(title, [el("div", { class: "sv-list" }, picks.map((item, index) => card(item, "pick", index)))], {
      extra: action ? el("span", { class: "sv-head-actions" }, [ranker, action]) : ranker,
    }));
    if (mentions.length) {
      wrap.append(section("Honorable mentions", [el("div", { class: "sv-list" }, mentions.map((item, index) => card(item, "mention", index)))]));
    }
    const shown = new Set(ranked.map((item) => item.id));
    const rest = instant.filter((item) => !shown.has(item.id));
    if (rest.length || moreTarget) {
      const list = el("div", { class: "sv-list" }, rest.length ? [cardPage(rest)] : []);
      wrap.append(section("More results", [list]));
      if (moreTarget) moreTarget(list, shown);
    }
    return wrap;
  }

  function renderRanked(ranked, by) {
    const current = pager;
    const wrap = rankedSections(ranked, current?.loaded || [], {
      by,
      moreTarget: current?.hasMore ? (list) => {
        current.target = list;
      } : null,
    });
    results.replaceChildren(wrap);
  }

  function aiFailed(answer, retry) {
    const head = results.querySelector(".sv-ai-state");
    if (head) head.replaceWith(aiState("AI unavailable", false));
    if (answer?.downloading) {
      writeNote(answer.note || "Chrome is downloading its model.", { progress: answer.progress || 0 });
      watchModelDownload(retry);
      return;
    }
    const text = answer?.note || answer?.error || "";
    if (text) writeNote(`${text} Showing the closest matches.`);
    refreshModel();
  }

  function watchModelDownload(retry) {
    window.clearInterval(modelPoll);
    modelPoll = window.setInterval(async () => {
      const progress = await send("catalogProgress");
      if (!progress?.ok || !progress.modelDownloading) {
        window.clearInterval(modelPoll);
        writeNote(progress?.modelStalled ? progress.modelNote : "");
        refreshModel();
        if (progress?.ok && !progress.modelStalled) retry?.();
        return;
      }
      writeNote("Chrome is downloading its model. Results will be ranked when it finishes.", { progress: progress.modelProgress || 0 });
    }, 600);
  }

  function closeAsk(answer) {
    ask.hidden = true;
    const resolve = askResolve;
    askResolve = null;
    resolve?.(answer);
  }

  async function confirmDownload() {
    if (!askDownload) return true;
    const response = await send("modelStatus");
    if (!response?.status?.needsDownload) return true;
    if (downloadDeclined) return false;
    closeAsk(false);
    askBox.checked = false;
    ask.hidden = false;
    return new Promise((resolve) => {
      askResolve = resolve;
    });
  }

  function skipAi(text) {
    const head = results.querySelector(".sv-ai-state");
    if (head) head.replaceWith(aiState(text, false));
  }

  async function rerank(id, query, items, render) {
    const answer = await send("catalogRerank", { query, chip, site: currentSite, ids: items.slice(0, 20).map((item) => item.id) });
    if (id !== seq) return;
    if (answer?.ok && answer.results?.length) {
      render(answer.results, answer.by);
      refreshModel();
      return;
    }
    aiFailed(answer, () => {
      if (id === seq) rerank(id, query, items, render);
    });
  }

  async function pickForYou(row, payload, button, current = null) {
    const id = ++seq;
    if (!(await confirmDownload())) return;
    if (id !== seq) return;
    const last = (current || []).map((item) => item.id);
    if (!current) forYouSeen = new Set();
    for (const pickId of last) forYouSeen.add(pickId);
    button.replaceWith(aiState(current ? "Rerolling" : "Picking", true));
    const answer = await send("catalogRerank", {
      query: "",
      chip: "",
      site: currentSite,
      ids: row.items.map((item) => item.id),
      ...(current ? { reroll: true, seen: [...forYouSeen], last } : {}),
    });
    if (id !== seq) return;
    if (answer?.ok && answer.results?.length) {
      if (answer.reset) forYouSeen = new Set(last);
      for (const item of answer.results) forYouSeen.add(item.id);
      if (current) writeNote("");
      forYouBy = answer.by || "";
      renderHome(payload, answer.results, forYouBy);
      refreshModel();
      return;
    }
    if (current) {
      renderHome(payload, current, forYouBy);
      writeNote(`${answer?.note || answer?.error || "AI could not reroll."} Kept your current picks.`);
      refreshModel();
      return;
    }
    renderHome(payload);
    aiFailed(answer);
  }

  async function run() {
    const id = ++seq;
    closeDrop();
    closeAsk(false);
    window.clearInterval(modelPoll);
    const query = input.value.trim();
    pager = null;
    form.classList.add("is-busy");
    const params = { query, chip, site: currentSite, sort, tags: include.values, without: exclude.values };
    const response = await send("catalogSearch", params);
    if (id !== seq) return;
    form.classList.remove("is-busy");
    if (!response?.ok) {
      writeNote(response?.error || "Could not search.");
      return;
    }
    lastRun = { query, response };
    if (query) onSearch(query);
    if (response.sections) {
      writeNote([response.notice, response.note].filter(Boolean).join(" "));
      renderHome(response);
      return;
    }
    writeNote(response.results?.length ? [response.notice, response.note].filter(Boolean).join(" ") : "");
    const items = response.results || [];
    const pending = Boolean(useAi && response.rerank);
    const list = renderInstant(items, { pending, note: response.note, total: response.total ?? items.length });
    if (list) startPager(id, params, list, items, Boolean(response.hasMore));
    if (!pending) return;
    const allowed = await confirmDownload();
    if (id !== seq) return;
    if (!allowed) {
      skipAi(useAi ? "AI model not downloaded" : "AI ranking off");
      return;
    }
    rerank(id, query, items, (ranked, by) => renderRanked(ranked, by));
  }

  function closeDrop() {
    suggestSeq += 1;
    window.clearTimeout(suggestTimer);
    suggestions = [];
    activeSuggestion = -1;
    drop.hidden = true;
    drop.replaceChildren();
  }

  function paintDrop() {
    drop.replaceChildren();
    if (!suggestions.length) {
      drop.hidden = true;
      return;
    }
    suggestions.forEach((item, index) => {
      const link = el("a", linkAttrs(item, { role: "option", "aria-selected": index === activeSuggestion ? "true" : "false" }), [
        item.poster ? el("img", { class: "sv-drop-art", src: item.poster, alt: "", referrerpolicy: "no-referrer" }) : el("span", { class: "sv-drop-art" }),
        el("span", { class: "sv-drop-copy" }, [
          el("span", { class: "sv-drop-title", text: item.title }),
          item.reason ? el("span", { class: "sv-drop-reason", text: item.reason }) : null,
        ]),
      ]);
      link.classList.toggle("is-on", index === activeSuggestion);
      link.addEventListener("mousedown", (event) => event.preventDefault());
      drop.append(link);
    });
    drop.hidden = false;
  }

  function suggest() {
    const query = input.value.trim();
    clearButton.hidden = !input.value;
    window.clearTimeout(suggestTimer);
    if (!query) {
      closeDrop();
      return;
    }
    const token = ++suggestSeq;
    suggestTimer = window.setTimeout(async () => {
      const response = await send("catalogSuggest", { query, chip, site: currentSite });
      if (token !== suggestSeq || input.value.trim() !== query) return;
      suggestions = response?.suggestions || [];
      activeSuggestion = -1;
      paintDrop();
    }, 130);
  }

  async function refreshModel() {
    const response = await send("modelStatus");
    const state = response?.ok ? response.status?.state : "unknown";
    modelOnline = state === "online" ? true : state === "offline" ? false : null;
    paintAi();
  }

  input.addEventListener("input", suggest);
  input.addEventListener("focus", () => {
    if (input.value.trim() && !suggestions.length) suggest();
  });
  input.addEventListener("blur", () => window.setTimeout(closeDrop, 120));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !drop.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeDrop();
      return;
    }
    if (drop.hidden || !suggestions.length || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    activeSuggestion = activeSuggestion < 0 ? (step > 0 ? 0 : suggestions.length - 1) : (activeSuggestion + step + suggestions.length) % suggestions.length;
    paintDrop();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const picked = activeSuggestion >= 0 ? suggestions[activeSuggestion] : null;
    if (picked?.url) {
      closeDrop();
      if (newTab) window.open(linkFor(picked), "_blank", "noreferrer");
      else window.location.href = linkFor(picked);
      return;
    }
    run();
  });
  clearButton.addEventListener("click", () => {
    input.value = "";
    clearButton.hidden = true;
    closeDrop();
    input.focus();
    run();
  });
  askYes.addEventListener("click", () => {
    if (askBox.checked) {
      askDownload = false;
      send("setSettings", { patch: { askModelDownload: false } });
    }
    closeAsk(true);
  });
  askNo.addEventListener("click", () => {
    downloadDeclined = true;
    if (askBox.checked) {
      useAi = false;
      paintAi();
      send("setSettings", { patch: { useAi: false } });
      writeNote("AI ranking is off. Turn it back on with the AI button.");
    }
    closeAsk(false);
  });
  aiButton.addEventListener("click", () => {
    useAi = !useAi;
    if (useAi) downloadDeclined = false;
    paintAi();
    send("setSettings", { patch: { useAi } });
    if (useAi && lastRun?.response?.rerank && lastRun.query === input.value.trim()) run();
  });
  siteButton.addEventListener("click", () => {
    currentSite = currentSite === "crunchyroll" ? "all" : "crunchyroll";
    paintToggles();
    run();
  });
  hideButton.addEventListener("click", async () => {
    hideWatched = !hideWatched;
    paintToggles();
    const response = await send("setUi", { hideWatched });
    if (response?.view) onView(response.view);
    run();
  });

  let sentinelVisible = false;
  let observer = null;
  function watchScroll(scrollRoot = null) {
    observer?.disconnect();
    observer = new IntersectionObserver((entries) => {
      sentinelVisible = entries.some((entry) => entry.isIntersecting);
      if (sentinelVisible) loadMore();
    }, { root: scrollRoot, rootMargin: "0px 0px 700px 0px" });
    observer.observe(sentinel);
    pageObserver?.disconnect();
    pageObserver = new IntersectionObserver(onPages, { root: scrollRoot, rootMargin: "1600px 0px" });
    for (const page of pages) pageObserver.observe(page);
  }
  watchScroll();

  const setSort = (value) => {
    sort = value;
    sortSelect.value = value;
    sortClear.disabled = value === "relevance";
    run();
  };
  sortSelect.addEventListener("change", () => setSort(sortSelect.value));
  sortClear.addEventListener("click", () => setSort("relevance"));
  sortClear.disabled = true;

  paintChips();
  paintToggles();
  paintAi();

  return {
    root,
    setView(view) {
      const settings = view?.settings || {};
      if (typeof settings.useAi === "boolean") useAi = settings.useAi;
      if (typeof settings.hideWatched === "boolean") hideWatched = settings.hideWatched;
      if (typeof settings.askModelDownload === "boolean") askDownload = settings.askModelDownload;
      if (Array.isArray(view?.tagSuggestions)) tagOptions = view.tagSuggestions;
      paintAi();
      paintToggles();
    },
    open() {
      refreshModel();
      if (!lastRun) run();
    },
    refresh: run,
    search(query) {
      input.value = String(query || "");
      clearButton.hidden = !input.value;
      run();
    },
    setScrollRoot: watchScroll,
    focus() {
      input.focus();
      input.select();
    },
    setNote: writeNote,
    hasQuery: () => Boolean(input.value.trim()),
    clearSuggestions: closeDrop,
  };
}
