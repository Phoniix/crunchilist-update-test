// Pure player logic, kept free of the DOM so it can be tested and later moved into app/ unchanged.

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const YOUTUBE_ID = /^[\w-]{11}$/;

export function youtubeId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^(www|m)\./, "");
    let id = "";
    if (host === "youtu.be") id = parsed.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = parsed.searchParams.get("v") || parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] || "";
    }
    return YOUTUBE_ID.test(id) ? id : "";
  } catch {
    return "";
  }
}

// "youtube" plays through the official embed, "file" is a local blob, "direct" an http(s) video file. Anything else is refused.
export function sourceKind(src) {
  const text = String(src || "");
  if (youtubeId(text)) return "youtube";
  if (text.startsWith("blob:")) return "file";
  try {
    const { protocol } = new URL(text);
    return protocol === "https:" || protocol === "http:" ? "direct" : "";
  } catch {
    return "";
  }
}

export const KEYS = {
  " ": "toggle", k: "toggle",
  j: "back10", l: "forward10", ArrowLeft: "back5", ArrowRight: "forward5",
  ArrowUp: "volumeUp", ArrowDown: "volumeDown",
  m: "mute", f: "fullscreen", c: "captions", n: "next",
  ">": "faster", "<": "slower",
};

export function actionForKey({ key, ctrlKey, metaKey, altKey }) {
  if (ctrlKey || metaKey || altKey) return "";
  if (/^[0-9]$/.test(key)) return `seek${key}`;
  return KEYS[key] || KEYS[String(key).toLowerCase()] || "";
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function stepSpeed(current, direction) {
  const at = SPEEDS.indexOf(current);
  const index = at < 0 ? SPEEDS.indexOf(1) : at;
  return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, index + direction))];
}

// Resume only from a real stopping point: not the first few seconds and not the credits.
const RESUME_MIN = 15;
const CREDITS = 90;

export function resumeAt(saved, duration) {
  const at = Number(saved) || 0;
  if (at < RESUME_MIN) return 0;
  if (Number.isFinite(duration) && duration > 0 && at > duration - CREDITS) return 0;
  return at;
}

const RESUME_KEY = "cl-lab-resume";
const RESUME_LIMIT = 100;

export function savePosition(store, id, seconds, now = Date.now()) {
  if (!id) return store;
  const next = { ...store, [id]: { at: Math.floor(seconds), on: now } };
  const ids = Object.keys(next).sort((a, b) => next[b].on - next[a].on);
  for (const old of ids.slice(RESUME_LIMIT)) delete next[old];
  return next;
}

export function loadResume(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(RESUME_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function storeResume(storage, store) {
  try { storage?.setItem(RESUME_KEY, JSON.stringify(store)); } catch {}
}

export function nextEpisode(episodes, id) {
  const at = (episodes || []).findIndex((episode) => episode.id === id);
  return at >= 0 ? episodes[at + 1] || null : null;
}
