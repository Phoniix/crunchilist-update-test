import { ENABLED_KEY } from "../lib/enabled.js";
import { ROUNDED, el, icon, roundedFontFace } from "../ui/dom.js";
import { THEME_CSS } from "../ui/theme.js";

const POPUP_CSS = `
  .pp { display: flex; flex-direction: column; gap: 12px; padding: 14px; }
  .pp-brand { display: flex; align-items: center; gap: 10px; color: var(--text); font: 800 15px/1 ${ROUNDED}; }
  .pp-brand img { width: 24px; height: 24px; }
  .pp-open { width: 100%; min-height: 38px; justify-content: flex-start; gap: 10px; padding: 8px 12px; font-size: 13.5px; }
  .pp-open span { flex: 1; text-align: left; }
  .pp-row { padding: 12px; border-radius: 14px; background: var(--pane); border: 1px solid var(--line); }
  .pp-row.is-off .switch-label { color: var(--muted); }
  .pp-update { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 14px; background: var(--pane); border: 1px solid var(--line); color: var(--text); font-size: 13px; text-decoration: none; }
  .pp-update b { color: var(--accent); }
`;

const style = document.createElement("style");
style.textContent = roundedFontFace() + THEME_CSS + POPUP_CSS;
document.head.append(style);

const open = el("button", { class: "btn primary pp-open", type: "button" }, [icon("home", 17), el("span", { text: "Open Crunchilist" }), icon("external", 15)]);
const toggle = el("input", { type: "checkbox", role: "switch", "aria-label": "Turn Crunchilist on Crunchyroll on or off" });
const hint = el("span", { class: "switch-hint" });
const row = el("label", { class: "switch pp-row" }, [toggle, el("span", { class: "switch-copy" }, [el("span", { class: "switch-label", text: "On Crunchyroll" }), hint])]);

function paint(enabled) {
  toggle.checked = enabled;
  row.classList.toggle("is-off", !enabled);
  hint.textContent = enabled
    ? "Find button, show badges, and episode tracking are on."
    : "Off. Crunchyroll looks normal. The full page app still works.";
}

open.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "openApp" }).catch(() => chrome.tabs.create({ url: chrome.runtime.getURL("app/app.html") }));
  window.close();
});
toggle.addEventListener("change", () => {
  paint(toggle.checked);
  chrome.storage.local.set({ [ENABLED_KEY]: toggle.checked });
});

document.body.append(el("div", { class: "pp" }, [
  el("div", { class: "pp-brand" }, [el("img", { src: "../icons/icon48.png", alt: "" }), el("span", { text: "Crunchilist" })]),
  open,
  row,
]));

chrome.storage.local.get(ENABLED_KEY).then((stored) => paint(stored[ENABLED_KEY] !== false));

chrome.runtime.sendMessage({ type: "updateStatus" }).then((reply) => {
  const latest = reply?.ok && reply.update?.available ? reply.update.latest : null;
  if (!latest) return;
  document.querySelector(".pp").append(el("a", { class: "pp-update", href: chrome.runtime.getURL("app/app.html#settings"), target: "_blank" }, [
    el("b", { text: `Version ${latest.version} is out` }),
    el("span", { text: "Update in Settings" }),
  ]));
}).catch(() => {});
