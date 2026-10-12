import { seriesIdFromHref } from "../lib/page-model.js";
import { BADGE_CSS, BADGE_MENU_CSS, badgeOptions, badgeSignature, paintBadge } from "../ui/badge-style.js";
import { closeBadgeMenu, openBadgeMenu } from "../ui/badge-menu.js";

const STYLE_ID = "crl-badge-style";
const BANNER_SELECTOR = '[class*="hero" i], [class*="spotlight" i], [class*="banner" i], [class*="billboard" i], [data-t*="hero" i]';
let wiredDoc = null;
let pickHandler = () => {};

function ensureStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  let fontFace = "";
  try {
    fontFace = `@font-face{font-family:"Crunchilist Rounded";src:url("${chrome.runtime.getURL("fonts/nunito-latin.woff2")}") format("woff2");font-weight:600 800;font-style:normal;font-display:swap;}`;
  } catch {
    // Without the extension URL the badges fall back to a system font.
  }
  try {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `${fontFace}${BADGE_CSS}${BADGE_MENU_CSS}`;
    (doc.head || doc.documentElement).append(style);
  } catch {
    // The page can refuse an injected style.
  }
}

function seriesIdsIn(element) {
  const ids = new Set();
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

const CONTINUE_SELECTOR = '[class*="continue-watching" i], [class*="continuewatching" i], [class*="continue_watching" i], [data-t*="continue-watching" i], [data-t*="continue_watching" i]';
const CONTINUE_HEADING = /^\s*continue watching\b/i;

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
  const images = [...root.querySelectorAll("img")].filter((image) => !inOverlay(image, root));
  let image = null;
  let area = 0;
  for (const candidate of images) {
    const box = candidate.getBoundingClientRect();
    if (box.width * box.height > area) {
      area = box.width * box.height;
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

const CONTROL_SELECTOR = 'button, [role="button"], [data-t*="button" i], [data-t*="play" i]';

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
  const controls = [...root.querySelectorAll(CONTROL_SELECTOR)]
    .filter((node) => !node.closest("[data-cr-corner-badge]"))
    .map((node) => node.getBoundingClientRect())
    .filter((box) => box.width > 0 && box.height > 0);
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
    if (!badge || (event.key !== "Enter" && event.key !== " ")) return;
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
    onPick: (status) => pickHandler({ seriesId, status, previous: mark, previousProgress: Number.isInteger(progress) ? progress : null }),
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

export function clearBadges(doc) {
  closeBadgeMenu();
  doc.querySelectorAll("[data-cr-corner-badge]").forEach(removeBadge);
  doc.querySelectorAll("[data-crl-card]").forEach((root) => delete root.dataset.crlCard);
  doc.querySelectorAll("[data-cr-corner-hidden]").forEach(unhide);
}

export function applyBadges(doc, marks, settings = {}, { onPick } = {}) {
  ensureStyles(doc);
  wire(doc);
  if (onPick) pickHandler = onPick;
  const baseOptions = badgeOptions(settings);
  const found = new Map();
  doc.querySelectorAll('a[href*="/series/"]').forEach((anchor) => {
    try {
      if (anchor.closest("#cr-corner-host, header, nav, footer, .crl-menu")) return;
      const seriesId = seriesIdFromHref(anchor.getAttribute("href") || "");
      if (!seriesId) return;
      const root = cardRoot(anchor);
      if (!found.has(root) && !isBanner(root)) found.set(root, seriesId);
    } catch {
      // Skip a link the page will not let us read.
    }
  });
  const roots = [...found.keys()];
  const used = new Set(roots.filter((root) => !roots.some((other) => other !== root && other.contains(root))));
  const hosts = new Map([...used].map((root) => [root, posterBox(root)]));
  const kept = new Set();
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
      // Skip a card the page will not let us mark.
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
