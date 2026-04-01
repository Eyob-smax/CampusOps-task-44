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
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = "/login";
    }
    return Promise.reject(error.response?.data ?? error);
  },
);
