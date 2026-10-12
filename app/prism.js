// Prism: the Crunchilist page. Pages, cards, theme, trailers and the library, drawn from the extension's own data.
// The data layer (prism-data.js) is the only part that talks to the background.
import { applySeasonChanges, playRequest } from "../lib/app-shows.js";
import { galleryBanner, orderForYou } from "../lib/banner.js";
import { closeBadgeMenu, openBadgeMenu } from "../ui/badge-menu.js";
import { BADGE_CSS, BADGE_MENU_CSS, badgeHtml, badgeOptions } from "../ui/badge-style.js";
import { SEARCH_CSS, createSearchView } from "../ui/search-view.js";
import { SETTINGS_CSS, createSettingsView } from "../ui/settings-view.js";
import { embed } from "./embed.js";
import { translatedTrack } from "../lib/captions.js";
import { INSPIRED_SEARCHES, RECENT_LIMIT, cleanSearches, rememberSearch } from "../lib/inspired.js";
import { CUSTOM_VARS, clamp, customVars, hexHsv, hsvHex } from "./prism-color.js";
import { createTastePop } from "./prism-taste.js";
import { canSelfUpdate, installUpdate } from "./updater.js";
import { reloadForDisk } from "../lib/update-check.js";

let SHOWS = [];
let byId = new Map();
let memo = {};

const PALETTES = [
  { id: "ember", name: "Ember", colors: ["#ff7a2f", "#ffb347"] },
  { id: "midnight", name: "Midnight", colors: ["#8b7bff", "#4fd1ff"] },
  { id: "sakura", name: "Sakura", colors: ["#ff6fa5", "#ffc2d4"] },
  { id: "matcha", name: "Matcha", colors: ["#8be05f", "#ecd56b"] },
  { id: "ocean", name: "Ocean", colors: ["#2ed3c6", "#6aa8ff"] },
  { id: "mono", name: "Mono", colors: ["#f5f5f5", "#555555"] },
];
const STATUS = { watching: "Watching", plan: "Plan to watch", finished: "Finished", dropped: "Dropped" };
const MOODS = ["something cozy", "big fights", "make me cry", "smart mystery", "short and sweet", "found family"];
const GRID_BATCH = 60;

const icons = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  muted: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9 5 6M22 9l-5 6"/>',
  soundLow: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  rows: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
};
const icon = (name, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ""}</svg>`;
const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Image addresses go inside url('…') in style attributes, so quotes, brackets and spaces are percent-encoded first.
const cssUrl = (url) => esc(String(url || "").replace(/["'()\\\s]/g, (c) => encodeURIComponent(c)));
const score = (show) => (show.score ? (show.score / 10).toFixed(1) : "–");
const eps = (show) => (show.episodes ? `${show.episodes} eps` : show.status === "RELEASING" ? "Ongoing" : "–");
const clip = (text, max) => {
  const value = String(text || "");
  if (value.length <= max) return value;
  const cut = value.lastIndexOf(" ", max);
  return `${value.slice(0, cut > 0 ? cut : max)}…`;
};
const artOf = (show) => show.banner || show.cover || "";
const posterImg = (show, cls = "") => (show.cover
  ? `<img class="${cls}" src="${esc(show.cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
  : `<span class="ph ${cls}">${esc((show.title || "?")[0].toUpperCase())}</span>`);

let data = null;
let send = async () => ({ ok: false });
let library = {};
let view = null;
let tastePop = null;
let shortcut = null;
let update = null;
let theme = {};
let prefs = { previews: true, sound: false, volume: 60, subs: true };
let loaded = false;
let writes = 0;

const settings = () => view?.settings || {};
const lite = () => Boolean(settings().liteMode);

// Seasons: each show keeps per-season status and progress, plus the season the viewer is on.
const seasonsOf = (show) => (show.seasons?.length ? show.seasons
  : [{ anilistId: show.anilistId, label: "Season 1", title: show.title, format: "TV", episodes: show.episodes, year: show.year, season: show.season, status: show.status, cover: show.cover }]);
const seasonEps = (season) => season.episodes || 0;
const released = (season) => season.status !== "NOT_YET_RELEASED";
const seasonState = (show, index) => library[show.id]?.s?.[index];
function entry(show) {
  const record = library[show.id];
  const state = record?.s?.[record.at];
  if (!state) return undefined;
  const season = seasonsOf(show)[record.at] || seasonsOf(show)[0];
  return { ...state, index: record.at, season, episodes: season.episodes, multi: seasonsOf(show).length > 1 };
}
const inStatus = (status) => SHOWS.filter((show) => entry(show)?.status === status);
const nextSeason = (show) => {
  const item = entry(show);
  const next = item && seasonsOf(show)[item.index + 1];
  return item?.status === "finished" && next && released(next) && !seasonState(show, item.index + 1) ? next : null;
};
const seasonTag = (item) => (item.multi ? `${item.season.format === "MOVIE" ? "Movie" : `S${item.index + 1}`} · ` : "");
const epLabel = (show, long) => {
  const item = entry(show);
  if (!item) return "";
  const n = Math.min(item.progress + 1, item.episodes || Infinity);
  return `${seasonTag(item)}${long ? "Episode " : "Ep "}${n}${item.episodes ? ` ${long ? "of" : "/"} ${item.episodes}` : ""}`;
};
const seasonCount = (show) => {
  const list = seasonsOf(show).filter((s) => s.format !== "MOVIE");
  return list.length > 1 ? `${list.length} seasons` : show.type === "movie" ? "Movie" : eps(show);
};

// Theme and page preferences stay on this device; playback and performance mode live in the extension's settings.
const THEME_KEY = "cl-theme";
const PREFS_KEY = "cl-prefs";
const readJson = (key) => { try { const value = JSON.parse(localStorage.getItem(key)); return value && typeof value === "object" ? value : {}; } catch { return {}; } };
function loadTheme() {
  const saved = readJson(THEME_KEY);
  const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
  theme = {
    palette: pick(saved.palette, [...PALETTES.map((p) => p.id), "custom"], "ember"),
    mode: pick(saved.mode, ["light", "dark", "system"], "dark"),
    size: pick(saved.size, ["s", "m", "l"], "m"),
    custom: /^#[0-9a-f]{6}$/i.test(saved.custom || "") ? saved.custom.toLowerCase() : "#ff7a2f",
  };
  const stored = readJson(PREFS_KEY);
  for (const [key, fallback] of Object.entries(prefs)) {
    if (typeof stored[key] === typeof fallback) prefs[key] = stored[key];
  }
  prefs.volume = clamp(Math.round(prefs.volume), 0, 100);
}
const savePrefs = () => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

function paintVars(el, vars) {
  for (const name of CUSTOM_VARS) vars ? el.style.setProperty(name, vars[name]) : el.style.removeProperty(name);
}
let wheelHsv = null;
function syncWheel() {
  if (!wheelHsv || hsvHex(wheelHsv.h, wheelHsv.s, wheelHsv.v) !== theme.custom) wheelHsv = hexHsv(theme.custom);
  const { h, s, v } = wheelHsv;
  const rad = (h * Math.PI) / 180;
  document.querySelectorAll(".wheel-knob").forEach((knob) => { knob.style.left = `${50 + 50 * s * Math.sin(rad)}%`; knob.style.top = `${50 - 50 * s * Math.cos(rad)}%`; });
  document.querySelectorAll(".wheel").forEach((wheel) => wheel.style.setProperty("--shade", (1 - v).toFixed(3)));
  document.querySelectorAll(".wheel-v").forEach((range) => { range.value = Math.round(v * 100); });
  document.querySelectorAll(".wheel-hex").forEach((field) => { if (field !== document.activeElement) field.value = theme.custom.toUpperCase(); });
  document.querySelectorAll("[data-pick]").forEach((el) => el.style.setProperty("--pick", theme.custom));
}
function setCustom(hex) {
  theme.custom = hex;
  theme.palette = "custom";
  applyTheme();
}
function pickWheel(wheel, event) {
  const box = wheel.getBoundingClientRect();
  const dx = event.clientX - box.left - box.width / 2;
  const dy = event.clientY - box.top - box.height / 2;
  const v = wheelHsv?.v ?? 1;
  wheelHsv = { h: ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(dx, dy) / (box.width / 2)), v };
  setCustom(hsvHex(wheelHsv.h, wheelHsv.s, wheelHsv.v));
}

function applyTheme() {
  const root = document.documentElement;
  const system = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  root.dataset.palette = theme.palette;
  root.dataset.mode = theme.mode === "system" ? system : theme.mode;
  root.dataset.size = theme.size;
  paintVars(root, theme.palette === "custom" ? customVars(theme.custom, root.dataset.mode) : null);
  document.querySelectorAll(".theme-tile[data-palette='custom']").forEach((tile) => paintVars(tile, customVars(theme.custom, root.dataset.mode)));
  syncWheel();
  root.classList.toggle("reduce", lite());
  root.classList.toggle("pv-subs", prefs.subs);
  localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  savePrefs();
  document.querySelectorAll("[data-set-palette]").forEach((el) => el.classList.toggle("on", el.dataset.setPalette === theme.palette));
  document.querySelectorAll("[data-set-mode]").forEach((el) => el.classList.toggle("on", el.dataset.setMode === theme.mode));
  document.querySelectorAll("[data-set-size]").forEach((el) => el.classList.toggle("on", el.dataset.setSize === theme.size));
  document.querySelectorAll("[data-pref]").forEach((el) => el.classList.toggle("on", prefOn(el.dataset.pref)));
  document.querySelectorAll("[data-setting]").forEach((el) => el.classList.toggle("on", settingOn(el.dataset.setting)));
  document.querySelectorAll(".theme-tile").forEach((el) => { el.dataset.mode = root.dataset.mode; });
}
const prefOn = (key) => Boolean(prefs[key]);
// Playback switches default to on, like the extension's own settings.
const settingOn = (key) => (["liteMode", "tabAuto", "miniPlayer"].includes(key) ? Boolean(settings()[key]) : settings()[key] !== false);

const CR_MARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#f47521"/><path d="M9.6 7.6v8.8l7-4.4z" fill="#fff"/></svg>`;
const OFF_MARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 19 19 5" stroke="currentColor" stroke-width="2"/></svg>`;
const onCrunchyroll = (show) => show.onCrunchyroll !== false;
function crBadge(show, cls = "") {
  return onCrunchyroll(show)
    ? `<span class="avail on ${cls}">${CR_MARK}On Crunchyroll</span>`
    : `<span class="avail off ${cls}">${OFF_MARK}Not on Crunchyroll</span>`;
}

// Cards
function newsBadge(show) {
  const item = entry(show);
  if (!item) return show.status === "RELEASING" ? '<span class="badge new">New episodes</span>' : "";
  const next = nextSeason(show);
  return next ? `<span class="badge new">${next.format === "MOVIE" ? "New movie" : `${esc(next.label)} out`}</span>` : "";
}
// Status badges look and behave like the ones on Crunchyroll pages, following the same badge settings.
const MARK_OF = { watching: "in_progress", plan: "plan", finished: "finished", dropped: "dropped" };
const STATUS_OF = { in_progress: "watching", plan: "plan", finished: "finished", dropped: "dropped" };
// look overrides the badge settings for a spot; always shows an Unwatched badge even when the settings hide it.
function statusBadge(show, { inline = false, focusable = !inline, always = inline, look = {} } = {}) {
  const item = entry(show);
  const mark = MARK_OF[item?.status] || "unwatched";
  const options = { ...badgeOptions(settings()), ...look };
  if (mark === "unwatched" && options.unwatched === "never" && !always) return "";
  if (always) options.unwatched = "always";
  const info = { progress: item ? item.progress : null, episodes: item?.episodes || null };
  return badgeHtml(mark, info, options, { inline, focusable, dataAttrs: `data-status-badge data-show="${esc(show.id)}"` });
}
// Continue watching keeps its badge top left, clear of the play button, like the Crunchyroll continue row.
const wideLook = () => ({ corner: "top-left", style: badgeOptions(settings()).style === "footer" ? "tinted" : badgeOptions(settings()).style });
function toggleStatusMenu(badge) {
  if (badge.getAttribute("aria-expanded") === "true") return closeBadgeMenu();
  const show = byId.get(badge.closest("[data-show]")?.dataset.show);
  if (!show) return;
  openBadgeMenu(badge, {
    mark: badge.dataset.crlMark,
    title: show.title,
    onPick: (mark) => (mark === "unwatched" ? library[show.id] && toggleList(show) : setStatus(show, entry(show)?.index ?? 0, STATUS_OF[mark])),
  });
}
function meter(show) {
  const item = entry(show);
  if (item?.status !== "watching" || !item.episodes) return "";
  return `<div class="meter"><i style="width:${Math.min(100, (item.progress / item.episodes) * 100)}%"></i></div>`;
}
function listButton(show, cls = "btn sm icon") {
  const item = entry(show);
  return `<button class="${cls}" data-act="toggle" title="${item ? `${STATUS[item.status]}. Click to remove` : "Add to Plan to watch"}">${icon(item ? "check" : "plus")}</button>`;
}
const matchBadge = (match, cls = "") => (Number.isFinite(match) ? `<span class="match-badge ${cls}" title="How well this fits your taste">${Math.round(match)}% match</span>` : "");
function card(show, opts = {}) {
  const rank = opts.rank ? `<span class="rank-num">${opts.rank}</span>` : "";
  // The peek only opens on hover, so its controls stay out of the tab order; Enter on the card opens the show page instead.
  const peek = `<div class="peek">
        <div class="peek-art" style="background-image:url('${cssUrl(artOf(show))}')"><div class="pv"></div>${show.trailer ? soundButton("pv-sound") : ""}</div>
        <div class="peek-body">
          <h4>${esc(show.title)}</h4>
          <div class="peek-meta"><span class="star">★ ${score(show)}</span>${show.year ? `<span>${show.year}</span>` : ""}<span>${seasonCount(show)}</span></div>
          <div class="peek-badges">${crBadge(show, "small")}${statusBadge(show, { inline: true })}</div>
          ${opts.why ? `<p class="peek-why">${icon("sparkle")} ${esc(opts.why)}</p>` : show.about ? `<p>${esc(clip(show.about, 220))}</p>` : ""}
          <div class="peek-tags">${show.genres.slice(0, 3).map((g) => `<span>${esc(g)}</span>`).join("")}</div>
          <div class="peek-actions">
            ${!onCrunchyroll(show)
              ? `<a class="btn sm" href="#show/${esc(show.id)}">Where to watch</a>`
              : `<button class="btn sm accent" data-act="watch">${icon("play")} ${entry(show)?.status === "watching" ? epLabel(show).replace(/ \/ \d+$/, "") : "Watch"}</button>`}
            ${listButton(show)}
            <a class="btn sm ghost" href="#show/${esc(show.id)}">Details</a>
          </div>
        </div>
      </div>`.replace(/<(button|a) /g, '<$1 tabindex="-1" ');
  return `<div class="card${opts.rank ? " ranked" : ""}" data-show="${esc(show.id)}" data-crl-card style="--c:${esc(show.color)}" tabindex="0" role="link" aria-label="${esc(show.title)}">
    ${rank}
    <div class="poster">
      ${posterImg(show)}
      ${newsBadge(show)}${statusBadge(show)}${meter(show)}${!onCrunchyroll(show) ? crBadge(show, "mini") : ""}${matchBadge(opts.match)}
    </div>
    ${peek}
    <div class="cap"><div class="title">${esc(show.title)}</div>${opts.why
      ? `<div class="why" title="${esc(opts.why)}">${esc(opts.why)}</div>`
      : `<div class="sub">${esc(show.genres[0] || (show.type === "movie" ? "Movie" : "Series"))} · ${seasonCount(show)}</div>`}</div>
  </div>`;
}
function wide(show) {
  return `<div class="wide" data-show="${esc(show.id)}" data-crl-card tabindex="0" role="${onCrunchyroll(show) ? "button" : "link"}" aria-label="${onCrunchyroll(show) ? `Play ${esc(show.title)}, ${esc(playLabel(show).toLowerCase())}` : `${esc(show.title)}, ${esc(epLabel(show, true))}`}">
    <div class="wide-art">${artOf(show) ? `<img src="${esc(artOf(show))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}<div class="wide-play">${icon("play")}</div>${statusBadge(show, { look: wideLook() })}
      <div class="wide-copy"><b>${esc(show.title)}</b><small>${epLabel(show, true)}</small>${meter(show)}</div>
    </div>
  </div>`;
}
function rail(title, items, opts = {}) {
  if (!items.length && !opts.keep) return "";
  const render = opts.render || ((show, i) => card(show, { rank: opts.ranked && i < 10 ? i + 1 : 0, why: opts.why?.get(show.id), match: opts.match?.get(show.id) }));
  return `<section class="row ${opts.cls || ""}"${opts.id ? ` id="${opts.id}"` : ""}>
    <div class="row-head"><h2>${title}</h2>${opts.sub ? `<span class="muted">${opts.sub}</span>` : ""}${opts.extra || ""}${opts.href === false ? "" : `<a href="${opts.href || "#browse"}">See all</a>`}</div>
    ${items.length ? `<div class="rail-wrap">
      <button class="rail-arrow prev" data-act="rail-prev" aria-label="Scroll ${esc(opts.label || title)} left" tabindex="-1">${icon("left")}</button>
      <div class="rail">${items.map(render).join("")}</div>
      <button class="rail-arrow next" data-act="rail-next" aria-label="Scroll ${esc(opts.label || title)} right" tabindex="-1">${icon("right")}</button>
    </div>` : opts.empty || ""}
  </section>`;
}

// Long grids draw 60 cards at a time as the page scrolls toward the end.
let gridObserver = null;
function mountGrid(target, items) {
  gridObserver?.disconnect();
  target.innerHTML = '<div class="grid"></div><div class="grid-more" aria-hidden="true"></div>';
  const gridEl = target.firstElementChild;
  const more = target.lastElementChild;
  let shown = 0;
  const fill = () => {
    const next = items.slice(shown, shown + GRID_BATCH);
    gridEl.insertAdjacentHTML("beforeend", next.map((show) => card(show)).join(""));
    shown += next.length;
    more.hidden = shown >= items.length;
    if (shown >= items.length) gridObserver?.disconnect();
  };
  fill();
  if (shown < items.length) {
    gridObserver = new IntersectionObserver((seen) => { if (seen.some((row) => row.isIntersecting)) fill(); }, { rootMargin: "0px 0px 1200px 0px" });
    gridObserver.observe(more);
  }
}

// Collections used by Home
const popular = () => memo.popular || (memo.popular = SHOWS.filter(onCrunchyroll).sort((a, b) => a.rank - b.rank));
const rated = () => [...SHOWS].sort((a, b) => (b.score || 0) - (a.score || 0));
const fresh = () => {
  const out = SHOWS.filter((show) => show.fresh);
  const airing = popular().filter((show) => show.status === "RELEASING" && !show.fresh);
  return [...out, ...airing];
};
const labelsOf = (show) => [...show.genres, ...show.tags];
function similar(show, count = 12) {
  const tags = new Set(labelsOf(show));
  if (!tags.size) return [];
  const chain = new Set(seasonsOf(show).map((season) => season.anilistId).filter(Boolean));
  return SHOWS.filter((other) => other.id !== show.id && !chain.has(other.anilistId))
    .map((other) => ({ other, hits: labelsOf(other).filter((t) => tags.has(t)).length }))
    .filter((row) => row.hits > 1)
    .sort((a, b) => b.hits - a.hits || (b.other.score || 0) - (a.other.score || 0))
    .slice(0, count).map((row) => row.other);
}
// Picked for you: the search engine's own For you row. With AI on, the model ranks it on its own when Home opens
// (cached for 12 hours in the background), and Reroll asks for different picks. With AI off it stays in taste order.
// `ranked` keeps the first AI ranking so a reroll changes this row without reshuffling the banner.
// `prev` is the roll before the current one; Last roll swaps them.
const forYou = { loaded: false, loading: false, ids: [], matches: new Map(), picks: null, ranked: null, by: "", prev: null, seen: new Set(), busy: false, tried: false };
const aiOn = () => settings().useAi !== false;
function forYouOrder() {
  if (!forYou.ids.length) return popular().filter((show) => !entry(show)).slice(0, 14).map((show) => ({ id: show.id, match: null, reason: "", ai: false }));
  const tasteIds = forYou.ids.filter((id) => entry(byId.get(id))?.status !== "finished");
  return orderForYou({ tasteIds, picks: aiOn() ? forYou.picks : null, tasteMatch: forYou.matches }).filter((row) => byId.has(row.id));
}
function forYouRail() {
  const rows = forYouOrder().slice(0, 14);
  const ai = aiOn() && forYou.ids.length >= 3;
  const action = !ai ? ""
    : forYou.busy ? `<span class="ai-state busy">${icon("sparkle")} ${forYou.picks ? "Rerolling" : "Ranking"}…</span>`
    : forYou.picks ? `<button class="btn sm ghost ai-btn" data-act="ai-reroll" title="Ask AI for different picks">${icon("refresh")} Reroll</button>${forYou.prev ? `<button class="btn sm ghost ai-btn" data-act="ai-last" title="Bring back the picks from before">${icon("history")} Last roll</button>` : ""}`
    : `<button class="btn sm ai-btn" data-act="ai-pick" title="Let AI rank this row and say why">${icon("sparkle")} AI picks</button>`;
  const why = new Map(rows.filter((row) => row.reason).map((row) => [row.id, row.reason]));
  const match = new Map(rows.filter((row) => row.match != null).map((row) => [row.id, row.match]));
  const sub = ai && forYou.picks ? `Ranked by ${esc(forYou.by || "AI")}`
    : ai && forYou.busy ? "Ranked by your taste while AI looks it over"
    : "Ranked by your taste and what you've watched";
  return rail("Picked for you", rows.map((row) => byId.get(row.id)), {
    id: "for-you", cls: ai && forYou.picks ? "ai-row" : "", sub, extra: action, why, match, ranked: forYou.ids.length > 0, href: "#search",
  });
}
function paintForYou() {
  const section = document.querySelector("#for-you");
  if (!section) return;
  const scroll = section.querySelector(".rail")?.scrollLeft || 0;
  section.outerHTML = forYouRail();
  const next = document.querySelector("#for-you .rail");
  if (next && !forYou.picks) next.scrollLeft = scroll;
}
// The banner blends the AI ranking, Crunchyroll popularity, taste and shows you haven't started.
// After a reroll it holds that roll (`rows`) until the next one; `prev` is the roll Last roll brings back.
// Three pages of six. `extra` is a second AI roll kept for the banner alone, so most slides are AI picks.
const BANNER_COUNT = 18;
const BANNER_EXTRA_KEY = "cl-banner-ai";
const BANNER_EXTRA_MS = 12 * 60 * 60 * 1000;
const banner = { rows: null, prev: null, seen: new Set(), busy: false, extra: [], extraFor: "" };
// The AI-named Home rows, a few from each in turn, each saying which row it came from.
function homeRowPicks() {
  if (!homeGen.ai || !homeGen.rows?.length) return [];
  const out = [];
  for (let depth = 0; depth < 3; depth += 1) {
    for (const row of homeGen.rows) {
      const id = row.ids?.[depth];
      if (id) out.push({ id, reason: `Fits “${row.title}”, one of your rows today` });
    }
  }
  return out;
}
const bannerBase = (picks) => ({
  shows: SHOWS,
  trending: popular().map((show) => show.id),
  tasteIds: forYou.ids,
  picks,
  extraPicks: picks ? [...banner.extra, ...homeRowPicks()] : [],
  tasteMatch: forYou.matches,
  statusOf: (show) => entry(show)?.status || "",
  hasArt: (show) => Boolean(show.banner || show.cover),
});
function bannerRows(count = BANNER_COUNT) {
  if (banner.rows) return banner.rows.filter((row) => byId.has(row.id) && !["finished", "dropped"].includes(entry(byId.get(row.id))?.status));
  return galleryBanner({ ...bannerBase(aiOn() ? forYou.ranked : null), count });
}
function rerankPicks(answer) {
  return (answer?.ok ? answer.results || [] : []).map((row) => ({
    id: String(row.id).replace(/^sight:/, ""),
    reason: row.reason || "",
    rank: row.rank ?? null,
    confidence: Number.isFinite(row.confidence) ? row.confidence : null,
    mention: Boolean(row.mention),
  })).filter((pick) => byId.has(pick.id));
}
// One more AI roll after the first ranking, asked to avoid it, cached for 12 hours per ranking.
async function loadBannerExtra() {
  const ranked = (forYou.ranked || []).map((pick) => pick.id);
  const key = ranked.join(",");
  if (!key || banner.extraFor === key) return;
  banner.extraFor = key;
  try {
    const saved = JSON.parse(localStorage.getItem(BANNER_EXTRA_KEY) || "null");
    if (saved?.key === key && Date.now() - saved.at < BANNER_EXTRA_MS) {
      banner.extra = saved.picks.filter((pick) => byId.has(pick.id));
      return home?.refreshBanner?.(api);
    }
  } catch {}
  const seen = ranked.map((id) => `sight:${id}`);
  const answer = await send("catalogRerank", { query: "", chip: "", site: "all", ids: forYou.ids.map((id) => `sight:${id}`), reroll: true, seen, last: seen, save: false });
  const picks = rerankPicks(answer).map((pick) => ({ ...pick, mention: false }));
  if (!picks.length || banner.extraFor !== key) return;
  banner.extra = picks;
  try { localStorage.setItem(BANNER_EXTRA_KEY, JSON.stringify({ key, at: Date.now(), picks })); } catch {}
  home?.refreshBanner?.(api);
}
const bannerRoll = () => ({ busy: banner.busy, last: Boolean(banner.prev) });
// The rows in the order their bars show, which can differ from the ranking once the slide on screen was kept in place.
function shownBanner() {
  const order = home.shownIds?.() || [];
  const at = (row) => (order.includes(row.id) ? order.indexOf(row.id) : order.length);
  return bannerRows().sort((a, b) => at(a) - at(b));
}
function lastForYouRoll() {
  if (forYou.busy || !forYou.prev) return;
  const current = { picks: forYou.picks, by: forYou.by };
  ({ picks: forYou.picks, by: forYou.by } = forYou.prev);
  forYou.prev = current;
  paintForYou();
}
// Shows banner picks it hasn't shown since Home opened. With AI on, the model rerolls them too, without touching For you.
async function rerollBanner() {
  if (banner.busy) return;
  const current = shownBanner();
  for (const row of current) banner.seen.add(row.id);
  banner.busy = true;
  home.paintRoll?.();
  let picks = null;
  if (aiOn() && forYou.ids.length >= 3) {
    const answer = await send("catalogRerank", {
      query: "",
      chip: "",
      site: "all",
      ids: forYou.ids.map((id) => `sight:${id}`),
      reroll: true,
      seen: [...banner.seen].map((id) => `sight:${id}`),
      last: current.map((row) => `sight:${row.id}`),
      save: false,
    });
    picks = rerankPicks(answer);
  }
  const base = bannerBase(picks?.some((pick) => !pick.mention) ? picks : null);
  let next = galleryBanner({ ...base, count: BANNER_COUNT, exclude: banner.seen });
  if (next.length < 6) {
    banner.seen = new Set(current.map((row) => row.id));
    next = galleryBanner({ ...base, count: BANNER_COUNT, exclude: banner.seen });
  }
  banner.busy = false;
  if (!next.length) {
    home.paintRoll?.();
    return toast("No other banner picks right now");
  }
  banner.prev = current;
  banner.rows = next;
  home.refreshBanner?.(api, { restart: true });
}
function lastBannerRoll() {
  if (banner.busy || !banner.prev) return;
  [banner.rows, banner.prev] = [banner.prev, shownBanner()];
  home.refreshBanner?.(api, { restart: true });
}
function paintAi() {
  paintForYou();
  home?.refreshBanner?.(api);
}
async function loadForYou() {
  if (forYou.loaded || forYou.loading || !SHOWS.length) return;
  forYou.loading = true;
  const reply = await send("catalogSearch", { query: "", chip: "", site: "all", sort: "relevance" });
  forYou.loading = false;
  const row = reply?.ok ? (reply.sections || []).find((section) => section.rerank) : null;
  if (!row) return;
  forYou.loaded = true;
  const items = row.items.map((item) => ({ ...item, id: String(item.id).replace(/^sight:/, "") })).filter((item) => byId.has(item.id));
  forYou.ids = items.map((item) => item.id);
  forYou.matches = new Map(items.filter((item) => Number.isFinite(item.match)).map((item) => [item.id, item.match]));
  paintAi();
  autoRank();
}
// Never starts Chrome's multi-GB model download on its own; pressing AI picks still can.
async function autoRank() {
  if (forYou.tried || !aiOn() || forYou.ids.length < 3) return;
  forYou.tried = true;
  const model = await send("modelStatus");
  if (model?.status?.needsDownload) return;
  pickForYou(false, { quiet: true });
}
async function pickForYou(reroll, { quiet = false } = {}) {
  if (forYou.busy || forYou.ids.length < 3 || !aiOn()) return;
  const last = reroll ? (forYou.picks || []).filter((pick) => !pick.mention).map((pick) => `sight:${pick.id}`) : [];
  if (!reroll) forYou.seen = new Set();
  for (const id of last) forYou.seen.add(id);
  forYou.busy = true;
  paintForYou();
  const answer = await send("catalogRerank", {
    query: "",
    chip: "",
    site: "all",
    ids: forYou.ids.map((id) => `sight:${id}`),
    ...(reroll ? { reroll: true, seen: [...forYou.seen], last } : {}),
  });
  forYou.busy = false;
  const rows = answer?.ok ? answer.results || [] : [];
  const picks = rows.map((row) => ({
    id: String(row.id).replace(/^sight:/, ""),
    reason: row.reason || "",
    rank: row.rank ?? null,
    confidence: Number.isFinite(row.confidence) ? row.confidence : null,
    mention: Boolean(row.mention),
  })).filter((pick) => byId.has(pick.id));
  if (picks.some((pick) => !pick.mention)) {
    if (answer.reset) forYou.seen = new Set(last);
    for (const row of rows) if (!row.mention) forYou.seen.add(row.id);
    forYou.prev = reroll && forYou.picks ? { picks: forYou.picks, by: forYou.by } : null;
    forYou.picks = picks;
    if (!reroll) forYou.ranked = picks;
    forYou.by = answer.by || "";
  } else if (!quiet && !answer?.off) {
    toast(answer?.downloading ? "Chrome is still downloading its AI model. Try again when it finishes"
      : `${answer?.note || answer?.error || "AI couldn't pick right now."}${reroll ? " Kept your current picks" : ""}`);
  }
  if (reroll) paintForYou();
  else {
    paintAi();
    if (forYou.ranked) loadBannerExtra();
  }
}

// Search: the extension's real search engine, unchanged, inside its own shadow root.
let searchView = null;
let searchEmbed = null;
let lastQuery = null;
const SEARCH_EXTRA = `
  .sv { gap: 14px; }
  .sv-bar { min-height: 62px; border-radius: 18px; }
  .sv-input { height: 60px; font-size: 18px; }
  .sv-card { border-radius: 18px; }
`;
function ensureSearch() {
  if (searchView) return;
  searchView = createSearchView({
    send,
    site: "all",
    newTab: false,
    onView: applyView,
    placeholder: "Search a title, or describe what you're in the mood for",
    linkFor: (item) => {
      const id = String(item.id || "").replace(/^sight:/, "");
      return byId.has(id) ? `#show/${encodeURIComponent(id)}` : item.url || "#";
    },
    onSearch: rememberQuery,
  });
  if (view) searchView.setView(view);
  searchEmbed = embed(SEARCH_CSS, searchView.root, { label: "Search", extra: SEARCH_EXTRA });
}

// Settings: account, history import, taste, search, notifications, badges, AI and catalog refresh come from the shared view.
// Its title is hidden because Prism draws its own above it.
let settingsView = null;
let settingsEmbed = null;
const SETTINGS_EXTRA = `
  .st > .st-head { display: none !important; }
  .st { gap: 12px; }
  .st-card { padding: 18px; }
`;
function ensureSettings() {
  if (settingsView) return;
  settingsView = createSettingsView({ send, onView: applyView });
  if (view) settingsView.setView(view);
  settingsEmbed = embed(SETTINGS_CSS, settingsView.root, { label: "More settings", extra: SETTINGS_EXTRA });
}

// Side panel on wide screens: picks inspired by recent searches (kept on this device) and the viewer's history.
const RECENT_KEY = "cl-recent";
const SIDE_QUERY = "(min-width: 1320px)";
let recent = (() => { try { return cleanSearches(JSON.parse(localStorage.getItem(RECENT_KEY)), RECENT_LIMIT); } catch { return []; } })();
let inspired = { key: "", results: null, by: "", ai: false, busy: false, note: "" };
let inspiredTimer = 0;
let inspiredSeq = 0;
const sideWide = () => matchMedia(SIDE_QUERY).matches;
function rememberQuery(query) {
  const next = rememberSearch(recent, query);
  if (next.join("\n") === recent.join("\n")) return;
  recent = next;
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  clearTimeout(inspiredTimer);
  inspiredTimer = setTimeout(() => loadInspired(), 1200);
}
async function loadInspired({ fresh = false } = {}) {
  if (document.body.dataset.page !== "search" || !sideWide() || !SHOWS.length) return;
  const searches = recent.slice(0, INSPIRED_SEARCHES);
  const key = JSON.stringify([searches, aiOn()]);
  if (!fresh && key === inspired.key && (inspired.results || inspired.busy)) return paintSide();
  const seq = ++inspiredSeq;
  inspired = { ...inspired, key, busy: true };
  paintSide();
  // Never starts Chrome's model download on its own; the engine's blend shows instead.
  const model = aiOn() && searches.length ? await send("modelStatus") : null;
  const reply = await send("searchInspired", { searches, ai: Boolean(model) && !model.status?.needsDownload, fresh });
  if (seq !== inspiredSeq) return;
  const results = (reply?.ok ? reply.results || [] : []).map((row) => ({ id: String(row.id).replace(/^sight:/, ""), reason: row.reason || "" })).filter((row) => byId.has(row.id));
  inspired = { key, results, by: reply?.by || "", ai: Boolean(reply?.ai), busy: false, note: reply?.ok ? "" : reply?.error || "" };
  paintSide();
}
function sidePick({ id, reason }) {
  const show = byId.get(id);
  return `<a class="side-pick" href="#show/${esc(id)}" data-show="${esc(id)}" data-crl-card>${posterImg(show)}<div><b>${esc(show.title)}</b>${reason ? `<small>${esc(reason)}</small>` : ""}<span class="side-pick-meta">${statusBadge(show, { inline: true, focusable: false, always: false, look: { size: "small" } })}<span>★ ${score(show)}</span><span>${seasonCount(show)}</span></span></div></a>`;
}
function paintSide() {
  const side = document.querySelector(".search-side");
  if (!side) return;
  const searches = recent.slice(0, INSPIRED_SEARCHES);
  const title = searches.length ? "Inspired by your searches" : "Picked for you";
  const by = inspired.busy ? (aiOn() && searches.length ? "Thinking…" : "Loading…")
    : inspired.ai ? `Picked by ${esc(inspired.by || "AI")} from your searches and watch history`
    : searches.length ? "From your searches and taste" : "Search something and picks inspired by it show up here";
  const list = inspired.busy && !inspired.results?.length
    ? Array.from({ length: 5 }, () => '<div class="side-pick skeleton"><span></span><div><i></i><i></i></div></div>').join("")
    : inspired.results?.length ? inspired.results.map(sidePick).join("")
    : `<p class="muted side-empty">${esc(inspired.note || "Nothing to suggest yet.")}</p>`;
  side.innerHTML = `<div class="side-card inspired${inspired.busy ? " busy" : ""}">
    <div class="side-head"><h3>${icon("sparkle")} ${title}</h3><button class="btn sm icon ghost" data-act="inspired-refresh" title="New picks" aria-label="New picks" ${inspired.busy ? "disabled" : ""}>${icon("refresh")}</button></div>
    <p class="side-by">${by}</p>
    ${recent.length ? `<div class="side-recent">${recent.map((query) => `<button class="chip" data-recent="${esc(query)}" title="Search again">${esc(query)}</button>`).join("")}<button class="side-clear" data-act="recent-clear">Clear</button></div>` : ""}
    <div class="side-list" aria-busy="${inspired.busy}">${list}</div>
  </div>`;
}

// Generated rows on Home: AI names 5-6 themes and the search engine fills each with real shows.
// The background keeps them 12 hours, or remakes them sooner (at most hourly) after new watching, taste or searches.
// Text typed in the bar above them nudges the themes for 12 hours; it steers the mix rather than filtering it.
const GEN_CHECK_MS = 10 * 60_000;
const homeGen = { rows: null, by: "", ai: false, busy: false, checkedAt: 0, createdAt: 0, nudge: "" };
async function loadHomeRows({ fresh = false, nudge } = {}) {
  if (!SHOWS.length || homeGen.busy) return;
  if (!fresh && nudge === undefined && homeGen.rows && Date.now() - homeGen.checkedAt < GEN_CHECK_MS) return;
  homeGen.busy = true;
  paintHomeRows();
  // Never starts Chrome's model download on its own; the taste-based rows show instead.
  const model = aiOn() ? await send("modelStatus") : null;
  const reply = await send("homeRows", {
    searches: recent.slice(0, INSPIRED_SEARCHES),
    ai: Boolean(model) && !model.status?.needsDownload,
    fresh,
    ...(nudge === undefined ? {} : { nudge }),
  });
  homeGen.busy = false;
  homeGen.checkedAt = Date.now();
  if (reply?.ok) {
    homeGen.rows = (reply.rows || []).map((row) => ({ ...row, ids: (row.ids || []).map((id) => String(id).replace(/^sight:/, "")) }));
    Object.assign(homeGen, { by: reply.by || "", ai: Boolean(reply.ai), createdAt: reply.createdAt || 0, nudge: reply.nudge || "" });
  } else if (fresh || nudge !== undefined) {
    toast(reply?.error || "Couldn't make new rows right now");
  }
  paintHomeRows();
  if (homeGen.ai && aiOn() && forYou.ranked) home?.refreshBanner?.(api);
}
function genNote() {
  if (homeGen.busy) return `${icon("sparkle")} Making rows…`;
  if (!homeGen.rows) return "";
  const made = homeGen.createdAt ? new Date(homeGen.createdAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "";
  const who = homeGen.ai ? `Named by ${esc(homeGen.by || "AI")}` : "Made from your taste and history";
  return `${homeGen.nudge ? `Leaning toward “${esc(homeGen.nudge)}”. ` : ""}${who}${made ? ` · ${made}` : ""}`;
}
function genRailsHtml() {
  return (homeGen.rows || []).map((row) => ({
    ...row,
    shows: row.ids.map((id) => byId.get(id)).filter((show) => show && !["finished", "dropped"].includes(entry(show)?.status)),
  })).filter((row) => row.shows.length >= 4).map((row) => rail(`${homeGen.ai ? icon("sparkle") : ""}${esc(row.title)}`, row.shows, {
    cls: "gen-row", label: row.title, sub: esc(row.why), href: `#search?q=${encodeURIComponent(row.query)}`,
  })).join("");
}
function homeRowsHtml() {
  return `<section class="gen-wrap${homeGen.ai ? " ai" : ""}">
    <form class="gen-ask" data-gen-ask role="search" aria-label="Inspire your own feed">
      <span class="gen-ask-ico" aria-hidden="true">${icon("sparkle")}</span>
      <input name="nudge" type="text" maxlength="80" autocomplete="off" spellcheck="false" aria-label="Inspire your own feed" placeholder="Inspire your own feed: “rainy day”, “set in space”, “found family”…" value="${esc(homeGen.nudge)}">
      <button class="btn sm accent" type="submit"${homeGen.busy ? " disabled" : ""}>Remix</button>
      <button class="btn sm ghost" type="button" data-act="gen-clear"${homeGen.nudge ? "" : " hidden"}>Clear</button>
    </form>
    <p class="gen-note muted" aria-live="polite">${genNote()}</p>
    <div id="gen-rows">${genRailsHtml()}</div>
  </section>`;
}
function paintHomeRows() {
  const wrap = document.querySelector(".gen-wrap");
  if (!wrap) return;
  wrap.classList.toggle("ai", homeGen.ai);
  wrap.querySelector("#gen-rows").innerHTML = genRailsHtml();
  wrap.querySelector(".gen-note").innerHTML = genNote();
  wrap.querySelector('.gen-ask [type="submit"]').disabled = homeGen.busy;
  wrap.querySelector('[data-act="gen-clear"]').hidden = !homeGen.nudge;
  const input = wrap.querySelector(".gen-ask input");
  if (document.activeElement !== input) input.value = homeGen.nudge;
}

function pageSearch(query) {
  return `<div class="search-hero">
    <h1 class="page-title">Find your next obsession</h1>
    <p class="page-sub">Search a title, or describe a mood, a vibe, or a show you loved. ${aiOn() ? "AI ranks the best matches and says why." : "Matches are ranked by the search engine and your taste."}</p>
    <div class="search-tools">${MOODS.map((m) => `<button class="chip mood" data-mood="${esc(m)}">${esc(m)}</button>`).join("")}</div>
  </div>
  <div class="search-layout"><div id="search-embed"></div><aside class="search-side" aria-label="Suggestions"></aside></div>`;
}
function mountSearch(query) {
  ensureSearch();
  document.querySelector("#search-embed")?.append(searchEmbed.wrap);
  paintSide();
  loadInspired();
  if (query != null && query !== lastQuery) {
    lastQuery = query;
    searchView.search(query);
  } else {
    searchView.open();
  }
  if (!route.keep) setTimeout(() => searchView.focus(), 30);
}

let listTab = "watching";
let listView = "grid";
function syncLine() {
  const s = settings();
  const sync = view?.sync || {};
  const imported = view?.importMeta?.importedAt;
  const viewToggle = `<div class="seg"><button class="${listView === "grid" ? "on" : ""}" data-view="grid" aria-label="Grid">${icon("grid")}</button><button class="${listView === "rows" ? "on" : ""}" data-view="rows" aria-label="Rows">${icon("rows")}</button></div>`;
  let dot = "ok";
  let text;
  let action = "";
  if (s.anilistExpired) {
    dot = "warn";
    text = `<b>AniList sign-in expired</b> <span class="muted">· changes are saved here and sync once you reconnect</span>`;
    action = `<button class="btn sm accent" data-act="anilist-connect">Reconnect</button>`;
  } else if (!s.anilistConnected) {
    dot = "off";
    text = `<b>Saved on this device</b> <span class="muted">· ${view?.importMeta?.username ? `imported ${esc(view.importMeta.username)}'s public list` : "connect AniList to sync your list"}</span>`;
    action = `<button class="btn sm" data-act="anilist-connect">Connect AniList</button>`;
  } else if (sync.waiting) {
    dot = sync.sending ? "ok" : "warn";
    const count = sync.waiting === 1 ? "1 change" : `${sync.waiting} changes`;
    text = sync.sending ? `<b>Sending ${count} to AniList…</b>` : `<b>${count} waiting to sync</b>${sync.error ? ` <span class="muted">· ${esc(sync.error)}</span>` : ""}`;
    if (!sync.sending) action = `<button class="btn sm" data-act="sync-now">${icon("refresh")} Retry</button>`;
  } else {
    text = `<b>All changes synced to AniList</b>${imported ? ` <span class="muted">· list pulled ${ago(imported)}</span>` : ""}`;
  }
  return `<div class="sync-line"><span class="dot-state ${dot}"></span><span>${text}</span><span class="nav-spacer"></span>${action}${viewToggle}</div>`;
}
function pageList(tab) {
  if (tab && STATUS[tab]) listTab = tab;
  const items = inStatus(listTab);
  const rows = () => `<div class="lib-rows">${items.slice(0, 400).map((show) => {
    const item = entry(show);
    const pct = item.status === "finished" ? 100 : item.episodes ? Math.round((item.progress / item.episodes) * 100) : 0;
    return `<div class="lib-row" data-show="${esc(show.id)}" data-crl-card>${posterImg(show)}<div><b>${esc(show.title)}</b><span class="muted">${item.multi ? `${esc(item.season.label)} · ` : ""}${esc(show.genres.slice(0, 2).join(" · "))}${show.genres.length ? " · " : ""}★ ${score(show)}</span><span class="lib-badge">${statusBadge(show, { inline: true, focusable: true })}</span></div>
      <div class="lib-prog">${item.progress} of ${item.episodes || "?"} episodes<div class="meter"><i style="width:${pct}%"></i></div></div>
      <div class="lib-acts">${listTab === "watching" ? `<button class="btn sm" data-act="plus-one">+1 ep</button>` : ""}${onCrunchyroll(show) ? `<button class="btn sm accent" data-act="watch" aria-label="Play">${icon("play")}</button>` : ""}</div></div>`;
  }).join("")}</div>`;
  const body = !items.length ? `<div class="empty"><p class="muted">${listTab === "watching" ? "Nothing in progress. Press Play on any show and it lands here." : "Nothing here yet."}</p><a class="btn" href="#browse">Browse shows</a></div>`
    : listView === "grid" ? '<div id="list-grid"></div>' : rows();
  return `<h1 class="page-title">My list</h1><p class="page-sub">Saved here first, then synced to AniList in the background.</p>
    ${syncLine()}
    <div class="tabs">${Object.entries(STATUS).map(([key, label]) => `<a class="chip ${key === listTab ? "on" : ""}" href="#list/${key}">${label} <b>${inStatus(key).length}</b></a>`).join("")}</div>
    ${body}`;
}

// Browse: genre tiles up top, then the whole catalog with filters.
const SEASON_NAMES = ["WINTER", "SPRING", "SUMMER", "FALL"];
const titleCase = (word) => `${word[0]}${word.slice(1).toLowerCase()}`;
const nowSeason = () => ({ season: SEASON_NAMES[Math.floor(new Date().getMonth() / 3)], year: new Date().getFullYear() });
const BROWSE_DEFAULT = { genre: "", when: "", status: "", length: "", sort: "popular", hideSeen: false, crOnly: false, tags: [], without: [] };
const freshBrowse = (keep = {}) => ({ ...BROWSE_DEFAULT, tags: [], without: [], ...keep });
let browse = freshBrowse();
// Tags and genres together, so either can be required or ruled out.
function tagPool() {
  if (memo.tagPool) return memo.tagPool;
  const counts = new Map();
  for (const show of SHOWS) for (const label of new Set(labelsOf(show))) counts.set(label, (counts.get(label) || 0) + 1);
  const genreSet = new Set(SHOWS.flatMap((show) => show.genres));
  memo.tagPool = [...counts].map(([name, count]) => ({ name, count, genre: genreSet.has(name) })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return memo.tagPool;
}
function genres() {
  if (memo.genres) return memo.genres;
  const counts = {};
  for (const show of SHOWS) for (const genre of show.genres) counts[genre] = (counts[genre] || 0) + 1;
  const used = new Set();
  memo.genres = Object.entries(counts).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([name, count]) => {
    const art = popular().find((show) => show.genres.includes(name) && show.banner && !used.has(show.id));
    if (art) used.add(art.id);
    return { name, count, art: art?.banner || "" };
  });
  return memo.genres;
}
function browseResults() {
  const current = nowSeason();
  const rows = SHOWS.filter((show) => {
    if (browse.genre && !show.genres.includes(browse.genre)) return false;
    if (browse.when === "now" && show.status !== "RELEASING" && !(show.season === current.season && show.year === current.year)) return false;
    if (browse.when.startsWith("y:") && show.year !== Number(browse.when.slice(2))) return false;
    if (browse.when.startsWith("d:") && Math.floor((show.year || 0) / 10) * 10 !== Number(browse.when.slice(2))) return false;
    if (browse.status === "airing" && show.status !== "RELEASING") return false;
    if (browse.status === "finished" && show.status !== "FINISHED") return false;
    if (browse.length === "short" && !(show.episodes && show.episodes <= 13)) return false;
    if (browse.length === "standard" && !(show.episodes > 13 && show.episodes <= 26)) return false;
    if (browse.length === "long" && !(show.episodes > 26)) return false;
    if (browse.hideSeen && entry(show)?.status === "finished") return false;
    if (browse.crOnly && !onCrunchyroll(show)) return false;
    if (!browse.tags.length && !browse.without.length) return true;
    const labels = labelsOf(show);
    if (!browse.tags.every((tag) => labels.includes(tag))) return false;
    if (browse.without.some((tag) => labels.includes(tag))) return false;
    return true;
  });
  const seasonOrder = (show) => (show.year || 0) * 4 + SEASON_NAMES.indexOf(show.season || "WINTER");
  const sorters = {
    popular: (a, b) => a.rank - b.rank,
    rated: (a, b) => (b.score || 0) - (a.score || 0) || a.rank - b.rank,
    newest: (a, b) => seasonOrder(b) - seasonOrder(a) || a.rank - b.rank,
    az: (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
  };
  return rows.sort(sorters[browse.sort] || sorters.popular);
}
function browseSelect(key, label, options) {
  return `<select class="select" data-browse="${key}" aria-label="${label}">${options.map(([value, text]) => `<option value="${esc(value)}" ${browse[key] === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select>`;
}
function paintBrowse() {
  const out = document.querySelector("#browse-results");
  if (!out) return;
  document.querySelectorAll("[data-genre]").forEach((tile) => tile.classList.toggle("on", tile.dataset.genre === browse.genre));
  document.querySelectorAll("[data-browse]").forEach((el) => { el.value = browse[el.dataset.browse]; });
  document.querySelectorAll("[data-bflag]").forEach((el) => el.classList.toggle("on", browse[el.dataset.bflag]));
  const chips = document.querySelector(".tag-chips");
  if (chips) chips.innerHTML = [...browse.tags.map((tag) => [tag, "in"]), ...browse.without.map((tag) => [tag, "out"])].map(([tag, mode]) => `<span class="tag-chip ${mode}">
      <button data-tag-flip="${esc(tag)}" title="${mode === "in" ? "Switch to exclude" : "Switch to include"}">${mode === "in" ? "+" : "−"} ${esc(tag)}</button><button data-tag-remove="${esc(tag)}" aria-label="Remove ${esc(tag)}">${icon("close")}</button></span>`).join("");
  const results = browseResults();
  const filtered = Object.keys(BROWSE_DEFAULT).some((key) => key !== "sort" && (Array.isArray(browse[key]) ? browse[key].length : browse[key] !== BROWSE_DEFAULT[key]));
  out.innerHTML = `<div class="row-head"><h2>${esc(browse.genre || "All shows")}</h2><span class="muted">${results.length} ${results.length === 1 ? "show" : "shows"}</span>${filtered ? `<a href="#browse" data-act="browse-clear">Clear filters</a>` : ""}</div>
    ${results.length ? '<div id="browse-grid"></div>' : `<div class="empty"><p class="muted">No shows match all of these filters.</p><button class="btn" data-act="browse-clear">Clear filters</button></div>`}`;
  const target = out.querySelector("#browse-grid");
  if (target) mountGrid(target, results);
}
function pageBrowse(genre) {
  if (genre !== undefined) browse.genre = genre;
  const current = nowSeason();
  const years = [...new Set(SHOWS.map((show) => show.year).filter((year) => year >= current.year - 6))].sort((a, b) => b - a);
  const decades = [...new Set(SHOWS.map((show) => show.year).filter((year) => year && year < current.year - 6).map((year) => Math.floor(year / 10) * 10))].sort((a, b) => b - a);
  const all = genres();
  return `<h1 class="page-title">Browse</h1><p class="page-sub">Everything in the catalog. Start with a genre, or narrow it down with the filters.</p>
    <div class="genre-tiles">${all.slice(0, 12).map((g) => `<button class="genre-tile ${g.name === browse.genre ? "on" : ""}" data-genre="${esc(g.name)}" style="background-image:linear-gradient(180deg,transparent 20%,rgba(0,0,0,.78))${g.art ? `,url('${cssUrl(g.art)}')` : ""}"><b>${esc(g.name)}</b><small>${g.count} shows</small></button>`).join("")}</div>
    ${all.length > 12 ? `<div class="genre-more"><span class="muted">More genres</span>${all.slice(12).map((g) => `<button class="chip ${g.name === browse.genre ? "on" : ""}" data-genre="${esc(g.name)}">${esc(g.name)} <b>${g.count}</b></button>`).join("")}</div>` : ""}
    <div class="browse-bar">
      ${browseSelect("when", "When", [["", "Any time"], ["now", `This season (${titleCase(current.season)} ${current.year})`], ...years.map((year) => [`y:${year}`, String(year)]), ...decades.map((decade) => [`d:${decade}`, `${decade}s`])])}
      ${browseSelect("status", "Status", [["", "Airing or finished"], ["airing", "Airing now"], ["finished", "Finished"]])}
      ${browseSelect("length", "Length", [["", "Any length"], ["short", "Short (up to 13 eps)"], ["standard", "Standard (14 to 26 eps)"], ["long", "Long (27+ eps)"]])}
      <button class="chip ${browse.hideSeen ? "on" : ""}" data-bflag="hideSeen">Hide finished</button>
      ${SHOWS.some((show) => !onCrunchyroll(show)) ? `<button class="chip ${browse.crOnly ? "on" : ""}" data-bflag="crOnly">On Crunchyroll only</button>` : ""}
      ${browseSelect("sort", "Sort", [["popular", "Most popular"], ["rated", "Highest rated"], ["newest", "Newest"], ["az", "A to Z"]])}
    </div>
    <div class="tag-filter">
      <div class="tag-box">${icon("search")}<input id="tag-q" placeholder="Tags: include or exclude, like “time travel” or “gore”" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="tag-menu"><div class="tag-menu" id="tag-menu" role="listbox" hidden></div></div>
      <div class="tag-chips"></div>
    </div>
    <div id="browse-results"></div>`;
}
function paintTagMenu(open = true) {
  const input = document.querySelector("#tag-q");
  const menu = document.querySelector("#tag-menu");
  if (!input || !menu) return;
  const q = input.value.trim().toLowerCase();
  const chosen = new Set([...browse.tags, ...browse.without]);
  const matches = tagPool().filter((tag) => !chosen.has(tag.name) && (q ? tag.name.toLowerCase().includes(q) : !tag.genre))
    .sort((a, b) => (q ? !a.name.toLowerCase().startsWith(q) - !b.name.toLowerCase().startsWith(q) : 0) || b.count - a.count).slice(0, 8);
  menu.hidden = !open;
  input.setAttribute("aria-expanded", String(open));
  menu.innerHTML = `${matches.map((tag, i) => `<div class="tag-opt ${i === 0 ? "sel" : ""}" role="option" data-tag="${esc(tag.name)}">
      <span>${esc(tag.name)}<small>${tag.genre ? "Genre · " : ""}${tag.count} ${tag.count === 1 ? "show" : "shows"}</small></span>
      <button data-tag-add="${esc(tag.name)}" data-mode="in">${icon("plus")} Include</button><button data-tag-add="${esc(tag.name)}" data-mode="out">${icon("close")} Exclude</button></div>`).join("")
    || `<p class="muted">No tags match “${esc(input.value.trim())}”.</p>`}
    ${matches.length ? `<div class="tag-hint">Enter includes · Shift+Enter excludes · ↑↓ to choose</div>` : ""}`;
}
function setTag(tag, mode) {
  browse.tags = browse.tags.filter((t) => t !== tag);
  browse.without = browse.without.filter((t) => t !== tag);
  if (mode === "in") browse.tags.push(tag);
  if (mode === "out") browse.without.push(tag);
  paintBrowse();
}

// Airing: this week's episodes, from each show's next airing time, repeated weekly so an older snapshot still fills the week.
const DAY = 864e5;
const WEEK = 7 * DAY;
let airingMine = false;
function airingWeek() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  const to = from + WEEK;
  const week = [];
  const later = [];
  for (const show of SHOWS) {
    if (!show.airing) continue;
    let at = show.airing.at * 1000;
    let episode = show.airing.episode;
    if (at < from) { const k = Math.ceil((from - at) / WEEK); at += k * WEEK; episode += k; }
    else if (at >= to && at < to + WEEK && episode > 1) { at -= WEEK; episode -= 1; }
    (at < to ? week : later).push({ show, at, episode });
  }
  return { from, week: week.sort((a, b) => a.at - b.at), later: later.sort((a, b) => a.at - b.at) };
}
const clock = (time) => new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function airItem({ show, at, episode }) {
  const item = entry(show);
  const mine = item?.status === "watching";
  const aired = at <= Date.now();
  const behind = mine && aired && item.progress < episode;
  return `<a class="air ${mine ? "mine" : ""} ${aired ? "aired" : ""}" href="#show/${esc(show.id)}" data-show="${esc(show.id)}" data-crl-card>
    ${posterImg(show)}
    <div><span class="air-top"><time>${clock(at)}</time>${statusBadge(show, { inline: true, focusable: false, always: false, look: { size: "small" } })}</span><b>${esc(show.title)}</b><small>Ep ${episode}${behind ? ' · <em>New for you</em>' : aired ? " · Out now" : ""}</small></div>
  </a>`;
}
function pageAiring() {
  const { from, week, later } = airingWeek();
  const shown = (list) => (airingMine ? list.filter((slot) => entry(slot.show)?.status === "watching") : list);
  const mine = week.filter((slot) => entry(slot.show)?.status === "watching");
  const next = mine.find((slot) => slot.at > Date.now());
  const day = (time) => { const n = Math.round((time - from) / DAY); return n === 0 ? "Today" : n === 1 ? "Tomorrow" : new Date(time).toLocaleDateString([], { weekday: "long" }); };
  const columns = Array.from({ length: 7 }, (_, i) => {
    const start = from + i * DAY;
    const slots = shown(week).filter((slot) => slot.at >= start && slot.at < start + DAY);
    return `<section class="air-day ${i === 0 ? "today" : ""}"><h3>${day(start)}<small>${new Date(start).toLocaleDateString([], { month: "short", day: "numeric" })}</small></h3>
      ${slots.map(airItem).join("") || '<p class="muted air-none">Nothing airing</p>'}</section>`;
  }).join("");
  const returning = shown(later);
  const empty = !week.length && !later.length;
  return `<h1 class="page-title">Airing this week</h1>
    <p class="page-sub">${empty ? "Airing times arrive from AniList shortly after the catalog loads." : mine.length ? `${mine.length} ${mine.length === 1 ? "show" : "shows"} you're watching ${mine.length === 1 ? "airs" : "air"} this week.${next ? ` Next up: ${esc(next.show.title)}, ${day(next.at).toLowerCase()} at ${clock(next.at)}.` : ""}` : "Nothing you're watching airs this week."} Times are in your time zone.</p>
    <div class="search-tools air-tools"><button class="chip ${airingMine ? "" : "on"}" data-airing-mine="false">Everything airing</button><button class="chip ${airingMine ? "on" : ""}" data-airing-mine="true">Only shows I'm watching</button></div>
    <div class="air-week">${columns}</div>
    ${returning.length ? `<div class="row-head air-later-head"><h2>Coming back later</h2><span class="muted">On a break or starting soon</span></div>
      <div class="air-later">${returning.map(({ show, at, episode }) => `<a class="air" href="#show/${esc(show.id)}" data-show="${esc(show.id)}" data-crl-card>${posterImg(show)}<div><span class="air-top"><time>${new Date(at).toLocaleDateString([], { month: "short", day: "numeric" })}</time>${statusBadge(show, { inline: true, focusable: false, always: false, look: { size: "small" } })}</span><b>${esc(show.title)}</b><small>${episode > 1 ? `Returns with episode ${episode}` : "Premieres"}</small></div></a>`).join("")}</div>` : ""}`;
}

function seasonStrip(show, selected) {
  const seasons = seasonsOf(show);
  if (seasons.length < 2) return "";
  return `<div class="seasons">${seasons.map((season, i) => {
    const state = seasonState(show, i);
    const total = season.episodes;
    const line = !released(season) ? `Coming ${season.year || "soon"}`
      : state?.status === "watching" ? `Ep ${Math.min(state.progress + 1, total || Infinity)}${total ? ` of ${total}` : ""}`
      : state ? STATUS[state.status] : `${season.year || ""}${total ? ` · ${total} ${total === 1 ? "ep" : "eps"}` : ""}`;
    const pct = state?.status === "finished" ? 100 : state?.status === "watching" && total ? (state.progress / total) * 100 : 0;
    return `<a class="season ${i === selected ? "on" : ""} ${state ? `st-${state.status}` : ""} ${released(season) ? "" : "soon"}" href="#show/${esc(show.id)}/${i + 1}">
      ${season.cover || show.cover ? `<img src="${esc(season.cover || show.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
      <div><b>${esc(season.label)}</b><small>${esc(line)}</small></div>
      ${state?.status === "finished" ? `<span class="season-check">${icon("check")}</span>` : ""}
      ${pct ? `<div class="meter"><i style="width:${pct}%"></i></div>` : ""}
    </a>`;
  }).join("")}</div>`;
}

// Episode buttons play that episode on Crunchyroll. "Mark watched" switches them to setting your progress instead.
let marking = false;
let markingShow = "";
function pageShow(id, seasonArg) {
  const show = byId.get(id);
  if (!show) return loaded && SHOWS.length ? `<h1 class="page-title">We couldn't find that show</h1><p class="page-sub">The link may be out of date, or the show has left the catalog.</p>
    <div class="missing-acts"><a class="btn accent" href="#browse">Browse shows</a><a class="btn ghost" href="#">Back to home</a></div>` : loadingPage();
  if (markingShow !== show.id) { marking = false; markingShow = show.id; }
  const seasons = seasonsOf(show);
  const at = library[show.id]?.at ?? 0;
  const wanted = Number.parseInt(seasonArg, 10);
  const index = Number.isFinite(wanted) ? Math.min(Math.max(wanted - 1, 0), seasons.length - 1) : Math.min(nextSeason(show) ? at + 1 : at, seasons.length - 1);
  const season = seasons[index];
  const multi = seasons.length > 1;
  const item = seasonState(show, index);
  const progress = item?.status === "finished" ? seasonEps(season) || item.progress : item?.progress || 0;
  const count = season.episodes && season.episodes <= 200 ? season.episodes : 0;
  const onCr = onCrunchyroll(show);
  const playable = onCr && released(season);
  const markMode = marking || !onCr;
  const epsGrid = !released(season)
    ? `<div class="set-row"><div class="grow"><b>Not out yet</b><small>${season.year ? `Expected ${season.season ? `${titleCase(season.season)} ` : ""}${season.year}` : "No date announced"}. Add it to Plan to watch and the Airing page shows when it starts.</small></div></div>`
    : count
    ? `<div class="eps ${markMode ? "marking" : "playing"}">${Array.from({ length: count }, (_, i) => `<button class="ep ${i < progress ? "seen" : ""} ${i === progress && item?.status !== "finished" ? "next" : ""}" data-ep="${i + 1}" data-season="${index}" title="${markMode ? `Watched through episode ${i + 1}` : `Play episode ${i + 1}`}">${i + 1}</button>`).join("")}</div>`
    : `<div class="set-row"><div class="grow"><b>Episode ${progress}</b><small>${season.episodes ? `of ${season.episodes}` : "Still airing, so the episode count isn't final"}</small></div>${playable ? `<button class="btn sm accent" data-act="watch" data-season="${index}">${icon("play")} Next episode</button>` : ""}<button class="btn sm" data-act="plus-one" data-season="${index}">+1 episode</button></div>`;
  const streams = show.streaming || [];
  const actions = !released(season) ? ""
    : onCr ? `<button class="btn accent" data-act="watch" data-show="${esc(show.id)}" data-season="${index}">${icon("play")} ${playLabel(show, index)}</button>`
    : streams.length ? streams.map((link) => `<a class="btn accent" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">Watch on ${esc(link.site)} ${icon("right")}</a>`).join("")
    : `<button class="btn" disabled>Not on Crunchyroll</button>`;
  const where = settings().openIn === "window" ? "your Crunchyroll window" : settings().openIn === "new" ? "a new Crunchyroll tab" : "your Crunchyroll tab";
  const playHint = !released(season) ? ""
    : onCr ? `Opens ${esc(playTarget(show, index).label.toLowerCase())} in ${where}`
    : `Crunchyroll doesn't have this show, so it can't play here. Crunchilist still tracks it: mark episodes below as you watch${streams.length ? ` on ${streams.map((link) => esc(link.site)).join(" or ")}` : " elsewhere"}`;
  const seasonName = (season.title || "").replace(show.title, "").replace(/^[\s:–-]+/, "").trim();
  const lastYear = seasons.filter((s) => s.year).at(-1)?.year;
  const totalEps = seasons.reduce((sum, s) => sum + (s.episodes || 0), 0);
  const seasonLabel = (s) => (s.season ? `${titleCase(s.season)} ` : "");
  const movies = seasons.filter((s) => s.format === "MOVIE").length;
  const epsHead = !released(season) || !count ? ""
    : !onCr ? '<span class="muted eps-hint">· tap the last one you watched</span>'
    : `<span class="muted eps-hint">· ${marking ? "tap the last one you watched" : "tap one to play it"}</span>
       <button class="btn sm ${marking ? "accent" : "ghost"} mark-toggle" data-act="mark-mode" aria-pressed="${marking}">${icon(marking ? "check" : "pencil")} ${marking ? "Done marking" : "Mark watched"}</button>`;
  return `<section class="show-hero" style="--c:${esc(show.color)}">
    <div class="show-hero-bg" style="background-image:url('${cssUrl(artOf(show))}')"></div>
    <div class="show-hero-inner">
      <div class="show-poster">${posterImg(show)}</div>
      <div class="show-copy">
        <div class="show-heading">
          ${show.native ? `<div class="show-jp" lang="ja" title="${esc(show.native)}">${esc(show.native)}</div>` : ""}
          <h1 class="show-title">${esc(show.title)}</h1>
        </div>
        <div class="show-native">${multi ? `<b class="season-pill">${esc(season.label)}${seasonName ? ` · ${esc(seasonName)}` : ""}</b>` : ""}${show.romaji && show.romaji !== show.title ? esc(show.romaji) : ""}</div>
        <div class="show-meta"><span>★ ${season.score ? (season.score / 10).toFixed(1) : score(show)}</span>${season.year ? `<span>${seasonLabel(season)}${season.year}</span>` : ""}<span>${season.episodes ? `${season.episodes} ${season.episodes === 1 ? "ep" : "eps"}` : "Ongoing"}</span>${show.duration && season.format !== "MOVIE" ? `<span>${show.duration} min</span>` : ""}${show.studio ? `<span>${esc(show.studio)}</span>` : ""}<span>${season.status === "RELEASING" ? "Airing" : released(season) ? "Complete" : "Upcoming"}</span></div>
        <div class="show-avail">${crBadge(show, "large")}${playHint ? `<span class="play-hint">${playHint}</span>` : ""}</div>
        <div class="show-actions">
          ${actions}
          ${show.trailer ? `<button class="btn" data-act="trailer" data-show="${esc(show.id)}">${icon("film")} Trailer</button>` : ""}
          <div class="seg status-seg">${Object.entries(STATUS).map(([key, label]) => `<button class="${item?.status === key ? "on" : ""}" data-status="${key}" data-show="${esc(show.id)}" data-season="${index}" ${!released(season) && key !== "plan" ? "disabled" : ""}>${label}</button>`).join("")}</div>
        </div>
      </div>
    </div>
  </section>
  <div class="show-body">
    <div>
      ${multi ? `<h3>Seasons <span class="muted" style="font-weight:600;font-size:14px">· ${seasons.length} on AniList, all in one place</span></h3>${seasonStrip(show, index)}` : ""}
      ${show.about ? `<h3>Story</h3><p class="show-about">${esc(show.about)}</p>` : ""}
      <div class="eps-head"><h3>${multi ? `${esc(season.label)} episodes` : "Episodes"}</h3>${epsHead}</div>${epsGrid}
    </div>
    <aside>
      <div class="side-card"><h3>Details</h3><dl class="facts">
        ${show.genres.length ? `<dt>Genres</dt><dd>${esc(show.genres.join(", "))}</dd>` : ""}
        ${multi ? `<dt>Seasons</dt><dd>${seasons.length - movies}${movies ? ` + ${movies} movie${movies > 1 ? "s" : ""}` : ""}</dd>` : ""}
        <dt>Episodes</dt><dd>${multi && totalEps ? `${totalEps} total` : show.episodes || "Ongoing"}</dd>
        <dt>Year</dt><dd>${show.year || "–"}${multi && lastYear && lastYear !== show.year ? `–${lastYear}` : ""}</dd><dt>Studio</dt><dd>${esc(show.studio) || "–"}</dd><dt>Score</dt><dd>${score(show)} / 10</dd></dl></div>
      <div class="side-card"><h3>Where to watch</h3>${onCr
        ? `<a class="where on" href="${esc(show.url || `https://www.crunchyroll.com/series/${show.id}`)}" target="_blank" rel="noopener noreferrer">${CR_MARK}<div><b>Crunchyroll</b><small>Play uses the Crunchyroll tab Crunchilist manages. This link opens the show page</small></div>${icon("right")}</a>`
        : `${streams.map((link) => `<a class="where" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer"><span class="where-dot">${esc(link.site[0])}</span><div><b>${esc(link.site)}</b><small>Opens in a new tab</small></div>${icon("right")}</a>`).join("") || `<p class="muted">AniList doesn't list a streaming site for this one.</p>`}
          <div class="where off">${OFF_MARK}<div><b>Not on Crunchyroll</b><small>Tracking and AniList sync still work</small></div></div>`}</div>
      ${show.tags.length ? `<div class="side-card"><h3>Tags</h3><div class="tag-list">${show.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div></div>` : ""}
      ${season.anilistId || show.anilistId ? `<div class="side-card"><a class="btn ghost" style="width:100%" href="https://anilist.co/anime/${Number(season.anilistId || show.anilistId)}" target="_blank" rel="noopener noreferrer">Open ${multi ? `${esc(season.label.toLowerCase())} ` : ""}on AniList</a></div>` : ""}
    </aside>
  </div>
  ${rail("More like this", similar(show))}`;
}

function pageSettings() {
  const s = settings();
  const openIn = s.openIn || "tab";
  const keys = shortcut == null ? [] : shortcut.split("+").filter(Boolean);
  return `<h1 class="page-title">Settings</h1><p class="page-sub">Make it yours. Everything here saves instantly.</p>
  <div class="settings">
    <div class="set-card"><h3>Appearance</h3><p>Pick a theme or make your own, then choose light, dark, or follow your system.</p>
      <div class="themes">${PALETTES.map((p) => `<button class="theme-tile" data-palette="${p.id}" data-set-palette="${p.id}">
        <div class="theme-prev"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="theme-name">${p.name}<span>${p.colors.map((c) => `<i style="background:${c}"></i>`).join("")}</span></div></button>`).join("")}
        <button class="theme-tile" data-palette="custom" data-set-palette="custom">
        <div class="theme-prev"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="theme-name">Custom<span><i style="background:var(--accent)"></i><i style="background:var(--accent-2)"></i></span></div></button></div>
      <div class="set-row"><div class="grow"><b>Custom color</b><small>Drag around the wheel to pick any color. Backgrounds, text and highlights are built from it for light and dark mode</small></div>
        ${wheelControls()}</div>
      <div class="set-row"><div class="grow"><b>Mode</b><small>Light, dark, or match your device</small></div>
        <div class="seg"><button data-set-mode="light">Light</button><button data-set-mode="dark">Dark</button><button data-set-mode="system">System</button></div></div>
      <div class="set-row"><div class="grow"><b>Card size</b><small>How big title cards are on every page</small></div>
        <div class="seg"><button data-set-size="s">Small</button><button data-set-size="m">Medium</button><button data-set-size="l">Large</button></div></div>
      <div class="set-row"><div class="grow"><b>Trailer previews</b><small>Play a muted trailer when you rest on a card</small></div><button class="switch" data-pref="previews" aria-label="Trailer previews"></button></div>
      <div class="set-row"><div class="grow"><b>English subtitles</b><small>Show English captions on trailers that have them, in card previews and the trailer window</small></div><button class="switch" data-pref="subs" aria-label="English subtitles on trailers"></button></div>
      <div class="set-row"><div class="grow"><b>Preview sound</b><small>One setting for every preview. The volume slider lives in the header</small></div><button class="switch" data-pref="sound" aria-label="Preview sound"></button></div>
      <div class="set-row"><div class="grow"><b>Performance mode</b><small>Turns off motion, blur and trailer autoplay here, and checks Crunchyroll pages less often</small></div><button class="switch" data-setting="liteMode" aria-label="Performance mode"></button></div>
    </div>
    <div class="set-card"><h3>Playback</h3><p>Browse in Crunchilist, watch on Crunchyroll. Episodes always play on Crunchyroll's own site, so your account, quality and subtitles work as normal.</p>
      <div class="set-row"><div class="grow"><b>Open episodes in</b><small>${{ tab: "One Crunchyroll tab that Crunchilist reuses every time you press Play", window: "One pop-out Crunchyroll window with no tabs or address bar, reused every time", new: "A new Crunchyroll tab every time you press Play" }[openIn] || ""}</small></div>
        <div class="seg">${[["tab", "One tab"], ["window", "Pop-out window"], ["new", "New tab"]].map(([v, l]) => `<button class="${openIn === v ? "on" : ""}" data-choice="openIn:${v}">${l}</button>`).join("")}</div></div>
      <div class="set-row"><div class="grow"><b>Multiple tab management</b>
          <small>Keeps Crunchyroll to one tab. If a Crunchyroll page opens in another tab (from a link, a bookmark, or a search result), Crunchilist offers to move it into your Crunchilist-opened Crunchyroll tab and close the extra one. It only touches Crunchyroll tabs, never closes anything without asking${s.tabAuto ? " (or showing Undo)" : ""}, and does nothing when that tab isn't open.</small></div>
        <button class="switch" data-setting="tabManage" aria-label="Multiple tab management"></button></div>
      ${s.tabManage !== false && openIn !== "new" ? `<div class="set-row sub-row"><div class="grow"><b>When an extra Crunchyroll tab opens</b><small>${s.tabAuto ? "Moved into your Crunchyroll tab right away, with an Undo button there" : "That tab shows a small bar asking whether to move it"}</small></div>
        <div class="seg"><button class="${s.tabAuto ? "" : "on"}" data-choice="tabAuto:false">Ask me</button><button class="${s.tabAuto ? "on" : ""}" data-choice="tabAuto:true">Move automatically</button></div></div>` : ""}
      <div class="set-row"><div class="grow"><b>“Back to Crunchilist” on Crunchyroll</b><small>Adds a button at the top of Crunchyroll pages that switches back to this tab instead of opening a new one, and pauses the episode you leave</small></div><button class="switch" data-setting="backButton" aria-label="Back to Crunchilist button"></button></div>
      <div class="set-row"><div class="grow"><b>Open episodes in the mini player</b><small>Floats each episode in Chrome's small always-on-top player, the same as the Always on top switch next to “Back to Crunchilist”. Chrome only allows this after a click on the player, so each episode starts with a “Click anywhere to open the mini player” prompt; when you switch away from the tab, Chrome may also float it on its own</small></div><button class="switch" data-setting="miniPlayer" aria-label="Open episodes in the mini player"></button></div>
      <div class="set-row"><div class="grow"><b>Show tips</b><small>Short pointers, like where the preview volume and theme controls are here, and the “Back to Crunchilist” button when an episode opens. Turning this back on shows them again</small></div><button class="switch" data-setting="showTips" aria-label="Show tips"></button></div>
      <div class="set-row"><div class="grow"><b>Switch between Crunchilist and Crunchyroll</b><small>${shortcut === "" ? "Chrome didn't assign this shortcut, usually because another extension already uses the keys. Pick one in Chrome's extension shortcuts" : "Keyboard shortcut, changeable in Chrome's extension shortcuts"}</small></div>${keys.map((key) => `<kbd class="kbd">${esc(key)}</kbd>`).join("")}<button class="btn ghost" data-act="shortcuts">${shortcut ? "Change" : "Set shortcut"}</button></div>
    </div>
    <div class="set-card set-embed"><h3>Account, search and AI</h3><p>AniList, your Crunchyroll history, taste, AI services, notifications, badges on Crunchyroll, and the catalog.</p>
      <div class="set-row"><div class="grow"><b>AI features</b><small>${aiOn()
        ? "AI ranks Picked for you and the banner, explains each pick with a match score, and re-orders search results for moods and descriptions"
        : "Off: nothing is sent to an AI model. Picked for you, the banner and search still work, ranked by your taste, what you've watched and what's trending"}</small></div><button class="switch" data-setting="useAi" aria-label="AI features"></button></div>
      <div id="settings-embed"></div></div>
    <p class="set-foot"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a><span>Crunchilist ${esc(chrome.runtime.getManifest().version)}</span>${updateHtml()}</p>
    ${update?.available ? `<p class="set-foot set-update">${canSelfUpdate()
      ? `Update now installs it into your Crunchilist folder and restarts Crunchilist. The first time, Chrome asks you to pick that folder: the one shown under Crunchilist on chrome://extensions.${manualUpdate ? " If it can't finish, double-click update.cmd in that folder." : ""} Your list and settings stay.`
      : manualUpdate
        ? "Double-click update.cmd in your Crunchilist folder (the one shown under Crunchilist on chrome://extensions), then come back here. Your list and settings stay."
        : "Download it, unzip it over your Crunchilist folder, then press reload on Crunchilist in chrome://extensions. Your list and settings stay."}</p>` : ""}
  </div>`;
}
let updating = false;
// update.cmd only exists on Windows, and only in copies from 1.0.112 on.
const manualUpdate = /Windows/.test(navigator.userAgent);
// update.cmd changes the folder while this page still runs the old code: restart onto the new version.
async function finishManualUpdate() {
  const onDisk = await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" }).then((response) => response.json()).then((json) => json.version).catch(() => "");
  const { crDiskReload } = await chrome.storage.local.get("crDiskReload");
  if (updating || !reloadForDisk(chrome.runtime.getManifest().version, onDisk, crDiskReload)) return;
  await chrome.storage.local.set({ crDiskReload: onDisk, crReopenApp: true });
  toast(`Version ${onDisk} is installed. Restarting Crunchilist…`);
  setTimeout(() => chrome.runtime.reload(), 900);
}
function updateHtml() {
  if (!update || update.managed) return "";
  if (update.available) {
    const { version, download, page } = update.latest;
    const link = `<a href="${esc(download || page)}" target="_blank" rel="noopener">${canSelfUpdate() ? "Download instead" : `Get version ${esc(version)}`}</a>`;
    const button = canSelfUpdate() ? `<button type="button" data-act="install-update" ${updating ? "disabled" : ""}>${updating ? "Updating…" : `Update now to ${esc(version)}`}</button>` : "";
    return `${button}${link}${download ? `<a href="${esc(page)}" target="_blank" rel="noopener">What's new</a>` : ""}`;
  }
  const note = update.error ? "Couldn't check for updates" : update.checkedAt ? "Up to date" : "";
  return `${note ? `<span>${note}</span>` : ""}<button type="button" data-act="check-update">Check for updates</button>`;
}
async function checkUpdate(force = false) {
  const reply = await send("updateStatus", { force });
  if (!reply?.ok) return force ? toast("Couldn't check for updates") : undefined;
  update = reply.update;
  if (document.body.dataset.page === "settings") rerender(true);
  if (update.announce) {
    toast(`Crunchilist ${update.latest.version} is out. Update it from Settings`);
    send("updateAnnounced", { version: update.latest.version });
  } else if (force) {
    toast(update.available ? `Version ${update.latest.version} is ready in Settings` : update.error ? "Couldn't reach GitHub. Try again later" : "You have the newest version");
  }
}
// Runs straight from the click so Chrome allows its folder prompt.
async function runUpdate() {
  if (updating || !update?.latest) return;
  updating = true;
  const paint = () => { if (document.body.dataset.page === "settings") rerender(true); };
  paint();
  try {
    const { version } = await installUpdate(update.latest, toast);
    toast(`Version ${version} installed. Restarting Crunchilist…`);
    await chrome.storage.local.set({ crReopenApp: true });
    setTimeout(() => chrome.runtime.reload(), 900);
  } catch (error) {
    toast(error?.message || `The update didn't finish. Try again, ${manualUpdate ? "run update.cmd in your Crunchilist folder, " : ""}or use Download instead`);
    updating = false;
    paint();
  }
}
function mountSettings() {
  ensureSettings();
  document.querySelector("#settings-embed")?.append(settingsEmbed.wrap);
}
async function setSettings(patch) {
  const reply = await send("setSettings", { patch });
  if (!reply?.ok) return toast(reply?.error || "Couldn't save that setting");
  applyView(reply.view);
  rerender(true);
}

// Accounts: the AniList name and avatar, the catalog, and the history import.
function account() {
  const s = settings();
  const name = s.anilistConnected || s.anilistExpired ? s.anilistViewerName || "" : view?.importMeta?.username || "";
  return {
    name,
    connected: Boolean(s.anilistConnected && s.anilistViewerName),
    expired: Boolean(s.anilistExpired),
    avatar: name && view?.importMeta?.username === name ? view.importMeta.avatar || "" : "",
  };
}
function avatarHtml(size = "") {
  const { name, avatar } = account();
  return avatar ? `<img class="avatar ${size}" src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar ${size}">${esc((name || "?")[0].toUpperCase())}</span>`;
}
function ago(time) {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
let catalogNote = "";
let catalogPoll = 0;
let historyWaiting = false;
function accountRows() {
  const user = account();
  const sync = view?.sync || {};
  const onCr = SHOWS.filter(onCrunchyroll).length;
  const catalog = catalogNote || (onCr ? `${onCr.toLocaleString()} shows · refreshed ${view?.catalogUpdatedAt ? ago(view.catalogUpdatedAt) : "recently"}` : "Open Crunchyroll while signed in to load the catalog");
  const waiting = sync.waiting ? ` · ${sync.waiting === 1 ? "1 change" : `${sync.waiting} changes`} waiting` : "";
  const anilist = user.connected ? `Connected as ${esc(user.name)}${waiting || " · all changes synced"}`
    : user.expired ? `Sign-in for ${esc(user.name)} expired. Reconnect to keep syncing`
    : user.name ? `Imported ${esc(user.name)}'s public list. Connect to sync changes back`
    : "Not connected. Connect to import your list and sync progress";
  const history = historyWaiting ? "Your Crunchyroll history is ready to review"
    : view?.historyImport?.at ? `Added ${view.historyImport.shows === 1 ? "1 show" : `${view.historyImport.shows} shows`} ${ago(view.historyImport.at)}`
    : "Add the shows you've watched on Crunchyroll to AniList";
  return `<div class="set-row"><div class="avatar cr">CR</div><div class="grow"><b>Crunchyroll</b><small>${esc(catalog)}</small></div><button class="btn sm" data-act="refresh-catalog" ${catalogPoll ? "disabled" : ""}>${catalogPoll ? "Refreshing…" : "Refresh catalog"}</button></div>
      <div class="set-row">${user.avatar ? `<img class="avatar" src="${esc(user.avatar)}" alt="" referrerpolicy="no-referrer">` : `<div class="avatar">AL</div>`}<div class="grow"><b>AniList</b><small>${anilist}</small></div>${user.connected
        ? `${sync.waiting && !sync.sending ? `<button class="btn sm" data-act="sync-now">Retry</button>` : ""}<button class="btn sm ghost" data-act="anilist-refresh">Refresh</button>`
        : `<button class="btn sm accent" data-act="anilist-connect">${user.expired ? "Reconnect" : "Connect"}</button>`}</div>
      ${user.connected ? `<div class="set-row">${icon("history")}<div class="grow"><b>Import Crunchyroll history</b><small>${esc(history)}</small></div><button class="btn sm ${historyWaiting ? "accent" : ""}" data-act="history">${historyWaiting ? "Review" : view?.historyImport?.at ? "Import again" : "Import"}</button></div>` : ""}`;
}
function profilePop() {
  const user = account();
  return `<div class="profile-head">${avatarHtml("lg")}<div><b>${esc(user.name || "Not signed in")}</b><small>${user.connected ? "AniList account" : user.name ? "AniList (not connected)" : "Connect AniList to sync"}</small></div></div>
    <div class="profile-quick"><h4>Search</h4>
      <div class="set-row"><div class="grow"><b>AI features</b><small>${aiOn() ? "AI ranks picks and search, and says why" : "Off: ranking uses your taste and what's trending"}</small></div><button class="switch" data-setting="useAi" aria-label="AI features"></button></div>
      <div class="set-row"><div class="grow"><b>Taste</b><small>Genres, tags and audio you prefer</small></div><button class="btn sm ghost" data-act="taste" aria-haspopup="dialog">${icon("sliders")} Edit</button></div></div>
    <h4>Accounts</h4>${accountRows()}<a href="#settings">All settings →</a>`;
}
function paintAccount() {
  const button = document.querySelector(".profile-btn");
  if (button) { button.innerHTML = avatarHtml(); button.title = account().name ? `${account().name} · Accounts` : "Accounts"; }
  const pop = document.querySelector("#profile-pop");
  if (!pop) return;
  pop.innerHTML = profilePop();
  pop.querySelectorAll("[data-setting]").forEach((el) => el.classList.toggle("on", settingOn(el.dataset.setting)));
}
async function checkHistory() {
  if (!settings().anilistConnected) return;
  const job = await send("historyProgress");
  historyWaiting = Boolean(job?.ok && (job.waiting || job.running));
  paintAccount();
}
async function refreshCatalog() {
  clearInterval(catalogPoll);
  catalogNote = "Updating the catalog…";
  const reply = await send("refreshCatalogCovers");
  if (!reply?.ok || !reply.running) {
    catalogNote = reply?.ok ? reply.note || "Catalog is up to date" : reply?.error || "Couldn't update the catalog";
    paintAccount();
    setTimeout(() => { catalogNote = ""; paintAccount(); }, 6000);
    return;
  }
  catalogPoll = setInterval(async () => {
    const progress = await send("catalogProgress");
    if (!progress?.ok || !progress.running) {
      clearInterval(catalogPoll);
      catalogPoll = 0;
      catalogNote = !progress?.ok ? "" : reply.titlesOwed ? "AniList details updated. Titles refresh next time you open Crunchyroll" : "Catalog is up to date";
      paintAccount();
      setTimeout(() => { catalogNote = ""; paintAccount(); }, 6000);
      return;
    }
    catalogNote = `${progress.note || reply.note || "Updating the catalog…"}${progress.progress ? ` ${Math.round(progress.progress * 100)}%` : ""}`;
    paintAccount();
  }, 800);
  paintAccount();
}
async function accountAction(type, done) {
  const reply = await send(type);
  if (!reply?.ok) return toast(reply?.error || "Something went wrong");
  if (reply.view) applyView(reply.view);
  if (done) toast(typeof done === "function" ? done(reply) : done);
}

// Notifications: episode updates waiting for an answer, plus new seasons of shows you finished.
const DISMISSED_KEY = "cl-dismissed";
const dismissed = new Set(Object.keys(readJson(DISMISSED_KEY)));
function notes() {
  const asks = (view?.notices || []).map((row) => ({
    id: row.id,
    real: true,
    show: SHOWS.find((show) => show.title === row.title),
    cover: row.cover,
    title: row.title,
    text: row.message,
    time: row.createdAt,
    unread: row.kind === "ask",
    acts: [row.action ? ["update", row.action] : null, ["ignore", row.kind === "ask" ? "Ignore" : "Dismiss"]].filter(Boolean),
  }));
  const seasons = SHOWS.filter(nextSeason).map((show) => {
    const next = nextSeason(show);
    return { id: `season:${show.id}:${next.anilistId || next.label}`, show, cover: next.cover || show.cover, title: show.title, text: `${next.label} is out. You finished the last one`, unread: true, acts: [["open", next.format === "MOVIE" ? "See it" : "Start it"], ["dismiss", "Dismiss"]] };
  }).filter((note) => !dismissed.has(note.id)).slice(0, 8);
  return [...asks, ...seasons];
}
function drawerList() {
  const list = notes();
  if (!list.length) return `<div class="drawer-empty"><b>You're all caught up</b><p class="muted">Finished episodes you skip updating, and new seasons of shows you finished, show up here.</p></div>`;
  return list.map((n) => `<div class="note ${n.unread ? "unread" : ""}" data-note="${esc(n.id)}"${n.show ? ` data-show="${esc(n.show.id)}"` : ""}>${n.cover ? `<img src="${esc(n.cover)}" alt="" referrerpolicy="no-referrer">` : '<span class="ph"></span>'}<div><b>${esc(n.title)}</b><p>${esc(n.text)}${n.time ? ` <span class="note-time">· ${ago(n.time)}</span>` : ""}</p>
    <div class="acts">${n.acts.map(([act, label], i) => `<button class="btn sm ${i ? "ghost" : "accent"}" data-note-act="${act}">${esc(label)}</button>`).join("")}</div></div></div>`).join("");
}
function drawer() {
  return `<div class="scrim" data-act="close-drawer"></div>
  <aside class="drawer" aria-label="Notifications"><div class="drawer-head"><h3>Notifications</h3><button class="btn sm ghost" data-act="notes-update" hidden>Update all</button><button class="btn sm ghost" data-act="notes-clear" hidden>Clear all</button><button class="nav-btn" data-act="close-drawer" aria-label="Close notifications">${icon("close")}</button></div>
    <div class="drawer-list"></div></aside>`;
}
function paintDrawer() {
  const list = document.querySelector(".drawer-list");
  if (list) list.innerHTML = drawerList();
  const all = notes();
  const unread = all.filter((n) => n.unread).length;
  const dot = document.querySelector('[data-act="drawer"] .dot');
  if (dot) { dot.textContent = unread > 99 ? "99+" : String(unread); dot.hidden = !unread; }
  const updateAll = document.querySelector('[data-act="notes-update"]');
  if (updateAll) updateAll.hidden = !(view?.notices || []).some((row) => row.kind === "ask");
  const clearAll = document.querySelector('[data-act="notes-clear"]');
  if (clearAll) clearAll.hidden = !all.length;
}
async function noteAction(id, act, button) {
  const note = notes().find((n) => n.id === id);
  if (!note) return;
  if (act === "open") { document.body.classList.remove("drawer-open"); location.hash = `show/${note.show.id}/${(library[note.show.id]?.at ?? 0) + 2}`; return; }
  if (act === "dismiss") {
    dismissed.add(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Object.fromEntries([...dismissed].map((key) => [key, 1]))));
    return paintDrawer();
  }
  if (button) button.disabled = true;
  const reply = await send("resolveNotice", { id, action: act });
  if (!reply?.ok) { if (button) button.disabled = false; return toast(reply?.error || "Something went wrong"); }
  if (reply.syncNote && !/^Marked episode/.test(reply.syncNote)) toast(reply.syncNote);
  applyView(reply.view);
}
async function resolveAll(action) {
  const asks = (view?.notices || []).length;
  if (action === "ignore") {
    for (const note of notes()) if (!note.real) dismissed.add(note.id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Object.fromEntries([...dismissed].map((key) => [key, 1]))));
  }
  if (!asks) return paintDrawer();
  const reply = await send("resolveAllNotices", { action });
  if (!reply?.ok) return toast(reply?.error || "Something went wrong");
  if (reply.syncNote) toast(reply.syncNote);
  applyView(reply.view);
}

// "by Phoniix" under the wordmark.
function nav() {
  return `<nav class="nav">
    <a class="brand" href="#"><img class="brand-logo" src="../icons/crunchilist-logo.svg" alt=""><span class="brand-word">Crunchilist<small>by Phoniix</small></span></a>
    <a class="nav-link" data-route="home" href="#">${icon("home")}<span>Home</span></a>
    <a class="nav-link" data-route="browse" href="#browse">${icon("compass")}<span>Browse</span></a>
    <a class="nav-link" data-route="airing" href="#airing">${icon("calendar")}<span>Airing</span></a>
    <a class="nav-link" data-route="list" href="#list">${icon("list")}<span>My list</span></a>
    <span class="nav-spacer"></span>
    <div class="kbar-group">
      <div class="kbar" data-act="kpal" role="button" tabindex="0" aria-label="Search">${icon("search")}<span class="kbar-text">Search titles or describe a vibe…</span><kbd>Ctrl K</kbd></div>
      <button class="kbar-ai" data-act="ai-toggle" aria-pressed="true" title="AI features are on. Click to turn them off">${icon("sparkle")}<span>AI</span><i></i></button>
      <button class="kbar-ai kbar-taste" data-act="taste" title="Your taste: genres, tags and audio" aria-haspopup="dialog" aria-expanded="false">${icon("sliders")}<span>Taste</span></button>
    </div>
    <button class="nav-btn nav-search" data-act="kpal" aria-label="Search">${icon("search")}</button>
    <div class="vol">${soundButton("nav-btn")}<input class="vol-range" type="range" min="0" max="100" step="1" value="${soundOn() ? prefs.volume : 0}" style="--v:${soundOn() ? prefs.volume : 0}%" aria-label="Preview volume"></div>
    <button class="nav-btn" data-act="theme" title="Theme" aria-label="Theme">${icon("palette")}</button>
    <button class="nav-btn" data-act="drawer" title="Notifications" aria-label="Notifications">${icon("bell")}<span class="dot" hidden></span></button>
    <a class="nav-btn" data-route="settings" href="#settings" title="Settings" aria-label="Settings">${icon("gear")}</a>
    <button class="nav-btn profile-btn" data-act="profile" aria-haspopup="dialog" title="Accounts">${avatarHtml()}</button>
  </nav>`;
}
function wheelControls() {
  return `<div class="wheel-wrap">
    <div class="wheel" data-wheel title="Pick a color"><span class="wheel-shade"></span><i class="wheel-knob" data-pick></i></div>
    <div class="wheel-side">
      <label class="wheel-label">Brightness<input class="wheel-v" type="range" min="20" max="100"></label>
      <label class="wheel-label">Hex<span class="wheel-hex-row"><i class="wheel-chip" data-pick></i><input class="wheel-hex" maxlength="7" spellcheck="false" autocomplete="off"></span></label>
    </div>
  </div>`;
}
function themePop() {
  return `<div class="pop" id="theme-pop"><h4>Theme</h4>
    <div class="swatches">${PALETTES.map((p) => `<button class="swatch" title="${p.name}" data-set-palette="${p.id}" style="background:linear-gradient(135deg,${p.colors[0]},${p.colors[1]})"></button>`).join("")}<button class="swatch swatch-custom" title="Custom color" data-set-palette="custom" data-pick></button></div>
    <div class="pop-wheel">${wheelControls()}</div>
    <h4>Mode</h4><div class="seg"><button data-set-mode="light">Light</button><button data-set-mode="dark">Dark</button><button data-set-mode="system">Auto</button></div>
    <a href="#settings">More appearance settings →</a></div>`;
}

// First-visit tips, one at a time. Each fades after a few seconds; "Don't show again" turns off the shared Show tips setting.
const TIPS = [
  { target: ".nav .vol", anchor: '.nav .vol [data-act="sound"]', focus: true, title: "Preview volume", text: "Trailers play when you rest on a title. Hover here to set how loud they are, or click the speaker to mute them." },
  { target: '.nav [data-act="theme"]', title: "Change the look", text: "Pick a color theme or your own custom color, and switch between light and dark mode." },
  { target: ".nav .kbar", title: "Search anything", text: "Press Ctrl K from any page to jump to a title, or describe a mood. The AI switch next to it turns AI ranking on or off everywhere." },
];
const TIPS_SEEN = "cl-tips";
let tipTimer = 0;
let tipIndex = 0;
function clearTipTargets() {
  document.querySelectorAll(".tip-target").forEach((el) => el.classList.remove("tip-target", "tip-focus"));
}
function fadeTip(then) {
  clearTimeout(tipTimer);
  clearTipTargets();
  const tip = document.querySelector(".tip");
  if (!tip) return then?.();
  tip.classList.remove("show");
  setTimeout(() => { tip.remove(); then?.(); }, 400);
}
function armTip(index, ms) {
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => fadeTip(() => showTip(index + 1)), ms);
}
function showTip(index) {
  const step = TIPS[index];
  const target = step && document.querySelector(step.target);
  if (!step || settings().showTips === false) return localStorage.setItem(TIPS_SEEN, "1");
  if (!target?.getClientRects().length) return showTip(index + 1);
  tipIndex = index;
  target.classList.add("tip-target");
  if (step.focus) target.classList.add("tip-focus");
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.setAttribute("role", "status");
  tip.innerHTML = `<b>${step.title}</b><p>${step.text}</p>
    <div class="tip-foot"><label><input type="checkbox" data-tip-off>Don't show again</label><span class="tip-step">${index + 1} of ${TIPS.length}</span><button class="tip-next" data-tip-next="${index + 1}">${index + 1 < TIPS.length ? "Next" : "Got it"}</button></div>`;
  tip.addEventListener("pointerenter", () => clearTimeout(tipTimer));
  tip.addEventListener("pointerleave", () => armTip(index, 3000));
  document.body.append(tip);
  // The volume slider slides open first, which moves the speaker button the arrow points at.
  setTimeout(() => {
    const r = document.querySelector(step.anchor || step.target).getBoundingClientRect();
    const center = r.left + r.width / 2;
    const left = clamp(center - 36, 12, innerWidth - tip.offsetWidth - 12);
    tip.style.top = `${r.bottom + 14}px`;
    tip.style.left = `${left}px`;
    tip.style.setProperty("--arrow", `${center - left - 7}px`);
    tip.classList.add("show");
    armTip(index, 9000);
  }, step.focus ? 280 : 30);
}
let tipsStarted = false;
function startTips() {
  if (tipsStarted || !SHOWS.length || settings().showTips === false || localStorage.getItem(TIPS_SEEN) === "1" || document.body.dataset.page !== "home" || document.querySelector(".tip")) return;
  tipsStarted = true;
  showTip(0);
}

// Trailer previews
let hoverTimer = 0;
let playing = null;
const ytUrl = (id, muted, subs = prefs.subs) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${encodeURIComponent(id)}&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&${subs ? "cc_load_policy=1&cc_lang_pref=en&hl=en" : "cc_load_policy=0"}&disablekb=1&fs=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;

// One global sound setting for every preview: muted or not, plus a volume.
const soundOn = () => prefs.sound && prefs.volume > 0;
// Chrome lets the extension page play sound right after a reload, but where its autoplay rules are stricter
// it pauses a video that unmutes before the first click or key press. That pause flips autoplayBlocked,
// and from then on trailers stay muted until the page has had an interaction.
let autoplayBlocked = false;
const activated = () => navigator.userActivation?.hasBeenActive ?? true;
const canUnmute = () => !hushed && (!autoplayBlocked || activated());
// Previews go quiet while Crunchyroll is open (Play, the switch shortcut, or another window taking focus),
// without touching the saved sound setting, and speak again when this page is back in front.
let hushed = false;
function hush(on) {
  if (hushed === on) return;
  hushed = on;
  for (const p of players) p.applySound();
}
const soundIcon = () => icon(!soundOn() ? "muted" : prefs.volume < 50 ? "soundLow" : "sound");
const soundButton = (cls) => `<button class="${cls}" data-act="sound" title="${soundOn() ? "Mute previews" : "Unmute previews"}" aria-label="${soundOn() ? "Mute previews" : "Unmute previews"}">${soundIcon()}</button>`;
function applySound() {
  const level = soundOn() ? prefs.volume : 0;
  for (const p of players) p.applySound();
  document.querySelectorAll('[data-act="sound"]').forEach((el) => { el.innerHTML = soundIcon(); el.title = soundOn() ? "Mute previews" : "Unmute previews"; });
  document.querySelectorAll(".vol-range").forEach((el) => { el.value = level; el.style.setProperty("--v", `${level}%`); });
  document.querySelectorAll('[data-pref="sound"]').forEach((el) => el.classList.toggle("on", prefs.sound));
  savePrefs();
}
function toggleSound() {
  if (soundOn()) prefs.sound = false;
  else { prefs.sound = true; if (!prefs.volume) prefs.volume = 60; }
  applySound();
}

// Muted YouTube embed that stays invisible until frames are actually playing, and hides
// again just before the end, so YouTube's title bar, spinner and end screen never show.
// YouTube's overlays are fixed pixel sizes, so small previews render the frame oversized and scale it down.
const players = new Set();
function onPlayerMessage(event) {
  if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(event.origin)) return;
  const player = [...players].find((p) => p.frame.contentWindow === event.source);
  if (!player) return;
  let message;
  try { message = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
  const info = message?.info || {};
  if (Array.isArray(info.captions?.tracklist)) player.pickTrack(info.captions.tracklist);
  if (info.playerState === 1 && player.paused) player.post({ event: "command", func: "pauseVideo", args: [] });
  if (info.playerState === 2 && !player.paused && player.unmutedEarly) {
    autoplayBlocked = true;
    player.unmutedEarly = false;
    player.post({ event: "command", func: "mute", args: [] });
    player.post({ event: "command", func: "playVideo", args: [] });
  }
  if (typeof info.playerState === "number") {
    if (info.playerState === 1 && player.state !== 1) { player.applySubs(); player.applySound(); }
    player.state = info.playerState;
  }
  if (typeof info.currentTime === "number") player.time = info.currentTime;
  if (typeof info.duration === "number" && info.duration) player.duration = info.duration;
  const nearEnd = player.duration && player.duration - player.time < 1.2;
  player.box.classList.toggle("live", player.state === 1 && !player.paused && player.time > 0.6 && !nearEnd);
}
// Always starts muted so autoplay is never blocked, then picks up the global sound setting once playing.
function player(box, id) {
  const frame = document.createElement("iframe");
  frame.allow = "autoplay; encrypted-media";
  frame.tabIndex = -1;
  // The banner frames its video to fill the screen, which puts captions out of view, so it never shows them.
  const wantSubs = () => prefs.subs && !box.classList.contains("hero-video");
  frame.src = ytUrl(id, true, wantSubs());
  const post = (message) => frame.contentWindow?.postMessage(JSON.stringify({ ...message, id: 1, channel: "widget" }), "https://www.youtube-nocookie.com");
  const applySound = () => {
    const loud = soundOn() && canUnmute();
    record.unmutedEarly = loud && !activated();
    post({ event: "command", func: "setVolume", args: [prefs.volume] });
    post({ event: "command", func: loud ? "unMute" : "mute", args: [] });
  };
  // Trailers without an English track stay plain: YouTube only shows a track the video has.
  const applySubs = () => {
    if (!wantSubs()) return post({ event: "command", func: "unloadModule", args: ["captions"] });
    post({ event: "command", func: "loadModule", args: ["captions"] });
    post({ event: "command", func: "setOption", args: ["captions", "track", { languageCode: "en" }] });
    // Card previews are drawn small, so their captions are made larger to stay readable.
    if (box.classList.contains("pv")) post({ event: "command", func: "setOption", args: ["captions", "fontSize", 3] });
  };
  const pickTrack = (tracks) => {
    const track = wantSubs() && !record.translated ? translatedTrack(tracks) : null;
    if (!track) return;
    record.translated = true;
    post({ event: "command", func: "setOption", args: ["captions", "track", track] });
  };
  const record = { frame, box, post, applySound, applySubs, pickTrack, state: -1, time: 0, duration: 0 };
  frame.addEventListener("load", () => {
    post({ event: "listening" });
    post({ event: "command", func: "addEventListener", args: ["onStateChange"] });
  });
  players.add(record);
  box.classList.remove("live");
  box.replaceChildren(frame);
  return {
    pause: () => { record.paused = true; post({ event: "command", func: "pauseVideo", args: [] }); },
    play: () => { record.paused = false; post({ event: "command", func: "playVideo", args: [] }); },
    // fade: ms to keep the muted frame while the box fades out, so a slide change dissolves instead of cutting.
    destroy: ({ fade = 0 } = {}) => {
      players.delete(record);
      box.classList.remove("live");
      if (!fade || !frame.isConnected) return box.replaceChildren();
      post({ event: "command", func: "mute", args: [] });
      setTimeout(() => frame.remove(), fade + 100);
    },
  };
}

// Only one trailer plays at a time: Home listens for this to pause its banner video.
const previewActive = () => Boolean(playing || document.querySelector(".trailer-modal"));
const announcePreview = () => document.dispatchEvent(new CustomEvent("previewchange", { detail: { active: previewActive() } }));
function stopPreview() {
  clearTimeout(hoverTimer);
  if (!playing) return;
  playing.player?.destroy(); playing.classList.remove("previewing"); playing = null;
  announcePreview();
}
function startPreview(cardEl) {
  const show = byId.get(cardEl.dataset.show);
  if (!prefs.previews || lite() || !show?.trailer) return;
  hoverTimer = setTimeout(() => {
    stopPreview();
    playing = cardEl;
    cardEl.classList.add("previewing");
    cardEl.player = player(cardEl.querySelector(".pv"), show.trailer);
    announcePreview();
  }, 900);
}
function openTrailer(id) {
  stopPreview();
  const show = byId.get(id);
  if (!show?.trailer) return;
  const modal = document.createElement("div");
  modal.className = "trailer-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-label", `${show.title} trailer`);
  modal.innerHTML = `<div class="trailer-box"><iframe src="${esc(ytUrl(show.trailer, false).replace("controls=0", "controls=1"))}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe><button class="nav-btn" data-act="close-trailer" aria-label="Close trailer">${icon("close")}</button></div>`;
  document.body.append(modal);
  announcePreview();
}

// Which season and episode Play should open: the next unwatched episode of the season in view, or of the show.
function playTarget(show, seasonArg, episodeArg) {
  const seasons = seasonsOf(show);
  const item = entry(show);
  const next = nextSeason(show);
  let index = seasonArg ?? (next ? seasons.indexOf(next) : item?.index ?? 0);
  index = Math.min(Math.max(0, index), seasons.length - 1);
  const state = seasonState(show, index);
  const total = seasons[index].episodes || Infinity;
  const episode = episodeArg || (state?.status === "watching" ? Math.min(state.progress + 1, total) : 1);
  const season = seasons[index];
  const multi = seasons.length > 1;
  const label = season.format === "MOVIE" ? season.label : `${multi ? `${season.label} · ` : ""}Episode ${episode}`;
  return { index, season, episode, label, multi };
}
function playLabel(show, seasonArg) {
  if (!onCrunchyroll(show)) return "Where to watch";
  const target = playTarget(show, seasonArg);
  const started = seasonState(show, target.index)?.status === "watching";
  return target.season.format === "MOVIE" ? `Watch ${target.season.label.toLowerCase()}` : `${started ? "Continue" : "Watch"} ${target.multi ? `${target.season.label.toLowerCase()} · ` : ""}episode ${target.episode}`;
}
async function play(show, seasonArg, episodeArg) {
  if (!onCrunchyroll(show)) {
    location.hash = `show/${show.id}`;
    return toast(`${show.title} isn't on Crunchyroll${show.streaming?.length ? `. It streams on ${show.streaming.map((link) => link.site).join(", ")}` : ""}`);
  }
  stopPreview();
  hush(true);
  setTimeout(() => { if (document.hasFocus() && !document.hidden) hush(false); }, 2000);
  const target = playTarget(show, seasonArg, episodeArg);
  const reply = await data.play(playRequest(show, target.index, target.episode));
  if (reply?.ok) {
    const where = reply.mode === "window" ? "your Crunchyroll window" : reply.mode === "new" ? "a new Crunchyroll tab" : "your Crunchyroll tab";
    return toast(reply.waiting ? `Opening Crunchyroll. It jumps to ${target.label.toLowerCase()} as soon as the page loads` : reply.exact ? `Playing ${target.label.toLowerCase()} in ${where}` : `Couldn't find ${target.label.toLowerCase()}, so this opened the show page`);
  }
  hush(false);
  toast(reply?.error || "Couldn't open Crunchyroll");
}

// Continue watching cards go straight to the next episode; every other card opens the show page.
function openCard(el, show) {
  if (el.matches(".wide") && onCrunchyroll(show)) return play(show);
  location.hash = `show/${show.id}`;
}

// Lets the background look up the episodes the banner and Continue watching would open, so Play skips the show page.
function warmPlay() {
  const shows = [...inStatus("watching").slice(0, 10), ...shownBanner().map((row) => byId.get(row.id))];
  const seen = new Set();
  const requests = [];
  for (const show of shows) {
    if (!show || seen.has(show.id) || !onCrunchyroll(show)) continue;
    seen.add(show.id);
    const target = playTarget(show);
    const { seriesId, season, episode } = playRequest(show, target.index, target.episode);
    requests.push({ seriesId, season, episode });
  }
  const key = JSON.stringify(requests);
  if (!requests.length || key === warmPlay.last) return;
  warmPlay.last = key;
  data.warm(requests);
}

function toast(text) {
  const el = document.querySelector(".toast");
  if (!el || !text) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), Math.min(6000, 1800 + text.length * 30));
}

// Library writes: the page updates at once, then the background saves and syncs and sends back the real state.
function seasonName(show, index) {
  return seasonsOf(show).length > 1 ? ` ${seasonsOf(show)[index].label}` : "";
}
async function saveSeasons(show, changes, note) {
  library = applySeasonChanges(library, show.id, changes);
  if (note) toast(note);
  rerender();
  writes += 1;
  const reply = await data.saveSeasons(show.id, changes);
  writes -= 1;
  if (!reply?.ok) {
    toast(reply?.error || "Couldn't save that change");
    return reload();
  }
  const before = JSON.stringify(library);
  if (!writes) library = reply.library || library;
  applyView(reply.view);
  if (reply.syncNote && /not updated|expired|reconnect/i.test(reply.syncNote)) toast(reply.syncNote);
  if (JSON.stringify(library) !== before) rerender();
}
function setStatus(show, index, status) {
  const seasons = seasonsOf(show);
  const season = seasons[index];
  const changes = [];
  if (status === "finished") {
    for (let i = 0; i < index; i++) {
      if (!seasonState(show, i) && seasons[i].format !== "MOVIE" && released(seasons[i])) changes.push({ index: i, status: "finished", progress: seasonEps(seasons[i]) });
    }
  }
  changes.push({ index, status, progress: status === "finished" ? seasonEps(season) : seasonState(show, index)?.progress || 0 });
  return saveSeasons(show, changes, `${show.title}${seasonName(show, index)} → ${STATUS[status]}`);
}
function markThrough(show, index, n) {
  const season = seasonsOf(show)[index];
  const done = n >= (season.episodes || Infinity);
  const next = seasonsOf(show)[index + 1];
  return saveSeasons(show, [{ index, status: done ? "finished" : "watching", progress: n }],
    done && next && released(next) ? `${season.label} done. ${next.label} is next` : `Watched through episode ${n}`);
}
function toggleList(show) {
  const record = library[show.id];
  if (record) return saveSeasons(show, Object.keys(record.s).map((index) => ({ index: Number(index), status: null })), `Removed ${show.title}`);
  return saveSeasons(show, [{ index: 0, status: "plan", progress: 0 }], `Added ${show.title} to Plan to watch`);
}

function loadingPage() {
  return `<div class="loading"><span class="spinner"></span><p class="muted">Loading your catalog…</p></div>`;
}
function emptyHome() {
  return `<section class="welcome">
    <img src="../icons/crunchilist-logo.svg" alt="">
    <h1 class="page-title">Your catalog is on its way</h1>
    <p class="page-sub">Open Crunchyroll in this browser while signed in. Crunchilist reads the catalog from there, then matches each show on AniList for art, trailers and seasons. This page fills in by itself.</p>
    <div class="missing-acts"><a class="btn accent" href="https://www.crunchyroll.com/" target="_blank" rel="noopener">Open Crunchyroll</a><a class="btn ghost" href="#settings">Settings</a></div>
  </section>`;
}

// Router
let home = null;
function route() {
  stopPreview();
  closeBadgeMenu();
  if (!route.keep) fadeTip();
  gridObserver?.disconnect();
  const [path, arg, sub] = location.hash.replace(/^#/, "").split("/");
  const [name, query] = path.split("?");
  const main = document.querySelector("main");
  const decode = (text) => { try { return decodeURIComponent(text); } catch { return text; } };
  const searchQuery = query?.startsWith("q=") ? decode(query.slice(2)) : null;
  const pages = { search: () => pageSearch(searchQuery), list: () => pageList(arg), show: () => pageShow(decode(arg || ""), sub), settings: pageSettings, browse: () => pageBrowse(arg ? decode(arg) : route.keep ? undefined : ""), airing: pageAiring };
  const page = pages[name] ? name : "home";
  document.body.dataset.page = page;
  const needsShows = page !== "settings" && page !== "search";
  main.innerHTML = !loaded && needsShows ? loadingPage()
    : !SHOWS.length && needsShows ? emptyHome()
    : page === "home" ? home.render(api) : pages[page]();
  document.querySelectorAll("[data-route]").forEach((el) => el.classList.toggle("on", el.dataset.route === page));
  if (page === "search") mountSearch(searchQuery);
  if (page === "home") { loadHomeRows(); setTimeout(warmPlay, 1500); }
  if (page === "settings") mountSettings();
  if (page === "browse") paintBrowse();
  if (page === "list" && listView === "grid") {
    const target = main.querySelector("#list-grid");
    if (target) mountGrid(target, inStatus(listTab));
  }
  const strip = main.querySelector(".seasons");
  const on = strip?.querySelector(".season.on");
  if (on) strip.scrollLeft = on.offsetLeft - strip.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2;
  home.after(SHOWS.length ? page : "", api);
  applyTheme();
  const where = `${name}/${arg}`;
  if (!route.keep && where !== route.last) window.scrollTo({ top: 0 });
  route.keep = false;
  route.last = where;
}
const rerender = (force = false) => {
  // Typing in an embedded view shouldn't be interrupted by a background update.
  const page = document.body.dataset.page;
  if (!force && (page === "search" || page === "settings")) {
    if (page === "search") paintSide();
    return paintChrome();
  }
  route.keep = true;
  route();
};
function paintChrome() {
  paintAccount();
  paintDrawer();
  paintAiToggle();
  applyTheme();
}
function paintAiToggle() {
  const button = document.querySelector('.kbar-ai[data-act="ai-toggle"]');
  if (!button) return;
  const on = aiOn();
  button.classList.toggle("on", on);
  button.setAttribute("aria-pressed", String(on));
  button.title = on ? "AI features are on. Click to turn them off" : "AI features are off. Click to turn them on";
}
let aiWasOn = null;
async function toggleAi() {
  const on = !aiOn();
  await setSettings({ useAi: on });
  toast(on ? "AI features on" : "AI features off. Ranking uses your taste and what's trending");
}
// Runs on every view update, so the search page's own AI button and the Crunchyroll panel stay in step too.
function syncAi() {
  const on = aiOn();
  if (aiWasOn === null || aiWasOn === on) { aiWasOn = on; return; }
  aiWasOn = on;
  Object.assign(banner, { rows: null, prev: null, seen: new Set() });
  if (on) { forYou.tried = false; autoRank(); }
  homeGen.checkedAt = 0;
  if (document.body.dataset.page === "home") { paintAi(); loadHomeRows(); }
  if (document.body.dataset.page === "search") loadInspired();
}

let badgeLook = "";
function applyView(next) {
  if (!next) return;
  view = next;
  searchView?.setView(view);
  settingsView?.setView(view);
  tastePop?.sync();
  paintChrome();
  syncAi();
  const look = JSON.stringify(badgeOptions(settings()));
  const restyle = badgeLook && look !== badgeLook;
  badgeLook = look;
  if (restyle) rerender();
}
// After the taste popup closes with changes: For you is fetched again and the banner re-blends.
function tasteChanged() {
  Object.assign(forYou, { loaded: false, picks: null, ranked: null, prev: null, seen: new Set(), tried: false });
  Object.assign(banner, { rows: null, prev: null, seen: new Set() });
  toast("Taste saved. Picked for you and the banner are updated");
  loadForYou();
}
function setShows(list) {
  SHOWS = Array.isArray(list) ? list : [];
  byId = new Map(SHOWS.map((show) => [show.id, show]));
  memo = {};
}
async function reload({ first = false } = {}) {
  const reply = await data.load();
  if (!reply?.ok) {
    if (first) document.querySelector("main").innerHTML = `<div class="loading"><h1 class="page-title">Crunchilist couldn't load</h1><p class="page-sub">${esc(reply?.error || "The extension didn't answer.")}</p><button class="btn accent" data-act="reload">Try again</button></div>`;
    return;
  }
  const hadShows = SHOWS.length > 0;
  const before = JSON.stringify(library);
  setShows(reply.shows);
  if (!writes) library = reply.library || {};
  loaded = true;
  applyView(reply.view);
  if (first || (!hadShows && SHOWS.length)) {
    route.keep = !first;
    route();
    loadForYou();
    return;
  }
  if (!forYou.loaded) loadForYou();
  if (JSON.stringify(library) !== before) rerender();
}

function bind() {
  matchMedia(SIDE_QUERY).addEventListener("change", () => loadInspired());
  document.addEventListener("click", (event) => {
    const statusEl = event.target.closest("[data-status-badge]");
    if (statusEl) { event.preventDefault(); return toggleStatusMenu(statusEl); }
    const recentEl = event.target.closest("[data-recent]");
    if (recentEl) { location.hash = `search?q=${encodeURIComponent(recentEl.dataset.recent)}`; return; }
    const target = event.target.closest("[data-act],[data-choice],[data-set-palette],[data-set-mode],[data-set-size],[data-pref],[data-setting],[data-mood],[data-status],[data-ep],[data-view],[data-genre],[data-bflag],[data-airing-mine],[data-tag-add],[data-tag-flip],[data-tag-remove],[data-tag],[data-note-act],[data-show],a");
    if (event.target.closest("[data-tip-next]")) return fadeTip(() => showTip(Number(event.target.closest("[data-tip-next]").dataset.tipNext)));
    if (event.target.classList.contains("trailer-modal")) { event.target.remove(); return announcePreview(); }
    if (document.querySelector(".tip.show") && !event.target.closest(".tip, .tip-target")) fadeTip();
    if (!event.target.closest('[data-act="profile"], [data-act="theme"]')) closePop(event);
    if (!event.target.closest('[data-act="taste"]')) tastePop?.close();
    if (!target) return;
    if (target.closest(".tip-target")) fadeTip(() => showTip(tipIndex + 1));
    const showEl = target.closest("[data-show]");
    const show = showEl && byId.get(showEl.dataset.show);
    const act = target.dataset.act;
    if (target.dataset.setPalette) {
      const pop = document.querySelector("#theme-pop");
      const custom = target.dataset.setPalette === "custom";
      pop?.classList.toggle("wheel-open", custom && Boolean(target.closest("#theme-pop")) && !pop.classList.contains("wheel-open"));
      theme.palette = target.dataset.setPalette;
      return applyTheme();
    }
    if (target.dataset.setMode) { theme.mode = target.dataset.setMode; return applyTheme(); }
    if (target.dataset.setSize) { theme.size = target.dataset.setSize; return applyTheme(); }
    if (act === "sound" || target.dataset.pref === "sound") return toggleSound();
    if (target.dataset.pref) {
      prefs[target.dataset.pref] = !prefs[target.dataset.pref];
      stopPreview();
      if (target.dataset.pref === "subs") for (const p of players) p.applySubs();
      return applyTheme();
    }
    if (target.dataset.setting) {
      const key = target.dataset.setting;
      if (key === "showTips" && !settingOn(key)) localStorage.removeItem(TIPS_SEEN);
      if (key === "liteMode") stopPreview();
      if (key === "useAi") return toggleAi();
      return setSettings({ [key]: !settingOn(key) });
    }
    if (act === "ai-toggle") return toggleAi();
    if (act === "inspired-refresh") return loadInspired({ fresh: true });
    if (act === "recent-clear") {
      recent = [];
      localStorage.removeItem(RECENT_KEY);
      return loadInspired();
    }
    if (target.dataset.mood) { location.hash = `search?q=${encodeURIComponent(target.dataset.mood)}`; return; }
    if (target.dataset.view) { listView = target.dataset.view; return rerender(); }
    if (target.dataset.genre !== undefined) {
      browse.genre = browse.genre === target.dataset.genre ? "" : target.dataset.genre;
      history.replaceState(null, "", browse.genre ? `#browse/${encodeURIComponent(browse.genre)}` : "#browse");
      return paintBrowse();
    }
    if (target.dataset.tagAdd || target.dataset.tag) {
      const input = document.querySelector("#tag-q");
      setTag(target.dataset.tagAdd || target.dataset.tag, target.dataset.mode || "in");
      input.value = "";
      input.focus();
      return paintTagMenu(true);
    }
    if (target.dataset.tagFlip) return setTag(target.dataset.tagFlip, browse.tags.includes(target.dataset.tagFlip) ? "out" : "in");
    if (target.dataset.tagRemove) return setTag(target.dataset.tagRemove, null);
    if (target.dataset.bflag) { browse[target.dataset.bflag] = !browse[target.dataset.bflag]; return paintBrowse(); }
    if (act === "browse-clear") {
      event.preventDefault();
      browse = freshBrowse({ sort: browse.sort });
      history.replaceState(null, "", "#browse");
      return paintBrowse();
    }
    if (target.dataset.airingMine) { airingMine = target.dataset.airingMine === "true"; return rerender(); }
    if (target.dataset.noteAct) return noteAction(target.closest("[data-note]").dataset.note, target.dataset.noteAct, target);
    if (target.dataset.status && show) return setStatus(show, Number(target.dataset.season ?? entry(show)?.index ?? 0), target.dataset.status);
    if (target.dataset.ep) {
      const current = byId.get(decodeURIComponent(location.hash.split("/")[1] || ""));
      if (!current) return;
      const index = Number(target.dataset.season || 0);
      const n = Number(target.dataset.ep);
      if (marking || !onCrunchyroll(current)) return markThrough(current, index, n);
      return play(current, index, n);
    }
    if (act === "mark-mode") { marking = !marking; return rerender(); }
    if (act === "rail-prev" || act === "rail-next") { const r = target.parentElement.querySelector(".rail"); return r.scrollBy({ left: (act === "rail-next" ? 1 : -1) * r.clientWidth * 0.85, behavior: lite() ? "auto" : "smooth" }); }
    if (act === "drawer") { paintDrawer(); return document.body.classList.add("drawer-open"); }
    if (act === "close-drawer") return document.body.classList.remove("drawer-open");
    if (act === "notes-update") return resolveAll("update");
    if (act === "notes-clear") return resolveAll("ignore");
    if (act === "taste") {
      if (tastePop.isOpen()) return tastePop.close();
      // From the phone-width profile menu, the popup takes the menu's place under the profile button.
      if (target.closest("#profile-pop")) {
        document.querySelector("#profile-pop").classList.remove("open");
        return tastePop.open(document.querySelector(".profile-btn"));
      }
      return tastePop.open(target);
    }
    if (act === "theme") { document.querySelector("#profile-pop")?.classList.remove("open"); const pop = document.querySelector("#theme-pop"); const r = target.getBoundingClientRect(); pop.style.top = `${Math.min(r.bottom + 10, innerHeight - 280)}px`; pop.style.left = `${Math.max(12, Math.min(r.left - 120, innerWidth - 300))}px`; pop.classList.toggle("open"); event.stopPropagation(); return; }
    if (act === "profile") {
      const pop = document.querySelector("#profile-pop");
      const r = target.getBoundingClientRect();
      document.querySelector("#theme-pop")?.classList.remove("open");
      pop.style.top = `${r.bottom + 10}px`;
      pop.style.right = `${Math.max(12, innerWidth - r.right - 8)}px`;
      pop.style.left = "auto";
      if (!pop.classList.contains("open")) checkHistory();
      pop.classList.toggle("open");
      event.stopPropagation();
      return;
    }
    if (target.closest("#profile-pop") && target.tagName === "A") document.querySelector("#profile-pop").classList.remove("open");
    if (act === "refresh-catalog") return refreshCatalog();
    if (act === "anilist-connect") return send("openOptions");
    if (act === "anilist-refresh") return accountAction("refreshAnilist", "AniList list refreshed");
    if (act === "sync-now") return accountAction("syncNow", (reply) => reply.syncNote || "Done");
    if (act === "history") {
      document.querySelector("#profile-pop")?.classList.remove("open");
      if (document.body.dataset.page !== "settings") location.hash = "settings";
      setTimeout(() => {
        ensureSettings();
        settingsView.openHistory();
        settingsEmbed.wrap.scrollIntoView({ behavior: lite() ? "auto" : "smooth", block: "start" });
      }, 60);
      return;
    }
    if (act === "ai-pick") return pickForYou(false);
    if (act === "ai-reroll") return pickForYou(true);
    if (act === "gen-clear") return loadHomeRows({ nudge: "" });
    if (act === "ai-last") return lastForYouRoll();
    if (act === "hero-reroll") return rerollBanner();
    if (act === "hero-last") return lastBannerRoll();
    if (act === "reload") return reload({ first: true });
    if (act === "trailer") return openTrailer(target.dataset.show);
    if (act === "close-trailer") { target.closest(".trailer-modal").remove(); return announcePreview(); }
    if (act === "toggle" && show) return toggleList(show);
    if (act === "plus-one") {
      const current = show || byId.get(decodeURIComponent(location.hash.split("/")[1] || ""));
      if (!current) return;
      const index = Number(target.dataset.season ?? entry(current)?.index ?? 0);
      const season = seasonsOf(current)[index];
      const n = (seasonState(current, index)?.progress || 0) + 1;
      return saveSeasons(current, [{ index, status: n >= (season.episodes || Infinity) ? "finished" : "watching", progress: n }], `${current.title}:${seasonName(current, index)} episode ${n} watched`);
    }
    if (act === "shortcuts") return send("openShortcuts");
    if (act === "check-update") return checkUpdate(true);
    if (act === "install-update") return runUpdate();
    if (act === "watch" && show) return play(show, target.dataset.season != null ? Number(target.dataset.season) : undefined);
    if (target.dataset.choice) {
      const [key, value] = target.dataset.choice.split(":");
      return setSettings({ [key]: value === "true" ? true : value === "false" ? false : value });
    }
    if (target.tagName === "A") return;
    if (show && !target.closest("button")) openCard(showEl, show);
  });
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-gen-ask]");
    if (!form) return;
    event.preventDefault();
    loadHomeRows({ fresh: true, nudge: form.elements.nudge.value });
  });
  document.addEventListener("input", (event) => {
    if (event.target.matches(".vol-range")) { prefs.volume = Number(event.target.value); prefs.sound = prefs.volume > 0; return applySound(); }
    if (event.target.id === "tag-q") paintTagMenu(true);
    if (event.target.matches(".wheel-v")) { const { h, s } = wheelHsv || hexHsv(theme.custom); wheelHsv = { h, s, v: Number(event.target.value) / 100 }; return setCustom(hsvHex(h, s, wheelHsv.v)); }
    if (event.target.matches(".wheel-hex")) {
      const raw = event.target.value.trim().replace(/^#?/, "#").toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(raw)) { wheelHsv = hexHsv(raw); setCustom(raw); }
    }
  });
  document.addEventListener("pointerdown", (event) => {
    const wheel = event.target.closest("[data-wheel]");
    if (!wheel) return;
    wheel.setPointerCapture(event.pointerId);
    pickWheel(wheel, event);
  });
  document.addEventListener("pointermove", (event) => {
    const wheel = event.target.closest?.("[data-wheel]");
    if (wheel?.hasPointerCapture(event.pointerId)) pickWheel(wheel, event);
  });
  document.addEventListener("change", (event) => {
    if (event.target.dataset.browse) { browse[event.target.dataset.browse] = event.target.value; paintBrowse(); }
    if (event.target.matches("[data-tip-off]") && event.target.checked) {
      localStorage.setItem(TIPS_SEEN, "1");
      setTimeout(() => fadeTip(() => setSettings({ showTips: false })), 700);
    }
  });
  document.addEventListener("focusin", (event) => { if (event.target.id === "tag-q") paintTagMenu(true); });
  document.addEventListener("focusout", (event) => {
    if (event.target.id === "tag-q") setTimeout(() => { if (!document.activeElement?.closest(".tag-box")) paintTagMenu(false); }, 0);
  });
  // Keeps the tag input focused while picking from its menu.
  document.addEventListener("pointerdown", (event) => { if (event.target.closest(".tag-menu")) event.preventDefault(); });
  document.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches?.("[data-status-badge]")) {
      event.preventDefault();
      return toggleStatusMenu(event.target);
    }
    if (event.target.id === "tag-q") {
      const options = [...document.querySelectorAll(".tag-opt")];
      const at = options.findIndex((el) => el.classList.contains("sel"));
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        options[at]?.classList.remove("sel");
        options[(at + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.classList.add("sel");
      }
      if (event.key === "Enter" && options[at]) {
        event.preventDefault();
        setTag(options[at].dataset.tag, event.shiftKey ? "out" : "in");
        event.target.value = "";
        paintTagMenu(true);
      }
      if (event.key === "Backspace" && !event.target.value) {
        const last = [...browse.tags.map((t) => [t, 0]), ...browse.without.map((t) => [t, 1])].at(-1);
        if (last) { setTag(last[0], null); paintTagMenu(true); }
      }
      if (event.key === "Escape") { event.stopPropagation(); paintTagMenu(false); }
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches(".card[data-show], .wide[data-show]")) {
      event.preventDefault();
      const show = byId.get(event.target.dataset.show);
      if (show) openCard(event.target, show);
      else location.hash = `show/${event.target.dataset.show}`;
    }
    if (event.key === "Escape") { document.body.classList.remove("drawer-open"); document.querySelector(".trailer-modal")?.remove(); announcePreview(); closeMenu("#theme-pop", '[data-act="theme"]'); closeMenu("#profile-pop", ".profile-btn"); tastePop?.close({ restoreFocus: true }); }
  });
  document.addEventListener("mouseover", (event) => {
    const cardEl = event.target.closest(".card");
    if (cardEl && cardEl !== playing && !cardEl.contains(event.relatedTarget)) {
      const box = cardEl.getBoundingClientRect();
      cardEl.dataset.edge = box.left < 160 ? "left" : innerWidth - box.right < 160 ? "right" : "";
      startPreview(cardEl);
    }
  });
  document.addEventListener("mouseout", (event) => {
    const cardEl = event.target.closest(".card");
    if (cardEl && !cardEl.contains(event.relatedTarget)) { clearTimeout(hoverTimer); if (cardEl === playing) stopPreview(); }
  });
  window.addEventListener("message", onPlayerMessage);
  document.addEventListener("visibilitychange", () => {
    hush(document.hidden);
    if (!document.hidden) finishManualUpdate().catch(() => {});
  });
  addEventListener("blur", () => setTimeout(() => { if (document.activeElement?.tagName !== "IFRAME") hush(true); }));
  addEventListener("focus", () => { if (!document.hidden) hush(false); });
  for (const type of ["pointerdown", "keydown"]) {
    addEventListener(type, function unlock() {
      removeEventListener(type, unlock, true);
      setTimeout(() => { for (const p of players) p.applySound(); });
    }, true);
  }
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyTheme);
  window.addEventListener("hashchange", route);
  // Full-bleed sections use 100vw, which includes the scrollbar on Windows.
  const measureScrollbar = () => document.documentElement.style.setProperty("--scrollbar", `${innerWidth - document.documentElement.clientWidth}px`);
  new ResizeObserver(measureScrollbar).observe(document.documentElement);
}
function closePop(event) {
  if (!event.target.closest("#theme-pop")) document.querySelector("#theme-pop")?.classList.remove("open");
  if (!event.target.closest("#profile-pop")) document.querySelector("#profile-pop")?.classList.remove("open");
}

function closeMenu(popSel, openerSel) {
  const pop = document.querySelector(popSel);
  if (!pop?.classList.contains("open")) return;
  const focus = document.activeElement;
  pop.classList.remove("open");
  if (!focus || focus === document.body || pop.contains(focus)) document.querySelector(openerSel)?.focus({ preventScroll: true });
}

export const api = {
  get SHOWS() { return SHOWS; },
  get byId() { return byId; },
  send: (...args) => send(...args),
  icon, esc, cssUrl, score, eps, clip, card, wide, rail, entry, inStatus, seasonsOf, epLabel, seasonCount, nextSeason,
  popular, rated, fresh, similar, forYouRail, homeRowsHtml, bannerRows, bannerRoll, aiOn, matchBadge, statusBadge, STATUS, MOODS, artOf, posterImg,
  prefs: () => ({ ...prefs, reduce: lite() }), player, soundButton, onCrunchyroll, playLabel, crBadge,
};

export function startPrism(source, design) {
  data = source;
  send = source.send;
  home = design;
  loadTheme();
  const badgeStyle = document.createElement("style");
  badgeStyle.textContent = `${BADGE_CSS}${BADGE_MENU_CSS}`;
  document.head.append(badgeStyle);
  window.name = "crunchilist-app";
  document.body.innerHTML = `${nav()}<main></main>${drawer()}${themePop()}<div class="pop profile-pop" id="profile-pop" role="dialog" aria-label="Accounts"></div><div class="toast" role="status" aria-live="polite"></div>`;
  tastePop = createTastePop({ send, getView: () => view, icon, esc, onView: applyView, onChanged: tasteChanged });
  document.body.append(tastePop.el);
  paintAccount();
  bind();
  route();
  reload({ first: true }).finally(() => setTimeout(startTips, 800));
  send("getShortcut").then((reply) => { if (reply?.ok) { shortcut = reply.shortcut || ""; if (document.body.dataset.page === "settings") rerender(true); } });
  setTimeout(() => checkUpdate().catch(() => {}), 3000);
  finishManualUpdate().catch(() => {});
  chrome.storage.local.get("crJustUpdated").then(({ crJustUpdated }) => {
    if (!crJustUpdated) return;
    chrome.storage.local.remove("crJustUpdated");
    setTimeout(() => toast(`Crunchilist updated to version ${crJustUpdated}`), 600);
  }).catch(() => {});
  source.watch((kind, next) => (kind === "view" ? applyView(next) : reload().finally(() => setTimeout(startTips, 800))));
}
