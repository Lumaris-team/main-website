import { authedFetch } from "/lib/auth.js";

// ================= Emploi du temps (ÉcoleDirecte) =================
// The worker owns the whole ED session (login, cookies, and the 2FA QCM —
// answered automatically server-side from the worker's secrets). This
// module only asks for the timetable and renders the week grids.

const DAY_ORDER = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const DAY_LABELS = {
  lundi: "Lundi", mardi: "Mardi", mercredi: "Mercredi",
  jeudi: "Jeudi", vendredi: "Vendredi", samedi: "Samedi",
};

let lastData = null; // { semaineA, semaineB }
let loading = false;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function todayDayKey() {
  const names = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  return names[new Date().getDay()];
}

// ---------- API ----------
async function apiEd(subpath, { method = "GET", body, headers = {} } = {}) {
  const res = await authedFetch(`/api/ed/${subpath}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data?.resp ?? data;
}

async function fetchTimetable() {
  const resp = await apiEd("timetable", { headers: { filter: "true" } });
  if (resp?.qcm_required) {
    // Should not happen: the worker auto-answers the QCM from its secrets.
    // Reaching this means the question wasn't recognized — surface it.
    throw new Error(`Vérification ÉcoleDirecte requise : « ${resp.question || "question inconnue"} »`);
  }
  if (resp?.timetable?.json || resp?.ok === false) {
    throw new Error(resp?.error || "Réponse ÉcoleDirecte invalide");
  }
  return resp;
}

// ---------- Rendering ----------
function courseCard(c) {
  const start = c.horaireDebut ?? c.start ?? "";
  const end = c.horaireFin ?? c.end ?? "";
  const subject = c.matiereEnseignee || c.libelle || c.matiere || "Cours";
  const teacher = c.enseignant || c.professeur || "";
  const room = c.salle || "";
  const cancelled = c.isAnnule === true || c.isAnnule === 1 || c.isAnnule === "true";
  const sub = c.isSousMatter === true || c.isSousMatter === 1;
  return `
    <div class="ws-tt-course ${cancelled ? "is-cancelled" : ""} ${sub ? "is-sub" : ""}">
      <div class="ws-tt-time">${esc(start)}${end ? `–${esc(end)}` : ""}</div>
      <div class="ws-tt-subject">${esc(subject)}${cancelled ? " <span class=\"ws-tt-cancel\">(annulé)</span>" : ""}</div>
      ${teacher ? `<div class="ws-tt-meta">${esc(teacher)}</div>` : ""}
      ${room ? `<div class="ws-tt-meta">${esc(room)}</div>` : ""}
    </div>`;
}

function weekGrid(week, isCurrent) {
  const today = isCurrent ? todayDayKey() : null;
  const cols = DAY_ORDER.map((day) => {
    const courses = Array.isArray(week?.[day]) ? week[day] : [];
    const sorted = [...courses].sort((a, b) => String(a.horaireDebut ?? "").localeCompare(String(b.horaireDebut ?? "")));
    return `
      <div class="ws-tt-day ${day === today ? "is-today" : ""}">
        <div class="ws-tt-day-name">${DAY_LABELS[day]}${day === today ? ' <span class="ws-tt-today-tag">Aujourd’hui</span>' : ""}</div>
        <div class="ws-tt-day-list">
          ${sorted.length ? sorted.map(courseCard).join("") : `<div class="ws-tt-empty-day">—</div>`}
        </div>
      </div>`;
  }).join("");
  return `<div class="ws-tt-grid">${cols}</div>`;
}

export function edtStats() {
  if (!lastData) return null;
  let slots = 0;
  const subjects = new Set();
  for (const week of [lastData.semaineA, lastData.semaineB]) {
    for (const day of DAY_ORDER) {
      for (const c of week?.[day] || []) {
        if (c.isAnnule) continue;
        slots++;
        const s = c.matiereEnseignee || c.libelle || c.matiere;
        if (s) subjects.add(s);
      }
    }
  }
  return [[slots, "créneaux"], [subjects.size, "matières"]];
}

export async function renderTimetable() {
  const view = document.getElementById("timetableView");
  if (!view) return;
  view.hidden = false;
  if (loading) return;
  loading = true;
  try {
    if (!lastData) {
      view.innerHTML = `<div class="ws-tt-loading">Connexion à ÉcoleDirecte…</div>`;
    }
    const data = await fetchTimetable();
    if (!data) return;
    lastData = data;
    const hasA = DAY_ORDER.some((d) => (data.semaineA?.[d] || []).length);
    const hasB = DAY_ORDER.some((d) => (data.semaineB?.[d] || []).length);
    if (!hasA && !hasB) {
      view.innerHTML = `<div class="ws-empty"><div class="ws-empty-icon">✦</div><p class="ws-empty-title">Aucun cours</p><p class="ws-empty-sub">ÉcoleDirecte n'a renvoyé aucun créneau pour les deux prochaines semaines.</p></div>`;
      return;
    }
    view.innerHTML = `
      <div class="ws-tt">
        <section class="ws-tt-week">
          <h3 class="ws-tt-week-title">Cette semaine</h3>
          ${weekGrid(data.semaineA, true)}
        </section>
        <section class="ws-tt-week">
          <h3 class="ws-tt-week-title">Semaine suivante</h3>
          ${weekGrid(data.semaineB, false)}
        </section>
      </div>`;
  } catch (err) {
    view.innerHTML = `<div class="ws-empty"><div class="ws-empty-icon">✦</div><p class="ws-empty-title">ÉcoleDirecte indisponible</p><p class="ws-empty-sub">${esc(err.message || "Erreur de synchronisation")}</p><button class="ws-btn ws-btn-ghost" type="button" id="ttRetry">Réessayer</button></div>`;
    view.querySelector("#ttRetry")?.addEventListener("click", () => { lastData = null; renderTimetable(); });
  } finally {
    loading = false;
  }
}
