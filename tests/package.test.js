import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { contentFiles, localRefs, storeManifest } from "../scripts/package.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("store manifest drops the localhost dev bridge and keeps everything else", () => {
  const out = storeManifest(manifest);
  assert.equal(out.externally_connectable, undefined);
  assert.ok(manifest.externally_connectable, "the source manifest is not modified");
  assert.deepEqual(out.permissions, manifest.permissions);
  assert.deepEqual(out.host_permissions, manifest.host_permissions);
  assert.deepEqual(out.optional_host_permissions, manifest.optional_host_permissions);
});

test("package ships only the content scripts the manifest loads", () => {
  assert.deepEqual(contentFiles(manifest), ["content/page-hook.js", "content/crunchilist.js", "content/crunchilist-frame.js"]);
});

test("local references are found in scripts, pages and styles", () => {
  assert.deepEqual(
    localRefs("a.js", 'import { x } from "./x.js";\nimport "../y.js";\nexport { z } from "./z.js";\nconst m = import("./lazy.js");\nimport fs from "node:fs";'),
    ["./x.js", "../y.js", "./z.js", "./lazy.js"],
  );
  assert.deepEqual(
    localRefs("a.html", '<link href="prism.css"><script src="app.js?v=1"></script><a href="https://anilist.co">x</a><a href="#top">y</a>'),
    ["prism.css", "app.js"],
  );
  assert.deepEqual(localRefs("a.css", 'src: url("../fonts/inter.woff2"); background: url(data:image/png;base64,AA)'), ["../fonts/inter.woff2"]);
  assert.deepEqual(localRefs("a.png", "import x from './x.js'"), []);
});

test("app pages link to files that exist", () => {
  for (const page of ["app/app.html", "app/privacy.html"]) {
    const file = path.join(root, page);
    for (const ref of localRefs(file, fs.readFileSync(file, "utf8"))) {
      assert.equal(fs.existsSync(path.resolve(path.dirname(file), ref)), true, `${page} -> ${ref}`);
    }
  }
});
