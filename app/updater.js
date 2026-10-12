// The Update button: writes a newer version from GitHub into the folder this copy was loaded from, then reloads.
// Every file is downloaded and checked against GitHub's fingerprint before the first one is written.
import { REPO, compareVersions } from "../lib/update-check.js";
import { PACKAGE_FOLDERS, contentFiles, gitBlobSha, packageFiles, rawUrl, staleFiles, storeManifest } from "../lib/update-files.js";

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
const savedFolder = () => idb("readonly", (store) => store.get("folder")).catch(() => null);
const saveFolder = (handle) => idb("readwrite", (store) => store.put(handle, "folder")).catch(() => {});
const forgetFolder = () => idb("readwrite", (store) => store.delete("folder")).catch(() => {});

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
async function chooseFolder() {
  const saved = await savedFolder();
  if (saved) {
    try {
      if ((await saved.requestPermission({ mode: "readwrite" })) === "granted") {
        await checkFolder(saved);
        return saved;
      }
    } catch (error) {
      if (error instanceof UpdateError && error.code === "git") throw error;
    }
    await forgetFolder();
  }
  let picked;
  try {
    picked = await window.showDirectoryPicker({ id: "crunchilist-folder", mode: "readwrite" });
  } catch (error) {
    throw new UpdateError(error?.name === "AbortError" ? "Update canceled." : "Chrome didn't allow access to that folder.", "canceled");
  }
  await checkFolder(picked);
  await saveFolder(picked);
  return picked;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/vnd.github+json" }, cache: "no-store" });
  if (!response.ok) throw new UpdateError(`GitHub answered ${response.status}. Try again later.`, "network");
  return response.json();
}

async function download(ref, file) {
  const response = await fetch(rawUrl(REPO, ref, file.path), { cache: "no-store" });
  if (!response.ok) throw new UpdateError(`Couldn't download ${file.path}.`, "network");
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

// latest: { version, ref } from the update check. onStep(text) reports progress.
export async function installUpdate(latest, onStep = () => {}) {
  const dir = await chooseFolder();
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
  const bytes = new Map();
  await inBatches(files, DOWNLOADS_AT_ONCE, async (file) => {
    bytes.set(file.path, await download(sha, file));
    onStep(`Downloading ${bytes.size} of ${files.length}…`);
  });

  onStep("Installing…");
  for (const file of files) await writeFile(dir, file.path, bytes.get(file.path));
  for (const file of staleFiles(await installedFiles(dir, manifest), files, manifest)) await removeFile(dir, file).catch(() => {});
  // Last, so a copy interrupted mid-install still reports its old version and the next press redoes it.
  await writeFile(dir, "manifest.json", new TextEncoder().encode(`${JSON.stringify(storeManifest(manifest), null, 2)}\n`));
  return { version: manifest.version };
}
