import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (payload: any) => void>();

const socketMock = {
  connected: false,
  on: vi.fn((event: string, handler: (payload: any) => void) => {
    handlers.set(event, handler);
  }),
  disconnect: vi.fn(),
};

const ioMock = vi.fn(() => socketMock);

vi.mock('socket.io-client', () => ({
  io: ioMock,
}));

vi.mock('../src/utils/network', () => ({
  resolveBackendOrigin: () => 'http://localhost:3000',
}));

const { connectAlertSocket, disconnectAlertSocket } = await import(
  '../src/composables/useAlertSocket'
);

describe('useAlertSocket', () => {
  beforeEach(() => {
    handlers.clear();
    socketMock.connected = false;
    socketMock.on.mockClear();
    socketMock.disconnect.mockClear();
    ioMock.mockClear();
  });

  afterEach(() => {
    disconnectAlertSocket();
  });

  it('connects to /alerts namespace with auth token', () => {
    connectAlertSocket('token-123', () => undefined);

    expect(ioMock).toHaveBeenCalledWith('http://localhost:3000/alerts', {
      path: '/socket.io',
      auth: { token: 'token-123' },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
  });

  it('handles alert:threshold-breach payload using metric field', () => {
    const onAlert = vi.fn();
    connectAlertSocket('token-123', onAlert);

    const handler = handlers.get('alert:threshold-breach');
    expect(handler).toBeTypeOf('function');

    handler?.({
      message: 'CPU threshold breached',
      metric: 'cpu_utilization_percent',
      value: 92,
    });

    expect(onAlert).toHaveBeenCalledWith(
      'Alert: CPU threshold breached (cpu_utilization_percent=92)',
    );
  });

  it('falls back to metricName when metric is absent', () => {
    const onAlert = vi.fn();
    connectAlertSocket('token-123', onAlert);

    const handler = handlers.get('alert:threshold-breach');
    handler?.({
      message: 'Memory threshold breached',
      metricName: 'memory_used_mb',
      value: 8100,
    });

    expect(onAlert).toHaveBeenCalledWith(
      'Alert: Memory threshold breached (memory_used_mb=8100)',
    );
  });

  it('keeps legacy threshold:breach compatibility', () => {
    const onAlert = vi.fn();
    connectAlertSocket('token-123', onAlert);

    const handler = handlers.get('threshold:breach');
    expect(handler).toBeTypeOf('function');

    handler?.({
      message: 'Legacy threshold event',
      metric: 'active_jobs',
      value: 101,
    });

    expect(onAlert).toHaveBeenCalledWith('Alert: Legacy threshold event (active_jobs=101)');
  });

  it('forwards system:alert messages unchanged', () => {
    const onAlert = vi.fn();
    connectAlertSocket('token-123', onAlert);

    const handler = handlers.get('system:alert');
    handler?.({ message: 'Circuit breaker opened' });

    expect(onAlert).toHaveBeenCalledWith('Circuit breaker opened');
  });
});
