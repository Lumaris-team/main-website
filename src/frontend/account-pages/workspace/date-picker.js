// Lumaris date picker — replaces every native date/datetime input in the
// workspace with a custom calendar popover.
//
// Contract: `lumarisDateField()` renders a hidden input (keeps the original
// id/class so existing `.value` reads and delegated listeners keep working)
// plus a button that opens the picker. Picking a date writes the hidden
// input and dispatches `input` + `change` events, so code listening on the
// original input (exam-plan auto-dates, spaced repetition…) keeps working.
//
// Heatmap: `setDayHeat(Map<"YYYY-MM-DD", count>)` feeds per-day task counts.
// Days are drawn as a colored disc — the redder the disc, the more tasks.
// Scale: full red = 10 tasks, or the actual peak when a day exceeds 10.

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juuin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const DOW = ["L", "M", "M", "J", "V", "S", "D"]; // Monday first

let heatMap = new Map();
let peakCount = 0;
let heatScale = 10; // denominator: max(10, peak)

export function setDayHeat(map) {
  heatMap = map instanceof Map ? map : new Map();
  peakCount = 0;
  for (const n of heatMap.values()) if (n > peakCount) peakCount = n;
  heatScale = Math.max(10, peakCount);
}

// ---------------------------------------------------------------------------
// Field HTML
// ---------------------------------------------------------------------------

function pad(n) { return String(n).padStart(2, "0"); }

function dayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseValue(value, mode) {
  if (!value) return null;
  const v = String(value);
  const m = mode === "datetime"
    ? v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
    : v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
}

function formatLabel(value, mode) {
  const d = parseValue(value, mode);
  if (!d) return mode === "datetime" ? "Date et heure" : "Choisir une date";
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return mode === "datetime" ? `${date} · ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

const CAL_SVG = `<svg class="lp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>`;

/**
 * Returns the HTML for a Lumaris date field.
 * @param {object} o
 * @param {string} o.id        id of the hidden input (kept for collectFields)
 * @param {string} [o.value]   hidden-input format: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"
 * @param {"date"|"datetime"} [o.mode]
 * @param {string} [o.inputClass]  extra class kept on the hidden input
 * @param {string} [o.attrs]       extra raw attributes for the hidden input (e.g. 'data-start')
 * @param {string} [o.placeholder]
 */
export function lumarisDateField({ id, value = "", mode = "date", inputClass = "", attrs = "", placeholder = "" } = {}) {
  const ph = placeholder || (mode === "datetime" ? "Date et heure" : "Choisir une date");
  return `
    <span class="lp-field" data-lp-wrap data-lp-mode="${mode}">
      <input type="hidden" ${id ? `id="${id}"` : ""} class="${inputClass}" value="${escapeHtml(value)}" ${attrs}>
      <button type="button" class="lp-btn${value ? "" : " is-empty"}" data-lp-open aria-haspopup="dialog">
        ${CAL_SVG}<span class="lp-btn-text">${escapeHtml(formatLabel(value, mode))}</span>
      </button>
    </span>`;
}

/** Re-sync every picker button label with its hidden input (after programmatic .value writes). */
export function refreshDatePickerLabels(root = document) {
  root.querySelectorAll("[data-lp-wrap]").forEach((wrap) => {
    const input = wrap.querySelector("input");
    const label = wrap.querySelector(".lp-btn-text");
    const btn = wrap.querySelector(".lp-btn");
    if (label && input) label.textContent = formatLabel(input.value, wrap.dataset.lpMode || "date");
    btn?.classList.toggle("is-empty", !input?.value);
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------------------
// Picker popover
// ---------------------------------------------------------------------------

let pop = null;          // popover element
let activeBtn = null;    // button that opened it
let viewY = 0, viewM = 0; // displayed month
let selDate = null;      // Date currently selected in the grid
let selTime = { h: 9, m: 0 };

function ensurePopover() {
  if (pop) return pop;
  pop = document.createElement("div");
  pop.className = "lp-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Choisir une date");
  pop.hidden = true;
  document.body.appendChild(pop);

  pop.addEventListener("click", onPopClick);
  pop.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.lpH !== undefined) selTime.h = Number(t.value);
    if (t.dataset.lpM !== undefined) selTime.m = Number(t.value);
  });
  document.addEventListener("pointerdown", (e) => {
    if (pop.hidden) return;
    if (pop.contains(e.target) || e.target.closest?.("[data-lp-open]")) return;
    closePicker();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePicker(); });
  window.addEventListener("resize", () => closePicker());
  return pop;
}

function currentMode() {
  return activeBtn?.closest("[data-lp-wrap]")?.dataset.lpMode || "date";
}

function pickerInput() {
  return activeBtn?.closest("[data-lp-wrap]")?.querySelector("input") || null;
}

function openPicker(btn) {
  const input = btn.closest("[data-lp-wrap]")?.querySelector("input");
  if (!input) return;
  activeBtn = btn;
  const mode = btn.closest("[data-lp-wrap]")?.dataset.lpMode || "date";

  const parsed = parseValue(input.value, mode);
  const base = parsed || new Date();
  selDate = parsed ? new Date(base) : null;
  selTime = { h: base.getHours(), m: base.getMinutes() };
  viewY = base.getFullYear();
  viewM = base.getMonth();

  render();
  position(btn);
  pop.hidden = false;
}

function closePicker() {
  if (pop) pop.hidden = true;
  activeBtn = null;
}

function position(btn) {
  const r = btn.getBoundingClientRect();
  const pw = pop.offsetWidth || 300;
  const ph = pop.offsetHeight || 380;
  let left = r.left;
  if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
  let top = r.bottom + 8;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

function heatFor(key) {
  const n = heatMap.get(key) || 0;
  if (!n) return { n: 0, h: 0 };
  return { n, h: Math.max(0.18, Math.min(1, n / heatScale)) };
}

function render() {
  const mode = currentMode();
  const first = new Date(viewY, viewM, 1);
  // Monday-first offset: JS getDay() Sun=0 → Mon=0..Sun=6
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const daysInPrev = new Date(viewY, viewM, 0).getDate();

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const idx = i - lead;
    let d, outside = false;
    if (idx < 0) { d = new Date(viewY, viewM, daysInPrev + idx + 1); outside = true; }
    else if (idx >= daysInMonth) { d = new Date(viewY, viewM + 1, idx - daysInMonth + 1); outside = true; }
    else d = new Date(viewY, viewM, idx + 1);

    const key = dayKey(d);
    const { n, h } = heatFor(key);
    const isSel = selDate && dayKey(selDate) === key;
    const isToday = dayKey(new Date()) === key;
    cells.push(`
      <button type="button" class="lp-day${outside ? " is-out" : ""}${isSel ? " is-sel" : ""}${isToday ? " is-today" : ""}"
        data-day="${key}" ${n ? `data-n="${n}"` : ""}
        title="${d.getDate()} ${MONTHS[d.getMonth()]}${n ? ` — ${n} tâche${n > 1 ? "s" : ""}` : ""}"
        style="--h:${h.toFixed(3)}" aria-label="${d.getDate()} ${MONTHS[d.getMonth()]}${n ? `, ${n} tâche${n > 1 ? "s" : ""}` : ""}">
        <span class="lp-num">${d.getDate()}</span>
      </button>`);
  }

  const timeRow = mode === "datetime" ? `
    <div class="lp-time">
      <label>Heure
        <select data-lp-h>${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === selTime.h ? "selected" : ""}>${pad(h)}</option>`).join("")}</select>
      </label>
      <span class="lp-time-sep">:</span>
      <label>Minute
        <select data-lp-m>${Array.from({ length: 60 }, (_, m) => `<option value="${m}" ${m === selTime.m ? "selected" : ""}>${pad(m)}</option>`).join("")}</select>
      </label>
    </div>` : "";

  const denom = heatScale;
  pop.innerHTML = `
    <div class="lp-head">
      <button type="button" class="lp-nav" data-nav="-1" aria-label="Mois précédent">‹</button>
      <div class="lp-title">${MONTHS[viewM]} ${viewY}</div>
      <button type="button" class="lp-nav" data-nav="1" aria-label="Mois suivant">›</button>
    </div>
    <div class="lp-dow">${DOW.map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="lp-grid">${cells.join("")}</div>
    ${timeRow}
    <div class="lp-foot">
      <div class="lp-legend" title="Moins de tâches ↔ plus de tâches — rouge complet = ${denom} tâche${denom > 1 ? "s" : ""}">
        <span class="lp-legend-lbl">0</span>
        <span class="lp-grad" aria-hidden="true"></span>
        <span class="lp-legend-lbl">${denom}</span>
      </div>
      ${mode === "datetime" ? `<button type="button" class="lp-apply" data-apply>Valider</button>` : ""}
      <button type="button" class="lp-clear" data-clear>Effacer</button>
    </div>`;
}

function commit() {
  const input = pickerInput();
  if (!input) { closePicker(); return; }
  const mode = currentMode();
  if (!selDate) { input.value = ""; }
  else if (mode === "datetime") {
    input.value = `${dayKey(selDate)}T${pad(selTime.h)}:${pad(selTime.m)}`;
  } else {
    input.value = dayKey(selDate);
  }
  const wrap = activeBtn.closest("[data-lp-wrap]");
  const label = activeBtn.querySelector(".lp-btn-text");
  if (label) label.textContent = formatLabel(input.value, mode);
  activeBtn.classList.toggle("is-empty", !input.value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  closePicker();
}

function onPopClick(e) {
  const t = e.target.closest("button, select");
  if (!t) return;
  if (t.dataset.nav) {
    viewM += Number(t.dataset.nav);
    if (viewM < 0) { viewM = 11; viewY--; }
    if (viewM > 11) { viewM = 0; viewY++; }
    render();
    return;
  }
  if (t.dataset.apply !== undefined) { commit(); return; }
  if (t.dataset.day) {
    const [y, mo, da] = t.dataset.day.split("-").map(Number);
    selDate = new Date(y, mo - 1, da);
    if (currentMode() === "datetime") {
      // Keep the popover open so the time can be adjusted, then "Valider".
      const prev = pop.querySelector(".lp-day.is-sel");
      prev?.classList.remove("is-sel");
      t.classList.add("is-sel");
      return;
    }
    commit();
    return;
  }
  if (t.dataset.clear !== undefined) {
    selDate = null;
    commit();
    return;
  }
}

/** Wire the delegated click handler — call once at page init. */
export function initDatePicker() {
  ensurePopover();
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lp-open]");
    if (!btn) return;
    e.preventDefault();
    if (pop && !pop.hidden && activeBtn === btn) { closePicker(); return; }
    openPicker(btn);
  });
}
