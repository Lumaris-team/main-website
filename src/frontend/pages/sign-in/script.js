import { getTurnstileToken, preloadTurnstile } from "/lib/turnstile.js";

const form = document.getElementById("signin-form");
const errorBox = document.getElementById("signin-error");
const toggle = document.getElementById("toggle-password");
const password = document.getElementById("password");
const turnstileContainer = document.getElementById("turnstile-container");

// Align the card with the navbar: same left inset, and a gap below the bar
// equal to the horizontal page inset (14px on desktop).
function syncCardOffset() {
  const nav = document.querySelector("site-navbar");
  if (!nav) return;
  const bottom = nav.getBoundingClientRect().bottom;
  if (bottom > 0) {
    document.documentElement.style.setProperty("--nav-bottom", `${Math.round(bottom)}px`);
  }
}
window.addEventListener("resize", syncCardOffset);
window.addEventListener("load", syncCardOffset);
setTimeout(syncCardOffset, 400);
setTimeout(syncCardOffset, 1500);

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
    
    // Turnstile token must already be produced by the widget — we never
    // trigger the challenge ourselves, just ask the user to tick the box.
    const turnstileToken = getTurnstileToken();
    if (!turnstileToken) {
      errorBox.textContent = "Veuillez cocher la case de vérification Cloudflare.";
      errorBox.hidden = false;
      return;
    }
    
    const loginUrl = `https://authentication-client-worker.${encodeURIComponent(identifier)}-cloudflare-account.workers.dev/api/login`;
    const body = { 
      username: identifier, 
      password: form.elements.password.value,
      turnstileToken: turnstileToken
    };
    
    let loginResponse;
    try {
      loginResponse = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      errorBox.textContent = "Service de connexion indisponible, réessayez dans un instant.";
      errorBox.hidden = false;
      return;
    }
    if (!loginResponse.ok) {
      const detail = await loginResponse.text().catch(() => "");
      console.error("Login failed", loginResponse.status, detail.slice(0, 200));
      errorBox.textContent = loginResponse.status >= 500
        ? "Service de connexion indisponible, réessayez dans un instant."
        : "Identifiant ou mot de passe incorrect.";
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
    
    window.location.assign(`/account/${encodeURIComponent(identifier)}/?jwt=${encodeURIComponent(loginResult.jwt)}&token=${encodeURIComponent(loginResult.oneTimeToken)}&username=${encodeURIComponent(identifier)}`);
  });
}

document.querySelectorAll(".social-login-button").forEach((button) => {
  button.addEventListener("click", () => {
    errorBox.textContent = `La connexion avec ${button.dataset.provider} n'est pas disponible pour le moment.`;
    errorBox.hidden = false;
  });
});
