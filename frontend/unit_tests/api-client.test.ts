import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

// Shared localStorage backing store from setup.ts
const _ls = (globalThis as any).__test_ls as Record<string, string>;
let mockAccessToken: string | null = null;

// ---------------------------------------------------------------------------
// Mock uuid
// ---------------------------------------------------------------------------
vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-1234"),
}));

vi.mock("../src/stores/auth", () => ({
  getAccessToken: vi.fn(() => mockAccessToken),
}));

// Import the real apiClient to test its interceptors
import { apiClient } from "../src/api/client";
import type { InternalAxiosRequestConfig } from "axios";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function runRequestInterceptors(
  partial: Partial<InternalAxiosRequestConfig>,
): InternalAxiosRequestConfig {
  const config: InternalAxiosRequestConfig = {
    ...partial,
    headers: new axios.AxiosHeaders(partial.headers as any),
  } as InternalAxiosRequestConfig;

  const handlers = (apiClient.interceptors.request as any).handlers as Array<{
    fulfilled:
      | ((c: InternalAxiosRequestConfig) => InternalAxiosRequestConfig)
      | null;
  }>;
  let result = config;
  for (const h of handlers) {
    if (h.fulfilled) result = h.fulfilled(result);
  }
  return result;
}

async function runResponseErrorInterceptor(error: any): Promise<any> {
  const handlers = (apiClient.interceptors.response as any).handlers as Array<{
    fulfilled: ((r: any) => any) | null;
    rejected: ((e: any) => any) | null;
  }>;
  for (const h of handlers) {
    if (h.rejected) {
      try {
        return await h.rejected(error);
      } catch (e) {
        return Promise.reject(e);
      }
    }
  }
  return Promise.reject(error);
}

function runResponseSuccessInterceptor(response: any): any {
  const handlers = (apiClient.interceptors.response as any).handlers as Array<{
    fulfilled: ((r: any) => any) | null;
    rejected: ((e: any) => any) | null;
  }>;
  for (const h of handlers) {
    if (h.fulfilled) {
      return h.fulfilled(response);
    }
  }
  return response;
}

function clearLS() {
  Object.keys(_ls).forEach((k) => delete _ls[k]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("API Client", () => {
  beforeEach(() => {
    clearLS();
    mockAccessToken = null;
    (globalThis as any).window.location.href = "http://localhost/";
  });

  // -----------------------------------------------------------------------
  // Base URL
  // -----------------------------------------------------------------------
  describe("base URL", () => {
    it("is constructed from protocol + hostname + backend port", () => {
      expect(apiClient.defaults.baseURL).toBe("http://localhost:6006");
    });
  });

  // -----------------------------------------------------------------------
  // Authorization header
  // -----------------------------------------------------------------------
  describe("authorization header", () => {
    it("attaches Bearer token when access token exists in auth store", () => {
      mockAccessToken = "my-jwt";
      const config = runRequestInterceptors({ method: "get" });
      expect(config.headers.get("Authorization")).toBe("Bearer my-jwt");
    });

    it("does NOT attach Authorization when no token", () => {
      const config = runRequestInterceptors({ method: "get" });
      expect(config.headers.get("Authorization")).toBeFalsy();
    });
  });

  // -----------------------------------------------------------------------
  // Idempotency key
  // -----------------------------------------------------------------------
  describe("idempotency key", () => {
    it.each(["post", "put", "patch"])(
      "injects X-Idempotency-Key for %s requests",
      (method) => {
        const config = runRequestInterceptors({ method });
        expect(config.headers.get("X-Idempotency-Key")).toBe("test-uuid-1234");
      },
    );

    it.each(["get", "delete"])(
      "does NOT inject X-Idempotency-Key for %s requests",
      (method) => {
        const config = runRequestInterceptors({ method });
        expect(config.headers.get("X-Idempotency-Key")).toBeFalsy();
      },
    );

    it("does not overwrite an existing X-Idempotency-Key", () => {
      const config = runRequestInterceptors({
        method: "post",
        headers: new axios.AxiosHeaders({ "X-Idempotency-Key": "custom-key" }),
      });
      expect(config.headers.get("X-Idempotency-Key")).toBe("custom-key");
    });
  });

  // -----------------------------------------------------------------------
  // 401 response handling
  // -----------------------------------------------------------------------
  describe("response shape", () => {
    it("keeps fulfilled Axios responses intact", () => {
      const response = {
        data: { success: true, data: { hello: "world" } },
        status: 200,
      };
      const result = runResponseSuccessInterceptor(response);
      expect(result).toBe(response);
      expect(result.data.data.hello).toBe("world");
    });
  });

  describe("401 response", () => {
    it("redirects to /login", async () => {
      _ls["access_token"] = "old-token";
      const error = {
        response: { status: 401, data: { message: "Unauthorized" } },
        config: { url: "/api/students" },
      };

      await expect(runResponseErrorInterceptor(error)).rejects.toEqual({
        message: "Unauthorized",
      });

      expect(_ls["access_token"]).toBe("old-token");
      expect((globalThis as any).window.location.href).toBe("/login");
    });

    it("does not redirect for /api/auth/refresh 401", async () => {
      const error = {
        response: { status: 401, data: { message: "Unauthorized" } },
        config: { url: "/api/auth/refresh" },
      };

      await expect(runResponseErrorInterceptor(error)).rejects.toEqual({
        message: "Unauthorized",
      });

      expect((globalThis as any).window.location.href).toBe(
        "http://localhost/",
      );
    });

    it("does not redirect when already on /login", async () => {
      (globalThis as any).window.location.href = "http://localhost/login";
      const error = {
        response: { status: 401, data: { message: "Unauthorized" } },
        config: { url: "/api/students" },
      };

      await expect(runResponseErrorInterceptor(error)).rejects.toEqual({
        message: "Unauthorized",
      });

      expect((globalThis as any).window.location.href).toBe(
        "http://localhost/login",
      );
    });

    it("does not redirect for non-401 errors", async () => {
      _ls["access_token"] = "my-token";
      const error = {
        response: { status: 500, data: { message: "Server error" } },
      };

      await expect(runResponseErrorInterceptor(error)).rejects.toEqual({
        message: "Server error",
      });

      expect(_ls["access_token"]).toBe("my-token");
      expect((globalThis as any).window.location.href).toBe(
        "http://localhost/",
      );
    });
  });
});
