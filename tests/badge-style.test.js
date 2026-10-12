import assert from "node:assert/strict";
import test from "node:test";
import { badgeHtml, badgeModel, badgeOptions } from "../ui/badge-style.js";

const defaults = badgeOptions({});

test("badge options fall back to the defaults for unknown values", () => {
  assert.deepEqual(badgeOptions({ badgeStyle: "neon", badgeCorner: "middle", badgeUnwatched: "sometimes" }), defaults);
  assert.equal(defaults.style, "glow");
  assert.equal(defaults.corner, "bottom-left");
  assert.equal(badgeOptions({ liteMode: true }).motion, "static");
});

test("the model carries style, corner, tone and progress", () => {
  const model = badgeModel("in_progress", { progress: 3, episodes: 12 }, { ...defaults, style: "tinted", corner: "top-right", size: "small" });
  assert.equal(model.label, "In progress");
  assert.equal(model.extra, "3/12");
  assert.equal(model.extraInWord, false);
  for (const cls of ["crl-badge", "crl-tinted", "crl-t-in_progress", "crl-top-right", "crl-small"]) assert.ok(model.className.split(" ").includes(cls), cls);
});

test("footer badges sit at the bottom and draw a progress line; inline badges never do", () => {
  const options = { ...defaults, style: "footer", corner: "top-right" };
  const footer = badgeModel("finished", { progress: 12, episodes: 12 }, options);
  assert.ok(footer.className.includes("crl-bottom-left"));
  assert.equal(footer.line, 100);
  assert.equal(footer.extra, "12 eps");
  const inline = badgeModel("finished", { progress: 12, episodes: 12 }, options, { inline: true });
  assert.ok(inline.className.includes("crl-inline"));
  assert.equal(inline.line, 0);
});

test("unwatched badges only show on hover when set to hover, and progress can be turned off", () => {
  assert.ok(badgeModel("unwatched", {}, defaults).className.includes("crl-quiet"));
  assert.ok(!badgeModel("unwatched", {}, { ...defaults, unwatched: "always" }).className.includes("crl-quiet"));
  assert.equal(badgeModel("in_progress", { progress: 2, episodes: 10 }, { ...defaults, progress: false }).extra, "");
});

test("badge markup is a focusable menu button with the mark, label and progress", () => {
  const html = badgeHtml("in_progress", { progress: 3, episodes: 12 }, defaults, { dataAttrs: "data-status-badge" });
  assert.match(html, /^<span class="crl-badge crl-glow crl-t-in_progress crl-bottom-left"/);
  assert.match(html, /role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false"/);
  assert.match(html, /data-crl-mark="in_progress" data-status-badge/);
  assert.match(html, /<span class="crl-word">In progress <span class="crl-sub">3\/12<\/span><\/span>/);
  assert.match(html, /<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"\/><\/svg>/);
  assert.match(badgeHtml("plan", {}, defaults, { focusable: false }), /tabindex="-1"/);
  const tinted = badgeHtml("dropped", { progress: 4, episodes: 24 }, { ...defaults, style: "tinted" });
  assert.match(tinted, /<span class="crl-word">Dropped<\/span><span class="crl-sub">4\/24<\/span>/);
  assert.match(badgeHtml("finished", { progress: 12, episodes: 12 }, { ...defaults, style: "footer" }), /<span class="crl-line" style="width:100%"><\/span>/);
});
