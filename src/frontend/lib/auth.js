// Client-side auth guard using JWT from login-client-worker
// No Supabase - custom JWT system

import { showLoadingOverlay, hideLoadingOverlay } from "/lib/loading.js";

const ACCOUNT_BASE = window.__ACCOUNT_BASE_PATH__ || "";
const ACCOUNT_WORKER_BASE = window.__ACCOUNT_WORKER_BASE__ || "";
const accountPath = (path) => `${ACCOUNT_BASE}${path}`;
const AUTH_PAGE = accountPath("/pages/auth");
const HOME_PAGE = accountPath("/pages/home");
const LANDING_PATHS = [accountPath("/pages"), accountPath("/pages/")];
const REDIRECT_COOKIE = "post_auth_redirect";
const REDIRECT_COOKIE_TTL = 600; // seconds

const STORAGE_KEYS = {
  jwt: "jwt_token",
  jwtExp: "jwt_exp",
  oneTimeToken: "one_time_token",
  username: "username",
};

// --- JWT management ---------------------------------------------------------

function getJWT() {
  return sessionStorage.getItem(STORAGE_KEYS.jwt) || localStorage.getItem(STORAGE_KEYS.jwt);
}

function getJWTExpiry() {
  return Number(sessionStorage.getItem(STORAGE_KEYS.jwtExp) || localStorage.getItem(STORAGE_KEYS.jwtExp) || 0);
}

function getOneTimeToken() {
  return sessionStorage.getItem(STORAGE_KEYS.oneTimeToken) || localStorage.getItem(STORAGE_KEYS.oneTimeToken);
}

function getUsername() {
  return sessionStorage.getItem(STORAGE_KEYS.username) || localStorage.getItem(STORAGE_KEYS.username);
}

function storeJWT(jwt, oneTimeToken, username, expiresIn = 1800) {
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  sessionStorage.setItem(STORAGE_KEYS.jwt, jwt);
  sessionStorage.setItem(STORAGE_KEYS.jwtExp, String(exp));
  sessionStorage.setItem(STORAGE_KEYS.oneTimeToken, oneTimeToken);
  sessionStorage.setItem(STORAGE_KEYS.username, username);
  // Also store in localStorage for persistence
  localStorage.setItem(STORAGE_KEYS.jwt, jwt);
  localStorage.setItem(STORAGE_KEYS.jwtExp, String(exp));
  localStorage.setItem(STORAGE_KEYS.oneTimeToken, oneTimeToken);
  localStorage.setItem(STORAGE_KEYS.username, username);
}

function clearAuth() {
  for (const key of Object.values(STORAGE_KEYS)) {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  }
}

function isJWTValid() {
  const jwt = getJWT();
  const exp = getJWTExpiry();
  if (!jwt) return false;
  const now = Math.floor(Date.now() / 1000);
  return exp > now + 60; // 60 seconds buffer
}

// --- JWT renewal ------------------------------------------------------------

async function renewJWT() {
  const username = getUsername();
  const oneTimeToken = getOneTimeToken();
  
  if (!username || !oneTimeToken) {
    return null;
  }

  try {
    // Call main-client-worker to exchange one-time token for new JWT
    const response = await fetch(`${ACCOUNT_WORKER_BASE}/api/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, oneTimeToken }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.valid && data.jwt && data.oneTimeToken) {
      storeJWT(data.jwt, data.oneTimeToken, username, 1800);
      return data.jwt;
    }
    return null;
  } catch (e) {
    console.error("JWT renewal failed:", e);
    return null;
  }
}

// --- Initial JWT exchange ---------------------------------------------------

export async function exchangeOneTimeToken(username, oneTimeToken) {
  try {
    const response = await fetch(`${ACCOUNT_WORKER_BASE}/api/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, oneTimeToken }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.valid && data.jwt && data.oneTimeToken) {
      storeJWT(data.jwt, data.oneTimeToken, username, 1800);
      return data.jwt;
    }
    return null;
  } catch (e) {
    console.error("JWT exchange failed:", e);
    return null;
  }
}

// --- Authenticated fetch ----------------------------------------------------

export async function authedFetch(input, init = {}) {
  const shouldShowLoading = sessionStorage.getItem('show_loading') === '1';
  if (!shouldShowLoading) {
    showLoadingOverlay();
  }
  
  try {
    let jwt = getJWT();
    if (!jwt || !isJWTValid()) {
      // Try to renew JWT
      jwt = await renewJWT();
      if (!jwt) {
        redirectToAuth();
        throw new Error("Not authenticated");
      }
    }

    const withAuth = (token) => ({
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    });

    const requestUrl = typeof input === "string" && input.startsWith("/")
      ? `${ACCOUNT_WORKER_BASE}${input}`
      : input;
    let res = await fetch(requestUrl, withAuth(jwt));
    
    if (res.status === 401) {
      // JWT expired or invalid, try to renew
      clearAuth();
      jwt = await renewJWT();
      if (!jwt) {
        redirectToAuth();
        throw new Error("Not authenticated");
      }
      res = await fetch(requestUrl, withAuth(jwt));
    }
    
    return res;
  } finally {
    if (!shouldShowLoading) {
      hideLoadingOverlay();
    }
  }
}

// --- Page guard -------------------------------------------------------------

export async function guardPage() {
  const shouldShowLoading = sessionStorage.getItem('show_loading') === '1';
  if (shouldShowLoading) {
    sessionStorage.removeItem('show_loading');
    showLoadingOverlay();
  }
  
  try {
    // Check if we have a valid JWT
    let jwt = getJWT();
    if (!jwt || !isJWTValid()) {
      // Try to renew JWT if we have one-time token
      jwt = await renewJWT();
      if (!jwt) {
        redirectToAuth();
        return false;
      }
    }

    // Check if we need to redirect to post-auth page
    if (consumePostAuthRedirect()) {
      return false;
    }

    // If we landed on "/pages/", redirect to home
    if (isLandingPath()) {
      navigateWithAuth(HOME_PAGE);
      return false;
    }

    return true;
  } finally {
    // Don't hide loading if it was triggered by login redirect
    if (!shouldShowLoading) {
      hideLoadingOverlay();
    }
  }
}

// --- Navigation -------------------------------------------------------------

export function navigateWithAuth(href) {
  const jwt = getJWT();
  const oneTimeToken = getOneTimeToken();
  const username = getUsername();
  
  if (!jwt || !oneTimeToken || !username) {
    window.location.href = href;
    return;
  }

  const url = new URL(href, window.location.origin);
  url.searchParams.set("jwt", jwt);
  url.searchParams.set("token", oneTimeToken);
  url.searchParams.set("username", username);
  window.location.href = url.toString();
}

export function appendAuthParams(href) {
  const jwt = getJWT();
  const oneTimeToken = getOneTimeToken();
  const username = getUsername();
  
  if (!jwt || !oneTimeToken || !username) {
    return href;
  }

  try {
    const url = new URL(href, window.location.origin);
    url.searchParams.set("jwt", jwt);
    url.searchParams.set("token", oneTimeToken);
    url.searchParams.set("username", username);
    return url.toString();
  } catch (e) {
    return href;
  }
}

// --- Post-auth redirect -----------------------------------------------------

function normalizePath(path) {
  return path.replace(/\/?$/, "/");
}

function setCookie(name, value, maxAgeSeconds) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function isAuthPage() {
  return normalizePath(window.location.pathname) === normalizePath(AUTH_PAGE);
}

function isLandingPath() {
  return LANDING_PATHS.includes(window.location.pathname);
}

function redirectToAuth() {
  if (isAuthPage()) return;
  const target = window.location.pathname + window.location.search;
  if (target && !normalizePath(target).startsWith(normalizePath(AUTH_PAGE))) {
    setCookie(REDIRECT_COOKIE, target, REDIRECT_COOKIE_TTL);
  }
  window.location.replace(AUTH_PAGE);
}

function consumePostAuthRedirect() {
  const target = getCookie(REDIRECT_COOKIE);
  if (!target) return false;
  deleteCookie(REDIRECT_COOKIE);
  if (!target.startsWith(accountPath("/pages/"))) return false;
  if (normalizePath(target).startsWith(normalizePath(AUTH_PAGE))) return false;
  if (normalizePath(target) === normalizePath(window.location.pathname + window.location.search)) {
    return false;
  }
  navigateWithAuth(target);
  return true;
}

// --- JWT auto-renewal -------------------------------------------------------

let renewalInterval = null;

export function startJWTRenewal() {
  if (renewalInterval) clearInterval(renewalInterval);
  
  // Renew JWT every 10 minutes
  renewalInterval = setInterval(async () => {
    const jwt = await renewJWT();
    if (!jwt) {
      // JWT renewal failed, show loading and redirect to auth
      showLoadingOverlay();
      redirectToAuth();
    }
  }, 600000); // 10 minutes
}

export function stopJWTRenewal() {
  if (renewalInterval) {
    clearInterval(renewalInterval);
    renewalInterval = null;
  }
}

// --- Logout -----------------------------------------------------------------

export async function logout() {
  clearAuth();
  stopJWTRenewal();
  window.location.replace(AUTH_PAGE);
}
