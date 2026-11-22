import { authedFetch } from "/lib/auth.js";

// ---------- API ----------
async function api(action, payload = {}) {
  const res = await authedFetch(`/api/tasks/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  const resp = data?.resp ?? data;
  if (resp?.error) throw new Error(resp.error);
  return resp;
}

// ---------- State ----------
const ALL_TABLES = ["tasks", "repeat_tasks", "events", "repeat_events", "trash_tasks", "trash_events"];
const VIEWS = {
  tasks: { tables: ["tasks"], empty: ["No tasks", "Create your first task above."] },
  repeat: { tables: ["repeat_tasks"], empty: ["No recurring tasks", "Recurring tasks will appear here."] },
  events: { tables: ["events", "repeat_events"], empty: ["No events", "Events will appear here."] },
  trash: { tables: ["trash_tasks", "trash_events"], empty: ["Trash is empty", "Deleted items land here."] },
};

const state = {
  tables: {},
  view: "tasks",
  q: "",
  selected: null, // { table, row }
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Field definitions for the detail editor ----------
// Rendered only when the column exists on the row (events lack subject fields, etc.)
const SECTIONS = [
  {
    title: "Content",
    fields: [
      { key: "text_body", label: "Body", type: "textarea", rows: 5, placeholder: "Details, instructions…" },
      { key: "steps", label: "Steps", type: "textarea", rows: 3, placeholder: "One step per line, or JSON" },
    ],
  },
  {
    title: "Organization",
    fields: [
      { key: "subject_id", label: "Subject", type: "text", placeholder: "e.g. Maths" },
      { key: "chapter_id", label: "Chapter", type: "number" },
      { key: "chapter_part_id", label: "Chapter part", type: "number" },
      { key: "type_id", label: "Type", type: "number" },
      { key: "methods_id", label: "Method", type: "number" },
      { key: "priority_id", label: "Priority", type: "select", options: ["", "1", "2", "3", "4"], labels: ["—", "Low", "Normal", "High", "Urgent"] },
      { key: "attention_level_id", label: "Attention", type: "select", options: ["", "1", "2", "3"], labels: ["—", "Low", "Medium", "High"] },
      { key: "flags_id", label: "Flag", type: "number" },
      { key: "labels_id", label: "Label", type: "number" },
      { key: "path", label: "Path", type: "text", placeholder: "/folder/…" },
    ],
  },
  {
    title: "Schedule",
    fields: [
      { key: "remind", label: "Reminder", type: "checkbox" },
      { key: "remind_date", label: "Reminder date", type: "datetime" },
      { key: "periods", label: "Periods", type: "textarea", rows: 2, placeholder: "JSON array or free text" },
      { key: "frequency", label: "Frequency", type: "text", placeholder: "e.g. daily, weekly" },
      { key: "excludes_periods", label: "Excluded periods", type: "textarea", rows: 2 },
    ],
  },
  {
    title: "Resources",
    fields: [
      { key: "is_homework", label: "Homework", type: "checkbox" },
      { key: "homeworks_id", label: "Homework ref", type: "text" },
      { key: "urls", label: "URLs", type: "lines", placeholder: "One URL per line" },
      { key: "attachements_id", label: "Attachments", type: "textarea", rows: 2, placeholder: "JSON or free text" },
      { key: "push_tasks", label: "Push notifications", type: "checkbox" },
    ],
  },
  {
    title: "Notes",
    fields: [
      { key: "comments", label: "Comments", type: "textarea", rows: 3 },
      { key: "ai_comments", label: "AI comments", type: "textarea", rows: 3 },
    ],
  },
  {
    title: "Advanced",
    fields: [
      { key: "additional_data", label: "Additional data (JSON)", type: "textarea", rows: 3, mono: true },
    ],
  },
];

const PRIORITY_COLORS = { 1: "#6ee7a0", 2: "#8cecff", 3: "#fbbf24", 4: "#fb7185" };

// ---------- Helpers ----------
function parseMaybeJSON(v) {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!t || (t[0] !== "[" && t[0] !== "{")) return v;
  try { return JSON.parse(t); } catch { return v; }
}

function toLines(v) {
  const p = parseMaybeJSON(v);
  if (Array.isArray(p)) return p.join("\n");
  return v ?? "";
}

function fromLines(v) {
  const lines = String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.length ? JSON.stringify(lines) : "";
}

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromLocalInput(v) {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d) ? "" : d.toISOString();
}

function dueBucket(iso) {
  if (!iso) return "nodate";
  const d = new Date(iso);
  if (isNaN(d)) return "nodate";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTomorrow = new Date(startToday); startTomorrow.setDate(startTomorrow.getDate() + 1);
  const startWeek = new Date(startToday); startWeek.setDate(startWeek.getDate() + 7);
  if (d < startToday) return "overdue";
  if (d < startTomorrow) return "today";
  if (d < startWeek) return "week";
  return "later";
}

const GROUP_DEFS = [
  ["overdue", "Overdue", "overdue"],
  ["today", "Today", "today"],
  ["week", "This week", "week"],
  ["later", "Later", "later"],
  ["nodate", "No date", "nodate"],
  ["done", "Completed", "done"],
];

function groupLabel(bucket) {
  return GROUP_DEFS.find(([k]) => k === bucket)?.[1] || bucket;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today · ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return d.toLocaleDateString([], { day: "numeric", month: "short" }) + ` · ${time}`;
}

function matchesQ(row, q) {
  if (!q) return true;
  const hay = [row.title, row.text_body, row.subject_id, row.path, row.comments]
    .map((v) => String(v ?? "").toLowerCase()).join(" ");
  return hay.includes(q);
}

// ---------- Data ----------
async function load() {
  try {
    const resp = await api("list", { tables: ALL_TABLES });
    state.tables = resp?.tables || {};
    renderStats();
    renderList();
    if (state.selected) refreshSelected();
  } catch (e) {
    toast(e.message || "Failed to load tasks");
  }
}

function rowsForView() {
  const view = VIEWS[state.view];
  const rows = [];
  for (const t of view.tables) {
    for (const row of state.tables[t] || []) {
      if (!matchesQ(row, state.q.toLowerCase())) continue;
      rows.push({ table: t, row });
    }
  }
  return rows;
}

// ---------- Rendering: stats ----------
function renderStats() {
  const tasks = state.tables.tasks || [];
  const pending = tasks.filter((t) => !t.is_done);
  const today = pending.filter((t) => dueBucket(t.remind_date) === "today").length;
  const overdue = pending.filter((t) => dueBucket(t.remind_date) === "overdue").length;
  const trash = (state.tables.trash_tasks || []).length + (state.tables.trash_events || []).length;
  const repeat = (state.tables.repeat_tasks || []).length + (state.tables.repeat_events || []).length;
  $("#statsBar").innerHTML = [
    [pending.length, "open"],
    [today, "today"],
    [overdue, "overdue"],
    [repeat, "recurring"],
    [trash, "trash"],
  ].map(([n, l]) => `<span class="ws-stat"><b>${n}</b>${l}</span>`).join("");
}

// ---------- Rendering: list ----------
function renderList() {
  const groupsEl = $("#taskGroups");
  const emptyEl = $("#emptyState");
  const rows = rowsForView();

  if (!rows.length) {
    groupsEl.innerHTML = "";
    emptyEl.hidden = false;
    const [t, s] = VIEWS[state.view].empty;
    $("#emptyTitle").textContent = state.q ? "No results" : t;
    $("#emptySub").textContent = state.q ? `Nothing matches “${state.q}”.` : s;
    return;
  }
  emptyEl.hidden = true;

  // Group rows
  const groups = new Map();
  for (const item of rows) {
    let bucket;
    if (state.view === "trash") bucket = "trash";
    else if (state.view === "repeat") bucket = item.row.frequency || "custom";
    else if (item.row.is_done) bucket = "done";
    else bucket = dueBucket(item.row.remind_date);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(item);
  }

  // Order groups
  const order = state.view === "repeat"
    ? [...groups.keys()].sort()
    : state.view === "trash"
      ? ["trash"]
      : GROUP_DEFS.map(([k]) => k);

  groupsEl.innerHTML = order
    .filter((k) => groups.has(k))
    .map((k) => {
      const items = groups.get(k);
      const label = state.view === "repeat" ? `Repeats · ${k}` : state.view === "trash" ? "Recently deleted" : groupLabel(k);
      return `
        <div class="ws-group">
          <div class="ws-group-head"><span>${esc(label)}</span><span class="ws-group-count">${items.length}</span></div>
          <div class="ws-group-items">
            ${items.map((it) => taskRowHTML(it)).join("")}
          </div>
        </div>`;
    })
    .join("");

  groupsEl.querySelectorAll(".ws-task").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".ws-task-check")) return;
      const { table, id } = el.dataset;
      const row = (state.tables[table] || []).find((r) => String(r.task_id) === id);
      if (row) openDetail(table, row);
    });
    const check = el.querySelector(".ws-task-check");
    check?.addEventListener("click", async () => {
      const { table, id } = el.dataset;
      check.classList.add("spin");
      try {
        await api("toggle", { table, task_id: Number(id) });
        await load();
      } catch (e) {
        toast(e.message);
        check.classList.remove("spin");
      }
    });
    const del = el.querySelector(".ws-task-del");
    del?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const { table, id } = el.dataset;
      try {
        if (table.startsWith("trash_")) await api("purge", { table, task_id: Number(id) });
        else await api("delete", { table, task_id: Number(id) });
        toast(table.startsWith("trash_") ? "Deleted forever" : "Moved to trash");
        if (state.selected?.row?.task_id === Number(id) && state.selected.table === table) closeDetail();
        await load();
      } catch (err) { toast(err.message); }
    });
  });
}

function taskRowHTML({ table, row }) {
  const done = !!row.is_done;
  const isTrash = table.startsWith("trash_");
  const isRepeat = table.includes("repeat");
  const due = row.remind_date ? fmtDate(row.remind_date) : "";
  const bucket = dueBucket(row.remind_date);
  const pri = Number(row.priority_id) || 0;
  const priColor = PRIORITY_COLORS[pri];
  const urlCount = (() => { const p = parseMaybeJSON(row.urls); return Array.isArray(p) ? p.length : (row.urls ? 1 : 0); })();

  const chips = [
    row.subject_id ? `<span class="ws-chip ws-chip-subject">${esc(row.subject_id)}</span>` : "",
    due && !isTrash ? `<span class="ws-chip ws-chip-due ${bucket}">${esc(due)}</span>` : "",
    row.is_homework ? `<span class="ws-chip ws-chip-homework">HW</span>` : "",
  ].join("");

  return `
    <div class="ws-task ${done ? "is-done" : ""} ${isTrash ? "is-trash" : ""}" data-table="${table}" data-id="${row.task_id}">
      <button class="ws-task-check ${done ? "is-done" : ""}" type="button" title="${done ? "Mark as todo" : "Mark as done"}">
        ${done ? "✓" : ""}
      </button>
      <div class="ws-task-main">
        <div class="ws-task-title">${esc(row.title || "Untitled")}</div>
        ${row.text_body ? `<div class="ws-task-sub">${esc(String(row.text_body).slice(0, 90))}${String(row.text_body).length > 90 ? "…" : ""}</div>` : ""}
        <div class="ws-task-meta">
          ${priColor ? `<span class="ws-pri-dot" style="background:${priColor}" title="Priority ${pri}"></span>` : ""}
          ${chips}
          ${isRepeat ? `<span class="ws-chip ws-chip-repeat" title="Recurring${row.frequency ? ` · ${esc(row.frequency)}` : ""}">↻</span>` : ""}
          ${urlCount ? `<span class="ws-chip ws-chip-link">🔗 ${urlCount}</span>` : ""}
        </div>
      </div>
      <button class="ws-icon-btn ws-task-del" type="button" title="${isTrash ? "Delete forever" : "Delete"}">
        ${isTrash ? "🗑" : "⌫"}
      </button>
    </div>`;
}

// ---------- Detail panel ----------
function openDetail(table, row) {
  state.selected = { table, row: { ...row } };
  $("#detailPanel").hidden = false;
  $("#detailPanel").classList.add("is-open");
  renderDetail();
}

function closeDetail() {
  state.selected = null;
  $("#detailPanel").classList.remove("is-open");
  setTimeout(() => { $("#detailPanel").hidden = true; }, 200);
}

function refreshSelected() {
  if (!state.selected) return;
  const fresh = (state.tables[state.selected.table] || []).find((r) => r.task_id === state.selected.row.task_id);
  if (fresh) { state.selected.row = { ...fresh }; renderDetail(); }
  else closeDetail();
}

function renderDetail() {
  const { table, row } = state.selected;
  const isTrash = table.startsWith("trash_");

  $("#dTitle").value = row.title || "";
  $("#dToggleDone").textContent = row.is_done ? "↺" : "✓";
  $("#dToggleDone").classList.toggle("is-done", !!row.is_done);
  $("#dDelete").textContent = isTrash ? "Delete forever" : "Move to trash";
  $("#dDelete").classList.toggle("is-danger", isTrash);

  const badges = [
    table.replace("_", "-"),
    row.is_done ? "done" : "open",
    row.frequency ? `↻ ${row.frequency}` : "",
  ].filter(Boolean);
  $("#dBadges").innerHTML = badges.map((b) => `<span class="ws-badge">${esc(b)}</span>`).join("");

  // Build fields
  const wrap = $("#dFields");
  wrap.innerHTML = SECTIONS.map((sec) => {
    const items = sec.fields.filter((f) => f.key in row).map((f) => fieldHTML(f, row[f.key])).join("");
    return items ? `<div class="ws-dsec"><h3>${sec.title}</h3><div class="ws-dgrid">${items}</div></div>` : "";
  }).join("");
}

function fieldHTML(f, value) {
  const id = `f_${f.key}`;
  let input;
  if (f.type === "textarea") {
    input = `<textarea id="${id}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || "")}" ${f.mono ? 'class="mono"' : ""}>${esc(value ?? "")}</textarea>`;
  } else if (f.type === "checkbox") {
    input = `<label class="ws-check"><input type="checkbox" id="${id}" ${value ? "checked" : ""}><span class="ws-check-ui"></span></label>`;
  } else if (f.type === "select") {
    input = `<select id="${id}">${f.options.map((o, i) => `<option value="${o}" ${String(value ?? "") === String(o) ? "selected" : ""}>${esc(f.labels[i] ?? o)}</option>`).join("")}</select>`;
  } else if (f.type === "datetime") {
    input = `<input type="datetime-local" id="${id}" value="${toLocalInput(value)}">`;
  } else if (f.type === "lines") {
    input = `<textarea id="${id}" rows="3" placeholder="${esc(f.placeholder || "")}">${esc(toLines(value))}</textarea>`;
  } else {
    input = `<input type="${f.type === "number" ? "number" : "text"}" id="${id}" value="${esc(value ?? "")}" placeholder="${esc(f.placeholder || "")}" ${f.type === "number" ? 'step="any"' : ""}>`;
  }
  return `
    <label class="ws-field ${f.type === "checkbox" ? "ws-field-check" : ""}">
      <span class="ws-field-label">${esc(f.label)}</span>
      ${input}
    </label>`;
}

function collectFields() {
  const { row } = state.selected;
  const fields = {};
  for (const sec of SECTIONS) {
    for (const f of sec.fields) {
      if (!(f.key in row)) continue;
      const el = $(`#f_${f.key}`);
      if (!el) continue;
      if (f.type === "checkbox") fields[f.key] = el.checked ? 1 : 0;
      else if (f.type === "number") fields[f.key] = el.value === "" ? null : Number(el.value);
      else if (f.type === "datetime") fields[f.key] = fromLocalInput(el.value);
      else if (f.type === "lines") fields[f.key] = fromLines(el.value);
      else fields[f.key] = el.value;
    }
  }
  fields.title = $("#dTitle").value;
  return fields;
}

// ---------- Events ----------
function bindUI() {
  $("#viewTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".ws-seg");
    if (!btn) return;
    document.querySelectorAll(".ws-seg").forEach((b) => b.dataset.active = b === btn ? "true" : "false");
    state.view = btn.dataset.view;
    closeDetail();
    renderList();
  });

  let searchTimer;
  $("#searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); renderList(); }, 150);
  });

  const quickAdd = async () => {
    const input = $("#quickAddInput");
    const title = input.value.trim();
    if (!title) return;
    input.value = "";
    input.disabled = true;
    try {
      await api("create", { table: "tasks", fields: { title } });
      toast("Task created");
      await load();
    } catch (e) { toast(e.message); input.value = title; }
    input.disabled = false;
    input.focus();
  };
  $("#quickAddBtn").addEventListener("click", quickAdd);
  $("#quickAddInput").addEventListener("keydown", (e) => { if (e.key === "Enter") quickAdd(); });

  $("#dClose").addEventListener("click", closeDetail);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });

  $("#dSave").addEventListener("click", async () => {
    if (!state.selected) return;
    const { table, row } = state.selected;
    const btn = $("#dSave");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await api("update", { table, task_id: row.task_id, fields: collectFields() });
      toast("Saved");
      await load();
    } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = "Save changes";
  });

  $("#dToggleDone").addEventListener("click", async () => {
    if (!state.selected) return;
    const { table, row } = state.selected;
    try {
      await api("toggle", { table, task_id: row.task_id });
      await load();
    } catch (e) { toast(e.message); }
  });

  $("#dDelete").addEventListener("click", async () => {
    if (!state.selected) return;
    const { table, row } = state.selected;
    const isTrash = table.startsWith("trash_");
    try {
      if (isTrash) await api("purge", { table, task_id: row.task_id });
      else await api("delete", { table, task_id: row.task_id });
      toast(isTrash ? "Deleted forever" : "Moved to trash");
      closeDetail();
      await load();
    } catch (e) { toast(e.message); }
  });
}

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove("show"); setTimeout(() => { el.hidden = true; }, 250); }, 2400);
}

// ---------- Init ----------
function init() {
  const now = new Date();
  $("#todayLabel").textContent = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  bindUI();
  load();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
