export const ROUNDED = '"Crunchilist Rounded", "Trebuchet MS", Candara, sans-serif';

export function roundedFontFace() {
  let url = "/fonts/nunito-latin.woff2";
  try {
    if (globalThis.chrome?.runtime?.getURL) url = chrome.runtime.getURL("fonts/nunito-latin.woff2");
  } catch {
    url = "/fonts/nunito-latin.woff2";
  }
  return `@font-face{font-family:"Crunchilist Rounded";src:url("${url}") format("woff2");font-weight:400 800;font-style:normal;font-display:swap;}`;
}

export function el(tag, attrs = {}, children = []) {
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

export function progressMeter(label = "Progress") {
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
    },
  };
}

export function setAvatar(holder, url, fallback) {
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

const GLYPHS = {
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
  tagOff: [["path", { d: "M3.5 12.5V4.5h8l9 9-8 8z" }], ["path", { d: "M3 21L21 3" }]],
};

export function icon(name, size = 18) {
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

export const STATUS_OPTIONS = [
  ["", "Set status"],
  ["plan", "Plan to watch"],
  ["in_progress", "Watching"],
  ["finished", "Finished"],
  ["dropped", "Dropped"],
  ["clear", "Clear"],
];

export function fillStatusSelect(select, value) {
  select.replaceChildren();
  for (const [optionValue, label] of STATUS_OPTIONS) select.append(el("option", { value: optionValue, text: label }));
  select.value = value || "";
}
