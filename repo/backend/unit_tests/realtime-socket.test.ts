import http from 'http';
import jwt from 'jsonwebtoken';
import { io as createClient, Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UserRole } from '../src/types';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const { config } = await import('../src/config');
const { setupSocket, emitToNamespace } = await import('../src/lib/socket');

let httpServer: http.Server;
let socketServer: ReturnType<typeof setupSocket>;
let port: number;

function signToken(role: UserRole): string {
  return jwt.sign(
    {
      id: 'user-1',
      username: 'tester',
      role,
    },
    config.jwt.secret,
    { expiresIn: '5m' }
  );
}

function createNamespaceClient(namespace: string, token?: string): ClientSocket {
  return createClient(`http://127.0.0.1:${port}${namespace}`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: token ? { token } : {},
    forceNew: true,
    reconnection: false,
    timeout: 3000,
  });
}

function connectNamespace(namespace: string, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = createNamespaceClient(namespace, token);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error: Error) => {
      socket.disconnect();
      reject(error);
    });
  });
}

function expectNamespaceConnectionError(namespace: string, token?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createNamespaceClient(namespace, token);
    socket.once('connect_error', (error: Error) => {
      socket.disconnect();
      resolve(error.message);
    });
    socket.once('connect', () => {
      socket.disconnect();
      reject(new Error('Expected connection to fail'));
    });
  });
}

beforeAll(async () => {
  httpServer = http.createServer();
  socketServer = setupSocket(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });

  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test HTTP server');
  }
  port = address.port;
});

afterAll(async () => {
  socketServer.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe('Socket namespace authorization', () => {
  it('requires authentication for namespace connections', async () => {
    const message = await expectNamespaceConnectionError('/alerts');
    expect(message).toContain('Authentication required');
  });

  it('enforces role checks on /classroom', async () => {
    const allowed = await connectNamespace('/classroom', signToken('administrator'));
    expect(allowed.connected).toBe(true);
    allowed.disconnect();

    const forbiddenMessage = await expectNamespaceConnectionError(
      '/classroom',
      signToken('customer_service_agent')
    );
    expect(forbiddenMessage).toContain('Forbidden');
  });

  it('allows operations_manager on /parking', async () => {
    const socket = await connectNamespace('/parking', signToken('operations_manager'));
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it('rejects operations_manager on /supervisor-queue', async () => {
    const message = await expectNamespaceConnectionError(
      '/supervisor-queue',
      signToken('operations_manager')
    );
    expect(message).toContain('Forbidden');
  });

  it('allows authenticated users on /jobs and /alerts', async () => {
    const jobsSocket = await connectNamespace('/jobs', signToken('auditor'));
    const alertsSocket = await connectNamespace('/alerts', signToken('auditor'));

    expect(jobsSocket.connected).toBe(true);
    expect(alertsSocket.connected).toBe(true);

    jobsSocket.disconnect();
    alertsSocket.disconnect();
  });

  it('emits events to subscribed namespace clients', async () => {
    const alertsSocket = await connectNamespace('/alerts', signToken('auditor'));

    const payload = { type: 'threshold', value: 99 };
    const received = await new Promise<typeof payload>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting for namespace event'));
      }, 2000);

      alertsSocket.once('alert_event', (eventPayload) => {
        clearTimeout(timer);
        resolve(eventPayload as typeof payload);
      });

      emitToNamespace('/alerts', 'alert_event', payload);
    });

    expect(received).toEqual(payload);
    alertsSocket.disconnect();
  });
});
