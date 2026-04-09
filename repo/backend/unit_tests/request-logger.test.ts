import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const infoSpy = vi.fn();
const warnSpy = vi.fn();
const errorSpy = vi.fn();

vi.mock('../src/lib/logger', () => ({
  logger: {
    info: infoSpy,
    warn: warnSpy,
    error: errorSpy,
  },
}));

const { requestLoggerMiddleware } = await import('../src/middleware/request-logger.middleware');

describe('requestLoggerMiddleware', () => {
  beforeEach(() => {
    infoSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
  });

  it('logs structured request metadata without sensitive headers/body fields', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.correlationId = 'corr-test-1';
      next();
    });
    app.use(requestLoggerMiddleware);
    app.post('/api/sensitive', (_req, res) => {
      res.status(201).json({ success: true });
    });

    await request(app)
      .post('/api/sensitive')
      .set('Authorization', 'Bearer super-secret-token')
      .set('Cookie', 'refreshToken=super-secret-cookie')
      .set('User-Agent', 'unit-test-agent')
      .send({ password: 'VerySecret123!', token: 'another-secret' });

    expect(infoSpy).toHaveBeenCalledTimes(1);

    const payload = infoSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.msg).toBe('HTTP request');
    expect(payload.method).toBe('POST');
    expect(payload.path).toBe('/api/sensitive');
    expect(payload.status).toBe(201);
    expect(payload.correlationId).toBe('corr-test-1');
    expect(payload.userAgent).toBe('unit-test-agent');

    expect(payload.authorization).toBeUndefined();
    expect(payload.cookie).toBeUndefined();
    expect(payload.body).toBeUndefined();
    expect(payload.password).toBeUndefined();
    expect(payload.token).toBeUndefined();
  });

  it('skips /health path logging', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.correlationId = 'corr-health';
      next();
    });
    app.use(requestLoggerMiddleware);
    app.get('/health', (_req, res) => {
      res.status(200).json({ status: 'ok' });
    });

    await request(app).get('/health');
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
