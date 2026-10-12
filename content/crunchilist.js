(() => {
  // lib/text.js
  function uniqueStrings(values, max = 40) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const value of values || []) {
      const text2 = String(value || "").replace(/\s+/g, " ").trim();
      if (!text2 || text2.length > 48) continue;
      const key = text2.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text2);
      if (out.length >= max) break;
    }
    return out;
  }
  function slugify(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  }
  function numberOrNull(value) {
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  // lib/page-model.js
  function seriesIdFromHref(href) {
    if (!href) return null;
    const path = String(href).split("?")[0].split("#")[0];
    const match = path.match(/\/series\/([A-Za-z0-9]+)(?:\/|$)/);
    return match ? match[1] : null;
  }
  function pageKindFromPath(pathname) {
    const parts = String(pathname || "").split("/").filter(Boolean);
    const seriesAt = parts.indexOf("series");
    const watchAt = parts.indexOf("watch");
    if (seriesAt >= 0) {
      return {
        kind: "series",
        seriesId: parts[seriesAt + 1] || null,
        slug: parts[seriesAt + 2] || null
      };
    }
    if (watchAt >= 0) {
      return { kind: "watch", seriesId: null, watchId: parts[watchAt + 1] || null };
    }
    return { kind: "browse", seriesId: null };
  }
  function crunchyrollSeriesUrl(seriesId, slug) {
    const suffix = slug ? `/${slug}` : "";
    return `https://www.crunchyroll.com/series/${seriesId}${suffix}`;
  }
  function asList(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.items)) return payload.items;
    if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
    if (payload.type === "episode" || payload.episode_metadata) return [payload];
    return [];
  }
  function parseCmsObjects(payload) {
    const episodes = [];
    for (const item of asList(payload)) {
      if (item?.type && item.type !== "episode" && !item.episode_metadata) continue;
      const meta = item?.episode_metadata || item;
      if (!meta?.series_id) continue;
      const seasonSlug = meta.season_slug_title || (meta.season_id ? `id-${meta.season_id}` : "");
      if (!seasonSlug) continue;
      episodes.push({
        episodeId: item.id || meta.id || null,
        episodeNumber: numberOrNull(meta.episode_number),
        seasonId: meta.season_id || null,
        seasonNumber: numberOrNull(meta.season_number),
        seasonTitle: meta.season_title || "",
        seasonSlug,
        seriesId: meta.series_id,
        seriesSlug: meta.series_slug_title || "",
        seriesTitle: meta.series_title || "",
        audioLocale: meta.audio_locale || "",
        isDubbed: Boolean(meta.is_dubbed)
      });
    }
    return episodes;
  }
  function parseCmsSeasons(payload) {
    const seasons = [];
    for (const item of asList(payload)) {
      if (!item?.series_id) continue;
      const seasonSlug = item.slug_title || (item.id ? `id-${item.id}` : "");
      if (!seasonSlug) continue;
      seasons.push({
        seasonId: item.id || null,
        title: item.title || "",
        seasonNumber: numberOrNull(item.season_number),
        seriesId: item.series_id,
        seasonSlug,
        episodeCount: numberOrNull(item.number_of_episodes)
      });
    }
    return seasons;
  }
  function episodeNumberFromLabel(text2) {
    if (!text2) return null;
    const match = String(text2).match(/\bE(\d+)\b/i);
    return match ? Number(match[1]) : null;
  }
  function episodeCountFromText(text2) {
    if (!text2) return null;
    const match = String(text2).match(/\b(\d+)\s+episodes?\b/i);
    return match ? Number(match[1]) : null;
  }
  function audioModeFromLocales(locales, dubbedFlags) {
    const values = (locales || []).map((locale) => String(locale || "").toLowerCase()).filter(Boolean);
    const japanese = values.some((locale) => locale.startsWith("ja"));
    const english = values.some((locale) => locale.startsWith("en"));
    if ((dubbedFlags || []).some(Boolean) && japanese) return "unknown";
    if ((dubbedFlags || []).some(Boolean) && !japanese) return "dub";
    if (japanese && english) return "unknown";
    if (japanese) return "sub";
    if (english) return "dub";
    return "unknown";
  }
  function inferAudioMode(audioText, subtitleText) {
    const audio = String(audioText || "");
    const subs = String(subtitleText || "");
    const audioLower = audio.toLowerCase();
    const dub = /\bdub(?:bed)?\b/.test(audioLower) || /\benglish\b/.test(audioLower) && !/\bjapanese\b/.test(audioLower);
    const sub = /\bsub(?:titled|titles)?\b/.test(audioLower) || /\bjapanese\b/.test(audioLower);
    let mode = "unknown";
    if (sub && dub) mode = "unknown";
    else if (dub) mode = "dub";
    else if (sub) mode = "sub";
    else if (/\benglish\b/.test(subs.toLowerCase()) && !audio) mode = "sub";
    return { mode, audioText: audio, subtitleText: subs };
  }
  function absoluteUrl(href, seriesId, slug) {
    if (href && /^https?:\/\//i.test(href)) return href.split("?")[0];
    if (href && href.startsWith("/")) return `https://www.crunchyroll.com${href.split("?")[0]}`;
    return crunchyrollSeriesUrl(seriesId, slug || "");
  }
  function dedupeAnchors(anchors) {
    const map = /* @__PURE__ */ new Map();
    for (const anchor of anchors || []) {
      const seriesId = anchor.seriesId || seriesIdFromHref(anchor.href);
      if (!seriesId) continue;
      const title = String(anchor.title || "").replace(/\s+/g, " ").trim();
      const previous = map.get(seriesId);
      if (!previous) {
        map.set(seriesId, {
          seriesId,
          title: title.slice(0, 140),
          href: anchor.href || "",
          url: absoluteUrl(anchor.href, seriesId, "")
        });
      } else if (!previous.title && title) {
        previous.title = title.slice(0, 140);
      }
    }
    return [...map.values()];
  }
  function buildObservation(facts) {
    const kindInfo = facts.kindInfo || pageKindFromPath(facts.pathname || "");
    const kind = facts.kind || kindInfo.kind || "browse";
    const cmsSeriesId = facts.cmsEpisodes?.find((episode) => episode.seriesId)?.seriesId || facts.cmsSeasons?.find((season) => season.seriesId)?.seriesId || null;
    const seriesId = facts.seriesId || kindInfo.seriesId || (kind === "watch" ? cmsSeriesId : null);
    const inferred = inferAudioMode(facts.audioText, facts.subtitleText);
    const locales = (facts.cmsEpisodes || []).map((episode) => episode.audioLocale);
    const cmsAudio = audioModeFromLocales(locales, (facts.cmsEpisodes || []).map((episode) => episode.isDubbed));
    const audio = inferred.mode !== "unknown" ? inferred.mode : cmsAudio;
    const pageGenres = uniqueStrings(facts.genres || []);
    const seasons = [];
    const seasonIndex = /* @__PURE__ */ new Map();
    function addSeason(partial) {
      if (!partial.seriesId || !partial.seasonSlug) return null;
      const key = `${partial.seriesId}|${partial.seasonSlug}`;
      let row = seasonIndex.get(key);
      if (!row) {
        row = {
          seriesId: partial.seriesId,
          seasonSlug: partial.seasonSlug,
          seasonId: null,
          seasonNumber: null,
          seasonTitle: "",
          seriesTitle: "",
          seriesSlug: "",
          episodeCount: null,
          url: "",
          audio,
          subtitles: facts.subtitleText || "",
          genres: [],
          watchingEpisode: null,
          movieSignal: Boolean(facts.movieSignal)
        };
        seasonIndex.set(key, row);
        seasons.push(row);
      }
      if (partial.seasonId) row.seasonId = partial.seasonId;
      if (partial.seasonNumber != null) row.seasonNumber = partial.seasonNumber;
      if (partial.seasonTitle) row.seasonTitle = partial.seasonTitle;
      if (partial.seriesTitle) row.seriesTitle = partial.seriesTitle;
      if (partial.seriesSlug) row.seriesSlug = partial.seriesSlug;
      if (partial.episodeCount != null) row.episodeCount = partial.episodeCount;
      if (partial.watchingEpisode != null) row.watchingEpisode = partial.watchingEpisode;
      row.audio = audio;
      row.url = crunchyrollSeriesUrl(row.seriesId, row.seriesSlug);
      if (partial.seriesId === seriesId) row.genres = pageGenres.slice();
      return row;
    }
    for (const season of facts.cmsSeasons || []) addSeason({
      seriesId: season.seriesId,
      seasonSlug: season.seasonSlug,
      seasonId: season.seasonId,
      seasonNumber: season.seasonNumber,
      seasonTitle: season.title,
      episodeCount: season.episodeCount,
      seriesTitle: facts.seriesTitle || "",
      seriesSlug: kindInfo.slug || ""
    });
    for (const episode of facts.cmsEpisodes || []) {
      addSeason({
        seriesId: episode.seriesId,
        seasonSlug: episode.seasonSlug,
        seasonId: episode.seasonId,
        seasonNumber: episode.seasonNumber,
        seasonTitle: episode.seasonTitle,
        seriesTitle: episode.seriesTitle,
        seriesSlug: episode.seriesSlug
      });
      if (kind === "watch" && facts.watchId && episode.episodeId === facts.watchId && episode.episodeNumber != null) {
        addSeason({
          seriesId: episode.seriesId,
          seasonSlug: episode.seasonSlug,
          watchingEpisode: episode.episodeNumber
        });
      }
    }
    if ((kind === "series" || kind === "watch") && !seasons.length && seriesId && (facts.seriesTitle || facts.activeSeasonTitle)) {
      addSeason({
        seriesId,
        seasonSlug: `dom-${slugify(facts.activeSeasonTitle || "season") || "season"}`,
        seasonTitle: facts.activeSeasonTitle || "",
        seriesTitle: facts.seriesTitle || "",
        seriesSlug: kindInfo.slug || "",
        episodeCount: facts.domEpisodeCount ?? null
      });
    }
    if (seasons.length === 1 && facts.domEpisodeCount != null && seasons[0].episodeCount == null) {
      seasons[0].episodeCount = facts.domEpisodeCount;
    }
    if (kind === "watch" && facts.domEpisodeNumber != null && seasons.length === 1 && seasons[0].watchingEpisode == null) {
      seasons[0].watchingEpisode = facts.domEpisodeNumber;
    }
    const sightings = dedupeAnchors(facts.anchors).map((anchor) => ({
      seriesId: anchor.seriesId,
      title: anchor.title,
      url: anchor.url,
      genres: anchor.seriesId === seriesId ? pageGenres.slice() : [],
      audio: anchor.seriesId === seriesId ? audio : "unknown"
    }));
    if (seriesId && (kind === "series" || kind === "watch") && !sightings.some((item) => item.seriesId === seriesId)) {
      const title = facts.seriesTitle || seasons.find((season) => season.seriesId === seriesId)?.seriesTitle || "";
      sightings.push({
        seriesId,
        title,
        url: crunchyrollSeriesUrl(seriesId, kindInfo.slug || seasons[0]?.seriesSlug || ""),
        genres: pageGenres.slice(),
        audio
      });
    }
    let currentKey = null;
    const ownSeasons = seriesId ? seasons.filter((season) => season.seriesId === seriesId) : seasons;
    if (facts.activeSeasonTitle) {
      const wantSlug = slugify(facts.activeSeasonTitle);
      const wantText = facts.activeSeasonTitle.trim().toLowerCase();
      const found = ownSeasons.find((season) => {
        const title = (season.seasonTitle || "").trim().toLowerCase();
        const loose = wantText.length >= 4 && title && (title.includes(wantText) || wantText.includes(title));
        return slugify(season.seasonTitle) === wantSlug || season.seasonSlug === wantSlug || season.seasonSlug === `dom-${wantSlug}` || loose;
      });
      if (found) currentKey = `${found.seriesId}|${found.seasonSlug}`;
    }
    if (!currentKey) {
      const watching = seasons.find((season) => season.watchingEpisode != null);
      if (watching) currentKey = `${watching.seriesId}|${watching.seasonSlug}`;
    }
    if (!currentKey && ownSeasons.length === 1) currentKey = `${ownSeasons[0].seriesId}|${ownSeasons[0].seasonSlug}`;
    if (!currentKey && kind === "watch" && seasons[0]) currentKey = `${seasons[0].seriesId}|${seasons[0].seasonSlug}`;
    return {
      kind,
      url: facts.pageUrl || "",
      seriesId,
      watchId: facts.watchId || kindInfo.watchId || null,
      seasons,
      sightings,
      currentKey,
      audio
    };
  }

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
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children) if (child) node.append(child);
    return node;
  }
  function progressMeter(label = "Progress") {
    const fill = el("span", { class: "cl-meter-fill" });
    const pct = el("span", { class: "cl-meter-pct", text: "0%" });
    const track = el("span", { class: "cl-meter-track", role: "progressbar", "aria-label": label, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, [fill]);
    const root = el("div", { class: "cl-meter", hidden: true }, [track, pct]);
    return {
      root,
      set(value) {
        const show = typeof value === "number" && Number.isFinite(value);
        root.hidden = !show;
        if (!show) return;
        const percent = Math.floor(Math.max(0, Math.min(1, value)) * 100);
        fill.style.width = `${percent}%`;
        pct.textContent = `${percent}%`;
        track.setAttribute("aria-valuenow", String(percent));
      }
    };
  }
  function setAvatar(holder, url, fallback) {
    if (!url || holder.dataset.failed === url) {
      holder.classList.remove("has-photo");
      holder.replaceChildren(fallback());
      return;
    }
    if (holder.querySelector("img")?.dataset.src === url) return;
    const image = el("img", { alt: "", referrerpolicy: "no-referrer", "data-src": url });
    image.addEventListener("error", () => {
      holder.dataset.failed = url;
      holder.classList.remove("has-photo");
      holder.replaceChildren(fallback());
    });
    image.src = url;
    holder.classList.add("has-photo");
    holder.replaceChildren(image);
  }
  var GLYPHS = {
    search: [["path", { d: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z" }], ["path", { d: "M15.5 15.5L20 20" }]],
    close: [["path", { d: "M7 7l10 10M17 7L7 17" }]],
    back: [["path", { d: "M14.5 6l-6 6 6 6" }]],
    history: [["path", { d: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3" }], ["path", { d: "M4.5 4.5v4h4" }], ["path", { d: "M12 8v4.5l3 2" }]],
    user: [["path", { d: "M12 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5z" }], ["path", { d: "M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" }]],
    sliders: [["path", { d: "M4 7h9M17 7h3M4 17h3M11 17h9" }], ["path", { d: "M15 4.5v5M9 14.5v5" }]],
    sparkle: [["path", { d: "M12 3.5l1.7 5.1 5.3 1.7-5.3 1.7L12 17.1l-1.7-5.1L5 10.3l5.3-1.7z" }], ["path", { d: "M18.5 16.5l.6 1.8 1.9.7-1.9.6-.6 1.9-.7-1.9-1.8-.6 1.8-.7z" }]],
    external: [["path", { d: "M14 5h5v5" }], ["path", { d: "M19 5l-8 8" }], ["path", { d: "M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" }]],
    refresh: [["path", { d: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3" }], ["path", { d: "M19.5 4.5v4h-4" }]],
    corner: [["path", { d: "M4 9V4h5M20 15v5h-5" }], ["path", { d: "M4 4l6 6M20 20l-6-6" }]],
    check: [["path", { d: "M5 12.5l4.5 4.5L19 7.5" }]],
    plus: [["path", { d: "M12 5v14M5 12h14" }]],
    bell: [["path", { d: "M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" }], ["path", { d: "M10 20.5a2 2 0 0 0 4 0" }]],
    eye: [["path", { d: "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" }], ["path", { d: "M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" }]],
    home: [["path", { d: "M4 11l8-6.5 8 6.5" }], ["path", { d: "M6 9.5V19h12V9.5" }]],
    play: [["path", { d: "M8 5.5v13l10.5-6.5z" }]],
    tag: [["path", { d: "M3.5 12.5V4.5h8l9 9-8 8z" }], ["path", { d: "M8 8.5h.01" }]],
    tagOff: [["path", { d: "M3.5 12.5V4.5h8l9 9-8 8z" }], ["path", { d: "M3 21L21 3" }]]
  };
  function icon(name, size = 18) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const [tag, attrs] of GLYPHS[name] || []) {
      const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      svg.append(node);
    }
    return svg;
  }
  var STATUS_OPTIONS = [
    ["", "Set status"],
    ["plan", "Plan to watch"],
    ["in_progress", "Watching"],
    ["finished", "Finished"],
    ["dropped", "Dropped"],
    ["clear", "Clear"]
  ];
  function fillStatusSelect(select, value) {
    select.replaceChildren();
    for (const [optionValue, label] of STATUS_OPTIONS) select.append(el("option", { value: optionValue, text: label }));
    select.value = value || "";
  }

  // ui/badge-style.js
  var BADGE_LABELS = {
    finished: "Watched",
    in_progress: "In progress",
    dropped: "Dropped",
    plan: "Plan",
    unwatched: "Unwatched"
  };
  var BADGE_STYLES = [
    ["glow", "Glow dot"],
    ["tinted", "Tinted glass"],
    ["footer", "Glass footer"],
    ["corner", "Corner with episode"]
  ];
  var BADGE_CORNERS = [
    ["bottom-left", "Bottom left"],
    ["bottom-right", "Bottom right"],
    ["top-left", "Top left"],
    ["top-right", "Top right"]
  ];
  var ICON_PATHS = {
    finished: [["path", { d: "M5 12.5l4.2 4.2L19 7", fill: "none", stroke: "currentColor", "stroke-width": "3", "stroke-linecap": "round", "stroke-linejoin": "round" }]],
    in_progress: [["path", { d: "M8 5.5v13l10.5-6.5z", fill: "currentColor" }]],
    plan: [["path", { d: "M7 4.5h10v15l-5-3.6-5 3.6z", fill: "currentColor" }]],
    dropped: [["path", { d: "M7 7l10 10M17 7L7 17", stroke: "currentColor", "stroke-width": "3", "stroke-linecap": "round" }]],
    unwatched: [["circle", { cx: "12", cy: "12", r: "5", fill: "none", stroke: "currentColor", "stroke-width": "2.6" }]]
  };
  var TONES = {
    finished: "244,117,33",
    in_progress: "255,195,90",
    plan: "88,166,255",
    dropped: "255,90,79",
    unwatched: "168,168,168"
  };
  var BADGE_CSS = `
  ${Object.entries(TONES).map(([mark, rgb]) => `.crl-t-${mark} { --crl-tone: rgb(${rgb}); --crl-rgb: ${rgb}; }`).join("\n  ")}
  .crl-badge {
    all: initial; position: absolute; z-index: 12; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px;
    color: #fff; font: 700 11px/1 ${ROUNDED}; letter-spacing: 0; text-transform: none; white-space: nowrap;
    cursor: pointer; pointer-events: auto; user-select: none;
    -webkit-backdrop-filter: blur(10px) saturate(1.5); backdrop-filter: blur(10px) saturate(1.5);
    transition: gap .18s ease, padding .18s ease, opacity .15s ease, filter .15s ease;
  }
  .crl-badge * { box-sizing: border-box; }
  .crl-badge:hover { filter: brightness(1.12); }
  .crl-badge:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .crl-bottom-left { left: 8px; bottom: 8px; }
  .crl-bottom-right { right: 8px; bottom: 8px; }
  .crl-top-left { left: 8px; top: 8px; }
  .crl-top-right { right: 8px; top: 8px; }
  .crl-dodge-x.crl-bottom-left, .crl-dodge-x.crl-top-left { left: auto; right: 8px; }
  .crl-dodge-x.crl-bottom-right, .crl-dodge-x.crl-top-right { right: auto; left: 8px; }
  .crl-inline { position: relative; margin: 0 0 6px; }
  .crl-ico { display: inline-grid; place-items: center; flex: none; width: 14px; height: 14px; border-radius: 50%; background: var(--crl-tone); color: #141414; box-shadow: 0 0 8px rgba(var(--crl-rgb), .7); }
  .crl-ico svg { width: 9px; height: 9px; display: block; }
  .crl-t-unwatched .crl-ico { background: transparent; color: #d0d0d0; box-shadow: none; }
  .crl-badge:not(.crl-footer):not(.crl-inline) { max-width: calc(100% - 16px); }
  .crl-word { display: inline-block; overflow: hidden; min-width: 0; flex: 0 1 auto; text-overflow: ellipsis; }
  .crl-sub { flex: none; color: rgba(255,255,255,.72); font-weight: 600; }

  .crl-glow {
    height: 24px; padding: 0 4px; gap: 0; border-radius: 999px;
    background: linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.04)); border: 1px solid rgba(var(--crl-rgb), .85);
    box-shadow: 0 0 0 1px rgba(0,0,0,.25), 0 0 12px rgba(var(--crl-rgb), .45), inset 0 0 8px rgba(var(--crl-rgb), .18);
  }
  .crl-glow .crl-word { max-width: 0; color: var(--crl-tone); filter: brightness(1.25); transition: max-width .22s ease; }
  [data-crl-card]:hover .crl-glow, .crl-glow:focus-visible, .crl-glow[aria-expanded="true"] { gap: 6px; padding: 0 10px 0 4px; }
  [data-crl-card]:hover .crl-glow .crl-word, .crl-glow:focus-visible .crl-word, .crl-glow[aria-expanded="true"] .crl-word { max-width: 130px; }

  .crl-tinted {
    padding: 4px 10px 4px 4px; border-radius: 999px; gap: 5px;
    background: rgba(var(--crl-rgb), .28); border: 1px solid rgba(var(--crl-rgb), .6);
    box-shadow: 0 4px 14px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.18); text-shadow: 0 1px 2px rgba(0,0,0,.5);
  }

  .crl-corner {
    padding: 5px 10px 5px 5px; border-radius: 10px;
    background: rgba(12,12,14,.55); border: 1px solid rgba(255,255,255,.14); box-shadow: 0 4px 14px rgba(0,0,0,.3);
  }

  .crl-footer {
    left: 0; right: 0; bottom: 0; top: auto; padding: 8px 9px 10px; border-radius: 0;
    background: linear-gradient(to top, rgba(10,10,12,.78), rgba(10,10,12,.38)); border-top: 1px solid rgba(255,255,255,.12);
  }
  .crl-footer .crl-sub { margin-left: auto; }
  .crl-line { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--crl-tone); }

  .crl-small { font-size: 10px; }
  .crl-small .crl-ico { width: 12px; height: 12px; }
  .crl-small .crl-ico svg { width: 8px; height: 8px; }
  .crl-small.crl-glow { height: 20px; padding: 0 3px; }
  [data-crl-card]:hover .crl-small.crl-glow, .crl-small.crl-glow[aria-expanded="true"] { padding: 0 8px 0 3px; }
  .crl-small.crl-tinted, .crl-small.crl-corner { padding: 3px 8px 3px 3px; }
  .crl-small.crl-footer { padding: 6px 7px 8px; }

  .crl-quiet { opacity: 0; }
  [data-crl-card]:hover .crl-quiet, .crl-quiet:focus-visible, .crl-quiet[aria-expanded="true"] { opacity: 1; }

  .crl-still, .crl-still .crl-word { transition: none; }
  .crl-lite, .crl-menu.crl-lite { -webkit-backdrop-filter: none; backdrop-filter: none; }
  .crl-lite.crl-glow, .crl-lite.crl-corner { background: rgba(14,14,16,.82); }
  .crl-lite.crl-tinted { background: linear-gradient(rgba(var(--crl-rgb), .3), rgba(var(--crl-rgb), .3)), rgba(14,14,16,.72); }

  @media (prefers-reduced-motion: reduce) {
    .crl-badge, .crl-glow .crl-word { transition: none; }
  }
`;
  var BADGE_MENU_CSS = `
  .crl-menu {
    all: initial; position: fixed; z-index: 2147483646; box-sizing: border-box; min-width: 180px; padding: 6px; border-radius: 12px;
    background: rgba(28,29,34,.96); border: 1px solid rgba(255,255,255,.1); box-shadow: 0 12px 32px rgba(0,0,0,.55);
    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); font: 600 13px/1 ${ROUNDED}; color: #eee;
  }
  .crl-menu-title { display: block; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 6px 10px 6px; color: #a0a0a0; font: 700 11px/1.2 ${ROUNDED}; }
  .crl-menu button {
    all: unset; box-sizing: border-box; display: flex; width: 100%; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px;
    color: #eee; font: 600 13px/1 ${ROUNDED}; cursor: pointer;
  }
  .crl-menu button:hover, .crl-menu button:focus-visible { background: rgba(255,255,255,.08); }
  .crl-menu .crl-ico { box-shadow: none; }
  .crl-menu-check { margin-left: auto; color: #f47521; font-weight: 800; }
  .crl-menu-sep { display: block; height: 1px; margin: 5px 4px; background: rgba(255,255,255,.08); }
`;
  function badgeIcon(doc, mark) {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const [tag, attrs] of ICON_PATHS[mark] || ICON_PATHS.unwatched) {
      const part = doc.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, value);
      svg.append(part);
    }
    const wrap = doc.createElement("span");
    wrap.className = "crl-ico";
    wrap.append(svg);
    return wrap;
  }
  function badgeOptions(settings = {}) {
    return {
      style: BADGE_STYLES.some(([id]) => id === settings.badgeStyle) ? settings.badgeStyle : "glow",
      corner: BADGE_CORNERS.some(([id]) => id === settings.badgeCorner) ? settings.badgeCorner : "bottom-left",
      size: settings.badgeSize === "small" ? "small" : "normal",
      progress: settings.badgeProgress !== false,
      unwatched: ["hover", "always", "never"].includes(settings.badgeUnwatched) ? settings.badgeUnwatched : "hover",
      motion: settings.badgeMotion === "static" || settings.liteMode ? "static" : "animated",
      lite: Boolean(settings.liteMode)
    };
  }
  function progressText(mark, progress, episodes, footer) {
    if (mark === "in_progress" || mark === "dropped") {
      if (progress == null) return "";
      return episodes ? `${progress}/${episodes}` : `Ep ${progress}`;
    }
    if (footer && mark === "finished" && episodes) return `${episodes} eps`;
    return "";
  }
  function progressShare(mark, progress, episodes) {
    if (mark === "finished") return 1;
    if ((mark === "in_progress" || mark === "dropped") && progress != null && episodes) return Math.min(1, progress / episodes);
    return 0;
  }
  function badgeSignature(mark, info, options, inline) {
    return [mark, info.progress ?? "", info.episodes ?? "", options.style, options.corner, options.size, options.progress, options.unwatched, options.motion, options.lite, inline].join("|");
  }
  function badgeModel(mark, info, options, { inline = false } = {}) {
    const label = BADGE_LABELS[mark] || BADGE_LABELS.unwatched;
    const footer = options.style === "footer" && !inline;
    const classes = ["crl-badge", `crl-${options.style}`, `crl-t-${mark}`];
    classes.push(inline ? "crl-inline" : footer ? "crl-bottom-left" : `crl-${options.corner}`);
    if (options.size === "small") classes.push("crl-small");
    if (mark === "unwatched" && options.unwatched === "hover") classes.push("crl-quiet");
    if (options.motion === "static") classes.push("crl-still");
    if (options.lite) classes.push("crl-lite");
    const share = footer && options.progress ? progressShare(mark, info.progress, info.episodes) : 0;
    return {
      className: classes.join(" "),
      label,
      extra: options.progress ? progressText(mark, info.progress, info.episodes, footer) : "",
      extraInWord: options.style === "glow",
      line: share > 0 ? Math.round(share * 100) : 0
    };
  }
  function paintBadge(badge, mark, info, options, { inline = false } = {}) {
    const doc = badge.ownerDocument;
    const model = badgeModel(mark, info, options, { inline });
    badge.className = model.className;
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");
    badge.setAttribute("aria-haspopup", "menu");
    if (!badge.hasAttribute("aria-expanded")) badge.setAttribute("aria-expanded", "false");
    badge.setAttribute("aria-label", `Status: ${model.label}. Change status`);
    badge.title = "Change status";
    const word = doc.createElement("span");
    word.className = "crl-word";
    word.textContent = model.label;
    const parts = [badgeIcon(doc, mark), word];
    if (model.extra) {
      const sub = doc.createElement("span");
      sub.className = "crl-sub";
      sub.textContent = model.extra;
      if (model.extraInWord) word.append(" ", sub);
      else parts.push(sub);
    }
    if (model.line) {
      const line = doc.createElement("span");
      line.className = "crl-line";
      line.style.width = `${model.line}%`;
      parts.push(line);
    }
    badge.replaceChildren(...parts);
  }

  // ui/badge-menu.js
  var CHOICES = ["in_progress", "finished", "plan", "dropped"];
  var menu = null;
  var opener = null;
  var cleanup = () => {
  };
  function closeBadgeMenu({ refocus = false } = {}) {
    if (!menu) return;
    cleanup();
    menu.remove();
    menu = null;
    opener?.setAttribute("aria-expanded", "false");
    if (refocus && opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }
  function openBadgeMenu(badge, { mark, title = "", onPick }) {
    closeBadgeMenu();
    const doc = badge.ownerDocument;
    const view = doc.defaultView;
    menu = doc.createElement("div");
    menu.className = badge.classList.contains("crl-lite") ? "crl-menu crl-lite" : "crl-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", title ? `Status for ${title}` : "Change status");
    if (title) {
      const heading = doc.createElement("span");
      heading.className = "crl-menu-title";
      heading.textContent = title;
      menu.append(heading);
    }
    const option = (status, text2) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.append(badgeIcon(doc, status), doc.createTextNode(text2));
      button.classList.add(`crl-t-${status}`);
      if (status === mark) {
        const check = doc.createElement("span");
        check.className = "crl-menu-check";
        check.textContent = "\u2713";
        button.append(check);
      }
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeBadgeMenu({ refocus: true });
        if (status !== mark) onPick(status);
      });
      return button;
    };
    for (const status of CHOICES) menu.append(option(status, BADGE_LABELS[status]));
    if (mark !== "unwatched") {
      const sep = doc.createElement("span");
      sep.className = "crl-menu-sep";
      menu.append(sep, option("unwatched", "Remove from list"));
    }
    doc.documentElement.append(menu);
    const box = badge.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.max(8, Math.min(box.left, view.innerWidth - width - 8));
    const top = box.bottom + 6 + height <= view.innerHeight ? box.bottom + 6 : Math.max(8, box.top - height - 6);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    opener = badge;
    badge.setAttribute("aria-expanded", "true");
    menu.querySelector("button")?.focus({ preventScroll: true });
    const onPointer = (event) => {
      if (!menu?.contains(event.target) && !badge.contains(event.target)) closeBadgeMenu();
    };
    const onKey = (event) => {
      if (!menu) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeBadgeMenu({ refocus: true });
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = [...menu.querySelectorAll("button")];
        const at = items.indexOf(doc.activeElement);
        items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      } else if (event.key === "Tab") {
        closeBadgeMenu();
      }
    };
    const onMove = () => closeBadgeMenu();
    doc.addEventListener("pointerdown", onPointer, true);
    doc.addEventListener("keydown", onKey, true);
    view.addEventListener("scroll", onMove, true);
    view.addEventListener("resize", onMove);
    cleanup = () => {
      doc.removeEventListener("pointerdown", onPointer, true);
      doc.removeEventListener("keydown", onKey, true);
      view.removeEventListener("scroll", onMove, true);
      view.removeEventListener("resize", onMove);
    };
  }

  // content/badges.js
  var STYLE_ID = "crl-badge-style";
  var BANNER_SELECTOR = '[class*="hero" i], [class*="spotlight" i], [class*="banner" i], [class*="billboard" i], [data-t*="hero" i]';
  var wiredDoc = null;
  var pickHandler = () => {
  };
  function ensureStyles(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    let fontFace = "";
    try {
      fontFace = `@font-face{font-family:"Crunchilist Rounded";src:url("${chrome.runtime.getURL("fonts/nunito-latin.woff2")}") format("woff2");font-weight:600 800;font-style:normal;font-display:swap;}`;
    } catch {
    }
    try {
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `${fontFace}${BADGE_CSS}${BADGE_MENU_CSS}`;
      (doc.head || doc.documentElement).append(style);
    } catch {
    }
  }
  function seriesIdsIn(element) {
    const ids = /* @__PURE__ */ new Set();
    element.querySelectorAll('a[href*="/series/"]').forEach((anchor) => {
      const id = seriesIdFromHref(anchor.getAttribute("href") || "");
      if (id) ids.add(id);
    });
    return ids;
  }
  function cardRoot(anchor) {
    let node = anchor;
    for (let depth = 0; depth < 5 && node.parentElement && node.parentElement !== document.body; depth += 1) {
      const parent = node.parentElement;
      if (parent.closest("header, nav, footer")) break;
      if (seriesIdsIn(parent).size > 1) break;
      node = parent;
    }
    return node;
  }
  function isBanner(root) {
    if (root.closest(BANNER_SELECTOR)) return true;
    const box = root.getBoundingClientRect();
    const view = root.ownerDocument.defaultView;
    return box.width > (view?.innerWidth || 1280) * 0.5 && box.height > 260;
  }
  var CONTINUE_SELECTOR = '[class*="continue-watching" i], [class*="continuewatching" i], [class*="continue_watching" i], [data-t*="continue-watching" i], [data-t*="continue_watching" i]';
  var CONTINUE_HEADING = /^\s*continue watching\b/i;
  function continueRows(doc) {
    const rows = [...doc.querySelectorAll(CONTINUE_SELECTOR)];
    doc.querySelectorAll("h1, h2, h3, h4").forEach((heading) => {
      if (!CONTINUE_HEADING.test(heading.textContent || "")) return;
      let node = heading.parentElement;
      for (let depth = 0; node && node !== doc.body && depth < 4; depth += 1, node = node.parentElement) {
        if (node.querySelector('a[href*="/series/"], a[href*="/watch/"]')) {
          rows.push(node);
          return;
        }
      }
    });
    return rows;
  }
  function rowOptions(options, continueRow) {
    if (!continueRow) return options;
    const side = options.corner.endsWith("right") ? "right" : "left";
    return { ...options, corner: `top-${side}`, style: options.style === "footer" ? "tinted" : options.style };
  }
  function inOverlay(node, root) {
    const overlay = node.closest('[data-t*="hover" i], [class*="hover" i]');
    if (overlay && root.contains(overlay) && overlay !== root) return true;
    const view = root.ownerDocument.defaultView;
    for (let parent = node.parentElement; parent && parent !== root; parent = parent.parentElement) {
      const style = view?.getComputedStyle(parent);
      if (style && (style.opacity === "0" || style.visibility === "hidden")) return true;
    }
    return false;
  }
  function posterBox(root) {
    const images = [...root.querySelectorAll("img")].filter((image2) => !inOverlay(image2, root));
    let image = null;
    let area = 0;
    for (const candidate of images) {
      const box2 = candidate.getBoundingClientRect();
      if (box2.width * box2.height > area) {
        area = box2.width * box2.height;
        image = candidate;
      }
    }
    image = image || images[0];
    if (!image?.parentElement || image.parentElement === root.parentElement) return null;
    const imageBox = image.getBoundingClientRect();
    let box = image.parentElement;
    while (box !== root && box.parentElement && box.parentElement !== root.parentElement && imageBox.height > 0) {
      const parentBox = box.parentElement.getBoundingClientRect();
      if (parentBox.height > imageBox.height + 6 || parentBox.width > imageBox.width + 6) break;
      box = box.parentElement;
    }
    return box;
  }
  var CONTROL_SELECTOR = 'button, [role="button"], [data-t*="button" i], [data-t*="play" i]';
  function overlaps(a, b) {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  }
  function badgeReach(badge) {
    const box = badge.getBoundingClientRect();
    const word = badge.classList.contains("crl-glow") ? badge.querySelector(".crl-word") : null;
    const grow = word ? word.scrollWidth + 12 : 0;
    const onRight = badge.matches(".crl-bottom-right, .crl-top-right") !== badge.classList.contains("crl-dodge-x");
    return { left: onRight ? box.left - grow : box.left, right: onRight ? box.right : box.right + grow, top: box.top, bottom: box.bottom };
  }
  function dodgeControls(badge, root, host) {
    badge.classList.remove("crl-dodge-x");
    badge.style.removeProperty("top");
    badge.style.removeProperty("bottom");
    const hostBox = host.getBoundingClientRect();
    if (!hostBox.height || badge.classList.contains("crl-footer")) return hostBox.height > 0;
    const controls = [...root.querySelectorAll(CONTROL_SELECTOR)].filter((node) => !node.closest("[data-cr-corner-badge]")).map((node) => node.getBoundingClientRect()).filter((box) => box.width > 0 && box.height > 0);
    const hits = () => controls.filter((box) => overlaps(badgeReach(badge), box));
    if (!hits().length) return true;
    badge.classList.add("crl-dodge-x");
    if (!hits().length) return true;
    badge.classList.remove("crl-dodge-x");
    const still = hits();
    if (badge.matches(".crl-bottom-left, .crl-bottom-right")) {
      badge.style.bottom = `${Math.round(hostBox.bottom - Math.min(...still.map((box) => box.top)) + 6)}px`;
    } else {
      badge.style.top = `${Math.round(Math.max(...still.map((box) => box.bottom)) - hostBox.top + 6)}px`;
    }
    return true;
  }
  function cardTitle(root) {
    const heading = root.querySelector("h3, h4, [class*='title' i]");
    return (heading?.textContent || root.querySelector("a[title]")?.getAttribute("title") || "").trim().slice(0, 120);
  }
  function wire(doc) {
    if (wiredDoc === doc) return;
    wiredDoc = doc;
    const swallow = (event) => {
      if (!event.target?.closest?.("[data-cr-corner-badge]")) return;
      event.stopPropagation();
    };
    doc.addEventListener("pointerdown", swallow, true);
    doc.addEventListener("mousedown", swallow, true);
    doc.addEventListener("pointerup", swallow, true);
    doc.addEventListener("mouseup", swallow, true);
    doc.addEventListener("click", (event) => {
      const badge = event.target?.closest?.("[data-cr-corner-badge]");
      if (!badge) return;
      event.preventDefault();
      event.stopPropagation();
      toggleMenu(badge);
    }, true);
    doc.addEventListener("keydown", (event) => {
      const badge = event.target?.closest?.("[data-cr-corner-badge]");
      if (!badge || event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      toggleMenu(badge);
    }, true);
  }
  function toggleMenu(badge) {
    if (badge.getAttribute("aria-expanded") === "true") {
      closeBadgeMenu();
      return;
    }
    const seriesId = badge.dataset.crlSeries;
    const mark = badge.dataset.crCornerBadge;
    const progress = badge.dataset.crlProgress === "" ? null : Number(badge.dataset.crlProgress);
    const card = badge.closest("[data-crl-card]");
    openBadgeMenu(badge, {
      mark,
      title: card ? cardTitle(card) : "",
      onPick: (status) => pickHandler({ seriesId, status, previous: mark, previousProgress: Number.isInteger(progress) ? progress : null })
    });
  }
  function unhide(root) {
    root.style.display = root.dataset.crCornerPrevDisplay || "";
    delete root.dataset.crCornerHidden;
    delete root.dataset.crCornerPrevDisplay;
  }
  function releaseHost(host) {
    if (host.dataset.crlPrevPosition == null) return;
    host.style.position = host.dataset.crlPrevPosition;
    delete host.dataset.crlPrevPosition;
  }
  function holdHost(host) {
    if (host.dataset.crlPrevPosition != null) return;
    const view = host.ownerDocument.defaultView;
    if (view?.getComputedStyle(host).position !== "static") return;
    host.dataset.crlPrevPosition = host.style.position || "";
    host.style.position = "relative";
  }
  function removeBadge(badge) {
    const host = badge.parentElement;
    badge.remove();
    if (host && !host.querySelector("[data-cr-corner-badge]")) releaseHost(host);
  }
  function clearBadges(doc) {
    closeBadgeMenu();
    doc.querySelectorAll("[data-cr-corner-badge]").forEach(removeBadge);
    doc.querySelectorAll("[data-crl-card]").forEach((root) => delete root.dataset.crlCard);
    doc.querySelectorAll("[data-cr-corner-hidden]").forEach(unhide);
  }
  function applyBadges(doc, marks, settings = {}, { onPick } = {}) {
    ensureStyles(doc);
    wire(doc);
    if (onPick) pickHandler = onPick;
    const baseOptions = badgeOptions(settings);
    const found = /* @__PURE__ */ new Map();
    doc.querySelectorAll('a[href*="/series/"]').forEach((anchor) => {
      try {
        if (anchor.closest("#cr-corner-host, header, nav, footer, .crl-menu")) return;
        const seriesId = seriesIdFromHref(anchor.getAttribute("href") || "");
        if (!seriesId) return;
        const root = cardRoot(anchor);
        if (!found.has(root) && !isBanner(root)) found.set(root, seriesId);
      } catch {
      }
    });
    const roots = [...found.keys()];
    const used = new Set(roots.filter((root) => !roots.some((other) => other !== root && other.contains(root))));
    const hosts = new Map([...used].map((root) => [root, posterBox(root)]));
    const kept = /* @__PURE__ */ new Set();
    const rows = continueRows(doc);
    used.forEach((root) => {
      const seriesId = found.get(root);
      try {
        const options = rowOptions(baseOptions, rows.some((row) => row.contains(root)));
        root.dataset.crlCard = "1";
        const decision = marks?.[seriesId] || { mark: "unwatched", hide: false };
        const mark = decision.mark || "unwatched";
        let badge = root.querySelector("[data-cr-corner-badge]");
        if (mark !== "unwatched" || options.unwatched !== "never") {
          const host = hosts.get(root);
          const parent = host || root;
          if (!badge) badge = doc.createElement("span");
          if (badge.parentElement !== parent) {
            if (host) {
              holdHost(host);
              host.append(badge);
            } else {
              root.prepend(badge);
            }
          }
          const info = { progress: decision.progress ?? null, episodes: decision.episodes ?? null };
          const signature = badgeSignature(mark, info, options, !host);
          if (badge.dataset.crlSig !== signature) {
            badge.dataset.crlSig = signature;
            badge.dataset.crCornerBadge = mark;
            badge.dataset.crlSeries = seriesId;
            badge.dataset.crlProgress = info.progress ?? "";
            paintBadge(badge, mark, info, options, { inline: !host });
            delete badge.dataset.crlPlaced;
          }
          if (host && !badge.dataset.crlPlaced && dodgeControls(badge, root, host)) badge.dataset.crlPlaced = "1";
          kept.add(badge);
        }
        const shouldHide = Boolean(settings.hideWatched && decision.hide);
        if (shouldHide && root.dataset.crCornerHidden !== "1") {
          root.dataset.crCornerPrevDisplay = root.style.display || "";
          root.dataset.crCornerHidden = "1";
          root.style.display = "none";
        } else if (!shouldHide && root.dataset.crCornerHidden === "1") {
          unhide(root);
        }
      } catch {
      }
    });
    doc.querySelectorAll("[data-cr-corner-badge]").forEach((badge) => {
      if (!kept.has(badge)) removeBadge(badge);
    });
    doc.querySelectorAll("[data-crl-card]").forEach((root) => {
      if (!used.has(root)) delete root.dataset.crlCard;
    });
    doc.querySelectorAll("[data-cr-corner-hidden]").forEach((root) => {
      if (!used.has(root)) unhide(root);
    });
  }

  // lib/taste.js
  var ANILIST_GENRES = [
    "Action",
    "Adventure",
    "Comedy",
    "Drama",
    "Ecchi",
    "Fantasy",
    "Horror",
    "Mahou Shoujo",
    "Mecha",
    "Music",
    "Mystery",
    "Psychological",
    "Romance",
    "Sci-Fi",
    "Slice of Life",
    "Sports",
    "Supernatural",
    "Thriller"
  ];
  function filterTagSuggestions(query2, options, exclude, limit = 8) {
    const needle = String(query2 || "").trim().toLowerCase();
    if (!needle) return [];
    const skip = new Set((exclude || []).map((item) => String(item).toLowerCase()));
    const genres = new Set(ANILIST_GENRES.map((genre) => genre.toLowerCase()));
    const rank = (key) => (key === needle ? 0 : 1) + (genres.has(key) ? 0 : 2);
    const starts = [];
    const contains = [];
    for (const option of options || []) {
      const key = String(option).toLowerCase();
      if (skip.has(key)) continue;
      if (key.startsWith(needle)) starts.push(option);
      else if (key.includes(needle)) contains.push(option);
    }
    starts.sort((a, b) => rank(String(a).toLowerCase()) - rank(String(b).toLowerCase()));
    return [...starts, ...contains].slice(0, limit);
  }

  // ui/search-view.js
  var SEARCH_CSS = `
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
  var CHIPS = [
    ["in-progress", "Watching", "Shows you have started"],
    ["plan", "Plan to watch", "Shows you plan to watch"],
    ["unwatched", "Not started", "Shows you have not begun"],
    ["new", "New", "Newly added on Crunchyroll"],
    ["one-cour", "Short series", "13 episodes or fewer"],
    ["long", "Long series", "24 episodes or more"],
    ["movie", "Movies", "Movies only"]
  ];
  var SORTS = [
    ["relevance", "Best match"],
    ["popular", "Most popular"],
    ["score", "Highest rated"],
    ["newest", "Newest"],
    ["title", "A to Z"],
    ["shortest", "Fewest episodes"],
    ["longest", "Most episodes"]
  ];
  var STATUS_LABEL = { in_progress: "Watching", plan: "Planned", finished: "Finished", dropped: "Dropped" };
  function createSearchView({
    send: send2,
    site = "all",
    siteToggle = true,
    newTab = false,
    onView = () => {
    },
    placeholder = "Search anime or describe a mood",
    linkFor = (item) => item.url || "#",
    onSearch = () => {
    }
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
    let forYouSeen = /* @__PURE__ */ new Set();
    let forYouBy = "";
    const pages = /* @__PURE__ */ new Set();
    const pageItems = /* @__PURE__ */ new WeakMap();
    const input = el("input", {
      class: "sv-input",
      type: "text",
      placeholder,
      "aria-label": "Search anime",
      autocomplete: "off",
      spellcheck: "false"
    });
    const clearButton = el("button", { class: "icon-btn", type: "button", "aria-label": "Clear search", hidden: true }, [icon("close", 16)]);
    const aiButton = el("button", { class: "sv-ai is-on", type: "button", "aria-pressed": "true" }, [
      icon("sparkle", 16),
      el("span", { text: "AI" }),
      el("span", { class: "sv-ai-dot", "aria-hidden": "true" })
    ]);
    const drop = el("div", { class: "sv-drop glass", role: "listbox", hidden: true });
    const form = el("form", { class: "sv-bar", role: "search" }, [
      el("span", { class: "sv-lead" }, [icon("search", 19)]),
      input,
      clearButton,
      aiButton,
      drop
    ]);
    const chipRow = el("div", { class: "sv-chips" });
    const chipButtons = /* @__PURE__ */ new Map();
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
      el("span", { text: "Crunchyroll only" })
    ]);
    siteButton.hidden = !siteToggle;
    const hideButton = el("button", { class: "sv-toggle", type: "button", title: "Leave out finished and dropped shows" }, [
      icon("eye", 14),
      el("span", { text: "Hide watched" })
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
        el("div", { class: "sv-under" }, [sortClear])
      ])
    ]);
    function tagPicker({ label, glyph, removeLabel, others, tone = "" }) {
      const picker = { values: [] };
      let matches = [];
      let active2 = -1;
      const field = el("input", { class: "sv-tag-input", type: "text", placeholder: label, "aria-label": label, autocomplete: "off", spellcheck: "false" });
      const list = el("div", { class: "sv-tag-list glass", role: "listbox", hidden: true });
      const tokens = el("div", { class: "sv-tag-tokens" });
      const clear = el("button", { class: "sv-clear", type: "button", text: "Clear", title: `Clear ${label.toLowerCase()}` });
      picker.root = el("div", { class: `sv-refine-group ${tone}` }, [
        el("div", { class: "sv-tag-pick" }, [icon(glyph, 15), field, list]),
        el("div", { class: "sv-under" }, [tokens, clear])
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
          const option = el("button", { type: "button", role: "option", text: match, class: index === active2 ? "is-on" : "" });
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
        active2 = -1;
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
        active2 = matches.length ? 0 : -1;
        paintList();
      });
      field.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !list.hidden) {
          event.preventDefault();
          event.stopPropagation();
          closeList();
        } else if (!list.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          active2 = (active2 + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
          paintList();
        } else if (event.key === "Enter") {
          event.preventDefault();
          add(!list.hidden && active2 >= 0 ? matches[active2] : field.value);
        } else if (event.key === "Tab" && !event.shiftKey && !list.hidden && active2 >= 0) {
          event.preventDefault();
          add(matches[active2]);
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
        el("label", { class: "sv-ask-opt" }, [askBox, el("span", { text: "Don't ask again (change this in Settings)" })])
      ])
    ]);
    const sentinel = el("div", { class: "sv-more", "aria-hidden": "true" });
    const root = el("div", { class: "sv" }, [form, filters, refine, note, ask, results, sentinel]);
    function writeNote(text2, { progress } = {}) {
      note.hidden = !text2;
      const hasProgress = typeof progress === "number" && Number.isFinite(progress);
      const percent = hasProgress ? Math.floor(Math.max(0, Math.min(1, progress)) * 100) : 0;
      noteText.textContent = hasProgress && text2 ? `${text2} ${percent}%` : text2 || "";
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
        const response = await send2("setStatus", { id: item.id, status });
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
        confidence != null ? el("span", { class: "sv-meter", title: `${confidence}% match` }, [
          el("span", { class: "sv-meter-bar" }, [el("span", { style: `width:${confidence}%` })]),
          el("span", { text: `${confidence}%` })
        ]) : null
      ]);
      const foot = el("div", { class: "sv-foot" });
      if (kind !== "mention") for (const tag of (item.tags || []).slice(0, 5)) foot.append(el("span", { class: "sv-tag", text: tag }));
      foot.append(el("span", { class: "sv-foot-spacer" }), statusControl(item));
      const node = el("article", { class: `sv-card is-${kind}${index >= 0 ? " is-appear" : ""}` }, [
        el("a", linkAttrs(item, { class: "sv-card-art", tabindex: "-1", "aria-hidden": "true" }), [art(item)]),
        el("div", { class: "sv-card-body" }, [head, item.reason ? el("p", { class: "sv-reason", text: item.reason }) : null, foot])
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
          extra || null
        ]),
        ...children
      ]);
    }
    function poster(item) {
      const mark = STATUS_LABEL[item.status];
      return el("article", { class: "sv-poster" }, [
        el("a", linkAttrs(item, { class: "sv-poster-link" }), [
          el("span", { class: "sv-poster-art" }, [art(item), mark ? el("span", { class: "sv-mark", text: mark }) : null]),
          el("span", { class: "sv-poster-title", text: item.title })
        ]),
        statusControl(item)
      ]);
    }
    function aiState(text2, busy) {
      return el("span", { class: busy ? "sv-ai-state is-busy" : "sv-ai-state" }, [icon("sparkle", 14), el("span", { text: text2 })]);
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
    function renderInstant(items, { pending, note: note2 = "", total = items.length }) {
      results.replaceChildren();
      if (!items.length) {
        const hint = currentSite === "crunchyroll" ? "Try fewer words, or turn off Crunchyroll only." : "Try fewer words, or turn off a filter.";
        results.append(empty("No matches", note2 && note2 !== "No matches." ? note2 : hint));
        return null;
      }
      const extra = pending ? aiState("Ranking with AI", true) : null;
      const list = el("div", { class: "sv-list" }, [cardPage(items)]);
      results.append(section("Results", [list], { count: total, extra }));
      return list;
    }
    function cardPage(items) {
      for (const page2 of pages) {
        if (page2.isConnected) continue;
        pages.delete(page2);
        pageObserver?.unobserve(page2);
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
      const response = await send2("catalogSearch", { ...current.params, offset: current.offset });
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
        extra: action ? el("span", { class: "sv-head-actions" }, [ranker, action]) : ranker
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
        } : null
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
      const text2 = answer?.note || answer?.error || "";
      if (text2) writeNote(`${text2} Showing the closest matches.`);
      refreshModel();
    }
    function watchModelDownload(retry) {
      window.clearInterval(modelPoll);
      modelPoll = window.setInterval(async () => {
        const progress = await send2("catalogProgress");
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
      const response = await send2("modelStatus");
      if (!response?.status?.needsDownload) return true;
      if (downloadDeclined) return false;
      closeAsk(false);
      askBox.checked = false;
      ask.hidden = false;
      return new Promise((resolve) => {
        askResolve = resolve;
      });
    }
    function skipAi(text2) {
      const head = results.querySelector(".sv-ai-state");
      if (head) head.replaceWith(aiState(text2, false));
    }
    async function rerank(id, query2, items, render) {
      const answer = await send2("catalogRerank", { query: query2, chip, site: currentSite, ids: items.slice(0, 20).map((item) => item.id) });
      if (id !== seq) return;
      if (answer?.ok && answer.results?.length) {
        render(answer.results, answer.by);
        refreshModel();
        return;
      }
      aiFailed(answer, () => {
        if (id === seq) rerank(id, query2, items, render);
      });
    }
    async function pickForYou(row, payload, button, current = null) {
      const id = ++seq;
      if (!await confirmDownload()) return;
      if (id !== seq) return;
      const last = (current || []).map((item) => item.id);
      if (!current) forYouSeen = /* @__PURE__ */ new Set();
      for (const pickId of last) forYouSeen.add(pickId);
      button.replaceWith(aiState(current ? "Rerolling" : "Picking", true));
      const answer = await send2("catalogRerank", {
        query: "",
        chip: "",
        site: currentSite,
        ids: row.items.map((item) => item.id),
        ...current ? { reroll: true, seen: [...forYouSeen], last } : {}
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
      const query2 = input.value.trim();
      pager = null;
      form.classList.add("is-busy");
      const params = { query: query2, chip, site: currentSite, sort, tags: include.values, without: exclude.values };
      const response = await send2("catalogSearch", params);
      if (id !== seq) return;
      form.classList.remove("is-busy");
      if (!response?.ok) {
        writeNote(response?.error || "Could not search.");
        return;
      }
      lastRun = { query: query2, response };
      if (query2) onSearch(query2);
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
      rerank(id, query2, items, (ranked, by) => renderRanked(ranked, by));
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
            item.reason ? el("span", { class: "sv-drop-reason", text: item.reason }) : null
          ])
        ]);
        link.classList.toggle("is-on", index === activeSuggestion);
        link.addEventListener("mousedown", (event) => event.preventDefault());
        drop.append(link);
      });
      drop.hidden = false;
    }
    function suggest() {
      const query2 = input.value.trim();
      clearButton.hidden = !input.value;
      window.clearTimeout(suggestTimer);
      if (!query2) {
        closeDrop();
        return;
      }
      const token = ++suggestSeq;
      suggestTimer = window.setTimeout(async () => {
        const response = await send2("catalogSuggest", { query: query2, chip, site: currentSite });
        if (token !== suggestSeq || input.value.trim() !== query2) return;
        suggestions = response?.suggestions || [];
        activeSuggestion = -1;
        paintDrop();
      }, 130);
    }
    async function refreshModel() {
      const response = await send2("modelStatus");
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
      if (drop.hidden || !suggestions.length || event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      activeSuggestion = activeSuggestion < 0 ? step > 0 ? 0 : suggestions.length - 1 : (activeSuggestion + step + suggestions.length) % suggestions.length;
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
        send2("setSettings", { patch: { askModelDownload: false } });
      }
      closeAsk(true);
    });
    askNo.addEventListener("click", () => {
      downloadDeclined = true;
      if (askBox.checked) {
        useAi = false;
        paintAi();
        send2("setSettings", { patch: { useAi: false } });
        writeNote("AI ranking is off. Turn it back on with the AI button.");
      }
      closeAsk(false);
    });
    aiButton.addEventListener("click", () => {
      useAi = !useAi;
      if (useAi) downloadDeclined = false;
      paintAi();
      send2("setSettings", { patch: { useAi } });
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
      const response = await send2("setUi", { hideWatched });
      if (response?.view) onView(response.view);
      run();
    });
    let sentinelVisible = false;
    let observer2 = null;
    function watchScroll(scrollRoot = null) {
      observer2?.disconnect();
      observer2 = new IntersectionObserver((entries) => {
        sentinelVisible = entries.some((entry) => entry.isIntersecting);
        if (sentinelVisible) loadMore();
      }, { root: scrollRoot, rootMargin: "0px 0px 700px 0px" });
      observer2.observe(sentinel);
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
      search(query2) {
        input.value = String(query2 || "");
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
      clearSuggestions: closeDrop
    };
  }

  // ui/notices-view.js
  var NOTICES_CSS = `
  .nt { display: flex; flex-direction: column; gap: 12px; }
  .nt-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .sheet .nt-head { padding-right: 36px; }
  .nt-head h2 { flex: 1; margin: 0; font: 800 17px/1.2 ${ROUNDED}; white-space: nowrap; }
  .nt-bulk { display: flex; gap: 6px; }
  .nt-bulk .btn, .nt-item .btn { min-height: 30px; padding: 4px 11px; font-size: 12.5px; white-space: nowrap; }
  .nt-list { display: flex; flex-direction: column; gap: 8px; }
  .nt-item {
    display: flex; gap: 12px; padding: 10px; border-radius: 16px; background: var(--pane); border: 1px solid var(--line);
    transition: border-color .18s var(--ease), background .18s var(--ease);
  }
  .nt-item:hover { border-color: var(--line-strong); background: var(--pane-hover); }
  .nt-item.is-ask { border-color: rgba(255, 154, 92, .32); }
  .nt-art { width: 42px; height: 58px; flex: none; border-radius: 9px; object-fit: cover; background: var(--raised); }
  .nt-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .nt-title { margin: 0; font: 800 13.5px/1.3 ${ROUNDED}; }
  .nt-message { margin: 0; color: var(--muted); font: 600 12.5px/1.4 ${ROUNDED}; }
  .nt-time { color: var(--faint); font: 700 11px/1.2 ${ROUNDED}; }
  .nt-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .nt-empty { padding: 28px 8px; text-align: center; color: var(--muted); font: 600 13.5px/1.5 ${ROUNDED}; }
  .nt-empty strong { display: block; color: var(--text); font: 800 15px/1.3 ${ROUNDED}; }
  .nt-status { min-height: 1.2em; margin: 0; color: var(--muted); font: 600 12.5px/1.4 ${ROUNDED}; }
  .nt-badge {
    position: absolute; top: -5px; right: -5px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box;
    display: grid; place-items: center; border-radius: 9px; background: #ff453a; color: #fff;
    font: 800 11px/1 ${ROUNDED}; box-shadow: 0 0 0 2px rgba(20, 17, 14, .95); pointer-events: none;
  }
  .nt-badge[hidden] { display: none; }
  .nt-bell { position: relative; }
`;
  function noticeBadge() {
    return el("span", { class: "nt-badge", "aria-hidden": "true", hidden: true });
  }
  function paintBadge2(badge, count) {
    badge.hidden = !count;
    badge.textContent = count > 99 ? "99+" : String(count || "");
  }
  function ago(time) {
    const minutes = Math.round((Date.now() - time) / 6e4);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    return days === 1 ? "Yesterday" : `${days} days ago`;
  }
  function createNoticesView({ send: send2, onView = () => {
  } } = {}) {
    let notices = [];
    const updateAll = el("button", { class: "btn primary", type: "button", text: "Update all" });
    const clearAll = el("button", { class: "btn", type: "button", text: "Clear all" });
    const list = el("div", { class: "nt-list" });
    const status = el("p", { class: "nt-status", role: "status" });
    const root = el("div", { class: "nt" }, [
      el("div", { class: "nt-head" }, [el("h2", { text: "Notifications" }), el("div", { class: "nt-bulk" }, [updateAll, clearAll])]),
      list,
      status
    ]);
    async function act(type, payload, busy) {
      for (const button of busy) button.disabled = true;
      const response = await send2(type, payload);
      for (const button of busy) button.disabled = false;
      if (!response?.ok) {
        status.textContent = response?.error || "Something went wrong.";
        return;
      }
      status.textContent = response.syncNote && !/^Marked episode/.test(response.syncNote) ? response.syncNote : "";
      if (response.view) onView(response.view);
    }
    function item(row) {
      const update = row.action ? el("button", { class: "btn primary", type: "button", text: row.action }) : null;
      const ignore = el("button", { class: "btn", type: "button", text: row.kind === "ask" ? "Ignore" : "Dismiss" });
      update?.addEventListener("click", () => act("resolveNotice", { id: row.id, action: "update" }, [update, ignore]));
      ignore.addEventListener("click", () => act("resolveNotice", { id: row.id, action: "ignore" }, [ignore]));
      return el("article", { class: `nt-item is-${row.kind}` }, [
        row.cover ? el("img", { class: "nt-art", src: row.cover, alt: "", referrerpolicy: "no-referrer" }) : el("span", { class: "nt-art" }),
        el("div", { class: "nt-copy" }, [
          el("p", { class: "nt-title", text: row.title }),
          el("p", { class: "nt-message", text: row.message }),
          el("span", { class: "nt-time", text: ago(row.createdAt) }),
          el("div", { class: "nt-actions" }, [update, ignore])
        ])
      ]);
    }
    function paint() {
      list.replaceChildren(...notices.map(item));
      if (!notices.length) list.append(el("div", { class: "nt-empty" }, [el("strong", { text: "You're all caught up" }), el("span", { text: "Finished episodes you skip updating show up here." })]));
      updateAll.hidden = !notices.some((row) => row.kind === "ask");
      clearAll.hidden = !notices.length;
    }
    updateAll.addEventListener("click", () => act("resolveAllNotices", { action: "update" }, [updateAll, clearAll]));
    clearAll.addEventListener("click", () => act("resolveAllNotices", { action: "ignore" }, [updateAll, clearAll]));
    paint();
    return {
      root,
      setView(view) {
        notices = view?.notices || [];
        paint();
      },
      count: () => notices.length
    };
  }

  // lib/providers.js
  var PROVIDERS = [
    {
      id: "openai",
      label: "OpenAI",
      free: false,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      keyUrl: "https://platform.openai.com/api-keys",
      hint: "Paid. About a tenth of a cent per AI pick.",
      match: /^gpt-/i,
      skip: /embed|whisper|tts|dall-e|moderation|realtime|audio|transcribe|image|vision|instruct|davinci|babbage|curie|search|sora|\bada\b/i,
      prefer: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-5-mini", "gpt-4.1", "gpt-4o", "gpt-5"],
      maxTokens: 900,
      autoRank: 2,
      tune: () => ({})
    },
    {
      id: "gemini",
      label: "Google Gemini",
      free: true,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-3.5-flash-lite",
      keyUrl: "https://aistudio.google.com/apikey",
      hint: "Free tier with daily limits.",
      match: /^gemini-([\d.]+-)?flash/i,
      skip: /preview|exp|tts|image|live|embedding|audio|transcribe|robotics|computer|native/i,
      prefer: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash"],
      maxTokens: 4096,
      autoRank: 1,
      tune: () => ({ reasoning_effort: "low" })
    },
    {
      id: "groq",
      label: "Groq",
      free: true,
      baseUrl: "https://api.groq.com/openai/v1",
      model: "openai/gpt-oss-120b",
      keyUrl: "https://console.groq.com/keys",
      hint: "Free tier. Very fast.",
      match: /gpt-oss|qwen|llama|kimi|gemma|mistral|deepseek/i,
      skip: /guard|safeguard|whisper|tts|orpheus|vision|prompt|playai|compound|allam/i,
      prefer: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
      maxTokens: 2e3,
      autoRank: 0,
      tune: (model) => {
        if (/gpt-oss/i.test(model)) return { reasoning_effort: "low", include_reasoning: false };
        if (/qwen/i.test(model)) return { reasoning_effort: "none" };
        return {};
      }
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      free: true,
      baseUrl: "https://openrouter.ai/api/v1",
      model: "nvidia/nemotron-3-super-120b-a12b:free",
      keyUrl: "https://openrouter.ai/keys",
      hint: "Free models with daily limits.",
      match: /:free$/i,
      skip: /safety|guard|code|coder|omni|vision|lfm|laguna|inkling|nano|-r1/i,
      prefer: ["nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3-ultra-550b-a55b:free"],
      maxTokens: 2e3,
      autoRank: 3,
      tune(model) {
        const backups = this.prefer.filter((name) => name !== model).slice(0, 2);
        return { reasoning: { enabled: false }, models: [model, ...backups] };
      }
    }
  ];
  var PROVIDER_IDS = PROVIDERS.map((provider) => provider.id);

  // ui/history-view.js
  var PACE_SECONDS = 2.1;
  var STATUS_WORDS = { finished: "Completed", in_progress: "Watching", dropped: "Dropped", plan: "Plan to watch" };
  var HISTORY_CSS = `
  .st.is-history > :not(.hi) { display: none !important; }
  .hi { display: flex; flex-direction: column; gap: 12px; }
  .hi[hidden] { display: none; }
  .hi-head { display: flex; align-items: center; gap: 8px; }
  .sheet .hi-head { padding-right: 36px; }
  .hi-head h2 { flex: 1; min-width: 0; margin: 0; font: 800 17px/1.2 ${ROUNDED}; }
  .hi-back { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 10px; cursor: pointer; background: transparent; color: var(--muted); }
  .hi-back:hover { background: var(--pane-hover); color: var(--text); }
  .hi-summary { margin: 0; color: var(--muted); font: 600 12.5px/1.45 ${ROUNDED}; }
  .hi-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .hi-tools .nt-bulk { margin-left: auto; }
  .hi-stale { display: flex; align-items: center; gap: 8px; color: var(--muted); font: 700 12px/1.2 ${ROUNDED}; }
  .hi-stale select { min-height: 30px; padding: 3px 8px; font-size: 12.5px; }
  .hi-confirm { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 16px; background: rgba(255, 154, 92, .08); border: 1px solid rgba(255, 154, 92, .32); }
  .hi-confirm[hidden] { display: none; }
  .hi-confirm strong { font: 800 14px/1.3 ${ROUNDED}; }
  .hi-confirm p { margin: 0; color: var(--muted); font: 600 12.5px/1.45 ${ROUNDED}; }
  .hi-confirm .nt-actions { margin-top: 0; }
  .hi-tag { display: inline-block; margin-right: 6px; padding: 1px 7px; border-radius: 999px; background: rgba(255, 226, 196, .08); color: var(--muted); font: 800 10.5px/1.5 ${ROUNDED}; letter-spacing: .03em; text-transform: uppercase; }
  .hi-tag.is-new { background: rgba(120, 220, 160, .12); color: #9fe3b8; }
  .hi-tag.is-stale { background: rgba(255, 196, 92, .12); color: #f3cd8a; }
  .hi-missing { border-radius: 16px; background: var(--pane); border: 1px solid var(--line); padding: 10px 14px; }
  .hi-missing summary { cursor: pointer; color: var(--muted); font: 700 12.5px/1.4 ${ROUNDED}; }
  .hi-missing ul { margin: 8px 0 0; padding-left: 18px; color: var(--muted); font: 600 12.5px/1.5 ${ROUNDED}; }
  .hi-missing p { margin: 8px 0 0; color: var(--faint); font: 600 12px/1.4 ${ROUNDED}; }
  .hi .nt-item.is-busy { opacity: .55; pointer-events: none; }
  .hi .nt-status:empty { display: none; }
`;
  function episodesText(change) {
    if (change.status === "finished") return change.episodes ? `${change.episodes}/${change.episodes} episodes` : "All episodes";
    return change.episodes ? `Episode ${change.progress} of ${change.episodes}` : `Episode ${change.progress}`;
  }
  function changeText(change) {
    const status = STATUS_WORDS[change.status] || "Watching";
    if (change.isNew) return `${status} \xB7 ${episodesText(change)}`;
    const from = change.fromProgress ?? 0;
    const moved = change.fromStatus && change.fromStatus !== change.status ? `${STATUS_WORDS[change.fromStatus] || "Listed"} \u2192 ${status}` : status;
    return `${moved} \xB7 episode ${from} \u2192 ${change.progress}${change.episodes ? ` of ${change.episodes}` : ""}`;
  }
  function playedText(time) {
    if (!time) return "";
    return `Last played ${new Date(time).toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  function duration(count) {
    const minutes = Math.ceil(count * PACE_SECONDS / 60);
    return minutes <= 1 ? "about a minute" : `about ${minutes} minutes`;
  }
  function createHistoryView({ send: send2, onView = () => {
  }, onClose = () => {
  } } = {}) {
    let changes = [];
    let stale = "watching";
    let poll = 0;
    let busy = false;
    const back = el("button", { class: "hi-back", type: "button", "aria-label": "Back to settings", title: "Back to settings" }, [icon("back", 18)]);
    const summary = el("p", { class: "hi-summary" });
    const staleSelect = el("select", { "aria-label": "Shows not played in 6+ months" });
    for (const [value, text2] of [["watching", "Mark watching"], ["dropped", "Mark dropped"], ["skip", "Leave out"]]) staleSelect.append(el("option", { value, text: text2 }));
    const staleRow = el("label", { class: "hi-stale", hidden: true }, [el("span", { text: "Not played in 6+ months" }), staleSelect]);
    const updateAll = el("button", { class: "btn primary", type: "button", text: "Update all" });
    const skipAll = el("button", { class: "btn", type: "button", text: "Skip all" });
    const tools = el("div", { class: "hi-tools", hidden: true }, [staleRow, el("div", { class: "nt-bulk" }, [updateAll, skipAll])]);
    const confirmText = el("p");
    const confirmYes = el("button", { class: "btn primary", type: "button", text: "Yes, update all" });
    const confirmNo = el("button", { class: "btn", type: "button", text: "Cancel" });
    const confirm = el("div", { class: "hi-confirm", role: "alertdialog", "aria-label": "Confirm update all", hidden: true }, [
      el("strong", { text: "Are you sure? This may take a while." }),
      confirmText,
      el("div", { class: "nt-actions" }, [confirmYes, confirmNo])
    ]);
    const meter = progressMeter("History import progress");
    const bar = meter.root;
    const status = el("p", { class: "nt-status", role: "status" });
    const list = el("div", { class: "nt-list" });
    const missing = el("details", { class: "hi-missing", hidden: true });
    const root = el("div", { class: "hi", hidden: true }, [
      el("div", { class: "hi-head" }, [back, el("h2", { text: "Crunchyroll history" })]),
      summary,
      tools,
      confirm,
      bar,
      status,
      list,
      missing
    ]);
    function progress(note, value) {
      status.textContent = note || "";
      meter.set(value);
    }
    async function refreshView() {
      const fresh = await send2("getState");
      if (fresh?.view) onView(fresh.view);
    }
    function row(change) {
      const update = el("button", { class: "btn primary", type: "button", text: "Update" });
      const skip = el("button", { class: "btn", type: "button", text: "Skip" });
      const article = el("article", { class: "nt-item is-ask" }, [
        change.cover ? el("img", { class: "nt-art", src: change.cover, alt: "", referrerpolicy: "no-referrer" }) : el("span", { class: "nt-art" }),
        el("div", { class: "nt-copy" }, [
          el("p", { class: "nt-title", text: change.title }),
          el("p", { class: "nt-message" }, [
            el("span", { class: change.isNew ? "hi-tag is-new" : "hi-tag", text: change.isNew ? "New" : "Update" }),
            change.stale ? el("span", { class: "hi-tag is-stale", text: "6+ months" }) : null,
            document.createTextNode(changeText(change))
          ]),
          el("span", { class: "nt-time", text: playedText(change.lastPlayed) }),
          el("div", { class: "nt-actions" }, [update, skip])
        ])
      ]);
      update.addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        article.classList.add("is-busy");
        const response = await send2("historyApply", { stale, ids: [change.id] });
        busy = false;
        if (!response?.ok) {
          article.classList.remove("is-busy");
          progress(response?.error || "Could not update that show.");
          return;
        }
        progress(response.note);
        await loadPlan();
        refreshView();
      });
      skip.addEventListener("click", async () => {
        if (busy) return;
        article.classList.add("is-busy");
        await send2("historySkip", { ids: [change.id] });
        await loadPlan();
      });
      return article;
    }
    function paintMissing(unmatched) {
      missing.hidden = !unmatched.length;
      missing.replaceChildren(
        el("summary", { text: `${unmatched.length === 1 ? "1 show" : `${unmatched.length} shows`} couldn't be matched with AniList` }),
        el("ul", {}, unmatched.map((title) => el("li", { text: title }))),
        el("p", { text: "Set these by hand from the show's page or its badge on Crunchyroll." })
      );
    }
    function retryButton() {
      const button = el("button", { class: "btn primary", type: "button", text: "Try again" });
      button.addEventListener("click", () => start2());
      return button;
    }
    function paintFailure(note) {
      changes = [];
      confirm.hidden = true;
      tools.hidden = true;
      missing.hidden = true;
      summary.textContent = "";
      progress("");
      list.replaceChildren(el("div", { class: "nt-empty" }, [
        el("strong", { text: "Couldn't finish reading your history" }),
        el("span", { text: note || "Crunchyroll didn't answer. Reload Crunchyroll and try again." }),
        el("div", { class: "nt-actions", style: "justify-content:center;margin-top:12px" }, [retryButton()])
      ]));
    }
    function paint(plan) {
      changes = plan.changes || [];
      const s = plan.summary;
      confirm.hidden = true;
      tools.hidden = !changes.length;
      staleRow.hidden = !s?.stale;
      list.replaceChildren(...changes.map(row));
      if (!changes.length && plan.scanned) {
        list.append(el("div", { class: "nt-empty" }, [
          el("strong", { text: "Nothing left to review" }),
          el("span", { text: "Everything matched from your Crunchyroll history is on your list or was skipped." })
        ]));
      } else if (!changes.length) {
        list.append(el("div", { class: "nt-empty" }, [
          el("strong", { text: "No history scanned yet" }),
          el("span", { text: "Read your Crunchyroll history to see what can be added." }),
          el("div", { class: "nt-actions", style: "justify-content:center;margin-top:12px" }, [retryButton()])
        ]));
        list.querySelector(".nt-empty .btn").textContent = "Read history";
      }
      if (!s) {
        summary.textContent = "";
      } else {
        const parts = [];
        if (plan.seen) parts.push(`Read ${plan.seen} episodes`);
        if (changes.length) parts.push(`${changes.length === 1 ? "1 show" : `${changes.length} shows`} to review`);
        if (s.current) parts.push(`${s.current} already up to date`);
        const cut = plan.cutShort ? " Crunchyroll stopped sharing older history partway, so your oldest shows may be missing; set those by hand." : "";
        summary.textContent = parts.length ? `${parts.join(" \xB7 ")}. Nothing is sent to AniList until you choose Update.${cut}` : cut.trim();
      }
      paintMissing(plan.unmatched || []);
    }
    async function loadPlan() {
      const response = await send2("historyPlan", { stale });
      if (response?.ok) paint(response);
    }
    function stopPoll() {
      window.clearInterval(poll);
      poll = 0;
    }
    function watch(onFinish) {
      stopPoll();
      poll = window.setInterval(async () => {
        const job = await send2("historyProgress");
        if (!job?.ok) {
          stopPoll();
          progress("Lost track of the import. Open it again to continue.");
          return;
        }
        if (job.running) {
          progress(job.note, job.progress);
          return;
        }
        stopPoll();
        onFinish(job);
      }, 700);
    }
    function show() {
      root.hidden = false;
      root.closest(".st")?.classList.add("is-history");
    }
    function close() {
      stopPoll();
      confirm.hidden = true;
      root.hidden = true;
      root.closest(".st")?.classList.remove("is-history");
      onClose();
    }
    async function start2() {
      show();
      changes = [];
      list.replaceChildren();
      tools.hidden = true;
      missing.hidden = true;
      summary.textContent = "Reading your Crunchyroll history and matching it with AniList. Nothing changes until you review it.";
      const response = await send2("historyScan");
      if (!response?.ok) {
        paintFailure(response?.error);
        return;
      }
      progress(response.note, response.progress);
      watch(async (job) => {
        if (job.phase === "error") {
          paintFailure(job.note);
          return;
        }
        progress(job.phase === "ready" ? "" : job.note);
        await loadPlan();
      });
    }
    async function resume() {
      show();
      const job = await send2("historyProgress");
      if (job?.running) {
        progress(job.note, job.progress);
        watch(async (finished) => {
          progress(finished.note);
          await loadPlan();
          refreshView();
        });
        return;
      }
      if (job?.phase === "error") {
        paintFailure(job.note);
        return;
      }
      progress(job?.phase === "done" ? job.note : "");
      await loadPlan();
    }
    back.addEventListener("click", close);
    staleSelect.addEventListener("change", () => {
      stale = staleSelect.value;
      loadPlan();
    });
    updateAll.addEventListener("click", () => {
      if (!changes.length) return;
      const count = changes.length === 1 ? "1 show" : `${changes.length} shows`;
      confirmText.textContent = `This sends ${count} to your AniList, one at a time so AniList doesn't block the requests. It will take ${duration(changes.length)}. You can keep using Crunchyroll while it runs; anything not sent yet syncs later.`;
      confirm.hidden = false;
      confirmNo.focus();
    });
    confirmNo.addEventListener("click", () => {
      confirm.hidden = true;
    });
    confirmYes.addEventListener("click", async () => {
      confirm.hidden = true;
      tools.hidden = true;
      for (const item of list.children) item.classList.add("is-busy");
      const response = await send2("historyApply", { stale });
      if (!response?.ok) {
        progress(response?.error || "Could not start the update.");
        await loadPlan();
        return;
      }
      progress(response.note, response.progress);
      if (!response.running) {
        await loadPlan();
        refreshView();
        return;
      }
      watch(async (job) => {
        progress(job.note);
        await loadPlan();
        refreshView();
      });
    });
    skipAll.addEventListener("click", async () => {
      await send2("historySkip", { ids: changes.map((change) => change.id) });
      progress("Skipped. Nothing was sent to AniList.");
      await loadPlan();
    });
    return { root, start: start2, resume, close };
  }

  // ui/settings-view.js
  var PREVIEW_SHOWS = [
    { mark: "in_progress", progress: 7, episodes: 24, art: "linear-gradient(160deg, #5b2a86 0%, #b23a48 55%, #1b1b2f 100%)" },
    { mark: "finished", progress: 64, episodes: 64, art: "linear-gradient(160deg, #c9822b 0%, #6b3a1f 50%, #141414 100%)" },
    { mark: "plan", progress: null, episodes: 148, art: "linear-gradient(160deg, #2f7a5b 0%, #1f4e79 55%, #0f1a24 100%)" },
    { mark: "unwatched", progress: null, episodes: 26, art: "linear-gradient(160deg, #3a4a7a 0%, #1a2340 55%, #0b0f1c 100%)" }
  ];
  var SETTINGS_CSS = `
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
  function createSettingsView({ send: send2, onView = () => {
  }, pageContext = false, extras = [] } = {}) {
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
      publicRow
    ]);
    const contextTitle = el("p", { class: "st-context-title" });
    const currentStatus = el("select", { "aria-label": "Status for this show" });
    fillStatusSelect(currentStatus, "");
    const progressButton = el("button", { class: "btn", type: "button", hidden: true });
    const context = el("div", { class: "st-card st-context", hidden: true }, [
      el("p", { class: "st-section-title", text: "On this page" }),
      contextTitle,
      currentStatus,
      progressButton
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
        say(`Checking the ${provider.label} key\u2026`);
        act("setSettings", { patch: { providerKey: { id: provider.id, key } } }, (response) => response.originOk === false ? `${response.keyNote || "Key saved."} Allow ${response.origin} in extension settings first.` : response.keyNote || "Key saved.");
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
          el("a", { class: "st-link", href: provider.keyUrl, target: "_blank", rel: "noopener noreferrer", text: provider.free ? "Get a free key" : "Get a key" })
        ]),
        el("span", { class: "st-hint", text: provider.hint }),
        el("div", { class: "st-row" }, [input, save, remove])
      ]);
      return { provider, input, remove, state, row };
    });
    service.addEventListener("change", () => act("setSettings", { patch: { aiService: service.value } }, "Saved."));
    const ai = el("details", { class: "st-card" }, [
      el("summary", { text: "AI preferences" }),
      modelLine,
      el("div", { class: "st-field" }, [el("span", { class: "st-label", text: "AI service" }), service, serviceHint]),
      ...providerRows.map((item) => item.row)
    ]);
    const switches = {};
    function switchRow(key, label, hint) {
      const box = el("input", { type: "checkbox", role: "switch" });
      box.addEventListener("change", () => act("setSettings", { patch: { [key]: box.checked } }, "Saved."));
      switches[key] = box;
      return el("label", { class: "switch" }, [
        box,
        el("span", { class: "switch-copy" }, [el("span", { class: "switch-label", text: label }), el("span", { class: "switch-hint", text: hint })])
      ]);
    }
    ai.append(switchRow("askModelDownload", "Ask before downloading the AI model", "Chrome's built-in model is a one-time download of a few GB."));
    const tracking = el("details", { class: "st-card" }, [
      el("summary", { text: "Notification preferences" }),
      switchRow("episodeDialogs", "Episode update dialogs", "Ask before updating your list when you finish an episode, and confirm automatic updates. When off, updates happen without a dialog and show up in Notifications."),
      switchRow("muteNotifications", "Mute notifications", "No pop-ups on Crunchyroll and no count on the Find button. Notifications still collect under the bell.")
    ]);
    const badgeSelect = (key, label, choices) => {
      const select = el("select", { "aria-label": label });
      for (const [value, text2] of choices) select.append(el("option", { value, text: text2 }));
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
        el("div", { class: "st-field" }, [el("span", { class: "st-label", text: "Animation" }), badgeMotion])
      ]),
      cornerHint,
      switchRow("badgeProgress", "Show episode progress", "Adds the episode you're on, like 7/24, to in-progress and dropped shows.")
    ]);
    const search = el("details", { class: "st-card" }, [
      el("summary", { text: "Search preferences" }),
      switchRow("favorNamed", "Favor the named show", "In searches like \u201Clike Frieren but sadder,\u201D being close to the named show counts more than the other words.")
    ]);
    const liteBox = el("input", { type: "checkbox", role: "switch", "aria-label": "Performance mode" });
    liteBox.addEventListener("change", () => act("setSettings", { patch: { liteMode: liteBox.checked } }, liteBox.checked ? "Performance mode on." : "Performance mode off."));
    const liteSwitch = el("label", {
      class: "switch",
      title: "Turns off blur, glow animations, and transitions, and checks Crunchyroll pages less often. Try it if things feel slow."
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
      status
    ]);
    const history = createHistoryView({ send: send2, onView, onClose: () => checkHistory() });
    root.append(history.root);
    async function checkHistory() {
      const job = await send2("historyProgress");
      historyWaiting = Boolean(job?.ok && (job.waiting || job.running));
      paintHistoryRow();
    }
    function paintHistoryRow() {
      const settings = view?.settings || {};
      historyRow.hidden = !(settings.anilistConnected && settings.anilistViewerName);
      const done = view?.historyImport?.at ? `Added ${view.historyImport.shows === 1 ? "1 show" : `${view.historyImport.shows} shows`} from Crunchyroll on ${new Date(view.historyImport.at).toLocaleDateString(void 0, { month: "short", day: "numeric" })}.` : "";
      historyText.textContent = historyWaiting ? "Your Crunchyroll history is ready to review." : done || "Add the shows you've watched on Crunchyroll to AniList.";
      historyButton.lastChild.textContent = historyWaiting ? "Review" : done ? "Import again" : "Import history";
    }
    historyButton.addEventListener("click", () => {
      if (historyWaiting) history.resume();
      else history.start();
    });
    checkHistory();
    function say(text2, progress) {
      status.textContent = text2 || "";
      statusMeter.set(progress);
    }
    async function act(type, payload, done) {
      const response = await send2(type, payload);
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
      let active2 = -1;
      const paint = () => {
        list.replaceChildren();
        list.hidden = !matches.length;
        matches.forEach((match, index) => {
          const option = el("button", { type: "button", role: "option", text: match });
          option.classList.toggle("is-on", index === active2);
          option.addEventListener("mousedown", (event) => {
            event.preventDefault();
            add(match);
          });
          list.append(option);
        });
      };
      const close = () => {
        matches = [];
        active2 = -1;
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
        active2 = matches.length ? 0 : -1;
        paint();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !list.hidden) {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (!list.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          active2 = (active2 + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
          paint();
        } else if (event.key === "Enter") {
          event.preventDefault();
          add(!list.hidden && active2 >= 0 ? matches[active2] : input.value);
        }
      });
      input.addEventListener("blur", close);
      tasteBox.append(el("div", { class: "st-field" }, [
        el("span", { class: "st-label", text: label }),
        el("span", { class: "st-hint", text: hint }),
        tokens,
        el("div", { class: "st-suggest" }, [input, list])
      ]));
      return tokens;
    }
    const fields = {
      liked: tasteField("liked", "What I like", "Shows with these tags rank higher."),
      disliked: tasteField("disliked", "What I don't like", "Shows with these tags rank lower."),
      dropped: tasteField("dropped", "Dropped", "A softer dislike for tags on shows you stopped."),
      hardAvoids: tasteField("hardAvoids", "Hard avoids", "Shows with these tags never appear.")
    };
    const audio = el("select", { "aria-label": "Sub or dub" });
    for (const [value, label] of [["any", "Any audio"], ["sub", "Prefer sub"], ["dub", "Prefer dub"]]) audio.append(el("option", { value, text: label }));
    tasteBox.append(el("div", { class: "st-field" }, [el("span", { class: "st-label", text: "Sub or dub" }), audio]));
    audio.addEventListener("change", () => view && act("setTaste", { taste: { ...view.taste, subDub: audio.value } }));
    accountButton.addEventListener("click", () => {
      if (view?.settings?.anilistConnected) {
        say("Refreshing AniList\u2026");
        act("refreshAnilist", {}, (response) => `Refreshed ${response.imported} anime from AniList.`);
      } else {
        send2("openOptions");
      }
    });
    publicRow.addEventListener("submit", (event) => {
      event.preventDefault();
      const username = userInput.value.trim();
      if (!username) return;
      say("Importing AniList list\u2026");
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
      say("Sending changes to AniList\u2026");
      act("syncNow", {}, (response) => response.syncNote || "Done.");
    });
    refreshCatalog.addEventListener("click", async () => {
      window.clearInterval(catalogPoll);
      say("Updating the catalog\u2026", 0);
      const response = await send2("refreshCatalogCovers");
      const text2 = response?.ok ? response.note : response?.error || "Could not update the catalog.";
      if (!response?.running) {
        say(text2);
        return;
      }
      say(text2, response.progress || 0);
      catalogPoll = window.setInterval(async () => {
        const progress = await send2("catalogProgress");
        if (!progress?.ok || !progress.running) {
          window.clearInterval(catalogPoll);
          say(!progress?.ok ? "" : response.titlesOwed ? "AniList details updated. The Crunchyroll title list will refresh the next time you open Crunchyroll while signed in." : "Catalog is up to date.");
          const fresh = await send2("getState");
          if (fresh?.view) onView(fresh.view);
          return;
        }
        say(progress.note || text2, progress.progress || 0);
      }, 600);
    });
    async function refreshModel() {
      const response = await send2("modelStatus");
      const state = response?.ok ? response.status : { label: "Unknown" };
      modelLine.replaceChildren(
        document.createTextNode(`${view?.settings?.modelLabel || "Chrome"} model: `),
        el("strong", { text: state.label || "Unknown" }),
        state.detail ? el("span", { class: "st-model-detail", text: state.detail }) : null
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
        const importedAt = view.importMeta?.importedAt ? new Date(view.importMeta.importedAt).toLocaleString(void 0, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
        avatar.classList.toggle("is-connected", connected);
        const shownName = connected || settings.anilistExpired ? settings.anilistViewerName : view.importMeta?.username || "";
        const photo = shownName && view.importMeta?.username === shownName ? view.importMeta.avatar : "";
        const initial = () => shownName ? document.createTextNode(shownName.slice(0, 1).toUpperCase()) : icon("user", 22);
        setAvatar(avatar, photo, initial);
        if (connected) {
          name.textContent = settings.anilistViewerName;
          meta.textContent = importedAt ? `AniList \xB7 synced ${importedAt}` : "AniList";
          accountButton.textContent = "Refresh";
          accountButton.className = "btn";
        } else if (settings.anilistExpired && settings.anilistViewerName) {
          name.textContent = settings.anilistViewerName;
          meta.textContent = "AniList sign-in expired";
          accountButton.textContent = "Reconnect";
          accountButton.className = "btn primary";
        } else {
          name.textContent = view.importMeta?.username || "Not connected";
          meta.textContent = view.importMeta?.username ? importedAt ? `Public list \xB7 ${importedAt}` : "Public list" : "Tracking stays on this device until you connect.";
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
        syncText.textContent = !waiting ? "" : sending ? `Sending ${changeCount} to AniList\u2026` : `${changeCount} waiting to sync${view.sync?.error ? ` \xB7 ${view.sync.error}` : ""}`;
        if (focused() !== userInput && settings.anilistUsername) userInput.value = settings.anilistUsername;
        const when = (time) => new Date(time).toLocaleString(void 0, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        const titles = view.catalogUpdatedAt ? `Titles ${when(view.catalogUpdatedAt)}` : "Titles not refreshed yet";
        const details = view.catalogDetailsAt > view.catalogUpdatedAt + 30 * 60 * 1e3 ? ` \xB7 AniList details ${when(view.catalogDetailsAt)}` : "";
        refreshedLine.textContent = `Last refresh: ${titles}${details}`;
        refreshedLine.title = view.catalogTitlesOwed ? "The title list refreshes the next time you open Crunchyroll while signed in." : "";
        context.hidden = !pageContext || !view.currentId;
        contextTitle.textContent = view.currentTitle || "This show";
        if (focused() !== currentStatus) fillStatusSelect(currentStatus, view.currentStatus || "");
        const offer = view.progressOffer;
        progressButton.hidden = !offer;
        progressButton.textContent = offer ? offer.last ? "Mark completed" : `Mark episode ${offer.to} watched` : "";
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
        serviceHint.textContent = !savedCount ? "No key saved, so Chrome's built-in model runs on this PC. A free key from Gemini, Groq, or OpenRouter is faster." : service.value === "auto" ? savedCount > 1 ? "Tries the service that answered last first. If it takes more than about 12 seconds, hits a limit, or fails, the next saved service answers instead." : "Save a second key so Auto has a backup when one service is slow or out of free requests." : keys[service.value] ? "Only this service is used." : "This service has no key yet, so Auto is used.";
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
      historyWaiting: () => historyWaiting
    };
  }

  // ui/theme.js
  var THEME_CSS = `
  :host, .cl-theme {
    --bg: #100e0c;
    --ink: #161310;
    --raised: #241f1b;
    --glass: rgba(24, 20, 17, .66);
    --glass-strong: rgba(22, 19, 16, .82);
    --pane: rgba(40, 34, 29, .46);
    --pane-hover: rgba(52, 44, 37, .6);
    --line: rgba(255, 226, 196, .1);
    --line-strong: rgba(255, 226, 196, .22);
    --text: #f7f2eb;
    --muted: #cbbfb4;
    --faint: #9d9086;
    --accent: #ff7a2f;
    --accent-text: #ff9a5c;
    --accent-soft: rgba(255, 122, 47, .14);
    --fill: rgba(255, 226, 196, .12);
    --shadow: 0 28px 80px rgba(0, 0, 0, .5);
    --ease: cubic-bezier(.2, .7, .2, 1);
    color-scheme: dark;
    color: var(--text);
    font: 400 15px/1.45 ${ROUNDED};
  }
  :host(.cl-lite), .cl-theme.cl-lite {
    --glass: rgba(24, 20, 17, .97);
    --glass-strong: rgba(22, 19, 16, .98);
    --pane: rgba(40, 34, 29, .9);
    --pane-hover: rgba(52, 44, 37, .95);
    --shadow: 0 10px 28px rgba(0, 0, 0, .45);
  }
  :host(.cl-lite) *, .cl-theme.cl-lite * {
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
    transition: none !important; animation-duration: 0s !important; scroll-behavior: auto !important;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  button, input, select, a, summary, label { font-family: inherit; }
  .glass {
    background: var(--glass);
    -webkit-backdrop-filter: blur(24px) saturate(150%);
    backdrop-filter: blur(24px) saturate(150%);
    border: 1px solid var(--line-strong);
    box-shadow: var(--shadow), 0 0 0 1px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 255, 255, .06);
  }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    min-height: 34px; padding: 6px 14px; border-radius: 12px; cursor: pointer;
    border: 1px solid var(--line); background: var(--pane); color: var(--text);
    font: 700 13px/1 ${ROUNDED};
    transition: background .16s var(--ease), border-color .16s var(--ease), color .16s var(--ease), transform .16s var(--ease);
  }
  .btn:hover { background: var(--pane-hover); border-color: var(--line-strong); }
  .btn:active { transform: translateY(1px); }
  .btn.primary { background: var(--accent); border-color: transparent; color: #1a0d05; }
  .btn.primary:hover { background: #ff8b4a; }
  .btn:disabled { opacity: .5; cursor: default; }
  .icon-btn {
    display: inline-grid; place-items: center; flex: none;
    width: 34px; height: 34px; padding: 0; border: 0; border-radius: 10px; cursor: pointer;
    background: transparent; color: var(--muted);
    transition: color .16s var(--ease), background .16s var(--ease);
  }
  .icon-btn:hover { color: var(--text); background: rgba(255, 226, 196, .06); }
  .icon-btn.is-on { color: var(--accent-text); }
  .icon-btn svg { display: block; }
  input, select {
    background: rgba(16, 14, 12, .7); color: var(--text);
    border: 1px solid var(--line-strong); border-radius: 12px; padding: 8px 12px;
    font: 600 14px/1.3 ${ROUNDED};
    transition: border-color .16s var(--ease), background .16s var(--ease);
  }
  input:hover, select:hover { border-color: rgba(255, 226, 196, .3); }
  input:focus, select:focus { outline: none; border-color: rgba(255, 154, 92, .55); }
  select { cursor: pointer; color-scheme: dark; }
  option { background-color: var(--raised); color: var(--text); font-weight: 700; }
  input[type="checkbox"] { padding: 0; cursor: pointer; }
  [hidden] { display: none !important; }
  .switch { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; }
  .switch input {
    appearance: none; position: relative; flex: none; width: 34px; height: 20px; margin: 1px 0 0;
    border-radius: 999px; background: rgba(255, 226, 196, .1); border: 1px solid var(--line-strong);
    transition: background .16s var(--ease), border-color .16s var(--ease);
  }
  .switch input::after {
    content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
    background: var(--muted); transition: transform .16s var(--ease), background .16s var(--ease);
  }
  .switch input:checked { background: var(--accent); border-color: transparent; }
  .switch input:checked::after { transform: translateX(14px); background: #1a0d05; }
  .switch-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .switch-label { color: var(--text); font: 800 13px/1.25 ${ROUNDED}; }
  .switch-hint { color: var(--faint); font: 600 12px/1.35 ${ROUNDED}; }
  button:focus-visible, a:focus-visible, select:focus-visible, summary:focus-visible, label:has(:focus-visible) {
    outline: 2px solid rgba(255, 154, 92, .8); outline-offset: 2px;
  }
  * { scrollbar-width: thin; scrollbar-color: rgba(255, 226, 196, .16) transparent; }
  *::-webkit-scrollbar { width: 10px; height: 10px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: rgba(255, 226, 196, .16); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
  .cl-meter { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .cl-meter[hidden] { display: none; }
  .cl-meter-track { flex: 1; min-width: 40px; height: 4px; border-radius: 4px; background: rgba(255, 226, 196, .1); overflow: hidden; }
  .cl-meter-fill { display: block; height: 100%; width: 0; border-radius: inherit; background: rgba(255, 154, 92, .9); transition: width .4s var(--ease); }
  .cl-meter-pct { flex: none; min-width: 3.2ch; text-align: right; color: var(--muted); font: 800 11.5px/1 ${ROUNDED}; font-variant-numeric: tabular-nums; }
  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation-duration: .01ms !important; }
  }
`;

  // content/panel.js
  var CORNERS = ["bottom-right", "bottom-left", "top-left", "top-right"];
  var SHELL_CSS = `
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
  function createPanel(doc, { send: send2, onOpenChange = () => {
  }, onCorner = () => {
  }, onView = () => {
  } }) {
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
    const panel2 = el("section", { class: "panel glass", role: "dialog", "aria-label": "Crunchilist search", hidden: true });
    const drawer = el("section", { class: "drawer glass", role: "dialog", "aria-label": "Crunchilist settings", hidden: true });
    const toastTitle = el("p", { class: "toast-title" });
    const toastMeta = el("p", { class: "toast-meta" });
    const toastAction = el("button", { class: "btn primary", type: "button" });
    const toastClose = el("button", { class: "icon-btn", type: "button", "aria-label": "Dismiss", title: "Dismiss" }, [icon("close", 16)]);
    const toastOptBox = el("input", { type: "checkbox" });
    const toastOptText = el("span");
    const toastOpt = el("label", { class: "toast-opt", hidden: true }, [toastOptBox, toastOptText]);
    const toast = el("div", { class: "toast glass", role: "status", hidden: true }, [el("div", { class: "toast-copy" }, [toastTitle, toastMeta, toastOpt]), toastAction, toastClose]);
    shadow.append(style, backdrop, launcher, gather, toast, panel2, drawer);
    let open = false;
    let drawerOpen = false;
    let fullscreen = false;
    let gathering = false;
    let tasks = [];
    let corner = "bottom-right";
    let hydrated = false;
    const search = createSearchView({ send: send2, site: "crunchyroll", onView });
    const moveButton = el("button", { class: "btn", type: "button", title: "Move the search button to the next corner" }, [icon("corner", 15), el("span", { text: "Move button" })]);
    const settings = createSettingsView({ send: send2, onView, pageContext: true, extras: [moveButton] });
    const notices = createNoticesView({ send: send2, onView });
    const fullButton = el("button", { class: "icon-btn", type: "button", "aria-label": "Open the full page", title: "Open the full page" }, [icon("external")]);
    const bellBadge = noticeBadge();
    const bellButton = el("button", { class: "icon-btn nt-bell", type: "button", "aria-label": "Notifications", title: "Notifications", "aria-expanded": "false" }, [icon("bell"), bellBadge]);
    const settingsButton = el("button", { class: "icon-btn", type: "button", "aria-label": "Settings", title: "Settings", "aria-expanded": "false" }, [icon("sliders")]);
    const closeButton = el("button", { class: "icon-btn", type: "button", "aria-label": "Close", title: "Close" }, [icon("close")]);
    const body = el("div", { class: "body" }, [search.root]);
    panel2.append(
      el("div", { class: "topbar" }, [el("p", { class: "brand", text: "Crunchilist" }), fullButton, bellButton, settingsButton, closeButton]),
      body
    );
    search.setScrollRoot(body);
    drawer.append(settings.root, notices.root);
    let drawerPane = "settings";
    function place() {
      const edge = {
        "bottom-right": "right:18px;bottom:18px;",
        "bottom-left": "left:18px;bottom:18px;",
        "top-left": "left:18px;top:18px;",
        "top-right": "right:18px;top:18px;"
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
      const rect = panel2.getBoundingClientRect();
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
      panel2.hidden = !shown;
      panel2.classList.toggle("is-open", shown);
      backdrop.classList.toggle("is-open", shown);
      launcher.setAttribute("aria-expanded", shown ? "true" : "false");
      if (!shown) setDrawer(false);
      const showGather = !fullscreen && (gathering || tasks.length > 0 && !shown);
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
    fullButton.addEventListener("click", () => send2("openApp"));
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
    function showToast({ title, meta = "", action = "", onAction = null, optOut = null, timeout = 3e4 }) {
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
      if (!toast.hidden) toastTimer = window.setTimeout(hideToast, 6e3);
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
        paintBadge2(bellBadge, count);
        paintBadge2(launcherBadge, view.settings?.muteNotifications ? 0 : count);
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
      hideToast
    };
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
  function createPlayerBar(doc, { send: send2, tips = false, frame = false }) {
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
    const text2 = msg.querySelector("span");
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
      send2("setSettings", { patch: { showTips: !tipOff.checked } });
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
      const response = await send2("backToCrunchilist");
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
      text2.textContent = message;
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
      const response = await send2(type);
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
      const response = await send2("tabRole");
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

  // content/scan.js
  function text(node) {
    try {
      const value = node?.textContent;
      return value ? String(value).replace(/\s+/g, " ").trim() : "";
    } catch {
      return "";
    }
  }
  function query(node, selector) {
    try {
      return node?.querySelector?.(selector) || null;
    } catch {
      return null;
    }
  }
  function anchorTitle(anchor) {
    const heading = query(anchor, "h2, h3, h4");
    if (heading && text(heading).length <= 120) return text(heading);
    const alt = query(anchor, "img")?.getAttribute?.("alt")?.trim() || "";
    if (alt && alt.length <= 120) return alt;
    const titled = query(anchor, '[class*="title"]');
    if (titled && text(titled).length <= 120) return text(titled);
    const value = text(anchor);
    return value.length <= 80 ? value : "";
  }
  function readMeta(doc) {
    const result = { audioText: "", subtitleText: "", genres: [], episodeText: "", movieSignal: false };
    const root = doc.body;
    if (!root) return result;
    let walker;
    try {
      walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    } catch {
      return result;
    }
    let seen = 0;
    while (seen < 12e3) {
      let node;
      try {
        node = walker.nextNode();
      } catch {
        break;
      }
      if (!node) break;
      try {
        if (node.id === "cr-corner-host" || node.closest?.("#cr-corner-host")) continue;
        if (node.childElementCount) continue;
        seen += 1;
        const value = text(node);
        if (!value || value.length > 80) continue;
        const key = value.toLowerCase().replace(/:$/, "");
        const sibling = node.nextElementSibling;
        if (key === "audio") result.audioText = text(sibling) || result.audioText;
        if (key === "subtitles" || key === "subtitle") result.subtitleText = text(sibling) || result.subtitleText;
        if (key === "genres" || key === "genre") {
          const chips = sibling ? [...sibling.querySelectorAll("a, button, span")].map(text).filter((item) => item && item.length < 40) : [];
          result.genres = chips.length ? chips : text(sibling).split(/,|·/).map((part) => part.trim()).filter(Boolean);
        }
        if (/\b\d+\s+episodes?\b/i.test(value)) result.episodeText = value;
        if (/^movie$/i.test(value)) result.movieSignal = true;
      } catch {
        seen += 1;
      }
    }
    return result;
  }
  function scanDocument(doc, pageUrl) {
    const url = new URL(pageUrl);
    const kindInfo = pageKindFromPath(url.pathname);
    const heading = text(doc.querySelector("h1"));
    const seasonNode = doc.querySelector('.season-info [class*="select-trigger__title-truncated-text--"], .seasons-select [seasontitle]');
    const activeSeasonTitle = seasonNode ? seasonNode.getAttribute("seasontitle") || text(seasonNode) : "";
    const meta = readMeta(doc);
    const anchors = [];
    doc.querySelectorAll('a[href*="/series/"]').forEach((anchor) => {
      try {
        if (anchor.closest("#cr-corner-host, header, nav, footer")) return;
        const href = anchor.getAttribute("href") || "";
        const seriesId = seriesIdFromHref(href);
        if (!seriesId) return;
        anchors.push({ href, seriesId, title: anchorTitle(anchor) });
      } catch {
      }
    });
    return {
      kind: kindInfo.kind,
      kindInfo,
      pathname: url.pathname,
      pageUrl,
      seriesId: kindInfo.seriesId,
      watchId: kindInfo.watchId || null,
      seriesTitle: kindInfo.kind === "series" ? heading : "",
      activeSeasonTitle,
      audioText: meta.audioText,
      subtitleText: meta.subtitleText,
      genres: meta.genres,
      movieSignal: meta.movieSignal,
      domEpisodeCount: episodeCountFromText(meta.episodeText),
      domEpisodeNumber: kindInfo.kind === "watch" ? episodeNumberFromLabel(heading) : null,
      anchors: anchors.slice(0, 80)
    };
  }

  // lib/enabled.js
  var ENABLED_KEY = "crEnabled";
  async function isEnabled() {
    const stored = await chrome.storage.local.get(ENABLED_KEY);
    return stored[ENABLED_KEY] !== false;
  }

  // content/main.js
  if (!globalThis.__crCornerBooted) {
    globalThis.__crCornerBooted = true;
    boot();
  }
  function boot() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "pauseVideo") pauseVideos(document);
    });
    const begin = async () => {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !(ENABLED_KEY in changes)) return;
        if (changes[ENABLED_KEY].newValue === false) stop();
        else start();
      });
      if (await isEnabled().catch(() => true)) start();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", begin, { once: true });
    else begin();
  }
  var active = false;
  var panel;
  var playerBar;
  var observer;
  var cmsEpisodes = [];
  var cmsSeasons = [];
  var lastPath = location.pathname;
  var scanTimer = 0;
  var scanGeneration = 0;
  var lastSignature = "";
  var latestView = null;
  var offeredEpisode = "";
  var EPISODE_MIN_SECONDS = 240;
  var EPISODE_DONE_RATIO = 0.9;
  function send(type, payload = {}) {
    return chrome.runtime.sendMessage({ type, ...payload }).catch((error) => ({
      ok: false,
      error: /context invalidated/i.test(error?.message || "") ? "Crunchilist was updated. Reload this tab to keep using it." : error?.message || "Extension unavailable"
    }));
  }
  function start() {
    if (active) return;
    active = true;
    if (!panel) {
      panel = createPanel(document, {
        send,
        onOpenChange: (panelOpen) => send("setUi", { panelOpen }),
        onCorner: (panelCorner) => send("setUi", { panelCorner }),
        onView: (view) => renderView(view)
      });
      playerBar = createPlayerBar(document, { send, tips: true });
      window.addEventListener("message", onPageMessage);
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === "enriched" && message.view) renderView(message.view);
        if (message?.type === "activity") renderActivity(message.tasks);
        if (message?.type === "tabRoleChanged" && active) playerBar.refresh(message.note);
      });
      document.addEventListener("fullscreenchange", syncFullscreen);
      document.addEventListener("webkitfullscreenchange", syncFullscreen);
      document.addEventListener("timeupdate", onVideoTime, true);
      document.addEventListener("ended", onVideoTime, true);
      window.addEventListener("resize", syncFullscreen);
      observer = new MutationObserver(() => schedule());
    }
    document.documentElement.append(panel.host, playerBar.host);
    playerBar.refresh();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    lastSignature = "";
    send("getActivity").then((response) => {
      if (response?.ok) renderActivity(response.tasks);
    });
    schedule();
  }
  function stop() {
    if (!active) return;
    active = false;
    observer?.disconnect();
    window.clearTimeout(scanTimer);
    panel?.setActivity([]);
    panel?.setGathering(false);
    panel?.host.remove();
    playerBar?.host.remove();
    clearBadges(document);
  }
  function beginGather(phase) {
    panel.setGathering(true, phase || "Gathering the Crunchyroll list");
  }
  function renderActivity(tasks) {
    if (!active || !panel) return;
    const list = Array.isArray(tasks) ? tasks : [];
    panel.setActivity(list);
    const gathering = list.find((task) => task.gathering);
    panel.setGathering(Boolean(gathering), gathering?.label);
  }
  function onPageMessage(event) {
    if (!active || event.source !== window || event.data?.source !== "cr-corner-hook") return;
    const message = event.data;
    if (message.kind === "auth" && message.token) {
      const locale = document.documentElement.lang || navigator.language || "en-US";
      send("catalogSession", { token: message.token, locale }).then((response) => {
        if (response?.gathering) beginGather(response.phase);
      });
      return;
    }
    if (message.kind === "nav") {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        cmsEpisodes = [];
        cmsSeasons = [];
      }
      schedule();
      return;
    }
    if (message.kind !== "cms" || message.page && message.page !== location.href) return;
    if (/\/cms\/objects\//.test(message.url || "")) {
      cmsEpisodes = cmsEpisodes.concat(parseCmsObjects(message.data)).slice(-120);
    } else if (/\/cms\/series\/[^/]+\/seasons/.test(message.url || "")) {
      cmsSeasons = parseCmsSeasons(message.data);
    }
    schedule();
  }
  function schedule() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(runScan, latestView?.settings?.liteMode ? 1200 : 450);
  }
  function observationSignature(observation) {
    return JSON.stringify({
      kind: observation.kind,
      url: observation.url,
      currentKey: observation.currentKey,
      seasons: (observation.seasons || []).map((season) => [
        season.seriesId,
        season.seasonSlug,
        season.episodeCount,
        season.watchingEpisode,
        season.audio,
        season.genres
      ]),
      sightings: (observation.sightings || []).map((sighting) => [sighting.seriesId, sighting.title])
    });
  }
  async function runScan() {
    if (!active) return;
    const generation = ++scanGeneration;
    let observation;
    try {
      observation = buildObservation({
        ...scanDocument(document, location.href),
        cmsEpisodes,
        cmsSeasons
      });
    } catch {
      return;
    }
    syncFullscreen();
    const signature = observationSignature(observation);
    if (signature === lastSignature) {
      if (latestView) paintMarks(latestView);
      return;
    }
    const response = await send("pageUpdate", { observation });
    if (!active || generation !== scanGeneration || !response?.ok || !response.view) return;
    lastSignature = signature;
    latestView = response.view;
    renderView(response.view, { syncOpen: true });
  }
  function paintMarks(view) {
    if (!active) return;
    if (observer) observer.disconnect();
    try {
      applyBadges(document, view.marks || {}, view.settings || {}, { onPick: pickStatus });
    } finally {
      observer?.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  function renderView(view, { syncOpen = false } = {}) {
    latestView = view;
    if (!active) return;
    panel.setView(view, { syncOpen });
    paintMarks(view);
  }
  var STATUS_WORDS2 = { in_progress: "In progress", finished: "Watched", plan: "Plan", dropped: "Dropped" };
  async function saveStatus(seriesId, status) {
    const response = await send("setStatus", { id: seriesId, status: status === "unwatched" ? null : status });
    if (response?.view) renderView(response.view);
    return response;
  }
  async function pickStatus({ seriesId, status, previous, previousProgress }) {
    const response = await saveStatus(seriesId, status);
    if (!response?.ok) {
      panel.showToast({ title: response?.error || "Could not change the status.", timeout: 6e3 });
      return;
    }
    const title = status === "unwatched" ? "Removed from your list." : `Changed to ${STATUS_WORDS2[status] || status}.`;
    panel.showToast({
      title,
      meta: response.syncNote && !/^Saved/i.test(response.syncNote) ? response.syncNote : "",
      action: "Undo",
      timeout: 8e3,
      onAction: async () => {
        let undone = await saveStatus(seriesId, previous);
        if (undone?.ok && previous === "in_progress" && previousProgress != null) {
          undone = await send("syncAnilistProgress", { id: seriesId, episode: previousProgress, undo: true });
          if (undone?.view) renderView(undone.view);
        }
        panel.showToast({ title: undone?.ok ? "Undone." : undone?.error || "Could not undo that.", timeout: 4e3 });
      }
    });
  }
  function onVideoTime(event) {
    const video = event.target;
    if (!active || !(video instanceof HTMLVideoElement)) return;
    const duration2 = video.duration;
    if (!Number.isFinite(duration2) || duration2 < EPISODE_MIN_SECONDS) return;
    if (event.type !== "ended" && video.currentTime < duration2 * EPISODE_DONE_RATIO) return;
    const offer = latestView?.progressOffer;
    if (!offer) return;
    const key = `${offer.id}:${offer.to}`;
    if (key === offeredEpisode) return;
    offeredEpisode = key;
    send("episodeFinished", { id: offer.id, episode: offer.to }).then((response) => {
      if (response?.view) renderView(response.view);
      if (!response?.ok) {
        if (!latestView?.settings?.muteNotifications) panel.showToast({ title: response?.error || "Could not save that.", timeout: 6e3 });
        return;
      }
      if (!response.toast || response.mode === "none") return;
      showEpisodeToast(response);
    });
  }
  function problemIn(note) {
    return note && !/^Marked episode/.test(note) ? note : "";
  }
  function showEpisodeToast({ mode, offer, noticeId, syncNote }) {
    const title = latestView?.currentTitle || "";
    const optOut = {
      label: "Don't show again (change in Settings)",
      onChange: (checked) => send("setSettings", { patch: { episodeDialogs: !checked } })
    };
    const done = offer.last ? `Marked ${title || "this show"} completed.` : `Marked episode ${offer.to} watched.`;
    if (mode === "auto") {
      panel.showToast({
        title: done,
        meta: problemIn(syncNote) || (offer.last ? "" : title),
        action: "Undo",
        optOut,
        timeout: 8e3,
        onAction: async () => {
          const undone = await send("syncAnilistProgress", { id: offer.id, episode: offer.from, undo: true });
          if (undone?.view) renderView(undone.view);
          panel.showToast({ title: undone?.ok ? "Undone." : undone?.error || "Could not undo that.", timeout: 4e3 });
        }
      });
      return;
    }
    panel.showToast({
      title: offer.last ? `Finished ${title || "the last episode"}?` : `Finished episode ${offer.to}?`,
      meta: offer.last ? "That was the last episode. It stays in Notifications if you skip this." : `${title ? `${title} \xB7 ` : ""}It stays in Notifications if you skip this.`,
      action: offer.last ? "Mark completed" : "Set to Watching",
      optOut,
      onAction: async () => {
        const response = await send("resolveNotice", { id: noticeId, action: "update" });
        if (response?.view) renderView(response.view);
        panel.showToast({ title: response?.ok ? problemIn(response.syncNote) || done : response?.error || "Could not save that.", timeout: 4e3 });
      }
    });
  }
  function syncFullscreen() {
    if (!panel) return;
    const video = document.querySelector("video");
    const element = document.fullscreenElement || document.webkitFullscreenElement;
    const videoFullscreen = Boolean(video && (element === video || video.webkitDisplayingFullscreen));
    panel.setFullscreen(Boolean(element || videoFullscreen));
    playerBar?.setFullscreen(Boolean(element || videoFullscreen));
  }
})();
