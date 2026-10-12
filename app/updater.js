// The Update button: writes a newer version from GitHub into the folder this copy was loaded from, then reloads.
// Every file is downloaded and checked against GitHub's fingerprint before the first one is written.
import { REPO, compareVersions } from "../lib/update-check.js";
import { PACKAGE_FOLDERS, contentFiles, gitBlobSha, packageFiles, rawUrl, sameAsGitHub, staleFiles, storeManifest } from "../lib/update-files.js";

const API = `https://api.github.com/repos/${REPO}`;
const DOWNLOADS_AT_ONCE = 6;

export class UpdateError extends Error {
  constructor(message, code = "failed") {
    super(message);
    this.code = code;
  }
}

export const canSelfUpdate = () => typeof window.showDirectoryPicker === "function" && !chrome.runtime.getManifest().update_url;

// The chosen folder is remembered so later updates only need the button.
const DB = "cl-updater";
function idb(mode, run) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("handles");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("handles", mode);
      const request = run(tx.objectStore("handles"));
      tx.oncomplete = () => { open.result.close(); resolve(request?.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
    };
  });
}
const savedFolders = {
  get: () => idb("readonly", (store) => store.get("folder")).catch(() => null),
  set: (handle) => idb("readwrite", (store) => store.put(handle, "folder")).catch(() => {}),
  forget: () => idb("readwrite", (store) => store.delete("folder")).catch(() => {}),
};

async function readText(dir, name) {
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch {
    return null;
  }
}
async function hasFolder(dir, name) {
  try {
    await dir.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
}

// Only the folder Chrome loaded this copy from: its manifest.json must match the running one exactly.
async function checkFolder(dir) {
  const running = await (await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" })).text();
  const there = await readText(dir, "manifest.json");
  if (there == null) throw new UpdateError("That folder has no manifest.json. Pick the folder you loaded Crunchilist from.", "folder");
  if (there !== running) throw new UpdateError("That isn't the folder this copy of Crunchilist runs from. Pick the one shown under Crunchilist on chrome://extensions.", "folder");
  if (await hasFolder(dir, ".git")) throw new UpdateError("This copy is a git checkout. Update it with git pull, then press reload on chrome://extensions.", "git");
}

// Must run straight from the click: Chrome only shows the folder prompt during a user action.
async function chooseFolder(folders) {
  const saved = await folders.get();
  if (saved) {
    try {
      if ((await saved.requestPermission({ mode: "readwrite" })) === "granted") {
        await checkFolder(saved);
        return saved;
      }
    } catch (error) {
      if (error instanceof UpdateError && error.code === "git") throw error;
    }
    await folders.forget();
  }
  let picked;
  try {
    picked = await window.showDirectoryPicker({ id: "crunchilist-folder", mode: "readwrite" });
  } catch (error) {
    throw new UpdateError(error?.name === "AbortError" ? "Update canceled." : "Chrome didn't allow access to that folder.", "canceled");
  }
  await checkFolder(picked);
  await folders.set(picked);
  return picked;
}

async function reach(url, options) {
  let response;
  try {
    response = await fetch(url, { cache: "no-store", ...options });
  } catch {
    throw new UpdateError("Couldn't reach GitHub. Check your connection and try again. Nothing was changed.", "network");
  }
  if (response.status === 403 || response.status === 429) throw new UpdateError("GitHub is limiting requests from your connection right now. Try again in an hour. Nothing was changed.", "network");
  return response;
}

async function getJson(url) {
  const response = await reach(url, { headers: { accept: "application/vnd.github+json" } });
  if (!response.ok) throw new UpdateError(`GitHub answered ${response.status}. Try again later.`, "network");
  return response.json();
}

async function download(ref, file) {
  const response = await reach(rawUrl(REPO, ref, file.path));
  if (!response.ok) throw new UpdateError(`Couldn't download ${file.path}. Try again later. Nothing was changed.`, "network");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if ((await gitBlobSha(bytes)) !== file.sha) throw new UpdateError(`${file.path} didn't match GitHub's copy, so nothing was changed.`, "integrity");
  return bytes;
}

async function inBatches(items, size, run) {
  const queue = items.slice();
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await run(queue.shift());
  }));
}

async function writeFile(dir, file, bytes) {
  const parts = file.split("/");
  let folder = dir;
  for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true });
  const writable = await (await folder.getFileHandle(parts.at(-1), { create: true })).createWritable();
  await writable.write(bytes);
  await writable.close();
}

async function readBytes(dir, file) {
  const parts = file.split("/");
  let folder = dir;
  try {
    for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part);
    return new Uint8Array(await (await (await folder.getFileHandle(parts.at(-1))).getFile()).arrayBuffer());
  } catch {
    return null;
  }
}

async function removeFile(dir, file) {
  const parts = file.split("/");
  let folder = dir;
  for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part);
  await folder.removeEntry(parts.at(-1));
}

async function listFiles(dir, prefix) {
  const out = [];
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith(".")) continue;
    if (handle.kind === "directory") out.push(...await listFiles(handle, `${prefix}${name}/`));
    else out.push(`${prefix}${name}`);
  }
  return out;
}

async function installedFiles(dir, manifest) {
  const roots = new Set([...PACKAGE_FOLDERS, ...contentFiles(manifest).map((file) => file.split("/")[0])]);
  const out = [];
  for (const root of roots) {
    try {
      out.push(...await listFiles(await dir.getDirectoryHandle(root), `${root}/`));
    } catch {}
  }
  return out;
}

// Antivirus (Windows Defender especially) scans each file Chrome writes and can quarantine one as a false
// positive. Changed files are written to this folder first and read back; only if all of them survive is
// the working copy touched, so a blocked file can never leave Crunchilist half-installed.
const STAGING = ".crunchilist-update";
const SETTLE_MS = 1500;

const sameBytes = (a, b) => Boolean(a && b) && a.length === b.length && a.every((byte, index) => byte === b[index]);
const blocked = (file) => new UpdateError(`Your antivirus blocked ${file} while it was being written, so nothing was changed. ${/Windows/.test(globalThis.navigator?.userAgent || "") ? "Double-click update.cmd in your Crunchilist folder, use" : "Use"} Download instead, or allow the Crunchilist folder in your antivirus.`, "blocked");
// Chrome reports an antivirus block as AbortError or SecurityError; anything else is a plain write failure.
function writeFailure(file, error) {
  if (error instanceof UpdateError) return error;
  if (error?.name === "QuotaExceededError") return new UpdateError(`Your disk is full, so ${file} couldn't be written. Nothing was changed. Free up some space and try again.`, "failed");
  if (!error || error.name === "AbortError" || error.name === "SecurityError") return blocked(file);
  return new UpdateError(`Couldn't write ${file} (${error.message || error.name}). Nothing was changed.`, "failed");
}

async function stageAndCheck(dir, writes, settleMs) {
  await dir.removeEntry(STAGING, { recursive: true }).catch(() => {});
  const stage = await dir.getDirectoryHandle(STAGING, { create: true });
  try {
    for (const [file, bytes] of writes) {
      try {
        await writeFile(stage, file, bytes);
      } catch (error) {
        throw writeFailure(file, error);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    for (const [file, bytes] of writes) if (!sameBytes(await readBytes(stage, file), bytes)) throw blocked(file);
  } finally {
    await dir.removeEntry(STAGING, { recursive: true }).catch(() => {});
  }
}

// latest: { version, ref } from the update check. onStep(text) reports progress.
// folders: where the chosen folder is remembered (IndexedDB unless a test swaps it).
// locks: one update at a time across every open Crunchilist tab.
export async function installUpdate(latest, onStep = () => {}, { locks = globalThis.navigator?.locks, ...options } = {}) {
  if (!locks) return install(latest, onStep, options);
  return locks.request("crunchilist-update", { ifAvailable: true }, (lock) => {
    if (!lock) throw new UpdateError("An update is already running in another Crunchilist tab.", "busy");
    return install(latest, onStep, options);
  });
}

async function install(latest, onStep, { settleMs = SETTLE_MS, folders = savedFolders } = {}) {
  const dir = await chooseFolder(folders);
  onStep("Checking the new version…");
  const { sha } = await getJson(`${API}/commits/${encodeURIComponent(latest.ref || "master")}`);
  const { tree, truncated } = await getJson(`${API}/git/trees/${sha}?recursive=1`);
  if (truncated) throw new UpdateError("GitHub's file list came back incomplete. Use the download link instead.", "failed");
  const manifestEntry = tree.find((entry) => entry.path === "manifest.json" && entry.type === "blob");
  if (!manifestEntry) throw new UpdateError("That version has no manifest.json.", "failed");
  const manifest = JSON.parse(new TextDecoder().decode(await download(sha, manifestEntry)));
  const running = chrome.runtime.getManifest();
  if (manifest.name !== running.name) throw new UpdateError("GitHub's copy isn't Crunchilist.", "failed");
  if (compareVersions(manifest.version, running.version) <= 0) throw new UpdateError("You already have the newest version.", "current");

  const files = packageFiles(tree, manifest).filter((file) => file.path !== "manifest.json");
  const old = new Map();
  const changed = [];
  for (const file of files) {
    const current = await readBytes(dir, file.path);
    if (await sameAsGitHub(current, file.sha)) continue;
    old.set(file.path, current);
    changed.push(file);
  }
  const bytes = new Map();
  await inBatches(changed, DOWNLOADS_AT_ONCE, async (file) => {
    bytes.set(file.path, await download(sha, file));
    onStep(`Downloading ${bytes.size} of ${changed.length}…`);
  });
  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(storeManifest(manifest), null, 2)}\n`);
  const writes = [...changed.map((file) => [file.path, bytes.get(file.path)]), ["manifest.json", manifestBytes]];

  onStep("Checking the files with your antivirus…");
  await stageAndCheck(dir, writes, settleMs);

  onStep("Installing…");
  const written = [];
  try {
    for (const file of changed) {
      written.push(file.path);
      await writeFile(dir, file.path, bytes.get(file.path));
      if (!sameBytes(await readBytes(dir, file.path), bytes.get(file.path))) throw blocked(file.path);
    }
  } catch (error) {
    // Put back what was there, so the copy keeps running the version it reports.
    for (const file of written) {
      const before = old.get(file);
      await (before ? writeFile(dir, file, before) : removeFile(dir, file)).catch(() => {});
    }
    throw writeFailure(written.at(-1), error);
  }
  for (const file of staleFiles(await installedFiles(dir, manifest), files, manifest)) await removeFile(dir, file).catch(() => {});
  // Last, so a copy interrupted mid-install still reports its old version and the next press redoes it.
  await writeFile(dir, "manifest.json", manifestBytes);
  return { version: manifest.version, changed: changed.length };
}
