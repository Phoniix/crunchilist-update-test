import assert from "node:assert/strict";
import test from "node:test";
import { gitBlobSha } from "../lib/update-files.js";

const encode = (text) => new TextEncoder().encode(text);
const decode = (bytes) => new TextDecoder().decode(bytes);

// quarantine(path) plays the antivirus: true deletes the file as it is written, like Defender did.
let quarantine = () => false;
class FakeFile {
  constructor(data, log, path, parent, name) { Object.assign(this, { kind: "file", data, log, path, parent, name }); }
  async getFile() { const data = this.data; return { text: async () => decode(data), arrayBuffer: async () => data.slice().buffer }; }
  async createWritable() {
    let next = null;
    return {
      write: async (bytes) => { next = bytes; },
      close: async () => {
        if (quarantine(this.path)) {
          this.parent.children.delete(this.name);
          throw Object.assign(new Error("Aborted due to security policy."), { name: "AbortError" });
        }
        this.data = next;
        this.log.push(this.path);
      },
    };
  }
}
class FakeDir {
  constructor(log = [], path = "") { this.kind = "directory"; this.children = new Map(); this.log = log; this.path = path; }
  missing() { return Object.assign(new Error("missing"), { name: "NotFoundError" }); }
  async getDirectoryHandle(name, { create = false } = {}) {
    let child = this.children.get(name);
    if (!child && create) this.children.set(name, (child = new FakeDir(this.log, `${this.path}${name}/`)));
    if (child?.kind !== "directory") throw this.missing();
    return child;
  }
  async getFileHandle(name, { create = false } = {}) {
    let child = this.children.get(name);
    if (!child && create) this.children.set(name, (child = new FakeFile(new Uint8Array(), this.log, `${this.path}${name}`, this, name)));
    if (child?.kind !== "file") throw this.missing();
    return child;
  }
  async removeEntry(name) { if (!this.children.delete(name)) throw this.missing(); this.log.push(`-${this.path}${name}`); }
  async *entries() { yield* this.children.entries(); }
  async requestPermission() { return "granted"; }
}
async function folderWith(files) {
  const dir = new FakeDir();
  for (const [path, text] of Object.entries(files)) {
    const parts = path.split("/");
    let at = dir;
    for (const part of parts.slice(0, -1)) at = await at.getDirectoryHandle(part, { create: true });
    (await at.getFileHandle(parts.at(-1), { create: true })).data = encode(text);
  }
  dir.log.length = 0;
  return dir;
}
async function read(dir, path) {
  const parts = path.split("/");
  let at = dir;
  try {
    for (const part of parts.slice(0, -1)) at = await at.getDirectoryHandle(part);
    return decode((await at.getFileHandle(parts.at(-1))).data);
  } catch {
    return null;
  }
}

const RUNNING = { name: "Crunchilist", version: "1.0.108", content_scripts: [{ js: ["content/crunchilist.js"] }] };
const RUNNING_TEXT = `${JSON.stringify(RUNNING, null, 2)}\n`;
const NEXT = { ...RUNNING, version: "1.0.200", externally_connectable: { matches: ["http://localhost/*"] } };
const REPO_FILES = {
  "manifest.json": JSON.stringify(NEXT),
  "app/app.js": "new app",
  "lib/a.js": "new lib",
  "content/crunchilist.js": "bundle",
  "content/main.js": "source only",
  "scripts/package.mjs": "dev only",
};

async function setUp({ local = {}, tamper = null, repo = REPO_FILES, block = () => false } = {}) {
  quarantine = () => false;
  const tree = [];
  for (const [path, text] of Object.entries(repo)) tree.push({ path, type: "blob", sha: await gitBlobSha(encode(text)), size: text.length });
  const dir = await folderWith({ "manifest.json": RUNNING_TEXT, "app/app.js": "old app", "app/old.js": "gone next version", "notes.txt": "mine", "dev/keep.js": "dev", ...local });
  globalThis.window = { showDirectoryPicker: async () => dir };
  globalThis.chrome = { runtime: { getManifest: () => RUNNING, getURL: (path) => `chrome-extension://id/${path}` } };
  globalThis.fetch = async (url) => {
    const ok = (body, json = false) => ({ ok: true, status: 200, json: async () => body, text: async () => body, arrayBuffer: async () => encode(body).buffer });
    if (url === "chrome-extension://id/manifest.json") return ok(RUNNING_TEXT);
    if (url.includes("/commits/")) return ok({ sha: "c".repeat(40) });
    if (url.includes("/git/trees/")) return ok({ tree, truncated: false });
    const path = url.split(`/${"c".repeat(40)}/`)[1];
    if (path && path in repo) return ok(path === tamper ? `${repo[path]}!` : repo[path]);
    return { ok: false, status: 404 };
  };
  const { installUpdate } = await import("../app/updater.js");
  quarantine = block;
  return { dir, run: () => installUpdate({ version: "1.0.200", ref: "master" }, () => {}, { settleMs: 0 }) };
}

test("an update writes the new files, drops removed ones, and writes the manifest last", async () => {
  const { dir, run } = await setUp({ local: { "lib/a.js": "new lib", "content/crunchilist.js": "bundle" } });
  assert.deepEqual(await run(), { version: "1.0.200", changed: 1 });
  assert.ok(!dir.log.includes("lib/a.js"), "files that already match are not rewritten");
  assert.ok(dir.log.includes(".crunchilist-update/app/app.js"), "changed files are test-written first");
  assert.ok(!dir.children.has(".crunchilist-update"), "the test folder is removed");
  assert.equal(await read(dir, "app/app.js"), "new app");
  assert.equal(await read(dir, "lib/a.js"), "new lib");
  assert.equal(await read(dir, "content/crunchilist.js"), "bundle");
  assert.equal(await read(dir, "content/main.js"), null);
  assert.equal(await read(dir, "app/old.js"), null);
  assert.equal(await read(dir, "notes.txt"), "mine");
  assert.equal(await read(dir, "dev/keep.js"), "dev");
  const manifest = JSON.parse(await read(dir, "manifest.json"));
  assert.equal(manifest.version, "1.0.200");
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(dir.log.at(-1), "manifest.json");
});

test("a file that doesn't match GitHub's fingerprint stops the update before anything is written", async () => {
  const { dir, run } = await setUp({ tamper: "lib/a.js" });
  await assert.rejects(run(), { code: "integrity" });
  assert.deepEqual(dir.log, []);
  assert.equal(await read(dir, "app/app.js"), "old app");
});

test("files checked out with Windows line endings are not rewritten", async () => {
  const repo = { ...REPO_FILES, "lib/a.js": "line one\nline two\n" };
  const { dir, run } = await setUp({ repo, local: { "lib/a.js": "line one\r\nline two\r\n" } });
  await run();
  assert.ok(!dir.log.some((path) => path.endsWith("lib/a.js")));
  assert.equal(await read(dir, "lib/a.js"), "line one\r\nline two\r\n");
});

test("a file the antivirus removes during the test write leaves the working copy untouched", async () => {
  const { dir, run } = await setUp({ block: (path) => path === ".crunchilist-update/lib/a.js" });
  await assert.rejects(run(), { code: "blocked", message: /lib\/a\.js/ });
  assert.equal(await read(dir, "app/app.js"), "old app");
  assert.equal(await read(dir, "app/old.js"), "gone next version");
  assert.equal(JSON.parse(await read(dir, "manifest.json")).version, "1.0.108");
  assert.ok(!dir.children.has(".crunchilist-update"));
});

test("a file blocked while installing puts the old files back and keeps the old version", async () => {
  const { dir, run } = await setUp({ block: (path) => path === "lib/a.js" });
  await assert.rejects(run(), { code: "blocked" });
  assert.equal(await read(dir, "app/app.js"), "old app");
  assert.equal(await read(dir, "lib/a.js"), null);
  assert.equal(JSON.parse(await read(dir, "manifest.json")).version, "1.0.108");
});

test("a folder that isn't this copy of Crunchilist is refused", async () => {
  const { dir, run } = await setUp({ local: { "manifest.json": "{\"name\":\"Something else\"}" } });
  await assert.rejects(run(), { code: "folder" });
  assert.deepEqual(dir.log, []);
});

test("a git checkout is left to git pull", async () => {
  const { dir, run } = await setUp({ local: { ".git/HEAD": "ref" } });
  await assert.rejects(run(), { code: "git" });
  assert.deepEqual(dir.log, []);
});

test("the same or an older version is never installed", async () => {
  const { dir, run } = await setUp({ repo: { ...REPO_FILES, "manifest.json": JSON.stringify({ ...NEXT, version: "1.0.108" }) } });
  await assert.rejects(run(), { code: "current" });
  assert.deepEqual(dir.log, []);
});
