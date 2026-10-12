import { ROUNDED } from "./dom.js";

export const THEME_CSS = `
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
