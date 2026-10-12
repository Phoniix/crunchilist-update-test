// A pretend computer for the updater: a folder on disk, GitHub, the folder picker, the remembered folder,
// and an antivirus. Each scenario describes a user and what goes wrong for them.
import { gitBlobSha } from "../lib/update-files.js";

export const encode = (text) => (text instanceof Uint8Array ? text : new TextEncoder().encode(text));
const decode = (bytes) => new TextDecoder().decode(bytes);
const COMMIT = "c".repeat(40);

class FakeFile {
  constructor(env, parent, name, data) { Object.assign(this, { kind: "file", env, parent, name, data, path: `${parent.path}${name}` }); }
  async getFile() { const data = this.data; return { text: async () => decode(data), arrayBuffer: async () => data.slice().buffer }; }
  async createWritable() {
    let next = null;
    return {
      write: async (bytes) => { next = bytes; },
      close: async () => {
        if (this.env.slowWrites) await new Promise((resolve) => setTimeout(resolve, this.env.slowWrites));
        const fault = this.env.writeFault(this.path);
        if (fault === "quarantine") {
          this.parent.children.delete(this.name);
          throw Object.assign(new Error("Aborted due to security policy."), { name: "AbortError" });
        }
        if (fault === "full") throw Object.assign(new Error("The disk is full."), { name: "QuotaExceededError" });
        this.data = next;
        this.env.log.push(this.path);
      },
    };
  }
}

export class FakeDir {
  constructor(env, path = "") { Object.assign(this, { kind: "directory", env, path, children: new Map() }); }
  missing() { return Object.assign(new Error("A requested file or directory could not be found."), { name: "NotFoundError" }); }
  async getDirectoryHandle(name, { create = false } = {}) {
    let child = this.children.get(name);
    if (!child && create) this.children.set(name, (child = new FakeDir(this.env, `${this.path}${name}/`)));
    if (child?.kind !== "directory") throw this.missing();
    return child;
  }
  async getFileHandle(name, { create = false } = {}) {
    let child = this.children.get(name);
    if (!child && create) this.children.set(name, (child = new FakeFile(this.env, this, name, new Uint8Array())));
    if (child?.kind !== "file") throw this.missing();
    return child;
  }
  async removeEntry(name) {
    if (!this.children.delete(name)) throw this.missing();
    this.env.log.push(`-${this.path}${name}`);
  }
  async *entries() { yield* this.children.entries(); }
  async requestPermission() { return this.env.permission; }
}

export async function folderWith(env, files) {
  const dir = new FakeDir(env);
  for (const [path, text] of Object.entries(files)) {
    const parts = path.split("/");
    let at = dir;
    for (const part of parts.slice(0, -1)) at = await at.getDirectoryHandle(part, { create: true });
    (await at.getFileHandle(parts.at(-1), { create: true })).data = encode(text);
  }
  return dir;
}

export async function read(dir, path) {
  const parts = path.split("/");
  let at = dir;
  try {
    for (const part of parts.slice(0, -1)) at = await at.getDirectoryHandle(part);
    return decode((await at.getFileHandle(parts.at(-1))).data);
  } catch {
    return null;
  }
}

// Every file in a folder, as the installed files for the next makeUser (Chrome reloading onto them).
export async function filesOf(dir, prefix = "") {
  const out = {};
  for (const [name, child] of dir.children) {
    if (child.kind === "directory") Object.assign(out, await filesOf(child, `${prefix}${name}/`));
    else out[`${prefix}${name}`] = decode(child.data);
  }
  return out;
}

export const manifestText = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;
export const crlf = (text) => text.replace(/\n/g, "\r\n");

// installed: files in the user's Crunchilist folder. repo: GitHub's newer version.
// faults: { api: status, offlineAfter: n, tamper: path, quarantine: path => bool, full: path, once: true }
// picker: (env) => handle, or a function that throws. saved: a remembered folder handle.
// slowWrites: ms each file write takes, like an antivirus scanning it.
export async function makeUser({ installed, repo, faults = {}, picker = null, saved = undefined, permission = "granted", browser = {}, slowWrites = 0 }) {
  const env = { log: [], permission, faulted: new Set(), slowWrites };
  env.writeFault = (path) => {
    for (const [kind, match] of [["quarantine", faults.quarantine], ["full", faults.full && ((p) => p === faults.full)]]) {
      if (!match?.(path) || (faults.once && env.faulted.has(path))) continue;
      env.faulted.add(path);
      return kind;
    }
    return null;
  };
  const dir = await folderWith(env, installed);
  env.log.length = 0;
  const running = installed["manifest.json"];
  const tree = [];
  for (const [path, text] of Object.entries(repo)) tree.push({ path, type: "blob", sha: await gitBlobSha(encode(text)), size: encode(text).length });

  let downloads = 0;
  globalThis.window = { showDirectoryPicker: async () => (picker ? picker(env, dir) : dir), ...browser.window };
  globalThis.chrome = { runtime: { getManifest: () => ({ ...JSON.parse(running), ...browser.manifest }), getURL: (path) => `chrome-extension://id/${path}` } };
  globalThis.fetch = async (url) => {
    const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => body, arrayBuffer: async () => encode(body).slice().buffer });
    if (url === "chrome-extension://id/manifest.json") return ok(running);
    if (url.startsWith("https://api.github.com/")) {
      if (faults.api) return { ok: false, status: faults.api, json: async () => ({}) };
      if (url.includes("/commits/")) return ok({ sha: COMMIT });
      if (url.includes("/git/trees/")) return ok({ tree, truncated: false });
    }
    const path = url.split(`/${COMMIT}/`)[1];
    if (path && path in repo) {
      downloads += 1;
      if (faults.offlineAfter != null && downloads > faults.offlineAfter) throw new TypeError("Failed to fetch");
      const body = encode(repo[path]);
      return ok(path === faults.tamper ? encode(`${repo[path]}// injected`) : body);
    }
    return { ok: false, status: 404 };
  };

  const remembered = { value: saved === undefined ? null : saved, sets: 0, forgets: 0 };
  const folders = {
    get: async () => remembered.value,
    set: async (handle) => { remembered.value = handle; remembered.sets += 1; },
    forget: async () => { remembered.value = null; remembered.forgets += 1; },
  };
  const held = new Set();
  const locks = {
    request: async (name, options, callback) => {
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name }); } finally { held.delete(name); }
    },
  };
  const updater = await import("../app/updater.js");
  const steps = [];
  return {
    dir,
    env,
    remembered,
    steps,
    updater,
    update: (latest = { version: JSON.parse(repo["manifest.json"]).version, ref: "master" }) =>
      updater.installUpdate(latest, (text) => steps.push(text), { settleMs: 0, folders, locks }),
    version: async () => JSON.parse(await read(dir, "manifest.json")).version,
  };
}
