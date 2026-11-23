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
  // Reveal only while the eye is held down — release anywhere hides it again.
  const reveal = (show) => {
    password.type = show ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(show));
    toggle.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
  };
  toggle.addEventListener("pointerdown", (e) => { e.preventDefault(); reveal(true); });
  ["pointerup", "pointerleave", "pointercancel"].forEach((evt) =>
    toggle.addEventListener(evt, () => reveal(false))
  );
  toggle.addEventListener("contextmenu", (e) => e.preventDefault());
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
    
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    // The login worker intentionally never responds on failure — any problem
    // (wrong credentials, unreachable worker, timeout) surfaces here as the
    // same generic message. Turnstile keeps its own dedicated errors above.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let loginResult = null;
    try {
      const loginResponse = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (loginResponse.ok) {
        loginResult = await loginResponse.json().catch(() => null);
      }
    } catch {
      // network error or abort — fall through to generic message
    } finally {
      clearTimeout(timeout);
    }

    if (!loginResult?.jwt || !loginResult?.oneTimeToken) {
      if (submitBtn) submitBtn.disabled = false;
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
