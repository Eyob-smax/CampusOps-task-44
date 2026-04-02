/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactive } from 'vue';
import { shallowMount } from '@vue/test-utils';

const mocks = vi.hoisted(() => ({
  ensureInitialized: vi.fn(async () => {}),
  connectAlertSocket: vi.fn(),
  disconnectAlertSocket: vi.fn(),
}));

const authStore = reactive({
  isAuthenticated: false,
  accessToken: null as string | null,
  ensureInitialized: mocks.ensureInitialized,
});

vi.mock('../src/stores/auth', () => ({
  useAuthStore: () => authStore,
}));

vi.mock('../src/composables/useAlertSocket', () => ({
  connectAlertSocket: mocks.connectAlertSocket,
  disconnectAlertSocket: mocks.disconnectAlertSocket,
}));

import App from '../src/App.vue';

describe('App bootstrap auth flow', () => {
  beforeEach(() => {
    mocks.ensureInitialized.mockClear();
    mocks.connectAlertSocket.mockClear();
    mocks.disconnectAlertSocket.mockClear();
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
    expect(mocks.ensureInitialized).toHaveBeenCalledTimes(1);
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
    expect(mocks.connectAlertSocket).toHaveBeenCalledWith(
      'restored-token',
      expect.any(Function),
    );
  });
});
