import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { resolveBackendOrigin } from "../utils/network";
import { getAccessToken } from "../stores/auth";

export const apiClient = axios.create({
  baseURL: resolveBackendOrigin(),
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

function isAuthEndpointRequest(url?: string): boolean {
  if (!url) return false;
  return /\/api\/auth\/(login|refresh|logout)(?:$|[/?#])/i.test(url);
}

function isOnLoginPage(): boolean {
  if (typeof window === "undefined") return false;

  const pathname = (window.location as any)?.pathname;
  if (typeof pathname === "string" && pathname.startsWith("/login")) {
    return true;
  }

  const href = window.location?.href;
  return typeof href === "string" && /\/login(?:$|[?#])/.test(href);
}

// Attach in-memory access token to every request (never read from localStorage)
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Auto-inject idempotency key for mutating requests
  if (["post", "put", "patch"].includes(config.method?.toLowerCase() ?? "")) {
    if (!config.headers["X-Idempotency-Key"]) {
      config.headers["X-Idempotency-Key"] = uuidv4();
    }
  }

  return config;
});

// Handle 401 — redirect to login
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url as string | undefined;

    if (
      status === 401 &&
      !isAuthEndpointRequest(requestUrl) &&
      !isOnLoginPage()
    ) {
      window.location.href = "/login";
    }
    return Promise.reject(error.response?.data ?? error);
  },
);
