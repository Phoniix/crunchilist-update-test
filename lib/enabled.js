export const ENABLED_KEY = "crEnabled";

export async function isEnabled() {
  const stored = await chrome.storage.local.get(ENABLED_KEY);
  return stored[ENABLED_KEY] !== false;
}
