// Which repo files make up the extension, and how the updater checks them. Shared with scripts/package.mjs
// so the store zip and an in-place update always contain the same files.

export const PACKAGE_FOLDERS = ["app", "background", "fonts", "icons", "lib", "options", "popup", "tools", "ui"];
// update.cmd runs tools/update.ps1: the manual update for when Update now can't finish.
export const PACKAGE_ROOT_FILES = ["update.cmd"];

export function storeManifest(manifest) {
  const out = structuredClone(manifest);
  // The localhost bridge only serves the dev mockup.
  delete out.externally_connectable;
  return out;
}

export function contentFiles(manifest) {
  return [...new Set((manifest.content_scripts || []).flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]))];
}

const SAFE_PATH = /^[\w.-]+(?:\/[\w.-]+)*$/;

export function isPackagePath(file, manifest) {
  if (!SAFE_PATH.test(file) || file.split("/").some((part) => part === "." || part === "..")) return false;
  if (file === "manifest.json" || PACKAGE_ROOT_FILES.includes(file)) return true;
  if (contentFiles(manifest).includes(file)) return true;
  return PACKAGE_FOLDERS.some((folder) => file.startsWith(`${folder}/`)) && !file.endsWith(".test.js");
}

// GitHub's tree for one version, cut down to the files the extension ships.
export function packageFiles(tree, manifest) {
  return (tree || [])
    .filter((entry) => entry?.type === "blob" && /^[0-9a-f]{40}$/.test(entry.sha || "") && isPackagePath(entry.path, manifest))
    .map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size || 0 }));
}

// Files the installed copy has that the new version dropped. Only package files are ever removed,
// so anything else in the folder (notes, a dev folder) is left alone.
export function staleFiles(localPaths, nextFiles, manifest) {
  const keep = new Set(nextFiles.map((file) => file.path));
  return localPaths.filter((file) => !keep.has(file) && file !== "manifest.json" && isPackagePath(file, manifest));
}

// Git's own fingerprint of a file: SHA-1 of "blob <size>\0" followed by the bytes, as listed in the tree.
export async function gitBlobSha(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = new TextEncoder().encode(`blob ${data.length}\0`);
  const all = new Uint8Array(head.length + data.length);
  all.set(head);
  all.set(data, head.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", all));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Git on Windows checks files out with CRLF while GitHub stores LF, so a zip built on Windows differs from
// GitHub byte for byte. The LF form is what to compare; null when there is no CR to drop.
export function withoutCarriageReturns(bytes) {
  if (!bytes?.includes(13)) return null;
  const out = new Uint8Array(bytes.length);
  let length = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10) continue;
    out[length] = bytes[index];
    length += 1;
  }
  return out.slice(0, length);
}

// Whether the installed file already holds this version of it, whichever line endings it was checked out with.
export async function sameAsGitHub(bytes, sha) {
  if (!bytes) return false;
  if ((await gitBlobSha(bytes)) === sha) return true;
  const lf = withoutCarriageReturns(bytes);
  return Boolean(lf) && (await gitBlobSha(lf)) === sha;
}

export function rawUrl(repo, ref, file) {
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/${file.split("/").map(encodeURIComponent).join("/")}`;
}
