import { ROUNDED } from "./dom.js";

export const BADGE_LABELS = {
  finished: "Watched",
  in_progress: "In progress",
  dropped: "Dropped",
  plan: "Plan",
  unwatched: "Unwatched",
};

export const BADGE_STYLES = [
  ["glow", "Glow dot"],
  ["tinted", "Tinted glass"],
  ["footer", "Glass footer"],
  ["corner", "Corner with episode"],
];

export const BADGE_CORNERS = [
  ["bottom-left", "Bottom left"],
  ["bottom-right", "Bottom right"],
  ["top-left", "Top left"],
  ["top-right", "Top right"],
];

const ICON_PATHS = {
  finished: [["path", { d: "M5 12.5l4.2 4.2L19 7", fill: "none", stroke: "currentColor", "stroke-width": "3", "stroke-linecap": "round", "stroke-linejoin": "round" }]],
  in_progress: [["path", { d: "M8 5.5v13l10.5-6.5z", fill: "currentColor" }]],
  plan: [["path", { d: "M7 4.5h10v15l-5-3.6-5 3.6z", fill: "currentColor" }]],
  dropped: [["path", { d: "M7 7l10 10M17 7L7 17", stroke: "currentColor", "stroke-width": "3", "stroke-linecap": "round" }]],
  unwatched: [["circle", { cx: "12", cy: "12", r: "5", fill: "none", stroke: "currentColor", "stroke-width": "2.6" }]],
};

const TONES = {
  finished: "244,117,33",
  in_progress: "255,195,90",
  plan: "88,166,255",
  dropped: "255,90,79",
  unwatched: "168,168,168",
};

export const BADGE_CSS = `
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

export const BADGE_MENU_CSS = `
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

export function badgeIcon(doc, mark) {
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

export function badgeOptions(settings = {}) {
  return {
    style: BADGE_STYLES.some(([id]) => id === settings.badgeStyle) ? settings.badgeStyle : "glow",
    corner: BADGE_CORNERS.some(([id]) => id === settings.badgeCorner) ? settings.badgeCorner : "bottom-left",
    size: settings.badgeSize === "small" ? "small" : "normal",
    progress: settings.badgeProgress !== false,
    unwatched: ["hover", "always", "never"].includes(settings.badgeUnwatched) ? settings.badgeUnwatched : "hover",
    motion: settings.badgeMotion === "static" || settings.liteMode ? "static" : "animated",
    lite: Boolean(settings.liteMode),
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

export function badgeSignature(mark, info, options, inline) {
  return [mark, info.progress ?? "", info.episodes ?? "", options.style, options.corner, options.size, options.progress, options.unwatched, options.motion, options.lite, inline].join("|");
}

// What a badge shows, shared by the DOM painter (Crunchyroll pages) and the HTML string (Prism cards).
export function badgeModel(mark, info, options, { inline = false } = {}) {
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
    line: share > 0 ? Math.round(share * 100) : 0,
  };
}

export function paintBadge(badge, mark, info, options, { inline = false } = {}) {
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

const attr = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const iconHtml = (mark) => `<span class="crl-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${(ICON_PATHS[mark] || ICON_PATHS.unwatched)
  .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${attr(value)}"`).join(" ")}/>`).join("")}</svg></span>`;

// The same badge as paintBadge, as markup. dataAttrs are extra attributes, already escaped by the caller.
export function badgeHtml(mark, info, options, { inline = false, focusable = true, dataAttrs = "" } = {}) {
  const model = badgeModel(mark, info, options, { inline });
  const sub = model.extra ? `<span class="crl-sub">${attr(model.extra)}</span>` : "";
  const word = `<span class="crl-word">${attr(model.label)}${model.extraInWord && sub ? ` ${sub}` : ""}</span>`;
  return `<span class="${model.className}" role="button" tabindex="${focusable ? 0 : -1}" aria-haspopup="menu" aria-expanded="false" aria-label="Status: ${attr(model.label)}. Change status" title="Change status" data-crl-mark="${mark}" ${dataAttrs}>`
    + `${iconHtml(mark)}${word}${model.extraInWord ? "" : sub}${model.line ? `<span class="crl-line" style="width:${model.line}%"></span>` : ""}</span>`;
}
