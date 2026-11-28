// File attachments — uploads go to MEGA via /api/files/upload (the worker
// registers each file in the storage D1 `files` table, id = MEGA node ID).
// The field stores a JSON array of MEGA node IDs; names/sizes are resolved
// on demand through /api/storage/files/lookup.

import { authedFetch } from "/lib/auth.js";
import { lumarisAlert } from "/lib/dialog.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Stored value → array of MEGA node IDs. Accepts JSON array (of strings or
// {id} objects) or legacy newline-separated ids.
export function attIds(value) {
  const p = (() => { try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return null; } })();
  if (Array.isArray(p)) return p.map((x) => (typeof x === "string" ? x : x?.id)).filter(Boolean);
  return String(value ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
}

export function attJSON(value) {
  return JSON.stringify(attIds(value));
}

export function attFieldHTML(f, value, kind = "items") {
  const ids = attIds(value);
  return `
    <div class="ws-att" data-att-field="${esc(f.key)}" data-att-kind="${esc(kind)}">
      <div class="ws-att-list" data-att-list>${ids.map((id) => `<span class="ws-att-chip" data-att-id="${esc(id)}">…</span>`).join("")}</div>
      <div class="ws-att-bar">
        <button type="button" class="ws-btn ws-btn-ghost ws-btn-sm" data-att-add>＋ Joindre un fichier</button>
        <button type="button" class="ws-btn ws-btn-ghost ws-btn-sm" data-att-link title="Lier un fichier déjà présent dans tes fichiers">🔗 Fichier existant</button>
        <input type="file" data-att-input hidden multiple>
        <span class="ws-att-hint">Envoyés sur MEGA — les IDs sont enregistrés avec l'élément.</span>
      </div>
      <input type="hidden" data-att-ids value='${esc(JSON.stringify(ids))}'>
    </div>`;
}

function attSync(wrap) {
  const ids = [...wrap.querySelectorAll("[data-att-id]")].map((c) => c.dataset.attId);
  wrap.querySelector("[data-att-ids]").value = JSON.stringify(ids);
}

const fileCache = new Map(); // id -> {name,size,path}

async function lookupFiles(ids) {
  const missing = ids.filter((id) => !fileCache.has(id));
  if (missing.length) {
    try {
      const res = await authedFetch("/api/storage/files/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: missing }),
      });
      const data = await res.json().catch(() => ({}));
      for (const f of data?.resp?.files || data?.files || []) {
        fileCache.set(String(f.id), { name: f.name, size: f.size, path: f.path });
      }
    } catch { /* keep fallback labels */ }
    for (const id of missing) if (!fileCache.has(id)) fileCache.set(id, { name: id, size: 0, path: null });
  }
  return ids.map((id) => fileCache.get(String(id)) || { name: id, size: 0, path: null });
}

function fmtSize(bytes) {
  if (!bytes) return "";
  const k = 1024, s = ["o", "Ko", "Mo", "Go"];
  const i = Math.min(s.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${(bytes / Math.pow(k, i)).toFixed(i ? 1 : 0)} ${s[i]}`;
}

async function renderAttChips(wrap) {
  const list = wrap.querySelector("[data-att-list]");
  if (!list) return;
  const ids = [...wrap.querySelectorAll("[data-att-id]")].map((c) => c.dataset.attId);
  const files = await lookupFiles(ids);
  // Keep in-flight upload chips (no data-att-id yet) — a rebuild must not
  // wipe progress indicators for files still uploading.
  const pending = [...list.querySelectorAll(":scope > :not([data-att-id])")];
  list.innerHTML = ids.map((id, i) => {
    const f = files[i] || {};
    const size = fmtSize(f.size);
    return `
      <span class="ws-att-chip" data-att-id="${esc(id)}" data-att-path="${esc(f.path || "")}" title="${esc(f.path || id)}">
        <span class="ws-att-name">${esc(f.name || id)}</span>
        ${size ? `<span class="ws-att-size">${size}</span>` : ""}
        <button type="button" class="ws-att-x" data-att-del title="Détacher">✕</button>
      </span>`;
  }).join("");
  for (const p of pending) list.appendChild(p);
}

async function openAttFile(chip) {
  const path = chip.dataset.attPath;
  if (!path) return;
  try {
    const res = await authedFetch(`/api/files/read/${encodeURIComponent(path.replace(/^files\//, ""))}`);
    const data = await res.json().catch(() => ({}));
    const url = data?.resp?.url || data?.url;
    if (url) window.open(url, "_blank", "noopener");
    else lumarisAlert("Lien de téléchargement indisponible.");
  } catch (e) {
    lumarisAlert(e.message || "Échec de l'ouverture du fichier");
  }
}

// Picker modal — link an existing MEGA/storage file instead of uploading.
async function openFilePicker(wrap) {
  const list = wrap.querySelector("[data-att-list]");
  const linked = new Set([...wrap.querySelectorAll("[data-att-id]")].map((c) => c.dataset.attId));

  const root = document.createElement("div");
  root.className = "ws-modal-root att-picker-root";
  root.innerHTML = `
    <div class="ws-modal-backdrop"></div>
    <div class="ws-modal att-picker" role="dialog" aria-modal="true">
      <div class="ws-modal-head">
        <h2>Lier un fichier existant</h2>
        <button class="ws-icon-btn" type="button" data-close>✕</button>
      </div>
      <div class="att-picker-search">
        <input type="search" data-search placeholder="Rechercher par nom ou dossier…" autocomplete="off">
      </div>
      <div class="ws-modal-body att-picker-body" data-results>
        <p class="ct-note">Chargement…</p>
      </div>
      <div class="ws-modal-foot">
        <button class="ws-btn ws-btn-ghost" type="button" data-close>Fermer</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  const close = () => { document.removeEventListener("keydown", escH); root.remove(); };
  const escH = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", escH);
  root.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  root.querySelector(".ws-modal-backdrop").addEventListener("click", close);

  const results = root.querySelector("[data-results]");
  const search = root.querySelector("[data-search]");
  let debounce = null;

  const renderRows = (files) => {
    if (!files.length) { results.innerHTML = `<p class="ct-note">Aucun fichier${search.value.trim() ? " pour cette recherche" : ""}.</p>`; return; }
    results.innerHTML = files.map((f) => {
      const already = linked.has(String(f.id));
      const size = fmtSize(f.size);
      const dir = String(f.path || "").replace(/^files\//, "").split("/").slice(0, -1).join("/");
      return `
        <div class="att-picker-row" data-id="${esc(f.id)}" data-path="${esc(f.path || "")}" data-name="${esc(f.name || "")}" data-size="${f.size || 0}">
          <div class="att-picker-info">
            <span class="att-picker-name">${esc(f.name || f.id)}</span>
            <span class="att-picker-meta">${esc(dir || "racine")}${size ? ` · ${size}` : ""}</span>
          </div>
          <button type="button" class="ws-btn ws-btn-ghost ws-btn-sm" data-pick ${already ? "disabled" : ""}>${already ? "Lié ✓" : "＋ Lier"}</button>
        </div>`;
    }).join("");
  };

  const load = async () => {
    results.innerHTML = `<p class="ct-note">Chargement…</p>`;
    try {
      const res = await authedFetch("/api/storage/files/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search: search.value.trim(), limit: 200 }),
      });
      const data = await res.json().catch(() => ({}));
      renderRows(data?.resp?.files || data?.files || []);
    } catch (e) {
      results.innerHTML = `<p class="ct-note">Erreur : ${esc(e.message)}</p>`;
    }
  };

  search.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(load, 250); });
  results.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick]");
    if (!btn || btn.disabled) return;
    const row = btn.closest("[data-id]");
    const id = row.dataset.id;
    if (linked.has(id)) return;
    fileCache.set(id, { name: row.dataset.name, size: Number(row.dataset.size) || 0, path: row.dataset.path });
    const c = document.createElement("span");
    c.className = "ws-att-chip";
    c.dataset.attId = id;
    c.dataset.attPath = row.dataset.path;
    list.appendChild(c);
    linked.add(id);
    attSync(wrap);
    renderAttChips(wrap);
    btn.disabled = true;
    btn.textContent = "Lié ✓";
  });

  load();
}

// Wire upload / remove / open on a container that holds [data-att-field] widgets.
export function bindAttachments(root) {
  root.querySelectorAll("[data-att-field]").forEach((wrap) => {
    if (wrap.dataset.attBound) return;
    wrap.dataset.attBound = "1";
    const kind = wrap.dataset.attKind || "items";
    const input = wrap.querySelector("[data-att-input]");
    const list = wrap.querySelector("[data-att-list]");

    wrap.querySelector("[data-att-add]")?.addEventListener("click", () => input?.click());
    wrap.querySelector("[data-att-link]")?.addEventListener("click", () => openFilePicker(wrap));
    input?.addEventListener("change", async () => {
      const files = [...(input.files || [])];
      input.value = "";
      for (const file of files) {
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const rel = `attachments/${kind}/${Date.now()}-${safe}`;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("relativePath", rel);
        const chip = document.createElement("span");
        chip.className = "ws-att-chip ws-att-uploading";
        chip.innerHTML = `<span class="ws-att-name">${esc(file.name)}…</span>`;
        list.appendChild(chip);
        try {
          const res = await authedFetch("/api/files/upload", { method: "POST", body: fd });
          const data = await res.json().catch(() => ({}));
          const nodeId = data?.resp?.nodeId || data?.nodeId;
          if (!res.ok || !nodeId) throw new Error(data?.error || data?.resp?.error || `HTTP ${res.status}`);
          fileCache.set(String(nodeId), { name: file.name, size: file.size, path: `files/${rel}` });
          chip.remove();
          const c = document.createElement("span");
          c.className = "ws-att-chip";
          c.dataset.attId = nodeId;
          c.dataset.attPath = `files/${rel}`;
          list.appendChild(c);
          attSync(wrap);
          renderAttChips(wrap);
        } catch (e) {
          chip.remove();
          lumarisAlert(`Échec de l'envoi de ${file.name} : ${e.message}`);
        }
      }
    });

    list?.addEventListener("click", (e) => {
      const del = e.target.closest("[data-att-del]");
      if (del) {
        del.closest("[data-att-id]")?.remove();
        attSync(wrap);
        renderAttChips(wrap);
        return;
      }
      const chip = e.target.closest("[data-att-id]");
      if (chip && !e.target.closest("button")) openAttFile(chip);
    });

    renderAttChips(wrap);
  });
}
