import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("manifest points at files that exist", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.type, "module");
  assert.ok(manifest.host_permissions.includes("https://anilist.co/*"));
  const files = [
    manifest.background.service_worker,
    ...manifest.content_scripts.flatMap((script) => script.js),
    ...manifest.web_accessible_resources.flatMap((entry) => entry.resources),
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
  ];
  for (const file of files) assert.equal(fs.existsSync(path.join(root, file)), true, file);
  assert.deepEqual(
    manifest.content_scripts.map((script) => script.js),
    [["content/page-hook.js"], ["content/crunchilist.js"], ["content/crunchilist-frame.js"]],
  );
  assert.equal(manifest.content_scripts[2].all_frames, true);
  assert.deepEqual(manifest.content_scripts[2].matches, ["https://static.crunchyroll.com/*"]);
  assert.equal(manifest.content_scripts[0].world, "MAIN");
  assert.ok(manifest.permissions.includes("webNavigation"));
  const legacy = fs.readFileSync(path.join(root, "content/content.js"), "utf8");
  const staleBundle = fs.readFileSync(path.join(root, "content/bundle.js"), "utf8");
  assert.equal(/^\s*import\s/m.test(legacy), false);
  assert.equal(/querySelector|function text/.test(staleBundle), false);
});
