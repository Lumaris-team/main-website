import { authedFetch, refreshSession, showAuthOverlay } from "/lib/auth.js";
import { openImportModal } from "./import-lesson.js";
import { openActivityRunner, setLearningApi } from "./activity-runner.js";

// ================= API =================
async function apiTasks(action, payload = {}) {
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

async function apiSubjects(action, payload = {}) {
  const res = await authedFetch(`/api/subjects/${action}`, {
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

async function apiLearning(action, payload = {}) {
  const res = await authedFetch(`/api/learning/${action}`, {
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
setLearningApi(apiLearning);

// ================= State =================
const ALL_TABLES = ["tasks", "repeat_tasks", "events", "repeat_events", "trash_tasks", "trash_events"];
const TASK_VIEWS = {
  all: { tables: ["tasks"], title: "Tasks", empty: ["No tasks", "Create your first task."] },
  repeat: { tables: ["repeat_tasks"], title: "Recurring tasks", empty: ["No recurring tasks", "Recurring tasks will appear here."] },
  events: { tables: ["events", "repeat_events"], title: "Events", empty: ["No events", "Events will appear here."] },
  trash: { tables: ["trash_tasks", "trash_events"], title: "Trash", empty: ["Trash is empty", "Deleted items land here."] },
};
const SUBJECT_VIEWS = ["subjects", "subject"];

const state = {
  view: "all",              // tasks section: all|repeat|events|trash — subjects: subjects|subject
  tables: {},
  subjects: [],
  chapters: [],
  meta: {},
  templates: { task: [], subject: [], chapter: [] },
  template: null,           // payload of the selected template (applied on next create)
  currentSubject: null,
  q: "",
  selected: null,            // { kind: "task"|"chapter", table?, row }
};

const section = () => (SUBJECT_VIEWS.includes(state.view) ? "subjects" : "tasks");
const templateKind = () => (state.view === "subject" ? "chapter" : state.view === "subjects" ? "subject" : "task");

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ================= Lookup helpers =================
function lookupOptions(key, idKey, nameKey = "name") {
  return (state.meta[key] || []).map((r) => ({ value: String(r[idKey]), label: r[nameKey] || `#${r[idKey]}` }));
}
const LOOKUP_FIELDS = {
  labels_id: () => lookupOptions("labels", "label_id"),
  flags_id: () => lookupOptions("flags", "flag_id"),
  type_id: () => lookupOptions("types", "type_id"),
  methods_id: () => lookupOptions("methods", "method_id"),
  priority_id: () => lookupOptions("priorities", "priority_id"),
  attention_level_id: () => lookupOptions("attention", "attention_level_id"),
  path: () => (state.meta.folders || []).map((f) => ({ value: f.path, label: f.name ? `${f.name} (${f.path})` : f.path })),
  subject_id: () => state.subjects.map((s) => ({ value: String(s.subject_id), label: s.subject_name || `Subject ${s.subject_id}` })),
  chapter_id: () => state.chapters.map((c) => ({ value: String(c.lesson_id), label: c.lesson_name || `Lesson ${c.lesson_id}` })),
};

// ================= Field definitions =================
// type: text | textarea | number | select | checkbox | datetime | lines | mono
// optionsFrom: key into LOOKUP_FIELDS resolved at render time
const TASK_SECTIONS = [
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
      { key: "subject_id", label: "Subject", type: "select", optionsFrom: "subject_id", placeholder: "—" },
      { key: "chapter_id", label: "Chapter", type: "select", optionsFrom: "chapter_id", placeholder: "—" },
      { key: "chapter_part_id", label: "Chapter part", type: "number" },
      { key: "type_id", label: "Type", type: "select", optionsFrom: "type_id", placeholder: "—" },
      { key: "methods_id", label: "Method", type: "select", optionsFrom: "methods_id", placeholder: "—" },
      { key: "priority_id", label: "Priority", type: "select", optionsFrom: "priority_id", placeholder: "—" },
      { key: "attention_level_id", label: "Attention", type: "select", optionsFrom: "attention_level_id", placeholder: "—" },
      { key: "flags_id", label: "Flag", type: "select", optionsFrom: "flags_id", placeholder: "—" },
      { key: "labels_id", label: "Label", type: "select", optionsFrom: "labels_id", placeholder: "—" },
      { key: "path", label: "Folder", type: "select", optionsFrom: "path", placeholder: "/" },
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
];

const SUBJECT_SECTIONS = [
  {
    title: "Subject",
    fields: [
      { key: "subject_name", label: "Name", type: "text", placeholder: "e.g. Mathematics" },
      { key: "ed_subject_id", label: "ED subject id", type: "number" },
      { key: "ed_subject_code", label: "ED code", type: "text", placeholder: "e.g. MATH" },
      { key: "ed_subject_name", label: "ED name", type: "text" },
      { key: "methods", label: "Methods (JSON ids)", type: "textarea", rows: 2, mono: true },
    ],
  },
  {
    title: "Notes",
    fields: [
      { key: "comments", label: "Comments", type: "textarea", rows: 3 },
      { key: "tests_comments", label: "Tests comments", type: "textarea", rows: 3 },
      { key: "ai_comments", label: "AI comments", type: "textarea", rows: 3 },
    ],
  },
];

const CHAPTER_SECTIONS = [
  {
    title: "Chapter",
    fields: [
      { key: "lesson_name", label: "Name", type: "text", placeholder: "e.g. Chapter 1 — Limits" },
      { key: "lesson_description", label: "Description", type: "textarea", rows: 3 },
      { key: "subject_id", label: "Subject", type: "select", optionsFrom: "subject_id", placeholder: "—" },
      { key: "tests_date", label: "Next test", type: "text", placeholder: "YYYY-MM-DD" },
      { key: "parents_lessons_id", label: "Parent chapters (ids, comma-separated)", type: "text" },
      { key: "childs_lessons_id", label: "Child chapters (ids, comma-separated)", type: "text" },
      { key: "is_method", label: "Is a method/resource", type: "checkbox" },
      { key: "is_yearly", label: "Yearly", type: "checkbox" },
      { key: "methods", label: "Methods (JSON ids)", type: "textarea", rows: 2, mono: true },
    ],
  },
  {
    title: "Course content",
    fields: [
      { key: "body", label: "Course body", type: "textarea", rows: 10, placeholder: "The generated / written course…" },
      { key: "raw_lessons", label: "Raw lessons", type: "textarea", rows: 6, mono: true },
      { key: "raw_recorded_lessons", label: "Raw recorded lessons", type: "textarea", rows: 4, mono: true },
    ],
  },
  {
    title: "AI & tests",
    fields: [
      { key: "flashcards", label: "Flashcards (JSON)", type: "textarea", rows: 4, mono: true },
      { key: "tests", label: "Tests (JSON)", type: "textarea", rows: 4, mono: true },
      { key: "tests_results", label: "Test results (JSON)", type: "textarea", rows: 3, mono: true },
    ],
  },
  {
    title: "Links",
    fields: [
      { key: "linked_files", label: "Linked files", type: "lines", placeholder: "One per line" },
      { key: "linked_quizlets", label: "Linked Quizlets", type: "lines", placeholder: "One URL per line" },
      { key: "linked_websites", label: "Linked websites", type: "lines", placeholder: "One URL per line" },
    ],
  },
  {
    title: "Notes",
    fields: [
      { key: "comments", label: "Comments", type: "textarea", rows: 3 },
      { key: "ai_comments", label: "AI comments", type: "textarea", rows: 3 },
    ],
  },
];

const PRIORITY_COLORS = { 1: "#6ee7a0", 2: "#8cecff", 3: "#fbbf24", 4: "#fb7185" };

// ================= Helpers =================
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
  ["overdue", "Overdue"], ["today", "Today"], ["week", "This week"],
  ["later", "Later"], ["nodate", "No date"], ["done", "Completed"],
];

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return d.toLocaleDateString([], { day: "numeric", month: "short" }) + ` · ${time}`;
}

function subjectName(id) {
  const s = state.subjects.find((x) => String(x.subject_id) === String(id));
  return s?.subject_name || "";
}
function chapterName(id) {
  const c = state.chapters.find((x) => String(x.lesson_id) === String(id));
  return c?.lesson_name || "";
}
function lookupName(key, idKey, id) {
  const row = (state.meta[key] || []).find((r) => String(r[idKey]) === String(id));
  return row?.name || "";
}

// ================= Loading =================
async function loadAll() {
  try {
    const [tasksResp, subjectsResp, metaResp, tplResp] = await Promise.all([
      apiTasks("list", { tables: ALL_TABLES }),
      apiSubjects("list", { all_chapters: true }),
      apiTasks("meta", {}),
      apiTasks("templates", {}),
    ]);
    state.tables = tasksResp?.tables || {};
    state.subjects = subjectsResp?.subjects || [];
    state.chapters = subjectsResp?.chapters || [];
    state.meta = metaResp?.meta || {};
    state.templates = { task: [], subject: [], chapter: [] };
    for (const t of tplResp?.templates || []) {
      if (state.templates[t.kind]) state.templates[t.kind].push(t);
    }
    renderAll();
    if (state.selected) refreshSelected();
  } catch (e) {
    toast(e.message || "Failed to load data");
  }
}

function renderAll() {
  renderChrome();
  renderStats();
  renderContent();
}

function renderChrome() {
  const titles = {
    subjects: "Subjects", subject: state.currentSubject?.subject_name || "Subject",
    all: "Tasks", repeat: "Recurring", events: "Events", trash: "Trash",
  };
  $("#pageTitle").textContent = titles[state.view] || "Workspace";

  // Top-level section tabs (Tasks | Subjects)
  document.querySelectorAll("#sectionTabs .ws-seg").forEach((b) => {
    b.dataset.active = b.dataset.section === section() ? "true" : "false";
  });
  // Task sub-tabs
  const taskTabs = $("#taskTabs");
  const isTasks = section() === "tasks";
  taskTabs.hidden = !isTasks;
  if (isTasks) {
    taskTabs.querySelectorAll(".ws-seg").forEach((b) => {
      b.dataset.active = b.dataset.view === state.view ? "true" : "false";
    });
  }

  // Template selector — kind depends on the current context
  const sel = $("#templateSelect");
  const kind = templateKind();
  const tplList = state.templates[kind] || [];
  const cur = state.template ? tplList.findIndex((t) => JSON.stringify(t.payload) === JSON.stringify(state.template)) : -1;
  sel.innerHTML = `<option value="">Templates…</option>` +
    tplList.map((t, i) => `<option value="${i}" ${i === cur ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  sel.dataset.kind = kind;
  sel.style.display = tplList.length ? "" : "none";

  // Breadcrumb for subject/chapter drill-down
  const bc = $("#breadcrumb");
  if (state.view === "subject" && state.currentSubject) {
    bc.hidden = false;
    bc.innerHTML = `
      <button class="ws-crumb" type="button" data-nav="subjects">Subjects</button>
      <span class="ws-crumb-sep">/</span>
      <span class="ws-crumb-current">${esc(state.currentSubject.subject_name || "Subject")}</span>`;
    bc.querySelector('[data-nav="subjects"]').addEventListener("click", () => {
      state.view = "subjects"; state.currentSubject = null; closeDetail(); renderAll();
    });
  } else {
    bc.hidden = true;
  }

  // Contextual primary actions visibility
  const showQuickAdd = isTasks && state.view !== "trash";
  $("#quickAddRow").style.display = showQuickAdd ? "" : "none";
  $("#quickAddInput").placeholder = state.view === "repeat" ? "Add a recurring task…" : state.view === "events" ? "Add an event…" : "Add a task…  (Enter)";
  $("#newBtn").textContent = state.view === "subject" ? "+ Chapter" : state.view === "subjects" ? "+ Subject" : "+ New";
  $("#newBtn").style.display = state.view === "trash" ? "none" : "";
}

// ================= Stats =================
function renderStats() {
  const tasks = state.tables.tasks || [];
  const pending = tasks.filter((t) => !t.is_done);
  const today = pending.filter((t) => dueBucket(t.remind_date) === "today").length;
  const overdue = pending.filter((t) => dueBucket(t.remind_date) === "overdue").length;
  const trash = (state.tables.trash_tasks || []).length + (state.tables.trash_events || []).length;
  let html;
  if (state.view === "subjects") {
    const chapters = state.chapters.length;
    html = [[state.subjects.length, "subjects"], [chapters, "chapters"]];
  } else if (state.view === "subject" && state.currentSubject) {
    const chs = chaptersOf(state.currentSubject.subject_id);
    html = [[chs.length, "chapters"], [chs.filter((c) => c.body).length, "with course"]];
  } else {
    const repeat = (state.tables.repeat_tasks || []).length + (state.tables.repeat_events || []).length;
    html = [[pending.length, "open"], [today, "today"], [overdue, "overdue"], [repeat, "recurring"], [trash, "trash"]];
  }
  $("#statsBar").innerHTML = html.map(([n, l]) => `<span class="ws-stat"><b>${n}</b>${l}</span>`).join("");
}

// ================= Content router =================
function renderContent() {
  $("#taskGroups").innerHTML = "";
  $("#subjectGrid").hidden = state.view !== "subjects";
  if (state.view === "subjects") return renderSubjects();
  if (state.view === "subject") return renderSubjectDetail();
  return renderTaskGroups();
}

function matchesQText(...vals) {
  if (!state.q) return true;
  const q = state.q.toLowerCase();
  return vals.some((v) => String(v ?? "").toLowerCase().includes(q));
}

// ================= Subjects =================
function chaptersOf(subjectId) {
  return state.chapters.filter((c) => String(c.subject_id) === String(subjectId));
}

function renderSubjects() {
  const grid = $("#subjectGrid");
  const list = state.subjects.filter((s) => matchesQText(s.subject_name, s.ed_subject_code, s.ed_subject_name));
  if (!list.length) return showEmpty("No subjects", "Create your first subject with “+ Subject”.");
  grid.innerHTML = list.map((s) => {
    const chs = chaptersOf(s.subject_id);
    const withBody = chs.filter((c) => c.body).length;
    return `
      <button class="ws-subject-card" type="button" data-id="${s.subject_id}">
        <div class="ws-subject-top">
          <span class="ws-subject-initial">${esc((s.subject_name || "?").trim().charAt(0).toUpperCase())}</span>
          <div class="ws-subject-head">
            <span class="ws-subject-name">${esc(s.subject_name || "Untitled")}</span>
            ${s.ed_subject_code ? `<span class="ws-chip ws-chip-subject">${esc(s.ed_subject_code)}</span>` : ""}
          </div>
          <span class="ws-icon-btn ws-subject-edit" title="Edit subject">✎</span>
        </div>
        ${s.ed_subject_name ? `<div class="ws-subject-ed">ED · ${esc(s.ed_subject_name)}</div>` : ""}
        <div class="ws-subject-foot">
          <span class="ws-chip">${chs.length} chapter${chs.length > 1 ? "s" : ""}</span>
          <span class="ws-chip">${withBody} course${withBody > 1 ? "s" : ""}</span>
        </div>
      </button>`;
  }).join("");

  grid.querySelectorAll(".ws-subject-card").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".ws-subject-edit")) {
        e.stopPropagation();
        const s = state.subjects.find((x) => String(x.subject_id) === el.dataset.id);
        if (s) openEntityModal("subject", s.subject_id, s);
        return;
      }
      const s = state.subjects.find((x) => String(x.subject_id) === el.dataset.id);
      if (s) {
        state.currentSubject = s;
        state.view = "subject";
        state.template = null;
        closeDetail();
        renderAll();
      }
    });
  });
}

function renderSubjectDetail() {
  const s = state.currentSubject;
  const chs = chaptersOf(s.subject_id).filter((c) => matchesQText(c.lesson_name, c.lesson_description));
  const host = $("#taskGroups");
  if (!chs.length) return showEmpty("No chapters", "Add your first chapter with “+ Chapter”.");

  host.innerHTML = `
    <div class="ws-group">
      <div class="ws-group-head"><span>Chapters</span><span class="ws-group-count">${chs.length}</span></div>
      <div class="ws-group-items">
        ${chs.map((c) => chapterRowHTML(c)).join("")}
      </div>
    </div>`;

  host.querySelectorAll(".ws-task").forEach((el) => {
    el.addEventListener("click", () => {
      const c = state.chapters.find((x) => String(x.lesson_id) === el.dataset.id);
      if (c) openDetail({ kind: "chapter", row: { ...c } });
    });
    const del = el.querySelector(".ws-task-del");
    del?.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await apiSubjects("delete-chapter", { lesson_id: Number(el.dataset.id) });
        toast("Chapter deleted");
        await loadAll();
      } catch (err) { toast(err.message); }
    });
  });
}

function chapterRowHTML(c) {
  const hasBody = !!(c.body && String(c.body).trim());
  const hasFlash = !!(c.flashcards && String(c.flashcards).trim() && c.flashcards !== "[]");
  const chips = [
    c.is_method ? `<span class="ws-chip ws-chip-method">method</span>` : "",
    c.is_yearly ? `<span class="ws-chip">yearly</span>` : "",
    c.tests_date ? `<span class="ws-chip ws-chip-due">test ${esc(c.tests_date)}</span>` : "",
    hasBody ? `<span class="ws-chip ws-chip-course">course ✓</span>` : `<span class="ws-chip">no course</span>`,
    hasFlash ? `<span class="ws-chip ws-chip-flash">flashcards</span>` : "",
  ].join("");
  return `
    <div class="ws-task ws-chapter" data-id="${c.lesson_id}">
      <div class="ws-task-main">
        <div class="ws-task-title">${esc(c.lesson_name || "Untitled")}</div>
        ${c.lesson_description ? `<div class="ws-task-sub">${esc(String(c.lesson_description).slice(0, 110))}${String(c.lesson_description).length > 110 ? "…" : ""}</div>` : ""}
        <div class="ws-task-meta">${chips}</div>
      </div>
      <button class="ws-icon-btn ws-task-del" type="button" title="Delete chapter">🗑</button>
    </div>`;
}

// ================= Task views =================
function rowsForView() {
  const view = TASK_VIEWS[state.view];
  if (!view) return [];
  const rows = [];
  for (const t of view.tables) {
    for (const row of state.tables[t] || []) {
      if (!matchesQText(row.title, row.text_body, row.subject_id ? subjectName(row.subject_id) : "", row.path, row.comments)) continue;
      rows.push({ table: t, row });
    }
  }
  return rows;
}

function renderTaskGroups() {
  const groupsEl = $("#taskGroups");
  const rows = rowsForView();
  if (!rows.length) {
    const [t, s] = TASK_VIEWS[state.view].empty;
    return showEmpty(state.q ? "No results" : t, state.q ? `Nothing matches “${state.q}”.` : s);
  }

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

  const order = state.view === "repeat"
    ? [...groups.keys()].sort()
    : state.view === "trash" ? ["trash"] : GROUP_DEFS.map(([k]) => k);

  groupsEl.innerHTML = order.filter((k) => groups.has(k)).map((k) => {
    const items = groups.get(k);
    const label = state.view === "repeat" ? `Repeats · ${k}` : state.view === "trash" ? "Recently deleted" : (GROUP_DEFS.find(([g]) => g === k)?.[1] || k);
    return `
      <div class="ws-group">
        <div class="ws-group-head"><span>${esc(label)}</span><span class="ws-group-count">${items.length}</span></div>
        <div class="ws-group-items">${items.map((it) => taskRowHTML(it)).join("")}</div>
      </div>`;
  }).join("");

  groupsEl.querySelectorAll(".ws-task").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".ws-task-check")) return;
      const { table, id } = el.dataset;
      const row = (state.tables[table] || []).find((r) => String(r.task_id) === id);
      if (row) openDetail({ kind: "task", table, row: { ...row } });
    });
    const check = el.querySelector(".ws-task-check");
    check?.addEventListener("click", async () => {
      const { table, id } = el.dataset;
      check.classList.add("spin");
      try { await apiTasks("toggle", { table, task_id: Number(id) }); await loadAll(); }
      catch (e) { toast(e.message); check.classList.remove("spin"); }
    });
    const del = el.querySelector(".ws-task-del");
    del?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const { table, id } = el.dataset;
      try {
        if (table.startsWith("trash_")) await apiTasks("purge", { table, task_id: Number(id) });
        else await apiTasks("delete", { table, task_id: Number(id) });
        toast(table.startsWith("trash_") ? "Deleted forever" : "Moved to trash");
        if (state.selected?.kind === "task" && state.selected.table === table && String(state.selected.row.task_id) === id) closeDetail();
        await loadAll();
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
  const priColor = PRIORITY_COLORS[pri] || lookupColor("priorities", "priority_id", pri);
  const subName = row.subject_id ? subjectName(row.subject_id) : "";
  const urlCount = (() => { const p = parseMaybeJSON(row.urls); return Array.isArray(p) ? p.length : (row.urls ? 1 : 0); })();

  const chips = [
    subName ? `<span class="ws-chip ws-chip-subject">${esc(subName)}</span>` : "",
    due && !isTrash ? `<span class="ws-chip ws-chip-due ${bucket}">${esc(due)}</span>` : "",
    row.is_homework ? `<span class="ws-chip ws-chip-homework">HW</span>` : "",
  ].join("");

  return `
    <div class="ws-task ${done ? "is-done" : ""} ${isTrash ? "is-trash" : ""}" data-table="${table}" data-id="${row.task_id}">
      <button class="ws-task-check ${done ? "is-done" : ""}" type="button" title="${done ? "Mark as todo" : "Mark as done"}">${done ? "✓" : ""}</button>
      <div class="ws-task-main">
        <div class="ws-task-title">${esc(row.title || "Untitled")}</div>
        ${row.text_body ? `<div class="ws-task-sub">${esc(String(row.text_body).slice(0, 90))}${String(row.text_body).length > 90 ? "…" : ""}</div>` : ""}
        <div class="ws-task-meta">
          ${priColor ? `<span class="ws-pri-dot" style="background:${priColor}" title="Priority"></span>` : ""}
          ${chips}
          ${isRepeat ? `<span class="ws-chip ws-chip-repeat" title="Recurring${row.frequency ? ` · ${esc(row.frequency)}` : ""}">↻</span>` : ""}
          ${urlCount ? `<span class="ws-chip ws-chip-link">🔗 ${urlCount}</span>` : ""}
        </div>
      </div>
      <button class="ws-icon-btn ws-task-del" type="button" title="${isTrash ? "Delete forever" : "Delete"}">${isTrash ? "🗑" : "⌫"}</button>
    </div>`;
}

function lookupColor(key, idKey, id) {
  const row = (state.meta[key] || []).find((r) => String(r[idKey]) === String(id));
  return row?.color || "";
}

// ================= Detail panel =================
function openDetail(sel) {
  state.selected = sel;
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
  const sel = state.selected;
  if (sel.kind === "task") {
    const fresh = (state.tables[sel.table] || []).find((r) => r.task_id === sel.row.task_id);
    if (fresh) { sel.row = { ...fresh }; renderDetail(); } else closeDetail();
  } else if (sel.kind === "chapter") {
    const fresh = state.chapters.find((r) => r.lesson_id === sel.row.lesson_id);
    if (fresh) { sel.row = { ...fresh }; renderDetail(); } else closeDetail();
  }
}

function detailConfig() {
  const sel = state.selected;
  if (sel.kind === "task") {
    const isTrash = sel.table.startsWith("trash_");
    return {
      titleKey: "title",
      sections: TASK_SECTIONS,
      isDone: !!sel.row.is_done,
      isTrash,
      deleteLabel: isTrash ? "Delete forever" : "Move to trash",
      badges: [sel.table.replace("_", "-"), sel.row.is_done ? "done" : "open", sel.row.frequency ? `↻ ${sel.row.frequency}` : ""].filter(Boolean),
    };
  }
  // chapter
  const c = sel.row;
  const badges = [
    c.is_method ? "method" : "", c.is_yearly ? "yearly" : "",
    c.body ? "course ✓" : "no course",
    c.flashcards && c.flashcards !== "[]" ? "flashcards" : "",
  ].filter(Boolean);
  return {
    titleKey: "lesson_name",
    hideKeys: ["lesson_name"],
    sections: CHAPTER_SECTIONS,
    isDone: false,
    isTrash: false,
    showDoneToggle: false,
    deleteLabel: "Delete chapter",
    badges,
    tools: true,
  };
}

function renderDetail() {
  const sel = state.selected;
  const cfg = detailConfig();
  const row = sel.row;

  $("#dTitle").value = row[cfg.titleKey] || "";
  const doneBtn = $("#dToggleDone");
  doneBtn.style.display = cfg.showDoneToggle === false ? "none" : "";
  doneBtn.textContent = row.is_done ? "↺" : "✓";
  doneBtn.classList.toggle("is-done", !!row.is_done);
  $("#dDelete").textContent = cfg.deleteLabel;
  $("#dDelete").classList.toggle("is-danger", cfg.isTrash);
  $("#dBadges").innerHTML = cfg.badges.map((b) => `<span class="ws-badge">${esc(b)}</span>`).join("");

  const wrap = $("#dFields");
  let html = cfg.sections.map((sec) => {
    const items = sec.fields.filter((f) => f.key in row && !(cfg.hideKeys || []).includes(f.key)).map((f) => fieldHTML(f, row[f.key])).join("");
    return items ? `<div class="ws-dsec"><h3>${sec.title}</h3><div class="ws-dgrid">${items}</div></div>` : "";
  }).join("");

  if (cfg.tools) {
    const activities = parseMaybeJSON(row.tests);
    const actList = Array.isArray(activities?.activities) ? activities.activities : [];
    html += `
      <div class="ws-dsec">
        <h3>Import lesson</h3>
        <div class="ws-tools">
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="pdf">📄 PDF</button>
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="voice">🎙 Voice</button>
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="files">📁 Files</button>
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="photo">📷 Camera + OCR</button>
        </div>
        <p class="ws-tools-hint">All extraction runs locally in your browser (pdf.js, Web Speech, Tesseract OCR).</p>
      </div>
      <div class="ws-dsec">
        <h3>AI generation</h3>
        <div class="ws-tools">
          <button class="ws-btn ws-btn-primary" type="button" data-tool="course">✨ Generate course</button>
          <button class="ws-btn ws-btn-primary" type="button" data-tool="flashcards">✨ Generate flashcards</button>
          <button class="ws-btn ws-btn-primary" type="button" data-tool="activities">✨ Generate activities</button>
          ${actList.length ? `<button class="ws-btn ws-btn-ghost" type="button" data-tool="run">▶ Run activities (${actList.length})</button>` : ""}
        </div>
        <p class="ws-tools-hint">GPT OSS 120B via Workers AI — the course is built section by section and can be resumed anytime.</p>
      </div>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => onChapterTool(b.dataset.tool, sel.row)));
    return;
  }
  wrap.innerHTML = html;
}

function fieldHTML(f, value) {
  const id = `f_${f.key}`;
  const opts = f.optionsFrom ? (LOOKUP_FIELDS[f.optionsFrom]?.() || []) : (f.options || []);
  let input;
  if (f.type === "textarea") {
    input = `<textarea id="${id}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || "")}" ${f.mono ? 'class="mono"' : ""}>${esc(value ?? "")}</textarea>`;
  } else if (f.type === "checkbox") {
    input = `<label class="ws-check"><input type="checkbox" id="${id}" ${value ? "checked" : ""}><span class="ws-check-ui"></span></label>`;
  } else if (f.type === "select") {
    const hasEmpty = f.placeholder !== undefined || opts.length === 0;
    input = `<select id="${id}">${hasEmpty ? `<option value="">${esc(f.placeholder || "—")}</option>` : ""}${opts.map((o) => `<option value="${esc(o.value)}" ${String(value ?? "") === String(o.value) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
  } else if (f.type === "datetime") {
    input = `<input type="datetime-local" id="${id}" value="${toLocalInput(value)}">`;
  } else if (f.type === "lines") {
    input = `<textarea id="${id}" rows="3" placeholder="${esc(f.placeholder || "")}">${esc(toLines(value))}</textarea>`;
  } else {
    input = `<input type="${f.type === "number" ? "number" : "text"}" id="${id}" value="${esc(value ?? "")}" placeholder="${esc(f.placeholder || "")}" ${f.type === "number" ? 'step="any"' : ""}>`;
  }
  return `
    <label class="ws-field ${f.type === "checkbox" ? "ws-field-check" : ""} ${f.type === "textarea" || f.type === "lines" ? "ws-field-wide" : ""}">
      <span class="ws-field-label">${esc(f.label)}</span>
      ${input}
    </label>`;
}

function collectFields(sections, titleKey, titleEl, root = document) {
  const fields = {};
  for (const sec of sections) {
    for (const f of sec.fields) {
      const el = root.querySelector(`[id="f_${f.key}"]`);
      if (!el) continue;
      if (f.type === "checkbox") fields[f.key] = el.checked ? 1 : 0;
      else if (f.type === "number") fields[f.key] = el.value === "" ? null : Number(el.value);
      else if (f.type === "datetime") fields[f.key] = fromLocalInput(el.value);
      else if (f.type === "lines") fields[f.key] = fromLines(el.value);
      else if (f.type === "select") fields[f.key] = el.value === "" ? (f.key === "path" ? "/" : null) : el.value;
      else fields[f.key] = el.value;
    }
  }
  if (titleKey && titleEl) fields[titleKey] = titleEl.value;
  return fields;
}

// ================= Creation / edit modal =================
// opts: { fullscreen, table (task), template }
function openEntityModal(kind, id = null, existing = null, opts = {}) {
  const defs = {
    task: { title: id ? "Edit task" : "New task", sections: TASK_SECTIONS, titleKey: "title", submit: "Create task" },
    subject: { title: id ? "Edit subject" : "New subject", sections: SUBJECT_SECTIONS, titleKey: null, submit: "Create subject" },
    chapter: { title: id ? "Edit chapter" : "New chapter", sections: CHAPTER_SECTIONS, titleKey: null, submit: "Create chapter" },
  }[kind];
  if (!defs) return;

  const root = $("#modalRoot");
  root.hidden = false;

  // Template defaults apply only on creation; existing values always win.
  const values = { ...(opts.template || state.template || {}), ...(existing || {}) };
  delete values.task_id; delete values.lesson_id;
  if (kind === "chapter" && !values.subject_id && state.currentSubject) values.subject_id = state.currentSubject.subject_id;

  const bodyHtml = defs.sections.map((sec) => {
    const items = sec.fields.map((f) => fieldHTML(f, values[f.key])).join("");
    return `<div class="ws-dsec"><h3>${sec.title}</h3><div class="ws-dgrid">${items}</div></div>`;
  }).join("");

  root.innerHTML = `
    <div class="ws-modal-backdrop">
      <div class="ws-modal ws-modal-form ${opts.fullscreen ? "ws-modal-full" : ""}" role="dialog" aria-modal="true">
        <div class="ws-modal-head">
          <h2>${defs.title}</h2>
          <button class="ws-icon-btn" type="button" data-close>✕</button>
        </div>
        <div class="ws-modal-body">
          ${kind === "task" ? `<label class="ws-field ws-field-wide"><span class="ws-field-label">Title</span><input type="text" id="m_title" value="${esc(values.title || "")}" placeholder="Task title"></label>` : ""}
          ${bodyHtml}
        </div>
        <div class="ws-modal-foot">
          <button class="ws-btn ws-btn-ghost" type="button" data-save-tpl title="Save current values as a reusable template">⬒ Save as template</button>
          <span class="ws-modal-foot-spacer"></span>
          <button class="ws-btn ws-btn-ghost" type="button" data-close>Cancel</button>
          <button class="ws-btn ws-btn-primary" type="button" data-submit>${defs.submit}</button>
        </div>
      </div>
    </div>`;

  const close = () => { root.hidden = true; root.innerHTML = ""; };
  root.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  root.querySelector(".ws-modal-backdrop").addEventListener("click", (e) => { if (e.target.classList.contains("ws-modal-backdrop")) close(); });

  const collect = () => collectFields(defs.sections, kind === "task" ? "title" : null, kind === "task" ? root.querySelector("#m_title") : null, root.querySelector(".ws-modal"));

  root.querySelector("[data-save-tpl]").addEventListener("click", async () => {
    const fields = collect();
    const name = prompt("Template name:", kind === "task" ? (fields.title || "Task template") : `${kind} template`);
    if (!name?.trim()) return;
    try {
      await apiTasks("template-save", { kind, name: name.trim(), payload: fields });
      toast("Template saved");
      await loadAll();
    } catch (e) { toast(e.message); }
  });

  root.querySelector("[data-submit]").addEventListener("click", async () => {
    const btn = root.querySelector("[data-submit]");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const fields = collect();
      if (kind === "task") {
        const table = opts.table || (state.view === "repeat" ? "repeat_tasks" : state.view === "events" ? "events" : "tasks");
        if (id) await apiTasks("update", { table, task_id: id, fields });
        else await apiTasks("create", { table, fields });
      } else if (kind === "subject") {
        if (id) await apiSubjects("update-subject", { subject_id: id, fields });
        else await apiSubjects("create-subject", { fields });
      } else if (kind === "chapter") {
        if (!fields.subject_id && state.currentSubject) fields.subject_id = state.currentSubject.subject_id;
        if (id) await apiSubjects("update-chapter", { lesson_id: id, fields });
        else await apiSubjects("create-chapter", { fields });
      }
      state.template = null;
      $("#templateSelect").value = "";
      toast(id ? "Saved" : "Created");
      close();
      await loadAll();
    } catch (e) {
      toast(e.message);
      btn.disabled = false; btn.textContent = defs.submit;
    }
  });
}

// ================= Chapter tools: import & AI =================
function onChapterTool(tool, chapter) {
  const lessonId = chapter.lesson_id;
  const tabs = { pdf: "pdf", voice: "voice", files: "files", photo: "camera" };
  if (tabs[tool]) {
    openImportModal({
      initialTab: tabs[tool],
      onImport: async (target, text) => {
        const cur = chapter[target] || "";
        await apiSubjects("update-chapter", {
          lesson_id: lessonId,
          fields: { [target]: cur ? `${cur}\n\n${text}` : text },
        });
        toast("Lesson content imported");
        await loadAll();
      },
    });
    return;
  }
  if (tool === "course") return runCourseGeneration(lessonId);
  if (tool === "flashcards") return runFlashcards(lessonId);
  if (tool === "activities") return runActivities(lessonId);
  if (tool === "run") {
    const parsed = parseMaybeJSON(chapter.tests);
    const list = Array.isArray(parsed?.activities) ? parsed.activities : [];
    if (list.length) openActivityRunner(list, { onClose: () => {} });
  }
}

// ---------- Course generation (resumable, section by section) ----------
function openGenModal(title) {
  const root = document.getElementById("modalRoot");
  root.hidden = false;
  root.innerHTML = `
    <div class="ws-modal-backdrop">
      <div class="ws-modal ws-gen-modal" role="dialog" aria-modal="true">
        <div class="ws-modal-head"><h2>${esc(title)}</h2></div>
        <div class="ws-modal-body"><div class="ws-gen-list" data-list></div><div class="ws-gen-status" data-status></div></div>
        <div class="ws-modal-foot"><button class="ws-btn ws-btn-ghost" type="button" data-close>Close</button></div>
      </div>
    </div>`;
  const close = () => { root.hidden = true; root.innerHTML = ""; };
  root.querySelector("[data-close]").addEventListener("click", close);
  root.querySelector(".ws-modal-backdrop").addEventListener("click", (e) => { if (e.target.classList.contains("ws-modal-backdrop")) close(); });
  return {
    list: root.querySelector("[data-list]"),
    status: root.querySelector("[data-status]"),
    setSections(sections, done) {
      this.list.innerHTML = sections.map((s, i) => `
        <div class="ws-gen-item" data-i="${i}">
          <span class="ws-gen-dot" data-dot></span>
          <span class="ws-gen-name">${esc(s.title || `Section ${i + 1}`)}</span>
          <span class="ws-gen-state" data-state>${done?.[i] ? "done" : "…"}</span>
        </div>`).join("");
    },
    setItem(i, stateName) {
      const item = this.list.querySelector(`[data-i="${i}"]`);
      if (!item) return;
      item.querySelector("[data-state]").textContent = stateName;
      item.querySelector("[data-dot]").className = `ws-gen-dot ${stateName === "done" ? "ok" : stateName === "error" ? "err" : "run"}`;
    },
    setStatus(t) { this.status.textContent = t; },
  };
}

async function runCourseGeneration(lessonId) {
  const modal = openGenModal("Generating course…");
  try {
    // Resume an unfinished job if one exists
    let jobId, outline, done;
    const st = await apiLearning("course-status", { lesson_id: lessonId });
    if (st.job && st.job.status !== "done" && st.job.payload?.outline) {
      jobId = st.job.job_id;
      const p = typeof st.job.payload === "string" ? JSON.parse(st.job.payload) : st.job.payload;
      outline = p.outline; done = p.done || outline.map(() => false);
      modal.setStatus("Resuming previous generation…");
    } else {
      modal.setStatus("Planning the course outline…");
      const plan = await apiLearning("course-plan", { lesson_id: lessonId });
      jobId = plan.job_id; outline = plan.outline; done = outline.map(() => false);
    }
    modal.setSections(outline, done);

    for (let i = 0; i < outline.length; i++) {
      if (done[i]) { modal.setItem(i, "done"); continue; }
      modal.setItem(i, "writing…");
      modal.setStatus(`Section ${i + 1}/${outline.length} — ${outline[i].title || ""}`);
      try {
        const r = await apiLearning("course-section", { job_id: jobId, index: i });
        done[i] = true;
        modal.setItem(i, "done");
        if (r.status === "done") break;
      } catch (e) {
        modal.setItem(i, "error");
        modal.setStatus(`Section ${i + 1} failed: ${e.message} — reopen this panel to retry.`);
        return;
      }
    }
    modal.setStatus("Course complete — body updated.");
    toast("Course generated");
    await loadAll();
  } catch (e) {
    modal.setStatus(`Error: ${e.message}`);
    toast(e.message);
  }
}

async function runFlashcards(lessonId) {
  toast("Generating flashcards… this may take a minute");
  try {
    const r = await apiLearning("flashcards", { lesson_id: lessonId });
    toast(`${r.count} flashcards generated`);
    await loadAll();
  } catch (e) { toast(e.message); }
}

async function runActivities(lessonId) {
  toast("Generating activities… this may take a minute");
  try {
    const r = await apiLearning("activities", { lesson_id: lessonId, count: 10 });
    toast(`${r.count} activities generated (${(r.components || []).join(", ")})`);
    await loadAll();
  } catch (e) { toast(e.message); }
}

// ================= UI events =================
function bindUI() {
  $("#sectionTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".ws-seg");
    if (!btn) return;
    state.view = btn.dataset.section === "subjects" ? "subjects" : "all";
    state.currentSubject = null;
    state.template = null;
    closeDetail();
    renderAll();
  });

  $("#taskTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".ws-seg");
    if (!btn) return;
    state.view = btn.dataset.view;
    closeDetail();
    renderAll();
  });

  $("#templateSelect").addEventListener("change", (e) => {
    const kind = e.target.dataset.kind;
    const idx = Number(e.target.value);
    const tpl = Number.isInteger(idx) && idx >= 0 ? state.templates[kind]?.[idx] : null;
    state.template = tpl ? tpl.payload : null;
    toast(tpl ? `Template “${tpl.name}” will be applied` : "Template cleared");
  });

  $("#refreshBtn").addEventListener("click", async () => {
    const btn = $("#refreshBtn");
    btn.classList.add("spin");
    try {
      const ok = await refreshSession();
      if (!ok) { showAuthOverlay(); return; }
      await loadAll();
      toast("Session refreshed");
    } catch (e) { toast(e.message); }
    btn.classList.remove("spin");
  });

  let searchTimer;
  $("#searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); renderContent(); renderStats(); }, 150);
  });

  const quickAdd = async () => {
    const input = $("#quickAddInput");
    const title = input.value.trim();
    if (!title) return;
    input.value = "";
    input.disabled = true;
    try {
      const table = state.view === "repeat" ? "repeat_tasks" : state.view === "events" ? "events" : "tasks";
      await apiTasks("create", { table, fields: { title } });
      toast("Created");
      await loadAll();
    } catch (e) { toast(e.message); input.value = title; }
    input.disabled = false;
    input.focus();
  };
  $("#quickAddBtn").addEventListener("click", quickAdd);
  $("#quickAddInput").addEventListener("keydown", (e) => { if (e.key === "Enter") quickAdd(); });

  $("#newBtn").addEventListener("click", () => {
    if (state.view === "subjects") return openEntityModal("subject", null, null, { template: state.template });
    if (state.view === "subject") return openEntityModal("chapter", null, state.currentSubject ? { subject_id: state.currentSubject.subject_id } : null, { template: state.template });
    if (["all", "repeat", "events"].includes(state.view)) return openEntityModal("task", null, null, { template: state.template });
  });

  $("#dClose").addEventListener("click", closeDetail);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const root = $("#modalRoot");
    if (!root.hidden) { root.hidden = true; root.innerHTML = ""; }
    else closeDetail();
  });

  $("#dEdit").addEventListener("click", () => {
    const sel = state.selected;
    if (!sel) return;
    if (sel.kind === "task") openEntityModal("task", sel.row.task_id, sel.row, { table: sel.table });
    else if (sel.kind === "chapter") openEntityModal("chapter", sel.row.lesson_id, sel.row);
  });

  $("#dExpand").addEventListener("click", () => {
    const sel = state.selected;
    if (!sel) return;
    if (sel.kind === "task") openEntityModal("task", sel.row.task_id, sel.row, { table: sel.table, fullscreen: true });
    else if (sel.kind === "chapter") openEntityModal("chapter", sel.row.lesson_id, sel.row, { fullscreen: true });
  });

  $("#dSave").addEventListener("click", async () => {
    const sel = state.selected;
    if (!sel) return;
    const btn = $("#dSave");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const cfg = detailConfig();
      const fields = collectFields(cfg.sections, cfg.titleKey, document.getElementById("dTitle"), document.getElementById("detailPanel"));
      if (sel.kind === "task") await apiTasks("update", { table: sel.table, task_id: sel.row.task_id, fields });
      else await apiSubjects("update-chapter", { lesson_id: sel.row.lesson_id, fields });
      toast("Saved");
      await loadAll();
    } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = "Save changes";
  });

  $("#dToggleDone").addEventListener("click", async () => {
    const sel = state.selected;
    if (!sel || sel.kind !== "task") return;
    try { await apiTasks("toggle", { table: sel.table, task_id: sel.row.task_id }); await loadAll(); }
    catch (e) { toast(e.message); }
  });

  $("#dDelete").addEventListener("click", async () => {
    const sel = state.selected;
    if (!sel) return;
    try {
      if (sel.kind === "chapter") {
        await apiSubjects("delete-chapter", { lesson_id: sel.row.lesson_id });
        toast("Chapter deleted");
      } else {
        const isTrash = sel.table.startsWith("trash_");
        if (isTrash) await apiTasks("purge", { table: sel.table, task_id: sel.row.task_id });
        else await apiTasks("delete", { table: sel.table, task_id: sel.row.task_id });
        toast(isTrash ? "Deleted forever" : "Moved to trash");
      }
      closeDetail();
      await loadAll();
    } catch (e) { toast(e.message); }
  });
}

function showEmpty(title, sub) {
  $("#taskGroups").innerHTML = "";
  $("#subjectGrid").hidden = true;
  const el = $("#emptyState");
  el.hidden = false;
  $("#emptyTitle").textContent = title;
  $("#emptySub").textContent = sub;
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

function init() {
  const now = new Date();
  $("#todayLabel").textContent = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  bindUI();
  loadAll();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
