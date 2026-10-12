import { THEME_CSS } from "../ui/theme.js";

// The shared search, settings and history views carry their own warm theme, which clashes with Prism's buttons and inputs.
// Each one lives in a shadow root, and this bridge repaints the shared theme with the Prism palette.
// The wrapper resolves Prism's colors first (as --p-*), because a host can't define a variable from one of its own.
const BRIDGE_CSS = `
  :host, :host(.cl-lite) {
    --bg: var(--p-bg); --ink: var(--p-bg); --raised: var(--p-surface-2);
    --glass: color-mix(in srgb, var(--p-surface) 70%, transparent);
    --glass-strong: color-mix(in srgb, var(--p-surface) 94%, transparent);
    --pane: color-mix(in srgb, var(--p-surface) 70%, transparent);
    --pane-hover: var(--p-surface-2);
    --line: color-mix(in srgb, var(--p-text) 10%, transparent);
    --line-strong: color-mix(in srgb, var(--p-text) 20%, transparent);
    --text: var(--p-text); --muted: var(--p-muted); --faint: color-mix(in srgb, var(--p-muted) 75%, var(--p-bg));
    --accent: var(--p-accent); --accent-text: var(--p-accent);
    --accent-soft: color-mix(in srgb, var(--p-accent) 15%, transparent);
    --fill: color-mix(in srgb, var(--p-text) 9%, transparent);
    --shadow: 0 24px 60px -24px rgba(0, 0, 0, .45);
    --ease: cubic-bezier(.2, .8, .2, 1);
    display: block; color-scheme: var(--p-scheme, dark); font-family: var(--p-font);
  }
  *:not(svg):not(path) { font-family: var(--p-font) !important; }
  h2, .st-title, .sv-head h2 { font-family: var(--p-display) !important; letter-spacing: -.01em; }
  input, select { background: color-mix(in srgb, var(--p-bg) 55%, transparent); color-scheme: var(--p-scheme, dark); }
  input:hover, select:hover, .sv-bar:hover { border-color: color-mix(in srgb, var(--p-accent) 40%, var(--line-strong)); }
  input:focus, select:focus, .sv-tag-pick:focus-within { border-color: var(--p-accent); }
  button:focus-visible, a:focus-visible, select:focus-visible, summary:focus-visible, label:has(:focus-visible) { outline-color: var(--p-accent); }
  .btn.primary, .sv-chip.is-on { color: var(--p-on-accent); }
  .btn.primary:hover { background: color-mix(in srgb, var(--p-accent) 86%, var(--p-text)); }
  .switch input { background: var(--fill); }
  .switch input:checked::after { background: var(--p-on-accent); }
  .icon-btn:hover, .sv-ai:hover, .sv-plan:hover, .sv-drop a.is-on, .sv-drop a:hover, .sv-tag-list button.is-on, .sv-tag-list button:hover,
  .sv-status-select:hover, .st-list button.is-on, .st-list button:hover { background: var(--fill); }
  .sv-bar:focus-within { border-color: var(--p-accent); background: var(--glass-strong); box-shadow: 0 0 0 4px color-mix(in srgb, var(--p-accent) 14%, transparent); }
  .sv-bar::after { background: linear-gradient(90deg, transparent, var(--p-accent), transparent); }
  .sv-note-fill, .cl-meter-fill { background: var(--p-accent); }
  .sv-refine { border-top-color: var(--line); }
  .sv-tag, .sv-sort, .sv-status-select, .st-token, .hi-tag, .sv-meter-bar, .cl-meter-track { background: var(--fill); }
  .sv-tag-token:hover, .st-token:hover { background: color-mix(in srgb, var(--p-accent) 22%, transparent); }
  .sv-link-btn:hover, .sv-title:hover, .sv-poster-link:hover .sv-poster-title { color: var(--p-accent); }
  .sv-status-select.has-status { border-color: color-mix(in srgb, var(--p-accent) 50%, transparent); }
  .sv-meter-bar span { background: var(--p-accent); }
  .sv-more.is-loading::after { border-color: var(--fill); border-top-color: var(--p-accent); }
  .hi-confirm { background: color-mix(in srgb, var(--p-accent) 8%, transparent); border-color: color-mix(in srgb, var(--p-accent) 32%, transparent); }
  .st-card, .sv-card { border-radius: calc(var(--p-radius) + 2px); }
  * { scrollbar-color: color-mix(in srgb, var(--p-text) 18%, transparent) transparent; }
  *::-webkit-scrollbar-thumb { background-color: color-mix(in srgb, var(--p-text) 18%, transparent); }
`;

// One shadow-rooted copy of a shared view. css is the view's own stylesheet; extra is Prism-only layout for it.
export function embed(css, node, { label = "", extra = "" } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "embed";
  const host = document.createElement("div");
  host.className = "embed-host";
  if (label) host.setAttribute("aria-label", label);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = THEME_CSS + css + BRIDGE_CSS + extra;
  shadow.append(style, node);
  wrap.append(host);
  return { wrap, host, shadow };
}
