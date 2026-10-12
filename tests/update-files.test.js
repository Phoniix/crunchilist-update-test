import assert from "node:assert/strict";
import test from "node:test";
import { gitBlobSha, isPackagePath, packageFiles, rawUrl, sameAsGitHub, staleFiles, withoutCarriageReturns } from "../lib/update-files.js";

test("the manual update files ship with the extension", () => {
  assert.equal(isPackagePath("update.cmd", {}), true);
  assert.equal(isPackagePath("tools/update.ps1", {}), true);
  assert.equal(isPackagePath("tools/../update.cmd", {}), false);
  assert.equal(isPackagePath("other.cmd", {}), false);
});

const MANIFEST = { content_scripts: [{ js: ["content/page-hook.js", "content/crunchilist.js"], css: [] }] };

test("git fingerprints match git hash-object", async () => {
  assert.equal(await gitBlobSha(new TextEncoder().encode("hello\n")), "ce013625030ba8dba906f756967f9e9ca394464a");
  assert.equal(await gitBlobSha(new Uint8Array()), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
});

test("only shipped files count as part of the extension", () => {
  assert.equal(isPackagePath("manifest.json", MANIFEST), true);
  assert.equal(isPackagePath("app/prism.js", MANIFEST), true);
  assert.equal(isPackagePath("content/crunchilist.js", MANIFEST), true);
  assert.equal(isPackagePath("content/main.js", MANIFEST), false);
  assert.equal(isPackagePath("lab/player/player.js", MANIFEST), false);
  assert.equal(isPackagePath("lib/x.test.js", MANIFEST), false);
  assert.equal(isPackagePath("app/../manifest.json", MANIFEST), false);
  assert.equal(isPackagePath("app/has space.js", MANIFEST), false);
});

test("GitHub's tree is cut down to blobs the extension ships", () => {
  const sha = "a".repeat(40);
  const files = packageFiles([
    { path: "app", type: "tree", sha },
    { path: "app/prism.js", type: "blob", sha, size: 10 },
    { path: "scripts/package.mjs", type: "blob", sha },
    { path: "lib/odd.js", type: "blob", sha: "nope" },
  ], MANIFEST);
  assert.deepEqual(files, [{ path: "app/prism.js", sha, size: 10 }]);
});

test("dropped package files are removed, everything else in the folder stays", () => {
  const next = [{ path: "app/prism.js" }];
  assert.deepEqual(staleFiles(["app/prism.js", "app/old.js", "notes.txt", "dev/x.js", "manifest.json", "content/main.js"], next, MANIFEST), ["app/old.js"]);
});

test("a Windows checkout with CRLF line endings still matches GitHub's LF copy", async () => {
  const github = await gitBlobSha(new TextEncoder().encode("a\nb\n"));
  assert.equal(await sameAsGitHub(new TextEncoder().encode("a\r\nb\r\n"), github), true);
  assert.equal(await sameAsGitHub(new TextEncoder().encode("a\nb\n"), github), true);
  assert.equal(await sameAsGitHub(new TextEncoder().encode("a\r\nc\r\n"), github), false);
  assert.equal(await sameAsGitHub(null, github), false);
  assert.deepEqual([...withoutCarriageReturns(new TextEncoder().encode("x\r\ny\rz"))], [...new TextEncoder().encode("x\ny\rz")]);
  assert.equal(withoutCarriageReturns(new TextEncoder().encode("plain")), null);
});

test("raw links encode each part of the path", () => {
  assert.equal(rawUrl("o/r", "v1.0.1", "app/prism.js"), "https://raw.githubusercontent.com/o/r/v1.0.1/app/prism.js");
});
