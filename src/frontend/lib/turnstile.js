// Loads Cloudflare Turnstile in visible mode and hands out a fresh token on demand.
// If no site key is configured, every call resolves to null so login keeps working.

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise;
let widgetPromise;
let pending = null; // { resolve, reject } for the in-flight execute()

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
    // Get site key from environment or config
    const sitekey = window.__TURNSTILE_SITE_KEY__ || "0x4AAAAAAGBRuixsOkHxqB2N";
    if (!sitekey) return null; // Turnstile disabled.
    const turnstile = await loadScript();
    
    // Use existing container or create one
    let container = document.getElementById("turnstile-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "turnstile-container";
      container.className = "turnstile-container";
      document.body.appendChild(container);
    }
    
    const id = turnstile.render(container, {
      sitekey,
      size: "normal", // Visible widget
      callback: (token) => {
        pending?.resolve(token);
        pending = null;
      },
      "error-callback": () => {
        pending?.resolve(null);
        pending = null;
      },
      "expired-callback": () => {
        pending?.resolve(null);
        pending = null;
      },
    });
    return { turnstile, id };
  })();
  return widgetPromise;
}

// Returns a fresh Turnstile token, or null when Turnstile is not configured / unavailable.
export async function getTurnstileToken() {
  try {
    const widget = await getWidget();
    if (!widget) return null;
    widget.turnstile.reset(widget.id);
    return await new Promise((resolve) => {
      pending = { resolve };
      widget.turnstile.execute(widget.id);
    });
  } catch (e) {
    return null;
  }
}

// Kick off script + widget load early so the first login isn't slowed down.
export function preloadTurnstile() {
  getWidget().catch(() => {});
}
