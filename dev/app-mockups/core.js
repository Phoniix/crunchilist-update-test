// Shared mockup engine: data, sample library, theme switching, routing and page builders.
// A direction calls Mock.start({ key, name, home, palette, mode }) and styles the shared markup.
(() => {
  const SHOWS = window.MOCK_SHOWS || [];
  const byId = new Map(SHOWS.map((show) => [show.id, show]));
  const find = (pattern) => SHOWS.find((show) => pattern.test(show.title));

  const PALETTES = [
    { id: "ember", name: "Ember", colors: ["#ff7a2f", "#ffb347"] },
    { id: "midnight", name: "Midnight", colors: ["#8b7bff", "#4fd1ff"] },
    { id: "sakura", name: "Sakura", colors: ["#ff6fa5", "#ffc2d4"] },
    { id: "matcha", name: "Matcha", colors: ["#8be05f", "#ecd56b"] },
    { id: "ocean", name: "Ocean", colors: ["#2ed3c6", "#6aa8ff"] },
    { id: "mono", name: "Mono", colors: ["#f5f5f5", "#555555"] },
  ];
  const STATUS = { watching: "Watching", plan: "Plan to watch", finished: "Finished", dropped: "Dropped" };
  const CHIPS = ["Watching", "Plan to watch", "Not started", "New", "Short series", "Long series"];
  const SORTS = ["Best match", "Most popular", "Highest rated", "Newest", "A to Z", "Fewest episodes", "Most episodes"];
  const MOODS = ["something cozy", "big fights", "make me cry", "smart mystery", "short and sweet", "found family"];

  const SEED = [
    [/frieren/i, "watching", 4, 1], [/solo leveling/i, "watching", 9, 1], [/spy x family/i, "watching", 7, 2],
    [/one piece/i, "watching", 412], [/kaze no stigma/i, "watching", 6], [/jujutsu kaisen$/i, "watching", 14, 1],
    [/demon slayer/i, "finished", 0, 2], [/re:zero/i, "dropped", 5, 2],
    [/vinland/i, "plan", 0], [/steins/i, "plan", 0], [/cowboy bebop/i, "plan", 0], [/mushoku/i, "plan", 0], [/death parade/i, "plan", 0],
    [/attack on titan/i, "finished"], [/fullmetal/i, "finished"], [/silent voice/i, "finished"], [/your lie/i, "finished"],
    [/mob psycho/i, "finished"], [/kaguya/i, "finished"], [/sword art/i, "dropped", 8], [/franxx/i, "dropped", 11],
    [/secret saint/i, "watching", 3], [/red river/i, "watching", 14], [/overgeared/i, "watching", 3], [/cold sato/i, "plan", 0],
  ];

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
  };
  const icon = (name, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ""}</svg>`;
  const esc = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const score = (show) => (show.score ? (show.score / 10).toFixed(1) : "–");
  const eps = (show) => (show.episodes ? `${show.episodes} eps` : "Ongoing");
  const clip = (text, max) => (text.length > max ? `${text.slice(0, text.lastIndexOf(" ", max))}…` : text);

  let design = {};
  let library = {};
  let theme = {};
  let prefs = { previews: true, sound: false, volume: 60, reduce: false, openIn: "tab", tabManage: true, tabAuto: false, backButton: true, showTips: true };

  // Seasons: each show keeps per-season status and progress, plus the season the viewer is on.
  const seasonsOf = (show) => (show.seasons?.length ? show.seasons
    : [{ anilistId: show.anilistId, label: "Season 1", title: show.title, format: "TV", episodes: show.episodes, year: show.year, season: show.season, status: show.status, cover: show.cover }]);
  const seasonEps = (season) => season.episodes || (season.status === "FINISHED" ? 12 : 0);
  const released = (season) => season.status !== "NOT_YET_RELEASED";
  const seasonState = (show, index) => library[show.id]?.s?.[index];
  function setSeason(show, index, data) {
    const record = library[show.id] || (library[show.id] = { at: index, s: {} });
    record.s[index] = data;
    const active = Object.keys(record.s).map(Number).filter((i) => record.s[i].status !== "plan");
    record.at = active.length ? Math.max(...active) : index;
  }

  // Bumped when the sample library changes, so the new seed shows up.
  const LIBRARY_KEY = "clmock-lib3";
  function loadLibrary() {
    try { library = JSON.parse(localStorage.getItem(LIBRARY_KEY)) || null; } catch { library = null; }
    if (library) return;
    library = {};
    for (const [pattern, status, progress, at = 0] of SEED) {
      const show = find(pattern);
      if (!show) continue;
      const seasons = seasonsOf(show);
      const last = status === "finished" && !at ? seasons.filter(released).length - 1 : Math.min(at, seasons.length - 1);
      for (let i = 0; i < last; i++) setSeason(show, i, { status: "finished", progress: seasonEps(seasons[i]) });
      setSeason(show, last, { status, progress: status === "finished" ? seasonEps(seasons[last]) : progress || 0 });
    }
  }
  const saveLibrary = () => localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  function entry(show) {
    const record = library[show.id];
    const state = record?.s?.[record.at];
    if (!state) return undefined;
    const season = seasonsOf(show)[record.at];
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
    const n = item.progress + 1;
    return `${seasonTag(item)}${long ? "Episode " : "Ep "}${n}${item.episodes ? ` ${long ? "of" : "/"} ${item.episodes}` : ""}`;
  };
  const seasonCount = (show) => {
    const list = seasonsOf(show).filter((s) => s.format !== "MOVIE");
    return list.length > 1 ? `${list.length} seasons` : eps(show);
  };

  // Theme
  const themeKey = () => `clmock-theme-${design.key}`;
  const readJson = (key) => { try { const value = JSON.parse(localStorage.getItem(key)); return value && typeof value === "object" ? value : {}; } catch { return {}; } };
  function loadTheme() {
    const saved = readJson(themeKey());
    const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
    theme = {
      palette: pick(saved.palette, [...PALETTES.map((p) => p.id), "custom"], design.palette || "ember"),
      mode: pick(saved.mode, ["light", "dark", "system"], design.mode || "dark"),
      size: pick(saved.size, ["s", "m", "l"], "m"),
      custom: /^#[0-9a-f]{6}$/i.test(saved.custom || "") ? saved.custom.toLowerCase() : "#ff7a2f",
    };
    const stored = readJson("clmock-prefs");
    if (!("reduce" in stored)) prefs.reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [key, fallback] of Object.entries(prefs)) {
      if (typeof stored[key] === typeof fallback) prefs[key] = stored[key];
    }
    prefs.volume = clamp(Math.round(prefs.volume), 0, 100);
  }

  // Custom theme: one picked color becomes a full palette for light and dark mode
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const toHex = (r, g, b) => `#${[r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;
  const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  function hexHsl(hex) {
    const [r, g, b] = rgbOf(hex);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l * 100];
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, (d / (1 - Math.abs(2 * l - 1))) * 100, l * 100];
  }
  function hslHex(h, s, l) {
    s /= 100; l /= 100;
    const f = (n) => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return toHex(f(0), f(8), f(4));
  }
  function hsvHex(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return toHex(f(5), f(3), f(1));
  }
  function hexHsv(hex) {
    const [r, g, b] = rgbOf(hex);
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    const h = !d ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
  }
  const luma = (hex) => rgbOf(hex).map((c) => (c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  const CUSTOM_VARS = ["--bg", "--bg-2", "--surface", "--surface-2", "--line", "--text", "--muted", "--accent", "--accent-2", "--on-accent"];
  function customVars(hex, mode) {
    const [h, s, l] = hexHsl(hex);
    const tint = Math.min(s, 35) * .6;
    const tone = (light) => hslHex(h, tint, light);
    const accent = hslHex(h, s, mode === "dark" ? clamp(l, 52, 75) : clamp(l, 28, 46));
    const accent2 = hslHex((h + 30) % 360, s, mode === "dark" ? clamp(l + 8, 60, 82) : clamp(l + 4, 32, 50));
    const onAccent = luma(accent) > .4 ? hslHex(h, 60, 8) : "#ffffff";
    const values = mode === "dark"
      ? [tone(5), tone(7), tone(10), tone(14), tone(20), hslHex(h, tint * .8, 95), hslHex(h, tint * .7, 64), accent, accent2, onAccent]
      : [tone(97.5), tone(94), "#ffffff", tone(94), tone(86), tone(10), hslHex(h, tint * .7, 42), accent, accent2, onAccent];
    return Object.fromEntries(CUSTOM_VARS.map((name, i) => [name, values[i]]));
  }
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
    root.classList.toggle("reduce", prefs.reduce);
    localStorage.setItem(themeKey(), JSON.stringify(theme));
    localStorage.setItem("clmock-prefs", JSON.stringify(prefs));
    document.querySelectorAll("[data-set-palette]").forEach((el) => el.classList.toggle("on", el.dataset.setPalette === theme.palette));
    document.querySelectorAll("[data-set-mode]").forEach((el) => el.classList.toggle("on", el.dataset.setMode === theme.mode));
    document.querySelectorAll("[data-set-size]").forEach((el) => el.classList.toggle("on", el.dataset.setSize === theme.size));
    document.querySelectorAll("[data-pref]").forEach((el) => el.classList.toggle("on", Boolean(prefs[el.dataset.pref])));
    document.querySelectorAll(".theme-tile").forEach((el) => { el.dataset.mode = root.dataset.mode; });
  }

  const CR_MARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#f47521"/><path d="M9.6 7.6v8.8l7-4.4z" fill="#fff"/></svg>`;
  const OFF_MARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 19 19 5" stroke="currentColor" stroke-width="2"/></svg>`;
  function crBadge(show, cls = "") {
    return show.onCrunchyroll !== false
      ? `<span class="avail on ${cls}">${CR_MARK}On Crunchyroll</span>`
      : `<span class="avail off ${cls}">${OFF_MARK}Not on Crunchyroll</span>`;
  }

  // Cards
  function badgeFor(show) {
    const item = entry(show);
    if (!item) return show.status === "RELEASING" ? '<span class="badge new">New episodes</span>' : "";
    if (item.status === "watching") return `<span class="badge watching">${epLabel(show)}</span>`;
    const next = nextSeason(show);
    if (next) return `<span class="badge new">${next.format === "MOVIE" ? "New movie" : `${next.label} out`}</span>`;
    return `<span class="badge ${item.status}">${item.multi && item.status !== "finished" ? seasonTag(item) : ""}${STATUS[item.status]}</span>`;
  }
  function meter(show) {
    const item = entry(show);
    if (item?.status !== "watching" || !item.episodes) return "";
    return `<div class="meter"><i style="width:${Math.min(100, (item.progress / item.episodes) * 100)}%"></i></div>`;
  }
  function listButton(show, cls = "btn sm icon") {
    const added = Boolean(entry(show));
    return `<button class="${cls}" data-act="toggle" title="${added ? STATUS[entry(show).status] : "Add to Plan to watch"}">${icon(added ? "check" : "plus")}</button>`;
  }
  function card(show, opts = {}) {
    const rank = opts.rank ? `<span class="rank-num">${opts.rank}</span>` : "";
    // The peek only opens on hover, so its controls stay out of the tab order; Enter on the card opens the show page instead.
    const peek = `<div class="peek">
          <div class="peek-art" style="background-image:url('${show.banner}')"><div class="pv"></div>${show.trailer ? soundButton("pv-sound") : ""}</div>
          <div class="peek-body">
            <h4>${esc(show.title)}</h4>
            <div class="peek-meta"><span class="star">★ ${score(show)}</span><span>${show.year || ""}</span><span>${seasonCount(show)}</span></div>
            ${crBadge(show, "small")}
            <p>${esc(clip(show.about, 220))}</p>
            <div class="peek-tags">${show.genres.slice(0, 3).map((g) => `<span>${g}</span>`).join("")}</div>
            <div class="peek-actions">
              ${show.onCrunchyroll === false
                ? `<a class="btn sm" href="#show/${show.id}">Where to watch</a>`
                : `<button class="btn sm accent" data-act="watch">${icon("play")} ${entry(show)?.status === "watching" ? epLabel(show).replace(/ \/ \d+$/, "") : "Watch"}</button>`}
              ${listButton(show)}
              <a class="btn sm ghost" href="#show/${show.id}">Details</a>
            </div>
          </div>
        </div>`.replace(/<(button|a) /g, '<$1 tabindex="-1" ');
    return `<div class="card${opts.rank ? " ranked" : ""}" data-show="${show.id}" style="--c:${show.color}" tabindex="0" role="link" aria-label="${esc(show.title)}">
      ${rank}
      <div class="poster">
        <img src="${show.cover}" alt="" loading="lazy">
        ${badgeFor(show)}${meter(show)}${show.onCrunchyroll === false ? crBadge(show, "mini") : ""}
      </div>
      ${peek}
      <div class="cap"><div class="title">${esc(show.title)}</div><div class="sub">${show.genres[0] || ""} · ${seasonCount(show)}</div></div>
    </div>`;
  }
  function wide(show) {
    return `<div class="wide" data-show="${show.id}" tabindex="0" role="link" aria-label="${esc(show.title)}, ${esc(epLabel(show, true))}">
      <div class="wide-art"><img src="${show.banner}" alt="" loading="lazy"><div class="wide-play">${icon("play")}</div>
        <div class="wide-copy"><b>${esc(show.title)}</b><small>${epLabel(show, true)}</small>${meter(show)}</div>
      </div>
    </div>`;
  }
  function rail(title, items, opts = {}) {
    if (!items.length) return "";
    const render = opts.render || ((show, i) => card(show, { rank: opts.ranked ? i + 1 : 0 }));
    return `<section class="row ${opts.cls || ""}">
      <div class="row-head"><h2>${title}</h2>${opts.sub ? `<span class="muted">${opts.sub}</span>` : ""}<a href="${opts.href || "#browse"}">See all</a></div>
      <div class="rail-wrap">
        <button class="rail-arrow prev" data-act="rail-prev" aria-label="Scroll ${esc(title)} left" tabindex="-1">${icon("left")}</button>
        <div class="rail">${items.map(render).join("")}</div>
        <button class="rail-arrow next" data-act="rail-next" aria-label="Scroll ${esc(title)} right" tabindex="-1">${icon("right")}</button>
      </div>
    </section>`;
  }
  const grid = (items) => `<div class="grid">${items.map((show) => card(show)).join("")}</div>`;

  // Collections used by every home layout
  const popular = () => [...SHOWS].sort((a, b) => (b.score || 0) - (a.score || 0));
  const fresh = () => [...SHOWS].sort((a, b) => (b.year || 0) - (a.year || 0));
  const unseen = () => SHOWS.filter((show) => !entry(show));
  function similar(show, count = 12) {
    const tags = new Set([...show.genres, ...show.tags]);
    return SHOWS.filter((other) => other.id !== show.id)
      .map((other) => ({ other, hits: [...other.genres, ...other.tags].filter((t) => tags.has(t)).length }))
      .sort((a, b) => b.hits - a.hits || (b.other.score || 0) - (a.other.score || 0))
      .slice(0, count).map((row) => row.other);
  }
  const forYou = () => similar(find(/attack on titan/i) || SHOWS[0], 30).filter((show) => !entry(show)).slice(0, 14);
  const lastFinished = () => inStatus("finished")[0];

  // Search
  let searchState = { q: "", chips: new Set(), sort: "Best match" };
  function runSearch() {
    const stop = new Set(["something", "with", "that", "like", "make", "and", "the", "big", "show", "anime", "want", "some"]);
    const words = searchState.q.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
    const hay = (show) => `${show.title} ${show.genres.join(" ")} ${show.tags.join(" ")} ${show.about}`.toLowerCase();
    const moodMap = { cozy: ["iyashikei", "slice of life", "found family"], fights: ["action", "super power", "martial arts"], cry: ["drama", "tragedy", "coming of age"], mystery: ["mystery", "psychological", "thriller"], short: [], family: ["found family"] };
    let rows = SHOWS.map((show) => {
      const text = hay(show);
      let hits = 0;
      for (const word of words) {
        if (text.includes(word)) hits += 2;
        for (const [key, tags] of Object.entries(moodMap)) if (word.startsWith(key)) hits += tags.filter((t) => text.includes(t)).length * 2;
      }
      return { show, hits: hits + (show.score || 0) / 100 };
    });
    if (words.length) rows = rows.filter((row) => row.hits >= 1);
    const chips = searchState.chips;
    rows = rows.filter(({ show }) => {
      const item = entry(show);
      if (chips.has("Watching") && item?.status !== "watching") return false;
      if (chips.has("Plan to watch") && item?.status !== "plan") return false;
      if (chips.has("Not started") && item) return false;
      if (chips.has("New") && show.status !== "RELEASING") return false;
      if (chips.has("Short series") && !(show.episodes && show.episodes <= 13)) return false;
      if (chips.has("Long series") && !(show.episodes >= 24)) return false;
      return true;
    });
    const sorters = {
      "Best match": (a, b) => b.hits - a.hits,
      "Most popular": (a, b) => (b.show.score || 0) - (a.show.score || 0),
      "Highest rated": (a, b) => (b.show.score || 0) - (a.show.score || 0),
      Newest: (a, b) => (b.show.year || 0) - (a.show.year || 0),
      "A to Z": (a, b) => a.show.title.localeCompare(b.show.title),
      "Fewest episodes": (a, b) => (a.show.episodes || 9999) - (b.show.episodes || 9999),
      "Most episodes": (a, b) => (b.show.episodes || 0) - (a.show.episodes || 0),
    };
    return rows.sort(sorters[searchState.sort]).map((row) => row.show);
  }
  function whyFor(show) {
    const words = searchState.q.toLowerCase().split(/\s+/);
    const tags = show.tags.filter((tag) => words.some((w) => w.length > 2 && tag.toLowerCase().includes(w.slice(0, 4))));
    const picks = (tags.length ? tags : show.tags).slice(0, 2).join(" and ");
    return `Leans into ${picks.toLowerCase()}, rated ${score(show)}, and ${show.episodes && show.episodes <= 13 ? "a quick watch" : "plenty to sink into"}.`;
  }
  function paintResults() {
    const results = runSearch();
    const top = searchState.q ? results.slice(0, 3) : [];
    const picks = document.querySelector("#ai-picks");
    const out = document.querySelector("#results");
    if (!out) return;
    picks.innerHTML = top.length ? `<div class="ai-label">${icon("sparkle")} AI picks for “${esc(searchState.q)}”</div>
      <div class="ai-picks">${top.map((show, i) => `<div class="ai-pick" data-show="${show.id}"><img src="${show.cover}" alt=""><div>
        <div class="rank">#${i + 1} match</div><b>${esc(show.title)}</b><div class="peek-meta"><span class="star">★ ${score(show)}</span><span>${eps(show)}</span></div>
        <div class="why">${whyFor(show)}</div></div></div>`).join("")}</div>` : "";
    const rest = searchState.q ? results.slice(3) : results;
    out.innerHTML = `<div class="row-head"><h2>${searchState.q ? "More matches" : "Browse everything"}</h2><span class="muted">${rest.length} titles</span></div>${grid(rest)}`;
  }

  // Pages
  function pageSearch(query) {
    searchState.q = query || searchState.q;
    return `<div class="search-hero">
      <h1 class="page-title">Find your next obsession</h1>
      <p class="page-sub">Describe a mood, a vibe, or a show you loved. Titles first, AI picks on top.</p>
      <div class="search-box">${icon("search")}<input id="q" placeholder="Try “cozy fantasy with found family”" value="${esc(searchState.q)}" autocomplete="off"><button class="btn accent" data-act="search">Search</button></div>
      <div class="search-tools">
        ${MOODS.map((m) => `<button class="chip mood" data-mood="${m}">${m}</button>`).join("")}
      </div>
      <div class="search-tools">
        ${CHIPS.map((c) => `<button class="chip ${searchState.chips.has(c) ? "on" : ""}" data-chip="${c}">${c}</button>`).join("")}
        <select class="select" id="sort">${SORTS.map((s) => `<option ${s === searchState.sort ? "selected" : ""}>${s}</option>`).join("")}</select>
      </div>
    </div>
    <div id="ai-picks"></div><div id="results"></div>`;
  }

  let listTab = "watching";
  let listView = "grid";
  function pageList(tab) {
    if (tab && STATUS[tab]) listTab = tab;
    const items = inStatus(listTab);
    const body = listView === "grid" ? grid(items) : `<div class="lib-rows">${items.map((show) => {
      const item = entry(show);
      const pct = item.episodes ? Math.round((item.progress / item.episodes) * 100) : 0;
      return `<div class="lib-row" data-show="${show.id}"><img src="${show.cover}" alt=""><div><b>${esc(show.title)}</b><span class="muted">${item.multi ? `${esc(item.season.label)} · ` : ""}${show.genres.slice(0, 2).join(" · ")} · ★ ${score(show)}</span></div>
        <div class="lib-prog">${item.progress} of ${item.episodes || "?"} episodes<div class="meter"><i style="width:${pct}%"></i></div></div>
        <div style="display:flex;gap:6px">${listTab === "watching" ? `<button class="btn sm" data-act="plus-one">+1 ep</button>` : ""}<button class="btn sm accent" data-act="watch">${icon("play")}</button></div></div>`;
    }).join("")}</div>`;
    return `<h1 class="page-title">My list</h1><p class="page-sub">Saved here first, then synced to AniList in the background.</p>
      <div class="sync-line"><span class="ok"></span><span><b>All changes synced to AniList</b> <span class="muted">· 2 minutes ago</span></span><span class="nav-spacer"></span>
        <div class="seg"><button class="${listView === "grid" ? "on" : ""}" data-view="grid">${icon("grid")}</button><button class="${listView === "rows" ? "on" : ""}" data-view="rows">${icon("rows")}</button></div></div>
      <div class="tabs">${Object.entries(STATUS).map(([key, label]) => `<a class="chip ${key === listTab ? "on" : ""}" href="#list/${key}">${label} <b>${inStatus(key).length}</b></a>`).join("")}</div>
      ${items.length ? body : `<p class="muted">Nothing here yet.</p>`}`;
  }

  // Browse: genre tiles up top, then the whole catalog with filters.
  const SEASON_NAMES = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const titleCase = (word) => `${word[0]}${word.slice(1).toLowerCase()}`;
  const nowSeason = () => ({ season: SEASON_NAMES[Math.floor(new Date().getMonth() / 3)], year: new Date().getFullYear() });
  const BROWSE_DEFAULT = { genre: "", when: "", status: "", length: "", sort: "popular", hideSeen: false, crOnly: false, tags: [], without: [] };
  const freshBrowse = (keep = {}) => ({ ...BROWSE_DEFAULT, tags: [], without: [], ...keep });
  let browse = freshBrowse();
  const labelsOf = (show) => [...show.genres, ...show.tags];
  // Tags and genres together, so either can be required or ruled out.
  function tagPool() {
    const counts = new Map();
    for (const show of SHOWS) for (const label of new Set(labelsOf(show))) counts.set(label, (counts.get(label) || 0) + 1);
    const genreSet = new Set(SHOWS.flatMap((show) => show.genres));
    return [...counts].map(([name, count]) => ({ name, count, genre: genreSet.has(name) })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  function genres() {
    const counts = {};
    for (const show of SHOWS) for (const genre of show.genres) counts[genre] = (counts[genre] || 0) + 1;
    const used = new Set();
    return Object.entries(counts).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([name, count]) => {
      const art = popular().find((show) => show.genres.includes(name) && show.banner && !used.has(show.id));
      if (art) used.add(art.id);
      return { name, count, art: art?.banner || "" };
    });
  }
  function browseResults() {
    const current = nowSeason();
    const rank = new Map(SHOWS.map((show, i) => [show.id, i]));
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
      const labels = labelsOf(show);
      if (!browse.tags.every((tag) => labels.includes(tag))) return false;
      if (browse.without.some((tag) => labels.includes(tag))) return false;
      return true;
    });
    const seasonOrder = (show) => (show.year || 0) * 4 + SEASON_NAMES.indexOf(show.season || "WINTER");
    const sorters = {
      popular: (a, b) => rank.get(a.id) - rank.get(b.id),
      rated: (a, b) => (b.score || 0) - (a.score || 0),
      newest: (a, b) => seasonOrder(b) - seasonOrder(a),
      az: (a, b) => a.title.localeCompare(b.title),
    };
    return rows.sort(sorters[browse.sort] || sorters.popular);
  }
  function browseSelect(key, label, options) {
    return `<select class="select" data-browse="${key}" aria-label="${label}">${options.map(([value, text]) => `<option value="${value}" ${browse[key] === value ? "selected" : ""}>${text}</option>`).join("")}</select>`;
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
      ${results.length ? grid(results) : `<div class="empty"><p class="muted">No shows match all of these filters.</p><button class="btn" data-act="browse-clear">Clear filters</button></div>`}`;
  }
  function pageBrowse(genre) {
    if (genre !== undefined) browse.genre = genre;
    const current = nowSeason();
    const years = [...new Set(SHOWS.map((show) => show.year).filter((year) => year >= current.year - 6))].sort((a, b) => b - a);
    const decades = [...new Set(SHOWS.map((show) => show.year).filter((year) => year && year < current.year - 6).map((year) => Math.floor(year / 10) * 10))].sort((a, b) => b - a);
    return `<h1 class="page-title">Browse</h1><p class="page-sub">Everything in the catalog. Start with a genre, or narrow it down with the filters.</p>
      <div class="genre-tiles">${genres().slice(0, 12).map((g) => `<button class="genre-tile ${g.name === browse.genre ? "on" : ""}" data-genre="${esc(g.name)}" style="background-image:linear-gradient(180deg,transparent 20%,rgba(0,0,0,.78)),url('${g.art}')"><b>${esc(g.name)}</b><small>${g.count} shows</small></button>`).join("")}</div>
      ${genres().length > 12 ? `<div class="genre-more"><span class="muted">More genres</span>${genres().slice(12).map((g) => `<button class="chip ${g.name === browse.genre ? "on" : ""}" data-genre="${esc(g.name)}">${esc(g.name)} <b>${g.count}</b></button>`).join("")}</div>` : ""}
      <div class="browse-bar">
        ${browseSelect("when", "When", [["", "Any time"], ["now", `This season (${titleCase(current.season)} ${current.year})`], ...years.map((year) => [`y:${year}`, String(year)]), ...decades.map((decade) => [`d:${decade}`, `${decade}s`])])}
        ${browseSelect("status", "Status", [["", "Airing or finished"], ["airing", "Airing now"], ["finished", "Finished"]])}
        ${browseSelect("length", "Length", [["", "Any length"], ["short", "Short (up to 13 eps)"], ["standard", "Standard (14 to 26 eps)"], ["long", "Long (27+ eps)"]])}
        <button class="chip ${browse.hideSeen ? "on" : ""}" data-bflag="hideSeen">Hide finished</button>
        <button class="chip ${browse.crOnly ? "on" : ""}" data-bflag="crOnly">On Crunchyroll only</button>
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
    return `<a class="air ${mine ? "mine" : ""} ${aired ? "aired" : ""}" href="#show/${show.id}" data-show="${show.id}">
      <img src="${show.cover}" alt="" loading="lazy">
      <div><time>${clock(at)}</time><b>${esc(show.title)}</b><small>Ep ${episode}${behind ? ' · <em>New for you</em>' : aired ? " · Out now" : ""}</small></div>
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
    return `<h1 class="page-title">Airing this week</h1>
      <p class="page-sub">${mine.length ? `${mine.length} ${mine.length === 1 ? "show" : "shows"} you're watching ${mine.length === 1 ? "airs" : "air"} this week.${next ? ` Next up: ${esc(next.show.title)}, ${day(next.at).toLowerCase()} at ${clock(next.at)}.` : ""}` : "Nothing you're watching airs this week."} Times are in your time zone.</p>
      <div class="search-tools air-tools"><button class="chip ${airingMine ? "" : "on"}" data-airing-mine="false">Everything airing</button><button class="chip ${airingMine ? "on" : ""}" data-airing-mine="true">Only shows I'm watching</button></div>
      <div class="air-week">${columns}</div>
      ${returning.length ? `<div class="row-head air-later-head"><h2>Coming back later</h2><span class="muted">On a break or starting soon</span></div>
        <div class="air-later">${returning.map(({ show, at, episode }) => `<a class="air" href="#show/${show.id}" data-show="${show.id}"><img src="${show.cover}" alt="" loading="lazy"><div><time>${new Date(at).toLocaleDateString([], { month: "short", day: "numeric" })}</time><b>${esc(show.title)}</b><small>${episode > 1 ? `Returns with episode ${episode}` : "Premieres"}</small></div></a>`).join("")}</div>` : ""}`;
  }

  function seasonStrip(show, selected) {
    const seasons = seasonsOf(show);
    if (seasons.length < 2) return "";
    return `<div class="seasons">${seasons.map((season, i) => {
      const state = seasonState(show, i);
      const total = season.episodes;
      const line = !released(season) ? `Coming ${season.year || "soon"}`
        : state?.status === "watching" ? `Ep ${state.progress + 1}${total ? ` of ${total}` : ""}`
        : state ? STATUS[state.status] : `${season.year || ""}${total ? ` · ${total} ${total === 1 ? "ep" : "eps"}` : ""}`;
      const pct = state?.status === "finished" ? 100 : state?.status === "watching" && total ? (state.progress / total) * 100 : 0;
      return `<a class="season ${i === selected ? "on" : ""} ${state ? `st-${state.status}` : ""} ${released(season) ? "" : "soon"}" href="#show/${show.id}/${i + 1}">
        <img src="${season.cover || show.cover}" alt="" loading="lazy">
        <div><b>${season.label}</b><small>${esc(line)}</small></div>
        ${state?.status === "finished" ? `<span class="season-check">${icon("check")}</span>` : ""}
        ${pct ? `<div class="meter"><i style="width:${pct}%"></i></div>` : ""}
      </a>`;
    }).join("")}</div>`;
  }

  function pageShow(id, seasonArg) {
    const show = byId.get(id);
    if (!show) return `<h1 class="page-title">We couldn't find that show</h1><p class="page-sub">The link may be out of date, or the show has left the catalog.</p>
      <div class="missing-acts"><a class="btn accent" href="#browse">Browse shows</a><a class="btn ghost" href="#">Back to home</a></div>`;
    const seasons = seasonsOf(show);
    const at = library[show.id]?.at ?? 0;
    const wanted = Number.parseInt(seasonArg, 10);
    const index = Number.isFinite(wanted) ? Math.min(Math.max(wanted - 1, 0), seasons.length - 1) : Math.min(nextSeason(show) ? at + 1 : at, seasons.length - 1);
    const season = seasons[index];
    const multi = seasons.length > 1;
    const item = seasonState(show, index);
    const progress = item?.progress || 0;
    const count = season.episodes && season.episodes <= 120 ? season.episodes : 0;
    const epsGrid = !released(season)
      ? `<div class="set-row"><div class="grow"><b>Not out yet</b><small>${season.year ? `Expected ${season.season ? `${season.season[0]}${season.season.slice(1).toLowerCase()} ` : ""}${season.year}` : "No date announced"}. Add it to Plan to watch and we'll tell you when it starts.</small></div></div>`
      : count
      ? `<div class="eps">${Array.from({ length: count }, (_, i) => `<button class="ep ${i < progress ? "seen" : ""} ${i === progress ? "next" : ""}" data-ep="${i + 1}" data-season="${index}">${i + 1}</button>`).join("")}</div>`
      : `<div class="set-row"><div class="grow"><b>Episode ${progress}</b><small>${season.episodes ? `of ${season.episodes}` : "Still airing"}</small></div><button class="btn sm" data-act="plus-one" data-season="${index}">+1 episode</button></div>`;
    const onCr = onCrunchyroll(show);
    const streams = show.streaming || [];
    const actions = !released(season) ? ""
      : onCr ? `<button class="btn accent" data-act="watch" data-show="${show.id}" data-season="${index}">${icon("play")} ${playLabel(show, index)}</button>`
      : streams.length ? streams.map((link) => `<a class="btn accent" href="${esc(link.url)}" target="_blank" rel="noopener">Watch on ${esc(link.site)} ${icon("right")}</a>`).join("")
      : `<button class="btn" disabled>Not on Crunchyroll</button>`;
    const playHint = !released(season) ? ""
      : onCr ? (extension ? `Opens ${playTarget(show, index).label.toLowerCase()} in ${prefs.openIn === "window" ? "your Crunchyroll window" : prefs.openIn === "new" ? "a new Crunchyroll tab" : "your Crunchyroll tab"}` : "Connect the Crunchilist extension to jump straight to the episode. For now Play opens the show page")
      : `Crunchyroll doesn't have this show, so it can't play here. Crunchilist still tracks it: mark episodes below as you watch${streams.length ? ` on ${streams.map((link) => link.site).join(" or ")}` : " elsewhere"}`;
    const seasonName = (season.title || "").replace(show.title, "").replace(/^[\s:–-]+/, "").trim();
    const lastYear = seasons.filter((s) => s.year).at(-1)?.year;
    const totalEps = seasons.reduce((sum, s) => sum + (s.episodes || 0), 0);
    const seasonLabel = (s) => (s.season ? `${s.season[0]}${s.season.slice(1).toLowerCase()} ` : "");
    return `<section class="show-hero" style="--c:${show.color}">
      <div class="show-hero-bg" style="background-image:url('${show.banner}')"></div>
      <div class="show-hero-inner">
        <div class="show-poster"><img src="${show.cover}" alt=""></div>
        <div class="show-copy">
          <div class="show-heading">
            ${show.native ? `<div class="show-jp" lang="ja" title="${esc(show.native)}">${esc(show.native)}</div>` : ""}
            <h1 class="show-title">${esc(show.title)}</h1>
          </div>
          <div class="show-native">${multi ? `<b class="season-pill">${season.label}${seasonName ? ` · ${esc(seasonName)}` : ""}</b>` : ""}${show.romaji && show.romaji !== show.title ? esc(show.romaji) : ""}</div>
          <div class="show-meta"><span>★ ${season.score ? (season.score / 10).toFixed(1) : score(show)}</span><span>${seasonLabel(season)}${season.year || ""}</span><span>${season.episodes ? `${season.episodes} ${season.episodes === 1 ? "ep" : "eps"}` : "Ongoing"}</span>${show.duration && season.format !== "MOVIE" ? `<span>${show.duration} min</span>` : ""}${show.studio ? `<span>${esc(show.studio)}</span>` : ""}<span>${season.status === "RELEASING" ? "Airing" : released(season) ? "Complete" : "Upcoming"}</span></div>
          <div class="show-avail">${crBadge(show, "large")}${playHint ? `<span class="play-hint">${playHint}</span>` : ""}</div>
          <div class="show-actions">
            ${actions}
            ${show.trailer ? `<button class="btn" data-act="trailer" data-show="${show.id}">${icon("film")} Trailer</button>` : ""}
            <div class="seg status-seg">${Object.entries(STATUS).map(([key, label]) => `<button class="${item?.status === key ? "on" : ""}" data-status="${key}" data-show="${show.id}" data-season="${index}" ${!released(season) && key !== "plan" ? "disabled" : ""}>${label}</button>`).join("")}</div>
          </div>
        </div>
      </div>
    </section>
    <div class="show-body">
      <div>
        ${multi ? `<h3>Seasons <span class="muted" style="font-weight:600;font-size:14px">· ${seasons.length} on AniList, all in one place</span></h3>${seasonStrip(show, index)}` : ""}
        <h3>Story</h3><p class="show-about">${esc(show.about)}</p>
        <h3>${multi ? `${season.label} episodes` : "Episodes"} <span class="muted" style="font-weight:600;font-size:14px">· tap the last one you watched</span></h3>${epsGrid}
      </div>
      <aside>
        <div class="side-card"><h3>Details</h3><dl class="facts">
          <dt>Genres</dt><dd>${show.genres.join(", ")}</dd>
          ${multi ? `<dt>Seasons</dt><dd>${seasons.filter((s) => s.format !== "MOVIE").length}${seasons.some((s) => s.format === "MOVIE") ? ` + ${seasons.filter((s) => s.format === "MOVIE").length} movie${seasons.filter((s) => s.format === "MOVIE").length > 1 ? "s" : ""}` : ""}</dd>` : ""}
          <dt>Episodes</dt><dd>${multi ? `${totalEps} total` : show.episodes || "Ongoing"}</dd>
          <dt>Year</dt><dd>${show.year || "–"}${multi && lastYear && lastYear !== show.year ? `–${lastYear}` : ""}</dd><dt>Studio</dt><dd>${esc(show.studio) || "–"}</dd><dt>Score</dt><dd>${score(show)} / 10</dd></dl></div>
        <div class="side-card"><h3>Where to watch</h3>${onCr
          ? `<div class="where on">${CR_MARK}<div><b>Crunchyroll</b><small>Plays in the Crunchyroll tab Crunchilist manages</small></div></div>`
          : `${streams.map((link) => `<a class="where" href="${esc(link.url)}" target="_blank" rel="noopener"><span class="where-dot">${esc(link.site[0])}</span><div><b>${esc(link.site)}</b><small>Opens in a new tab</small></div>${icon("right")}</a>`).join("") || `<p class="muted">AniList doesn't list a streaming site for this one.</p>`}
            <div class="where off">${OFF_MARK}<div><b>Not on Crunchyroll</b><small>Tracking and AniList sync still work</small></div></div>`}</div>
        <div class="side-card"><h3>Tags</h3><div class="tag-list">${show.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div></div>
        <div class="side-card"><a class="btn ghost" style="width:100%" href="https://anilist.co/anime/${season.anilistId || show.anilistId}" target="_blank" rel="noopener">Open ${multi ? `${season.label.toLowerCase()} ` : ""}on AniList</a></div>
      </aside>
    </div>
    ${rail("More like this", similar(show))}`;
  }

  function pageSettings() {
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
        <div class="set-row"><div class="grow"><b>Trailer previews</b><small>Play a muted trailer when you rest on a card</small></div><button class="switch" data-pref="previews"></button></div>
        <div class="set-row"><div class="grow"><b>Preview sound</b><small>One setting for every preview. The volume slider lives in the header</small></div><button class="switch" data-pref="sound"></button></div>
        <div class="set-row"><div class="grow"><b>Performance mode</b><small>Turns off motion, blur and autoplay</small></div><button class="switch" data-pref="reduce"></button></div>
      </div>
      <div class="set-card"><h3>Playback</h3><p>Browse in Crunchilist, watch on Crunchyroll. Episodes always play on Crunchyroll's own site, so your account, quality and subtitles work as normal.</p>
        <div class="set-row"><span class="conn ${extension ? "on" : ""}"></span><div class="grow"><b>${extension ? `Connected to the Crunchilist extension ${extension.version}` : "Crunchilist extension not connected"}</b><small>${extension ? "Play opens the exact episode, and these settings are saved in the extension" : "Load Crunchilist 1.0.72 or newer in Chrome, then refresh this page. Until then Play only opens the show page"}</small></div>${extension ? "" : `<button class="btn sm" data-act="reconnect">Try again</button>`}</div>
        <div class="set-row"><div class="grow"><b>Open episodes in</b><small>${{ tab: "One Crunchyroll tab that Crunchilist reuses every time you press Play", window: "One pop-out Crunchyroll window with no tabs or address bar, reused every time", new: "A new Crunchyroll tab every time you press Play" }[prefs.openIn]}</small></div>
          <div class="seg">${[["tab", "One tab"], ["window", "Pop-out window"], ["new", "New tab"]].map(([v, l]) => `<button class="${prefs.openIn === v ? "on" : ""}" data-choice="openIn:${v}">${l}</button>`).join("")}</div></div>
        <div class="set-row"><div class="grow"><b>Multiple tab management</b>
            <small>Keeps Crunchyroll to one tab. If a Crunchyroll page opens in another tab (from a link, a bookmark, or a search result), Crunchilist offers to move it into your Crunchilist-opened Crunchyroll tab and close the extra one. It only touches Crunchyroll tabs, never closes anything without asking${prefs.tabAuto ? " (or showing Undo)" : ""}, and does nothing when that tab isn't open.</small></div>
          <button class="switch" data-pref="tabManage"></button></div>
        ${prefs.tabManage ? `<div class="set-row sub-row"><div class="grow"><b>When an extra Crunchyroll tab opens</b><small>${prefs.tabAuto ? "Moved into your Crunchyroll tab right away, with an Undo button there" : "That tab shows a small bar asking whether to move it"}</small></div>
          <div class="seg"><button class="${prefs.tabAuto ? "" : "on"}" data-choice="tabAuto:false">Ask me</button><button class="${prefs.tabAuto ? "on" : ""}" data-choice="tabAuto:true">Move automatically</button></div></div>
` : ""}
        <div class="set-row"><div class="grow"><b>“Back to Crunchilist” on Crunchyroll</b><small>Adds a button at the top of Crunchyroll pages that switches back to this tab instead of opening a new one</small></div><button class="switch" data-pref="backButton"></button></div>
        <div class="set-row"><div class="grow"><b>Show tips</b><small>Short pointers, like where the preview volume and theme controls are here, and the “Back to Crunchilist” button when an episode opens. Turning this back on shows them again</small></div><button class="switch" data-pref="showTips"></button></div>
        <div class="set-row"><div class="grow"><b>Switch between Crunchilist and Crunchyroll</b><small>${extension && extension.shortcut === "" ? "Chrome didn't assign this shortcut, usually because another extension already uses the keys. Pick one in Chrome's extension shortcuts" : "Keyboard shortcut, changeable in Chrome's extension shortcuts"}</small></div>${(extension?.shortcut ?? "Alt+Shift+C").split("+").filter(Boolean).map((key) => `<kbd class="kbd">${esc(key)}</kbd>`).join("")}${extension && "shortcut" in extension ? `<button class="btn ghost" data-act="shortcuts">${extension.shortcut ? "Change" : "Set shortcut"}</button>` : ""}</div>
      </div>
      <div class="set-card"><h3>Accounts</h3><p>Crunchilist keeps your list locally and syncs it to AniList.</p>${accountRows()}</div>
      <div class="set-card"><h3>AI search</h3><p>Ranks your top picks and writes the short “why”.</p>
        <div class="set-row"><div class="grow"><b>Provider</b><small>Gemini · key saved on this device only</small></div><select class="select"><option>Gemini</option><option>OpenAI</option><option>Off</option></select></div>
      </div>
    </div>`;
  }

  // Accounts: the AniList name and avatar come from the extension when it's connected.
  const SAMPLE_ACCOUNT = { name: "phoni", connected: true, expired: false, avatar: "" };
  const account = () => (extension?.account ? extension.account : SAMPLE_ACCOUNT);
  function avatarHtml(size = "") {
    const { name, avatar } = account();
    return avatar ? `<img class="avatar ${size}" src="${esc(avatar)}" alt="">` : `<span class="avatar ${size}">${esc((name || "?")[0].toUpperCase())}</span>`;
  }
  function accountRows() {
    const user = account();
    const anilist = user.connected ? `Connected as ${esc(user.name)} · all changes synced`
      : user.expired ? `Sign-in for ${esc(user.name)} expired. Reconnect to keep syncing`
      : user.name ? `Imported ${esc(user.name)}'s public list. Connect to sync changes back`
      : "Not connected. Connect to import your list and sync progress";
    return `<div class="set-row"><div class="avatar">CR</div><div class="grow"><b>Crunchyroll</b><small>Signed in · catalog refreshed today</small></div><button class="btn sm">Refresh catalog</button></div>
        <div class="set-row">${user.avatar ? `<img class="avatar" src="${esc(user.avatar)}" alt="">` : `<div class="avatar">AL</div>`}<div class="grow"><b>AniList</b><small>${anilist}</small></div><button class="btn sm ${user.connected ? "ghost" : "accent"}">${user.connected ? "Disconnect" : user.expired ? "Reconnect" : "Connect"}</button></div>
        <div class="set-row">${icon("history")}<div class="grow"><b>Import Crunchyroll history</b><small>Last run Oct 9 · 12 shows waiting for review</small></div><button class="btn sm accent">Review</button></div>`;
  }
  function profilePop() {
    const user = account();
    return `<div class="profile-head">${avatarHtml("lg")}<div><b>${esc(user.name || "Not signed in")}</b><small>${user.connected ? "AniList account" : user.name ? "AniList (not connected)" : "Connect AniList to sync"}</small></div></div>
      <h4>Accounts</h4>${accountRows()}<a href="#settings">All settings →</a>`;
  }
  function paintAccount() {
    const button = document.querySelector(".profile-btn");
    if (button) { button.innerHTML = avatarHtml(); button.title = account().name ? `${account().name} · Accounts` : "Accounts"; }
    const pop = document.querySelector("#profile-pop");
    if (pop) pop.innerHTML = profilePop();
  }

  // Notifications
  function notes() {
    const watching = inStatus("watching");
    return [
      ...watching.slice(0, 3).map((show, i) => ({ show, title: show.title, text: `${epLabel(show, true).replace(/ of \d+$/, "")} is out`, unread: i < 2, acts: ["Watch", "Mark watched"] })),
      ...SHOWS.filter(nextSeason).slice(0, 1).map((show) => ({ show, title: show.title, text: `${nextSeason(show).label} is out. You finished the last one`, unread: true, acts: ["Start it"] })),
      { show: find(/kaze no stigma/i) || SHOWS[0], title: "History import ready", text: "12 shows from your Crunchyroll history are waiting for review", unread: true, acts: ["Review"] },
      { show: lastFinished() || SHOWS[1], title: "Finished a series", text: "Moved to Finished and synced to AniList", unread: false, acts: ["Rate it"] },
    ];
  }
  function drawer() {
    const list = notes();
    return `<div class="scrim" data-act="close-drawer"></div>
    <aside class="drawer"><div class="drawer-head"><h3>Notifications</h3><button class="btn sm ghost">Mark all read</button><button class="nav-btn" data-act="close-drawer" aria-label="Close notifications">${icon("close")}</button></div>
      <div class="drawer-list">${list.map((n) => `<div class="note ${n.unread ? "unread" : ""}" data-show="${n.show.id}"><img src="${n.show.cover}" alt=""><div><b>${esc(n.title)}</b><p>${esc(n.text)}</p>
        <div class="acts">${n.acts.map((a, i) => `<button class="btn sm ${i ? "ghost" : "accent"}">${a}</button>`).join("")}</div></div></div>`).join("")}</div></aside>`;
  }

  // "by Phoniix" with the Phoniix mark standing in for the P. The viewBox is cropped to the mark so it sits like a capital.
  function nav() {
    const unread = notes().filter((n) => n.unread).length;
    return `<nav class="nav">
      <a class="brand" href="#"><img class="brand-logo" src="/icons/crunchilist-logo.svg" alt=""><span class="brand-word">Crunchilist<small>by Phoniix</small></span></a>
      <a class="nav-link" data-route="home" href="#">${icon("home")}<span>Home</span></a>
      <a class="nav-link" data-route="browse" href="#browse">${icon("compass")}<span>Browse</span></a>
      <a class="nav-link" data-route="airing" href="#airing">${icon("calendar")}<span>Airing</span></a>
      <a class="nav-link" data-route="list" href="#list">${icon("list")}<span>My list</span></a>
      <span class="nav-spacer"></span>
      <div class="vol">${soundButton("nav-btn")}<input class="vol-range" type="range" min="0" max="100" step="1" value="${soundOn() ? prefs.volume : 0}" style="--v:${soundOn() ? prefs.volume : 0}%" aria-label="Preview volume"></div>
      <button class="nav-btn" data-act="theme" title="Theme">${icon("palette")}</button>
      <button class="nav-btn" data-act="drawer" title="Notifications">${icon("bell")}<span class="dot">${unread}</span></button>
      <a class="nav-btn" data-route="settings" href="#settings" title="Settings">${icon("gear")}</a>
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
  ];
  const TIPS_SEEN = "clmock-tips";
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
    if (!step || !prefs.showTips) return localStorage.setItem(TIPS_SEEN, "1");
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
  function startTips() {
    if (!prefs.showTips || localStorage.getItem(TIPS_SEEN) === "1" || document.body.dataset.page !== "home" || document.querySelector(".tip")) return;
    showTip(0);
  }

  // Trailer previews
  let hoverTimer = 0;
  let playing = null;
  const ytUrl = (id, muted) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${id}&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&cc_load_policy=0&disablekb=1&fs=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;

  // One global sound setting for every preview: muted or not, plus a volume.
  const soundOn = () => prefs.sound && prefs.volume > 0;
  // Chrome pauses a video that unmutes before the page has had a click or key press,
  // so trailers stay muted until then and pick up the sound setting on the first interaction.
  const canUnmute = () => !hushed && (navigator.userActivation?.hasBeenActive ?? true);
  // Previews go quiet while Crunchyroll is open (Play, the switch shortcut, or another window taking focus),
  // without touching the saved sound setting, and speak again when this page is back in front.
  let hushed = false;
  function hush(on) {
    if (hushed === on) return;
    hushed = on;
    for (const p of players) p.applySound();
  }
  document.addEventListener("visibilitychange", () => hush(document.hidden));
  addEventListener("blur", () => setTimeout(() => { if (document.activeElement?.tagName !== "IFRAME") hush(true); }));
  addEventListener("focus", () => { if (!document.hidden) hush(false); });
  for (const type of ["pointerdown", "keydown"]) {
    addEventListener(type, function unlock() {
      removeEventListener(type, unlock, true);
      setTimeout(() => { for (const p of players) p.applySound(); });
    }, true);
  }
  const soundIcon = () => icon(!soundOn() ? "muted" : prefs.volume < 50 ? "soundLow" : "sound");
  const soundButton = (cls) => `<button class="${cls}" data-act="sound" title="${soundOn() ? "Mute previews" : "Unmute previews"}">${soundIcon()}</button>`;
  function applySound() {
    const level = soundOn() ? prefs.volume : 0;
    for (const p of players) p.applySound();
    document.querySelectorAll('[data-act="sound"]').forEach((el) => { el.innerHTML = soundIcon(); el.title = soundOn() ? "Mute previews" : "Unmute previews"; });
    document.querySelectorAll(".vol-range").forEach((el) => { el.value = level; el.style.setProperty("--v", `${level}%`); });
    document.querySelectorAll('[data-pref="sound"]').forEach((el) => el.classList.toggle("on", prefs.sound));
    localStorage.setItem("clmock-prefs", JSON.stringify(prefs));
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
  window.addEventListener("message", (event) => {
    if (!/youtube(-nocookie)?\.com$/.test(event.origin.replace(/^https?:\/\//, ""))) return;
    const player = [...players].find((p) => p.frame.contentWindow === event.source);
    if (!player) return;
    let data;
    try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
    const info = data?.info || {};
    if (info.playerState === 1 && player.paused) player.post({ event: "command", func: "pauseVideo", args: [] });
    if (typeof info.playerState === "number") {
      if (info.playerState === 1 && player.state !== 1) { player.post({ event: "command", func: "unloadModule", args: ["captions"] }); player.applySound(); }
      player.state = info.playerState;
    }
    if (typeof info.currentTime === "number") player.time = info.currentTime;
    if (typeof info.duration === "number" && info.duration) player.duration = info.duration;
    const nearEnd = player.duration && player.duration - player.time < 1.2;
    player.box.classList.toggle("live", player.state === 1 && !player.paused && player.time > 0.6 && !nearEnd);
  });
  // Always starts muted so autoplay is never blocked, then picks up the global sound setting once playing.
  function player(box, id) {
    const frame = document.createElement("iframe");
    frame.allow = "autoplay; encrypted-media";
    frame.tabIndex = -1;
    frame.src = ytUrl(id, true);
    const post = (message) => frame.contentWindow?.postMessage(JSON.stringify({ ...message, id: 1, channel: "widget" }), "*");
    const applySound = () => {
      post({ event: "command", func: "setVolume", args: [prefs.volume] });
      post({ event: "command", func: soundOn() && canUnmute() ? "unMute" : "mute", args: [] });
    };
    const entry = { frame, box, post, applySound, state: -1, time: 0, duration: 0 };
    frame.addEventListener("load", () => {
      post({ event: "listening" });
      post({ event: "command", func: "addEventListener", args: ["onStateChange"] });
    });
    players.add(entry);
    box.classList.remove("live");
    box.replaceChildren(frame);
    return {
      pause: () => { entry.paused = true; post({ event: "command", func: "pauseVideo", args: [] }); },
      play: () => { entry.paused = false; post({ event: "command", func: "playVideo", args: [] }); },
      destroy: () => { players.delete(entry); box.classList.remove("live"); box.replaceChildren(); },
    };
  }

  // Only one trailer plays at a time: pages listen for this to pause their own banner video.
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
    if (!prefs.previews || prefs.reduce || !show?.trailer) return;
    hoverTimer = setTimeout(() => {
      stopPreview();
      playing = cardEl;
      cardEl.classList.add("previewing");
      cardEl.player = player(cardEl.querySelector(".pv"), show.trailer);
      announcePreview();
    }, design.previewDelay ?? 900);
  }
  function openTrailer(id) {
    stopPreview();
    const show = byId.get(id);
    const modal = document.createElement("div");
    modal.className = "trailer-modal";
    modal.innerHTML = `<div class="trailer-box"><iframe src="${ytUrl(show.trailer, false).replace("controls=0", "controls=1")}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe><button class="nav-btn" data-act="close-trailer">${icon("close")}</button></div>`;
    document.body.append(modal);
    announcePreview();
  }

  // Playback goes through the Crunchilist extension, which owns the Crunchyroll tab. Unpacked extensions get an id from their folder path.
  const EXTENSION_ID = localStorage.getItem("clmock-extension") || "gnipbjamobhdlakdlgpjhfcjcbbjoefh";
  let extension = null;
  function askExtension(message) {
    return new Promise((resolve) => {
      const runtime = window.chrome?.runtime;
      if (!runtime?.sendMessage) return resolve(null);
      try {
        runtime.sendMessage(EXTENSION_ID, message, (reply) => {
          void runtime.lastError;
          resolve(reply || null);
        });
      } catch {
        resolve(null);
      }
    });
  }
  async function connectExtension(tries = 3) {
    let reply = await askExtension({ type: "ping" });
    for (let i = 1; i < tries && !reply?.ok; i++) {
      await new Promise((done) => setTimeout(done, 1200));
      reply = await askExtension({ type: "ping" });
    }
    extension = reply?.ok ? reply : null;
    if (extension?.playback) Object.assign(prefs, extension.playback);
    paintAccount();
    if (document.body.dataset.page === "settings") rerender();
  }
  async function setPlayback(patch) {
    Object.assign(prefs, patch);
    const reply = extension ? await askExtension({ type: "setPlayback", patch }) : null;
    if (reply?.ok) Object.assign(prefs, reply.playback);
    rerender();
  }

  const onCrunchyroll = (show) => show.onCrunchyroll !== false;
  // Which season and episode Play should open: the next unwatched episode of the season in view, or of the show.
  function playTarget(show, seasonArg) {
    const seasons = seasonsOf(show);
    const item = entry(show);
    const next = nextSeason(show);
    let index = seasonArg ?? (next ? seasons.indexOf(next) : item?.index ?? 0);
    index = Math.min(Math.max(0, index), seasons.length - 1);
    const state = seasonState(show, index);
    const total = seasons[index].episodes || Infinity;
    const episode = state?.status === "watching" ? Math.min(state.progress + 1, total) : 1;
    const season = seasons[index];
    const multi = seasons.length > 1;
    const label = season.format === "MOVIE" ? season.label : `${multi ? `${season.label} · ` : ""}Episode ${episode}`;
    return { index, season, episode, label, crSeason: seasons.slice(0, index).filter((s) => s.format !== "MOVIE").length, multi };
  }
  function playLabel(show, seasonArg) {
    if (!onCrunchyroll(show)) return "Where to watch";
    const target = playTarget(show, seasonArg);
    const started = seasonState(show, target.index)?.status === "watching";
    return target.season.format === "MOVIE" ? `Watch ${target.season.label.toLowerCase()}` : `${started ? "Continue" : "Watch"} ${target.multi ? `${target.season.label.toLowerCase()} · ` : ""}episode ${target.episode}`;
  }
  async function play(show, seasonArg) {
    if (!onCrunchyroll(show)) {
      location.hash = `show/${show.id}`;
      return toast(`${show.title} isn't on Crunchyroll${show.streaming?.length ? `. It streams on ${show.streaming.map((link) => link.site).join(", ")}` : ""}`);
    }
    stopPreview();
    hush(true);
    setTimeout(() => { if (document.hasFocus() && !document.hidden) hush(false); }, 2000);
    const target = playTarget(show, seasonArg);
    const reply = await askExtension({ type: "playEpisode", seriesId: show.id, season: target.crSeason, episode: target.episode, title: show.title, seasonLabel: target.multi ? target.season.label : "" });
    if (reply?.ok) {
      const where = reply.mode === "window" ? "Crunchyroll window" : reply.mode === "new" ? "a new Crunchyroll tab" : "your Crunchyroll tab";
      return toast(reply.waiting ? `Opening Crunchyroll. It jumps to ${target.label.toLowerCase()} as soon as the page loads` : reply.exact ? `Playing ${target.label.toLowerCase()} in ${where}` : `Couldn't find ${target.label.toLowerCase()}, so this opened the show page`);
    }
    if (reply) { hush(false); return toast(reply.error || "Couldn't open Crunchyroll"); }
    window.open(`https://www.crunchyroll.com/series/${show.id}`, "crunchilist-player");
    toast("The Crunchilist extension isn't connected, so this opened the show page");
  }

  function toast(text) {
    const el = document.querySelector(".toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  // Router
  function route() {
    stopPreview();
    if (!route.keep) fadeTip();
    const [path, arg, sub] = location.hash.replace(/^#/, "").split("/");
    const [name, query] = path.split("?");
    const main = document.querySelector("main");
    const decode = (text) => { try { return decodeURIComponent(text); } catch { return text; } };
    const pages = { search: () => pageSearch(query ? decode(query.replace(/^q=/, "")) : ""), list: () => pageList(arg), show: () => pageShow(arg, sub), settings: pageSettings, browse: () => pageBrowse(arg ? decode(arg) : route.keep ? undefined : ""), airing: pageAiring };
    const page = pages[name] ? name : "home";
    document.body.dataset.page = page;
    main.innerHTML = page === "home" ? design.home(api) : pages[page]();
    document.querySelectorAll("[data-route]").forEach((el) => el.classList.toggle("on", el.dataset.route === page));
    if (page === "search") paintResults();
    if (page === "browse") paintBrowse();
    const strip = main.querySelector(".seasons");
    const on = strip?.querySelector(".season.on");
    if (on) strip.scrollLeft = on.offsetLeft - strip.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2;
    design.after?.(page, api);
    applyTheme();
    const where = `${name}/${arg}`;
    if (!route.keep && where !== route.last) window.scrollTo({ top: 0 });
    route.keep = false;
    route.last = where;
  }
  const rerender = () => { route.keep = true; route(); };

  function bind() {
    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-act],[data-choice],[data-set-palette],[data-set-mode],[data-set-size],[data-pref],[data-chip],[data-mood],[data-status],[data-ep],[data-view],[data-genre],[data-bflag],[data-airing-mine],[data-tag-add],[data-tag-flip],[data-tag-remove],[data-tag],[data-show],a");
      if (event.target.closest("[data-tip-next]")) return fadeTip(() => showTip(Number(event.target.closest("[data-tip-next]").dataset.tipNext)));
      if (event.target.classList.contains("trailer-modal")) { event.target.remove(); return announcePreview(); }
      if (document.querySelector(".tip.show") && !event.target.closest(".tip, .tip-target")) fadeTip();
      if (!event.target.closest('[data-act="profile"], [data-act="theme"]')) closePop(event);
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
      if (act === "sound") return toggleSound();
      if (target.dataset.pref === "sound") return toggleSound();
      if (target.dataset.pref === "showTips" && !prefs.showTips) localStorage.removeItem(TIPS_SEEN);
      if (["tabManage", "backButton", "showTips"].includes(target.dataset.pref)) return setPlayback({ [target.dataset.pref]: !prefs[target.dataset.pref] });
      if (target.dataset.pref) { prefs[target.dataset.pref] = !prefs[target.dataset.pref]; stopPreview(); return document.body.dataset.page === "settings" ? rerender() : applyTheme(); }
      if (target.dataset.chip) { searchState.chips.has(target.dataset.chip) ? searchState.chips.delete(target.dataset.chip) : searchState.chips.add(target.dataset.chip); target.classList.toggle("on"); return paintResults(); }
      if (target.dataset.mood) { searchState.q = target.dataset.mood; document.querySelector("#q").value = searchState.q; return paintResults(); }
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
      if (target.dataset.status && show) {
        const index = Number(target.dataset.season ?? entry(show)?.index ?? 0);
        const season = seasonsOf(show)[index];
        const status = target.dataset.status;
        if (status === "finished") for (let i = 0; i < index; i++) if (!seasonState(show, i) && seasonsOf(show)[i].format !== "MOVIE") setSeason(show, i, { status: "finished", progress: seasonEps(seasonsOf(show)[i]) });
        setSeason(show, index, { status, progress: status === "finished" ? seasonEps(season) : seasonState(show, index)?.progress || 0 });
        saveLibrary(); toast(`${show.title}${seasonsOf(show).length > 1 ? ` ${season.label}` : ""} → ${STATUS[status]}`); return rerender();
      }
      if (target.dataset.ep && show == null) {
        const current = byId.get(location.hash.split("/")[1]);
        const index = Number(target.dataset.season || 0);
        const season = seasonsOf(current)[index];
        const n = Number(target.dataset.ep);
        const done = n >= (season.episodes || Infinity);
        setSeason(current, index, { status: done ? "finished" : "watching", progress: n });
        saveLibrary();
        const next = seasonsOf(current)[index + 1];
        toast(done && next && released(next) ? `${season.label} done. ${next.label} is next` : `Watched through episode ${n}`);
        return rerender();
      }
      if (act === "rail-prev" || act === "rail-next") { const r = target.parentElement.querySelector(".rail"); return r.scrollBy({ left: (act === "rail-next" ? 1 : -1) * r.clientWidth * 0.85, behavior: "smooth" }); }
      if (act === "drawer") return document.body.classList.add("drawer-open");
      if (act === "close-drawer") return document.body.classList.remove("drawer-open");
      if (act === "theme") { document.querySelector("#profile-pop")?.classList.remove("open"); const pop = document.querySelector("#theme-pop"); const r = target.getBoundingClientRect(); pop.style.top = `${Math.min(r.bottom + 10, innerHeight - 280)}px`; pop.style.left = `${Math.max(12, Math.min(r.left - 120, innerWidth - 300))}px`; pop.classList.toggle("open"); event.stopPropagation(); return; }
      if (act === "profile") {
        const pop = document.querySelector("#profile-pop");
        const r = target.getBoundingClientRect();
        document.querySelector("#theme-pop")?.classList.remove("open");
        pop.style.top = `${r.bottom + 10}px`;
        pop.style.right = `${Math.max(12, innerWidth - r.right - 8)}px`;
        pop.style.left = "auto";
        pop.classList.toggle("open");
        event.stopPropagation();
        return;
      }
      if (target.closest("#profile-pop") && target.tagName === "A") document.querySelector("#profile-pop").classList.remove("open");
      if (act === "trailer") return openTrailer(target.dataset.show);
      if (act === "close-trailer") { target.closest(".trailer-modal").remove(); return announcePreview(); }
      if (act === "search") { searchState.q = document.querySelector("#q").value; return paintResults(); }
      if (act === "go-search") { const input = target.closest("form, .home-search")?.querySelector("input"); location.hash = `search?q=${encodeURIComponent(input?.value || "")}`; return; }
      if (act === "toggle" && show) {
        if (entry(show)) { delete library[show.id]; toast(`Removed ${show.title}`); } else { setSeason(show, 0, { status: "plan", progress: 0 }); toast(`Added ${show.title} to Plan to watch`); }
        saveLibrary(); return rerender();
      }
      if (act === "plus-one") {
        const current = show || byId.get(location.hash.split("/")[1]);
        const index = Number(target.dataset.season ?? entry(current)?.index ?? 0);
        const season = seasonsOf(current)[index];
        const n = (seasonState(current, index)?.progress || 0) + 1;
        setSeason(current, index, { status: n >= (season.episodes || Infinity) ? "finished" : "watching", progress: n });
        saveLibrary(); toast(`${current.title}: ${seasonsOf(current).length > 1 ? `${season.label} ` : ""}episode ${n} watched`); return rerender();
      }
      if (act === "shortcuts") return askExtension({ type: "openShortcuts" });
      if (act === "reconnect") return connectExtension().then(() => toast(extension ? "Connected" : "Still can't reach the extension"));
      if (act === "watch" && show) return play(show, target.dataset.season != null ? Number(target.dataset.season) : undefined);
      if (target.dataset.choice) {
        const [key, value] = target.dataset.choice.split(":");
        const parsed = value === "true" ? true : value === "false" ? false : value;
        if (["openIn", "tabAuto"].includes(key)) return setPlayback({ [key]: parsed });
        prefs[key] = parsed;
        return rerender();
      }
      if (target.tagName === "A") return;
      if (show && !target.closest("button")) location.hash = `show/${show.id}`;
    });
    document.addEventListener("input", (event) => {
      if (event.target.matches(".vol-range")) { prefs.volume = Number(event.target.value); prefs.sound = prefs.volume > 0; return applySound(); }
      if (event.target.id === "q") { searchState.q = event.target.value; clearTimeout(bind.t); bind.t = setTimeout(paintResults, 250); }
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
      if (event.target.id === "sort") { searchState.sort = event.target.value; paintResults(); }
      if (event.target.dataset.browse) { browse[event.target.dataset.browse] = event.target.value; paintBrowse(); }
      if (event.target.matches("[data-tip-off]") && event.target.checked) {
        localStorage.setItem(TIPS_SEEN, "1");
        setTimeout(() => fadeTip(() => setPlayback({ showTips: false })), 700);
      }
    });
    document.addEventListener("focusin", (event) => { if (event.target.id === "tag-q") paintTagMenu(true); });
    document.addEventListener("focusout", (event) => {
      if (event.target.id === "tag-q") setTimeout(() => { if (!document.activeElement?.closest(".tag-box")) paintTagMenu(false); }, 0);
    });
    // Keeps the tag input focused while picking from its menu.
    document.addEventListener("pointerdown", (event) => { if (event.target.closest(".tag-menu")) event.preventDefault(); });
    document.addEventListener("keydown", (event) => {
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
      if (event.key === "Enter" && event.target.matches(".home-search input")) location.hash = `search?q=${encodeURIComponent(event.target.value)}`;
      if ((event.key === "Enter" || event.key === " ") && event.target.matches(".card[data-show], .wide[data-show]")) {
        event.preventDefault();
        location.hash = `show/${event.target.dataset.show}`;
      }
      if (event.key === "Escape") { document.body.classList.remove("drawer-open"); document.querySelector(".trailer-modal")?.remove(); document.querySelector("#theme-pop")?.classList.remove("open"); document.querySelector("#profile-pop")?.classList.remove("open"); }
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

  const api = { SHOWS, byId, find, icon, esc, score, eps, clip, card, wide, rail, grid, entry, inStatus, seasonsOf, epLabel, seasonCount, nextSeason, popular, fresh, unseen, similar, forYou, lastFinished, STATUS, MOODS, prefs: () => ({ ...prefs }), ytUrl, player, soundButton, onCrunchyroll, playLabel, crBadge };

  window.Mock = {
    start(config) {
      design = config;
      loadLibrary();
      loadTheme();
      window.name = "crunchilist-app";
      document.body.innerHTML = `${nav()}<main></main>${drawer()}${themePop()}<div class="pop profile-pop" id="profile-pop" role="dialog" aria-label="Accounts"></div><div class="toast"></div>`;
      paintAccount();
      bind();
      route();
      connectExtension().finally(() => setTimeout(startTips, 600));
    },
    api,
    rerender: () => rerender(),
  };
})();
