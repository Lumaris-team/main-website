# Frontend Libraries Directory

This directory contains shared JavaScript libraries and utilities that are used across multiple pages in the Lumaris platform. These libraries provide common functionality for authentication, API communication, settings management, and UI components.

## 📋 Table of Contents

- [Overview](#-overview)
- [Available Libraries](#-available-libraries)
- [Authentication Library](#authentication-library-authjs)
- [Turnstile Library](#turnstile-library-turnstilejs)
- [Settings Library](#settings-library-settingsjs)
- [Icons Library](#icons-library-iconsjs)
- [Usage Patterns](#-usage-patterns)
- [Development Guidelines](#-development-guidelines)

---

## 🎯 Overview

The libraries directory provides reusable functionality that is shared across the frontend application. These libraries handle:

- **Authentication**: User login, session management, and JWT token handling
- **API Communication**: API calls to main-client-worker
- **Security**: Turnstile CAPTCHA integration for bot protection
- **Settings**: User preferences and theme management
- **UI Components**: Icon system and UI utilities

### Design Principles

- **Modularity**: Each library is self-contained and independently usable
- **Reusability**: Functions are designed for use across multiple pages
- **Error Handling**: Comprehensive error handling and fallbacks
- **Performance**: Optimized for fast loading and execution
- **Security**: Secure handling of tokens and sensitive data

---

## 📚 Available Libraries

### Authentication Library (`auth.js`)

**Purpose**: Handle user authentication, session management, and page protection

**Key Functions**:
- `guardPage()`: Protect pages requiring authentication
- `authedFetch(input, init)`: Authenticated API calls with JWT refresh
- `logout()`: User logout and session cleanup
- `appendAuthParams(href)`: Append auth parameters to URLs
- `navigateWithAuth(href)`: Navigate with JWT parameters
- `startJWTRenewal()`: Start automatic JWT renewal every 10 minutes
- `stopJWTRenewal()`: Stop JWT renewal

### Loading Library (`loading.js`)

**Purpose**: Display loading overlay during authentication and data loading

**Key Functions**:
- `showLoadingOverlay()`: Show blurred loading overlay with Lumaris logo
- `hideLoadingOverlay()`: Hide loading overlay

### Turnstile Library (`turnstile.js`)

**Purpose**: Cloudflare Turnstile integration for bot protection

**Key Functions**:
- `getTurnstileToken()`: Get fresh Turnstile token for login
- `preloadTurnstile()`: Preload Turnstile script and widget

### Settings Library (`settings.js`)

**Purpose**: Manage user preferences and settings

**Key Functions**:
- `getSetting(key)`: Get user setting
- `setSetting(key, value)`: Set user setting
- `loadSettings()`: Load all user settings

### Icons Library (`icons.js`)

**Purpose**: Icon management and loading

**Key Functions**:
- `loadIcon(name)`: Load icon by name
- `getIcon(name)`: Get icon element

---

## 🎨 Usage Patterns

### Authentication Flow

1. **Login**: User submits credentials to authentication-client-worker
2. **Token Exchange**: authentication-client-worker returns JWT and one-time token
3. **Redirect**: Redirect to `/account/{username}/?jwt=...&token=...`
4. **Page Guard**: `guardPage()` checks JWT validity
5. **Data Loading**: `authedFetch()` makes authenticated API calls
6. **JWT Renewal**: Auto-renewal every 10 minutes via `startJWTRenewal()`

### Protected Pages

```javascript
import { guardPage, authedFetch, startJWTRenewal } from "/lib/auth.js";

// Protect page
if (!(await guardPage())) return;

// Start JWT renewal
startJWTRenewal();

// Load data
const data = await authedFetch("/api/data");
```

### Loading State

```javascript
import { showLoadingOverlay, hideLoadingOverlay } from "/lib/loading.js";

// Show loading
showLoadingOverlay();

// Load data
const data = await fetch("/api/data");

// Hide loading
hideLoadingOverlay();
```

---

## � Development Guidelines

### Adding New Libraries

1. Create a new `.js` file in this directory
2. Export functions and classes
3. Document in this README
4. Follow naming conventions (camelCase for functions, PascalCase for classes)

### Security Considerations

- **JWT Tokens**: Stored in sessionStorage/localStorage, never in cookies
- **API Calls**: All authenticated calls use `authedFetch()`
- **Token Refresh**: Automatic JWT renewal prevents session expiration
- **CORS**: Proper CORS headers configured in workers

### Error Handling

- All libraries include comprehensive error handling
- Graceful degradation when features are unavailable
- User-friendly error messages in French

---

## 📖 Examples

### Using Auth Library

```javascript
import { guardPage, authedFetch } from "/lib/auth.js";

// Protect page
if (!(await guardPage())) return;

// Make authenticated API call
const response = await authedFetch("/api/ed/classes");
const data = await response.json();
```

### Using Loading Library

```javascript
import { showLoadingOverlay, hideLoadingOverlay } from "/lib/loading.js";

// Show loading overlay
showLoadingOverlay();

// Do async work
await fetchData();

// Hide loading overlay
hideLoadingOverlay();
```

---

*Last updated: 2026-10-15*
