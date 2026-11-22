// Loads Cloudflare Turnstile in visible mode. The widget runs on its own and
// stores the latest token; submit handlers only READ it — we never trigger the
// challenge on the user's behalf, so there's no deadlock between the checkbox
// and the submit button.

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise;
let widgetPromise;
let currentToken = null;

function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => reject(new Error("turnstile_script_failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

async function getWidget() {
  if (widgetPromise) return widgetPromise;
  widgetPromise = (async () => {
    const sitekey = window.__TURNSTILE_SITE_KEY__ || "0x4AAAAAAGBRuixsOkHxqB2N";
    if (!sitekey) return null; // Turnstile disabled.
    const turnstile = await loadScript();

    let container = document.getElementById("turnstile-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "turnstile-container";
      container.className = "turnstile-container";
      document.body.appendChild(container);
    }

    const id = turnstile.render(container, {
      sitekey,
      size: "compact", // Minimal visible widget — user clicks it themselves.
      theme: "dark",
      callback: (token) => { currentToken = token; },
      "error-callback": () => { currentToken = null; },
      "expired-callback": () => { currentToken = null; },
      "timeout-callback": () => { currentToken = null; },
    });
    return { turnstile, id };
  })();
  return widgetPromise;
}

// Returns the token produced by the widget, or null if the user hasn't
// completed the check yet. Never executes the challenge programmatically.
export function getTurnstileToken() {
  return currentToken;
}

// Kick off script + widget load early so the checkbox is ready on submit.
export function preloadTurnstile() {
  getWidget().catch(() => {});
}
