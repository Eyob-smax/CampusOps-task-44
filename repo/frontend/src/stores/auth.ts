import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { AuthUser } from "../types";
import { apiClient } from "../api/client";
import type { LoginResponse, TokenPair } from "../api/auth";

const REFRESH_KEY = "refresh_token";
const REFRESH_MODE = (import.meta.env.VITE_AUTH_REFRESH_MODE ?? "cookie")
  .toLowerCase()
  .trim();
const USE_REFRESH_COOKIE = REFRESH_MODE === "cookie";
const COOKIE_REFRESH_SENTINEL = "__cookie_mode__";
let memoryRefreshToken: string | null = null;

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
};

function writeRefreshToken(token: string): void {
  memoryRefreshToken = token;
  if (!USE_REFRESH_COOKIE) {
    localStorage.setItem(REFRESH_KEY, token);
  }
}

function readRefreshToken(): string | null {
  if (USE_REFRESH_COOKIE) {
    // Cookie mode cannot be inspected from JS by design (HttpOnly).
    // Use in-memory token and support one-time migration from legacy
    // localStorage value, then retire the fallback immediately.
    if (memoryRefreshToken) {
      return memoryRefreshToken;
    }

    const legacyToken = localStorage.getItem(REFRESH_KEY);
    if (legacyToken) {
      memoryRefreshToken = legacyToken;
      localStorage.removeItem(REFRESH_KEY);
      return legacyToken;
    }

    return COOKIE_REFRESH_SENTINEL;
  }
  return localStorage.getItem(REFRESH_KEY);
}

function clearRefreshToken(): void {
  memoryRefreshToken = null;
  // Always clear legacy localStorage key for user-switch isolation.
  localStorage.removeItem(REFRESH_KEY);
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
  memoryRefreshToken = null;

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
    const res = await apiClient.post<ApiEnvelope<LoginResponse>>("/api/auth/login", {
      username,
      password,
    });
    const payload = res.data.data;
    _applyTokens(payload.accessToken, payload.user);
    writeRefreshToken(payload.refreshToken);
    authInitialized.value = true;
    scheduleRefresh(payload.expiresIn);
  }

  async function refreshSession(): Promise<void> {
    const rt = readRefreshToken();
    if (!rt) {
      logout();
      return;
    }
    try {
      const payload =
        USE_REFRESH_COOKIE && rt === COOKIE_REFRESH_SENTINEL
          ? {}
          : { refreshToken: rt };
      const res = await apiClient.post<ApiEnvelope<TokenPair>>("/api/auth/refresh", payload);
      const tokens = res.data.data;
      // Fetch user info separately since refresh endpoint only returns tokens
      const meRes = await apiClient.get<ApiEnvelope<AuthUser>>("/api/auth/me", {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      _applyTokens(tokens.accessToken, meRes.data.data);
      if (tokens.refreshToken) {
        writeRefreshToken(tokens.refreshToken);
      }
      scheduleRefresh(tokens.expiresIn);
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
    if (isAuthenticated.value) {
      authInitialized.value = true;
      return;
    }

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
  "master-data:read": [
    "administrator",
    "operations_manager",
    "classroom_supervisor",
    "customer_service_agent",
    "auditor",
  ],
  "master-data:write": ["administrator", "operations_manager"],
  "students:write": ["administrator", "operations_manager"],
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
  "stored-value:read": ["administrator", "operations_manager"],
  "stored-value:topup": ["administrator", "operations_manager"],
  "stored-value:spend": [
    "administrator",
    "operations_manager",
    "customer_service_agent",
  ],
  "metrics:read": ["administrator"],
  "logs:read": ["administrator"],
};
