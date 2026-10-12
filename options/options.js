import { validateClientId } from "../lib/settings.js";

const status = document.querySelector("#status");
const keyInput = document.querySelector("#key");
const userInput = document.querySelector("#user");
const clientInput = document.querySelector("#client");
const secretInput = document.querySelector("#secret");
const redirectInput = document.querySelector("#redirect");
const accountName = document.querySelector("#account-name");
const accountSub = document.querySelector("#account-sub");
const connectedActions = document.querySelector("#connected-actions");
const setup = document.querySelector("#setup");
const publicList = document.querySelector("#public-list");

for (const button of document.querySelectorAll("[data-reveal]")) {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.reveal);
    const shown = input.type === "text";
    input.type = shown ? "password" : "text";
    button.textContent = shown ? "Show" : "Hide";
    button.setAttribute("aria-pressed", shown ? "false" : "true");
  });
}

function say(text) {
  status.textContent = text;
}

function paintAccount(view) {
  const settings = view?.settings || {};
  const connected = Boolean(settings.anilistConnected && settings.anilistViewerName);
  accountName.textContent = connected ? settings.anilistViewerName : "Not connected";
  if (connected) {
    accountSub.textContent = "Marks on a matched season update this AniList account.";
  } else if (view?.importMeta?.username) {
    accountSub.textContent = `Public list imported for ${view.importMeta.username}. Connect an account to write marks back.`;
  } else {
    accountSub.textContent = "Connect AniList so finished and in-progress marks update your list.";
  }
  connectedActions.hidden = !connected;
  setup.hidden = connected;
  publicList.hidden = connected;
}

async function load() {
  const response = await chrome.runtime.sendMessage({ type: "getState" });
  if (!response?.ok) return;
  const settings = response.view?.settings || {};
  userInput.value = settings.anilistUsername || "";
  clientInput.value = settings.anilistClientId || "";
  keyInput.placeholder = settings.keys?.openai ? "Key saved on this device" : "API key";
  document.querySelector("#selected-model").textContent = `Selected model: ${settings.modelLabel || "Chrome"}`;
  secretInput.placeholder = settings.hasAnilistSecret ? "Secret saved on this device" : "Client secret";
  paintAccount(response.view);
}

document.querySelector("#settings").addEventListener("submit", async (event) => {
  event.preventDefault();
  const apiKey = keyInput.value.trim();
  if (!apiKey) {
    say("Paste an API key.");
    return;
  }
  const response = await chrome.runtime.sendMessage({ type: "setSettings", patch: { apiKey } });
  keyInput.value = "";
  if (!response?.ok) {
    say(response?.error || "Could not save settings.");
    return;
  }
  document.querySelector("#selected-model").textContent = `Selected model: ${response.view?.settings?.modelLabel || "gpt-4o-mini"}`;
  keyInput.placeholder = "Key saved on this device";
  say(response.keyNote || "Key saved.");
});

document.querySelector("#clear").addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "clearKey", id: "openai" });
  keyInput.value = "";
  keyInput.placeholder = "API key";
  say(response?.ok ? "API key cleared." : response?.error || "Could not clear the key.");
});

redirectInput.value = chrome.identity.getRedirectURL();

document.querySelector("#copy-redirect").addEventListener("click", async () => {
  redirectInput.select();
  try {
    await navigator.clipboard.writeText(redirectInput.value);
  } catch {
    document.execCommand("copy");
  }
  say("Redirect URL copied. Paste it into the AniList app.");
});

document.querySelector("#anilist-account").addEventListener("submit", async (event) => {
  event.preventDefault();
  const clientId = validateClientId(clientInput.value);
  if (!clientId) {
    say("AniList client id should be the number from your AniList app.");
    return;
  }
  say("A tab will open for AniList. Finish signing in there, and leave this page open.");
  const response = await chrome.runtime.sendMessage({
    type: "startAnilistAuth",
    clientId,
    clientSecret: secretInput.value.trim(),
  });
  secretInput.value = "";
  if (response?.ok) {
    say(`Connected as ${response.viewerName}. Read ${response.imported} anime.`);
    await load();
    say(`Connected as ${response.viewerName}. Read ${response.imported} anime.`);
  } else {
    say(response?.error || "Could not connect AniList.");
  }
});

document.querySelector("#refresh-anilist").addEventListener("click", async () => {
  say("Refreshing AniList…");
  const response = await chrome.runtime.sendMessage({ type: "refreshAnilist" });
  if (response?.ok) {
    await load();
    say(`Refreshed ${response.imported} anime.`);
  } else {
    say(response?.error || "Could not refresh AniList.");
  }
});

document.querySelector("#disconnect-anilist").addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "disconnectAnilist" });
  if (response?.ok) {
    await load();
    say("Disconnected. The last list stays on this device until you import another.");
  } else {
    say(response?.error || "Could not disconnect.");
  }
});

document.querySelector("#anilist").addEventListener("submit", async (event) => {
  event.preventDefault();
  say("Importing…");
  const response = await chrome.runtime.sendMessage({ type: "importAnilist", username: userInput.value.trim() });
  if (response?.ok) {
    await load();
    say(`Imported ${response.imported} anime.`);
  } else {
    say(response?.error || "Import failed.");
  }
});

load().catch(() => say("Could not read saved settings."));
