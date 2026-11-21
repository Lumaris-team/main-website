import { getTurnstileToken, preloadTurnstile } from "/lib/turnstile.js";

const form = document.getElementById("signin-form");
const errorBox = document.getElementById("signin-error");
const toggle = document.getElementById("toggle-password");
const password = document.getElementById("password");

// Preload Turnstile early
preloadTurnstile();

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
    const identifier = form.elements.username.value.trim();
    if (identifier.includes("@")) {
      errorBox.textContent = "La connexion par adresse e-mail n'est pas disponible pour le moment.";
      errorBox.hidden = false;
      return;
    }
    
    // Get Turnstile token (fails gracefully if not configured)
    const turnstileToken = await getTurnstileToken();
    
    const loginUrl = `https://login-client-worker.${encodeURIComponent(identifier)}-cloudflare-account.workers.dev/api/login`;
    const body = { 
      username: identifier, 
      password: form.elements.password.value 
    };
    
    // Only add turnstile token if available
    if (turnstileToken) {
      body.turnstileToken = turnstileToken;
    }
    
    const loginResponse = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!loginResponse.ok) {
      errorBox.textContent = "Identifiant ou mot de passe incorrect.";
      errorBox.hidden = false;
      return;
    }
    const loginResult = await loginResponse.json().catch(() => ({}));
    if (!loginResult.token) {
      errorBox.textContent = "Identifiant ou mot de passe incorrect.";
      errorBox.hidden = false;
      return;
    }
    // Set flag to show loading on account page after redirect
    sessionStorage.setItem('show_loading', '1');
    window.location.assign(`/account/${encodeURIComponent(identifier)}/?token=${encodeURIComponent(loginResult.token)}`);
  });
}

document.querySelectorAll(".social-login-button").forEach((button) => {
  button.addEventListener("click", () => {
    errorBox.textContent = `La connexion avec ${button.dataset.provider} n'est pas disponible pour le moment.`;
    errorBox.hidden = false;
  });
});
