import { authedFetch, refreshSession, showAuthOverlay } from "/lib/auth.js";
import { openImportModal } from "./import-lesson.js";
import { openActivityRunner, setLearningApi } from "./activity-runner.js";
import {
  setChapterApi, openCreateChooser, confirmGenerate, openReviewMenu,
  openFlashcardReview, openSpacedReview, openAskAI, toggleEvaluation, estimateMinutes,
  openTestSimulation, openExamPlan, openEditCourseModal,
  examPlanDefaults, examPlanListHTML, collectExamPlanRows, createExamPlanTasks, EXAM_PHASES,
} from "./chapter-tools.js";
import { renderTimetable, edtStats } from "./timetable.js";
import { initDatePicker, setDayHeat, lumarisDateField, refreshDatePickerLabels, selectDate } from "./date-picker.js";
import { showLoadingOverlay, hideLoadingOverlay } from "/lib/loading.js";
import { lumarisAlert, lumarisConfirm, lumarisPrompt } from "/lib/dialog.js";
import "/lib/select.js"; // auto-enhances every native <select> into a Lumaris dropdown
import { edBlocksFieldHTML, edBlockRowHTML, syncEdBlocks, edBlocksJSON, hydrateEdBlocks, newEdBlock } from "./ed-blocks.js";
import { attFieldHTML, attJSON, attIds, bindAttachments } from "./attachments.js";

// Single boot loading: the workspace owns the overlay from the very first
// paint until the initial data load settles (auth + fetch = one screen).
window.__lumarisKeepLoading = true;
showLoadingOverlay();
let bootSettled = false;
function settleBoot() {
  if (bootSettled) return;
  bootSettled = true;
  hideLoadingOverlay();
}

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
  apiTasks,
  apiLearning,
  toast,
  reload: () => loadAll(),
  getMethods: () => state.meta.methods || [],
  get linkedActions() { return LINKED_ACTIONS; },
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
  afterclass: { tables: ["tasks", "events", "repeat_tasks", "repeat_events"], title: "Après-cours", filter: (row) => Number(row.after_class), empty: ["Rien à faire après le cours", "Cochez « Après le cours » sur une tâche pour la retrouver ici."] },
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
  dayFilter: "",           // "YYYY-MM-DD" | "" — day selected in the general view
  attrFilter: null,        // { field, value, label } — quick filter set by clicking a chip
  selected: null,            // { kind: "task"|"chapter", table?, row }
};

const section = () => (state.view === "timetable" ? "timetable" : SUBJECT_VIEWS.includes(state.view) ? "subjects" : "tasks");
const templateKind = () => (state.view === "subject" ? "chapter" : state.view === "subjects" ? "subject" : "task");

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// One URL per line → clickable chips. Accepts bare domains (google.com →
// https://google.com). Non-URL lines render as plain text chips.
function linkChipsHTML(text) {
  const lines = String(text ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return "";
  const chips = lines.map((u) => {
    const isUrl = /^https?:\/\//i.test(u) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(u);
    if (!isUrl) return `<span class="ws-linkchip ws-linkchip-text">${esc(u)}</span>`;
    const href = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    let label = u.replace(/^https?:\/\//i, "");
    try { const p = new URL(href); label = p.hostname + (p.pathname !== "/" ? p.pathname : ""); } catch { /* keep raw */ }
    if (label.length > 42) label = `${label.slice(0, 40)}…`;
    return `<a class="ws-linkchip" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(href)}">🔗 ${esc(label)}</a>`;
  }).join("");
  return `<div class="ws-links">${chips}</div>`;
}

// ================= Lookup helpers =================
function lookupOptions(key, idKey, nameKey = "name") {
  return (state.meta[key] || []).map((r) => ({ value: String(r[idKey]), label: r[nameKey] || `#${r[idKey]}`, color: r.color || "" }));
}
const LOOKUP_FIELDS = {
  labels_id: () => lookupOptions("labels", "label_id"),
  flags_id: () => lookupOptions("flags", "flag_id"),
  type_id: () => lookupOptions("types", "type_id"),
  methods_id: () => lookupOptions("methods", "method_id"),
  priority_id: () => lookupOptions("priorities", "priority_id"),
  attention_level_id: () => lookupOptions("attention", "attention_level_id"),
  path: () => (state.meta.folders || []).map((f) => ({ value: f.path, label: f.name ? `${f.name} (${f.path})` : f.path, color: f.color || "" })),
  subject_id: () => state.subjects.map((s) => ({ value: String(s.subject_id), label: s.subject_name || `Matière ${s.subject_id}` })),
  chapter_id: () => state.chapters.map((c) => ({ value: String(c.lesson_id), label: c.lesson_name || `Chapitre ${c.lesson_id}` })),
};

// Chapter actions a task can be linked to — values match onChapterTool() keys.
const LINKED_ACTIONS = [
  { value: "import", label: "Importer une leçon" },
  { value: "course", label: "Générer le cours" },
  { value: "flashcards", label: "Flashcards" },
  { value: "activities", label: "Activités / tests" },
  { value: "review", label: "Révision" },
  { value: "examplan", label: "Planifier le contrôle" },
  { value: "ask", label: "Poser une question IA" },
  { value: "edit", label: "Modifier le cours" },
  { value: "eval", label: "Évaluation" },
];

// ================= Field definitions =================
// type: text | textarea | number | chips | toggle | list | lines | datetime | date
//        | reminder | ai-note | info
// chips: optionsFrom/options, multi ( several ) + json (store JSON array) or join:","
// toggle: boolean as a strike-through icon button
// list: dynamic add/remove rows stored as a JSON array
// reminder: segmented mode (none/day_before/same_day/custom) → remind + additional_data
// ai-note: "generate with AI" button + optional editable comment
// info: read-only summary of an AI-managed JSON column (never written back)
const FREQ_OPTIONS = [
  { value: "daily", label: "Quotidien" }, { value: "weekly", label: "Hebdomadaire" },
  { value: "monthly", label: "Mensuel" }, { value: "yearly", label: "Annuel" },
  { value: "custom", label: "Personnalisé" },
];

// ================= Recurrence editor =================
// Structured recurrence stored in additional_data.recurrence (JSON):
//   { freq, time:"HH:MM", days:[getDay…], dom, month, day }
// The `frequency` column keeps the plain freq string for lists/badges.
// "custom" = no structured schedule (free-text periods only).
const REC_WEEKDAYS = [["L", 1], ["M", 2], ["M", 3], ["J", 4], ["V", 5], ["S", 6], ["D", 0]];
const REC_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function recurrenceHTML(entity) {
  const ad = parseMaybeJSON(entity?.additional_data);
  const rec = ad?.recurrence && typeof ad.recurrence === "object" && !Array.isArray(ad.recurrence) ? ad.recurrence : {};
  const freq = entity?.frequency || rec.freq || "custom";
  const [th = "", tm = ""] = String(rec.time || "").split(":");
  const days = new Set((Array.isArray(rec.days) ? rec.days : []).map(Number));
  const anchor = entity?.remind_date ? new Date(entity.remind_date) : null;

  const seg = FREQ_OPTIONS.map((o) => `
    <button type="button" class="ws-seg" data-rf="${o.value}" data-active="${freq === o.value}">${o.label}</button>`).join("");

  const timeRow = (extra = "") => `
    <div class="ws-rec-time" ${extra}>
      <span class="ws-rec-lbl">Heure</span>
      <select data-rec-h>${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === Number(th) ? "selected" : ""}>${String(h).padStart(2, "0")}</option>`).join("")}</select>
      <span class="ws-rec-sep">:</span>
      <select data-rec-m>${Array.from({ length: 60 }, (_, m) => `<option value="${m}" ${m === Number(tm) ? "selected" : ""}>${String(m).padStart(2, "0")}</option>`).join("")}</select>
    </div>`;

  const cfg = (f, inner) => `<div class="ws-rec-cfg" data-recfreq="${f}" ${freq === f ? "" : "hidden"}>${inner}</div>`;

  return `
    <div class="ws-recurrence" data-recurrence data-freq="${freq}">
      <div class="ws-segmented ws-rec-seg">${seg}</div>
      ${cfg("daily", timeRow())}
      ${cfg("weekly", `
        <div class="ws-fchips ws-rec-days">${REC_WEEKDAYS.map(([l, d]) => `
          <button type="button" class="ws-fchip${days.has(d) ? " is-sel" : ""}" data-wd="${d}">${l}</button>`).join("")}
        </div>${timeRow()}`)}
      ${cfg("monthly", `
        <div class="ws-rec-row">
          <span class="ws-rec-lbl">Jour du mois</span>
          <input type="number" min="1" max="31" data-rec-dom value="${rec.dom ?? ""}" placeholder="${anchor && !isNaN(anchor) ? anchor.getDate() : "ex. 15"}">
        </div>${timeRow()}`)}
      ${cfg("yearly", `
        <div class="ws-rec-row">
          <span class="ws-rec-lbl">Date</span>
          <select data-rec-month>${REC_MONTHS.map((m, i) => `<option value="${i + 1}" ${Number(rec.month) === i + 1 ? "selected" : ""}>${m}</option>`).join("")}</select>
          <input type="number" min="1" max="31" data-rec-day value="${rec.day ?? ""}" placeholder="jour" style="width:76px">
        </div>${timeRow()}`)}
      ${cfg("custom", `<p class="ws-field-hint">Fréquence personnalisée — décrivez-la dans les périodes ci-dessous.</p>`)}
    </div>`;
}

const INFO_FORMATTERS = {
  flashcards: (v) => {
    const p = parseMaybeJSON(v);
    const n = Array.isArray(p?.cards) ? p.cards.length : 0;
    const d = p?.generated_at ? ` · ${new Date(p.generated_at).toLocaleDateString()}` : "";
    return n ? `${n} carte${n > 1 ? "s" : ""}${d}` : "Aucune flashcard — générez-les depuis les outils du chapitre";
  },
  tests: (v) => {
    const p = parseMaybeJSON(v);
    const n = Array.isArray(p?.activities) ? p.activities.length : 0;
    const d = p?.generated_at ? ` · ${new Date(p.generated_at).toLocaleDateString()}` : "";
    return n ? `${n} activité${n > 1 ? "s" : ""}${d}` : "Aucune activité — générez-les depuis les outils du chapitre";
  },
  tests_results: (v) => {
    const p = parseMaybeJSON(v);
    const n = Array.isArray(p) ? p.length : 0;
    return n ? `${n} résultat${n > 1 ? "x" : ""} enregistré${n > 1 ? "s" : ""}` : "Aucun résultat de test";
  },
  review_plan: (v) => {
    const p = parseMaybeJSON(v);
    const n = Array.isArray(p?.sessions) ? p.sessions.length : 0;
    const done = Array.isArray(p?.sessions) ? p.sessions.filter((s) => s?.done).length : 0;
    return n ? `${n} séance${n > 1 ? "s" : ""} planifiée${n > 1 ? "s" : ""} — ${done} faite${done > 1 ? "s" : ""}` : "Pas de plan de révision";
  },
  gaps: (v) => {
    const p = parseMaybeJSON(v);
    const list = Array.isArray(p) ? p.filter(Boolean) : [];
    return list.length ? list.slice(0, 8).join(" · ") + (list.length > 8 ? ` … (+${list.length - 8})` : "") : "Aucune lacune identifiée";
  },
};

// `tables` whitelists which task tables a field applies to — anything else
// hides it in the form/detail so each entity type only shows relevant fields.
const REPEAT_TABLES = ["repeat_tasks", "repeat_events"];
const HOMEWORK_TABLES = ["tasks", "repeat_tasks"];
const SCOPE_OPTIONS = [
  { value: "school", label: "Scolaire" },
  { value: "extra", label: "Extrascolaire" },
];

const TASK_SECTIONS = [
  {
    title: "Détails",
    fields: [
      { key: "text_body", label: "Corps", type: "textarea", rows: 5, placeholder: "Détails, instructions…" },
      { key: "steps", label: "Étapes", type: "list", placeholder: "Une étape…" },
    ],
  },
  {
    title: "Organisation",
    fields: [
      { key: "scope", label: "Domaine", type: "chips", options: SCOPE_OPTIONS },
      { key: "subject_id", label: "Matière", type: "chips", optionsFrom: "subject_id", scope: "school" },
      { key: "chapter_id", label: "Chapitre", type: "chips", optionsFrom: "chapter_id", scope: "school" },
      { key: "chapter_part_id", label: "Partie du chapitre", type: "number", scope: "school" },
      { key: "linked_action", label: "Action chapitre liée", type: "chips", options: LINKED_ACTIONS, scope: "school" },
      { key: "methods_id", label: "Méthode", type: "chips", optionsFrom: "methods_id" },
      { key: "priority_id", label: "Priorité", type: "chips", optionsFrom: "priority_id" },
      { key: "attention_level_id", label: "Attention", type: "chips", optionsFrom: "attention_level_id" },
      { key: "flags_id", label: "Drapeau", type: "chips", optionsFrom: "flags_id" },
      { key: "labels_id", label: "Étiquette", type: "chips", optionsFrom: "labels_id" },
      { key: "path", label: "Dossier", type: "chips", optionsFrom: "path" },
    ],
  },
  {
    title: "Échéance & rappels",
    fields: [
      { key: "remind_date", label: "Échéance", type: "datetime" },
      { key: "reminder", label: "Rappel", type: "reminder" },
      { key: "push_tasks", label: "Notifications push", type: "toggle" },
      { key: "recurrence", label: "Récurrence", type: "recurrence", tables: REPEAT_TABLES },
      { key: "periods", label: "Périodes", type: "list", tables: REPEAT_TABLES, placeholder: "ex. 2026-01-05 → 2026-01-16" },
      { key: "excludes_periods", label: "Périodes exclues", type: "list", tables: REPEAT_TABLES, placeholder: "ex. vacances de février" },
    ],
  },
  {
    title: "Type & ressources",
    fields: [
      { key: "is_homework", label: "Devoir", type: "toggle", tables: HOMEWORK_TABLES, scope: "school" },
      { key: "after_class", label: "Après le cours", type: "toggle", scope: "school" },
      { key: "homeworks_id", label: "Réf. devoir", type: "text", tables: HOMEWORK_TABLES, scope: "school" },
      { key: "urls", label: "URLs", type: "lines", links: true, placeholder: "Une URL par ligne — ex. https://…" },
      { key: "attachements_id", label: "Pièces jointes", type: "attachments", attKind: "tasks" },
    ],
  },
  {
    title: "ÉcoleDirecte",
    fields: [
      { key: "ed_blocks", label: "Interactions", type: "edblocks", scope: "school" },
    ],
  },
  {
    title: "Notes",
    fields: [
      { key: "comments", label: "Commentaires", type: "textarea", rows: 3 },
      { key: "ai_comments", label: "Commentaire IA", type: "ai-note", aiKind: "task" },
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
      { key: "methods", label: "Méthodes", type: "chips", optionsFrom: "methods_id", multi: true, json: true },
    ],
  },
  {
    title: "Notes",
    fields: [
      { key: "comments", label: "Commentaires", type: "textarea", rows: 3 },
      { key: "tests_comments", label: "Commentaires tests", type: "textarea", rows: 3 },
      { key: "teacher_notes", label: "Notes de la prof — comment elle teste & attentes", type: "textarea", rows: 4, placeholder: "Attentes de la matière : format des tests, style de notation, sujets favoris…" },
      { key: "attachements_id", label: "Pièces jointes", type: "attachments", attKind: "subjects" },
      { key: "ai_comments", label: "Commentaire IA", type: "ai-note", aiKind: "subject" },
    ],
  },
];

const CHAPTER_SECTIONS = [
  {
    title: "Chapitre",
    fields: [
      { key: "lesson_name", label: "Nom", type: "text", placeholder: "ex. Chapitre 1 — Limites" },
      { key: "lesson_description", label: "Description", type: "textarea", rows: 3 },
      { key: "raw_lessons", label: "Texte de la leçon — collez ou tapez le contenu", type: "textarea", rows: 8, placeholder: "Le contenu de la leçon : cours, notes de cours, extrait de manuel, thoughts…" },
      { key: "teacher_notes", label: "Notes de la prof — comment elle teste & attentes", type: "textarea", rows: 4, placeholder: "ex. Tests surtout en QCM sur les définitions, elle attend des démonstrations rigoureuses…" },
      { key: "subject_id", label: "Matière", type: "chips", optionsFrom: "subject_id" },
      { key: "tests_date", label: "Prochain test", type: "date" },
      { key: "session_date", label: "Date de séance", type: "date" },
      { key: "awaiting_evaluation", label: "En attente d'évaluation", type: "toggle" },
      { key: "parents_lessons_id", label: "Chapitres parents", type: "chips", optionsFrom: "chapter_id", multi: true, join: ",", excludeSelf: true },
      { key: "childs_lessons_id", label: "Chapitres enfants", type: "chips", optionsFrom: "chapter_id", multi: true, join: ",", excludeSelf: true },
      { key: "is_method", label: "Est une méthode/ressource", type: "toggle" },
      { key: "is_yearly", label: "Annuel", type: "toggle" },
      { key: "methods", label: "Méthodes", type: "chips", optionsFrom: "methods_id", multi: true, json: true },
      { key: "review_plan", label: "Plan de révision", type: "info" },
      { key: "gaps", label: "Lacunes identifiées", type: "info" },
    ],
  },
  {
    title: "Contenu du cours",
    fields: [
      { key: "body", label: "Corps du cours", type: "textarea", rows: 10, placeholder: "Le cours généré / rédigé…" },
      { key: "raw_recorded_lessons", label: "Leçons enregistrées brutes", type: "textarea", rows: 4 },
    ],
  },
  {
    title: "IA & tests",
    fields: [
      { key: "flashcards", label: "Flashcards", type: "info" },
      { key: "tests", label: "Tests & activités", type: "info" },
      { key: "tests_results", label: "Résultats des tests", type: "info" },
    ],
  },
  {
    title: "Liens",
    fields: [
      { key: "linked_files", label: "Fichiers joints", type: "attachments", attKind: "chapters" },
      { key: "linked_quizlets", label: "Quizlets liés", type: "lines", links: true, placeholder: "Une URL par ligne" },
      { key: "linked_websites", label: "Sites liés", type: "lines", links: true, placeholder: "Une URL par ligne" },
    ],
  },
  {
    title: "Notes",
    fields: [
      { key: "comments", label: "Commentaires", type: "textarea", rows: 3 },
      { key: "ai_comments", label: "Commentaire IA", type: "ai-note", aiKind: "chapter" },
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

function dayKeyOf(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Does a recurrence occur on date `d` (local Date)? Shared by the day filter,
// the agenda view and the heatmap expansion.
function occursOnDate(rec, freq, anchor, d) {
  if (dayKeyOf(d) < dayKeyOf(anchor)) return false; // before the recurrence start
  if (freq === "daily") return true;
  if (freq === "weekly") {
    const days = Array.isArray(rec?.days) && rec.days.length ? rec.days.map(Number) : [anchor.getDay()];
    return days.includes(d.getDay());
  }
  if (freq === "monthly") {
    const dom = rec?.dom || anchor.getDate();
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(dom, dim);
  }
  if (freq === "yearly") {
    const mo = rec?.month || anchor.getMonth() + 1;
    const dy = rec?.day || anchor.getDate();
    const dim = new Date(d.getFullYear(), mo, 0).getDate();
    return d.getMonth() + 1 === mo && d.getDate() === Math.min(dy, dim);
  }
  return dayKeyOf(anchor) === dayKeyOf(d); // custom / unknown → anchor day only
}

function recurrenceParts(row) {
  const ad = parseMaybeJSON(row.additional_data);
  const rec = ad?.recurrence && typeof ad.recurrence === "object" && !Array.isArray(ad.recurrence) ? ad.recurrence : null;
  const freq = rec?.freq || row.frequency || "custom";
  const anchor = row.remind_date ? new Date(row.remind_date) : null;
  return { rec, freq, anchor: anchor && !isNaN(anchor) ? anchor : null };
}

// Does this row occur on the given "YYYY-MM-DD"? Repeat rows expand their
// structured recurrence (additional_data.recurrence); everything else matches
// its remind_date day. Local dates, consistent with the rest of the UI.
function rowOccursOn(row, table, dayKey) {
  if (!table.includes("repeat")) {
    return String(row.remind_date || "").slice(0, 10) === dayKey;
  }
  const { rec, freq, anchor } = recurrenceParts(row);
  if (!anchor) return freq === "daily";
  return occursOnDate(rec, freq, anchor, new Date(`${dayKey}T12:00:00`));
}

// All "YYYY-MM-DD" keys a row occurs on within [winStart, winEnd] (Date bounds,
// inclusive). Non-repeat rows return their single remind_date; repeat rows are
// expanded day-by-day. Falls back to the anchor day when nothing matches.
function occurrenceDaysInWindow(row, table, winStart, winEnd) {
  const startKey = dayKeyOf(winStart);
  const endKey = dayKeyOf(winEnd);
  if (!table.includes("repeat")) {
    const k = String(row.remind_date || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(k) ? [k] : [];
  }
  const { rec, freq, anchor } = recurrenceParts(row);
  if (!anchor) return [];
  const keys = [];
  for (let d = new Date(winStart); d <= winEnd; d.setDate(d.getDate() + 1)) {
    if (occursOnDate(rec, freq, anchor, d)) keys.push(dayKeyOf(d));
  }
  if (!keys.length) keys.push(dayKeyOf(anchor));
  return keys;
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

function fmtFilterDay(key) {
  const d = new Date(`${key}T12:00:00`);
  if (isNaN(d)) return key;
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

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
function lookupRow(key, idKey, id) {
  return (state.meta[key] || []).find((r) => String(r[idKey]) === String(id));
}
function jsonCount(v) {
  const p = parseMaybeJSON(v);
  return Array.isArray(p) ? p.length : 0;
}
// Quick attribute filter — set by clicking a chip on a task row.
function attrFilterMatch(row) {
  const f = state.attrFilter;
  if (!f) return true;
  return String(row[f.field] ?? "") === String(f.value);
}

// ================= Date-picker heatmap =================
// Task density per day, fed to the Lumaris calendar picker.
// Non-recurring undone tasks/events count once on their remind_date.
// Recurring rows are expanded into occurrences (daily/weekly/monthly/yearly
// from their remind_date anchor) over a ±2-year window; "custom" frequencies
// only count on their anchor day since no schedule engine exists.
const HEAT_WINDOW_DAYS = 730;

function buildDayHeat() {
  const counts = new Map();
  const p2 = (n) => String(n).padStart(2, "0");
  const localKey = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const addDate = (d) => { const k = localKey(d); counts.set(k, (counts.get(k) || 0) + 1); };
  const add = (iso) => {
    const d = String(iso || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) counts.set(d, (counts.get(d) || 0) + 1);
  };
  for (const t of ["tasks", "events"]) {
    for (const r of state.tables[t] || []) {
      if (r?.remind_date && !r.is_done) add(r.remind_date);
    }
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - HEAT_WINDOW_DAYS);
  const end = new Date(today); end.setDate(end.getDate() + HEAT_WINDOW_DAYS);

  const expandRepeat = (r) => {
    const anchor = r?.remind_date ? new Date(r.remind_date) : null;
    if (!anchor || isNaN(anchor)) { if (r?.remind_date) add(r.remind_date); return; }
    anchor.setHours(0, 0, 0, 0);

    // Structured recurrence from additional_data.recurrence when available.
    const ad = parseMaybeJSON(r.additional_data);
    const rec = ad?.recurrence && typeof ad.recurrence === "object" && !Array.isArray(ad.recurrence) ? ad.recurrence : null;
    const freq = rec?.freq || String(r.frequency || "custom");
    if (freq === "custom" || !freq) { addDate(anchor); return; }

    if (freq === "daily") {
      for (let d = new Date(anchor); d <= end; d.setDate(d.getDate() + 1)) {
        if (d >= start) addDate(d);
      }
      return;
    }
    if (freq === "weekly") {
      // Structured days[] (getDay() 0=dim) or fallback: anchor weekday.
      const days = Array.isArray(rec?.days) && rec.days.length
        ? new Set(rec.days.map(Number))
        : new Set([anchor.getDay()]);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d >= anchor && days.has(d.getDay())) addDate(d);
      }
      return;
    }
    if (freq === "monthly") {
      const dom = rec?.dom || anchor.getDate();
      const d = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      while (d <= end) {
        const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const day = Math.min(dom, dim);
        const occ = new Date(d.getFullYear(), d.getMonth(), day);
        if (occ >= anchor && occ >= start && occ <= end) addDate(occ);
        d.setMonth(d.getMonth() + 1);
      }
      return;
    }
    if (freq === "yearly") {
      const mo = rec?.month || anchor.getMonth() + 1;
      const dy = rec?.day || anchor.getDate();
      for (let y = anchor.getFullYear(); y <= end.getFullYear() + 1; y++) {
        const dim = new Date(y, mo, 0).getDate();
        const occ = new Date(y, mo - 1, Math.min(dy, dim));
        if (occ >= anchor && occ >= start && occ <= end) addDate(occ);
      }
    }
  };
  for (const t of ["repeat_tasks", "repeat_events"]) {
    for (const r of state.tables[t] || []) expandRepeat(r);
  }
  return counts;
}

// ================= Loading =================
async function loadAll() {
  try {
    // Templates ride along in the same Promise.all so the whole boot is a
    // single loading screen — no second overlay after the first render.
    const [tasksResp, subjectsResp, metaResp, tplResp] = await Promise.all([
      apiTasks("list", { tables: ALL_TABLES }),
      apiSubjects("list", { all_chapters: true }),
      apiTasks("meta", {}),
      apiTasks("templates", {}).catch(() => null),
    ]);
    state.tables = tasksResp?.tables || {};
    state.subjects = subjectsResp?.subjects || [];
    state.chapters = subjectsResp?.chapters || [];
    state.meta = metaResp?.meta || {};
    state.templates = { task: [], subject: [], chapter: [] };
    for (const t of tplResp?.templates || []) {
      if (state.templates[t.kind]) state.templates[t.kind].push(t);
    }
    setDayHeat(buildDayHeat());
    renderAll();
    settleBoot();
    if (state.selected) refreshSelected();
  } catch (e) {
    settleBoot();
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
    timetable: "Emploi du temps",
    all: "Toutes", recurring: "Récurrentes", events: "Événements", afterclass: "Après-cours", trash: "Corbeille",
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
  // Templates / search / new button are task-subject only
  const isTimetable = section() === "timetable";
  $("#templateMenu").style.display = isTimetable ? "none" : "";
  $(".ws-search").style.display = isTimetable ? "none" : "";
  const dayBtn = document.querySelector(".ws-dayfilter");
  if (dayBtn) dayBtn.style.display = section() === "tasks" ? "" : "none";
  const dayLbl = $("#dayFilterLabel");
  if (dayLbl) {
    dayLbl.textContent = state.dayFilter ? fmtFilterDay(state.dayFilter) : "Jour";
    $("#dayFilterBtn")?.classList.toggle("is-active", !!state.dayFilter);
  }
  updateAttrFilterBtn();
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
  $("#newBtn").style.display = ["trash", "timetable"].includes(state.view) ? "none" : "";
}

// ================= Stats =================
function renderStats() {
  const tasks = state.tables.tasks || [];
  const pending = tasks.filter((t) => !t.is_done);
  const today = pending.filter((t) => dueBucket(t.remind_date) === "today").length;
  const overdue = pending.filter((t) => dueBucket(t.remind_date) === "overdue").length;
  const trash = (state.tables.trash_tasks || []).length + (state.tables.trash_events || []).length;
  let html;
  if (state.view === "timetable") {
    const stats = edtStats();
    html = stats || [["…", "emploi du temps"]];
  } else if (state.view === "subjects") {
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
  $("#timetableView").hidden = state.view !== "timetable";
  if (state.view === "timetable") {
    $("#emptyState").hidden = true;
    return renderTimetable();
  }
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
    const withMastery = chs.map((c) => { try { const m = typeof c.mastery === "string" ? JSON.parse(c.mastery) : c.mastery; return m?.avg; } catch { return null; } }).filter((v) => v != null);
    const avgMastery = withMastery.length ? Math.round(withMastery.reduce((a, b) => a + b, 0) / withMastery.length) : null;
    const methodsCount = jsonCount(s.methods);
    const attCount = attIds(s.attachements_id).length;
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
          ${avgMastery != null ? `<span class="ws-chip ws-chip-mastery ${avgMastery < 40 ? "lo" : avgMastery < 65 ? "mid" : "hi"}" title="Maîtrise moyenne sur les chapitres">${avgMastery} %</span>` : ""}
          ${methodsCount ? `<span class="ws-chip" title="${methodsCount} méthode${methodsCount > 1 ? "s" : ""}">🧠 ${methodsCount}</span>` : ""}
          ${attCount ? `<span class="ws-chip" title="${attCount} pièce${attCount > 1 ? "s" : ""} jointe${attCount > 1 ? "s" : ""}">📎 ${attCount}</span>` : ""}
          ${s.teacher_notes ? `<span class="ws-chip" title="Attentes de la prof renseignées">👩‍🏫</span>` : ""}
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

  // Compact subject summary — same info density as the cards, without opening edit.
  const sMethods = jsonCount(s.methods);
  const sAtt = attIds(s.attachements_id).length;
  const sChips = [
    s.ed_subject_code ? `<span class="ws-chip ws-chip-subject">${esc(s.ed_subject_code)}</span>` : "",
    s.ed_subject_name ? `<span class="ws-chip">ED · ${esc(s.ed_subject_name)}</span>` : "",
    sMethods ? `<span class="ws-chip" title="${sMethods} méthode${sMethods > 1 ? "s" : ""} associée${sMethods > 1 ? "s" : ""}">🧠 ${sMethods}</span>` : "",
    sAtt ? `<span class="ws-chip" title="${sAtt} pièce${sAtt > 1 ? "s" : ""} jointe${sAtt > 1 ? "s" : ""}">📎 ${sAtt}</span>` : "",
    s.teacher_notes ? `<span class="ws-chip" title="Attentes de la prof : ${esc(String(s.teacher_notes).slice(0, 120))}">👩‍🏫 attentes prof</span>` : "",
  ].join("");

  host.innerHTML = `
    ${sChips ? `<div class="ws-group"><div class="ws-group-items ws-subject-summary">${sChips}</div></div>` : ""}
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
  // Mastery — running average across learn sessions (0-100).
  let masteryPct = null;
  try {
    const m = typeof c.mastery === "string" ? JSON.parse(c.mastery) : c.mastery;
    if (m?.avg != null) masteryPct = Math.max(0, Math.min(100, Math.round(m.avg)));
  } catch {}
  const sessPlan = (() => { const p = parseMaybeJSON(c.review_plan); return Array.isArray(p?.sessions) ? p.sessions.length : 0; })();
  const testsDone = jsonCount(c.tests_results);
  const attCount = attIds(c.linked_files).length || attIds(c.attachements_id).length;
  const methodsCount = jsonCount(c.methods);
  const gapsList = (() => { const g = parseMaybeJSON(c.gaps); return Array.isArray(g) ? g.filter(Boolean) : []; })();
  // Flashcards dues (SM-2): unscheduled cards count as due.
  const fcDue = (() => {
    const cards = parseMaybeJSON(c.flashcards)?.cards;
    if (!Array.isArray(cards) || !cards.length) return 0;
    const t = new Date().toISOString().slice(0, 10);
    return cards.filter((x) => {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(x?.due || "") ? x.due : t;
      return d <= t;
    }).length;
  })();

  const chips = [
    c.is_method ? `<span class="ws-chip ws-chip-method">méthode</span>` : "",
    c.is_yearly ? `<span class="ws-chip">annuel</span>` : "",
    c.awaiting_evaluation ? `<span class="ws-chip ws-chip-evalwait">éval en attente</span>` : "",
    c.tests_date ? `<span class="ws-chip ws-chip-due">test ${esc(String(c.tests_date).slice(0, 10))}</span>` : "",
    c.session_date ? `<span class="ws-chip">séance ${esc(String(c.session_date).slice(0, 10))}</span>` : "",
    hasBody ? `<span class="ws-chip ws-chip-course">cours ✓</span>` : `<span class="ws-chip">pas de cours</span>`,
    hasFlash ? `<span class="ws-chip ws-chip-flash">flashcards</span>` : "",
    fcDue ? `<span class="ws-chip ws-chip-due" title="${fcDue} flashcard${fcDue > 1 ? "s" : ""} à réviser (répétition espacée)">⚡ ${fcDue}</span>` : "",
    masteryPct != null ? `<span class="ws-chip ws-chip-mastery ${masteryPct < 40 ? "lo" : masteryPct < 65 ? "mid" : "hi"}" title="Maîtrise moyenne des notions">${masteryPct} %</span>` : "",
    gapsList.length ? `<span class="ws-chip ws-chip-gap" title="Lacunes : ${esc(gapsList.slice(0, 6).join(" · "))}${gapsList.length > 6 ? " …" : ""}">⚠ ${gapsList.length} lacune${gapsList.length > 1 ? "s" : ""}</span>` : "",
    sessPlan ? `<span class="ws-chip" title="${sessPlan} séance${sessPlan > 1 ? "s" : ""} de révision planifiée${sessPlan > 1 ? "s" : ""}">↻ ${sessPlan}</span>` : "",
    testsDone ? `<span class="ws-chip" title="${testsDone} test${testsDone > 1 ? "s" : ""} passé${testsDone > 1 ? "s" : ""}">✎ ${testsDone}</span>` : "",
    attCount ? `<span class="ws-chip" title="${attCount} pièce${attCount > 1 ? "s" : ""} jointe${attCount > 1 ? "s" : ""}">📎 ${attCount}</span>` : "",
    methodsCount ? `<span class="ws-chip" title="${methodsCount} méthode${methodsCount > 1 ? "s" : ""} associée${methodsCount > 1 ? "s" : ""}">🧠 ${methodsCount}</span>` : "",
    c.teacher_notes ? `<span class="ws-chip" title="Attentes de la prof renseignées">👩‍🏫</span>` : "",
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
      if (view.filter && !view.filter(row)) continue;
      if (!attrFilterMatch(row)) continue;
      if (state.dayFilter && state.view === "recurring" && !rowOccursOn(row, t, state.dayFilter)) continue;
      rows.push({ table: t, row });
    }
  }
  return rows;
}

// Day-filtered agenda: selected day + rest of its week + rest of its month,
// grouped by period. Recurring rows appear once per group at their earliest
// occurrence inside it; dated rows outside the month land in "Autres dates".
const AGENDA_ORDER = ["day", "week", "month", "other", "nodate"];

function renderDayAgenda() {
  const groupsEl = $("#taskGroups");
  const D = state.dayFilter;
  const [Y, M, DD] = D.split("-").map(Number);
  const d0 = new Date(Y, M - 1, DD);
  const weekStart = new Date(d0); weekStart.setDate(d0.getDate() - ((d0.getDay() + 6) % 7)); // Monday
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const monthStart = new Date(Y, M - 1, 1);
  const monthEnd = new Date(Y, M, 0);
  const winStart = new Date(weekStart); winStart.setDate(winStart.getDate() - 14);
  const winEnd = new Date(monthEnd); winEnd.setDate(winEnd.getDate() + 14);

  const wkS = dayKeyOf(weekStart), wkE = dayKeyOf(weekEnd);
  const moS = dayKeyOf(monthStart), moE = dayKeyOf(monthEnd);
  const periodOf = (k) =>
    k === D ? "day" : k >= wkS && k <= wkE ? "week" : k >= moS && k <= moE ? "month" : "other";

  const groups = new Map(AGENDA_ORDER.map((k) => [k, []]));
  const seen = new Set(); // dedupe recurring rows per group (earliest occurrence wins)

  for (const t of TASK_VIEWS[state.view].tables) {
    for (const row of state.tables[t] || []) {
      if (!matchesQText(row.title, row.text_body, row.subject_id ? subjectName(row.subject_id) : "", row.path, row.comments)) continue;
      if (TASK_VIEWS[state.view].filter && !TASK_VIEWS[state.view].filter(row)) continue;
      if (!attrFilterMatch(row)) continue;
      const keys = occurrenceDaysInWindow(row, t, winStart, winEnd);
      if (!keys.length) {
        groups.get("nodate").push({ table: t, row });
        continue;
      }
      const sorted = keys.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
      for (const k of sorted) {
        const g = periodOf(k);
        const dedupeKey = `${t}:${row.task_id}:${g}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        groups.get(g).push({ table: t, row, occKey: k });
      }
    }
  }

  const total = AGENDA_ORDER.reduce((n, k) => n + groups.get(k).length, 0);
  if (!total) {
    const [t, s] = TASK_VIEWS[state.view].empty;
    return showEmpty(state.q ? "Aucun résultat" : t, state.q ? `Rien ne correspond à « ${state.q} ». ` : s);
  }

  const labels = {
    day: fmtFilterDay(D),
    week: "Cette semaine",
    month: "Ce mois-ci",
    other: "Autres dates",
    nodate: "Sans date",
  };

  groupsEl.innerHTML = AGENDA_ORDER.filter((k) => groups.get(k).length).map((k) => {
    const items = groups.get(k).slice().sort((a, b) => (a.occKey || "9999").localeCompare(b.occKey || "9999"));
    return `
      <div class="ws-group">
        <div class="ws-group-head"><span>${esc(labels[k])}</span><span class="ws-group-count">${items.length}</span></div>
        <div class="ws-group-items">${items.map((it) => taskRowHTML(it)).join("")}</div>
      </div>`;
  }).join("");

  bindTaskRowEvents(groupsEl);
}

function renderTaskGroups() {
  const groupsEl = $("#taskGroups");
  if (state.dayFilter && !["trash", "recurring"].includes(state.view)) return renderDayAgenda();
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
      : state.view === "trash" ? "Supprimés récemment"
      : (GROUP_DEFS.find(([g]) => g === k)?.[1] || k);
    return `
      <div class="ws-group">
        <div class="ws-group-head"><span>${esc(label)}</span><span class="ws-group-count">${items.length}</span></div>
        <div class="ws-group-items">${items.map((it) => taskRowHTML(it)).join("")}</div>
      </div>`;
  }).join("");

  bindTaskRowEvents(groupsEl);
}

function bindTaskRowEvents(groupsEl) {
  groupsEl.querySelectorAll(".ws-task").forEach((el) => {
    el.addEventListener("click", (e) => {
      const { table, id } = el.dataset;
      const chip = e.target.closest("[data-goto]");
      if (chip) { e.stopPropagation(); gotoFromChip(chip, { table, id }); return; }
      if (e.target.closest(".ws-task-check")) return;
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

// Chip navigation — a click on a task-row chip goes straight to its target:
// subject/chapter → their detail, links → the URLs, view:* → the matching tab,
// filter:* → a quick attribute filter shown as an active pill in the toolbar.
function gotoFromChip(chip, { table, id }) {
  const row = (state.tables[table] || []).find((r) => String(r.task_id) === String(id));
  const action = chip.dataset.goto;

  if (action === "subject") {
    const s = state.subjects.find((x) => String(x.subject_id) === String(chip.dataset.gotoId));
    if (s) { state.currentSubject = s; state.view = "subject"; state.template = null; closeDetail(); renderAll(); }
    return;
  }
  if (action === "chapter") {
    const c = state.chapters.find((x) => String(x.lesson_id) === String(chip.dataset.gotoId));
    if (c) openDetail({ kind: "chapter", row: { ...c } });
    return;
  }
  if (action === "detail") {
    if (row) openDetail({ kind: "task", table, row: { ...row } });
    return;
  }
  if (action === "links") {
    const urls = (() => {
      const p = parseMaybeJSON(row?.urls);
      const arr = Array.isArray(p) ? p : String(row?.urls ?? "").split("\n");
      return arr.map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(u));
    })();
    if (urls.length === 1) {
      const u = urls[0];
      window.open(/^https?:\/\//i.test(u) ? u : `https://${u}`, "_blank", "noopener");
    } else if (row) {
      openDetail({ kind: "task", table, row: { ...row } });
    }
    return;
  }
  if (action.startsWith("view:")) {
    const v = action.slice(5);
    if (TASK_VIEWS[v]) { state.view = v; state.dayFilter = ""; state.attrFilter = null; closeDetail(); renderAll(); updateAttrFilterBtn(); }
    return;
  }
  if (action.startsWith("filter:")) {
    const field = action.slice(7);
    const value = chip.dataset.gotoValue ?? "";
    const label = chip.textContent.trim();
    state.attrFilter = state.attrFilter?.field === field && String(state.attrFilter.value) === String(value)
      ? null // click again → clear
      : { field, value, label };
    renderAll();
    updateAttrFilterBtn();
  }
}

// Active attribute filter pill in the toolbar (set by clicking a task chip).
function updateAttrFilterBtn() {
  const btn = $("#attrFilterBtn");
  if (!btn) return;
  const f = state.attrFilter;
  const inTasks = section() === "tasks";
  btn.hidden = !(f && inTasks);
  btn.style.display = inTasks ? "" : "none";
  const lbl = $("#attrFilterLabel");
  if (lbl && f) lbl.textContent = `Filtre : ${f.label}`;
}

function tableKind(table) {
  return table.includes("events") ? "event" : "task";
}

function taskRowHTML({ table, row, occKey }) {
  const done = !!row.is_done;
  const isTrash = table.startsWith("trash_");
  const isRepeat = table.includes("repeat");
  const isEvent = tableKind(table) === "event";
  // In agenda mode occKey is the actual occurrence day (may differ from the
  // recurrence anchor remind_date); elsewhere it's undefined → remind_date.
  const dueDate = occKey ? new Date(`${occKey}T12:00:00`) : row.remind_date;
  // occKey is a bare day (agenda view) — show the date only, no fake "12:00".
  const due = occKey
    ? (dueDate && !isNaN(dueDate) ? dueDate.toLocaleDateString([], { day: "numeric", month: "short" }) : "")
    : fmtDate(dueDate);
  const bucket = dueBucket(dueDate);
  const pri = Number(row.priority_id) || 0;
  const priColor = PRIORITY_COLORS[pri] || lookupColor("priorities", "priority_id", pri);
  const subName = row.subject_id ? subjectName(row.subject_id) : "";
  const chapName = row.chapter_id ? chapterName(row.chapter_id) : "";
  const urlCount = (() => { const p = parseMaybeJSON(row.urls); return Array.isArray(p) ? p.length : (row.urls ? 1 : 0); })();
  const attCount = attIds(row.attachements_id).length || attIds(row.linked_files).length;
  const stepsCount = jsonCount(row.steps);
  const edCount = (() => { const ad = parseMaybeJSON(row.additional_data); return Array.isArray(ad?.ed_blocks) ? ad.ed_blocks.length : 0; })();
  const showKind = ["all", "recurring", "trash"].includes(state.view);
  // A recurring row can only be checked/unchecked on its actual occurrence
  // day — i.e. when the day filter is today (or unset). Other days are view-only.
  const recLocked = isRepeat && !!state.dayFilter && state.dayFilter !== dayKeyOf(new Date());

  // Attribute chips — colored lookups (labels, flags, methods, type, attention, path).
  const labelRow = lookupRow("labels", "label_id", row.labels_id);
  const flagRow = lookupRow("flags", "flag_id", row.flags_id);
  const methodRow = lookupRow("methods", "method_id", row.methods_id);
  const typeRow = lookupRow("types", "type_id", row.type_id);
  const attRow = lookupRow("attention", "attention_level_id", row.attention_level_id);
  const priRow = lookupRow("priorities", "priority_id", row.priority_id);
  const folderRow = row.path && row.path !== "/" ? (state.meta.folders || []).find((f) => f.path === row.path) : null;

  // Clickable chips — each one navigates or filters directly to its target.
  const go = (action, label, { cls = "", id = "", value = "", title = "", style = "" } = {}) =>
    `<span class="ws-chip ws-chip-go ${cls}" role="button" tabindex="0" data-goto="${action}" ${id ? `data-goto-id="${esc(id)}"` : ""} ${value !== "" ? `data-goto-value="${esc(value)}"` : ""} ${title ? `title="${esc(title)}"` : ""} ${style ? `style="${style}"` : ""}>${label}</span>`;

  const chips = [
    showKind ? go(isEvent ? "view:events" : "view:all", isEvent ? "événement" : "tâche", { cls: `ws-chip-kind ${isEvent ? "is-event" : ""}`, title: isEvent ? "Voir les événements" : "Voir toutes les tâches" }) : "",
    subName ? go("subject", esc(subName), { cls: "ws-chip-subject", id: row.subject_id, title: "Ouvrir la matière" }) : "",
    chapName ? go("chapter", esc(chapName), { cls: "ws-chip-chapter", id: row.chapter_id, title: "Ouvrir le chapitre" }) : "",
    due && !isTrash ? `<span class="ws-chip ws-chip-due ${bucket}">${esc(due)}</span>` : "",
    row.is_homework ? go("filter:is_homework", "DM", { cls: "ws-chip-homework", value: "1", title: "Filtrer : devoirs" }) : "",
    row.after_class ? go("view:afterclass", "après-cours", { cls: "ws-chip-afterclass", title: "Filtrer : après-cours" }) : "",
  ].join("");

  const attrs = [
    labelRow ? go("filter:labels_id", esc(labelRow.name), { value: row.labels_id, style: `--chip:${esc(labelRow.color || "")}`, title: "Filtrer par cette étiquette" }) : "",
    flagRow ? go("filter:flags_id", `🚩 ${esc(flagRow.name)}`, { value: row.flags_id, style: `--chip:${esc(flagRow.color || "")}`, title: "Filtrer par ce drapeau" }) : "",
    methodRow ? go("filter:methods_id", `🧠 ${esc(methodRow.name)}`, { value: row.methods_id, style: `--chip:${esc(methodRow.color || "")}`, title: "Filtrer par cette méthode" }) : "",
    typeRow ? go("filter:type_id", esc(typeRow.name), { value: row.type_id, style: `--chip:${esc(typeRow.color || "")}`, title: "Filtrer par ce type" }) : "",
    attRow ? go("filter:attention_level_id", `⚠ ${esc(attRow.name)}`, { value: row.attention_level_id, style: `--chip:${esc(attRow.color || "")}`, title: "Filtrer par ce niveau d'attention" }) : "",
    priRow?.name ? go("filter:priority_id", esc(priRow.name), { value: row.priority_id, style: `--chip:${esc(priRow.color || priColor || "")}`, title: "Filtrer par cette priorité" }) : "",
    folderRow ? go("filter:path", esc(folderRow.name || row.path), { value: row.path, style: `--chip:${esc(folderRow.color || "")}`, title: `Filtrer le dossier ${esc(row.path)}` }) : "",
  ].join("");

  const counters = [
    stepsCount ? go("detail", `☰ ${stepsCount}`, { cls: "ws-chip-count", title: `${stepsCount} étape${stepsCount > 1 ? "s" : ""} — ouvrir le détail` }) : "",
    attCount ? go("detail", `📎 ${attCount}`, { cls: "ws-chip-count", title: `${attCount} pièce${attCount > 1 ? "s" : ""} jointe${attCount > 1 ? "s" : ""} — ouvrir le détail` }) : "",
    urlCount ? go("links", `🔗 ${urlCount}`, { cls: "ws-chip-link", title: `${urlCount} lien${urlCount > 1 ? "s" : ""} — ouvrir${urlCount > 1 ? "s" : ""}` }) : "",
    edCount ? go("detail", `ED ${edCount}`, { cls: "ws-chip-ed", title: `${edCount} interaction${edCount > 1 ? "s" : ""} ÉcoleDirecte — ouvrir le détail` }) : "",
    row.remind ? go("detail", "🔔", { cls: "ws-chip-remind", title: "Rappel actif — ouvrir le détail" }) : "",
    row.push_tasks ? go("detail", "📲", { cls: "ws-chip-push", title: "Notification push — ouvrir le détail" }) : "",
  ].join("");

  return `
    <div class="ws-task ${done ? "is-done" : ""} ${isTrash ? "is-trash" : ""}" data-table="${table}" data-id="${row.task_id}" ${priColor ? `style="--pri:${priColor}"` : ""}>
      <button class="ws-task-check ${done ? "is-done" : ""} ${recLocked ? "is-locked" : ""}" type="button" ${recLocked ? "disabled" : ""} title="${recLocked ? "Récurrente — cochable uniquement le jour de l'occurrence" : done ? "Marquer à faire" : "Marquer comme fait"}">${done ? "✓" : ""}</button>
      <div class="ws-task-main">
        <div class="ws-task-title">${esc(row.title || "Sans titre")}</div>
        ${row.text_body ? `<div class="ws-task-sub">${esc(String(row.text_body).slice(0, 90))}${String(row.text_body).length > 90 ? "…" : ""}</div>` : ""}
        <div class="ws-task-meta">
          ${priColor ? `<span class="ws-pri-dot" style="background:${priColor}" title="Priorité${priRow?.name ? ` · ${esc(priRow.name)}` : ""}"></span>` : ""}
          ${chips}
          ${isRepeat ? go("view:recurring", "↻", { cls: "ws-chip-repeat", title: `Récurrent${row.frequency ? ` · ${esc(row.frequency)}` : ""} — voir les récurrentes` }) : ""}
          ${counters}
        </div>
        ${attrs ? `<div class="ws-task-attrs">${attrs}</div>` : ""}
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
      badges: [sel.table.replace("_", "-"), sel.row.is_done ? "fait" : "à faire", sel.row.frequency ? `↻ ${sel.row.frequency}` : "", sel.row.linked_action ? `→ ${sel.row.linked_action}` : "", sel.row.after_class ? "après-cours" : ""].filter(Boolean),
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
    const items = sec.fields.filter((f) =>
      (f.key in row || f.type === "reminder" || f.type === "recurrence" || f.type === "edblocks") &&
      (!f.tables || f.tables.includes(sel.table)) &&
      !(cfg.hideKeys || []).includes(f.key)
    ).map((f) => `
      <div class="ws-fcond" data-fkey="${f.key}" data-fscope="${f.scope || ""}">
        ${fieldHTML(f, row[f.key], { entity: row })}
      </div>`).join("");
    return items ? `<div class="ws-dsec"><h3>${sec.title}</h3><div class="ws-dsec-body"><div class="ws-dsec-in"><div class="ws-dgrid">${items}</div></div></div></div>` : "";
  }).join("");

  if (cfg.tools) {
    const actCount = (() => { const p = parseMaybeJSON(row.tests); return Array.isArray(p?.activities) ? p.activities.length : 0; })();
    const hasFlash = !!parseMaybeJSON(row.flashcards)?.cards?.length;
    html += `
      <div class="ws-dsec">
        <h3>Importer une leçon</h3>
        <div class="ws-dsec-body"><div class="ws-dsec-in">
        <div class="ws-tools">
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="import">Importer une leçon</button>
        </div>
        <p class="ws-tools-hint">PDF, vocal, texte, lien + explication, fichiers / images (OCR), caméra — toute l'extraction se fait localement dans votre navigateur.</p></div></div>
      </div>
      <div class="ws-dsec">
        <h3>Génération IA</h3>
        <div class="ws-dsec-body"><div class="ws-dsec-in">
        <div class="ws-tools">
          <button class="ws-btn ws-btn-primary" type="button" data-tool="course">Générer le cours</button>
          <button class="ws-btn ws-btn-primary" type="button" data-tool="flashcards">Générer les flashcards</button>
          <button class="ws-btn ws-btn-primary" type="button" data-tool="activities">Générer les activités</button>
          ${actCount ? `<button class="ws-btn ws-btn-ghost" type="button" data-tool="run">Lancer le test (${actCount})</button>` : ""}
        </div>
        <p class="ws-tools-hint">GPT OSS 120B via Workers AI — la durée estimée est affichée avant chaque lancement ; la progression est sauvegardée et reprenable.</p></div></div>
      </div>
      <div class="ws-dsec">
        <h3>Révision</h3>
        <div class="ws-dsec-body"><div class="ws-dsec-in">
        <div class="ws-tools">
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="review">Réviser</button>
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="examplan">Planifier le contrôle</button>
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="ask">Poser une question</button>
        </div>
        <p class="ws-tools-hint">Retour des flashcards, séances espacées par semaine/intervalle, et questions basées sur le contenu du cours.</p></div></div>
      </div>
      <div class="ws-dsec">
        <h3>Cours</h3>
        <div class="ws-dsec-body"><div class="ws-dsec-in">
        <div class="ws-tools">
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="edit">Modifier le cours</button>
          <button class="ws-btn ws-btn-ghost" type="button" data-tool="editai">✦ Retoucher avec l'IA</button>
          <button class="ws-btn ws-btn-ghost ${row.awaiting_evaluation ? "is-active" : ""}" type="button" data-tool="eval">${row.awaiting_evaluation ? "Évaluation en attente" : "Marquer pour évaluation"}</button>
        </div>
        <p class="ws-tools-hint">Modifiez les champs du chapitre, ou marquez-le en attente d'évaluation (workflow dédié bientôt disponible).</p></div></div>
      </div>`;
    wrap.innerHTML = html;
    applyFieldVisibility(wrap);
    hydrateEdBlocks(wrap);
    bindAttachments(wrap);
    wrap.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => onChapterTool(b.dataset.tool, sel.row)));
    return;
  }
  if (sel.kind === "task" && row.chapter_id && row.linked_action) {
    const ch = state.chapters.find((c) => String(c.lesson_id) === String(row.chapter_id));
    const act = LINKED_ACTIONS.find((a) => a.value === row.linked_action);
    html += `
      <div class="ws-dsec">
        <h3>Action liée</h3>
        <div class="ws-dsec-body"><div class="ws-dsec-in">
        <div class="ws-tools">
          <button class="ws-btn ws-btn-primary" type="button" data-linked-action ${ch ? "" : "disabled"}>${esc(act?.label || row.linked_action)}${ch ? ` — ${esc(ch.lesson_name || "chapter")}` : " (chapitre introuvable)"}</button>
        </div>
        <p class="ws-tools-hint">Exécute cet outil chapitre sur le chapitre lié.</p></div></div>
      </div>`;
  }
  wrap.innerHTML = html;
  applyFieldVisibility(wrap);
  hydrateEdBlocks(wrap);
  bindAttachments(wrap);
  wrap.querySelector("[data-linked-action]")?.addEventListener("click", () => {
    const ch = state.chapters.find((c) => String(c.lesson_id) === String(row.chapter_id));
    if (ch) onChapterTool(row.linked_action, ch);
  });
}

// Parse a chips field's stored value into a Set of selected option values.
function chipsSelected(f, value) {
  if (f.multi) {
    if (f.json) {
      const p = parseMaybeJSON(value);
      return new Set(Array.isArray(p) ? p.map(String) : []);
    }
    if (f.join) return new Set(String(value ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    const p = parseMaybeJSON(value);
    if (Array.isArray(p)) return new Set(p.map(String));
    return value ? new Set([String(value)]) : new Set();
  }
  return new Set(value === null || value === undefined || value === "" ? [] : [String(value)]);
}

function chipsOptions(f, ctx) {
  let opts = f.optionsFrom ? (LOOKUP_FIELDS[f.optionsFrom]?.() || []) : (f.options || []);
  if (f.excludeSelf && ctx?.entity?.lesson_id) {
    opts = opts.filter((o) => String(o.value) !== String(ctx.entity.lesson_id));
  }
  return opts;
}

function fieldHTML(f, value, ctx = {}) {
  const id = `f_${f.key}`;
  const wide = ["textarea", "lines", "list", "ai-note", "reminder", "info", "attachments"].includes(f.type) || (f.type === "chips" && f.multi);
  let input = "";

  if (f.type === "textarea") {
    input = `<textarea id="${id}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || "")}">${esc(value ?? "")}</textarea>`;
  } else if (f.type === "toggle") {
    const on = !!value;
    return `
      <div class="ws-field ws-field-check">
        <button type="button" class="ws-bool${on ? " is-on" : ""}" data-bool="${f.key}" aria-pressed="${on}">
          <span class="ws-bool-ico" aria-hidden="true">✓</span><span class="ws-bool-txt">${esc(f.label)}</span>
        </button>
      </div>`;
  } else if (f.type === "chips") {
    const opts = chipsOptions(f, ctx);
    const sel = chipsSelected(f, value);
    const extra = !f.multi && opts.length && !opts.some((o) => sel.has(String(o.value))) && sel.size
      ? [{ value: [...sel][0], label: [...sel][0] }] : [];
    const all = [...opts, ...extra];
    // Single-select chips for frequency-like fields: keep an unknown current value visible.
    const merged = f.options && !f.multi && value && !all.some((o) => String(o.value) === String(value))
      ? [...all, { value: String(value), label: String(value) }] : all;
    input = `<div class="ws-fchips" data-chips="${f.key}" data-multi="${f.multi ? "1" : "0"}">${merged.map((o) => `
      <button type="button" class="ws-fchip${sel.has(String(o.value)) ? " is-sel" : ""}" data-value="${esc(o.value)}" ${o.color ? `style="--chip:${esc(o.color)}"` : ""}>${o.color ? '<i class="ws-fchip-dot" aria-hidden="true"></i>' : ""}${esc(o.label)}</button>`).join("")}</div>`;
    if (!merged.length) input += `<span class="ws-field-hint">Aucune option pour le moment — gérez-les dans Réglages → Workspace.</span>`;
    return `
      <div class="ws-field ${wide ? "ws-field-wide" : ""}">
        <span class="ws-field-label">${esc(f.label)}</span>
        ${input}
      </div>`;
  } else if (f.type === "list") {
    const p = parseMaybeJSON(value);
    let items = Array.isArray(p) ? p : null;
    if (!items) {
      const t = toLines(value).trim();
      items = t ? t.split("\n").map((s) => s.trim()).filter(Boolean) : [];
    }
    items = items.map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
    if (!items.length) items = [""];
    input = `<div class="ws-list" data-list="${f.key}">${items.map((v) => `
      <div class="ws-list-row">
        <input type="text" value="${esc(v)}" placeholder="${esc(f.placeholder || "")}">
        <button type="button" class="ws-icon-btn" data-list-del title="Retirer">✕</button>
      </div>`).join("")}
      <button type="button" class="ws-list-add" data-list-add>＋ Ajouter</button>
    </div>`;
  } else if (f.type === "recurrence") {
    return `
      <div class="ws-field ws-field-wide">
        <span class="ws-field-label">${esc(f.label)}</span>
        ${recurrenceHTML(ctx.entity)}
      </div>`;
  } else if (f.type === "reminder") {
    const ad = parseMaybeJSON(ctx.entity?.additional_data);
    const adObj = ad && typeof ad === "object" && !Array.isArray(ad) ? ad : {};
    const mode = adObj.reminder_mode || (ctx.entity?.remind ? "same_day" : "none");
    const rtime = adObj.reminder_time || "";
    input = `
      <div class="ws-segmented ws-remseg" data-remseg>
        <button type="button" class="ws-seg" data-rem="none" data-active="${mode === "none"}">Aucun</button>
        <button type="button" class="ws-seg" data-rem="day_before" data-active="${mode === "day_before"}">La veille</button>
        <button type="button" class="ws-seg" data-rem="same_day" data-active="${mode === "same_day"}">Le jour même</button>
        <button type="button" class="ws-seg" data-rem="custom" data-active="${mode === "custom"}">Personnalisé</button>
      </div>
      <input type="time" class="ws-rem-time" data-rem-time value="${esc(rtime)}" ${mode === "custom" ? "" : "hidden"}>`;
  } else if (f.type === "ai-note") {
    const entityId = f.aiKind === "chapter" ? ctx.entity?.lesson_id : f.aiKind === "subject" ? ctx.entity?.subject_id : null;
    input = `
      <div class="ws-ainote-bar">
        <button type="button" class="ws-btn ws-btn-ghost" data-ai-gen data-ai-kind="${f.aiKind}" ${entityId ? `data-ai-id="${entityId}"` : ""}>✦ Générer avec l'IA</button>
        <span class="ws-ainote-hint">Basé sur les informations du ${f.aiKind === "subject" ? "matière et ses chapitres" : "chapitre et sa matière"} — vous pouvez modifier le résultat.</span>
      </div>
      <textarea id="${id}" rows="3" placeholder="Laissez vide puis générez, ou écrivez votre propre note…">${esc(value ?? "")}</textarea>`;
  } else if (f.type === "edblocks") {
    return `
      <div class="ws-field ws-field-wide">
        <span class="ws-field-label">${esc(f.label)}</span>
        ${edBlocksFieldHTML(ctx.entity)}
      </div>`;
  } else if (f.type === "attachments") {
    return `
      <div class="ws-field ws-field-wide">
        <span class="ws-field-label">${esc(f.label)}</span>
        ${attFieldHTML(f, value, f.attKind || "items")}
      </div>`;
  } else if (f.type === "info") {
    const txt = INFO_FORMATTERS[f.key]?.(value) ?? "—";
    return `
      <div class="ws-field ws-field-wide">
        <span class="ws-field-label">${esc(f.label)}</span>
        <div class="ws-info">${esc(txt)}</div>
      </div>`;
  } else if (f.type === "datetime") {
    input = lumarisDateField({ id, value: toLocalInput(value), mode: "datetime" });
  } else if (f.type === "date") {
    input = lumarisDateField({ id, value: String(value ?? "").slice(0, 10), mode: "date" });
  } else if (f.type === "lines") {
    const raw = toLines(value);
    input = `${f.links ? linkChipsHTML(raw) : ""}<textarea id="${id}" rows="3" placeholder="${esc(f.placeholder || "")}">${esc(raw)}</textarea>`;
  } else {
    input = `<input type="${f.type === "number" ? "number" : "text"}" id="${id}" value="${esc(value ?? "")}" placeholder="${esc(f.placeholder || "")}" ${f.type === "number" ? 'step="any"' : ""}>`;
  }

  return `
    <label class="ws-field ${wide ? "ws-field-wide" : ""}">
      <span class="ws-field-label">${esc(f.label)}</span>
      ${input}
    </label>`;
}

// Show/hide fields driven by the task table AND the scope (scolaire/extrascolaire)
// chips. Works in the creation/edit modal and in the detail panel.
function applyFieldVisibility(container) {
  const scopeVal = container.querySelector('[data-chips="scope"] .ws-fchip.is-sel')?.dataset.value || "";
  const table = container.closest("#modalRoot")?.dataset.taskTable || state.selected?.table || "";
  container.querySelectorAll(".ws-fcond").forEach((w) => {
    const ft = w.dataset.ftables ? w.dataset.ftables.split(",").filter(Boolean) : [];
    const tableOk = ft.length === 0 || ft.includes(table);
    const scopeOk = !(w.dataset.fscope === "school" && scopeVal === "extra");
    w.hidden = !(tableOk && scopeOk);
  });
}

function collectFields(sections, titleKey, titleEl, root = document, prev = {}) {
  const fields = {};
  for (const sec of sections) {
    for (const f of sec.fields) {
      if (f.type === "info") continue; // AI-managed columns are never written back
      // Field filtered out for this table/scope — keep the stored value rather
      // than overwriting it with whatever the hidden input happens to hold.
      const cond = root.querySelector(`.ws-fcond[data-fkey="${f.key}"]`);
      if (cond?.hidden) continue;
      if (f.type === "toggle") {
        const b = root.querySelector(`[data-bool="${f.key}"]`);
        if (b) fields[f.key] = b.classList.contains("is-on") ? 1 : 0;
        continue;
      }
      if (f.type === "chips") {
        const wrap = root.querySelector(`[data-chips="${f.key}"]`);
        if (!wrap) continue; // field filtered out of the DOM — keep stored value
        const sel = [...(wrap.querySelectorAll(".ws-fchip.is-sel") || [])].map((b) => b.dataset.value);
        if (f.multi) {
          if (f.json) fields[f.key] = JSON.stringify(sel.map((v) => (/^\d+$/.test(v) ? Number(v) : v)));
          else if (f.join) fields[f.key] = sel.join(f.join);
          else fields[f.key] = JSON.stringify(sel);
        } else {
          fields[f.key] = sel[0] !== undefined ? sel[0] : (f.key === "path" ? "/" : null);
        }
        continue;
      }
      if (f.type === "list") {
        const listEl = root.querySelector(`[data-list="${f.key}"]`);
        if (!listEl) continue; // field filtered out for this table — keep stored value
        const rows = [...listEl.querySelectorAll(".ws-list-row input")]
          .map((i) => i.value.trim()).filter(Boolean);
        fields[f.key] = JSON.stringify(rows);
        continue;
      }
      if (f.type === "recurrence") {
        const wrap = root.querySelector("[data-recurrence]");
        if (!wrap) continue; // not rendered for this table — keep stored values
        const freq = wrap.dataset.freq || "custom";
        fields.frequency = freq;
        // Merge onto additional_data already collected by the reminder field
        // (it runs earlier in the same form and writes the same key).
        const prevAd = parseMaybeJSON(fields.additional_data ?? prev.additional_data);
        const ad = prevAd && typeof prevAd === "object" && !Array.isArray(prevAd) ? { ...prevAd } : {};
        if (freq === "custom") {
          delete ad.recurrence;
        } else {
          const rec = { freq };
          const h = wrap?.querySelector("[data-rec-h]")?.value;
          const m = wrap?.querySelector("[data-rec-m]")?.value;
          if (h !== undefined && h !== "") rec.time = `${String(h).padStart(2, "0")}:${String(m ?? "0").padStart(2, "0")}`;
          if (freq === "weekly") {
            const days = [...(wrap?.querySelectorAll("[data-wd].is-sel") || [])].map((b) => Number(b.dataset.wd)).sort((a, b) => a - b);
            if (days.length) rec.days = days;
          } else if (freq === "monthly") {
            const dom = Number(wrap?.querySelector("[data-rec-dom]")?.value);
            if (dom >= 1 && dom <= 31) rec.dom = dom;
          } else if (freq === "yearly") {
            const mo = Number(wrap?.querySelector("[data-rec-month]")?.value);
            const dy = Number(wrap?.querySelector("[data-rec-day]")?.value);
            if (mo >= 1 && mo <= 12) rec.month = mo;
            if (dy >= 1 && dy <= 31) rec.day = dy;
          }
          ad.recurrence = rec;
        }
        fields.additional_data = Object.keys(ad).length ? JSON.stringify(ad) : "";
        continue;
      }
      if (f.type === "edblocks") {
        const hidden = root.querySelector("[data-edblocks] [data-ed-json]");
        if (!hidden) continue; // filtered out — keep stored value
        let blocks = [];
        try { blocks = JSON.parse(hidden.value || "[]"); } catch { blocks = []; }
        // Merge onto additional_data already written by reminder/recurrence
        // (they run earlier in section order and share the same key).
        const prevAd = parseMaybeJSON(fields.additional_data ?? prev.additional_data);
        const ad = prevAd && typeof prevAd === "object" && !Array.isArray(prevAd) ? { ...prevAd } : {};
        if (blocks.length) ad.ed_blocks = blocks; else delete ad.ed_blocks;
        fields.additional_data = Object.keys(ad).length ? JSON.stringify(ad) : "";
        continue;
      }
      if (f.type === "attachments") {
        const hid = root.querySelector(`[data-att-field="${f.key}"] [data-att-ids]`);
        if (!hid) continue; // filtered out — keep stored value
        fields[f.key] = attJSON(hid.value);
        continue;
      }
      if (f.type === "reminder") {
        const seg = root.querySelector("[data-remseg]");
        const mode = seg?.querySelector('.ws-seg[data-active="true"]')?.dataset.rem || "none";
        fields.remind = mode === "none" ? 0 : 1;
        const prevAd = parseMaybeJSON(prev.additional_data);
        const ad = prevAd && typeof prevAd === "object" && !Array.isArray(prevAd) ? { ...prevAd } : {};
        if (mode === "none") {
          delete ad.reminder_mode; delete ad.reminder_time;
        } else {
          ad.reminder_mode = mode;
          if (mode === "custom") ad.reminder_time = root.querySelector("[data-rem-time]")?.value || "";
          else delete ad.reminder_time;
        }
        fields.additional_data = Object.keys(ad).length ? JSON.stringify(ad) : "";
        continue;
      }
      const el = root.querySelector(`[id="f_${f.key}"]`);
      if (!el) continue;
      if (f.type === "checkbox") fields[f.key] = el.checked ? 1 : 0;
      else if (f.type === "number") fields[f.key] = el.value === "" ? null : Number(el.value);
      else if (f.type === "datetime") fields[f.key] = fromLocalInput(el.value);
      else if (f.type === "lines") fields[f.key] = fromLines(el.value);
      else fields[f.key] = el.value;
    }
  }
  if (titleKey && titleEl) fields[titleKey] = titleEl.value;
  return fields;
}

// ================= Field interactions (delegated: modal + detail panel) =================
function collectAiContext(scope, kind) {
  const parts = [];
  scope.querySelectorAll("input[id^='f_'], textarea[id^='f_']").forEach((el) => {
    const v = (el.value || "").trim();
    if (!v) return;
    const key = el.id.slice(2);
    parts.push(`${key}: ${v.length > 6000 ? `${v.slice(0, 6000)}…` : v}`);
  });
  if (kind === "chapter") {
    const sid = scope.querySelector('[data-chips="subject_id"] .ws-fchip.is-sel')?.dataset.value;
    const sub = state.subjects.find((s) => String(s.subject_id) === String(sid));
    if (sub?.subject_name) parts.unshift(`subject_name: ${sub.subject_name}`);
    if (sub?.teacher_notes) parts.unshift(`subject_teacher_notes: ${sub.teacher_notes}`);
  }
  return parts.join("\n").slice(0, 14000);
}

async function runAiComment(btn) {
  const field = btn.closest(".ws-field");
  const ta = field?.querySelector("textarea");
  const scope = btn.closest(".ws-modal, #detailPanel") || document;
  const { aiKind: kind, aiId: id } = btn.dataset;
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = "Génération…";
  try {
    let payload;
    if (kind === "chapter" && id) payload = { lesson_id: Number(id) };
    else if (kind === "subject" && id) payload = { subject_id: Number(id) };
    else payload = { context: collectAiContext(scope, kind) };
    const res = await apiLearning("ai-comment", payload);
    if (ta) { ta.value = res.comment || ""; ta.focus(); }
    toast("Commentaire généré");
  } catch (e) { toast(e.message); }
  btn.disabled = false; btn.textContent = old;
}

function bindFieldInteractions() {
  document.addEventListener("click", (e) => {
    const gen = e.target.closest("[data-ai-gen]");
    if (gen) { e.preventDefault(); runAiComment(gen); return; }

    const chip = e.target.closest(".ws-fchip");
    if (chip && chip.closest("[data-chips]")) {
      const wrap = chip.closest("[data-chips]");
      if (wrap.dataset.multi === "1") chip.classList.toggle("is-sel");
      else {
        wrap.querySelectorAll(".ws-fchip.is-sel").forEach((c) => c.classList.remove("is-sel"));
        chip.classList.add("is-sel");
      }
      if (wrap.dataset.chips === "scope") {
        const container = chip.closest(".ws-modal") || chip.closest("#detailPanel") || document;
        applyFieldVisibility(container);
      }
      return;
    }

    const bool = e.target.closest("[data-bool]");
    if (bool) {
      bool.classList.toggle("is-on");
      bool.setAttribute("aria-pressed", bool.classList.contains("is-on"));
      return;
    }

    const rf = e.target.closest("[data-rf]");
    if (rf) {
      const wrap = rf.closest("[data-recurrence]");
      wrap.dataset.freq = rf.dataset.rf;
      wrap.querySelectorAll("[data-rf]").forEach((s) => s.setAttribute("data-active", s === rf ? "true" : "false"));
      wrap.querySelectorAll("[data-recfreq]").forEach((c) => { c.hidden = c.dataset.recfreq !== rf.dataset.rf; });
      return;
    }

    const wd = e.target.closest("[data-wd]");
    if (wd) { wd.classList.toggle("is-sel"); return; }

    const seg = e.target.closest("[data-remseg] .ws-seg");
    if (seg) {
      const segWrap = seg.closest("[data-remseg]");
      segWrap.querySelectorAll(".ws-seg").forEach((s) => s.setAttribute("data-active", "false"));
      seg.setAttribute("data-active", "true");
      const time = segWrap.parentElement?.querySelector("[data-rem-time]");
      if (time) time.hidden = seg.dataset.rem !== "custom";
      return;
    }

    // Collapsible form/detail sections
    const secHead = e.target.closest(".ws-dsec > h3");
    if (secHead) {
      secHead.parentElement.classList.toggle("is-collapsed");
      return;
    }

    const del = e.target.closest("[data-list-del]");
    if (del) { del.closest(".ws-list-row")?.remove(); return; }

    const add = e.target.closest("[data-list-add]");
    if (add) {
      const list = add.closest("[data-list]");
      const row = document.createElement("div");
      row.className = "ws-list-row";
      const ph = list.querySelector(".ws-list-row input")?.placeholder || "";
      row.innerHTML = `<input type="text" placeholder="${esc(ph)}"><button type="button" class="ws-icon-btn" data-list-del title="Retirer">✕</button>`;
      list.insertBefore(row, add);
      row.querySelector("input")?.focus();
      return;
    }

    // ----- ÉcoleDirecte interaction blocks -----
    const edAdd = e.target.closest("[data-ed-add]");
    if (edAdd) {
      const field = edAdd.closest("[data-edblocks]");
      const rows = field?.querySelector(".ed-rows");
      if (rows) {
        const tmp = document.createElement("div");
        tmp.innerHTML = edBlockRowHTML(newEdBlock());
        const rowEl = tmp.firstElementChild;
        rows.appendChild(rowEl);
        syncEdBlocks(field);
        hydrateEdBlocks(field);
        rowEl.querySelector("[data-ed-title]")?.focus();
      }
      return;
    }

    const edDel = e.target.closest("[data-ed-del]");
    if (edDel) {
      const row = edDel.closest("[data-edrow]");
      const field = edDel.closest("[data-edblocks]");
      row?.remove();
      if (field) syncEdBlocks(field);
      return;
    }
  });

  // ED block editor inputs → keep the hidden JSON in sync; preset/mode
  // changes also refresh the live region.
  const onEdEdit = (e) => {
    const t = e.target;
    if (!t.matches("[data-ed-title], [data-ed-preset], [data-ed-mode]")) return;
    const field = t.closest("[data-edblocks]");
    if (!field) return;
    syncEdBlocks(field);
    if (t.matches("[data-ed-preset], [data-ed-mode]")) hydrateEdBlocks(field);
  };
  document.addEventListener("input", onEdEdit);
  document.addEventListener("change", onEdEdit);
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

  // Table the form targets — fixed for edits, selectable for creations.
  const initialTable =
    opts.table || opts.presetTable ||
    (state.view === "recurring" ? "repeat_tasks" : state.view === "events" ? "events" : "tasks");
  const formTable = () =>
    opts.table ||
    root.querySelector("#m_kind")?.value ||
    initialTable;

  const fieldVisible = (f, table, scopeVal) =>
    (!f.tables || f.tables.includes(table)) &&
    !(f.scope === "school" && scopeVal === "extra");

  const bodyHtml = defs.sections.map((sec, si) => {
    const entity = { ...values, lesson_id: values.lesson_id ?? (kind === "chapter" ? id : undefined), subject_id: values.subject_id ?? (kind === "subject" ? id : undefined) };
    const items = sec.fields.map((f) => `
      <div class="ws-fcond" data-fkey="${f.key}" data-ftables="${(f.tables || []).join(",")}" data-fscope="${f.scope || ""}" ${fieldVisible(f, initialTable, values.scope) ? "" : "hidden"}>
        ${fieldHTML(f, values[f.key], { entity })}
      </div>`).join("");
    // First section stays open ("base" fields); the rest start collapsed.
    return `<div class="ws-dsec${si > 0 ? " is-collapsed" : ""}"><h3>${sec.title}</h3><div class="ws-dsec-body"><div class="ws-dsec-in"><div class="ws-dgrid">${items}</div></div></div></div>`;
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
          ${kind === "task" && !id && ["all", "recurring", "events", "afterclass"].includes(state.view) ? `
          <label class="ws-field ws-field-wide"><span class="ws-field-label">Type</span>
            <select id="m_kind">
              ${state.view === "all" || state.view === "afterclass" ? `<option value="tasks">Tâche</option><option value="events">Événement</option>` : ""}
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
  root.dataset.taskTable = initialTable;
  applyFieldVisibility(root);
  hydrateEdBlocks(root);
  bindAttachments(root);

  // Show/hide table-specific fields when the creation type changes.
  const kindSel = root.querySelector("#m_kind");
  kindSel?.addEventListener("change", () => {
    root.dataset.taskTable = kindSel.value;
    applyFieldVisibility(root);
  });

  const collect = () => collectFields(defs.sections, kind === "task" ? "title" : null, kind === "task" ? root.querySelector("#m_title") : null, root.querySelector(".ws-modal"), values);

  root.querySelector("[data-save-tpl]").addEventListener("click", async () => {
    const fields = collect();
    const name = await lumarisPrompt("Nom du modèle :", kind === "task" ? (fields.title || "Modèle de tâche") : `Modèle ${kind === "subject" ? "de matière" : "de chapitre"}`);
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
        if (id) {
          await apiSubjects("update-chapter", { lesson_id: id, fields });
        } else {
          // AI cleanup on pasted lesson text before saving — fixes recognition
          // errors and arranges sentences. Falls back to the raw text.
          const srcKey = fields.raw_lessons?.trim() ? "raw_lessons" : (fields.raw_recorded_lessons?.trim() ? "raw_recorded_lessons" : null);
          if (srcKey) {
            try {
              const cleaned = await apiLearning("clean-lesson", { text: fields[srcKey], source: "chapter-form" });
              if (cleaned?.text?.trim()) fields[srcKey] = cleaned.text;
            } catch { /* keep raw */ }
          }
          const res = await apiSubjects("create-chapter", { fields });
          const newId = res?.chapter?.lesson_id;
          const hasSource = !!srcKey;
          if (newId && hasSource) {
            toast("Chapitre créé — génération des flashcards en cours…");
            apiLearning("flashcards", { lesson_id: newId })
              .then((r) => { toast(`✓ ${r.count} flashcards générées`); loadAll(); })
              .catch((e) => toast(`Flashcards : ${e.message}`));
          }
        }
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

// ================= Evaluation (contrôle / examen) creation =================
// Creates a dated event carrying the exam config (notation /x, max duration),
// flags the chapter as awaiting evaluation, then offers the prep plan.
function openEvaluationModal() {
  const root = $("#modalRoot");
  root.hidden = false;

  const subjOpts = state.subjects.map((s) => `<option value="${s.subject_id}">${esc(s.subject_name || `Matière ${s.subject_id}`)}</option>`).join("");
  const chOpts = state.chapters.map((c) => `<option value="${c.lesson_id}" data-sub="${c.subject_id ?? ""}">${esc(c.lesson_name || `Chapitre ${c.lesson_id}`)}</option>`).join("");
  const defaultDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  root.innerHTML = `
    <div class="ws-modal-backdrop">
      <div class="ws-modal ws-modal-form" role="dialog" aria-modal="true">
        <div class="ws-modal-head">
          <h2>Nouvelle évaluation</h2>
          <button class="ws-icon-btn" type="button" data-close>✕</button>
        </div>
        <div class="ws-modal-body">
          <div class="ws-dsec"><h3>Évaluation</h3><div class="ws-dsec-body"><div class="ws-dsec-in"><div class="ws-dgrid">
            <label class="ws-field ws-field-wide"><span class="ws-field-label">Titre</span>
              <input type="text" id="ev_title" placeholder="ex. Contrôle — Chapitre 3"></label>
            <label class="ws-field"><span class="ws-field-label">Matière</span>
              <select id="ev_subject"><option value="">—</option>${subjOpts}</select></label>
            <label class="ws-field"><span class="ws-field-label">Chapitre</span>
              <select id="ev_chapter"><option value="">—</option>${chOpts}</select></label>
            <label class="ws-field"><span class="ws-field-label">Date</span>
              ${lumarisDateField({ id: "ev_date", value: defaultDate, mode: "date" })}</label>
            <label class="ws-field"><span class="ws-field-label">Notation (/x)</span>
              <input type="number" id="ev_notation" min="1" max="100" step="0.5" value="20"></label>
            <label class="ws-field"><span class="ws-field-label">Durée max (min, vide = aucune)</span>
              <input type="number" id="ev_duration" min="1" max="600" placeholder="ex. 60"></label>
          </div></div></div></div>
          <div class="ct-exam">
            <div class="ct-exam-head">
              <span class="ws-field-label">Plan de préparation — le contrôle pilote les dates</span>
              <button class="ws-btn ws-btn-ghost" type="button" data-add-row>＋ Ajouter une étape</button>
            </div>
            <div class="ct-exam-list" data-rows>${examPlanListHTML(examPlanDefaults(defaultDate))}</div>
          </div>
          <p class="ws-tools-hint">L'évaluation est créée comme événement daté. Si un chapitre est choisi, sa date de test et le statut « en attente d'évaluation » sont renseignés. Chaque étape du plan devient une tâche datée, liée à une action du chapitre et à une méthode — tout est modifiable avant création.</p>
        </div>
        <div class="ws-modal-foot">
          <button class="ws-btn ws-btn-ghost" type="button" data-close>Annuler</button>
          <button class="ws-btn ws-btn-primary" type="button" data-submit>Créer l'évaluation</button>
        </div>
      </div>
    </div>`;

  const close = () => { root.hidden = true; root.innerHTML = ""; };
  root.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  root.querySelector(".ws-modal-backdrop").addEventListener("click", (e) => { if (e.target.classList.contains("ws-modal-backdrop")) close(); });

  const subjSel = root.querySelector("#ev_subject");
  const chSel = root.querySelector("#ev_chapter");
  const titleEl = root.querySelector("#ev_title");
  const syncChapters = () => {
    const sid = subjSel.value;
    [...chSel.options].forEach((o) => {
      if (!o.value) return;
      o.hidden = !!sid && o.dataset.sub !== sid;
    });
    if (chSel.selectedOptions[0]?.hidden) chSel.value = "";
  };
  subjSel.addEventListener("change", syncChapters);
  syncChapters();

  const autoTitle = () => {
    const ch = state.chapters.find((c) => String(c.lesson_id) === chSel.value);
    const sub = state.subjects.find((s) => String(s.subject_id) === subjSel.value);
    const what = ch?.lesson_name || sub?.subject_name;
    if (what && !titleEl.dataset.touched) titleEl.value = `Évaluation — ${what}`;
  };
  chSel.addEventListener("change", autoTitle);
  subjSel.addEventListener("change", autoTitle);
  titleEl.addEventListener("input", () => { titleEl.dataset.touched = "1"; });

  // ---- prep plan rows: exam date drives untouched dates, rows add/remove ----
  const rowsEl = root.querySelector("[data-rows]");
  const dateEl = root.querySelector("#ev_date");
  dateEl.addEventListener("change", () => {
    const iso = dateEl.value;
    if (!iso) return;
    rowsEl.querySelectorAll("[data-row]").forEach((row, i) => {
      const off = EXAM_PHASES[i]?.offset;
      const d = row.querySelector(".ct-exam-date");
      if (off !== undefined && d && !d.dataset.touched) {
        const dt = new Date(`${iso}T12:00:00`);
        dt.setDate(dt.getDate() + off);
        d.value = dt.toISOString().slice(0, 10);
      }
    });
    refreshDatePickerLabels(root);
  });
  rowsEl.addEventListener("input", (e) => {
    if (e.target.classList.contains("ct-exam-date")) e.target.dataset.touched = "1";
  });
  rowsEl.addEventListener("click", (e) => {
    const del = e.target.closest("[data-row-del]");
    if (del) del.closest("[data-row]")?.remove();
  });
  root.querySelector("[data-add-row]").addEventListener("click", () => {
    rowsEl.insertAdjacentHTML("beforeend", examPlanListHTML([{ title: "", desc: "", date: dateEl.value || defaultDate, action: "", method: "" }]));
  });

  root.querySelector("[data-submit]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const chId = chSel.value ? Number(chSel.value) : null;
    const subId = subjSel.value ? Number(subjSel.value) : (chId ? Number(state.chapters.find((c) => c.lesson_id === chId)?.subject_id) || null : null);
    const date = root.querySelector("#ev_date").value;
    const title = titleEl.value.trim() || `Évaluation — ${state.chapters.find((c) => c.lesson_id === chId)?.lesson_name || state.subjects.find((s) => s.subject_id === subId)?.subject_name || "générale"}`;
    const notation = Math.max(1, Number(root.querySelector("#ev_notation").value) || 20);
    const durRaw = root.querySelector("#ev_duration").value;
    const maxMinutes = durRaw ? Math.max(1, Number(durRaw)) : null;

    btn.disabled = true; btn.textContent = "Création…";
    try {
      const remindDate = date ? new Date(`${date}T08:00:00`) : null;
      await apiTasks("create", {
        table: "events",
        fields: {
          title,
          remind: 1,
          remind_date: remindDate && !isNaN(remindDate) ? remindDate.toISOString() : "",
          chapter_id: chId,
          subject_id: subId,
          linked_action: "eval",
          additional_data: JSON.stringify({ evaluation: { notation, max_minutes: maxMinutes } }),
        },
      });
      const chapter = chId ? state.chapters.find((c) => c.lesson_id === chId) : null;
      if (chapter && date) {
        await apiSubjects("update-chapter", { lesson_id: chId, fields: { tests_date: date, awaiting_evaluation: 1 } });
      }
      const planItems = collectExamPlanRows(rowsEl);
      let planCreated = 0;
      if (planItems.length) {
        planCreated = await createExamPlanTasks(planItems, { lesson_id: chId, subject_id: subId }, date);
      }
      toast(`Évaluation créée${planCreated ? ` — ${planCreated} tâche${planCreated > 1 ? "s" : ""} de préparation` : ""}`);
      close();
      await loadAll();
    } catch (err) {
      toast(err.message);
      btn.disabled = false; btn.textContent = "Créer l'évaluation";
    }
  });
}

// ================= Chapter tools: import & AI =================
function onChapterTool(tool, chapter) {
  const lessonId = chapter.lesson_id;
  if (tool === "import") {
    return openImportModal({
      onImport: async (target, text, meta = {}) => {
        // AI cleanup first — fixes recognition errors, arranges sentences,
        // applies the student's extra instructions. Falls back to raw text.
        let outText = text;
        try {
          const cleaned = await apiLearning("clean-lesson", {
            text, instructions: meta.instructions || "", source: meta.source || "import",
          });
          if (cleaned?.text?.trim()) outText = cleaned.text;
        } catch { /* keep the raw extraction */ }
        const cur = chapter[target] || "";
        const fields = { [target]: cur ? `${cur}\n\n${outText}` : outText };
        if (meta.session_date) fields.session_date = meta.session_date;
        await apiSubjects("update-chapter", { lesson_id: lessonId, fields });
        toast("Contenu de la leçon importé");
        await loadAll();
        if (meta.gen_flashcards) {
          toast("Génération des flashcards en cours…");
          apiLearning("flashcards", { lesson_id: lessonId, append: true })
            .then((r) => { toast(`✓ ${r.added ?? r.count} flashcards générées`); loadAll(); })
            .catch((e) => toast(`Flashcards : ${e.message}`));
        }
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
  if (tool === "examplan") return openExamPlan(chapter);
  if (tool === "ask") return openAskAI(chapter);
  if (tool === "edit") return openEntityModal("chapter", lessonId, chapter);
  if (tool === "editai") return openEditCourseModal(chapter);
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
          <span class="ws-gen-state" data-state>${done?.[i] ? "fait" : "…"}</span>
        </div>`).join("");
    },
    setItem(i, stateName) {
      const item = this.list.querySelector(`[data-i="${i}"]`);
      if (!item) return;
      item.querySelector("[data-state]").textContent = stateName === "done" ? "fait" : stateName === "error" ? "erreur" : stateName === "run" ? "…" : stateName;
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
    state.view = btn.dataset.section === "subjects" ? "subjects" : btn.dataset.section === "timetable" ? "timetable" : "all";
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
      lumarisPrompt("Nom du modèle :").then((name) => {
        if (!name?.trim()) return;
        const kind = templateKind();
        apiTasks("template-save", { kind, name: name.trim(), payload: {} })
          .then(loadAll)
          .then(() => toast("Modèle ajouté"))
          .catch((err) => toast(err.message));
      });
    }
  });

  $("#templateEdit").addEventListener("click", async () => {
    const t = state.template;
    if (!t) return;
    const name = await lumarisPrompt("Nom du modèle :", t.name);
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
    if (!(await lumarisConfirm(`Supprimer le modèle « ${t.name} » ? Les tâches et événements créés à partir de celui-ci seront déplacés à la corbeille.`))) return;
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

  $("#dayFilterBtn")?.addEventListener("click", () => {
    selectDate({
      anchor: $("#dayFilterBtn"),
      value: state.dayFilter,
      onPick: (v) => {
        state.dayFilter = v || "";
        renderAll();
      },
    });
  });

  // Active attribute filter (set by clicking a task chip) — click to clear.
  $("#attrFilterBtn")?.addEventListener("click", () => {
    state.attrFilter = null;
    renderAll();
    updateAttrFilterBtn();
  });

  let searchTimer;
  $("#searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); renderContent(); renderStats(); }, 150);
  });

  $("#newBtn").addEventListener("click", () => {
    if (state.view === "subjects") return openEntityModal("subject", null, null, { template: state.template });
    if (state.view === "subject") return openEntityModal("chapter", null, state.currentSubject ? { subject_id: state.currentSubject.subject_id } : null, { template: state.template });
    if (["all", "recurring", "events", "afterclass"].includes(state.view)) {
      return openCreateChooser({
        onPick: (key) => {
          if (key === "task" || key === "event") {
            const preset = {
              all: { task: "tasks", event: "events" },
              recurring: { task: "repeat_tasks", event: "repeat_events" },
              events: { task: "events", event: "events" },
              afterclass: { task: "tasks", event: "events" },
            }[state.view]?.[key];
            openEntityModal("task", null, null, { template: state.template, presetTable: preset });
          } else if (key === "chapter") {
            openEntityModal("chapter", null, null, { template: state.template });
          } else if (key === "evaluation") {
            openEvaluationModal();
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
      const fields = collectFields(cfg.sections, cfg.titleKey, document.getElementById("dTitle"), document.getElementById("detailPanel"), sel.row);
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
  initDatePicker();
  bindUI();
  bindFieldInteractions();
  loadAll();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
