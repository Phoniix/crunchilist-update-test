import { ROUNDED, el } from "./dom.js";

export const NOTICES_CSS = `
  .nt { display: flex; flex-direction: column; gap: 12px; }
  .nt-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .sheet .nt-head { padding-right: 36px; }
  .nt-head h2 { flex: 1; margin: 0; font: 800 17px/1.2 ${ROUNDED}; white-space: nowrap; }
  .nt-bulk { display: flex; gap: 6px; }
  .nt-bulk .btn, .nt-item .btn { min-height: 30px; padding: 4px 11px; font-size: 12.5px; white-space: nowrap; }
  .nt-list { display: flex; flex-direction: column; gap: 8px; }
  .nt-item {
    display: flex; gap: 12px; padding: 10px; border-radius: 16px; background: var(--pane); border: 1px solid var(--line);
    transition: border-color .18s var(--ease), background .18s var(--ease);
  }
  .nt-item:hover { border-color: var(--line-strong); background: var(--pane-hover); }
  .nt-item.is-ask { border-color: rgba(255, 154, 92, .32); }
  .nt-art { width: 42px; height: 58px; flex: none; border-radius: 9px; object-fit: cover; background: var(--raised); }
  .nt-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .nt-title { margin: 0; font: 800 13.5px/1.3 ${ROUNDED}; }
  .nt-message { margin: 0; color: var(--muted); font: 600 12.5px/1.4 ${ROUNDED}; }
  .nt-time { color: var(--faint); font: 700 11px/1.2 ${ROUNDED}; }
  .nt-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .nt-empty { padding: 28px 8px; text-align: center; color: var(--muted); font: 600 13.5px/1.5 ${ROUNDED}; }
  .nt-empty strong { display: block; color: var(--text); font: 800 15px/1.3 ${ROUNDED}; }
  .nt-status { min-height: 1.2em; margin: 0; color: var(--muted); font: 600 12.5px/1.4 ${ROUNDED}; }
  .nt-badge {
    position: absolute; top: -5px; right: -5px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box;
    display: grid; place-items: center; border-radius: 9px; background: #ff453a; color: #fff;
    font: 800 11px/1 ${ROUNDED}; box-shadow: 0 0 0 2px rgba(20, 17, 14, .95); pointer-events: none;
  }
  .nt-badge[hidden] { display: none; }
  .nt-bell { position: relative; }
`;

export function noticeBadge() {
  return el("span", { class: "nt-badge", "aria-hidden": "true", hidden: true });
}

export function paintBadge(badge, count) {
  badge.hidden = !count;
  badge.textContent = count > 99 ? "99+" : String(count || "");
}

function ago(time) {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

export function createNoticesView({ send, onView = () => {} } = {}) {
  let notices = [];
  const updateAll = el("button", { class: "btn primary", type: "button", text: "Update all" });
  const clearAll = el("button", { class: "btn", type: "button", text: "Clear all" });
  const list = el("div", { class: "nt-list" });
  const status = el("p", { class: "nt-status", role: "status" });
  const root = el("div", { class: "nt" }, [
    el("div", { class: "nt-head" }, [el("h2", { text: "Notifications" }), el("div", { class: "nt-bulk" }, [updateAll, clearAll])]),
    list,
    status,
  ]);

  async function act(type, payload, busy) {
    for (const button of busy) button.disabled = true;
    const response = await send(type, payload);
    for (const button of busy) button.disabled = false;
    if (!response?.ok) {
      status.textContent = response?.error || "Something went wrong.";
      return;
    }
    status.textContent = response.syncNote && !/^Marked episode/.test(response.syncNote) ? response.syncNote : "";
    if (response.view) onView(response.view);
  }

  function item(row) {
    const update = row.action ? el("button", { class: "btn primary", type: "button", text: row.action }) : null;
    const ignore = el("button", { class: "btn", type: "button", text: row.kind === "ask" ? "Ignore" : "Dismiss" });
    update?.addEventListener("click", () => act("resolveNotice", { id: row.id, action: "update" }, [update, ignore]));
    ignore.addEventListener("click", () => act("resolveNotice", { id: row.id, action: "ignore" }, [ignore]));
    return el("article", { class: `nt-item is-${row.kind}` }, [
      row.cover ? el("img", { class: "nt-art", src: row.cover, alt: "", referrerpolicy: "no-referrer" }) : el("span", { class: "nt-art" }),
      el("div", { class: "nt-copy" }, [
        el("p", { class: "nt-title", text: row.title }),
        el("p", { class: "nt-message", text: row.message }),
        el("span", { class: "nt-time", text: ago(row.createdAt) }),
        el("div", { class: "nt-actions" }, [update, ignore]),
      ]),
    ]);
  }

  function paint() {
    list.replaceChildren(...notices.map(item));
    if (!notices.length) list.append(el("div", { class: "nt-empty" }, [el("strong", { text: "You're all caught up" }), el("span", { text: "Finished episodes you skip updating show up here." })]));
    updateAll.hidden = !notices.some((row) => row.kind === "ask");
    clearAll.hidden = !notices.length;
  }

  updateAll.addEventListener("click", () => act("resolveAllNotices", { action: "update" }, [updateAll, clearAll]));
  clearAll.addEventListener("click", () => act("resolveAllNotices", { action: "ignore" }, [updateAll, clearAll]));
  paint();

  return {
    root,
    setView(view) {
      notices = view?.notices || [];
      paint();
    },
    count: () => notices.length,
  };
}