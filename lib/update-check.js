// Update checks for copies installed outside a store: compares this version with the newest one on GitHub.

export const REPO = "Phoniix/crunchilist-update-test";
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const MASTER_MANIFEST = `https://raw.githubusercontent.com/${REPO}/master/manifest.json`;
export const MASTER_ZIP = `https://github.com/${REPO}/archive/refs/heads/master.zip`;
export const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;

const VERSION = /^v?(\d+(?:\.\d+){0,3})$/;

export function cleanVersion(text) {
  return String(text ?? "").trim().match(VERSION)?.[1] || "";
}

// Chrome versions are up to four dot-separated numbers; missing parts count as 0.
export function compareVersions(a, b) {
  const left = cleanVersion(a).split(".").map(Number);
  const right = cleanVersion(b).split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

const onGitHub = (url) => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "github.com" || hostname.endsWith(".github.com") || hostname === "objects.githubusercontent.com");
  } catch {
    return false;
  }
};

// A published release: its tag is the version, and its zip asset (if any) the download.
export function fromRelease(json) {
  if (!json || json.draft || json.prerelease) return null;
  const version = cleanVersion(json.tag_name);
  if (!version) return null;
  const asset = (json.assets || []).find((item) => /\.zip$/i.test(item?.name || "") && onGitHub(item.browser_download_url));
  return {
    version,
    page: onGitHub(json.html_url) ? json.html_url : RELEASES_URL,
    download: asset?.browser_download_url || "",
    notes: String(json.body || "").slice(0, 600),
    source: "release",
    ref: String(json.tag_name).trim(),
  };
}

// No releases yet: the version in manifest.json on master, downloaded as the branch zip.
export function fromManifest(json) {
  const version = cleanVersion(json?.version);
  return version ? { version, page: `https://github.com/${REPO}`, download: MASTER_ZIP, notes: "", source: "master", ref: "master" } : null;
}

// update.cmd rewrites the folder while Chrome keeps running the old code until a reload. Reload once per
// version found on disk, so a reload that doesn't pick it up can't loop.
export function reloadForDisk(running, onDisk, lastReload) {
  return Boolean(cleanVersion(onDisk)) && compareVersions(onDisk, running) > 0 && lastReload !== onDisk;
}

export function dueForCheck(checkedAt, now, force = false) {
  return force || !(checkedAt > 0) || now - checkedAt >= CHECK_EVERY_MS || now < checkedAt;
}

// What the app shows: nothing when up to date, otherwise the newer version and where to get it.
export function updateStatus(stored, current) {
  const latest = stored?.latest;
  const available = Boolean(latest?.version && compareVersions(latest.version, current) > 0);
  return {
    current,
    checkedAt: stored?.checkedAt || 0,
    error: stored?.error || "",
    available,
    latest: available ? latest : null,
    announce: available && stored?.announced !== latest.version,
  };
}
