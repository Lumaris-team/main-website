import { apiEd } from "./timetable.js";
import { lumarisAlert } from "/lib/dialog.js";

// ================= Interactions ÉcoleDirecte =================
// A task can embed titled "ED blocks": each block picks a preset (what to
// pull from ÉcoleDirecte) and a mode — "list" (read-only) or "check"
// (per-item checkbox). Blocks are stored as JSON inside the task's
// additional_data.ed_blocks — no dedicated D1 column needed.
//
// Check mode on homework presets performs a REAL ÉcoleDirecte action
// (POST /homeworks { id, done }); on timetable/grades presets the check is
// local state persisted with the task.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const ED_BLOCK_PRESETS = [
  {
    group: "Emploi du temps",
    options: [
      { value: "edt_today", label: "Cours d'aujourd'hui" },
      { value: "edt_tomorrow", label: "Cours de demain" },
      { value: "edt_week", label: "Cours de la semaine" },
      { value: "edt_next", label: "Cours de la semaine prochaine" },
    ],
  },
  {
    group: "Devoirs",
    options: [
      { value: "hw_today", label: "Devoirs d'aujourd'hui" },
      { value: "hw_tomorrow", label: "Devoirs de demain" },
      { value: "hw_week", label: "Devoirs des 7 prochains jours" },
    ],
  },
  {
    group: "Notes",
    options: [{ value: "grades", label: "Toutes les notes" }],
  },
];

export function presetLabel(value) {
  for (const g of ED_BLOCK_PRESETS) {
    const o = g.options.find((x) => x.value === value);
    if (o) return o.label;
  }
  return value || "—";
}

export function presetOptionsHTML(selected) {
  return ED_BLOCK_PRESETS.map((g) => `
    <optgroup label="${esc(g.group)}">
      ${g.options.map((o) => `<option value="${o.value}" ${o.value === selected ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
    </optgroup>`).join("");
}

// ---------- Storage ----------

export function parseEdBlocks(entity) {
  try {
    const ad = typeof entity?.additional_data === "string" ? JSON.parse(entity.additional_data || "{}") : (entity?.additional_data || {});
    const list = ad?.ed_blocks;
    return Array.isArray(list) ? list.filter((b) => b && typeof b === "object") : [];
  } catch { return []; }
}

let blockSeq = 0;
export function newEdBlock() {
  return { id: `b${Date.now().toString(36)}${(blockSeq++).toString(36)}`, title: "", preset: "hw_tomorrow", mode: "list", state: {} };
}

function edFieldOf(root) {
  if (!root) return null;
  return root.matches?.("[data-edblocks]") ? root : root.querySelector("[data-edblocks]");
}

// Read the editor DOM → write the JSON into the hidden input.
export function syncEdBlocks(root) {
  const field = edFieldOf(root);
  if (!field) return;
  const hidden = field.querySelector("[data-ed-json]");
  if (!hidden) return;
  const blocks = [...field.querySelectorAll("[data-edrow]")].map((row) => {
    let state = {};
    try { state = JSON.parse(row.querySelector("[data-ed-state]")?.value || "{}"); } catch { state = {}; }
    return {
      id: row.dataset.edid,
      title: row.querySelector("[data-ed-title]")?.value.trim() || "",
      preset: row.querySelector("[data-ed-preset]")?.value || "hw_tomorrow",
      mode: row.querySelector("[data-ed-mode]")?.value || "list",
      state,
    };
  });
  hidden.value = JSON.stringify(blocks);
}

export function edBlocksJSON(root) {
  try { return JSON.parse(edFieldOf(root)?.querySelector("[data-ed-json]")?.value || "[]"); }
  catch { return []; }
}

// ---------- Editor row markup ----------

export function edBlockRowHTML(block) {
  const b = block || newEdBlock();
  return `
    <div class="ed-row" data-edrow data-edid="${esc(b.id)}">
      <div class="ed-row-main">
        <input type="text" class="ed-title" data-ed-title placeholder="Titre du bloc (ex. Devoirs de demain)" value="${esc(b.title)}">
        <div class="ed-row-opts">
          <select class="ed-preset" data-ed-preset>${presetOptionsHTML(b.preset)}</select>
          <select class="ed-mode" data-ed-mode title="Mode d'interaction">
            <option value="list" ${b.mode === "list" ? "selected" : ""}>Lister</option>
            <option value="check" ${b.mode === "check" ? "selected" : ""}>Sous-cocher</option>
          </select>
          <button type="button" class="ws-icon-btn" data-ed-del title="Retirer ce bloc">✕</button>
        </div>
      </div>
      <input type="hidden" data-ed-state value="${esc(JSON.stringify(b.state || {}))}">
      <div class="ed-live" data-edlive="${esc(b.id)}"></div>
    </div>`;
}

export function edBlocksFieldHTML(entity) {
  const blocks = parseEdBlocks(entity);
  return `
    <div class="ws-edblocks" data-edblocks>
      <div class="ed-rows">${blocks.map(edBlockRowHTML).join("")}</div>
      <button type="button" class="ws-btn ws-btn-ghost ed-add" data-ed-add>＋ Ajouter une interaction ÉcoleDirecte</button>
      <input type="hidden" data-ed-json value="${esc(JSON.stringify(blocks))}">
    </div>`;
}

// ---------- Live data ----------

const DAY_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const DAY_ORDER = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const DAY_LABELS = {
  lundi: "Lun", mardi: "Mar", mercredi: "Mer", jeudi: "Jeu",
  vendredi: "Ven", samedi: "Sam", dimanche: "Dim",
};

function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }

// Per-preset fetch cache — blocks on the same preset share one ED call.
const presetCache = new Map();
const CACHE_TTL = 60_000;

async function fetchTimedetable() {
  const key = "__edt";
  const hit = presetCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.promise;
  const promise = apiEd("timetable", { headers: { filter: "true" } })
    .then((resp) => {
      if (resp?.qcm_required) throw new Error(`Vérification ED requise : « ${resp.question || "?"} »`);
      return resp;
    })
    .catch((e) => { presetCache.delete(key); throw e; });
  presetCache.set(key, { ts: Date.now(), promise });
  return promise;
}

async function fetchHomeworks() {
  const key = "__hw";
  const hit = presetCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.promise;
  const promise = apiEd("homeworks", { headers: { filter: "true" } }).catch((e) => { presetCache.delete(key); throw e; });
  presetCache.set(key, { ts: Date.now(), promise });
  return promise;
}

async function fetchGrades() {
  const key = "__grades";
  const hit = presetCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.promise;
  const promise = apiEd("grades", { headers: { filter: "true" } }).catch((e) => { presetCache.delete(key); throw e; });
  presetCache.set(key, { ts: Date.now(), promise });
  return promise;
}

function hwFields(devoir) {
  const title = devoir?.titre ?? devoir?.intitule ?? devoir?.devoir ??
    devoir?.aFaire?.devoir ?? devoir?.matiere?.aFaire?.devoir ?? devoir?.contenu ?? "Devoir";
  const subject = devoir?.matiere?.libelle ?? devoir?.matiere?.nom ?? devoir?.matiereEnseignement ?? null;
  const doneRaw = devoir?.fait ?? devoir?.effectue ?? devoir?.aFaire?.fait ?? devoir?.aFaire?.effectue ?? 0;
  const id = devoir?.aFaire?.idDevoir ?? devoir?.idDevoir ?? devoir?.aFaire?.id ?? devoir?.id ?? null;
  return {
    title: typeof title === "string" ? title : String(title ?? "Devoir"),
    subject: typeof subject === "string" ? subject : subject != null ? String(subject) : null,
    done: doneRaw ? 1 : 0,
    id: id != null ? String(id) : null,
  };
}

function edtItems(week, weekTag, keepCancelled) {
  const items = [];
  for (const day of DAY_ORDER) {
    const courses = Array.isArray(week?.[day]) ? week[day] : [];
    const sorted = [...courses].sort((a, b) => String(a.horaireDebut ?? "").localeCompare(String(b.horaireDebut ?? "")));
    sorted.forEach((c, i) => {
      const cancelled = c.isAnnule === true || c.isAnnule === 1 || c.isAnnule === "true";
      if (cancelled && !keepCancelled) return;
      const subject = c.matiereEnseignee || c.libelle || c.matiere || "Cours";
      const start = c.horaireDebut ?? "";
      const end = c.horaireFin ?? "";
      const teacher = c.enseignant || c.professeur || "";
      const room = c.salle || "";
      items.push({
        key: `edt:${weekTag}:${day}:${start}:${subject}:${i}`,
        title: String(subject),
        sub: `${DAY_LABELS[day]}${start ? ` ${start}` : ""}${end ? `–${end}` : ""}${teacher ? ` · ${teacher}` : ""}${room ? ` · ${room}` : ""}`,
        cancelled,
        done: 0,
        remoteId: null,
      });
    });
  }
  return items;
}

// Returns { items, error? } — items normalized to {key,title,sub,cancelled,done,remoteId}
export async function fetchEdItems(preset) {
  try {
    if (preset === "edt_today" || preset === "edt_tomorrow" || preset === "edt_week" || preset === "edt_next") {
      const data = await fetchTimedetable();
      const week = preset === "edt_next" ? data?.semaineB : data?.semaineA;
      const weekTag = preset === "edt_next" ? "B" : "A";
      if (preset === "edt_week") return { items: edtItems(week, weekTag, true) };
      if (preset === "edt_next") return { items: edtItems(week, weekTag, false) };
      const offset = preset === "edt_tomorrow" ? 1 : 0;
      const dayName = DAY_FR[addDays(new Date(), offset).getDay()];
      const items = edtItems({ [dayName]: week?.[dayName] || [] }, weekTag, false);
      return { items };
    }

    if (preset === "hw_today" || preset === "hw_tomorrow" || preset === "hw_week") {
      const resp = await fetchHomeworks();
      const byDate = resp?.data && typeof resp.data === "object" ? resp.data : {};
      const days = preset === "hw_today" ? [0] : preset === "hw_tomorrow" ? [1] : Array.from({ length: 7 }, (_, i) => i);
      const wanted = new Set(days.map((i) => ymd(addDays(new Date(), i))));
      const items = [];
      for (const [date, list] of Object.entries(byDate)) {
        if (!wanted.has(date) || !Array.isArray(list)) continue;
        for (const d of list) {
          const f = hwFields(d);
          items.push({
            key: `hw:${f.id ?? `${date}:${f.title}`}`,
            title: f.title,
            sub: `${date}${f.subject ? ` · ${f.subject}` : ""}`,
            cancelled: false,
            done: f.done,
            remoteId: f.id,
          });
        }
      }
      items.sort((a, b) => a.sub.localeCompare(b.sub) || a.title.localeCompare(b.title));
      return { items };
    }

    if (preset === "grades") {
      const resp = await fetchGrades();
      const items = [];
      const TRIM = { trimestre1: "T1", trimestre2: "T2", trimestre3: "T3", examen_blanc: "EB", annee: "Année" };
      for (const [trim, matieres] of Object.entries(resp || {})) {
        if (!matieres || typeof matieres !== "object") continue;
        for (const [matiere, notes] of Object.entries(matieres)) {
          if (!Array.isArray(notes)) continue;
          notes.forEach((n, i) => {
            const val = n?.note != null && n?.noteSur ? `${String(n.note).replace(",", ".")}/${String(n.noteSur).replace(",", ".")}` : "";
            items.push({
              key: `g:${trim}:${matiere}:${i}`,
              title: `${matiere} — ${n?.titre || "Évaluation"}`,
              sub: [TRIM[trim] || trim, val, n?.date].filter(Boolean).join(" · "),
              cancelled: false,
              done: 0,
              remoteId: null,
            });
          });
        }
      }
      items.sort((a, b) => a.title.localeCompare(b.title));
      return { items: items.slice(0, 60) };
    }

    return { items: [], error: `Preset inconnu : ${preset}` };
  } catch (e) {
    return { items: [], error: e?.message || "ÉcoleDirecte indisponible" };
  }
}

// ---------- Live rendering ----------

function itemRowHTML(item, checked, interactive) {
  const cls = [item.cancelled ? "is-cancelled" : "", checked ? "is-done" : ""].join(" ");
  const box = interactive
    ? `<input type="checkbox" data-ed-check="${esc(item.key)}" ${checked ? "checked" : ""}>`
    : "";
  return `
    <div class="ed-item ${cls}">
      ${box}
      <div class="ed-item-txt">
        <span class="ed-item-title">${esc(item.title)}${item.cancelled ? " <em>(annulé)</em>" : ""}</span>
        ${item.sub ? `<span class="ed-item-sub">${esc(item.sub)}</span>` : ""}
      </div>
    </div>`;
}

export async function hydrateEdBlocks(root) {
  const fields = [...(root.querySelectorAll?.("[data-edblocks]") || [])];
  if (root.matches?.("[data-edblocks]")) fields.unshift(root);
  for (const field of fields) {
    if (field.closest(".ws-fcond")?.hidden) continue; // filtered out — don't fetch
    const blocks = edBlocksJSON(field);
    for (const block of blocks) {
      const live = field.querySelector(`[data-edlive="${CSS.escape(block.id)}"]`);
      if (!live) continue;
      const interactive = block.mode === "check";
      live.innerHTML = `<div class="ed-live-msg">Chargement ÉcoleDirecte…</div>`;
      const { items, error } = await fetchEdItems(block.preset);
      if (!live.isConnected) continue;
      if (error) {
        live.innerHTML = `<div class="ed-live-msg is-error">${esc(error)}</div>`;
        continue;
      }
      const state = block.state || {};
      const rows = items.length
        ? items.map((it) => itemRowHTML(it, interactive ? !!(state[it.key] ?? it.done) : false, interactive)).join("")
        : `<div class="ed-live-msg">Aucun élément pour ce filtre.</div>`;
      live.innerHTML = `
        <div class="ed-live-head">
          <span class="ed-live-count">${items.length} élément${items.length > 1 ? "s" : ""}</span>
          <button type="button" class="ws-icon-btn" data-ed-refresh title="Recharger">↻</button>
        </div>
        <div class="ed-live-list">${rows}</div>`;
      // Wire checkboxes → update block state (+ remote POST for homeworks)
      live.querySelectorAll("[data-ed-check]").forEach((cb) => {
        cb.addEventListener("change", async () => {
          const key = cb.dataset.edCheck;
          const it = items.find((x) => x.key === key);
          const checked = cb.checked;
          cb.disabled = true;
          try {
            if (interactive && it?.remoteId && block.preset.startsWith("hw_")) {
              // ed-client-worker requires id = 5 digits and done = "true"|"false" strings
              await apiEd("homeworks", { method: "POST", body: { id: String(it.remoteId).replace(/\D/g, ""), done: checked ? "true" : "false" } });
            }
            // Persist local state into the hidden JSON
            const field2 = live.closest("[data-edblocks]");
            const rows2 = edBlocksJSON(field2);
            const b2 = rows2.find((x) => x.id === block.id);
            if (b2) {
              b2.state = { ...(b2.state || {}), [key]: checked };
              const stateInput = live.closest("[data-edrow]")?.querySelector("[data-ed-state]");
              if (stateInput) stateInput.value = JSON.stringify(b2.state);
              syncEdBlocks(field2);
            }
            cb.closest(".ed-item")?.classList.toggle("is-done", checked);
          } catch (e) {
            cb.checked = !checked;
            lumarisAlert(`Échec : ${e?.message || e}`);
          } finally {
            cb.disabled = false;
          }
        });
      });
      live.querySelector("[data-ed-refresh]")?.addEventListener("click", () => {
        presetCache.clear();
        hydrateEdBlocks(root);
      });
    }
  }
}
