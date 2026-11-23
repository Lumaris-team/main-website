import { defaultSettings, loadSettings, saveSettings, applyThemeSettings, saveRemoteSettings } from "/lib/settings.js";
import { loadIcons } from "/lib/icons.js";
import { authedFetch, refreshSession, getSessionInfo, logout } from "/lib/auth.js";

const $ = (sel) => document.querySelector(sel);

// ================= Theme / Appearance =================
const fields = {
  backgroundType: $("#backgroundType"),
  gradientStyle: $("#gradientStyle"),
  gradientOrientation: $("#gradientOrientation"),
  gradientLinearBtn: $("#gradientLinear"),
  gradientRadialBtn: $("#gradientRadial"),
  color1: $("#color1"),
  color2: $("#color2"),
  solidColor: $("#solidColor"),
  orient0: $("#orient0"),
  orient45: $("#orient45"),
  orient90: $("#orient90"),
  orient135: $("#orient135"),
  bgGradientBtn: $("#bgGradient"),
  bgSolidBtn: $("#bgSolid"),
  settingsPreview: $("#settingsPreview"),
  fontFamily: $("#fontFamily"),
  fontWeight: $("#fontWeight"),
  boldNormal: $("#boldNormal"),
  boldBold: $("#boldBold"),
  fontSize: $("#fontSize"),
  saveButton: $("#saveSettings"),
  resetButton: $("#resetSettings"),
};

function getCurrentSettings() {
  return {
    backgroundType: fields.backgroundType.value,
    gradientStyle: fields.gradientStyle.value,
    gradientOrientation: fields.gradientOrientation.value,
    color1: fields.color1.value,
    color2: fields.color2.value,
    solidColor: fields.solidColor.value,
    fontFamily: fields.fontFamily.value,
    fontWeight: fields.fontWeight.value === "bold" ? "700" : "500",
    fontSize: Number(fields.fontSize.value),
  };
}

function setRow(key, hidden) {
  const row = document.querySelector(`.set-row[data-setting="${key}"]`);
  if (row) row.classList.toggle("is-hidden", hidden);
}

function syncSolidFieldVisibility() {
  const showSolid = fields.backgroundType.value === "solid";
  setRow("gradientStyle", showSolid);
  setRow("orientation", showSolid);
  setRow("colors", showSolid);
  setRow("solid", !showSolid);
  syncGradientStyleVisibility();
}

function syncGradientStyleVisibility() {
  if (!fields.gradientStyle || !fields.gradientOrientation) return;
  const isRadial = fields.gradientStyle.value === "radial";
  const hiddenBySolid = fields.backgroundType && fields.backgroundType.value === "solid";
  setRow("orientation", isRadial || hiddenBySolid);
}

function renderPreview(settings) {
  const card = fields.settingsPreview?.querySelector(".preview-card");
  if (!card) return;
  card.style.background =
    settings.backgroundType === "solid"
      ? settings.solidColor
      : settings.gradientStyle === "radial"
      ? `radial-gradient(circle at center, ${settings.color1} 0%, ${settings.color2} 100%)`
      : `linear-gradient(${settings.gradientOrientation}, ${settings.color1} 0%, ${settings.color2} 100%)`;
  card.style.color = settings.backgroundType === "solid" ? "#f7fbff" : "#ffffff";
  card.style.fontFamily = settings.fontFamily;
  card.style.fontWeight = settings.fontWeight;
}

function populateForm(settings) {
  fields.backgroundType.value = settings.backgroundType;
  fields.gradientStyle.value = settings.gradientStyle;
  fields.gradientOrientation.value = settings.gradientOrientation;
  fields.color1.value = settings.color1;
  fields.color2.value = settings.color2;
  fields.solidColor.value = settings.solidColor;
  fields.fontFamily.value = settings.fontFamily;
  fields.fontWeight.value = settings.fontWeight === "700" ? "bold" : "normal";
  fields.fontSize.value = settings.fontSize;
  syncSolidFieldVisibility();
  renderPreview(settings);
  updateColorSwatches();
  updateBgToggleButtons();
  updateGradientToggleButtons();
  updateOrientationButtons();
  updateBoldToggleButtons();
}

function handleFieldChange() {
  const settings = getCurrentSettings();
  applyThemeSettings(settings);
  renderPreview(settings);
  saveSettings(settings);
  saveRemoteSettings(settings).catch(() => undefined);
}

function resetToDefaults() {
  const initial = defaultSettings();
  populateForm(initial);
  applyThemeSettings(initial);
  saveSettings(initial);
  saveRemoteSettings(initial).catch(() => undefined);
}

function updateColorSwatch(input) {
  try {
    const parent = input.closest(".color-field") || input.closest(".solid-field");
    if (!parent) return;
    const swatch = parent.querySelector(".color-swatch");
    if (!swatch) return;
    swatch.style.background = input.value;
    const c = input.value.replace("#", "");
    if (c.length === 6) {
      const r = parseInt(c.slice(0, 2), 16);
      const g = parseInt(c.slice(2, 4), 16);
      const b = parseInt(c.slice(4, 6), 16);
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      swatch.style.borderColor = l > 0.6 ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
    }
  } catch {}
}

function updateColorSwatches() {
  [fields.color1, fields.color2, fields.solidColor].forEach((inp) => inp && updateColorSwatch(inp));
}

function updateBgToggleButtons() {
  const val = fields.backgroundType.value;
  fields.bgGradientBtn.classList.toggle("active", val === "gradient");
  fields.bgSolidBtn.classList.toggle("active", val === "solid");
  fields.bgGradientBtn.setAttribute("aria-pressed", String(val === "gradient"));
  fields.bgSolidBtn.setAttribute("aria-pressed", String(val === "solid"));
}

function updateBoldToggleButtons() {
  const val = fields.fontWeight.value;
  fields.boldNormal.classList.toggle("active", val === "normal");
  fields.boldBold.classList.toggle("active", val === "bold");
  fields.boldNormal.setAttribute("aria-pressed", String(val === "normal"));
  fields.boldBold.setAttribute("aria-pressed", String(val === "bold"));
}

function updateGradientToggleButtons() {
  const val = fields.gradientStyle.value;
  fields.gradientLinearBtn.classList.toggle("active", val === "linear");
  fields.gradientRadialBtn.classList.toggle("active", val === "radial");
  fields.gradientLinearBtn.setAttribute("aria-pressed", String(val === "linear"));
  fields.gradientRadialBtn.setAttribute("aria-pressed", String(val === "radial"));
}

function updateOrientationButtons() {
  const val = fields.gradientOrientation?.value || "";
  [fields.orient0, fields.orient45, fields.orient90, fields.orient135].forEach((btn) => {
    if (!btn) return;
    btn.classList.toggle("active", btn.dataset.value === val);
    btn.setAttribute("aria-pressed", String(btn.dataset.value === val));
  });
}

function wireThemeEvents() {
  [fields.backgroundType, fields.gradientStyle, fields.gradientOrientation, fields.fontFamily, fields.fontWeight, fields.fontSize]
    .forEach((input) => input?.addEventListener("change", handleFieldChange));

  fields.bgGradientBtn?.addEventListener("click", () => {
    fields.backgroundType.value = "gradient";
    updateBgToggleButtons(); syncSolidFieldVisibility(); handleFieldChange();
  });
  fields.bgSolidBtn?.addEventListener("click", () => {
    fields.backgroundType.value = "solid";
    updateBgToggleButtons(); syncSolidFieldVisibility(); handleFieldChange();
  });
  fields.boldNormal?.addEventListener("click", () => {
    fields.fontWeight.value = "normal";
    updateBoldToggleButtons(); handleFieldChange();
  });
  fields.boldBold?.addEventListener("click", () => {
    fields.fontWeight.value = "bold";
    updateBoldToggleButtons(); handleFieldChange();
  });
  fields.gradientLinearBtn?.addEventListener("click", () => {
    fields.gradientStyle.value = "linear";
    updateGradientToggleButtons(); syncGradientStyleVisibility(); handleFieldChange();
  });
  fields.gradientRadialBtn?.addEventListener("click", () => {
    fields.gradientStyle.value = "radial";
    updateGradientToggleButtons(); syncGradientStyleVisibility(); handleFieldChange();
  });
  [fields.orient0, fields.orient45, fields.orient90, fields.orient135].forEach((btn) => {
    btn?.addEventListener("click", () => {
      fields.gradientOrientation.value = btn.dataset.value;
      updateOrientationButtons(); handleFieldChange();
    });
  });

  fields.fontSize?.addEventListener("input", () => {
    const value = parseFloat(fields.fontSize.value);
    if (!isNaN(value)) fields.fontSize.value = Math.round(value * 2) / 2;
  });

  [fields.color1, fields.color2, fields.solidColor].forEach((colorInput) => {
    colorInput?.addEventListener("input", () => {
      updateColorSwatch(colorInput);
      handleFieldChange();
    });
  });

  fields.saveButton?.addEventListener("click", async () => {
    const settings = getCurrentSettings();
    saveSettings(settings);
    await saveRemoteSettings(settings);
    fields.saveButton.classList.add("is-saved");
    fields.saveButton.textContent = "Saved ✓";
    setTimeout(() => {
      fields.saveButton.classList.remove("is-saved");
      fields.saveButton.textContent = "Save";
    }, 1600);
  });

  fields.resetButton?.addEventListener("click", resetToDefaults);
}

// ================= Statistics =================
async function fetchStatsData() {
  try {
    const response = await authedFetch("/api/settings/stats", { method: "GET" });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.resp ?? payload ?? null;
  } catch {
    return null;
  }
}

function formatBytesToGB(bytes) {
  return (bytes / 1024 / 1024 / 1024).toFixed(1);
}

function renderStats(stats) {
  const storage = stats?.storage || { totalBytes: 0, capacityGB: 20, items: [] };
  const ai = stats?.ai?.daily || { used: 0, limit: 10000 };

  const capacityGB = storage.capacityGB || 20;
  const totalBytes = storage.totalBytes || 0;
  const filesItem = storage.items?.find((i) => i.key === "files/") || { bytes: 0 };

  const pct = totalBytes > 0 ? (totalBytes / (capacityGB * 1024 * 1024 * 1024)) * 100 : 0;
  const pctText = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, "");
  const pctEl = $("#storagePct");
  if (pctEl) {
    pctEl.textContent = `${pctText}% used`;
    pctEl.style.fontSize = pctText.length <= 3 ? "1.6rem" : pctText.length <= 4 ? "1.4rem" : "1.2rem";
  }
  const capEl = $("#storageCap");
  if (capEl) capEl.textContent = `of ${capacityGB}GB`;
  const legendEl = $("#storageLegend");
  if (legendEl) legendEl.textContent = `Files — ${formatBytesToGB(filesItem.bytes)} GB`;

  const circumference = 339.292;
  const filesCircle = $("#ringFiles");
  if (filesCircle) {
    const filesLen = totalBytes ? Math.min(filesItem.bytes / totalBytes, 1) * circumference : 0;
    filesCircle.setAttribute("stroke-dasharray", `${filesLen} ${circumference}`);
    filesCircle.setAttribute("stroke-dashoffset", `${circumference}`);
  }

  const aiUsed = ai.used || 0;
  const aiLimit = ai.limit || 10000;
  const aiPct = Math.round((aiUsed / aiLimit) * 100);
  const aiPctEl = $("#aiPct");
  if (aiPctEl) aiPctEl.textContent = `${aiPct}% used`;
  const aiCapEl = $("#aiCap");
  if (aiCapEl) aiCapEl.textContent = `of ${aiLimit} neurons`;
  const aiUsageEl = $("#aiUsage");
  if (aiUsageEl) aiUsageEl.textContent = `${aiUsed} / ${aiLimit} neurons`;

  const aiCircle = $("#ringAi");
  if (aiCircle) {
    const len = Math.min(aiUsed / aiLimit, 1) * circumference;
    aiCircle.setAttribute("stroke-dasharray", `${circumference} ${circumference}`);
    aiCircle.setAttribute("stroke-dashoffset", "0");
    aiCircle.getBoundingClientRect();
    aiCircle.setAttribute("stroke-dasharray", `${len} ${circumference}`);
    aiCircle.setAttribute("stroke-dashoffset", `${circumference}`);
  }
}

// ================= Session =================
function renderSession() {
  const { username, jwtExp } = getSessionInfo();
  const userEl = $("#sessionUser");
  if (userEl) userEl.textContent = username || "unknown";
  const expEl = $("#sessionExp");
  if (expEl) {
    if (!jwtExp) { expEl.textContent = "—"; return; }
    const date = new Date(jwtExp * 1000);
    const mins = Math.round((jwtExp * 1000 - Date.now()) / 60000);
    expEl.textContent = mins > 0
      ? `in ${mins} min (${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`
      : "expired";
    expEl.title = date.toLocaleString();
    expEl.style.color = mins <= 5 ? "#fb7185" : "";
  }
}

function wireSession() {
  $("#sessionRefresh")?.addEventListener("click", async () => {
    const btn = $("#sessionRefresh");
    btn.disabled = true; btn.textContent = "Refreshing…";
    try {
      const ok = await refreshSession();
      if (!ok) { btn.textContent = "Session expired"; renderSession(); return; }
      btn.textContent = "Refreshed ✓";
      renderSession();
      const stats = await fetchStatsData();
      renderStats(stats);
    } catch {
      btn.textContent = "Refresh failed";
    }
    setTimeout(() => { btn.disabled = false; btn.textContent = "↻ Refresh session"; }, 1600);
  });

  $("#sessionLogout")?.addEventListener("click", () => logout());
}

// ================= Sidebar anchors =================
function wireSidebar() {
  const buttons = document.querySelectorAll(".settings-nav[data-target]");
  const sections = [...document.querySelectorAll(".settings-theme")];
  if (!buttons.length || !sections.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      buttons.forEach((b) => {
        b.dataset.active = b.dataset.target === entry.target.id ? "true" : "false";
        b.classList.toggle("active", b.dataset.target === entry.target.id);
      });
    }
  }, { rootMargin: "-30% 0px -60% 0px" });
  sections.forEach((s) => spy.observe(s));
}

// ================= Init =================
async function initSettingsPage() {
  const settings = loadSettings();
  populateForm(settings);
  wireThemeEvents();
  wireSession();
  wireSidebar();
  loadIcons("[data-icon]").catch(() => undefined);
  renderSession();
  setInterval(renderSession, 30000); // keep the JWT countdown fresh

  const stats = await fetchStatsData();
  renderStats(stats);

  // Workspace admin — lookups CRUD
  try {
    const { initWorkspaceAdmin } = await import("/pages/settings/workspace-admin.js");
    const section = $("#sec-workspace");
    if (section) initWorkspaceAdmin(section);
  } catch (e) {
    console.warn("Workspace admin failed to load:", e);
  }
}

document.addEventListener("DOMContentLoaded", initSettingsPage);
