import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { AuthUser } from "../types";
import { apiClient } from "../api/client";
import type { LoginResponse, TokenPair } from "../api/auth";

// ---------------------------------------------------------------------------
// Token storage strategy
// ---------------------------------------------------------------------------
// ACCESS TOKEN: Held **only** in Pinia state (memory). It is never written to
// localStorage / sessionStorage, so it cannot be exfiltrated by an XSS payload
// that reads `window.localStorage`. The trade-off is that a full page refresh
// loses the access token; the app must silently re-authenticate via the refresh
// token on init (see `initAuth`).
//
// REFRESH TOKEN: Stored in localStorage. Ideally this would be an HttpOnly
// cookie set by the backend so JavaScript cannot access it at all. However,
// for a LAN-deployed system that may not sit behind a reverse proxy capable of
// setting HttpOnly cookies, localStorage is the practical choice. The risk is
// partially mitigated by:
//   1. Content-Security-Policy headers served by the backend (Helmet) which
//      restrict inline scripts and third-party origins, reducing XSS surface.
//   2. Short refresh-token lifetimes combined with rotation on every use.
// In a production deployment with a proper proxy (e.g. nginx), migrate to
// HttpOnly secure cookies.
// ---------------------------------------------------------------------------

const REFRESH_KEY = "refresh_token";
const REFRESH_MODE = (import.meta.env.VITE_AUTH_REFRESH_MODE ?? "localstorage")
  .toLowerCase()
  .trim();
const USE_REFRESH_COOKIE = REFRESH_MODE === "cookie";

function writeRefreshToken(token: string): void {
  if (!USE_REFRESH_COOKIE) {
    localStorage.setItem(REFRESH_KEY, token);
  }
}

function readRefreshToken(): string | null {
  if (USE_REFRESH_COOKIE) {
    // Cookie mode cannot be inspected from JS by design (HttpOnly).
    // The backend is expected to read the cookie server-side on refresh.
    return "__cookie_mode__";
  }
  return localStorage.getItem(REFRESH_KEY);
}

function clearRefreshToken(): void {
  if (!USE_REFRESH_COOKIE) {
    localStorage.removeItem(REFRESH_KEY);
  }
}

/**
 * Return the current in-memory access token without importing the full store.
 * Used by the API client interceptor which may execute before any component
 * has called `useAuthStore()`.
 */
let _accessTokenGetter: (() => string | null) | null = null;
export function getAccessToken(): string | null {
  return _accessTokenGetter ? _accessTokenGetter() : null;
}

export const useAuthStore = defineStore("auth", () => {
  // Access token lives in memory only — never persisted to storage.
  const user = ref<AuthUser | null>(null);
  const accessToken = ref<string | null>(null);
  const authInitialized = ref(false);

  let initPromise: Promise<void> | null = null;

  // Expose a getter so the API interceptor can read the token without a
  // circular-import on the store.
  _accessTokenGetter = () => accessToken.value;

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value);

  async function login(username: string, password: string): Promise<void> {
    const res = await apiClient.post<LoginResponse>("/api/auth/login", {
      username,
      password,
    });
    _applyTokens(res.data.accessToken, res.data.user);
    writeRefreshToken(res.data.refreshToken);
    authInitialized.value = true;
    scheduleRefresh(res.data.expiresIn);
  }

  async function refreshSession(): Promise<void> {
    const rt = readRefreshToken();
    if (!rt) {
      logout();
      return;
    }
    try {
      const payload = USE_REFRESH_COOKIE ? {} : { refreshToken: rt };
      const res = await apiClient.post<TokenPair>("/api/auth/refresh", payload);
      // Fetch user info separately since refresh endpoint only returns tokens
      const meRes = await apiClient.get<AuthUser>("/api/auth/me", {
        headers: { Authorization: `Bearer ${res.data.accessToken}` },
      });
      _applyTokens(res.data.accessToken, meRes.data);
      if (res.data.refreshToken) {
        writeRefreshToken(res.data.refreshToken);
      }
      scheduleRefresh(res.data.expiresIn);
    } catch {
      logout();
    }
  }

  function _applyTokens(token: string, userData: AuthUser) {
    accessToken.value = token; // memory only — never persisted
    user.value = userData;
  }

  let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleRefresh(expiresInSeconds: number) {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    // Refresh 60 seconds before expiry
    const delay = Math.max(10_000, (expiresInSeconds - 60) * 1000);
    _refreshTimer = setTimeout(() => refreshSession(), delay);
  }

  /**
   * Attempt to restore the session on app startup by exchanging the persisted
   * refresh token for a new access token. Call this once from the root
   * component / router guard.
   */
  async function initAuth(): Promise<void> {
    const rt = readRefreshToken();
    if (!rt) return;
    try {
      await refreshSession();
    } catch {
      logout();
    }
  }

  async function ensureInitialized(): Promise<void> {
    if (authInitialized.value) return;
    if (!initPromise) {
      initPromise = (async () => {
        await initAuth();
      })().finally(() => {
        authInitialized.value = true;
        initPromise = null;
      });
    }
    await initPromise;
  }

  function logout(): void {
    apiClient.post("/api/auth/logout").catch(() => {});
    user.value = null;
    accessToken.value = null;
    clearRefreshToken();
    authInitialized.value = true;
    if (_refreshTimer) clearTimeout(_refreshTimer);
  }

  function can(permission: string): boolean {
    if (!user.value) return false;
    return FRONTEND_PERMISSIONS[permission]?.includes(user.value.role) ?? false;
  }

  return {
    user,
    accessToken,
    authInitialized,
    isAuthenticated,
    login,
    refreshSession,
    initAuth,
    ensureInitialized,
    logout,
    can,
  };
});

// Frontend-side permission check mirror (keeps UI reactive without API round-trips)
const FRONTEND_PERMISSIONS: Record<string, string[]> = {
  "users:read": ["administrator"],
  "users:create": ["administrator"],
  "audit:read": ["administrator", "auditor"],
  "audit:reveal-pii": ["administrator"],
  "settings:read": ["administrator"],
  "settings:update": ["administrator"],
  "integration-keys:manage": ["administrator"],
  "backup:read": ["administrator"],
  "classroom:read": ["administrator", "classroom_supervisor"],
  "parking:read": [
    "administrator",
    "operations_manager",
    "classroom_supervisor",
  ],
  "warehouse:read": ["administrator", "operations_manager"],
  "fulfillment:read": [
    "administrator",
    "operations_manager",
    "customer_service_agent",
    "auditor",
  ],
  "after-sales:read": [
    "administrator",
    "operations_manager",
    "customer_service_agent",
    "auditor",
  ],
  "shipment:read": [
    "administrator",
    "operations_manager",
    "customer_service_agent",
    "auditor",
  ],
  "metrics:read": ["administrator"],
  "logs:read": ["administrator"],
};
