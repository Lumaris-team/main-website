// Account page initialization script
// Handles JWT exchange, auth guard, and JWT renewal
// Ensures all static assets are loaded before making API calls

import { guardPage, startJWTRenewal, logout } from "/lib/auth.js";
import { showLoadingOverlay, hideLoadingOverlay } from "/lib/loading.js";

// Handle JWT exchange from URL params (fallback: sessionStorage set by sign-in)
const urlParams = new URLSearchParams(window.location.search);
const jwt = urlParams.get('jwt') || sessionStorage.getItem('jwt');
const oneTimeToken = urlParams.get('token') || sessionStorage.getItem('oneTimeToken');
const username = urlParams.get('username') || sessionStorage.getItem('username') ||
  window.location.pathname.match(/^\/account\/([A-Za-z0-9_-]+)/)?.[1];

// Navbar refresh → loading overlay while the page refreshes its data
let refreshOverlayTimer = null;
window.addEventListener('site-navbar:refresh', () => {
  refreshOverlayTimer = setTimeout(showLoadingOverlay, 120);
});
window.addEventListener('site-navbar:refresh-done', () => {
  if (refreshOverlayTimer) {
    clearTimeout(refreshOverlayTimer);
    refreshOverlayTimer = null;
  }
  hideLoadingOverlay();
});

// Navbar logout → clear session and return to sign-in
window.addEventListener('site-navbar:logout', () => {
  logout();
});

async function init() {
  // Store JWT from URL params if present
  if (jwt && oneTimeToken && username) {
    // Expiry comes from the JWT exp claim (1h lifetime set by the auth worker).
    let exp = Math.floor(Date.now() / 1000) + 3600;
    try {
      const payload = JSON.parse(atob(String(jwt).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (typeof payload.exp === "number" && payload.exp > 0) exp = payload.exp;
    } catch { /* keep the fallback */ }
    for (const store of [sessionStorage, localStorage]) {
      store.setItem('jwt_token', jwt);
      store.setItem('one_time_token', oneTimeToken);
      store.setItem('username', username);
      store.setItem('jwt_exp', exp);
    }
    
    // Clean URL params
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }
  
  // Wait for DOM to be fully loaded
  if (document.readyState === 'loading') {
    await new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }
  
  // Wait for all resources to load
  await new Promise(resolve => {
    if (document.readyState === 'complete') {
      resolve();
    } else {
      window.addEventListener('load', resolve, { once: true });
    }
  });
  
  // Guard page and start JWT renewal
  const ok = await guardPage();
  // Always reveal the page once the guard settled: on failure the sign-in
  // overlay is already covering it, on success the content is ready.
  document.documentElement.removeAttribute("data-auth-pending");
  if (ok) {
    startJWTRenewal();
    // Hide loading after page is fully loaded and data is ready — unless the
    // page owns the overlay and will hide it once its first data load settles.
    setTimeout(() => { if (!window.__lumarisKeepLoading) hideLoadingOverlay(); }, 500);
  }
}

init();
