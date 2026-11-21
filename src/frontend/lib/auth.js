import { showLoadingOverlay, hideLoadingOverlay } from "/lib/loading.js";

// Simple auth system using login-client-worker JWT

const ACCOUNT_WORKER_BASE = window.__ACCOUNT_WORKER_BASE__ || "";

// Storage keys
const STORAGE_KEYS = {
  username: "account_username",
  token: "auth_token",
  tokenExp: "auth_token_exp",
};

// Get current username
export function getUsername() {
  return localStorage.getItem(STORAGE_KEYS.username);
}

// Get current JWT token
export function getToken() {
  return localStorage.getItem(STORAGE_KEYS.token);
}

// Check if authenticated
export function isAuthenticated() {
  return !!getUsername() && !!getToken();
}

// Set auth data
export function setAuth(username, token, expiresIn) {
  localStorage.setItem(STORAGE_KEYS.username, username);
  localStorage.setItem(STORAGE_KEYS.token, token);
  const exp = Math.floor(Date.now() / 1000) + (expiresIn || 1800);
  localStorage.setItem(STORAGE_KEYS.tokenExp, String(exp));
}

// Clear auth data
export function clearAuth() {
  localStorage.removeItem(STORAGE_KEYS.username);
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.tokenExp);
}

// Show reconnection modal
function showReconnectionModal() {
  showLoadingOverlay();
  
  const modal = document.createElement("div");
  modal.id = "reconnection-modal";
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Session expirée</h2>
      <p>Votre session a expiré. Veuillez vous reconnecter.</p>
      <form id="reconnect-form">
        <input type="text" id="reconnect-username" placeholder="Nom d'utilisateur" required />
        <input type="password" id="reconnect-password" placeholder="Mot de passe" required />
        <button type="submit">Se reconnecter</button>
      </form>
    </div>
  `;
  
  const style = document.createElement("style");
  style.textContent = `
    #reconnection-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    }
    .modal-content {
      background: #1a1a1a;
      padding: 2rem;
      border-radius: 8px;
      max-width: 400px;
      width: 90%;
    }
    .modal-content h2 {
      margin-bottom: 1rem;
      color: #fff;
    }
    .modal-content p {
      margin-bottom: 1rem;
      color: #ccc;
    }
    .modal-content form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .modal-content input {
      padding: 0.75rem;
      border: 1px solid #333;
      border-radius: 4px;
      background: #2a2a2a;
      color: #fff;
    }
    .modal-content button {
      padding: 0.75rem;
      background: #4f46e5;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .modal-content button:hover {
      background: #4338ca;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(modal);
  
  document.getElementById("reconnect-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("reconnect-username").value;
    const password = document.getElementById("reconnect-password").value;
    
    try {
      const response = await fetch(`${ACCOUNT_WORKER_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setAuth(data.username, data.token, data.expiresIn);
        modal.remove();
        style.remove();
        hideLoadingOverlay();
        window.location.reload();
      }
    } catch (error) {
      console.error("Reconnection failed:", error);
    }
  });
}

// Exchange one-time token for JWT
export async function exchangeTokenForJWT(username, oneTimeToken) {
  try {
    const response = await fetch(`${ACCOUNT_WORKER_BASE}/api/auth/one-time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, token: oneTimeToken }),
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.token) {
        setAuth(username, data.token, data.exp || 1800);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Token exchange failed:", error);
    return false;
  }
}

// Check if JWT is still valid
export async function isJWTValid() {
  const token = getToken();
  const username = getUsername();
  
  if (!token || !username) return false;
  
  try {
    const response = await fetch(`${ACCOUNT_WORKER_BASE}/api/auth/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, username }),
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.valid === true;
    }
    return false;
  } catch (error) {
    console.error("JWT validation failed:", error);
    return false;
  }
}

// Setup automatic token refresh every 10 minutes
export function setupTokenRefresh() {
  // Clear existing interval
  if (window._tokenRefreshInterval) {
    clearInterval(window._tokenRefreshInterval);
  }
  
  window._tokenRefreshInterval = setInterval(async () => {
    const username = getUsername();
    const token = getToken();
    
    if (!username || !token) return;
    
    const isValid = await isJWTValid();
    if (!isValid) {
      clearInterval(window._tokenRefreshInterval);
      showReconnectionModal();
    }
  }, 10 * 60 * 1000); // 10 minutes
}

// Guard page - require authentication
export async function guardPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const oneTimeToken = urlParams.get("token");
  const urlUsername = urlParams.get("username");
  
  // If we have a one-time token in URL, exchange it for JWT
  if (oneTimeToken && urlUsername) {
    showLoadingOverlay();
    const success = await exchangeTokenForJWT(urlUsername, oneTimeToken);
    
    if (success) {
      // Remove token from URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      setupTokenRefresh();
      hideLoadingOverlay();
      return true;
    }
    
    clearAuth();
    window.location.href = "/sign-in/";
    return false;
  }
  
  // Check if authenticated
  if (!isAuthenticated()) {
    window.location.href = "/sign-in/";
    return false;
  }
  
  // Check if JWT is still valid
  const isValid = await isJWTValid();
  if (!isValid) {
    showReconnectionModal();
    return false;
  }
  
  setupTokenRefresh();
  return true;
}

// Authenticated fetch with JWT
export async function authedFetch(input, init = {}) {
  const token = getToken();
  const username = getUsername();
  
  if (!token || !username) {
    window.location.href = "/sign-in/";
    throw new Error("Not authenticated");
  }
  
  const requestUrl = typeof input === "string" && input.startsWith("/")
    ? `${ACCOUNT_WORKER_BASE}${input}`
    : input;
  
  const headers = {
    ...(init.headers || {}),
    "Authorization": `Bearer ${token}`,
    "X-Username": username,
  };
  
  let res = await fetch(requestUrl, { ...init, headers });
  
  // If 401, try to refresh token
  if (res.status === 401) {
    const isValid = await isJWTValid();
    if (!isValid) {
      showReconnectionModal();
      throw new Error("Session expired");
    }
    
    // Retry with same token (should work if JWT is valid)
    res = await fetch(requestUrl, { ...init, headers });
  }
  
  return res;
}
