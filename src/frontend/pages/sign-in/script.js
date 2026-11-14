const form = document.getElementById("signin-form");
const errorBox = document.getElementById("signin-error");
const toggle = document.getElementById("toggle-password");
const password = document.getElementById("password");
const turnstileContainer = document.getElementById("turnstile-widget");
let turnstileToken = null;
let turnstileWidgetId = null;

function loadTurnstile() {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => reject(new Error("turnstile_script_failed"));
    document.head.appendChild(script);
  });
}

if (turnstileContainer) {
  fetch("/api/config")
    .then((response) => response.json())
    .then(({ turnstileSiteKey }) => {
      if (!turnstileSiteKey) throw new Error("turnstile_not_configured");
      return loadTurnstile().then((turnstile) => ({ turnstile, turnstileSiteKey }));
    })
    .then(({ turnstile, turnstileSiteKey }) => {
      turnstileWidgetId = turnstile.render(turnstileContainer, {
        sitekey: turnstileSiteKey,
        callback: (token) => { turnstileToken = token; },
        "expired-callback": () => { turnstileToken = null; },
        "error-callback": () => { turnstileToken = null; },
      });
    })
    .catch(() => {
      if (turnstileContainer) turnstileContainer.hidden = true;
    });
}

if (toggle && password) {
  toggle.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(show));
    toggle.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
  });
  document.querySelectorAll("[data-icon]").forEach(async (el) => {
    try { const r = await fetch(el.dataset.icon); if (r.ok) el.innerHTML = await r.text(); } catch (e) {}
  });
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!turnstileToken) {
      if (errorBox) {
        errorBox.textContent = "Veuillez terminer la vérification de sécurité.";
        errorBox.hidden = false;
      }
      return;
    }
    const response = await fetch("/api/turnstile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: turnstileToken }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success !== true) {
      if (errorBox) {
        errorBox.textContent = "La vérification de sécurité a échoué.";
        errorBox.hidden = false;
      }
      return;
    }
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
      turnstileToken = null;
    }
    if (errorBox) {
      errorBox.textContent = "Vérification réussie. La connexion sera ajoutée ultérieurement.";
      errorBox.hidden = false;
    }
  });
}
