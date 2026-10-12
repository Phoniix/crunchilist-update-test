import { LATEST_RELEASE_API, MASTER_MANIFEST, dueForCheck, fromManifest, fromRelease, updateStatus } from "../lib/update-check.js";

const UPDATE_KEY = "crUpdate";

// Store installs get an update_url and update themselves, so only copies loaded by hand check GitHub.
export const selfUpdating = () => Boolean(chrome.runtime.getManifest().update_url);

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/vnd.github+json" }, cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  return response.json();
}

async function newest() {
  const release = fromRelease(await getJson(LATEST_RELEASE_API));
  if (release) return release;
  return fromManifest(await getJson(MASTER_MANIFEST));
}

let running = null;

export async function checkForUpdate({ force = false } = {}) {
  const current = chrome.runtime.getManifest().version;
  if (selfUpdating()) return { ...updateStatus(null, current), managed: true };
  const stored = (await chrome.storage.local.get(UPDATE_KEY))[UPDATE_KEY] || {};
  if (!dueForCheck(stored.checkedAt, Date.now(), force)) return updateStatus(stored, current);
  running ||= (async () => {
    const next = { ...stored, checkedAt: Date.now() };
    try {
      next.latest = await newest();
      next.error = "";
    } catch (error) {
      next.error = error?.message || "Couldn't reach GitHub";
    }
    await chrome.storage.local.set({ [UPDATE_KEY]: next });
    return next;
  })().finally(() => { running = null; });
  return updateStatus(await running, current);
}

// The app announces each new version once; after that it only shows in Settings.
export async function markUpdateAnnounced(version) {
  const stored = (await chrome.storage.local.get(UPDATE_KEY))[UPDATE_KEY] || {};
  await chrome.storage.local.set({ [UPDATE_KEY]: { ...stored, announced: String(version || "") } });
  return {};
}
