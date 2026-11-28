// Lumaris dialogs — promise-based replacements for native
// alert()/confirm()/prompt(). Styled to match the dashboard theme.

const CSS = `
.lum-dialog-overlay {
  position: fixed; inset: 0; z-index: 5000;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: rgba(4,8,16,.62); backdrop-filter: blur(6px);
  animation: lumDialogFade .15s ease;
}
.lum-dialog {
  width: min(400px, 100%); padding: 20px 22px; border-radius: 16px;
  border: 1px solid var(--line, rgba(255,255,255,.14));
  background: var(--bg, #0b1020); color: var(--text, #eef0f8);
  box-shadow: 0 24px 60px rgba(0,0,0,.55);
  animation: lumDialogPop .18s cubic-bezier(.2,.9,.3,1.15);
}
.lum-dialog-msg { margin: 0 0 14px; font-size: .92rem; line-height: 1.5; }
.lum-dialog-input {
  width: 100%; box-sizing: border-box; margin-bottom: 14px; padding: 9px 12px;
  border-radius: 10px; border: 1px solid var(--line, rgba(255,255,255,.14));
  background: var(--panel, rgba(255,255,255,.05)); color: var(--text, #eef0f8);
  font: inherit; font-size: .9rem; outline: none;
}
.lum-dialog-input:focus { border-color: rgba(140,236,255,.5); }
.lum-dialog-actions { display: flex; gap: 10px; justify-content: flex-end; }
.lum-dialog-btn {
  padding: 8px 16px; border-radius: 10px; border: 1px solid var(--line, rgba(255,255,255,.14));
  background: var(--panel, rgba(255,255,255,.05)); color: var(--text, #eef0f8);
  font: inherit; font-size: .85rem; font-weight: 600; cursor: pointer;
  transition: background .14s ease, border-color .14s ease;
}
.lum-dialog-btn:hover { border-color: rgba(140,236,255,.4); }
.lum-dialog-ok { background: rgba(140,236,255,.14); border-color: rgba(140,236,255,.35); color: var(--accent, #8cecff); }
.lum-dialog-ok.is-danger { background: rgba(251,113,133,.12); border-color: rgba(251,113,133,.4); color: #fb7185; }
@keyframes lumDialogFade { from { opacity: 0; } }
@keyframes lumDialogPop { from { opacity: 0; transform: translateY(10px) scale(.96); } }
`;
if (typeof document !== "undefined" && !document.getElementById("lum-dialog-css")) {
  const st = document.createElement("style");
  st.id = "lum-dialog-css";
  st.textContent = CSS;
  document.head.appendChild(st);
}

function showDialog({ message, input = null, confirmLabel = "OK", cancelLabel = null, danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "lum-dialog-overlay";
    overlay.innerHTML = `
      <div class="lum-dialog" role="${input ? "dialog" : "alertdialog"}" aria-modal="true">
        <p class="lum-dialog-msg">${String(message ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))}</p>
        ${input ? `<input type="text" class="lum-dialog-input" value="${String(input).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))}" spellcheck="false">` : ""}
        <div class="lum-dialog-actions">
          ${cancelLabel ? `<button type="button" class="lum-dialog-btn lum-dialog-cancel">${cancelLabel}</button>` : ""}
          <button type="button" class="lum-dialog-btn lum-dialog-ok${danger ? " is-danger" : ""}">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const field = overlay.querySelector(".lum-dialog-input");
    const done = (val) => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); done(cancelLabel ? false : null); }
      if (e.key === "Enter" && (!field || document.activeElement === field)) { e.preventDefault(); submit(); }
    };
    const submit = () => done(field ? field.value : true);

    overlay.querySelector(".lum-dialog-ok").addEventListener("click", submit);
    overlay.querySelector(".lum-dialog-cancel")?.addEventListener("click", () => done(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) done(cancelLabel ? false : null); });
    document.addEventListener("keydown", onKey, true);
    (field || overlay.querySelector(".lum-dialog-ok")).focus();
    field?.select();
  });
}

export const lumarisAlert = (message) => showDialog({ message });
export const lumarisConfirm = (message, { confirmLabel = "Supprimer", cancelLabel = "Annuler" } = {}) =>
  showDialog({ message, confirmLabel, cancelLabel, danger: true });
export const lumarisPrompt = (message, initial = "") =>
  showDialog({ message, input: initial, confirmLabel: "Valider", cancelLabel: "Annuler" });
