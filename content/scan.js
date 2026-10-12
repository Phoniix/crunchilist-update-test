import { episodeCountFromText, episodeNumberFromLabel, pageKindFromPath, seriesIdFromHref } from "../lib/page-model.js";

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
  while (seen < 12000) {
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

export function scanDocument(doc, pageUrl) {
  const url = new URL(pageUrl);
  const kindInfo = pageKindFromPath(url.pathname);
  const heading = text(doc.querySelector("h1"));
  const seasonNode = doc.querySelector('.season-info [class*="select-trigger__title-truncated-text--"], .seasons-select [seasontitle]');
  const activeSeasonTitle = seasonNode ? (seasonNode.getAttribute("seasontitle") || text(seasonNode)) : "";
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
      // One odd card should not stop the rest of the page.
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
    anchors: anchors.slice(0, 80),
  };
}
