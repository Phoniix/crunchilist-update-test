// The taste popup next to the search bar: genre likes and dislikes, tags, hard avoids and sub or dub.
// Edits save straight to the same taste the search engine, Picked for you and the banner rank by.
import { ANILIST_GENRES, filterTagSuggestions, sanitizeTaste } from "../lib/taste.js";

const FIELDS = ["liked", "disliked", "dropped", "hardAvoids"];
const GROUPS = [
  ["liked", "Likes", "Rank higher"],
  ["disliked", "Dislikes", "Rank lower"],
  ["dropped", "Dropped", "A softer dislike"],
  ["hardAvoids", "Hard avoids", "Never shown"],
];
const MODES = [["liked", "Like"], ["disliked", "Dislike"], ["hardAvoids", "Avoid"]];
const lower = (text) => String(text).toLowerCase();
const GENRE_KEYS = new Set(ANILIST_GENRES.map(lower));

// Where a label sits in the taste: "liked", "disliked", "dropped", "hardAvoids" or "".
export function tasteFieldOf(taste, label) {
  const key = lower(label);
  return FIELDS.find((field) => (taste[field] || []).some((item) => lower(item) === key)) || "";
}

// Moves a label into one field (or out of all of them when field is ""), keeping every other entry as it was.
export function placeLabel(taste, label, field) {
  const key = lower(label);
  const next = sanitizeTaste(taste);
  for (const name of FIELDS) next[name] = next[name].filter((item) => lower(item) !== key);
  if (field) next[field] = [...next[field], label];
  return next;
}

// Genre chips cycle: no opinion, like, dislike, back to no opinion. A dropped or avoided genre clears first.
export function nextGenreField(current) {
  return current === "" ? "liked" : current === "liked" ? "disliked" : "";
}

export function createTastePop({ send, getView, icon, esc, onView, onChanged }) {
  const pop = document.createElement("div");
  pop.className = "pop taste-pop";
  pop.id = "taste-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Taste preferences");
  let taste = sanitizeTaste(getView()?.taste);
  let mode = "liked";
  let matches = [];
  let active = -1;
  let pending = 0;
  let queue = Promise.resolve();
  let dirty = false;

  function save(next) {
    taste = sanitizeTaste(next);
    dirty = true;
    pending += 1;
    paint();
    const body = taste;
    queue = queue.then(async () => {
      const reply = await send("setTaste", { taste: body });
      pending -= 1;
      if (reply?.view && !pending) onView(reply.view);
      if (!reply?.ok && !pending) { taste = sanitizeTaste(getView()?.taste); paint(); }
    });
  }

  const genreChip = (genre) => {
    const field = tasteFieldOf(taste, genre);
    const state = field === "liked" ? "like" : field === "hardAvoids" ? "avoid" : field ? "dislike" : "";
    const label = state === "like" ? "liked" : state === "dislike" ? (field === "dropped" ? "dropped" : "disliked") : state === "avoid" ? "avoided" : "no opinion";
    return `<button class="tp-genre ${state}" data-tp-genre="${esc(genre)}" aria-label="${esc(genre)}: ${label}" title="${esc(genre)}: ${label}">${state === "like" ? icon("plus") : state ? icon("close") : ""}${esc(genre)}</button>`;
  };
  const token = (field, value) => `<button class="tp-token ${field}" data-tp-remove="${esc(value)}" aria-label="Remove ${esc(value)}">${esc(value)}${icon("close")}</button>`;
  const groups = () => GROUPS.map(([field, name, hint]) => {
    const tags = taste[field].filter((value) => !GENRE_KEYS.has(lower(value)));
    return tags.length ? `<div class="tp-group"><span class="tp-group-name">${name}<small>${hint}</small></span><div class="tp-tokens">${tags.map((value) => token(field, value)).join("")}</div></div>` : "";
  }).join("");
  const list = () => matches.map((match, i) => `<button class="tp-opt ${i === active ? "sel" : ""}" data-tp-add="${esc(match)}" role="option">${esc(match)}</button>`).join("");

  function paint() {
    const input = pop.querySelector(".tp-input");
    const typed = input?.value || "";
    const focused = input && document.activeElement === input;
    const was = pop.contains(document.activeElement) ? document.activeElement.dataset : {};
    const refocus = was.tpGenre ? `[data-tp-genre="${CSS.escape(was.tpGenre)}"]` : was.tpAudio ? `[data-tp-audio="${was.tpAudio}"]` : was.tpMode ? `[data-tp-mode="${was.tpMode}"]` : "";
    const chosen = groups();
    pop.innerHTML = `<div class="tp-head"><h4>Your taste</h4><button class="tp-close" data-tp-close aria-label="Close">${icon("close")}</button></div>
      <p class="tp-sub">Shapes Picked for you, the banner, match scores and search.</p>
      <div class="tp-label">Genres<small>Click once to like, twice to dislike</small></div>
      <div class="tp-genres">${ANILIST_GENRES.map(genreChip).join("")}</div>
      <div class="tp-label">Tags<small>Themes, settings, moods</small></div>
      <div class="tp-add">
        <div class="tp-field">${icon("search")}<input class="tp-input" placeholder="Add a tag, like Isekai or Time Travel" aria-label="Add a tag" autocomplete="off" spellcheck="false"><div class="tp-list" role="listbox" ${matches.length ? "" : "hidden"}>${list()}</div></div>
        <div class="seg tp-mode" role="group" aria-label="Add as">${MODES.map(([field, name]) => `<button class="${mode === field ? "on" : ""}" data-tp-mode="${field}" aria-pressed="${mode === field}">${name}</button>`).join("")}</div>
      </div>
      ${chosen || '<p class="tp-empty">No tags yet. Your likes also grow from shows you rate highly.</p>'}
      <div class="tp-label">Audio</div>
      <div class="seg tp-audio" role="group" aria-label="Sub or dub">${[["any", "Any"], ["sub", "Prefer sub"], ["dub", "Prefer dub"]].map(([value, name]) => `<button class="${taste.subDub === value ? "on" : ""}" data-tp-audio="${value}" aria-pressed="${taste.subDub === value}">${name}</button>`).join("")}</div>
      <a href="#settings" data-tp-settings>All taste settings →</a>`;
    const next = pop.querySelector(".tp-input");
    next.value = typed;
    if (focused) { next.focus(); next.setSelectionRange(typed.length, typed.length); }
    else if (refocus) pop.querySelector(refocus)?.focus();
  }

  function suggest() {
    const input = pop.querySelector(".tp-input");
    matches = filterTagSuggestions(input.value, getView()?.tagSuggestions || [], FIELDS.flatMap((field) => taste[field]), 6);
    active = matches.length ? 0 : -1;
    const box = pop.querySelector(".tp-list");
    box.innerHTML = list();
    box.hidden = !matches.length;
  }
  function add(value) {
    const label = String(value || "").trim();
    const input = pop.querySelector(".tp-input");
    input.value = "";
    matches = [];
    active = -1;
    if (!label) return paint();
    const known = (getView()?.tagSuggestions || []).find((option) => lower(option) === lower(label)) || label;
    save(placeLabel(taste, known, mode));
  }

  pop.addEventListener("click", (event) => {
    event.stopPropagation();
    const target = event.target.closest("button, a");
    if (!target) return;
    const { tpGenre, tpRemove, tpMode, tpAudio, tpAdd } = target.dataset;
    if (tpGenre !== undefined) return save(placeLabel(taste, tpGenre, nextGenreField(tasteFieldOf(taste, tpGenre))));
    if (tpRemove !== undefined) return save(placeLabel(taste, tpRemove, ""));
    if (tpAdd !== undefined) return add(tpAdd);
    if (tpMode) { mode = tpMode; return paint(); }
    if (tpAudio) return save({ ...taste, subDub: tpAudio });
    if (target.dataset.tpClose !== undefined) close({ restoreFocus: true });
    if (target.dataset.tpSettings !== undefined) close({ restoreFocus: false });
  });
  pop.addEventListener("pointerdown", (event) => { if (event.target.closest(".tp-opt")) event.preventDefault(); });
  pop.addEventListener("input", (event) => { if (event.target.matches(".tp-input")) suggest(); });
  pop.addEventListener("keydown", (event) => {
    if (!event.target.matches(".tp-input")) return;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length) {
      event.preventDefault();
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
      pop.querySelector(".tp-list").innerHTML = list();
    } else if (event.key === "Enter") {
      event.preventDefault();
      add(active >= 0 ? matches[active] : event.target.value);
    } else if (event.key === "Escape" && matches.length) {
      event.stopPropagation();
      matches = [];
      pop.querySelector(".tp-list").hidden = true;
    }
  });

  let opener = null;
  function open(anchor) {
    opener = anchor;
    anchor.setAttribute("aria-expanded", "true");
    taste = sanitizeTaste(getView()?.taste);
    matches = [];
    paint();
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${r.bottom + 10}px`;
    pop.style.left = `${Math.max(12, Math.min(r.left + r.width / 2 - 190, innerWidth - 392))}px`;
    pop.classList.add("open");
    setTimeout(() => pop.querySelector(".tp-input")?.focus({ preventScroll: true }), 10);
  }
  // Left unset, focus goes back only if it was inside the popup (a click elsewhere keeps what was clicked).
  function close({ restoreFocus } = {}) {
    if (!pop.classList.contains("open")) return;
    const back = restoreFocus ?? pop.contains(document.activeElement);
    pop.classList.remove("open");
    opener?.setAttribute("aria-expanded", "false");
    if (back) opener?.focus({ preventScroll: true });
    if (!dirty) return;
    dirty = false;
    queue.then(() => onChanged());
  }
  // A taste change made elsewhere (Settings, the Crunchyroll panel) shows up while the popup is open.
  function sync() {
    if (pending || !pop.classList.contains("open")) return;
    const fresh = sanitizeTaste(getView()?.taste);
    if (JSON.stringify(fresh) !== JSON.stringify(taste)) { taste = fresh; paint(); }
  }

  return { el: pop, open, close, sync, isOpen: () => pop.classList.contains("open") };
}
