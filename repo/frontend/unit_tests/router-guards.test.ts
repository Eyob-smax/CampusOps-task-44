import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/api/client", () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  },
}));

import { installAuthGuards } from "../src/router/guards";
import { useAuthStore } from "../src/stores/auth";
import type { AuthUser } from "../src/types";

function makeUser(role: AuthUser["role"] = "administrator"): AuthUser {
  return { id: "1", username: "test", role };
}

async function navigate(path: string) {
  await router.push(path);
  await router.isReady();
}

const DummyComponent = { template: "<div />" };

function buildRouter() {
  const testRouter = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/login", component: DummyComponent, meta: { title: "Login" } },
      {
        path: "/",
        component: DummyComponent,
        meta: { requiresAuth: true },
        children: [
          { path: "", redirect: "/dashboard" },
          { path: "dashboard", component: DummyComponent, meta: { title: "Dashboard" } },
          {
            path: "classroom",
            component: DummyComponent,
            meta: { title: "Classroom", roles: ["administrator", "classroom_supervisor"] },
          },
          {
            path: "warehouses",
            component: DummyComponent,
            meta: { title: "Warehouses", roles: ["administrator", "operations_manager"] },
          },
          {
            path: "fulfillment",
            component: DummyComponent,
            meta: { title: "Fulfillment" },
          },
          {
            path: "membership/stored-value",
            component: DummyComponent,
            meta: {
              title: "Stored Value",
              roles: ["administrator", "operations_manager"],
            },
          },
          {
            path: "admin/users",
            component: DummyComponent,
            meta: { title: "User Management", roles: ["administrator"] },
          },
          {
            path: "admin/audit-log",
            component: DummyComponent,
            meta: { title: "Audit Log", roles: ["administrator", "auditor"] },
          },
          {
            path: "admin/settings",
            component: DummyComponent,
            meta: { title: "System Settings", roles: ["administrator"] },
          },
        ],
      },
      { path: "/:pathMatch(.*)*", component: DummyComponent },
    ],
  });

  installAuthGuards(testRouter);
  return testRouter;
}

let router = buildRouter();

describe("Router Guards", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    router = buildRouter();
    await navigate("/login");
  });

  describe("unauthenticated user", () => {
    it("waits for auth initialization before protected route checks", async () => {
      const store = useAuthStore();
      const ensureSpy = vi
        .spyOn(store, "ensureInitialized")
        .mockResolvedValue(undefined);

      await navigate("/dashboard");

      expect(ensureSpy).toHaveBeenCalled();
    });

    it("redirects to /login for protected routes", async () => {
      await navigate("/dashboard");
      expect(router.currentRoute.value.path).toBe("/login");
    });

    it("preserves the original path in redirect query", async () => {
      await navigate("/admin/users");
      expect(router.currentRoute.value.path).toBe("/login");
      expect(router.currentRoute.value.query.redirect).toBe("/admin/users");
    });

    it("can access /login without redirect", async () => {
      await navigate("/login");
      expect(router.currentRoute.value.path).toBe("/login");
    });
  });

  describe("authenticated user", () => {
    it("admin can access /dashboard", async () => {
      const store = useAuthStore();
      store.user = makeUser("administrator");
      store.accessToken = "tok";

      await navigate("/dashboard");
      expect(router.currentRoute.value.path).toBe("/dashboard");
    });

    it("admin can access /admin/users", async () => {
      const store = useAuthStore();
      store.user = makeUser("administrator");
      store.accessToken = "tok";

      await navigate("/admin/users");
      expect(router.currentRoute.value.path).toBe("/admin/users");
    });

    it("admin can access /admin/settings", async () => {
      const store = useAuthStore();
      store.user = makeUser("administrator");
      store.accessToken = "tok";

      await navigate("/admin/settings");
      expect(router.currentRoute.value.path).toBe("/admin/settings");
    });
  });

  describe("role-based access", () => {
    it("classroom_supervisor cannot access admin routes", async () => {
      const store = useAuthStore();
      store.user = makeUser("classroom_supervisor");
      store.accessToken = "tok";

      await navigate("/admin/users");
      expect(router.currentRoute.value.path).toBe("/dashboard");
    });

    it("classroom_supervisor can access classroom route", async () => {
      const store = useAuthStore();
      store.user = makeUser("classroom_supervisor");
      store.accessToken = "tok";

      await navigate("/classroom");
      expect(router.currentRoute.value.path).toBe("/classroom");
    });

    it("operations_manager cannot access admin/settings", async () => {
      const store = useAuthStore();
      store.user = makeUser("operations_manager");
      store.accessToken = "tok";

      await navigate("/admin/settings");
      expect(router.currentRoute.value.path).toBe("/dashboard");
    });

    it("operations_manager can access warehouses", async () => {
      const store = useAuthStore();
      store.user = makeUser("operations_manager");
      store.accessToken = "tok";

      await navigate("/warehouses");
      expect(router.currentRoute.value.path).toBe("/warehouses");
    });

    it("operations_manager can access stored-value", async () => {
      const store = useAuthStore();
      store.user = makeUser("operations_manager");
      store.accessToken = "tok";

      await navigate("/membership/stored-value");
      expect(router.currentRoute.value.path).toBe("/membership/stored-value");
    });

    it("auditor can access audit-log", async () => {
      const store = useAuthStore();
      store.user = makeUser("auditor");
      store.accessToken = "tok";

      await navigate("/admin/audit-log");
      expect(router.currentRoute.value.path).toBe("/admin/audit-log");
    });

    it("auditor cannot access admin/users", async () => {
      const store = useAuthStore();
      store.user = makeUser("auditor");
      store.accessToken = "tok";

      await navigate("/admin/users");
      expect(router.currentRoute.value.path).toBe("/dashboard");
    });

    it("customer_service_agent can access fulfillment", async () => {
      const store = useAuthStore();
      store.user = makeUser("customer_service_agent");
      store.accessToken = "tok";

      await navigate("/fulfillment");
      expect(router.currentRoute.value.path).toBe("/fulfillment");
    });

    it("customer_service_agent cannot access classroom", async () => {
      const store = useAuthStore();
      store.user = makeUser("customer_service_agent");
      store.accessToken = "tok";

      await navigate("/classroom");
      expect(router.currentRoute.value.path).toBe("/dashboard");
    });

    it("customer_service_agent cannot access stored-value", async () => {
      const store = useAuthStore();
      store.user = makeUser("customer_service_agent");
      store.accessToken = "tok";

      await navigate("/membership/stored-value");
      expect(router.currentRoute.value.path).toBe("/dashboard");
    });
  });

  describe("public routes", () => {
    it("/login is accessible without authentication", async () => {
      await navigate("/login");
      expect(router.currentRoute.value.path).toBe("/login");
    });
  });
});
