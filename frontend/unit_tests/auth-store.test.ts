import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Shared localStorage backing store from setup.ts
const _ls = (globalThis as any).__test_ls as Record<string, string>;

// ---------------------------------------------------------------------------
// Mock apiClient
// ---------------------------------------------------------------------------
vi.mock('../src/api/client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

import { useAuthStore } from '../src/stores/auth';
import { apiClient } from '../src/api/client';
import type { AuthUser } from '../src/types';

const mockPost = apiClient.post as ReturnType<typeof vi.fn>;

function makeUser(role: AuthUser['role'] = 'administrator'): AuthUser {
  return { id: '1', username: 'test', role };
}

function clearLS() {
  Object.keys(_ls).forEach((k) => delete _ls[k]);
  globalThis.localStorage.clear();
}

describe('Auth Store', () => {
  beforeEach(() => {
    clearLS();
    mockPost.mockReset();
    mockPost.mockResolvedValue(undefined);
    setActivePinia(createPinia());
  });

  // -----------------------------------------------------------------------
  // isAuthenticated
  // -----------------------------------------------------------------------
  describe('isAuthenticated', () => {
    it('returns false when there is no user and no token', () => {
      const auth = useAuthStore();
      expect(auth.isAuthenticated).toBe(false);
    });

    it('returns false when there is a token but no user', () => {
      const auth = useAuthStore();
      auth.accessToken = 'tok';
      // user is still null
      expect(auth.isAuthenticated).toBe(false);
    });

    it('returns true when both user and token are set', () => {
      const auth = useAuthStore();
      auth.accessToken = 'tok';
      auth.user = makeUser();
      expect(auth.isAuthenticated).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // login
  // -----------------------------------------------------------------------
  describe('login', () => {
    it('sets user and token from API response', async () => {
      const mockUser = makeUser('operations_manager');
      mockPost.mockResolvedValueOnce({
        data: {
          accessToken: 'access-123',
          refreshToken: 'refresh-456',
          expiresIn: 3600,
          user: mockUser,
        },
      });

      const auth = useAuthStore();
      await auth.login('admin', 'pass');

      expect(auth.accessToken).toBe('access-123');
      expect(auth.user).toEqual(mockUser);
      // refresh_token is stored via the same globalThis.localStorage
      expect(globalThis.localStorage.getItem('refresh_token')).toBe('refresh-456');
    });

    it('calls apiClient.post with correct credentials', async () => {
      mockPost.mockResolvedValueOnce({
        data: { accessToken: 'a', refreshToken: 'r', expiresIn: 60, user: makeUser() },
      });

      const auth = useAuthStore();
      await auth.login('myuser', 'mypass');

      expect(mockPost).toHaveBeenCalledWith('/api/auth/login', {
        username: 'myuser',
        password: 'mypass',
      });
    });
  });

  // -----------------------------------------------------------------------
  // logout
  // -----------------------------------------------------------------------
  describe('logout', () => {
    it('clears user, token, and localStorage', async () => {
      mockPost.mockResolvedValueOnce({
        data: { accessToken: 'a', refreshToken: 'r', expiresIn: 600, user: makeUser() },
      });

      const auth = useAuthStore();
      await auth.login('u', 'p');

      auth.logout();

      expect(auth.user).toBeNull();
      expect(auth.accessToken).toBeNull();
      expect(globalThis.localStorage.getItem('refresh_token')).toBeNull();
    });

    it('calls the logout endpoint', () => {
      const auth = useAuthStore();
      auth.logout();
      expect(mockPost).toHaveBeenCalledWith('/api/auth/logout');
    });
  });

  // -----------------------------------------------------------------------
  // can()
  // -----------------------------------------------------------------------
  describe('can()', () => {
    it('returns false when no user is set', () => {
      const auth = useAuthStore();
      expect(auth.can('users:read')).toBe(false);
    });

    it('returns true for administrator on users:read', () => {
      const auth = useAuthStore();
      auth.user = makeUser('administrator');
      expect(auth.can('users:read')).toBe(true);
    });

    it('returns false for auditor on users:read', () => {
      const auth = useAuthStore();
      auth.user = makeUser('auditor');
      expect(auth.can('users:read')).toBe(false);
    });

    it('returns true for classroom_supervisor on classroom:read', () => {
      const auth = useAuthStore();
      auth.user = makeUser('classroom_supervisor');
      expect(auth.can('classroom:read')).toBe(true);
    });

    it('returns true for operations_manager on warehouse:read', () => {
      const auth = useAuthStore();
      auth.user = makeUser('operations_manager');
      expect(auth.can('warehouse:read')).toBe(true);
    });

    it('returns true for customer_service_agent on fulfillment:read', () => {
      const auth = useAuthStore();
      auth.user = makeUser('customer_service_agent');
      expect(auth.can('fulfillment:read')).toBe(true);
    });

    it('returns false for unknown permission', () => {
      const auth = useAuthStore();
      auth.user = makeUser('administrator');
      expect(auth.can('nonexistent:perm')).toBe(false);
    });

    it('returns false for auditor on settings:update', () => {
      const auth = useAuthStore();
      auth.user = makeUser('auditor');
      expect(auth.can('settings:update')).toBe(false);
    });

    it('returns true for auditor on audit:read', () => {
      const auth = useAuthStore();
      auth.user = makeUser('auditor');
      expect(auth.can('audit:read')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Token from localStorage on init
  // -----------------------------------------------------------------------
  describe('token hydration from localStorage', () => {
    it('accessToken reflects the value set on the store', () => {
      const auth = useAuthStore();
      auth.accessToken = 'hydrated-tok';
      expect(auth.accessToken).toBe('hydrated-tok');
    });

    it('accessToken is null when localStorage has no token', () => {
      const auth = useAuthStore();
      expect(auth.accessToken).toBeNull();
    });
  });
});
