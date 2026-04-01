import type { Router } from "vue-router";
import { useAuthStore } from "../stores/auth";
import type { UserRole } from "../types";

declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean;
    roles?: UserRole[];
    title?: string;
  }
}

export function installAuthGuards(router: Router): void {
  router.beforeEach(async (to) => {
    const auth = useAuthStore();

    if (to.meta.requiresAuth) {
      await auth.ensureInitialized();
    }

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { path: "/login", query: { redirect: to.fullPath } };
    }

    if (to.meta.roles) {
      if (!auth.user || !to.meta.roles.includes(auth.user.role)) {
        return { path: "/dashboard" };
      }
    }

    document.title = to.meta.title
      ? `${to.meta.title} — CampusOps`
      : "CampusOps";
    return true;
  });
}
