import { authedFetch } from "/lib/auth.js";

// Workspace settings admin — CRUD for the timetable lookup tables
// (labels, flags, types, methods, priorities, attention levels, folders).

const ENTITIES = [
  { key: "labels", label: "Étiquettes", fields: [
    { key: "name", label: "Nom", type: "text", required: true },
    { key: "color", label: "Couleur", type: "color" },
    { key: "description", label: "Description", type: "text" },
  ]},
  { key: "flags", label: "Drapeaux", fields: [
    { key: "name", label: "Nom", type: "text", required: true },
    { key: "color", label: "Couleur", type: "color" },
    { key: "icon", label: "Icône", type: "text", placeholder: "emoji ou nom" },
    { key: "description", label: "Description", type: "text" },
  ]},
  { key: "types", label: "Types", fields: [
    { key: "name", label: "Nom", type: "text", required: true },
    { key: "color", label: "Couleur", type: "color" },
    { key: "description", label: "Description", type: "text" },
  ]},
  { key: "methods", label: "Méthodes", fields: [
    { key: "name", label: "Nom", type: "text", required: true },
    { key: "description", label: "Description", type: "text" },
  ]},
  { key: "priorities", label: "Priorités", fields: [
    { key: "name", label: "Nom", type: "text", required: true },
    { key: "color", label: "Couleur", type: "color" },
    { key: "level", label: "Niveau", type: "number" },
  ]},
  { key: "attention", label: "Attention", fields: [
    { key: "name", label: "Nom", type: "text", required: true },
    { key: "color", label: "Couleur", type: "color" },
    { key: "level", label: "Niveau", type: "number" },
  ]},
  { key: "folders", label: "Dossiers", fields: [
    { key: "name", label: "Nom", type: "text", required: true },
    { key: "path", label: "Chemin", type: "text", required: true, placeholder: "/" },
    { key: "color", label: "Couleur", type: "color" },
    { key: "icon", label: "Icône", type: "text", placeholder: "emoji ou nom" },
    { key: "parent_id", label: "ID parent", type: "number" },
  ]},
];

const ID_COLS = {
  labels: "label_id", flags: "flag_id", types: "type_id", methods: "method_id",
  priorities: "priority_id", attention: "attention_level_id", folders: "folder_id",
};

const state = { meta: {}, entity: "labels", editingId: null };
let rootEl = null;

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

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function initWorkspaceAdmin(root) {
  rootEl = root;
  renderTabs();
  load();
}

function entity() { return ENTITIES.find((e) => e.key === state.entity); }
function rows() { return state.meta[state.entity] || []; }
function idCol() { return ID_COLS[state.entity]; }

function renderTabs() {
  const tabs = rootEl.querySelector("#wsadminTabs");
  tabs.innerHTML = ENTITIES.map((e) =>
    `<button class="wsadmin-tab" type="button" data-entity="${e.key}" data-active="${e.key === state.entity}">${e.label}</button>`
  ).join("");
  tabs.querySelectorAll(".wsadmin-tab").forEach((b) =>
    b.addEventListener("click", () => { state.entity = b.dataset.entity; state.editingId = null; renderTabs(); renderPanel(); })
  );
}

async function load() {
  try {
    const resp = await api("meta", {});
    state.meta = resp?.meta || {};
    renderPanel();
  } catch (e) {
    rootEl.querySelector("#wsadminBody").innerHTML = `<p class="state-msg">Échec du chargement : ${esc(e.message)}</p>`;
  }
}

function renderPanel() {
  const ent = entity();
  const body = rootEl.querySelector("#wsadminBody");
  const items = rows();

  const formFields = ent.fields.map((f) => `
    <label class="wsadmin-field">
      <span>${esc(f.label)}${f.required ? " *" : ""}</span>
      <input type="${f.type === "number" ? "number" : f.type === "color" ? "color" : "text"}"
        data-f="${f.key}" placeholder="${esc(f.placeholder || "")}" step="any">
    </label>`).join("");

  const list = items.length ? items.map((r) => {
    const id = r[idCol()];
    const chips = ent.fields.filter((f) => f.key !== "name" && r[f.key] !== null && r[f.key] !== undefined && r[f.key] !== "")
      .map((f) => `<span class="wsadmin-chip">${esc(f.label)}: ${esc(r[f.key])}</span>`).join("");
    return `
      <div class="wsadmin-row" data-id="${id}">
        <div class="wsadmin-row-main">
          <span class="wsadmin-row-name">${esc(r.name || `#${id}`)}</span>
          <span class="wsadmin-row-chips">${chips}</span>
        </div>
        <div class="wsadmin-row-actions">
          <button class="ws-icon-btn" type="button" data-edit title="Modifier">✎</button>
          <button class="ws-icon-btn" type="button" data-del title="Supprimer">✕</button>
        </div>
      </div>`;
  }).join("") : `<p class="state-msg">Aucun(e) ${esc(ent.label.toLowerCase())} pour l'instant — ajoutez-en un ci-dessous.</p>`;

  body.innerHTML = `
    <form class="wsadmin-form" id="wsadminForm">
      ${formFields}
      <div class="wsadmin-form-actions">
        <span class="wsadmin-form-mode" id="wsadminMode">Nouveau</span>
        <button class="button primary" type="submit">${state.editingId ? "Mettre à jour" : "Ajouter"}</button>
        ${state.editingId ? `<button class="button secondary" type="button" id="wsadminCancel">Annuler</button>` : ""}
      </div>
    </form>
    <div class="wsadmin-list">${list}</div>`;

  body.querySelector("#wsadminForm").addEventListener("submit", onSubmit);
  body.querySelector("#wsadminCancel")?.addEventListener("click", () => { state.editingId = null; renderPanel(); });
  body.querySelectorAll(".wsadmin-row").forEach((row) => {
    const id = Number(row.dataset.id);
    row.querySelector("[data-edit]").addEventListener("click", () => startEdit(id));
    row.querySelector("[data-del]").addEventListener("click", () => onDelete(id));
  });
}

function startEdit(id) {
  const row = rows().find((r) => Number(r[idCol()]) === id);
  if (!row) return;
  state.editingId = id;
  renderPanel();
  const form = rootEl.querySelector("#wsadminForm");
  entity().fields.forEach((f) => {
    const input = form.querySelector(`[data-f="${f.key}"]`);
    if (input && row[f.key] !== null && row[f.key] !== undefined) input.value = row[f.key];
  });
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const fields = {};
  for (const f of entity().fields) {
    const input = form.querySelector(`[data-f="${f.key}"]`);
    let v = input?.value ?? "";
    if (f.type === "number") v = v === "" ? null : Number(v);
    else if (f.type === "color") v = v || null;
    else v = v === "" ? null : v;
    if (f.required && (v === null || v === "")) { alert(`${f.label} est requis`); return; }
    fields[f.key] = v;
  }
  try {
    if (state.editingId) {
      await api("lookup", { entity: state.entity, op: "update", id: state.editingId, fields });
    } else {
      await api("lookup", { entity: state.entity, op: "create", fields });
    }
    state.editingId = null;
    await load();
  } catch (err) {
    alert(err.message);
  }
}

async function onDelete(id) {
  const ent = entity();
  const row = rows().find((r) => Number(r[idCol()]) === id);
  if (!confirm(`Supprimer « ${row?.name || id} » ?`)) return;
  try {
    await api("lookup", { entity: state.entity, op: "delete", id });
    if (state.editingId === id) state.editingId = null;
    await load();
  } catch (err) {
    alert(err.message);
  }
}
