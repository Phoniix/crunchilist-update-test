import { BADGE_LABELS, badgeIcon } from "./badge-style.js";

const CHOICES = ["in_progress", "finished", "plan", "dropped"];
let menu = null;
let opener = null;
let cleanup = () => {};

export function closeBadgeMenu({ refocus = false } = {}) {
  if (!menu) return;
  cleanup();
  menu.remove();
  menu = null;
  opener?.setAttribute("aria-expanded", "false");
  if (refocus && opener?.isConnected) opener.focus({ preventScroll: true });
  opener = null;
}

export function openBadgeMenu(badge, { mark, title = "", onPick }) {
  closeBadgeMenu();
  const doc = badge.ownerDocument;
  const view = doc.defaultView;
  menu = doc.createElement("div");
  menu.className = badge.classList.contains("crl-lite") ? "crl-menu crl-lite" : "crl-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", title ? `Status for ${title}` : "Change status");
  if (title) {
    const heading = doc.createElement("span");
    heading.className = "crl-menu-title";
    heading.textContent = title;
    menu.append(heading);
  }
  const option = (status, text) => {
    const button = doc.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.append(badgeIcon(doc, status), doc.createTextNode(text));
    button.classList.add(`crl-t-${status}`);
    if (status === mark) {
      const check = doc.createElement("span");
      check.className = "crl-menu-check";
      check.textContent = "✓";
      button.append(check);
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeBadgeMenu({ refocus: true });
      if (status !== mark) onPick(status);
    });
    return button;
  };
  for (const status of CHOICES) menu.append(option(status, BADGE_LABELS[status]));
  if (mark !== "unwatched") {
    const sep = doc.createElement("span");
    sep.className = "crl-menu-sep";
    menu.append(sep, option("unwatched", "Remove from list"));
  }
  doc.documentElement.append(menu);

  const box = badge.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const left = Math.max(8, Math.min(box.left, view.innerWidth - width - 8));
  const top = box.bottom + 6 + height <= view.innerHeight ? box.bottom + 6 : Math.max(8, box.top - height - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  opener = badge;
  badge.setAttribute("aria-expanded", "true");
  menu.querySelector("button")?.focus({ preventScroll: true });

  const onPointer = (event) => {
    if (!menu?.contains(event.target) && !badge.contains(event.target)) closeBadgeMenu();
  };
  const onKey = (event) => {
    if (!menu) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeBadgeMenu({ refocus: true });
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const items = [...menu.querySelectorAll("button")];
      const at = items.indexOf(doc.activeElement);
      items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      closeBadgeMenu();
    }
  };
  const onMove = () => closeBadgeMenu();
  doc.addEventListener("pointerdown", onPointer, true);
  doc.addEventListener("keydown", onKey, true);
  view.addEventListener("scroll", onMove, true);
  view.addEventListener("resize", onMove);
  cleanup = () => {
    doc.removeEventListener("pointerdown", onPointer, true);
    doc.removeEventListener("keydown", onKey, true);
    view.removeEventListener("scroll", onMove, true);
    view.removeEventListener("resize", onMove);
  };
}
