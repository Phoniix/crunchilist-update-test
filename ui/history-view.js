import { ROUNDED, el, icon, progressMeter } from "./dom.js";

const PACE_SECONDS = 2.1;
const STATUS_WORDS = { finished: "Completed", in_progress: "Watching", dropped: "Dropped", plan: "Plan to watch" };

export const HISTORY_CSS = `
  .st.is-history > :not(.hi) { display: none !important; }
  .hi { display: flex; flex-direction: column; gap: 12px; }
  .hi[hidden] { display: none; }
  .hi-head { display: flex; align-items: center; gap: 8px; }
  .sheet .hi-head { padding-right: 36px; }
  .hi-head h2 { flex: 1; min-width: 0; margin: 0; font: 800 17px/1.2 ${ROUNDED}; }
  .hi-back { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 10px; cursor: pointer; background: transparent; color: var(--muted); }
  .hi-back:hover { background: var(--pane-hover); color: var(--text); }
  .hi-summary { margin: 0; color: var(--muted); font: 600 12.5px/1.45 ${ROUNDED}; }
  .hi-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .hi-tools .nt-bulk { margin-left: auto; }
  .hi-stale { display: flex; align-items: center; gap: 8px; color: var(--muted); font: 700 12px/1.2 ${ROUNDED}; }
  .hi-stale select { min-height: 30px; padding: 3px 8px; font-size: 12.5px; }
  .hi-confirm { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 16px; background: rgba(255, 154, 92, .08); border: 1px solid rgba(255, 154, 92, .32); }
  .hi-confirm[hidden] { display: none; }
  .hi-confirm strong { font: 800 14px/1.3 ${ROUNDED}; }
  .hi-confirm p { margin: 0; color: var(--muted); font: 600 12.5px/1.45 ${ROUNDED}; }
  .hi-confirm .nt-actions { margin-top: 0; }
  .hi-tag { display: inline-block; margin-right: 6px; padding: 1px 7px; border-radius: 999px; background: rgba(255, 226, 196, .08); color: var(--muted); font: 800 10.5px/1.5 ${ROUNDED}; letter-spacing: .03em; text-transform: uppercase; }
  .hi-tag.is-new { background: rgba(120, 220, 160, .12); color: #9fe3b8; }
  .hi-tag.is-stale { background: rgba(255, 196, 92, .12); color: #f3cd8a; }
  .hi-missing { border-radius: 16px; background: var(--pane); border: 1px solid var(--line); padding: 10px 14px; }
  .hi-missing summary { cursor: pointer; color: var(--muted); font: 700 12.5px/1.4 ${ROUNDED}; }
  .hi-missing ul { margin: 8px 0 0; padding-left: 18px; color: var(--muted); font: 600 12.5px/1.5 ${ROUNDED}; }
  .hi-missing p { margin: 8px 0 0; color: var(--faint); font: 600 12px/1.4 ${ROUNDED}; }
  .hi .nt-item.is-busy { opacity: .55; pointer-events: none; }
  .hi .nt-status:empty { display: none; }
`;

function episodesText(change) {
  if (change.status === "finished") return change.episodes ? `${change.episodes}/${change.episodes} episodes` : "All episodes";
  return change.episodes ? `Episode ${change.progress} of ${change.episodes}` : `Episode ${change.progress}`;
}

function changeText(change) {
  const status = STATUS_WORDS[change.status] || "Watching";
  if (change.isNew) return `${status} · ${episodesText(change)}`;
  const from = change.fromProgress ?? 0;
  const moved = change.fromStatus && change.fromStatus !== change.status ? `${STATUS_WORDS[change.fromStatus] || "Listed"} → ${status}` : status;
  return `${moved} · episode ${from} → ${change.progress}${change.episodes ? ` of ${change.episodes}` : ""}`;
}

function playedText(time) {
  if (!time) return "";
  return `Last played ${new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function duration(count) {
  const minutes = Math.ceil((count * PACE_SECONDS) / 60);
  return minutes <= 1 ? "about a minute" : `about ${minutes} minutes`;
}

export function createHistoryView({ send, onView = () => {}, onClose = () => {} } = {}) {
  let changes = [];
  let stale = "watching";
  let poll = 0;
  let busy = false;

  const back = el("button", { class: "hi-back", type: "button", "aria-label": "Back to settings", title: "Back to settings" }, [icon("back", 18)]);
  const summary = el("p", { class: "hi-summary" });
  const staleSelect = el("select", { "aria-label": "Shows not played in 6+ months" });
  for (const [value, text] of [["watching", "Mark watching"], ["dropped", "Mark dropped"], ["skip", "Leave out"]]) staleSelect.append(el("option", { value, text }));
  const staleRow = el("label", { class: "hi-stale", hidden: true }, [el("span", { text: "Not played in 6+ months" }), staleSelect]);
  const updateAll = el("button", { class: "btn primary", type: "button", text: "Update all" });
  const skipAll = el("button", { class: "btn", type: "button", text: "Skip all" });
  const tools = el("div", { class: "hi-tools", hidden: true }, [staleRow, el("div", { class: "nt-bulk" }, [updateAll, skipAll])]);
  const confirmText = el("p");
  const confirmYes = el("button", { class: "btn primary", type: "button", text: "Yes, update all" });
  const confirmNo = el("button", { class: "btn", type: "button", text: "Cancel" });
  const confirm = el("div", { class: "hi-confirm", role: "alertdialog", "aria-label": "Confirm update all", hidden: true }, [
    el("strong", { text: "Are you sure? This may take a while." }),
    confirmText,
    el("div", { class: "nt-actions" }, [confirmYes, confirmNo]),
  ]);
  const meter = progressMeter("History import progress");
  const bar = meter.root;
  const status = el("p", { class: "nt-status", role: "status" });
  const list = el("div", { class: "nt-list" });
  const missing = el("details", { class: "hi-missing", hidden: true });
  const root = el("div", { class: "hi", hidden: true }, [
    el("div", { class: "hi-head" }, [back, el("h2", { text: "Crunchyroll history" })]),
    summary,
    tools,
    confirm,
    bar,
    status,
    list,
    missing,
  ]);

  function progress(note, value) {
    status.textContent = note || "";
    meter.set(value);
  }

  async function refreshView() {
    const fresh = await send("getState");
    if (fresh?.view) onView(fresh.view);
  }

  function row(change) {
    const update = el("button", { class: "btn primary", type: "button", text: "Update" });
    const skip = el("button", { class: "btn", type: "button", text: "Skip" });
    const article = el("article", { class: "nt-item is-ask" }, [
      change.cover ? el("img", { class: "nt-art", src: change.cover, alt: "", referrerpolicy: "no-referrer" }) : el("span", { class: "nt-art" }),
      el("div", { class: "nt-copy" }, [
        el("p", { class: "nt-title", text: change.title }),
        el("p", { class: "nt-message" }, [
          el("span", { class: change.isNew ? "hi-tag is-new" : "hi-tag", text: change.isNew ? "New" : "Update" }),
          change.stale ? el("span", { class: "hi-tag is-stale", text: "6+ months" }) : null,
          document.createTextNode(changeText(change)),
        ]),
        el("span", { class: "nt-time", text: playedText(change.lastPlayed) }),
        el("div", { class: "nt-actions" }, [update, skip]),
      ]),
    ]);
    update.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      article.classList.add("is-busy");
      const response = await send("historyApply", { stale, ids: [change.id] });
      busy = false;
      if (!response?.ok) {
        article.classList.remove("is-busy");
        progress(response?.error || "Could not update that show.");
        return;
      }
      progress(response.note);
      await loadPlan();
      refreshView();
    });
    skip.addEventListener("click", async () => {
      if (busy) return;
      article.classList.add("is-busy");
      await send("historySkip", { ids: [change.id] });
      await loadPlan();
    });
    return article;
  }

  function paintMissing(unmatched) {
    missing.hidden = !unmatched.length;
    missing.replaceChildren(
      el("summary", { text: `${unmatched.length === 1 ? "1 show" : `${unmatched.length} shows`} couldn't be matched with AniList` }),
      el("ul", {}, unmatched.map((title) => el("li", { text: title }))),
      el("p", { text: "Set these by hand from the show's page or its badge on Crunchyroll." }),
    );
  }

  function retryButton() {
    const button = el("button", { class: "btn primary", type: "button", text: "Try again" });
    button.addEventListener("click", () => start());
    return button;
  }

  function paintFailure(note) {
    changes = [];
    confirm.hidden = true;
    tools.hidden = true;
    missing.hidden = true;
    summary.textContent = "";
    progress("");
    list.replaceChildren(el("div", { class: "nt-empty" }, [
      el("strong", { text: "Couldn't finish reading your history" }),
      el("span", { text: note || "Crunchyroll didn't answer. Reload Crunchyroll and try again." }),
      el("div", { class: "nt-actions", style: "justify-content:center;margin-top:12px" }, [retryButton()]),
    ]));
  }

  function paint(plan) {
    changes = plan.changes || [];
    const s = plan.summary;
    confirm.hidden = true;
    tools.hidden = !changes.length;
    staleRow.hidden = !s?.stale;
    list.replaceChildren(...changes.map(row));
    if (!changes.length && plan.scanned) {
      list.append(el("div", { class: "nt-empty" }, [
        el("strong", { text: "Nothing left to review" }),
        el("span", { text: "Everything matched from your Crunchyroll history is on your list or was skipped." }),
      ]));
    } else if (!changes.length) {
      list.append(el("div", { class: "nt-empty" }, [
        el("strong", { text: "No history scanned yet" }),
        el("span", { text: "Read your Crunchyroll history to see what can be added." }),
        el("div", { class: "nt-actions", style: "justify-content:center;margin-top:12px" }, [retryButton()]),
      ]));
      list.querySelector(".nt-empty .btn").textContent = "Read history";
    }
    if (!s) {
      summary.textContent = "";
    } else {
      const parts = [];
      if (plan.seen) parts.push(`Read ${plan.seen} episodes`);
      if (changes.length) parts.push(`${changes.length === 1 ? "1 show" : `${changes.length} shows`} to review`);
      if (s.current) parts.push(`${s.current} already up to date`);
      const cut = plan.cutShort ? " Crunchyroll stopped sharing older history partway, so your oldest shows may be missing; set those by hand." : "";
      summary.textContent = parts.length ? `${parts.join(" · ")}. Nothing is sent to AniList until you choose Update.${cut}` : cut.trim();
    }
    paintMissing(plan.unmatched || []);
  }

  async function loadPlan() {
    const response = await send("historyPlan", { stale });
    if (response?.ok) paint(response);
  }

  function stopPoll() {
    window.clearInterval(poll);
    poll = 0;
  }

  function watch(onFinish) {
    stopPoll();
    poll = window.setInterval(async () => {
      const job = await send("historyProgress");
      if (!job?.ok) {
        stopPoll();
        progress("Lost track of the import. Open it again to continue.");
        return;
      }
      if (job.running) {
        progress(job.note, job.progress);
        return;
      }
      stopPoll();
      onFinish(job);
    }, 700);
  }

  function show() {
    root.hidden = false;
    root.closest(".st")?.classList.add("is-history");
  }

  function close() {
    stopPoll();
    confirm.hidden = true;
    root.hidden = true;
    root.closest(".st")?.classList.remove("is-history");
    onClose();
  }

  async function start() {
    show();
    changes = [];
    list.replaceChildren();
    tools.hidden = true;
    missing.hidden = true;
    summary.textContent = "Reading your Crunchyroll history and matching it with AniList. Nothing changes until you review it.";
    const response = await send("historyScan");
    if (!response?.ok) {
      paintFailure(response?.error);
      return;
    }
    progress(response.note, response.progress);
    watch(async (job) => {
      if (job.phase === "error") {
        paintFailure(job.note);
        return;
      }
      progress(job.phase === "ready" ? "" : job.note);
      await loadPlan();
    });
  }

  async function resume() {
    show();
    const job = await send("historyProgress");
    if (job?.running) {
      progress(job.note, job.progress);
      watch(async (finished) => {
        progress(finished.note);
        await loadPlan();
        refreshView();
      });
      return;
    }
    if (job?.phase === "error") {
      paintFailure(job.note);
      return;
    }
    progress(job?.phase === "done" ? job.note : "");
    await loadPlan();
  }

  back.addEventListener("click", close);
  staleSelect.addEventListener("change", () => {
    stale = staleSelect.value;
    loadPlan();
  });
  updateAll.addEventListener("click", () => {
    if (!changes.length) return;
    const count = changes.length === 1 ? "1 show" : `${changes.length} shows`;
    confirmText.textContent = `This sends ${count} to your AniList, one at a time so AniList doesn't block the requests. It will take ${duration(changes.length)}. You can keep using Crunchyroll while it runs; anything not sent yet syncs later.`;
    confirm.hidden = false;
    confirmNo.focus();
  });
  confirmNo.addEventListener("click", () => {
    confirm.hidden = true;
  });
  confirmYes.addEventListener("click", async () => {
    confirm.hidden = true;
    tools.hidden = true;
    for (const item of list.children) item.classList.add("is-busy");
    const response = await send("historyApply", { stale });
    if (!response?.ok) {
      progress(response?.error || "Could not start the update.");
      await loadPlan();
      return;
    }
    progress(response.note, response.progress);
    if (!response.running) {
      await loadPlan();
      refreshView();
      return;
    }
    watch(async (job) => {
      progress(job.note);
      await loadPlan();
      refreshView();
    });
  });
  skipAll.addEventListener("click", async () => {
    await send("historySkip", { ids: changes.map((change) => change.id) });
    progress("Skipped. Nothing was sent to AniList.");
    await loadPlan();
  });

  return { root, start, resume, close };
}
