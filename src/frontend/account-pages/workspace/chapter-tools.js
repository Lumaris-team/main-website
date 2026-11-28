// Chapter tools — creation type chooser, review methods, spaced repetition,
// flashcard reviewer, AI Q&A and evaluation flag.
// Wired from script.js via setChapterApi().

import { lumarisDateField, refreshDatePickerLabels } from "./date-picker.js";
import { lumarisPrompt } from "/lib/dialog.js";

let api = null;
export function setChapterApi(apis) { api = apis; }

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- modal helper ----------
function openModal({ title, body, foot = "", wide = false, onMount } = {}) {
  const root = document.getElementById("modalRoot");
  root.hidden = false;
  root.innerHTML = `
    <div class="ws-modal-backdrop">
      <div class="ws-modal ${wide ? "ws-modal-form" : "ws-gen-modal"}" role="dialog" aria-modal="true">
        <div class="ws-modal-head"><h2>${esc(title)}</h2><button class="ws-icon-btn" type="button" data-close>✕</button></div>
        <div class="ws-modal-body">${body}</div>
        ${foot ? `<div class="ws-modal-foot">${foot}</div>` : ""}
      </div>
    </div>`;
  const close = () => { root.hidden = true; root.innerHTML = ""; };
  root.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  root.querySelector(".ws-modal-backdrop").addEventListener("click", (e) => { if (e.target.classList.contains("ws-modal-backdrop")) close(); });
  const modal = { close, el: root.querySelector(".ws-modal") };
  onMount?.(modal);
  return modal;
}

// ---------- duration estimate ----------
function chapterSourceLen(ch) {
  return String(ch?.body || "").length + String(ch?.raw_lessons || "").length + String(ch?.raw_recorded_lessons || "").length;
}
// Rough indicative durations (minutes) — OSS 120B is slow, flashcards/tests faster.
export function estimateMinutes(ch, kind = "course") {
  const chars = chapterSourceLen(ch);
  const base = { course: 15000, flashcards: 22000, activities: 18000, ask: 0 }[kind] || 15000;
  if (!base) return 0;
  return Math.max(1, Math.min(15, Math.round(chars / base) + (kind === "course" ? 2 : 1)));
}

export function confirmGenerate({ title, minutes, detail = "", confirmLabel = "Générer", onGo }) {
  openModal({
    title,
    body: `
      <div class="ct-estimate">
        <div class="ct-estimate-icon">≈</div>
        <div>
          <p class="ct-estimate-line"><strong>~${minutes} min</strong> de durée indicative</p>
          <p class="ct-estimate-sub">GPT OSS 120B génère section par section — vous pouvez partir et revenir, la progression est sauvegardée.${detail ? ` ${esc(detail)}` : ""}</p>
        </div>
      </div>`,
    foot: `
      <button class="ws-btn ws-btn-ghost" type="button" data-close>Annuler</button>
      <button class="ws-btn ws-btn-primary" type="button" data-go>${esc(confirmLabel)}</button>`,
    onMount(m) {
      m.el.querySelector("[data-go]").addEventListener("click", () => { m.close(); onGo?.(); });
    },
  });
}

// ---------- creation type chooser ----------
export function openCreateChooser({ onPick }) {
  const choices = [
    { key: "task", label: "Tâche", desc: "Une chose à faire, avec planification et métadonnées" },
    { key: "event", label: "Événement", desc: "Un événement ponctuel ou daté" },
    { key: "chapter", label: "Chapitre", desc: "Un chapitre de cours avec outils IA" },
    { key: "evaluation", label: "Évaluation", desc: "Un contrôle ou examen daté — notation /x, durée max et plan de révision" },
  ];
  openModal({
    title: "Créer quelque chose",
    wide: true,
    body: `<div class="ct-choice-grid">${choices.map((c) => `
      <button class="ct-choice" type="button" data-pick="${c.key}">
        <span class="ct-choice-label">${c.label}</span>
        <span class="ct-choice-desc">${c.desc}</span>
      </button>`).join("")}</div>`,
    onMount(m) {
      m.el.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
        const key = b.dataset.pick;
        m.close();
        onPick?.(key);
      }));
    },
  });
}

// ---------- chapter helpers ----------
function parseJSONField(v, fallback = null) {
  if (!v) return fallback;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

async function updateChapter(lessonId, fields) {
  await api.apiSubjects("update-chapter", { lesson_id: lessonId, fields });
  await api.reload?.();
}

// ---------- evaluation flag ----------
export async function toggleEvaluation(chapter) {
  const next = chapter.awaiting_evaluation ? 0 : 1;
  await updateChapter(chapter.lesson_id, { awaiting_evaluation: next });
  api.toast?.(next ? "Marqué en attente d'évaluation" : "Marque d'évaluation retirée");
}

// ---------- review menu (ALL spec methods, grouped by objective) ----------
const REVIEW_CATEGORIES = [
  {
    title: "1 · Apprendre un cours",
    methods: [
      { key: "feynman", label: "Méthode Feynman", desc: "Explique une notion avec tes mots — l'IA traque les incompréhensions" },
      { key: "guided", label: "Apprentissage guidé", desc: "Notion par notion, avec vérification à chaque étape" },
      { key: "chunking", label: "Segmentation", desc: "Petits blocs logiques de 3-5 idées, vérifiés un par un" },
      { key: "examples", label: "Par les exemples", desc: "Des exemples concrets pour illustrer chaque notion" },
      { key: "analogies", label: "Par les analogies", desc: "Relie chaque notion abstraite au quotidien" },
      { key: "socratic", label: "Questionnement socratique", desc: "L'IA te guide par questions, sans jamais donner la réponse" },
      { key: "dual_coding", label: "Dual coding", desc: "Texte + schémas décrits pour chaque notion" },
      { key: "active_recall", label: "Rappel actif", desc: "Questions sans indices — tu dois retrouver l'info de mémoire" },
    ],
  },
  {
    title: "2 · Réviser un cours",
    methods: [
      { key: "spaced", label: "Répétition espacée", desc: "Plan J0 → J+N : choisis semaines et intervalles", builtIn: true },
      { key: "targeted", label: "Révision ciblée", desc: "Uniquement tes notions les plus fragiles (selon ta maîtrise)" },
      { key: "cumulative", label: "Révision cumulative", desc: "Mélange tout le cours, le plus ancien d'abord — anti-oubli" },
      { key: "interleaving", label: "Révision intercalée", desc: "Mélange les types de notions au lieu de bloquer par sujet" },
      { key: "leitner", label: "Leitner", desc: "Cartes mémoire notées easy/hard — l'IA reprogramme la prochaine revue" },
      { key: "smart_plan", label: "Plan de révision intelligent", desc: "Document : quoi réviser, dans quel ordre, à quel rythme", gen: true },
    ],
  },
  {
    title: "3 · Relecture rapide",
    methods: [
      { key: "skim", label: "Skimming", desc: "Guide de lecture rapide : structure et grandes idées", gen: true },
      { key: "scan", label: "Scanning", desc: "Fiche de repérage : dates, définitions, formules, noms", gen: true },
      { key: "keywords", label: "Mots-clés", desc: "Les termes essentiels avec définition en une ligne", gen: true },
      { key: "outline_read", label: "Titres & sous-titres", desc: "Le squelette du cours pour parcourir vite", gen: true },
      { key: "synth_read", label: "Lecture synthétique", desc: "Version courte (~300 mots) de l'essentiel", gen: true },
      { key: "reactivation", label: "Réactivation", desc: "Rappels ultra-courts en rafale sur tout le cours" },
    ],
  },
  {
    title: "4 · Tester ses connaissances",
    methods: [
      { key: "quick_check", label: "Mini-test", desc: "3-5 questions — les notions clés sont-elles comprises ?" },
      { key: "open_questions", label: "Questions ouvertes", desc: "Tu formules ta réponse, l'IA évalue sa complétude" },
      { key: "true_false", label: "Vrai ou faux", desc: "Affirmations à vérifier, une par une" },
      { key: "fill_blanks", label: "Texte à trous", desc: "Retrouve les mots manquants des phrases du cours" },
      { key: "reverse_questions", label: "Questions inversées", desc: "L'IA donne la réponse, tu retrouves la question" },
      { key: "restatement", label: "Test de restitution", desc: "Retelle une section sans notes — l'IA compare" },
      { key: "diagnose", label: "Test diagnostique", desc: "Évalue ton niveau initial et liste les lacunes" },
      { key: "activities", label: "QCM · Examen blanc", desc: "Test chronométré, note /x, remarque de progression", builtIn: true },
    ],
  },
  {
    title: "5 · Structurer le cours",
    methods: [
      { key: "course_outline", label: "Plan hiérarchique", desc: "Chapitres → parties → notions, avec descriptions", gen: true },
      { key: "mindmap", label: "Carte mentale", desc: "La structure du cours en arborescence", gen: true },
      { key: "concept_map", label: "Concept map", desc: "Réseau de concepts et leurs relations logiques", gen: true },
      { key: "table", label: "Tableau comparatif", desc: "Notion | définition | exemple | erreur fréquente", gen: true },
      { key: "timeline", label: "Frise chronologique", desc: "Tous les événements datés dans l'ordre", gen: true },
      { key: "logic_tree", label: "Arbre logique", desc: "Cause → conséquence → dépendance entre notions", gen: true },
      { key: "glossary", label: "Glossaire", desc: "Tous les termes importants définis", gen: true },
      { key: "priorities", label: "Hiérarchisation", desc: "Notions classées : fondamental / secondaire / complémentaire", gen: true },
    ],
  },
  {
    title: "6 · Approfondir en s'exerçant",
    methods: [
      { key: "exercises", label: "Exercices progressifs", desc: "Du plus simple au plus dur, corrigé à chaque étape" },
      { key: "direct_application", label: "Application directe", desc: "Chaque exercice applique UNE notion immédiatement" },
      { key: "problems", label: "Résolution de problèmes", desc: "Problèmes concrets avec indices avant la solution" },
      { key: "transfer", label: "Transfert", desc: "Applique une notion du cours à un contexte nouveau" },
      { key: "pbl", label: "Apprentissage par problèmes", desc: "Tu découvres les notions en résolvant un problème ouvert" },
      { key: "learning_from_errors", label: "Apprentissage par erreurs", desc: "Repère et corrige les erreurs plantées par l'IA" },
      { key: "synthesis_exercises", label: "Exercices de synthèse", desc: "Mobilise plusieurs sections du cours à la fois" },
      { key: "case_study", label: "Cas pratiques", desc: "Scénarios réels à analyser avec le cours" },
      { key: "oral", label: "Interrogation orale", desc: "Examen oral simulé — question par question, verdict final" },
    ],
  },
  {
    title: "7 · Fiches de révision",
    methods: [
      { key: "summary", label: "Fiche synthétique", desc: "Résumé structuré : notions clés, définitions, formules", gen: true },
      { key: "fiches", label: "Fiches recto-verso", desc: "15-30 cartes Q/R couvrant tout le cours", gen: true },
      { key: "fiche_theme", label: "Fiches thématiques", desc: "Une fiche par notion : points clés + exemple + erreur", gen: true },
      { key: "fiche_definitions", label: "Fiche définitions", desc: "Toutes les définitions importantes regroupées", gen: true },
      { key: "fiche_formulas", label: "Fiche formules", desc: "Formules, propriétés et conditions d'utilisation", gen: true },
      { key: "fiche_method", label: "Fiche méthode", desc: "Les démarches pas à pas pour résoudre", gen: true },
      { key: "fiche_errors", label: "Fiche erreurs", desc: "Erreurs fréquentes et leurs corrections", gen: true },
      { key: "fiche_chrono", label: "Fiche chronologique", desc: "Dates et événements importants", gen: true },
    ],
  },
  {
    title: "8 · Flashcards",
    methods: [
      { key: "flashcards", label: "Flashcards", desc: "Génère TOUTES les cartes (Q/R, cloze, inversées, formules, multi-niveaux) puis parcours-les", builtIn: true },
    ],
  },
  {
    title: "9 · Revoir le cours du jour",
    methods: [
      { key: "immediate_recall", label: "Rappel actif immédiat", desc: "Questions juste après le cours pour consolider" },
      { key: "blurting", label: "Blurting", desc: "Rejette tout ce dont tu te souviens, puis compare au cours" },
      { key: "mini_test", label: "Mini-test de compréhension", desc: "3-5 questions + verdict sur les notions fragiles" },
      { key: "today_fiche", label: "Fiche automatique du jour", desc: "Synthèse de la séance la plus récente", gen: true },
      { key: "prerequisites", label: "Révision des prérequis", desc: "Les connaissances antérieures nécessaires au nouveau cours" },
    ],
  },
  {
    title: "10 · Fonctionnalités intelligentes",
    methods: [
      { key: "error_analysis", label: "Analyse des erreurs", desc: "Détecte tes erreurs récurrentes et leurs causes" },
      { key: "gap_prediction", label: "Prédiction des lacunes", desc: "Les notions futures qui te poseront problème" },
    ],
  },
];

const GENERATOR_METHODS = new Set([
  "summary", "fiches", "mindmap", "table",
  "skim", "scan", "keywords", "outline_read", "synth_read",
  "course_outline", "concept_map", "timeline", "logic_tree", "glossary", "priorities",
  "fiche_definitions", "fiche_formulas", "fiche_method", "fiche_errors", "fiche_chrono", "fiche_theme",
  "smart_plan", "today_fiche",
]);

export function openReviewMenu(chapter) {
  const hasFlash = !!parseJSONField(chapter.flashcards)?.cards?.length;
  const hasActs = !!parseJSONField(chapter.tests)?.activities?.length;
  const plan = parseJSONField(chapter.review_plan);
  const descFor = (key) => {
    if (key === "flashcards") return hasFlash ? "Parcourez les cartes générées" : "Pas encore de flashcards — générez-les d'abord";
    if (key === "activities") return hasActs ? "Test chronométré avec note /x et remarque de progression" : "Pas encore d'activités — générez-les d'abord";
    if (key === "spaced") return plan ? `${(plan.sessions || []).length} séances planifiées` : "Planifiez les révisions par semaine / intervalle";
    return null;
  };
  const disabledFor = (key) => (key === "flashcards" && !hasFlash) || (key === "activities" && !hasActs);
  const runFor = (key) => {
    if (key === "flashcards") return () => openFlashcardReview(chapter);
    if (key === "activities") return () => openTestSimulation(chapter);
    if (key === "spaced") return () => openSpacedReview(chapter);
    return () => openLearnSession(chapter, key);
  };

  // Mastery block — per-notion scores accumulated by learn sessions.
  let masteryHTML = "";
  let weakNotions = [];
  try {
    const m = typeof chapter.mastery === "string" ? JSON.parse(chapter.mastery) : chapter.mastery;
    const scores = Object.entries(m?.notion_scores || {});
    if (scores.length) {
      const weak = scores.filter(([, v]) => (v.score ?? 100) < 60).sort((a, b) => a[1].score - b[1].score).slice(0, 6);
      weakNotions = weak;
      masteryHTML = `
        <div class="ct-mastery">
          <div class="ct-mastery-head">
            <span class="ct-mastery-avg">Maîtrise ${m.avg ?? "—"} %</span>
            <span class="ct-mastery-count">${scores.length} notion${scores.length > 1 ? "s" : ""} évaluée${scores.length > 1 ? "s" : ""}</span>
          </div>
          ${weak.length ? `<div class="ct-mastery-weak">À retravailler : ${weak.map(([n, v]) => `<em>${esc(n)} (${v.score} %)</em>`).join(" · ")}</div>
            <button class="ws-btn ws-btn-ghost ct-gap-open" type="button" data-gaps>＋ Ressources pour les lacunes</button>` : `<div class="ct-mastery-weak ok">Aucune notion fragile — tout est au-dessus de 60 %.</div>`}
        </div>`;
    }
  } catch {}

  openModal({
    title: `Révision — ${chapter.lesson_name || "chapitre"}`,
    wide: true,
    body: masteryHTML + REVIEW_CATEGORIES.map((cat) => `
      <div class="ct-rev-cat">
        <div class="ct-rev-cat-title">${cat.title}</div>
        <div class="ct-choice-grid ct-choice-grid-3">${cat.methods.map((m) => {
          const desc = descFor(m.key) ?? m.desc;
          const disabled = disabledFor(m.key);
          return `
          <button class="ct-choice ${disabled ? "is-disabled" : ""}" type="button" data-pick="${m.key}" ${disabled ? "disabled" : ""}>
            <span class="ct-choice-label">${m.label}</span>
            <span class="ct-choice-desc">${esc(desc)}</span>
          </button>`;
        }).join("")}</div>
      </div>`).join(""),
    onMount(m) {
      m.el.querySelector("[data-gaps]")?.addEventListener("click", () => openGapActions(chapter, weakNotions));
      m.el.querySelectorAll("[data-pick]:not(:disabled)").forEach((b) => b.addEventListener("click", () => {
        m.close();
        runFor(b.dataset.pick)?.();
      }));
    },
  });
}

// Turn weak notions (lacunes) into durable resources: Quizlet/site links,
// gap-targeted flashcards, or a targeted review session.
function openGapActions(chapter, weak) {
  const names = weak.map(([n]) => n).filter(Boolean);
  if (!names.length) return;
  const focus = names.join(", ");
  openModal({
    title: `Lacunes — ${chapter.lesson_name || "chapitre"}`,
    body: `
      <p class="ct-note">Ces notions sont sous 60 % de maîtrise. Transforme-les en ressources durables ou attaque-les directement :</p>
      <div class="ct-gap-list">${weak.map(([n, v]) => `<span class="ct-gap-chip">${esc(n)} <em>${v?.score ?? "—"} %</em></span>`).join("")}</div>
      <div class="ct-gap-actions">
        <button class="ws-btn ws-btn-ghost" type="button" data-act="quizlet">＋ Quizlet</button>
        <button class="ws-btn ws-btn-ghost" type="button" data-act="site">＋ Site ressource</button>
        <button class="ws-btn ws-btn-ghost" type="button" data-act="cards">⚡ Flashcards ciblées</button>
        <button class="ws-btn ws-btn-primary" type="button" data-act="targeted">🎯 Travailler les lacunes</button>
      </div>`,
    onMount(m) {
      const appendLine = async (key, url) => {
        const cur = String(chapter[key] || "").split("\n").map((s) => s.trim()).filter(Boolean);
        if (cur.some((u) => u === url)) return false;
        cur.push(url);
        const joined = cur.join("\n");
        await updateChapter(chapter.lesson_id, { [key]: joined });
        chapter[key] = joined;
        return true;
      };
      m.el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
        const act = b.dataset.act;
        if (act === "quizlet" || act === "site") {
          const url = (await lumarisPrompt(act === "quizlet" ? "URL du set Quizlet :" : "URL du site/ressource :")).trim();
          if (!url) return;
          try {
            const added = await appendLine(act === "quizlet" ? "linked_quizlets" : "linked_websites", url);
            b.textContent = added ? "✓ Ajouté" : "Déjà lié";
            api.toast?.(added ? "Ressource liée au chapitre" : "Cette URL est déjà liée");
            api.reload?.();
          } catch (e) { api.toast?.(e.message); }
        } else if (act === "cards") {
          b.disabled = true;
          b.textContent = "Génération…";
          try {
            const res = await api.apiLearning("flashcards", { lesson_id: chapter.lesson_id, focus, append: true });
            b.textContent = `✓ ${res.added ?? 0} ajoutées (${res.count} total)`;
            api.toast?.(`${res.added ?? 0} flashcards ciblées ajoutées`);
            api.reload?.();
          } catch (e) { b.disabled = false; b.textContent = "⚡ Flashcards ciblées"; api.toast?.(e.message); }
        } else if (act === "targeted") {
          m.close();
          openLearnSession(chapter, "targeted");
        }
      }));
    },
  });
}

// AI-assisted course edit: describe the problem, the model rewrites only what
// is necessary and decides whether flashcards need regenerating.
export function openEditCourseModal(chapter) {
  const hasBody = !!String(chapter.body || "").trim();
  const hasRaw = !!(String(chapter.raw_lessons || "").trim() || String(chapter.raw_recorded_lessons || "").trim());
  openModal({
    title: `Retoucher le cours — ${chapter.lesson_name || "chapitre"}`,
    wide: true,
    body: `
      <p class="ct-note">Explique le problème ou la modification souhaitée. L'IA réécrit <strong>uniquement le nécessaire</strong> — tout le reste du cours est conservé tel quel. Elle vérifie aussi si les flashcards sont impactées.</p>
      <label class="ws-field ws-field-wide"><span class="ws-field-label">Problème / modification souhaitée</span>
        <textarea data-instruction rows="5" placeholder="ex. La section sur les dérivées contient une erreur à la formule 3, il faut la corriger ; ou : ajoute un exemple concret sur…"></textarea>
      </label>
      <div class="ws-field"><span class="ws-field-label">Éléments modifiables</span>
        <div class="ct-edit-targets">
          <label class="ct-edit-target"><input type="checkbox" data-target="body" ${hasBody ? "checked" : ""} ${hasBody ? "" : "disabled"}> Cours généré</label>
          <label class="ct-edit-target"><input type="checkbox" data-target="raw_lessons" ${hasRaw ? "checked" : ""} ${hasRaw ? "" : "disabled"}> Texte brut de la leçon</label>
          <label class="ct-edit-target"><input type="checkbox" data-target="flashcards" checked> Flashcards (si concernées)</label>
        </div>
        ${!hasBody && !hasRaw ? '<p class="ct-note">Ce chapitre ne contient encore ni cours ni texte brut — importe d\'abord une leçon.</p>' : ""}
      </div>`,
    foot: `
      <button class="ws-btn ws-btn-ghost" type="button" data-close>Annuler</button>
      <button class="ws-btn ws-btn-primary" type="button" data-go>Appliquer la modification</button>`,
    onMount(m) {
      m.el.querySelector("[data-go]").addEventListener("click", async () => {
        const instruction = m.el.querySelector("[data-instruction]").value.trim();
        if (!instruction) { api.toast?.("Décris d'abord la modification"); return; }
        const targets = [...m.el.querySelectorAll("[data-target]:checked")].map((c) => c.dataset.target);
        if (!targets.length) { api.toast?.("Coche au moins un élément à modifier"); return; }
        const go = m.el.querySelector("[data-go]");
        go.disabled = true;
        go.textContent = "IA au travail…";
        try {
          const res = await api.apiLearning("edit-course", { lesson_id: chapter.lesson_id, instruction, targets });
          m.close();
          const applied = Array.isArray(res.applied) && res.applied.length ? res.applied.join(" + ") : "rien";
          const flash = res.flashcards && res.flashcards !== "not_requested" ? ` — flashcards : ${res.flashcards}` : "";
          api.toast?.(`Cours modifié (${applied})${flash}`);
          api.reload?.();
          // Show the AI summary if there is one.
          if (res.summary) {
            openModal({
              title: "Résumé de la modification",
              body: `<p class="ct-debrief-summary">${esc(res.summary)}</p>
                <p class="ct-note">Éléments modifiés : <strong>${esc(applied)}</strong>${flash ? `<br>Flashcards : ${esc(res.flashcards)}` : ""}</p>`,
              foot: `<button class="ws-btn ws-btn-primary" type="button" data-close>Fermer</button>`,
            });
          }
        } catch (e) {
          go.disabled = false;
          go.textContent = "Appliquer la modification";
          api.toast?.(e.message);
        }
      });
    },
  });
}

// ---------- learn session: interactive tutoring or one-shot generator ----------
function mdLite(text) {
  // Minimal markdown → HTML for generated supports. Block-based so lists,
  // headers and paragraphs never produce orphan tags.
  const escT = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inline = (s) => escT(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  return String(text ?? "").split(/\n{2,}/).map((block) => {
    const lines = block.split("\n").filter((l) => l.trim());
    if (!lines.length) return "";
    if (lines.every((l) => /^\s*[-*] /.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`;
    }
    const first = lines[0].trim();
    const h = first.match(/^(#{1,4})\s+(.*)$/);
    if (h && lines.length === 1) {
      const lvl = Math.min(h[1].length + 1, 4);
      return `<h${lvl}>${inline(h[2])}</h${lvl}>`;
    }
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  }).join("");
}

export function openLearnSession(chapter, methodKey) {
  const methodDef = REVIEW_CATEGORIES.flatMap((c) => c.methods).find((m) => m.key === methodKey);
  const label = methodDef?.label || methodKey;

  if (GENERATOR_METHODS.has(methodKey)) {
    const modal = openModal({
      title: `${label} — ${chapter.lesson_name || "chapitre"}`,
      wide: true,
      body: `<div class="ct-gen-loading"><div class="ct-gen-spinner"></div><p>GPT OSS 120B génère le document…</p><p class="ct-note">Cela peut prendre quelques minutes — patientez.</p></div>`,
      foot: `<button class="ws-btn ws-btn-ghost" type="button" data-close>Fermer</button>`,
      onMount(m) {
        (async () => {
          try {
            const res = await api.apiLearning("learn", { lesson_id: chapter.lesson_id, method: methodKey });
            const body = m.el.querySelector(".ws-modal-body");
            body.innerHTML = `
              <div class="ct-material">
                <div class="ct-material-bar">
                  <button class="ws-btn ws-btn-ghost" type="button" data-copy>⧉ Copier</button>
                  <button class="ws-btn ws-btn-ghost" type="button" data-regen>↻ Regénérer</button>
                </div>
                <div class="ct-material-doc">${mdLite(res.material || "")}</div>
              </div>`;
            body.querySelector("[data-copy]").addEventListener("click", async (e) => {
              try { await navigator.clipboard.writeText(res.material || ""); e.target.textContent = "✓ Copié"; setTimeout(() => { e.target.textContent = "⧉ Copier"; }, 1500); } catch {}
            });
            body.querySelector("[data-regen]").addEventListener("click", () => { m.close(); openLearnSession(chapter, methodKey); });
          } catch (e) {
            m.el.querySelector(".ws-modal-body").innerHTML = `<p class="ct-note">Erreur : ${esc(e.message)}</p>`;
          }
        })();
      },
    });
    return modal;
  }

  // Interactive tutoring session
  const history = [];
  const modal = openModal({
    title: `${label} — ${chapter.lesson_name || "chapitre"}`,
    wide: true,
    body: `
      <div class="ct-chat">
        <div class="ct-chat-log" data-log>
          <div class="ct-msg ct-msg-ai">Connexion au tuteur…</div>
        </div>
        <div class="ct-chat-input">
          <input type="text" data-input placeholder="Ta réponse ou ta question…" autocomplete="off">
          <button class="ws-btn ws-btn-primary" type="button" data-send>Envoyer</button>
        </div>
      </div>`,
    foot: `<button class="ws-btn ws-btn-ghost" type="button" data-end>Terminer la séance</button>`,
    onMount(m) {
      const log = m.el.querySelector("[data-log]");
      const input = m.el.querySelector("[data-input]");
      const sendBtn = m.el.querySelector("[data-send]");
      let busy = false;

      const push = (role, text) => {
        const div = document.createElement("div");
        div.className = `ct-msg ct-msg-${role === "user" ? "user" : "ai"}`;
        div.innerHTML = mdLite(text);
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
        return div;
      };
      const typing = () => {
        const div = document.createElement("div");
        div.className = "ct-msg ct-msg-ai ct-msg-typing";
        div.innerHTML = "<i></i><i></i><i></i>";
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
        return div;
      };

      const ask = async (message) => {
        if (busy) return;
        busy = true;
        sendBtn.disabled = true;
        const t = typing();
        try {
          const res = await api.apiLearning("learn", {
            lesson_id: chapter.lesson_id, method: methodKey, history, message,
          });
          t.remove();
          if (message) { history.push({ role: "user", content: message }); push("user", message); }
          history.push({ role: "ai", content: res.reply || "…" });
          push("ai", res.reply || "…");
        } catch (e) {
          t.remove();
          push("ai", `Erreur : ${e.message}`);
        }
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      };

      sendBtn.addEventListener("click", () => {
        const v = input.value.trim();
        if (!v) return;
        input.value = "";
        ask(v);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); sendBtn.click(); }
      });

      // Kick off the session — tutor speaks first.
      ask("");

      // End session → AI debrief: per-notion scores + what to work next.
      m.el.querySelector("[data-end]").addEventListener("click", async () => {
        const endBtn = m.el.querySelector("[data-end]");
        endBtn.disabled = true;
        endBtn.textContent = "Analyse…";
        try {
          const transcript = history.map((h) => `${h.role === "user" ? "Student" : "Tutor"}: ${h.content}`).join("\n");
          if (transcript.trim().length > 40) {
            const debrief = await api.apiLearning("learn-debrief", {
              lesson_id: chapter.lesson_id, method: methodKey, transcript,
            });
            m.close();
            showDebrief(chapter, methodKey, debrief);
            api.reload?.();
            return;
          }
        } catch { /* debrief is best-effort — just close */ }
        m.close();
      });
    },
  });
  return modal;
}

// Recap after a learn session: notion scores + AI recommendation.
function showDebrief(chapter, methodKey, debrief) {
  const notions = Array.isArray(debrief?.notions) ? debrief.notions : [];
  const rec = debrief?.recommendation;
  const recDef = rec?.method ? REVIEW_CATEGORIES.flatMap((c) => c.methods).find((x) => x.key === rec.method) : null;
  const weak = notions.filter((n) => (n.score ?? 100) < 60).sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 6);
  const weakTuples = weak.map((n) => [n.notion, { score: n.score }]);
  openModal({
    title: `Bilan de séance — ${chapter.lesson_name || "chapitre"}`,
    wide: true,
    body: `
      ${debrief?.summary ? `<p class="ct-debrief-summary">${esc(debrief.summary)}</p>` : ""}
      ${debrief?.avg != null ? `<div class="ct-mastery-head"><span class="ct-mastery-avg">Maîtrise ${debrief.avg} %</span></div>` : ""}
      <div class="ct-debrief-notions">${notions.slice(0, 12).map((n) => {
        const pct = Math.max(0, Math.min(100, n.score ?? 0));
        const cls = pct < 40 ? "lo" : pct < 65 ? "mid" : "hi";
        return `<div class="ct-debrief-row">
          <span class="ct-debrief-name">${esc(n.notion)}</span>
          <span class="ct-debrief-bar"><i class="${cls}" style="width:${pct}%"></i></span>
          <span class="ct-debrief-score">${pct} %</span>
        </div>`;
      }).join("") || '<p class="ct-note">Aucune notion assez évaluée pour être notée.</p>'}</div>
      ${rec ? `<div class="ct-debrief-rec">
        <div class="ct-debrief-rec-title">Prochaine étape suggérée</div>
        <div class="ct-debrief-rec-body">${recDef ? `<strong>${esc(recDef.label)}</strong> — ` : ""}${esc(rec.focus || "")}</div>
      </div>` : ""}`,
    foot: `
      ${weak.length ? `<button class="ws-btn ws-btn-ghost" type="button" data-gaps>＋ Ressources pour les ${weak.length} lacune${weak.length > 1 ? "s" : ""}</button>` : ""}
      ${recDef ? `<button class="ws-btn ws-btn-primary" type="button" data-go>Travailler : ${esc(recDef.label)}</button>` : ""}
      <button class="ws-btn ws-btn-ghost" type="button" data-close>Fermer</button>`,
    onMount(m) {
      m.el.querySelector("[data-gaps]")?.addEventListener("click", () => { m.close(); openGapActions(chapter, weakTuples); });
      m.el.querySelector("[data-go]")?.addEventListener("click", () => {
        m.close();
        openLearnSession(chapter, rec.method);
      });
    },
  });
}

// ---------- flashcard reviewer ----------
export function openFlashcardReview(chapter) {
  const parsed = parseJSONField(chapter.flashcards);
  let cards = Array.isArray(parsed?.cards) ? parsed.cards.filter((c) => c?.front) : [];
  if (!cards.length) { api.toast?.("Pas de flashcards sur ce chapitre"); return; }
  // shuffle
  cards = cards.map((c) => ({ c, r: Math.random() })).sort((a, b) => a.r - b.r).map((x) => x.c);

  let i = 0, flipped = false, known = 0, again = [];
  const totalCards = cards.length; // stable denominator across re-queue passes
  const timerKey = `lumaris_fc_timer_${chapter.lesson_id}`;
  const savedTimer = Number(localStorage.getItem(timerKey)) || 0;
  const modal = openModal({
    title: `Flashcards — ${i + 1}/${cards.length}`,
    body: `
      <div class="ct-flash">
        <div class="ct-tcfg">
          <label class="ws-field"><span class="ws-field-label">Temps par carte (s — 0 = désactivé)</span>
            <input type="number" data-timer min="0" max="600" value="${savedTimer}"></label>
        </div>
        <div class="ct-flash-card" data-card tabindex="0">
          <div class="ct-flash-inner" data-inner>
            <div class="ct-flash-face ct-flash-front" data-front></div>
            <div class="ct-flash-face ct-flash-back" data-back></div>
          </div>
        </div>
        <div class="ct-flash-foot">
          <div class="ct-timer" data-timer-display hidden>--:--</div>
          <div class="ct-flash-progress"><div class="ct-flash-bar" data-bar></div></div>
        </div>
        <div class="ct-flash-actions">
          <button class="ws-btn ws-btn-ghost" type="button" data-again>↺ À revoir</button>
          <button class="ws-btn ws-btn-primary" type="button" data-know>Je sais ✓</button>
        </div>
      </div>`,
    foot: `<button class="ws-btn ws-btn-ghost" type="button" data-close>Fermer</button>`,
    wide: true,
    onMount(m) {
      const card = m.el.querySelector("[data-card]");
      const inner = m.el.querySelector("[data-inner]");
      const front = m.el.querySelector("[data-front]");
      const back = m.el.querySelector("[data-back]");
      const bar = m.el.querySelector("[data-bar]");
      const title = m.el.querySelector(".ws-modal-head h2");
      const timerInput = m.el.querySelector("[data-timer]");
      const timerEl = m.el.querySelector("[data-timer-display]");

      // Per-card countdown: auto-flips to the answer side at 0, once per card.
      let timerLeft = 0, timerIv = null, autoFlipped = false;
      const stopTimer = () => { clearInterval(timerIv); timerIv = null; timerEl.hidden = true; };
      const startTimer = () => {
        stopTimer();
        const secs = Math.max(0, Number(timerInput.value) || 0);
        if (!secs) return;
        timerLeft = secs; autoFlipped = false;
        timerEl.hidden = false;
        const tick = () => {
          if (!m.el.isConnected) { stopTimer(); return; }
          timerEl.textContent = fmtClock(timerLeft);
          timerEl.classList.toggle("is-low", timerLeft <= 5);
          if (timerLeft <= 0) {
            stopTimer();
            if (!flipped && !autoFlipped) { autoFlipped = true; flip(); }
            return;
          }
          timerLeft--;
        };
        tick();
        timerIv = setInterval(tick, 1000);
      };
      timerInput.addEventListener("change", () => {
        localStorage.setItem(timerKey, timerInput.value);
        startTimer(); // apply immediately to the current card too
      });

      const show = () => {
        flipped = false;
        inner.classList.remove("is-flipped");
        front.textContent = cards[i].front || "";
        back.textContent = cards[i].back || "";
        title.textContent = `Flashcards — ${i + 1}/${cards.length}`;
        bar.style.width = `${(i / cards.length) * 100}%`;
        startTimer();
      };
      const flip = () => { flipped = !flipped; inner.classList.toggle("is-flipped", flipped); };
      card.addEventListener("click", flip);
      card.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } });

      const next = (knew) => {
        if (knew) known++; else again.push(cards[i]);
        i++;
        if (i >= cards.length) {
          // re-queue missed cards once
          if (again.length && again.length < cards.length) {
            const missed = again.length;
            cards = again.splice(0); i = 0;
            api.toast?.(`${missed} carte${missed > 1 ? "s" : ""} à revoir`);
          } else {
            m.el.querySelector(".ws-modal-body").innerHTML = `
              <div class="ct-done">
                <div class="ct-done-icon">✓</div>
                <p><strong>${known}/${totalCards}</strong> cartes maîtrisées</p>
                ${again.length ? `<p class="ct-done-sub">${again.length} carte(s) marquée(s) pour révision.</p>` : ""}
              </div>`;
            title.textContent = "Révision terminée";
            return;
          }
        }
        show();
      };
      m.el.querySelector("[data-know]").addEventListener("click", () => next(true));
      m.el.querySelector("[data-again]").addEventListener("click", () => next(false));
      show();
    },
  });
  return modal;
}

// ---------- spaced repetition planner ----------
function addDays(dateStr, days) {
  const d = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function openSpacedReview(chapter) {
  let plan = parseJSONField(chapter.review_plan) || { interval_days: 3, sessions: [] };
  const startDate = chapter.session_date || new Date().toISOString().slice(0, 10);

  const modal = openModal({
    title: `Révision espacée — ${chapter.lesson_name || "chapitre"}`,
    wide: true,
    body: `
      <div class="ct-spaced">
        <div class="ct-spaced-form">
          <label class="ws-field"><span class="ws-field-label">Date de début (date de séance)</span>
            ${lumarisDateField({ id: "ct_start", value: startDate, mode: "date", attrs: "data-start" })}</label>
          <label class="ws-field"><span class="ws-field-label">Intervalle entre séances (jours)</span>
            <input type="number" data-interval min="1" max="30" value="${plan.interval_days || 3}"></label>
          <label class="ws-field"><span class="ws-field-label">Nombre de séances</span>
            <input type="number" data-count min="1" max="52" value="${(plan.sessions || []).length || 8}"></label>
          <label class="ws-field"><span class="ws-field-label">Durée de séance (min — chrono)</span>
            <input type="number" data-session-min min="1" max="480" value="${plan.session_minutes || 20}"></label>
          <button class="ws-btn ws-btn-primary" type="button" data-gen>Générer le plan</button>
        </div>
        <div class="ct-spaced-list" data-list>${renderSessionList(plan.sessions || [], plan)}</div>
      </div>`,
    foot: `<button class="ws-btn ws-btn-ghost" type="button" data-close>Fermer</button>`,
    onMount(m) {
      const list = m.el.querySelector("[data-list]");
      m.el.querySelector("[data-gen]").addEventListener("click", async () => {
        const start = m.el.querySelector("[data-start]").value || startDate;
        const interval = Math.max(1, Number(m.el.querySelector("[data-interval]").value) || 3);
        const count = Math.min(52, Math.max(1, Number(m.el.querySelector("[data-count]").value) || 8));
        const sessionMin = Math.min(480, Math.max(1, Number(m.el.querySelector("[data-session-min]").value) || 20));
        const sessions = Array.from({ length: count }, (_, i) => ({
          n: i + 1, date: addDays(start, i * interval), done: false,
        }));
        plan = { interval_days: interval, session_minutes: sessionMin, sessions };
        list.innerHTML = renderSessionList(sessions, plan);
        try {
          await updateChapter(chapter.lesson_id, { review_plan: JSON.stringify(plan), session_date: start });
          api.toast?.(`Plan de révision enregistré — ${count} séances tous les ${interval} j`);
        } catch (e) { api.toast?.(e.message); }
      });
      const markDone = async (idx) => {
        const sessions = plan.sessions || [];
        if (!sessions[idx]) return;
        sessions[idx].done = true;
        list.innerHTML = renderSessionList(sessions, plan);
        try { await updateChapter(chapter.lesson_id, { review_plan: JSON.stringify(plan) }); } catch {}
        api.toast?.(`Séance #${sessions[idx].n} terminée ✓`);
      };

      list.addEventListener("click", async (e) => {
        const run = e.target.closest("[data-run]");
        if (run) {
          const idx = Number(run.dataset.run);
          const s = (plan.sessions || [])[idx];
          if (s) openSessionRunner(s, plan.session_minutes || 20, () => markDone(idx));
          return;
        }
        const btn = e.target.closest("[data-toggle]");
        if (!btn) return;
        const idx = Number(btn.dataset.toggle);
        const sessions = plan.sessions || [];
        if (!sessions[idx]) return;
        sessions[idx].done = !sessions[idx].done;
        btn.closest("[data-sess]").classList.toggle("is-done", !!sessions[idx].done);
        btn.textContent = sessions[idx].done ? "✓" : "○";
        try { await updateChapter(chapter.lesson_id, { review_plan: JSON.stringify(plan) }); } catch {}
      });
    },
  });
  return modal;
}

function renderSessionList(sessions, plan) {
  if (!sessions.length) return `<p class="ct-note">Pas encore de plan — choisissez un intervalle et générez-en un.</p>`;
  const today = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
  return sessions.map((s, i) => {
    const due = !s.done && s.date <= today;
    return `
    <div class="ct-sess ${s.done ? "is-done" : ""}" data-sess>
      <span class="ct-sess-n">#${s.n}</span>
      <span class="ct-sess-date">${esc(s.date)}${due ? ' <em class="ct-sess-due">à faire</em>' : ""}</span>
      ${due ? `<button class="ws-icon-btn" type="button" data-run="${i}" title="Lancer un chrono de séance">▶</button>` : ""}
      <button class="ws-icon-btn" type="button" data-toggle="${i}" title="Marquer comme fait">${s.done ? "✓" : "○"}</button>
    </div>`;
  }).join("");
}

// ---------- session runner: custom countdown for a spaced-review session ----------
function fmtClock(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;
}

function openSessionRunner(session, minutes, onFinish) {
  let total = Math.max(1, Number(minutes) || 20) * 60;
  let left = total, iv = null, running = false, finished = false;

  const modal = openModal({
    title: `Séance #${session.n} — ${esc(session.date)}`,
    body: `
      <div class="ct-runner">
        <div class="ct-runner-time" data-time>${fmtClock(left)}</div>
        <div class="ct-runner-bar"><div class="ct-runner-fill" data-fill style="width:0%"></div></div>
        <div class="ct-runner-ctrl">
          <label class="ws-field"><span class="ws-field-label">Durée (minutes)</span>
            <input type="number" data-dur min="1" max="480" value="${Math.round(total / 60)}"></label>
          <div class="ct-runner-btns">
            <button class="ws-btn ws-btn-primary" type="button" data-toggle>▶ Démarrer</button>
            <button class="ws-btn ws-btn-ghost" type="button" data-restart>↺</button>
          </div>
        </div>
        <p class="ct-note" data-status>Révisez le cours de votre côté — le chrono se cale sur la durée choisie.</p>
      </div>`,
    foot: `
      <button class="ws-btn ws-btn-ghost" type="button" data-close>Fermer</button>
      <button class="ws-btn ws-btn-primary" type="button" data-finish>Marquer comme faite ✓</button>`,
    onMount(m) {
      const timeEl = m.el.querySelector("[data-time]");
      const fill = m.el.querySelector("[data-fill]");
      const status = m.el.querySelector("[data-status]");
      const durInput = m.el.querySelector("[data-dur]");
      const toggleBtn = m.el.querySelector("[data-toggle]");
      const finishBtn = m.el.querySelector("[data-finish]");

      const render = () => {
        timeEl.textContent = fmtClock(left);
        fill.style.width = `${total ? ((total - left) / total) * 100 : 0}%`;
        timeEl.classList.toggle("is-low", running && left <= 60);
      };
      const stop = () => { clearInterval(iv); iv = null; running = false; toggleBtn.textContent = "▶ Démarrer"; };
      const finish = (auto) => {
        if (finished) return;
        finished = true;
        stop();
        left = 0; render();
        status.textContent = auto ? "Temps écoulé — séance terminée." : "Séance clôturée.";
        onFinish?.();
        if (auto) setTimeout(() => { if (m.el.isConnected) m.close(); }, 2200);
      };
      const tick = () => {
        if (!m.el.isConnected) { stop(); return; }
        left--;
        if (left <= 0) { finish(true); return; }
        render();
      };

      toggleBtn.addEventListener("click", () => {
        if (running) { stop(); render(); return; }
        if (finished) return;
        running = true;
        toggleBtn.textContent = "⏸ Pause";
        iv = setInterval(tick, 1000);
      });
      m.el.querySelector("[data-restart]").addEventListener("click", () => {
        if (finished) return;
        stop();
        total = Math.max(1, Number(durInput.value) || 20) * 60;
        left = total;
        status.textContent = "Révisez le cours de votre côté — le chrono se cale sur la durée choisie.";
        render();
      });
      durInput.addEventListener("change", () => {
        if (running || finished) return;
        total = Math.max(1, Number(durInput.value) || 20) * 60;
        left = total;
        render();
      });
      finishBtn.addEventListener("click", () => finish(false));
      render();
    },
  });
  return modal;
}

// ---------- Examen blanc (notation /x + max duration + progression remark) ----------
export function openTestSimulation(chapter) {
  const parsed = parseJSONField(chapter.tests);
  const list = Array.isArray(parsed?.activities) ? parsed.activities : [];
  if (!list.length) { api.toast?.("Pas encore d'activités — générez-les d'abord"); return; }
  openModal({
    title: `Examen blanc — ${chapter.lesson_name || "chapitre"}`,
    body: `
      <div class="ct-testcfg">
        <p class="ct-note">${list.length} exercice(s) seront servis comme un vrai test. Définissez l'échelle de notation et la limite de temps — un compte à rebours démarre au lancement, et une remarque de progression basée sur les attentes de la prof est générée à la fin.</p>
        <div class="ct-testcfg-grid">
          <label class="ws-field"><span class="ws-field-label">Notation (/x)</span>
            <input type="number" data-notation min="1" max="100" step="0.5" value="20"></label>
          <label class="ws-field"><span class="ws-field-label">Durée max (minutes, vide = aucune)</span>
            <input type="number" data-duration min="1" max="600" placeholder="ex. 60"></label>
        </div>
      </div>`,
    foot: `
      <button class="ws-btn ws-btn-ghost" type="button" data-close>Annuler</button>
      <button class="ws-btn ws-btn-primary" type="button" data-start>Lancer le test ▶</button>`,
    onMount(m) {
      m.el.querySelector("[data-start]").addEventListener("click", () => {
        const notation = Math.max(1, Number(m.el.querySelector("[data-notation]").value) || 20);
        const durRaw = m.el.querySelector("[data-duration]").value;
        const maxMinutes = durRaw ? Math.max(1, Number(durRaw)) : null;
        m.close();
        api.onRunTest?.(list, chapter, { notation, maxMinutes });
      });
    },
  });
}

// ---------- Ask AI about the course ----------
export function openAskAI(chapter) {
  const log = [];
  const modal = openModal({
    title: `Poser une question — ${chapter.lesson_name || "chapitre"}`,
    wide: true,
    body: `
      <div class="ct-ask">
        <div class="ct-ask-log" data-log>
          <p class="ct-note">Posez n'importe quelle question sur le cours de ce chapitre. Les réponses utilisent un modèle rapide basé sur le contenu du cours.</p>
        </div>
        <div class="ct-ask-input">
          <input type="text" data-q placeholder="ex. Explique la différence entre mitose et méiose…" autocomplete="off">
          <button class="ws-btn ws-btn-primary" type="button" data-send>Demander</button>
        </div>
      </div>`,
    foot: `<button class="ws-btn ws-btn-ghost" type="button" data-close>Fermer</button>`,
    onMount(m) {
      const logEl = m.el.querySelector("[data-log]");
      const input = m.el.querySelector("[data-q]");
      const send = m.el.querySelector("[data-send]");
      const ask = async () => {
        const q = input.value.trim();
        if (!q) return;
        input.value = "";
        send.disabled = true;
        logEl.insertAdjacentHTML("beforeend", `<div class="ct-msg ct-msg-user">${esc(q)}</div>`);
        const pending = document.createElement("div");
        pending.className = "ct-msg ct-msg-ai ct-msg-loading";
        pending.textContent = "Réflexion…";
        logEl.appendChild(pending);
        logEl.scrollTop = logEl.scrollHeight;
        try {
          const r = await api.apiLearning("ask", { lesson_id: chapter.lesson_id, question: q });
          pending.classList.remove("ct-msg-loading");
          pending.textContent = r.answer || "Pas de réponse.";
        } catch (e) {
          pending.textContent = `Erreur : ${e.message}`;
        }
        send.disabled = false;
        logEl.scrollTop = logEl.scrollHeight;
        input.focus();
      };
      send.addEventListener("click", ask);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });
    },
  });
  return modal;
}

// ---------- exam (contrôle) planner ----------
// Builds a succession of dated tasks before tests_date — each linked to a
// chapter action and a learning method, all editable before creation.
export const EXAM_PHASES = [
  { key: "announce", title: "Identifier le programme et les attentes", offset: -7, action: "ask", desc: "Repérer le programme du contrôle et noter les attentes de la prof : format, durée, points forts." },
  { key: "diagnose", title: "Tester les connaissances et travailler les lacunes", offset: -5, action: "activities", desc: "Faire un test blanc pour identifier les points faibles, puis travailler les lacunes." },
  { key: "deepen", title: "Approfondir les notions difficiles et exercices", offset: -3, action: "course", desc: "Reprendre les notions difficiles à fond et enchaîner les exercices ciblés." },
  { key: "eve", title: "Dernière vérification et revoir les erreurs", offset: -1, action: "review", desc: "Refaire les exercices ratés et vérifier les définitions et méthodes clés." },
  { key: "day", title: "Rappel léger des points essentiels", offset: 0, action: "flashcards", desc: "Révision courte le jour J — les points essentiels, pas de marathon." },
];

export function examDatePlus(iso, days) {
  const d = iso ? new Date(`${iso}T12:00:00`) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function examRowHTML(p, methods, actions) {
  return `
    <div class="ct-exam-row" data-row>
      <div class="ct-exam-row-main">
        <input type="text" class="ct-exam-title" value="${esc(p.title)}" placeholder="Titre de l'étape">
        ${lumarisDateField({ id: "", value: p.date, mode: "date", inputClass: "ct-exam-date" })}
      </div>
      <input type="text" class="ct-exam-desc" value="${esc(p.desc)}" placeholder="Détails pour la tâche (optionnel)">
      <div class="ct-exam-row-meta">
        <select class="ct-exam-action" title="Action chapitre liée">
          <option value="">Action —</option>
          ${actions.map((a) => `<option value="${esc(a.value)}" ${a.value === p.action ? "selected" : ""}>${esc(a.label)}</option>`).join("")}
        </select>
        <select class="ct-exam-method" title="Méthode">
          <option value="">Méthode —</option>
          ${methods.map((m) => `<option value="${esc(m.method_id)}" ${String(m.method_id) === String(p.method) ? "selected" : ""}>${esc(m.name || `#${m.method_id}`)}</option>`).join("")}
        </select>
        <button class="ws-icon-btn" type="button" data-row-del title="Retirer l'étape">✕</button>
      </div>
    </div>`;
}

export function examPlanDefaults(examDate, chapterName = "") {
  const base = examDate || examDatePlus(new Date().toISOString().slice(0, 10), 7);
  return EXAM_PHASES.map((p) => ({
    title: chapterName ? `${p.title} — ${chapterName}` : p.title,
    desc: p.desc,
    date: examDatePlus(examDate || base, p.offset),
    action: p.action,
    method: "",
  }));
}

export function examPlanListHTML(rows) {
  const methods = api.getMethods?.() || [];
  const actions = api.linkedActions || [];
  return rows.map((r) => examRowHTML(r, methods, actions)).join("");
}

export function collectExamPlanRows(rowsEl) {
  return [...rowsEl.querySelectorAll("[data-row]")].map((row) => ({
    title: row.querySelector(".ct-exam-title").value.trim(),
    date: row.querySelector(".ct-exam-date").value,
    desc: row.querySelector(".ct-exam-desc").value.trim(),
    action: row.querySelector(".ct-exam-action").value,
    method: row.querySelector(".ct-exam-method").value,
  })).filter((r) => r.title);
}

export async function createExamPlanTasks(items, chapter, examDate) {
  let created = 0;
  for (const it of items) {
    const remindDate = it.date ? new Date(`${it.date}T17:00:00`) : null;
    const ad = { exam_plan: chapter?.lesson_id || null, exam_date: examDate, reminder_mode: "day_before" };
    await api.apiTasks("create", {
      table: "tasks",
      fields: {
        title: it.title,
        text_body: it.desc || "",
        remind: 1,
        remind_date: remindDate && !isNaN(remindDate) ? remindDate.toISOString() : "",
        frequency: "",
        linked_action: it.action || null,
        methods_id: it.method || null,
        chapter_id: chapter?.lesson_id ?? null,
        subject_id: chapter?.subject_id ?? null,
        additional_data: JSON.stringify(ad),
      },
    });
    created++;
  }
  return created;
}

export function openExamPlan(chapter) {
  const examIso = chapter.tests_date ? String(chapter.tests_date).slice(0, 10) : "";
  const defaultDate = examIso || examDatePlus(new Date().toISOString().slice(0, 10), 7);
  const rows = examPlanDefaults(defaultDate, chapter.lesson_name || "chapitre");
  const listHtml = examPlanListHTML(rows);

  openModal({
    title: `Planifier le contrôle — ${chapter.lesson_name || "chapitre"}`,
    wide: true,
    body: `
      <div class="ct-exam">
        <p class="ct-note">Le plan crée une succession de tâches datées avant le contrôle. Chaque étape est liée à une action du chapitre et à une méthode — vous pouvez tout modifier avant de créer.</p>
        <div class="ct-exam-head">
          <label class="ws-field"><span class="ws-field-label">Date du contrôle</span>
            ${lumarisDateField({ id: "ct_exam_date", value: defaultDate, mode: "date", attrs: "data-exam-date" })}</label>
          <button class="ws-btn ws-btn-ghost" type="button" data-add-row>＋ Ajouter une étape</button>
        </div>
        <div class="ct-exam-list" data-rows>${listHtml}</div>
      </div>`,
    foot: `
      <button class="ws-btn ws-btn-ghost" type="button" data-close>Annuler</button>
      <button class="ws-btn ws-btn-primary" type="button" data-create>Créer les tâches</button>`,
    onMount(m) {
      const rowsEl = m.el.querySelector("[data-rows]");
      const examInput = m.el.querySelector("[data-exam-date]");

      // Recompute all default phase dates when the exam date changes.
      examInput.addEventListener("change", () => {
        const iso = examInput.value;
        if (!iso) return;
        rowsEl.querySelectorAll("[data-row]").forEach((row, i) => {
          const off = EXAM_PHASES[i]?.offset;
          if (off !== undefined) {
            const d = row.querySelector(".ct-exam-date");
            if (d && !d.dataset.touched) d.value = examDatePlus(iso, off);
          }
        });
        refreshDatePickerLabels(m.el);
      });
      rowsEl.addEventListener("input", (e) => {
        if (e.target.classList.contains("ct-exam-date")) e.target.dataset.touched = "1";
      });
      rowsEl.addEventListener("click", (e) => {
        const del = e.target.closest("[data-row-del]");
        if (del) del.closest("[data-row]")?.remove();
      });
      m.el.querySelector("[data-add-row]").addEventListener("click", () => {
        rowsEl.insertAdjacentHTML("beforeend", examPlanListHTML([{ title: "", desc: "", date: examInput.value || defaultDate, action: "", method: "" }]));
      });

      m.el.querySelector("[data-create]").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const examDate = examInput.value || defaultDate;
        const items = collectExamPlanRows(rowsEl);
        if (!items.length) { api.toast?.("Aucune étape — renseignez au moins un titre"); return; }
        btn.disabled = true; btn.textContent = "Création…";
        try {
          if (examDate && examDate !== examIso) {
            await updateChapter(chapter.lesson_id, { tests_date: examDate });
          }
          const created = await createExamPlanTasks(items, chapter, examDate);
          api.toast?.(`${created} tâche${created > 1 ? "s" : ""} de préparation créée${created > 1 ? "s" : ""}`);
          m.close();
          await api.reload?.();
        } catch (err) {
          api.toast?.(err.message);
          btn.disabled = false; btn.textContent = "Créer les tâches";
        }
      });
    },
  });
}
