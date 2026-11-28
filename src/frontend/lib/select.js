// Lumaris select — morphs native <select> elements into themed dropdowns.
// The original element stays in the DOM and synced (value + change/input
// events), so existing code reading `.value` keeps working untouched.
// A global MutationObserver auto-enhances every select inserted anywhere.

const CSS = `
.lum-select-native { display: none !important; }
.lum-select { position: relative; display: inline-block; min-width: 0; max-width: 100%; }
/* Mirror of the .ws-field select width rule — the wrapper replaces the
   select in the layout, so it must fill the field like the native did. */
.ws-field .lum-select { display: block; width: 100%; }
.lum-select-trigger {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; padding: 7px 10px; border-radius: 9px; cursor: pointer;
  border: 1px solid var(--line, rgba(255,255,255,.14));
  background: var(--panel, rgba(255,255,255,.05));
  color: var(--text, #eef0f8); font: inherit; font-size: .85rem;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.lum-select-trigger:hover { border-color: rgba(140,236,255,.4); }
.lum-select.is-open .lum-select-trigger {
  border-color: rgba(140,236,255,.5);
  box-shadow: 0 0 0 3px rgba(140,236,255,.12);
}
.lum-select-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lum-select-caret { flex: none; color: var(--muted, rgba(255,255,255,.55)); transition: transform .18s ease; }
.lum-select.is-open .lum-select-caret { transform: rotate(180deg); }
.lum-select-options {
  position: absolute; top: calc(100% + 5px); left: 0; right: 0; z-index: 4000;
  display: none; flex-direction: column; gap: 2px; padding: 5px;
  border-radius: 10px; max-height: 230px; overflow-y: auto;
  border: 1px solid var(--line, rgba(255,255,255,.14));
  background: var(--bg, #0b1020); backdrop-filter: blur(14px);
  box-shadow: 0 16px 40px rgba(0,0,0,.5);
  scrollbar-width: thin; scrollbar-color: rgba(140,236,255,.3) transparent;
}
.lum-select.is-open .lum-select-options { display: flex; }
/* Flip upward when there isn't room below (modals scroll, lists clip). */
.lum-select.is-up .lum-select-options { top: auto; bottom: calc(100% + 5px); }
.lum-select-option {
  display: block; width: 100%; padding: 6px 9px; border: 0; border-radius: 7px;
  background: transparent; color: var(--text, #eef0f8); font: inherit; font-size: .85rem;
  text-align: left; cursor: pointer; transition: background .12s ease;
}
.lum-select-option:hover { background: rgba(140,236,255,.1); }
.lum-select-option.is-selected { background: rgba(140,236,255,.15); color: var(--accent, #8cecff); }
.lum-select-option.is-selected::after { content: "✓"; float: right; font-size: .8rem; }
.lum-select-option[disabled] { opacity: .4; cursor: default; }
`;
if (typeof document !== "undefined" && !document.getElementById("lum-select-css")) {
  const st = document.createElement("style");
  st.id = "lum-select-css";
  st.textContent = CSS;
  document.head.appendChild(st);
}

const openState = { el: null };

function closeAll() {
  if (!openState.el) return;
  openState.el.classList.remove("is-open", "is-up");
  openState.el.querySelector(".lum-select-trigger")?.setAttribute("aria-expanded", "false");
  openState.el = null;
}

const escMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => escMap[c]);

export function enhanceSelect(select) {
  if (!select || select.dataset.lumSelect || select.multiple || select.size > 1 || select.disabled) return;
  select.dataset.lumSelect = "1";
  select.classList.add("lum-select-native");
  select.setAttribute("aria-hidden", "true");
  select.tabIndex = -1;

  const wrap = document.createElement("div");
  wrap.className = "lum-select";
  wrap.innerHTML = `
    <button type="button" class="lum-select-trigger" aria-haspopup="listbox" aria-expanded="false">
      <span class="lum-select-value"></span>
      <svg class="lum-select-caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="lum-select-options" role="listbox"></div>`;
  select.insertAdjacentElement("afterend", wrap);

  const trigger = wrap.querySelector(".lum-select-trigger");
  const valueEl = wrap.querySelector(".lum-select-value");
  const listEl = wrap.querySelector(".lum-select-options");

  // (Re)build the option list from the live <select> — respects hidden/disabled
  // options and picks up options injected asynchronously.
  const buildOptions = () => {
    listEl.innerHTML = [...select.options]
      .filter((o) => !o.hidden && !o.disabled)
      .map((o) => `<button type="button" class="lum-select-option" role="option" data-value="${esc(o.value)}">${esc(o.textContent.trim())}</button>`)
      .join("");
    listEl.querySelectorAll(".lum-select-option").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (select.value !== btn.dataset.value) {
          select.value = btn.dataset.value;
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        syncLabel();
        closeAll();
      });
    });
  };

  const syncLabel = () => {
    const opt = select.selectedOptions?.[0];
    valueEl.textContent = opt ? opt.textContent.trim() : "";
    valueEl.title = valueEl.textContent;
    listEl.querySelectorAll(".lum-select-option").forEach((o) =>
      o.classList.toggle("is-selected", o.dataset.value === select.value)
    );
  };

  // Options injected or toggled after enhancement → refresh the list.
  new MutationObserver(() => { buildOptions(); syncLabel(); })
    .observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "disabled"] });
  select.addEventListener("change", syncLabel);

  // Fields wrap the select in a <label> — clicking the label text should open
  // the dropdown like it would focus the native select.
  const label = select.closest("label");
  label?.addEventListener("click", (e) => {
    if (e.target.closest(".lum-select") || e.target === trigger) return;
    trigger.click();
  });

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (wrap.classList.contains("is-open")) { closeAll(); return; }
    closeAll();
    buildOptions(); // fresh list: hidden/disabled states may have changed
    syncLabel();
    wrap.classList.add("is-open");
    // Not enough room below → open upward instead of being clipped.
    const rect = wrap.getBoundingClientRect();
    const roomBelow = window.innerHeight - rect.bottom;
    wrap.classList.toggle("is-up", roomBelow < 240 && rect.top > roomBelow);
    trigger.setAttribute("aria-expanded", "true");
    openState.el = wrap;
    listEl.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
  });

  buildOptions();
  syncLabel();
}

export function enhanceSelects(root = document) {
  root.querySelectorAll?.("select:not([data-lum-select]):not([multiple])").forEach(enhanceSelect);
  if (root.matches?.("select:not([data-lum-select]):not([multiple])")) enhanceSelect(root);
}

// Auto-enhance every <select> inserted anywhere in the page.
if (typeof document !== "undefined") {
  const scan = (node) => {
    if (node.nodeType !== 1) return;
    if (node.matches?.("select")) enhanceSelect(node);
    node.querySelectorAll?.("select").forEach(enhanceSelect);
  };
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) scan(n);
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("click", (e) => {
    if (openState.el && !openState.el.contains(e.target)) closeAll();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });

  // Enhance selects already present at load — the observer only catches
  // nodes inserted later.
  const boot = () => enhanceSelects(document);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
