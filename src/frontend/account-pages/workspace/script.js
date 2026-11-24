import { authedFetch, refreshSession, showAuthOverlay } from "/lib/auth.js";
import { openImportModal } from "./import-lesson.js";
import { openActivityRunner, setLearningApi } from "./activity-runner.js";
import {
  setChapterApi, openCreateChooser, confirmGenerate, openReviewMenu,
  openFlashcardReview, openSpacedReview, openAskAI, toggleEvaluation, estimateMinutes,
  openTestSimulation,
} from "./chapter-tools.js";

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
setChapterApi({
  apiSubjects,
  apiLearning,
  toast,
  reload: () => loadAll(),
  onRunTest: (activities, chapter, cfg = {}) => {
    openActivityRunner(activities, {
      test: {
        lessonId: chapter.lesson_id,
        chapterName: chapter.lesson_name,
        notation: cfg.notation || 20,
        maxMinutes: cfg.maxMinutes || null,
        onDone: (res) => saveTestResult(chapter, res),
      },
    });
  },
});

// Persist a finished test simulation into chapters.tests_results.
async function saveTestResult(chapter, res) {
  try {
    const prev = parseMaybeJSON(chapter.tests_results);
    const arr = Array.isArray(prev) ? prev : (Array.isArray(prev?.results) ? prev.results : []);
    arr.push({
      date: new Date().toISOString(),
      notation: res.notation, grade: res.grade, pct: +res.pct.toFixed(1),
      correct: res.correctCount, total: res.total, answered: res.answeredCount,
      elapsed_min: +res.elapsedMin.toFixed(1), remark: res.remark || "",
    });
    await apiSubjects("update-chapter", { lesson_id: chapter.lesson_id, fields: { tests_results: JSON.stringify(arr) } });
    toast(`Test enregistré — ${res.grade}/${res.notation}`);
    await loadAll();
  } catch (e) { toast(e.message); }
}

// ================= State =================
const ALL_TABLES = ["tasks", "repeat_tasks", "events", "repeat_events", "trash_tasks", "trash_events"];
const TASK_VIEWS = {
  all: { tables: ["tasks", "events", "repeat_tasks", "repeat_events"], title: "Toutes", empty: ["Rien ici", "Créez votre première tâche ou événement."] },
  recurring: { tables: ["repeat_tasks", "repeat_events"], title: "Récurrentes", empty: ["Aucun élément récurrent", "Les tâches et événements récurrents apparaîtront ici."] },
  events: { tables: ["events", "repeat_events"], title: "Événements", empty: ["Aucun événement", "Les événements apparaîtront ici."] },
  trash: { tables: ["trash_tasks", "trash_events"], title: "Corbeille", empty: ["Corbeille vide", "Les éléments supprimés arrivent ici."] },
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

// Chapter actions a task can be linked to — values match onChapterTool() keys.
const LINKED_ACTIONS = [
  { value: "import", label: "Importer une leçon" },
  { value: "course", label: "Générer le cours" },
  { value: "flashcards", label: "Flashcards" },
  { value: "activities", label: "Activités / tests" },
  { value: "review", label: "Révision" },
  { value: "ask", label: "Poser une question IA" },
  { value: "edit", label: "Modifier le cours" },
  { value: "eval", label: "Évaluation" },
];

// ================= Field definitions =================
// type: text | textarea | number | select | checkbox | datetime | lines | mono
// optionsFrom: key into LOOKUP_FIELDS resolved at render time
const TASK_SECTIONS = [
  {
    title: "Contenu",
    fields: [
      { key: "text_body", label: "Corps", type: "textarea", rows: 5, placeholder: "Détails, instructions…" },
      { key: "steps", label: "Étapes", type: "textarea", rows: 3, placeholder: "Une étape par ligne, ou JSON" },
    ],
  },
  {
    title: "Organisation",
    fields: [
      { key: "subject_id", label: "Matière", type: "select", optionsFrom: "subject_id", placeholder: "—" },
      { key: "chapter_id", label: "Chapitre", type: "select", optionsFrom: "chapter_id", placeholder: "—" },
      { key: "chapter_part_id", label: "Partie du chapitre", type: "number" },
      { key: "linked_action", label: "Action chapitre liée", type: "select", options: LINKED_ACTIONS, placeholder: "—" },
      { key: "type_id", label: "Type", type: "select", optionsFrom: "type_id", placeholder: "—" },
      { key: "methods_id", label: "Méthode", type: "select", optionsFrom: "methods_id", placeholder: "—" },
      { key: "priority_id", label: "Priorité", type: "select", optionsFrom: "priority_id", placeholder: "—" },
      { key: "attention_level_id", label: "Attention", type: "select", optionsFrom: "attention_level_id", placeholder: "—" },
      { key: "flags_id", label: "Drapeau", type: "select", optionsFrom: "flags_id", placeholder: "—" },
      { key: "labels_id", label: "Étiquette", type: "select", optionsFrom: "labels_id", placeholder: "—" },
      { key: "path", label: "Dossier", type: "select", optionsFrom: "path", placeholder: "/" },
    ],
  },
  {
    title: "Planification",
    fields: [
      { key: "remind", label: "Rappel", type: "checkbox" },
      { key: "remind_date", label: "Date du rappel", type: "datetime" },
      { key: "periods", label: "Périodes", type: "textarea", rows: 2, placeholder: "Tableau JSON ou texte libre" },
      { key: "frequency", label: "Fréquence", type: "text", placeholder: "ex. quotidien, hebdomadaire" },
      { key: "excludes_periods", label: "Périodes exclues", type: "textarea", rows: 2 },
    ],
  },
  {
    title: "Ressources",
    fields: [
      { key: "is_homework", label: "Devoir", type: "checkbox" },
      { key: "homeworks_id", label: "Réf. devoir", type: "text" },
      { key: "urls", label: "URLs", type: "lines", placeholder: "Une URL par ligne" },
      { key: "attachements_id", label: "Pièces jointes", type: "textarea", rows: 2, placeholder: "JSON ou texte libre" },
      { key: "push_tasks", label: "Notifications push", type: "checkbox" },
    ],
  },
  {
    title: "Notes",
    fields: [
      { key: "comments", label: "Commentaires", type: "textarea", rows: 3 },
      { key: "ai_comments", label: "Commentaires IA", type: "textarea", rows: 3 },
    ],
  },
];

const SUBJECT_SECTIONS = [
  {
    title: "Matière",
    fields: [
      { key: "subject_name", label: "Nom", type: "text", placeholder: "ex. Mathématiques" },
      { key: "ed_subject_id", label: "ID matière ED", type: "number" },
      { key: "ed_subject_code", label: "Code ED", type: "text", placeholder: "ex. MATH" },
      { key: "ed_subject_name", label: "Nom ED", type: "text" },
      { key: "methods", label: "Méthodes (IDs JSON)", type: "textarea", rows: 2, mono: true },
    ],
  },
  {
    title: "Notes",
    fields: [
      { key: "comments", label: "Commentaires", type: "textarea", rows: 3 },
      { key: "tests_comments", label: "Commentaires tests", type: "textarea", rows: 3 },
      { key: "teacher_notes", label: "Notes de la prof — comment elle teste & attentes", type: "textarea", rows: 4, placeholder: "Attentes de la matière : format des tests, style de notation, sujets favoris…" },
      { key: "ai_comments", label: "Commentaires IA", type: "textarea", rows: 3 },
    ],
  },
];

const CHAPTER_SECTIONS = [
  {
    title: "Chapitre",
    fields: [
      { key: "lesson_name", label: "Nom", type: "text", placeholder: "ex. Chapitre 1 — Limites" },
      { key: "lesson_description", label: "Description", type: "textarea", rows: 3 },
      { key: "teacher_notes", label: "Notes de la prof — comment elle teste & attentes", type: "textarea", rows: 4, placeholder: "ex. Tests surtout en QCM sur les définitions, elle attend des démonstrations rigoureuses…" },
      { key: "subject_id", label: "Matière", type: "select", optionsFrom: "subject_id", placeholder: "—" },
      { key: "tests_date", label: "Prochain test", type: "text", placeholder: "AAAA-MM-JJ" },
      { key: "session_date", label: "Date de séance", type: "text", placeholder: "AAAA-MM-JJ" },
      { key: "awaiting_evaluation", label: "En attente d'évaluation", type: "checkbox" },
      { key: "parents_lessons_id", label: "Chapitres parents (IDs séparés par des virgules)", type: "text" },
      { key: "childs_lessons_id", label: "Chapitres enfants (IDs séparés par des virgules)", type: "text" },
      { key: "is_method", label: "Est une méthode/ressource", type: "checkbox" },
      { key: "is_yearly", label: "Annuel", type: "checkbox" },
      { key: "methods", label: "Méthodes (IDs JSON)", type: "textarea", rows: 2, mono: true },
    ],
  },
  {
    title: "Contenu du cours",
    fields: [
      { key: "body", label: "Corps du cours", type: "textarea", rows: 10, placeholder: "Le cours généré / rédigé…" },
      { key: "raw_lessons", label: "Leçons brutes", type: "textarea", rows: 6, mono: true },
      { key: "raw_recorded_lessons", label: "Leçons enregistrées brutes", type: "textarea", rows: 4, mono: true },
    ],
  },
  {
    title: "IA & tests",
    fields: [
      { key: "flashcards", label: "Flashcards (JSON)", type: "textarea", rows: 4, mono: true },
      { key: "tests", label: "Tests (JSON)", type: "textarea", rows: 4, mono: true },
      { key: "tests_results", label: "Résultats des tests (JSON)", type: "textarea", rows: 3, mono: true },
    ],
  },
  {
    title: "Liens",
    fields: [
      { key: "linked_files", label: "Fichiers liés", type: "lines", placeholder: "Un par ligne" },
      { key: "linked_quizlets", label: "Quizlets liés", type: "lines", placeholder: "Une URL par ligne" },
      { key: "linked_websites", label: "Sites liés", type: "lines", placeholder: "Une URL par ligne" },
    ],
  },
  {
    title: "Notes",
    fields: [
      { key: "comments", label: "Commentaires", type: "textarea", rows: 3 },
      { key: "ai_comments", label: "Commentaires IA", type: "textarea", rows: 3 },
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
  ["overdue", "En retard"], ["today", "Aujourd'hui"], ["week", "Cette semaine"],
  ["later", "Plus tard"], ["nodate", "Sans date"], ["done", "Terminées"],
];

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Aujourd'hui · ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Demain · ${time}`;
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
    const [tasksResp, subjectsResp, metaResp] = await Promise.all([
      apiTasks("list", { tables: ALL_TABLES }),
      apiSubjects("list", { all_chapters: true }),
      apiTasks("meta", {}),
    ]);
    state.tables = tasksResp?.tables || {};
    state.subjects = subjectsResp?.subjects || [];
    state.chapters = subjectsResp?.chapters || [];
    state.meta = metaResp?.meta || {};
    renderAll();
    if (state.selected) refreshSelected();
    // Templates are optional — a missing endpoint must not break the page.
    apiTasks("templates", {}).then((tplResp) => {
      state.templates = { task: [], subject: [], chapter: [] };
      for (const t of tplResp?.templates || []) {
        if (state.templates[t.kind]) state.templates[t.kind].push(t);
      }
      renderChrome();
    }).catch(() => {});
  } catch (e) {
    toast(e.message || "Échec du chargement des données");
  }
}

function renderAll() {
  renderChrome();
  renderStats();
  renderContent();
}

function renderChrome() {
  const titles = {
    subjects: "Matières", subject: state.currentSubject?.subject_name || "Matière",
    all: "Toutes", recurring: "Récurrentes", events: "Événements", trash: "Corbeille",
  };
  $("#pageTitle").textContent = titles[state.view] || "Espace de travail";

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

  // Template menu — button shows the selected template name, ✎/🗑 appear with it
  const kind = templateKind();
  const tplList = state.templates[kind] || [];
  const cur = state.template ? tplList.find((t) => t.template_id === state.template.template_id) : null;
  if (state.template && !cur) state.template = null; // stale selection from another kind/view
  const tplBtn = $("#templateSelect");
  tplBtn.textContent = cur ? cur.name : "Modèles";
  tplBtn.classList.toggle("has-sel", !!cur);
  $("#templateEdit").hidden = !cur;
  $("#templateDel").hidden = !cur;
  const tplListEl = $("#templateList");
  tplListEl.innerHTML = tplList.length
    ? tplList.map((t) => `
      <button class="ws-tpl-item ${cur && cur.template_id === t.template_id ? "sel" : ""}" type="button" data-tpl="${t.template_id}">
        <span class="ws-tpl-item-name">${esc(t.name)}</span>
        <span class="ws-tpl-item-kind">${esc(t.kind === "task" ? "tâche" : t.kind === "subject" ? "matière" : "chapitre")}</span>
      </button>`).join("")
    : `<div class="ws-tpl-empty">Pas encore de modèles ${esc(kind === "task" ? "de tâches" : kind === "subject" ? "de matières" : "de chapitres")}</div>`;

  // Breadcrumb for subject/chapter drill-down
  const bc = $("#breadcrumb");
  if (state.view === "subject" && state.currentSubject) {
    bc.hidden = false;
    bc.innerHTML = `
      <button class="ws-crumb" type="button" data-nav="subjects">Matières</button>
      <span class="ws-crumb-sep">/</span>
      <span class="ws-crumb-current">${esc(state.currentSubject.subject_name || "Matière")}</span>`;
    bc.querySelector('[data-nav="subjects"]').addEventListener("click", () => {
      state.view = "subjects"; state.currentSubject = null; closeDetail(); renderAll();
    });
  } else {
    bc.hidden = true;
  }

  // Contextual primary actions visibility
  $("#newBtn").textContent = state.view === "subject" ? "＋ Chapitre" : state.view === "subjects" ? "＋ Matière" : "＋ Nouveau";
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
    html = [[state.subjects.length, "matières"], [chapters, "chapitres"]];
  } else if (state.view === "subject" && state.currentSubject) {
    const chs = chaptersOf(state.currentSubject.subject_id);
    html = [[chs.length, "chapitres"], [chs.filter((c) => c.body).length, "avec cours"]];
  } else {
    const repeat = (state.tables.repeat_tasks || []).length + (state.tables.repeat_events || []).length;
    html = [[pending.length, "à faire"], [today, "aujourd'hui"], [overdue, "en retard"], [repeat, "récurrentes"], [trash, "corbeille"]];
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
  if (!list.length) return showEmpty("Aucune matière", "Créez votre première matière avec « + Matière ».");
  grid.innerHTML = list.map((s) => {
    const chs = chaptersOf(s.subject_id);
    const withBody = chs.filter((c) => c.body).length;
    return `
      <button class="ws-subject-card" type="button" data-id="${s.subject_id}">
        <div class="ws-subject-top">
          <span class="ws-subject-initial">${esc((s.subject_name || "?").trim().charAt(0).toUpperCase())}</span>
          <div class="ws-subject-head">
            <span class="ws-subject-name">${esc(s.subject_name || "Sans titre")}</span>
            ${s.ed_subject_code ? `<span class="ws-chip ws-chip-subject">${esc(s.ed_subject_code)}</span>` : ""}
          </div>
          <span class="ws-icon-btn ws-subject-edit" title="Modifier la matière">✎</span>
        </div>
        ${s.ed_subject_name ? `<div class="ws-subject-ed">ED · ${esc(s.ed_subject_name)}</div>` : ""}
        <div class="ws-subject-foot">
          <span class="ws-chip">${chs.length} chapitre${chs.length > 1 ? "s" : ""}</span>
          <span class="ws-chip">${withBody} cours${withBody > 1 ? "s" : ""}</span>
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
  if (!chs.length) return showEmpty("Aucun chapitre", "Ajoutez votre premier chapitre avec « + Chapitre ».");

  host.innerHTML = `
    <div class="ws-group">
      <div class="ws-group-head"><span>Chapitres</span><span class="ws-group-count">${chs.length}</span></div>
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
        toast("Chapitre supprimé");
        await loadAll();
      } catch (err) { toast(err.message); }
    });
  });
}

function chapterRowHTML(c) {
  const hasBody = !!(c.body && String(c.body).trim());
  const hasFlash = !!(c.flashcards && String(c.flashcards).trim() && c.flashcards !== "[]");
  const chips = [
    c.is_method ? `<span class="ws-chip ws-chip-method">méthode</span>` : "",
    c.is_yearly ? `<span class="ws-chip">annuel</span>` : "",
    c.tests_date ? `<span class="ws-chip ws-chip-due">test ${esc(c.tests_date)}</span>` : "",
    hasBody ? `<span class="ws-chip ws-chip-course">cours ✓</span>` : `<span class="ws-chip">pas de cours</span>`,
    hasFlash ? `<span class="ws-chip ws-chip-flash">flashcards</span>` : "",
  ].join("");
  return `
    <div class="ws-task ws-chapter" data-id="${c.lesson_id}">
      <div class="ws-task-main">
        <div class="ws-task-title">${esc(c.lesson_name || "Sans titre")}</div>
        ${c.lesson_description ? `<div class="ws-task-sub">${esc(String(c.lesson_description).slice(0, 110))}${String(c.lesson_description).length > 110 ? "…" : ""}</div>` : ""}
        <div class="ws-task-meta">${chips}</div>
      </div>
      <button class="ws-icon-btn ws-task-del" type="button" title="Supprimer le chapitre">🗑</button>
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
    return showEmpty(state.q ? "Aucun résultat" : t, state.q ? `Rien ne correspond à « ${state.q} ». ` : s);
  }

  const groups = new Map();
  for (const item of rows) {
    const kind = tableKind(item.table);
    let bucket;
    if (state.view === "trash") bucket = "trash";
    else if (state.view === "recurring") bucket = `${kind}:${item.row.frequency || "custom"}`;
    else if (item.row.is_done) bucket = "done";
    else bucket = dueBucket(item.row.remind_date);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(item);
  }

  const order = state.view === "recurring"
    ? [...groups.keys()].sort()
    : state.view === "trash" ? ["trash"] : GROUP_DEFS.map(([k]) => k);

  groupsEl.innerHTML = order.filter((k) => groups.has(k)).map((k) => {
    const items = groups.get(k);
    const label = state.view === "recurring"
      ? `${k.startsWith("event:") ? "Événements" : "Tâches"} · ${k.split(":")[1]}`
      : state.view === "trash" ? "Supprimés récemment" : (GROUP_DEFS.find(([g]) => g === k)?.[1] || k);
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
        toast(table.startsWith("trash_") ? "Supprimé définitivement" : "Déplacé à la corbeille");
        if (state.selected?.kind === "task" && state.selected.table === table && String(state.selected.row.task_id) === id) closeDetail();
        await loadAll();
      } catch (err) { toast(err.message); }
    });
  });
}

function tableKind(table) {
  return table.includes("events") ? "event" : "task";
}

function taskRowHTML({ table, row }) {
  const done = !!row.is_done;
  const isTrash = table.startsWith("trash_");
  const isRepeat = table.includes("repeat");
  const isEvent = tableKind(table) === "event";
  const due = row.remind_date ? fmtDate(row.remind_date) : "";
  const bucket = dueBucket(row.remind_date);
  const pri = Number(row.priority_id) || 0;
  const priColor = PRIORITY_COLORS[pri] || lookupColor("priorities", "priority_id", pri);
  const subName = row.subject_id ? subjectName(row.subject_id) : "";
  const urlCount = (() => { const p = parseMaybeJSON(row.urls); return Array.isArray(p) ? p.length : (row.urls ? 1 : 0); })();
  const showKind = ["all", "recurring", "trash"].includes(state.view);

  const chips = [
    showKind ? `<span class="ws-chip ws-chip-kind ${isEvent ? "is-event" : ""}">${isEvent ? "événement" : "tâche"}</span>` : "",
    subName ? `<span class="ws-chip ws-chip-subject">${esc(subName)}</span>` : "",
    due && !isTrash ? `<span class="ws-chip ws-chip-due ${bucket}">${esc(due)}</span>` : "",
    row.is_homework ? `<span class="ws-chip ws-chip-homework">DM</span>` : "",
  ].join("");

  return `
    <div class="ws-task ${done ? "is-done" : ""} ${isTrash ? "is-trash" : ""}" data-table="${table}" data-id="${row.task_id}" ${priColor ? `style="--pri:${priColor}"` : ""}>
      <button class="ws-task-check ${done ? "is-done" : ""}" type="button" title="${done ? "Marquer à faire" : "Marquer comme fait"}">${done ? "✓" : ""}</button>
      <div class="ws-task-main">
        <div class="ws-task-title">${esc(row.title || "Sans titre")}</div>
        ${row.text_body ? `<div class="ws-task-sub">${esc(String(row.text_body).slice(0, 90))}${String(row.text_body).length > 90 ? "…" : ""}</div>` : ""}
        <div class="ws-task-meta">
          ${priColor ? `<span class="ws-pri-dot" style="background:${priColor}" title="Priorité"></span>` : ""}
          ${chips}
          ${isRepeat ? `<span class="ws-chip ws-chip-repeat" title="Récurrent${row.frequency ? ` · ${esc(row.frequency)}` : ""}">↻</span>` : ""}
          ${urlCount ? `<span class="ws-chip ws-chip-link">🔗 ${urlCount}</span>` : ""}
        </div>
      </div>
      <button class="ws-icon-btn ws-task-del" type="button" title="${isTrash ? "Supprimer définitivement" : "Supprimer"}">${isTrash ? "🗑" : "⌫"}</button>
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
      deleteLabel: isTrash ? "Supprimer définitivement" : "Mettre à la corbeille",
      badges: [sel.table.replace("_", "-"), sel.row.is_done ? "fait" : "à faire", sel.row.frequency ? `↻ ${sel.row.frequency}` : "", sel.row.linked_action ? `→ ${sel.row.linked_action}` : ""].filter(Boolean),
    };
  }
  // chapter
  const c = sel.row;
  const badges = [
    c.is_method ? "méthode" : "", c.is_yearly ? "annuel" : "",
    c.body ? "cours ✓" : "pas de cours",
    c.flashcards && c.flashcards !== "[]" ? "flashcards" : "",
    c.awaiting_evaluation ? "éval. en attente" : "",
  ].filter(Boolean);
  return {
    titleKey: "lesson_name",
    hideKeys: ["lesson_name"],
    sections: CHAPTER_SECTIONS,
    isDone: false,
    isTrash: false,
    showDoneToggle: false,
    deleteLabel: "Supprimer le chapitre",
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
    const actCount = (() => { const p = parseMaybeJSON(row.tests); return Array.isArray(p?.activities) ? p.activities.length : 0; })();
    const hasFlash = !!parseMaybeJSON(row.flashcards)?.cards?.length;
    html += `
      <div class="ws-dsec">
        <h3>Importer une leçon</h3>
        <div class="ws-tools">
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="import">Importer une leçon</button>
        </div>
        <p class="ws-tools-hint">PDF, vocal, texte, lien + explication, fichiers / images (OCR), caméra — toute l'extraction se fait localement dans votre navigateur.</p>
      </div>
      <div class="ws-dsec">
        <h3>Génération IA</h3>
        <div class="ws-tools">
          <button class="ws-btn ws-btn-primary" type="button" data-tool="course">Générer le cours</button>
          <button class="ws-btn ws-btn-primary" type="button" data-tool="flashcards">Générer les flashcards</button>
          <button class="ws-btn ws-btn-primary" type="button" data-tool="activities">Générer les activités</button>
          ${actCount ? `<button class="ws-btn ws-btn-ghost" type="button" data-tool="run">Lancer le test (${actCount})</button>` : ""}
        </div>
        <p class="ws-tools-hint">GPT OSS 120B via Workers AI — la durée estimée est affichée avant chaque lancement ; la progression est sauvegardée et reprenable.</p>
      </div>
      <div class="ws-dsec">
        <h3>Révision</h3>
        <div class="ws-tools">
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="review">Réviser</button>
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="ask">Poser une question</button>
        </div>
        <p class="ws-tools-hint">Retour des flashcards, séances espacées par semaine/intervalle, et questions basées sur le contenu du cours.</p>
      </div>
      <div class="ws-dsec">
        <h3>Cours</h3>
        <div class="ws-tools">
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="edit">Modifier le cours</button>
          <button class="ws-btn ws-btn-ghost ${row.awaiting_evaluation ? "is-active" : ""}" type="button" data-tool="eval">${row.awaiting_evaluation ? "Évaluation en attente" : "Marquer pour évaluation"}</button>
        </div>
        <p class="ws-tools-hint">Modifiez les champs du chapitre, ou marquez-le en attente d'évaluation (workflow dédié bientôt disponible).</p>
      </div>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => onChapterTool(b.dataset.tool, sel.row)));
    return;
  }
  if (sel.kind === "task" && row.chapter_id && row.linked_action) {
    const ch = state.chapters.find((c) => String(c.lesson_id) === String(row.chapter_id));
    const act = LINKED_ACTIONS.find((a) => a.value === row.linked_action);
    html += `
      <div class="ws-dsec">
        <h3>Action liée</h3>
        <div class="ws-tools">
          <button class="ws-btn ws-btn-primary" type="button" data-linked-action ${ch ? "" : "disabled"}>${esc(act?.label || row.linked_action)}${ch ? ` — ${esc(ch.lesson_name || "chapter")}` : " (chapitre introuvable)"}</button>
        </div>
        <p class="ws-tools-hint">Exécute cet outil chapitre sur le chapitre lié.</p>
      </div>`;
  }
  wrap.innerHTML = html;
  wrap.querySelector("[data-linked-action]")?.addEventListener("click", () => {
    const ch = state.chapters.find((c) => String(c.lesson_id) === String(row.chapter_id));
    if (ch) onChapterTool(row.linked_action, ch);
  });
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
    task: { title: id ? "Modifier la tâche" : "Nouvelle tâche", sections: TASK_SECTIONS, titleKey: "title", submit: "Créer la tâche" },
    subject: { title: id ? "Modifier la matière" : "Nouvelle matière", sections: SUBJECT_SECTIONS, titleKey: null, submit: "Créer la matière" },
    chapter: { title: id ? "Modifier le chapitre" : "Nouveau chapitre", sections: CHAPTER_SECTIONS, titleKey: null, submit: "Créer le chapitre" },
  }[kind];
  if (!defs) return;

  const root = $("#modalRoot");
  root.hidden = false;

  // Template defaults apply only on creation; existing values always win.
  const tpl = opts.template || state.template;
  const values = { ...(tpl?.payload || {}), ...(existing || {}) };
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
          ${kind === "task" ? `<label class="ws-field ws-field-wide"><span class="ws-field-label">Titre</span><input type="text" id="m_title" value="${esc(values.title || "")}" placeholder="Titre de la tâche"></label>` : ""}
          ${kind === "task" && !id && ["all", "recurring", "events"].includes(state.view) ? `
          <label class="ws-field ws-field-wide"><span class="ws-field-label">Kind</span>
            <select id="m_kind">
              ${state.view === "all" ? `<option value="tasks">Tâche</option><option value="events">Événement</option>` : ""}
              ${state.view === "recurring" ? `<option value="repeat_tasks">Tâche récurrente</option><option value="repeat_events">Événement récurrent</option>` : ""}
              ${state.view === "events" ? `<option value="events">Événement</option><option value="repeat_events">Événement récurrent</option>` : ""}
            </select>
          </label>` : ""}
          ${bodyHtml}
        </div>
        <div class="ws-modal-foot">
          <button class="ws-btn ws-btn-ghost" type="button" data-save-tpl title="Enregistrer les valeurs actuelles comme modèle réutilisable">⬒ Enregistrer comme modèle</button>
          <span class="ws-modal-foot-spacer"></span>
          <button class="ws-btn ws-btn-ghost" type="button" data-close>Annuler</button>
          <button class="ws-btn ws-btn-primary" type="button" data-submit>${defs.submit}</button>
        </div>
      </div>
    </div>`;

  const close = () => { root.hidden = true; root.innerHTML = ""; };
  root.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  root.querySelector(".ws-modal-backdrop").addEventListener("click", (e) => { if (e.target.classList.contains("ws-modal-backdrop")) close(); });

  if (opts.presetTable) {
    const sel = root.querySelector("#m_kind");
    if (sel && [...sel.options].some((o) => o.value === opts.presetTable)) sel.value = opts.presetTable;
  }

  const collect = () => collectFields(defs.sections, kind === "task" ? "title" : null, kind === "task" ? root.querySelector("#m_title") : null, root.querySelector(".ws-modal"));

  root.querySelector("[data-save-tpl]").addEventListener("click", async () => {
    const fields = collect();
    const name = prompt("Nom du modèle :", kind === "task" ? (fields.title || "Modèle de tâche") : `Modèle ${kind === "subject" ? "de matière" : "de chapitre"}`);
    if (!name?.trim()) return;
    try {
      await apiTasks("template-save", { kind, name: name.trim(), payload: fields });
      toast("Modèle enregistré");
      await loadAll();
    } catch (e) { toast(e.message); }
  });

  root.querySelector("[data-submit]").addEventListener("click", async () => {
    const btn = root.querySelector("[data-submit]");
    btn.disabled = true; btn.textContent = "Enregistrement…";
    try {
      const fields = collect();
      if (kind === "task") {
        const fallback = state.view === "recurring" ? "repeat_tasks" : state.view === "events" ? "events" : "tasks";
        const table = opts.table || root.querySelector("#m_kind")?.value || fallback;
        if (id) {
          await apiTasks("update", { table, task_id: id, fields });
        } else {
          // Link the new row to its template so deleting the template can trash it later.
          if (tpl?.template_id) {
            let ad = {};
            try { ad = JSON.parse(fields.additional_data || "{}"); } catch { ad = {}; }
            if (typeof ad !== "object" || ad === null) ad = {};
            ad.template_id = String(tpl.template_id);
            ad.template_name = tpl.name || "";
            fields.additional_data = JSON.stringify(ad);
          }
          await apiTasks("create", { table, fields });
        }
      } else if (kind === "subject") {
        if (id) await apiSubjects("update-subject", { subject_id: id, fields });
        else await apiSubjects("create-subject", { fields });
      } else if (kind === "chapter") {
        if (!fields.subject_id && state.currentSubject) fields.subject_id = state.currentSubject.subject_id;
        if (id) await apiSubjects("update-chapter", { lesson_id: id, fields });
        else await apiSubjects("create-chapter", { fields });
      }
      state.template = null;
      toast(id ? "Enregistré" : "Créé");
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
  if (tool === "import") {
    return openImportModal({
      onImport: async (target, text, meta = {}) => {
        const cur = chapter[target] || "";
        const fields = { [target]: cur ? `${cur}\n\n${text}` : text };
        if (meta.session_date) fields.session_date = meta.session_date;
        await apiSubjects("update-chapter", { lesson_id: lessonId, fields });
        toast("Contenu de la leçon importé");
        await loadAll();
      },
    });
  }
  if (tool === "course") {
    return confirmGenerate({
      title: "Générer le cours",
      minutes: estimateMinutes(chapter, "course"),
      detail: "Le cours est construit section par section avec GPT OSS 120B.",
      confirmLabel: "Générer le cours",
      onGo: () => runCourseGeneration(lessonId),
    });
  }
  if (tool === "flashcards") {
    return confirmGenerate({
      title: "Générer les flashcards",
      minutes: estimateMinutes(chapter, "flashcards"),
      detail: "Les cartes sont générées à partir du contenu actuel du cours.",
      confirmLabel: "Générer les flashcards",
      onGo: () => runFlashcards(lessonId),
    });
  }
  if (tool === "activities") {
    return confirmGenerate({
      title: "Générer les activités",
      minutes: estimateMinutes(chapter, "activities"),
      detail: "Exercices et tests générés à partir du cours.",
      confirmLabel: "Générer les activités",
      onGo: () => runActivities(lessonId),
    });
  }
  if (tool === "run") return openTestSimulation(chapter);
  if (tool === "review") return openReviewMenu(chapter);
  if (tool === "ask") return openAskAI(chapter);
  if (tool === "edit") return openEntityModal("chapter", lessonId, chapter);
  if (tool === "eval") return toggleEvaluation(chapter);
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
        <div class="ws-modal-foot"><button class="ws-btn ws-btn-ghost" type="button" data-close>Fermer</button></div>
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
  const modal = openGenModal("Génération du cours…");
  try {
    // Resume an unfinished job if one exists
    let jobId, outline, done;
    const st = await apiLearning("course-status", { lesson_id: lessonId });
    if (st.job && st.job.status !== "done" && st.job.payload?.outline) {
      jobId = st.job.job_id;
      const p = typeof st.job.payload === "string" ? JSON.parse(st.job.payload) : st.job.payload;
      outline = p.outline; done = p.done || outline.map(() => false);
      modal.setStatus("Reprise de la génération précédente…");
    } else {
      modal.setStatus("Planification du plan du cours…");
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
        modal.setStatus(`Échec de la section ${i + 1} : ${e.message} — rouvrez ce panneau pour réessayer.`);
        return;
      }
    }
    modal.setStatus("Cours terminé — corps mis à jour.");
    toast("Cours généré");
    await loadAll();
  } catch (e) {
    modal.setStatus(`Erreur : ${e.message}`);
    toast(e.message);
  }
}

async function runFlashcards(lessonId) {
  toast("Génération des flashcards… cela peut prendre une minute");
  try {
    const r = await apiLearning("flashcards", { lesson_id: lessonId });
    toast(`${r.count} flashcards générées`);
    await loadAll();
  } catch (e) { toast(e.message); }
}

async function runActivities(lessonId) {
  toast("Génération des activités… cela peut prendre une minute");
  try {
    const r = await apiLearning("activities", { lesson_id: lessonId, count: 10 });
    toast(`${r.count} activités générées (${(r.components || []).join(", ")})`);
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

  // ---- Template dropdown ----
  const tplMenu = $("#templateMenu");
  const tplPop = $("#templatePop");
  let tplCloseTimer = null;
  const tplOpen = () => { clearTimeout(tplCloseTimer); tplPop.hidden = false; };
  const tplClose = (delay = 0) => {
    clearTimeout(tplCloseTimer);
    tplCloseTimer = setTimeout(() => { tplPop.hidden = true; }, delay);
  };
  tplMenu.addEventListener("mouseenter", tplOpen);
  tplMenu.addEventListener("mouseleave", () => tplClose(120));
  $("#templateSelect").addEventListener("click", () => { tplPop.hidden ? tplOpen() : tplClose(0); });
  tplPop.addEventListener("click", (e) => {
    const item = e.target.closest("[data-tpl]");
    if (item) {
      const t = state.templates[templateKind()]?.find((x) => String(x.template_id) === item.dataset.tpl);
      state.template = t || null;
      tplClose(0);
      renderAll();
      toast(t ? `Modèle « ${t.name} » sélectionné` : "Modèle effacé");
      return;
    }
    if (e.target.closest("#templateAdd")) {
      const name = prompt("Nom du modèle :");
      if (!name?.trim()) return;
      const kind = templateKind();
      apiTasks("template-save", { kind, name: name.trim(), payload: {} })
        .then(loadAll)
        .then(() => toast("Modèle ajouté"))
        .catch((err) => toast(err.message));
    }
  });

  $("#templateEdit").addEventListener("click", async () => {
    const t = state.template;
    if (!t) return;
    const name = prompt("Nom du modèle :", t.name);
    if (!name?.trim() || name.trim() === t.name) return;
    try {
      await apiTasks("template-save", { kind: t.kind, name: name.trim(), payload: t.payload || {}, template_id: t.template_id });
      await loadAll();
      toast("Modèle renommé");
    } catch (e) { toast(e.message); }
  });

  $("#templateDel").addEventListener("click", async () => {
    const t = state.template;
    if (!t) return;
    if (!confirm(`Supprimer le modèle « ${t.name} » ? Les tâches et événements créés à partir de celui-ci seront déplacés à la corbeille.`)) return;
    try {
      await apiTasks("template-delete", { template_id: t.template_id });
      state.template = null;
      toast("Modèle supprimé — les éléments liés sont passés à la corbeille");
      await loadAll();
    } catch (e) { toast(e.message); }
  });

  // Navbar refresh → renew session + reload workspace data
  window.addEventListener("site-navbar:refresh", (event) => {
    const done = (async () => {
      const ok = await refreshSession();
      if (!ok) { showAuthOverlay(); return; }
      await loadAll();
    })();
    event.detail?.waitUntil?.(done);
  });

  let searchTimer;
  $("#searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); renderContent(); renderStats(); }, 150);
  });

  $("#newBtn").addEventListener("click", () => {
    if (state.view === "subjects") return openEntityModal("subject", null, null, { template: state.template });
    if (state.view === "subject") return openEntityModal("chapter", null, state.currentSubject ? { subject_id: state.currentSubject.subject_id } : null, { template: state.template });
    if (["all", "recurring", "events"].includes(state.view)) {
      return openCreateChooser({
        onPick: (key) => {
          if (key === "task" || key === "event") {
            const preset = {
              all: { task: "tasks", event: "events" },
              recurring: { task: "repeat_tasks", event: "repeat_events" },
              events: { task: "events", event: "events" },
            }[state.view]?.[key];
            openEntityModal("task", null, null, { template: state.template, presetTable: preset });
          } else if (key === "chapter") {
            openEntityModal("chapter", null, null, { template: state.template });
          }
        },
      });
    }
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
    btn.disabled = true; btn.textContent = "Enregistrement…";
    try {
      const cfg = detailConfig();
      const fields = collectFields(cfg.sections, cfg.titleKey, document.getElementById("dTitle"), document.getElementById("detailPanel"));
      if (sel.kind === "task") await apiTasks("update", { table: sel.table, task_id: sel.row.task_id, fields });
      else await apiSubjects("update-chapter", { lesson_id: sel.row.lesson_id, fields });
      toast("Enregistré");
      await loadAll();
    } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = "Enregistrer";
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
        toast("Chapitre supprimé");
      } else {
        const isTrash = sel.table.startsWith("trash_");
        if (isTrash) await apiTasks("purge", { table: sel.table, task_id: sel.row.task_id });
        else await apiTasks("delete", { table: sel.table, task_id: sel.row.task_id });
        toast(isTrash ? "Supprimé définitivement" : "Déplacé à la corbeille");
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
