import { getTurnstileToken, preloadTurnstile } from "/lib/turnstile.js";

const form = document.getElementById("signin-form");
const errorBox = document.getElementById("signin-error");
const toggle = document.getElementById("toggle-password");
const password = document.getElementById("password");
const turnstileButton = document.getElementById("turnstile-button");
const signinSubmit = document.getElementById("signin-submit");

let turnstileVerified = false;
let turnstileToken = null;

// Preload Turnstile early
preloadTurnstile();

// Turnstile button click handler
if (turnstileButton) {
  turnstileButton.addEventListener("click", async () => {
    turnstileButton.disabled = true;
    turnstileButton.textContent = "Vérification...";
    
    try {
      const token = await getTurnstileToken();
      if (token) {
        turnstileToken = token;
        turnstileVerified = true;
        turnstileButton.textContent = "✓ Vérifié";
        turnstileButton.style.background = "#10b981";
        if (signinSubmit) signinSubmit.disabled = false;
      } else {
        turnstileButton.textContent = "Erreur Turnstile";
        turnstileButton.style.background = "#ef4444";
      }
    } catch (error) {
      console.error("Turnstile error:", error);
      turnstileButton.textContent = "Erreur";
      turnstileButton.style.background = "#ef4444";
    }
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
    
    // Check if Turnstile is verified
    if (!turnstileVerified || !turnstileToken) {
      errorBox.textContent = "Veuillez d'abord vérifier avec Turnstile.";
      errorBox.hidden = false;
      return;
    }
    
    const identifier = form.elements.username.value.trim();
    if (identifier.includes("@")) {
      errorBox.textContent = "La connexion par adresse e-mail n'est pas disponible pour le moment.";
      errorBox.hidden = false;
      return;
    }
    
    const loginUrl = `https://login-client-worker.${encodeURIComponent(identifier)}-cloudflare-account.workers.dev/api/login`;
    const body = { 
      username: identifier, 
      password: form.elements.password.value,
      turnstileToken: turnstileToken
    };
    
    try {
      const loginResponse = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      if (!loginResponse.ok) {
        errorBox.textContent = "Identifiant ou mot de passe incorrect.";
        errorBox.hidden = false;
        // Reset Turnstile for retry
        turnstileVerified = false;
        turnstileToken = null;
        if (signinSubmit) signinSubmit.disabled = true;
        if (turnstileButton) {
          turnstileButton.textContent = "Vérifier avec Turnstile";
          turnstileButton.style.background = "";
          turnstileButton.disabled = false;
        }
        return;
      }
      
      const loginResult = await loginResponse.json().catch(() => ({}));
      if (!loginResult.token) {
        errorBox.textContent = "Identifiant ou mot de passe incorrect.";
        errorBox.hidden = false;
        return;
      }
      
      // Redirect to account page with token and username
      sessionStorage.setItem('show_loading', '1');
      window.location.assign(`/account/${encodeURIComponent(identifier)}/?token=${encodeURIComponent(loginResult.token)}&username=${encodeURIComponent(identifier)}`);
    } catch (error) {
      console.error("Login error:", error);
      errorBox.textContent = "Erreur de connexion. Veuillez réessayer.";
      errorBox.hidden = false;
    }
  });
}

document.querySelectorAll(".social-login-button").forEach((button) => {
  button.addEventListener("click", () => {
    errorBox.textContent = `La connexion avec ${button.dataset.provider} n'est pas disponible pour le moment.`;
    errorBox.hidden = false;
  });
});
