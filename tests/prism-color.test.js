import assert from "node:assert/strict";
import test from "node:test";
import { CUSTOM_VARS, customVars, hexHsl, hexHsv, hslHex, hsvHex, luma } from "../app/prism-color.js";

test("hex survives a round trip through HSL and HSV", () => {
  for (const hex of ["#ff7a2f", "#8b7bff", "#2ed3c6", "#000000", "#ffffff", "#555555"]) {
    assert.equal(hslHex(...hexHsl(hex)), hex);
    const { h, s, v } = hexHsv(hex);
    assert.equal(hsvHex(h, s, v), hex);
  }
});

test("a custom color fills every theme variable in both modes", () => {
  for (const mode of ["dark", "light"]) {
    const vars = customVars("#ff6fa5", mode);
    assert.deepEqual(Object.keys(vars), CUSTOM_VARS);
    for (const value of Object.values(vars)) assert.match(value, /^#[0-9a-f]{6}$/);
  }
});

test("dark mode has a dark background and light text, light mode the reverse", () => {
  const dark = customVars("#2ed3c6", "dark");
  const light = customVars("#2ed3c6", "light");
  assert.ok(luma(dark["--bg"]) < 0.05 && luma(dark["--text"]) > 0.7);
  assert.ok(luma(light["--bg"]) > 0.8 && luma(light["--text"]) < 0.05);
});

test("text on the accent stays readable for pale and deep picks", () => {
  for (const hex of ["#ffffcc", "#1a0033", "#f5f5f5", "#ff0000"]) {
    for (const mode of ["dark", "light"]) {
      const vars = customVars(hex, mode);
      const [a, b] = [luma(vars["--accent"]), luma(vars["--on-accent"])].sort((x, y) => y - x);
      assert.ok((a + 0.05) / (b + 0.05) >= 3, `${hex} ${mode}: contrast ${((a + 0.05) / (b + 0.05)).toFixed(2)}`);
    }
  }
});
