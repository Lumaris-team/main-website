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
    sessionStorage.setItem('jwt_token', jwt);
    sessionStorage.setItem('one_time_token', oneTimeToken);
    sessionStorage.setItem('username', username);
    sessionStorage.setItem('jwt_exp', String(Math.floor(Date.now() / 1000) + 1800));
    
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
    // Hide loading after page is fully loaded and data is ready
    setTimeout(() => hideLoadingOverlay(), 500);
  }
}

init();
