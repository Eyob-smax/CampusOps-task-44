import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

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
const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

function makeUser(role: AuthUser['role'] = 'administrator'): AuthUser {
  return { id: '1', username: 'test', role };
}

describe('Token Lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.localStorage.clear();
    mockPost.mockReset();
    mockGet.mockReset();
    mockPost.mockResolvedValue(undefined);
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Tokens stored on login
  // -----------------------------------------------------------------------
  describe('login stores tokens', () => {
    it('stores access token on the store after login', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          accessToken: 'access-abc',
          refreshToken: 'refresh-xyz',
          expiresIn: 3600,
          user: makeUser(),
        },
      });

      const auth = useAuthStore();
      await auth.login('user', 'pass');

      expect(auth.accessToken).toBe('access-abc');
    });

    it('stores refresh token in localStorage on login', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          accessToken: 'access-abc',
          refreshToken: 'refresh-xyz',
          expiresIn: 3600,
          user: makeUser(),
        },
      });

      const auth = useAuthStore();
      await auth.login('user', 'pass');

      expect(globalThis.localStorage.getItem('refresh_token')).toBe('refresh-xyz');
    });
  });

  // -----------------------------------------------------------------------
  // Both cleared on logout
  // -----------------------------------------------------------------------
  describe('logout clears tokens', () => {
    it('removes tokens on logout', async () => {
      mockPost.mockResolvedValueOnce({
        data: { accessToken: 'a', refreshToken: 'r', expiresIn: 600, user: makeUser() },
      });

      const auth = useAuthStore();
      await auth.login('u', 'p');

      expect(auth.accessToken).toBe('a');
      expect(globalThis.localStorage.getItem('refresh_token')).toBe('r');

      auth.logout();

      expect(auth.accessToken).toBeNull();
      expect(auth.user).toBeNull();
      expect(globalThis.localStorage.getItem('refresh_token')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Token refresh scheduling
  // -----------------------------------------------------------------------
  describe('refresh scheduling', () => {
    it('schedules a refresh call before token expiry', async () => {
      const refreshUser = makeUser();

      mockPost.mockResolvedValueOnce({
        data: { accessToken: 'tok-1', refreshToken: 'rt-1', expiresIn: 120, user: refreshUser },
      });

      const auth = useAuthStore();
      await auth.login('u', 'p');

      mockPost.mockResolvedValueOnce({
        data: { accessToken: 'tok-2', refreshToken: 'rt-2', expiresIn: 120 },
      });
      mockGet.mockResolvedValueOnce({ data: refreshUser });

      await vi.advanceTimersByTimeAsync(60_000);

      expect(mockPost).toHaveBeenCalledWith('/api/auth/refresh', { refreshToken: 'rt-1' });
    });

    it('uses minimum delay of 10 seconds for short-lived tokens', async () => {
      mockPost.mockResolvedValueOnce({
        data: { accessToken: 'tok', refreshToken: 'rt', expiresIn: 30, user: makeUser() },
      });

      const auth = useAuthStore();
      await auth.login('u', 'p');

      mockPost.mockResolvedValueOnce({
        data: { accessToken: 'tok2', refreshToken: 'rt2', expiresIn: 30 },
      });
      mockGet.mockResolvedValueOnce({ data: makeUser() });

      await vi.advanceTimersByTimeAsync(9_000);
      expect(mockPost).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(mockPost).toHaveBeenCalledTimes(2);
    });

    it('logout cancels scheduled refresh', async () => {
      mockPost.mockResolvedValueOnce({
        data: { accessToken: 'tok', refreshToken: 'rt', expiresIn: 3600, user: makeUser() },
      });

      const auth = useAuthStore();
      await auth.login('u', 'p');

      auth.logout();
      mockPost.mockClear();

      await vi.advanceTimersByTimeAsync(3600_000);

      const refreshCalls = mockPost.mock.calls.filter(
        (c: any[]) => c[0] === '/api/auth/refresh',
      );
      expect(refreshCalls).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Expired token / failed refresh
  // -----------------------------------------------------------------------
  describe('expired token handling', () => {
    it('logout is called when refresh fails', async () => {
      mockPost.mockResolvedValueOnce({
        data: { accessToken: 'tok', refreshToken: 'rt', expiresIn: 120, user: makeUser() },
      });

      const auth = useAuthStore();
      await auth.login('u', 'p');

      mockPost
        .mockRejectedValueOnce(new Error('token expired'))
        .mockResolvedValueOnce(undefined);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(auth.user).toBeNull();
      expect(auth.accessToken).toBeNull();
    });

    it('logout is called when no refresh token exists', async () => {
      const auth = useAuthStore();
      auth.user = makeUser();
      auth.accessToken = 'tok';

      globalThis.localStorage.removeItem('refresh_token');

      await auth.refreshSession();

      expect(auth.user).toBeNull();
      expect(auth.accessToken).toBeNull();
    });
  });
});
