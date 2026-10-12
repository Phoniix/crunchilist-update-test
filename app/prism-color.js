// Custom theme: one picked color becomes a full palette for light and dark mode
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const toHex = (r, g, b) => `#${[r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;
const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
export function hexHsl(hex) {
  const [r, g, b] = rgbOf(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l * 100];
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, (d / (1 - Math.abs(2 * l - 1))) * 100, l * 100];
}
export function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return toHex(f(0), f(8), f(4));
}
export function hsvHex(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return toHex(f(5), f(3), f(1));
}
export function hexHsv(hex) {
  const [r, g, b] = rgbOf(hex);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = !d ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
export const luma = (hex) => rgbOf(hex).map((c) => (c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
export const CUSTOM_VARS = ["--bg", "--bg-2", "--surface", "--surface-2", "--line", "--text", "--muted", "--accent", "--accent-2", "--on-accent"];
export function customVars(hex, mode) {
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
