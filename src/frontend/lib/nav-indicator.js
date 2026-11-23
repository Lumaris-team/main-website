/* Shared sliding "bubble" indicator — same technology as the navbar.
   Auto-attaches to every `aside[class$="-sidebar"]` (settings, tools, ai,
   files, websites…) and to segmented nav lists (`.ws-segmented` in workspace).
   The bubble follows pointerenter, returns to the active item
   ([data-active="true"], .active, .is-active or [aria-current]) on
   pointerleave, and tracks active/visibility changes via MutationObserver. */

const NAV_INDICATOR_STYLE = `
.lumaris-nav-bubble {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  width: 0;
  height: 0;
  border-radius: 999px;
  background: rgba(140, 236, 255, .16);
  box-shadow: 0 0 26px rgba(140, 236, 255, .14), inset 0 0 0 1px rgba(140, 236, 255, .04);
  opacity: 0;
  pointer-events: none;
  transform: translate3d(0, 0, 0);
  transition: transform 360ms cubic-bezier(.22, 1, .36, 1),
              width 360ms cubic-bezier(.22, 1, .36, 1),
              height 360ms cubic-bezier(.22, 1, .36, 1),
              opacity 180ms ease;
}
.lumaris-nav-bubble[data-hovering="true"],
.lumaris-nav-bubble[data-hovering="false"] { opacity: 1; }
`;

const NAV_ITEM_SELECTOR = "button[class$='-nav'], a[class$='-nav'], .ws-seg";
const ACTIVE_SELECTOR = "[data-active='true'], .active, .is-active, [aria-current]";

function ensureIndicatorStyles() {
  if (document.getElementById("lumaris-nav-indicator-styles")) return;
  const style = document.createElement("style");
  style.id = "lumaris-nav-indicator-styles";
  style.textContent = NAV_INDICATOR_STYLE;
  document.head.appendChild(style);
}

function navItemsOf(container) {
  return [...container.querySelectorAll(NAV_ITEM_SELECTOR)];
}

function activeItemOf(container) {
  return container.querySelector(ACTIVE_SELECTOR) || navItemsOf(container)[0] || null;
}

export function attachNavIndicator(container) {
  if (!container || container.dataset.navIndicator === "1") return;
  const items = navItemsOf(container);
  if (!items.length) return;

  // Bubble needs a positioned ancestor to measure against.
  if (getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }

  ensureIndicatorStyles();

  const bubble = document.createElement("span");
  bubble.className = "lumaris-nav-bubble";
  bubble.dataset.hovering = "false";
  bubble.setAttribute("aria-hidden", "true");
  container.appendChild(bubble);

  const move = (item, hovering) => {
    if (!item || container.hidden) return;
    const boxRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (!itemRect.width || !itemRect.height) return;
    bubble.dataset.hovering = String(hovering);
    bubble.style.width = `${itemRect.width}px`;
    bubble.style.height = `${itemRect.height}px`;
    bubble.style.transform = `translate3d(${itemRect.left - boxRect.left}px, ${itemRect.top - boxRect.top}px, 0)`;
  };

  items.forEach((item) => {
    item.addEventListener("pointerenter", () => move(item, true));
    item.addEventListener("focus", () => move(item, true));
  });
  container.addEventListener("pointerleave", () => move(activeItemOf(container), false));

  // Keep the bubble glued to the active item when scripts flip
  // data-active/class, and re-measure when visibility toggles.
  const observer = new MutationObserver(() => {
    if (container.matches(":hover")) return;
    move(activeItemOf(container), false);
  });
  observer.observe(container, {
    attributes: true,
    subtree: true,
    attributeFilter: ["data-active", "class", "aria-current", "hidden"],
  });

  window.addEventListener("resize", () => {
    if (!container.matches(":hover")) move(activeItemOf(container), false);
  });

  requestAnimationFrame(() => move(activeItemOf(container), false));
  container.dataset.navIndicator = "1";
}

export function initNavIndicators(root = document) {
  const containers = root.querySelectorAll(
    "aside[class$='-sidebar'], nav[class$='-sidebar'], .ws-segmented"
  );
  containers.forEach(attachNavIndicator);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initNavIndicators());
  } else {
    initNavIndicators();
  }
}
