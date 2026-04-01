/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactive } from 'vue';
import { shallowMount } from '@vue/test-utils';

const ensureInitialized = vi.fn(async () => {});
const connectAlertSocket = vi.fn();
const disconnectAlertSocket = vi.fn();

const authStore = reactive({
  isAuthenticated: false,
  accessToken: null as string | null,
  ensureInitialized,
});

vi.mock('../src/stores/auth', () => ({
  useAuthStore: () => authStore,
}));

vi.mock('../src/composables/useAlertSocket', () => ({
  connectAlertSocket,
  disconnectAlertSocket,
}));

import App from '../src/App.vue';

describe('App bootstrap auth flow', () => {
  beforeEach(() => {
    ensureInitialized.mockClear();
    connectAlertSocket.mockClear();
    disconnectAlertSocket.mockClear();
    authStore.isAuthenticated = false;
    authStore.accessToken = null;
  });

  it('initializes auth state on mount', async () => {
    shallowMount(App, {
      global: {
        stubs: {
          'router-view': true,
          'el-config-provider': { template: '<div><slot /></div>' },
          'el-alert': true,
        },
      },
    });

    await Promise.resolve();
    expect(ensureInitialized).toHaveBeenCalledTimes(1);
  });

  it('connects alerts socket once authenticated token is available', async () => {
    authStore.isAuthenticated = true;
    authStore.accessToken = 'restored-token';

    shallowMount(App, {
      global: {
        stubs: {
          'router-view': true,
          'el-config-provider': { template: '<div><slot /></div>' },
          'el-alert': true,
        },
      },
    });

    await Promise.resolve();
    expect(connectAlertSocket).toHaveBeenCalledWith(
      'restored-token',
      expect.any(Function),
    );
  });
});
