// Prism's Home: the banner slideshow, the Ctrl+K palette and the ambient backdrop that follows whatever you focus.
let m = null;
let slide = 0, slideTimer = 0, videoTimer = 0, heroPlayer = null, ambientFlip = false;
let heroRunning = false, heroInView = true, previewPlaying = false, heroClock = 0, slideLeft = 0, videoLeft = -1, heroTrailer = "";
let heroIds = [];
let heroRows = new Map();
const bgUrl = (url) => `url("${String(url || "").replace(/["'()\\\s]/g, (c) => encodeURIComponent(c))}")`;

const PAGE_SIZE = 6;
const pageOf = (i) => Math.floor(i / PAGE_SIZE);
// Six bars at a time; the dots switch pages, and the page follows the slide as the banner plays.
function heroBars(spots) {
  const bar = (s, i) => `<button class="hero-bar" data-act="hero" data-i="${i}" aria-label="${m.esc(s.title)}"><i></i>
        <span class="hero-tip"><span style="background-image:url('${m.cssUrl(m.artOf(s))}')"></span><b>${m.esc(s.title)}</b></span></button>`;
  const pages = Math.ceil(spots.length / PAGE_SIZE);
  const groups = Array.from({ length: pages }, (_, p) => `<div class="hero-page" data-page="${p}">${spots.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE).map((s, n) => bar(s, p * PAGE_SIZE + n)).join("")}</div>`).join("");
  const dots = pages > 1 ? `<div class="hero-dots">${Array.from({ length: pages }, (_, p) => `<button class="hero-dot" data-act="hero-page" data-page="${p}" aria-label="Banner page ${p + 1} of ${pages}"></button>`).join("")}</div>` : "";
  return groups + dots;
}
function showPage(hero, page) {
  hero.querySelectorAll(".hero-page").forEach((el) => el.classList.toggle("on", Number(el.dataset.page) === page));
  hero.querySelectorAll(".hero-dot").forEach((el) => {
    const on = Number(el.dataset.page) === page;
    el.classList.toggle("on", on);
    el.setAttribute("aria-current", on ? "true" : "false");
  });
}
// Long titles step down a size class; if the copy still reaches up under the header, it tightens until it clears.
const NAV_CLEARANCE = 18;
function titleSize(title) {
  const n = String(title || "").length;
  return n > 70 ? "xl" : n > 44 ? "l" : n > 26 ? "m" : "";
}
function fitHeroCopy(hero) {
  const copy = hero.querySelector(".hero-copy");
  const nav = document.querySelector(".nav");
  if (!copy || !nav) return;
  copy.removeAttribute("data-tight");
  const limit = nav.getBoundingClientRect().bottom - hero.getBoundingClientRect().top + NAV_CLEARANCE;
  for (const level of ["1", "2", "3"]) {
    if (copy.offsetTop >= limit) return;
    copy.dataset.tight = level;
  }
}
function heroSpots(rows = m.bannerRows()) {
  heroRows = new Map(rows.map((row) => [row.id, row]));
  heroIds = rows.map((row) => row.id);
  return heroIds.map((id) => m.byId.get(id));
}
function heroHtml(spots) {
  return `<section class="hero">
      <div class="hero-bg"></div><div class="hero-video"></div>
      <div class="hero-copy"></div>
      <div class="hero-nav"><div class="hero-bars">${heroBars(spots)}</div><div class="hero-roll">${rollHtml()}</div></div>
      ${m.soundButton("nav-btn hero-sound")}
    </section>`;
}
function rollHtml() {
  const { busy, last } = m.bannerRoll();
  return `<button class="hero-roll-btn" data-act="hero-reroll" ${busy ? "disabled" : ""} title="Show different banner picks">${m.icon("refresh")}<span>${busy ? "Rolling…" : "Reroll"}</span></button>
    ${last ? `<button class="hero-roll-btn" data-act="hero-last" ${busy ? "disabled" : ""} title="Bring back the banner picks from before">${m.icon("history")}<span>Last roll</span></button>` : ""}`;
}
function paintRoll() {
  const box = document.querySelector(".hero-roll");
  if (box) box.innerHTML = rollHtml();
}

function render(api) {
  m = api;
  const spots = heroSpots();
  return `${spots.length ? heroHtml(spots) : ""}
    ${m.rail("Continue watching", m.inStatus("watching"), { render: m.wide, href: "#list/watching" })}
    ${m.forYouRail()}
    ${m.homeRowsHtml()}
    ${m.rail("Top 10 on Crunchyroll", m.popular().slice(0, 10), { ranked: true, sub: "Most popular right now" })}
    ${m.rail("New and airing", m.fresh().slice(0, 14), { href: "#airing" })}
    ${m.rail("Your plan to watch", m.inStatus("plan"), { href: "#list/plan" })}
    ${m.rail("Highest rated", m.rated().filter((s) => !m.entry(s)).slice(0, 14), { href: "#browse" })}`;
}

function setAmbient(url) {
  const layers = document.querySelectorAll(".ambient i");
  if (!url || !layers.length || layers[ambientFlip ? 1 : 0].dataset.url === url) return;
  ambientFlip = !ambientFlip;
  const next = layers[ambientFlip ? 1 : 0];
  next.dataset.url = url;
  next.style.backgroundImage = bgUrl(url);
  next.classList.add("on");
  layers[ambientFlip ? 0 : 1].classList.remove("on");
}

function heroTag(s, row) {
  if (row.ai) return "Picked for you by AI";
  if (row.trend === 0) return "Most popular on Crunchyroll";
  if (s.fresh) return "New on Crunchyroll";
  if (row.trend >= 0 && row.trend < 10) return "Trending on Crunchyroll";
  return m.entry(s) ? "From your list" : "Matches your taste";
}

// Called when taste data, the AI ranking or the AI switch arrives after the banner is already showing.
// The slide on screen keeps its bar, progress and trailer; only the other bars take the new order.
// restart: a reroll or Last roll, which starts the new set from its first slide.
function refreshBanner(api, { restart = false } = {}) {
  m = api;
  if (document.body.dataset.page !== "home") return;
  const rows = m.bannerRows();
  if (!rows.length) return paintRoll();
  const hero = document.querySelector(".hero");
  if (!hero) {
    document.querySelector("main")?.insertAdjacentHTML("afterbegin", heroHtml(heroSpots(rows)));
    heroWatch.observe(document.querySelector(".hero"));
    showSlide(0);
    syncHero();
    return;
  }
  paintRoll();
  if (restart) {
    hero.querySelector(".hero-bars").innerHTML = heroBars(heroSpots(rows));
    return showSlide(0);
  }
  const current = heroIds[slide];
  const at = rows.findIndex((row) => row.id === current);
  if (at >= 0) rows.splice(Math.min(slide, rows.length - 1), 0, ...rows.splice(at, 1));
  const before = heroIds.join();
  const spots = heroSpots(rows);
  const bars = hero.querySelectorAll(".hero-bar");
  if (at >= 0 && heroIds[slide] === current && bars.length === spots.length) {
    if (heroIds.join() !== before) {
      bars.forEach((bar, n) => {
        if (n === slide) return;
        bar.setAttribute("aria-label", spots[n].title);
        bar.querySelector(".hero-tip").innerHTML = `<span style="background-image:url('${m.cssUrl(m.artOf(spots[n]))}')"></span><b>${m.esc(spots[n].title)}</b>`;
      });
    }
    hero.querySelector(".hero-copy").innerHTML = heroCopy(spots[slide]);
    fitHeroCopy(hero);
    return;
  }
  hero.querySelector(".hero-bars").innerHTML = heroBars(spots);
  showSlide(Math.min(slide, spots.length - 1));
}
function heroCopy(s) {
  const item = m.entry(s);
  const row = heroRows.get(s.id) || {};
  const size = titleSize(s.title);
  return `<div class="hero-tag"><i></i>${heroTag(s, row)}</div>
    <h1${size ? ` data-size="${size}"` : ""} title="${m.esc(s.title)}">${m.esc(s.title)}</h1>
    <div class="peek-meta">${m.statusBadge(s, { inline: true, focusable: true })}${m.matchBadge(row.match, "hero-match")}<span class="star">★ ${m.score(s)}</span>${s.year ? `<span>${s.year}</span>` : ""}<span>${m.seasonCount(s)}</span>${s.genres.length ? `<span>${m.esc(s.genres.slice(0, 3).join(" · "))}</span>` : ""}</div>
    ${row.reason ? `<p class="hero-why">${m.icon("sparkle")} ${m.esc(row.reason)}</p>` : s.about ? `<p>${m.esc(s.about)}</p>` : ""}
    <div class="peek-actions" data-show="${m.esc(s.id)}"><button class="btn accent" data-act="watch">${m.icon(m.onCrunchyroll(s) ? "play" : "right")} ${m.esc(m.playLabel(s))}</button>
      <button class="btn" data-act="toggle">${m.icon(item ? "check" : "plus")} ${item ? m.STATUS[item.status] : "My list"}</button><a class="btn" href="#show/${m.esc(s.id)}">Details</a></div>`;
}

// The next slide's art fades in on its own layer over the last one, which fades out and is then removed.
const FADE_MS = 1200;
function crossfade(hero, url) {
  const old = [...hero.querySelectorAll(".hero-bg:not(.out)")];
  const next = document.createElement("div");
  next.className = "hero-bg";
  next.style.backgroundImage = bgUrl(url);
  (old.at(-1) || hero.querySelector(".hero-video")).insertAdjacentElement(old.length ? "afterend" : "beforebegin", next);
  void next.offsetWidth;
  next.classList.add("on");
  for (const layer of old) {
    layer.classList.add("out");
    setTimeout(() => layer.remove(), FADE_MS + 100);
  }
}

function showSlide(i) {
  const hero = document.querySelector(".hero");
  if (!hero || !heroIds.length) return;
  slide = (i + heroIds.length) % heroIds.length;
  const s = m.byId.get(heroIds[slide]);
  if (!s) return;
  const prefs = m.prefs();
  const withVideo = Boolean(prefs.previews && !prefs.reduce && s.trailer);
  heroPlayer?.destroy({ fade: FADE_MS }); heroPlayer = null;
  crossfade(hero, m.artOf(s));
  const copy = hero.querySelector(".hero-copy");
  copy.style.animation = "none"; void copy.offsetWidth; copy.style.animation = "";
  copy.innerHTML = heroCopy(s);
  fitHeroCopy(hero);
  showPage(hero, pageOf(slide));
  const dur = withVideo ? 30 : 9;
  hero.querySelectorAll(".hero-bar").forEach((bar, n) => {
    bar.classList.remove("on", "done"); void bar.offsetWidth;
    bar.classList.toggle("done", n < slide);
    bar.classList.toggle("on", n === slide);
    bar.style.setProperty("--dur", `${dur}s`);
  });
  hero.querySelector(".hero-sound").hidden = !withVideo;
  setAmbient(m.artOf(s));
  clearTimeout(slideTimer); clearTimeout(videoTimer);
  slideLeft = dur * 1000;
  videoLeft = withVideo ? 2000 : -1;
  heroTrailer = s.trailer;
  if (heroRunning) startHeroTimers();
  else hero.querySelector(".hero-bar.on")?.classList.add("paused");
}

// The banner only plays while it is on screen and no card preview or trailer is playing.
// Pausing freezes the slide timer and progress bar, and resuming continues where it left off.
function startHeroTimers() {
  heroClock = Date.now();
  slideTimer = setTimeout(() => showSlide(slide + 1), slideLeft);
  if (videoLeft >= 0) videoTimer = setTimeout(() => { videoLeft = -1; heroPlayer = m.player(document.querySelector(".hero-video"), heroTrailer); }, videoLeft);
}
function stopHeroTimers() {
  clearTimeout(slideTimer); clearTimeout(videoTimer);
  const spent = Date.now() - heroClock;
  slideLeft = Math.max(0, slideLeft - spent);
  if (videoLeft >= 0) videoLeft = Math.max(0, videoLeft - spent);
}
function syncHero() {
  const hero = document.querySelector(".hero");
  const run = Boolean(hero) && heroInView && !previewPlaying && !document.hidden;
  if (run === heroRunning) return;
  heroRunning = run;
  hero?.querySelector(".hero-bar.on")?.classList.toggle("paused", !run);
  if (run) { startHeroTimers(); heroPlayer?.play(); } else { stopHeroTimers(); heroPlayer?.pause(); }
}
const heroWatch = new IntersectionObserver(([seen]) => { heroInView = seen.intersectionRatio >= 0.35; syncHero(); }, { threshold: [0, 0.35, 1] });
// Resuming waits a moment so gliding from one card to the next doesn't flash the banner back on.
let resumeTimer = 0;

// Ctrl+K: titles come from the search engine's own title matcher; anything else becomes a full search (AI-ranked when AI is on).
let suggestSeq = 0;
let suggestTimer = 0;
function palette(open) {
  let box = document.querySelector(".kpal");
  if (!box) {
    box = document.createElement("div");
    box.className = "kpal";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Search");
    box.innerHTML = `<div class="kpal-box"><div class="kpal-in">${m.icon("search")}<input placeholder="Search titles, or describe what you want…" aria-label="Search titles or describe a mood"><kbd>Esc</kbd></div><div class="kpal-list"></div></div>`;
    document.body.append(box);
    box.addEventListener("click", (e) => { if (e.target === box) palette(false); });
    box.querySelector("input").addEventListener("input", () => {
      clearTimeout(suggestTimer);
      paintPalette(null);
      suggestTimer = setTimeout(suggest, 120);
    });
    box.querySelector("input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") box.querySelector(".kpal-item.sel")?.click();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = [...box.querySelectorAll(".kpal-item")];
        const at = items.findIndex((x) => x.classList.contains("sel"));
        items[at]?.classList.remove("sel");
        items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.classList.add("sel");
        e.preventDefault();
      }
    });
  }
  box.classList.toggle("open", open);
  if (open) { const input = box.querySelector("input"); input.value = ""; paintPalette([]); setTimeout(() => input.focus(), 10); }
}
async function suggest() {
  const box = document.querySelector(".kpal");
  const q = box?.querySelector("input").value.trim();
  if (!q) return paintPalette([]);
  const seq = ++suggestSeq;
  const reply = await m.send("catalogSuggest", { query: q, chip: "", site: "all" });
  if (seq !== suggestSeq || box.querySelector("input").value.trim() !== q) return;
  const ids = reply?.ok ? (reply.suggestions || []).map((row) => String(row.id).replace(/^sight:/, "")) : [];
  paintPalette(ids.map((id) => m.byId.get(id)).filter(Boolean));
}
// hits: shows to list, or null while the title lookup is still running.
function paintPalette(hits) {
  const box = document.querySelector(".kpal");
  const q = box.querySelector("input").value.trim();
  const list = box.querySelector(".kpal-list");
  if (hits === null && list.dataset.q === q) return;
  list.dataset.q = q;
  const shows = q ? hits || [] : m.inStatus("watching").slice(0, 6);
  const ai = m.aiOn();
  const sub = (s) => `${m.entry(s) ? m.STATUS[m.entry(s).status] : m.esc(s.genres.slice(0, 2).join(" · ")) || (s.type === "movie" ? "Movie" : "Series")} · ★ ${m.score(s)}`;
  list.innerHTML = `
    ${q ? `<h6>${ai ? "Ask AI" : "Search"}</h6><div class="kpal-item kpal-ask sel" data-go="#search?q=${encodeURIComponent(q)}"><span>${m.icon(ai ? "sparkle" : "search")}</span><div><b>Find shows like “${m.esc(q)}”</b><small>${ai ? "Search with AI ranking and a short “why” for each pick" : "Search by mood, tags and description. AI is off"}</small></div></div>` : ""}
    ${!q && !shows.length ? "" : `<h6>${q ? "Titles" : "Continue watching"}</h6>`}
    ${shows.map((s, i) => `<div class="kpal-item ${!q && i === 0 ? "sel" : ""}" data-go="#show/${encodeURIComponent(s.id)}">${m.posterImg(s)}<div><b>${m.esc(s.title)}</b><small>${sub(s)}</small></div>${m.icon("right")}</div>`).join("")
      || (q ? `<p class="muted kpal-note">${hits === null ? "Looking…" : `No titles match. Press Enter to ${ai ? "ask AI" : "search by description"}.`}</p>` : "")}
    ${q ? "" : `<h6>Go to</h6>${[["#search", ai ? "Search and AI picks" : "Search", ai ? "sparkle" : "search"], ["#browse", "Browse by genre", "compass"], ["#airing", "Airing this week", "calendar"], ["#list", "My list", "list"], ["#settings", "Appearance and settings", "palette"]].map(([h, t, ic]) => `<div class="kpal-item kpal-ask kpal-go ${!shows.length && h === "#search" ? "sel" : ""}" data-go="${h}"><span>${m.icon(ic)}</span><div><b>${t}</b></div></div>`).join("")}`}`;
}

function after(page, api) {
  m = api;
  if (!document.querySelector(".ambient")) document.body.insertAdjacentHTML("afterbegin", '<div class="ambient"><i></i><i></i></div>');
  clearTimeout(slideTimer); clearTimeout(videoTimer); heroPlayer?.destroy(); heroPlayer = null;
  heroRunning = false; heroInView = true; previewPlaying = false; clearTimeout(resumeTimer); heroWatch.disconnect();
  if (page === "home" && document.querySelector(".hero")) { showSlide(0); heroWatch.observe(document.querySelector(".hero")); syncHero(); }
  if (page === "show") { const s = m.byId.get(decodeURIComponent(location.hash.split("/")[1] || "")); if (s) setAmbient(m.artOf(s)); }
}

function bind() {
  document.addEventListener("previewchange", (e) => {
    clearTimeout(resumeTimer);
    if (e.detail.active) { previewPlaying = true; syncHero(); }
    else resumeTimer = setTimeout(() => { previewPlaying = false; syncHero(); }, 1500);
  });
  document.addEventListener("visibilitychange", syncHero);
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act],[data-go]");
    if (!t) return;
    if (t.dataset.go) { palette(false); location.hash = t.dataset.go; }
    if (t.dataset.act === "kpal") palette(true);
    if (t.dataset.act === "hero") showSlide(Number(t.dataset.i));
    if (t.dataset.act === "hero-page") showSlide(Number(t.dataset.page) * PAGE_SIZE);
  });
  document.addEventListener("keydown", (e) => {
    // Typing inside the embedded search shows up here as its shadow host, so look at where the key really went.
    const typing = (e.composedPath()[0] || e.target).matches?.("input, textarea, select, [contenteditable]");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palette(true); }
    if (e.key === "/" && !typing) { e.preventDefault(); palette(true); }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".kbar")) { e.preventDefault(); palette(true); }
    if (e.key === "Escape") palette(false);
  });
  document.addEventListener("mouseover", (e) => {
    const card = e.target.closest?.(".card, .wide");
    if (card) { const s = m?.byId.get(card.dataset.show); if (s) setAmbient(m.artOf(s)); }
  });
  addEventListener("scroll", () => document.querySelector(".nav")?.classList.toggle("solid", scrollY > 30), { passive: true });
  let fitFrame = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => { const hero = document.querySelector(".hero"); if (hero) fitHeroCopy(hero); });
  });
}

export function createHome() {
  bind();
  return { render, after, refreshBanner, paintRoll, shownIds: () => [...heroIds] };
}
