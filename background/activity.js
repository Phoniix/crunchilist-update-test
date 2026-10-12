import { isEnabled } from "../lib/enabled.js";
import { syncActivity } from "./anilist-sync.js";
import { catalogActivity } from "./catalog-sync.js";
import { historyActivity } from "./history-import.js";
import { currentView } from "./page.js";

const TICK_MS = 1000;
const BADGE_COLOR = "#ff7a2f";
const IDLE_COLOR = "#5a4f47";

let ticker = 0;
let lastSent = "";

export function currentActivity() {
  const tasks = [...catalogActivity(), historyActivity(), syncActivity()].filter(Boolean);
  return tasks.map((task) => {
    const progress = Math.max(0, Math.min(1, Number(task.progress) || 0));
    return { ...task, progress, percent: Math.floor(progress * 100) };
  });
}

async function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
  try {
    const tabs = await chrome.tabs.query({ url: ["https://www.crunchyroll.com/*", "https://*.crunchyroll.com/*"] });
    for (const tab of tabs) if (tab.id != null) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  } catch {
    // Tabs can close while the update is sent.
  }
}

async function paintToolbar(tasks) {
  if (tasks.length) {
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR }).catch(() => {});
    await chrome.action.setBadgeText({ text: `${tasks[0].percent}%` }).catch(() => {});
    await chrome.action.setTitle({ title: tasks.map((task) => `${task.label}: ${task.percent}%`).join("\n") }).catch(() => {});
    return;
  }
  const enabled = await isEnabled().catch(() => true);
  await chrome.action.setBadgeBackgroundColor({ color: IDLE_COLOR }).catch(() => {});
  await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" }).catch(() => {});
  await chrome.action.setTitle({ title: enabled ? "Crunchilist" : "Crunchilist (off on Crunchyroll)" }).catch(() => {});
}

async function tick() {
  const tasks = currentActivity();
  const signature = JSON.stringify(tasks.map((task) => [task.id, task.percent, task.label]));
  if (signature !== lastSent) {
    const finished = !tasks.length && lastSent !== "" && lastSent !== "[]";
    lastSent = signature;
    await Promise.all([broadcast({ type: "activity", tasks }), paintToolbar(tasks)]);
    if (finished) await broadcast({ type: "enriched", view: await currentView() });
  }
  if (!tasks.length && ticker) {
    clearInterval(ticker);
    ticker = 0;
  }
}

export function watchActivity() {
  if (ticker) return;
  if (!currentActivity().length && lastSent === "[]") return;
  ticker = setInterval(() => tick().catch(() => {}), TICK_MS);
  tick().catch(() => {});
}
