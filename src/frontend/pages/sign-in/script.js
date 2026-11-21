import { getTurnstileToken, preloadTurnstile } from "/lib/turnstile.js";

const form = document.getElementById("signin-form");
const errorBox = document.getElementById("signin-error");
const toggle = document.getElementById("toggle-password");
const password = document.getElementById("password");
const turnstileContainer = document.getElementById("turnstile-container");

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
    
    // Get Turnstile token (required)
    const turnstileToken = await getTurnstileToken();
    if (!turnstileToken) {
      errorBox.textContent = "Veuillez compléter la vérification Cloudflare.";
      errorBox.hidden = false;
      return;
    }
    
    const loginUrl = `https://login-client-worker.${encodeURIComponent(identifier)}-cloudflare-account.workers.dev/api/login`;
    const body = { 
      username: identifier, 
      password: form.elements.password.value,
      turnstileToken: turnstileToken
    };
    
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
    if (!loginResult.jwt || !loginResult.oneTimeToken) {
      errorBox.textContent = "Identifiant ou mot de passe incorrect.";
      errorBox.hidden = false;
      return;
    }
    
    // Set flag to show loading on account page after redirect
    sessionStorage.setItem('show_loading', '1');
    sessionStorage.setItem('jwt', loginResult.jwt);
    sessionStorage.setItem('oneTimeToken', loginResult.oneTimeToken);
    sessionStorage.setItem('username', identifier);
    
    window.location.assign(`/account/${encodeURIComponent(identifier)}/?jwt=${encodeURIComponent(loginResult.jwt)}&token=${encodeURIComponent(loginResult.oneTimeToken)}`);
  });
}

document.querySelectorAll(".social-login-button").forEach((button) => {
  button.addEventListener("click", () => {
    errorBox.textContent = `La connexion avec ${button.dataset.provider} n'est pas disponible pour le moment.`;
    errorBox.hidden = false;
  });
});
