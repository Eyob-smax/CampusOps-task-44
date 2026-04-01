import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRouter, createMemoryHistory, type RouteLocationNormalized } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';

// Globals provided by setup.ts

// ---------------------------------------------------------------------------
// Mock apiClient
// ---------------------------------------------------------------------------
vi.mock('../src/api/client', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  },
}));

import { useAuthStore } from '../src/stores/auth';
import type { AuthUser } from '../src/types';

// ---------------------------------------------------------------------------
// Helpers — build a lightweight router with the same route config + guard
// ---------------------------------------------------------------------------
const DummyComponent = { template: '<div/>' };

function buildRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: DummyComponent, meta: { title: 'Login' } },
      {
        path: '/',
        component: DummyComponent,
        meta: { requiresAuth: true },
        children: [
          { path: '', redirect: '/dashboard' },
          { path: 'dashboard', component: DummyComponent, meta: { title: 'Dashboard' } },
          { path: 'classroom', component: DummyComponent, meta: { title: 'Classroom', roles: ['administrator', 'classroom_supervisor'] } },
          { path: 'parking', component: DummyComponent, meta: { title: 'Parking', roles: ['administrator', 'operations_manager', 'classroom_supervisor'] } },
          { path: 'admin/users', component: DummyComponent, meta: { title: 'Users', roles: ['administrator'] } },
          { path: 'admin/audit-log', component: DummyComponent, meta: { title: 'Audit Log', roles: ['administrator', 'auditor'] } },
          { path: 'admin/settings', component: DummyComponent, meta: { title: 'System Settings', roles: ['administrator'] } },
          { path: 'warehouses', component: DummyComponent, meta: { title: 'Warehouses', roles: ['administrator', 'operations_manager'] } },
          { path: 'fulfillment', component: DummyComponent, meta: { title: 'Fulfillment' } },
        ],
      },
      { path: '/:pathMatch(.*)*', component: DummyComponent },
    ],
  });

  // Replicate the same guard logic from the real router
  router.beforeEach(async (to) => {
    const auth = useAuthStore();

    if (to.meta.requiresAuth) {
      await auth.ensureInitialized();
    }

    if (to.matched.some((r) => r.meta.requiresAuth) && !auth.isAuthenticated) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }

    const roles = to.meta.roles as string[] | undefined;
    if (roles) {
      if (!auth.user || !roles.includes(auth.user.role)) {
        return { path: '/dashboard' };
      }
    }

    return true;
  });

  return router;
}

function makeUser(role: AuthUser['role'] = 'administrator'): AuthUser {
  return { id: '1', username: 'test', role };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Router Guards', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // -----------------------------------------------------------------------
  // Unauthenticated access
  // -----------------------------------------------------------------------
  describe('unauthenticated user', () => {
    it('waits for auth initialization before protected route checks', async () => {
      const store = useAuthStore();
      const ensureSpy = vi.spyOn(store, 'ensureInitialized').mockResolvedValue(undefined);

      const router = buildRouter();
      await router.push('/dashboard');
      await router.isReady();

      expect(ensureSpy).toHaveBeenCalled();
    });

    it('redirects to /login for protected routes', async () => {
      const router = buildRouter();
      await router.push('/dashboard');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/login');
    });

    it('preserves the original path in redirect query', async () => {
      const router = buildRouter();
      await router.push('/admin/users');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/login');
      expect(router.currentRoute.value.query.redirect).toBe('/admin/users');
    });

    it('can access /login without redirect', async () => {
      const router = buildRouter();
      await router.push('/login');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/login');
    });
  });

  // -----------------------------------------------------------------------
  // Authenticated access
  // -----------------------------------------------------------------------
  describe('authenticated user', () => {
    it('admin can access /dashboard', async () => {
      const store = useAuthStore();
      store.user = makeUser('administrator');
      store.accessToken = 'tok';

      const router = buildRouter();
      await router.push('/dashboard');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/dashboard');
    });

    it('admin can access /admin/users', async () => {
      const store = useAuthStore();
      store.user = makeUser('administrator');
      store.accessToken = 'tok';

      const router = buildRouter();
      await router.push('/admin/users');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/admin/users');
    });

    it('admin can access /admin/settings', async () => {
      const store = useAuthStore();
      store.user = makeUser('administrator');
      store.accessToken = 'tok';

      const router = buildRouter();
      await router.push('/admin/settings');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/admin/settings');
    });
  });

  // -----------------------------------------------------------------------
  // Role-based access control
  // -----------------------------------------------------------------------
  describe('role-based access', () => {
    it('classroom_supervisor cannot access admin routes', async () => {
      const store = useAuthStore();
      store.user = makeUser('classroom_supervisor');
      store.accessToken = 'tok';

      const router = buildRouter();
      await router.push('/admin/users');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/dashboard');
    });

    it('classroom_supervisor can access classroom route', async () => {
      const store = useAuthStore();
      store.user = makeUser('classroom_supervisor');
      store.accessToken = 'tok';

      const router = buildRouter();
      await router.push('/classroom');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/classroom');
    });

    it('operations_manager cannot access admin/settings', async () => {
      const store = useAuthStore();
      store.user = makeUser('operations_manager');
      store.accessToken = 'tok';

      const router = buildRouter();
      await router.push('/admin/settings');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/dashboard');
    });

    it('operations_manager can access warehouses', async () => {
      const store = useAuthStore();
      store.user = makeUser('operations_manager');
      store.accessToken = 'tok';

      const router = buildRouter();
      await router.push('/warehouses');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/warehouses');
    });

    it('auditor can access audit-log', async () => {
      const store = useAuthStore();
      store.user = makeUser('auditor');
      store.accessToken = 'tok';

      const router = buildRouter();
      await router.push('/admin/audit-log');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/admin/audit-log');
    });

    it('auditor cannot access admin/users', async () => {
      const store = useAuthStore();
      store.user = makeUser('auditor');
      store.accessToken = 'tok';

      const router = buildRouter();
      await router.push('/admin/users');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/dashboard');
    });

    it('customer_service_agent can access fulfillment (no roles restriction)', async () => {
      const store = useAuthStore();
      store.user = makeUser('customer_service_agent');
      store.accessToken = 'tok';

      const router = buildRouter();
      await router.push('/fulfillment');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/fulfillment');
    });

    it('customer_service_agent cannot access classroom', async () => {
      const store = useAuthStore();
      store.user = makeUser('customer_service_agent');
      store.accessToken = 'tok';

      const router = buildRouter();
      await router.push('/classroom');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/dashboard');
    });
  });

  // -----------------------------------------------------------------------
  // Public routes
  // -----------------------------------------------------------------------
  describe('public routes', () => {
    it('/login is accessible without authentication', async () => {
      const router = buildRouter();
      await router.push('/login');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/login');
    });
  });
});
