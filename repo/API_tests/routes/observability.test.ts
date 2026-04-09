/**
 * API functional tests — Observability: metrics, logs, thresholds, backups
 * Tests authentication chain (authenticate → requirePermission), business flows, and RBAC.
 */
import request from 'supertest';
import { app, authGet, authPost, authPut, authPatch, authDelete, loginAs, uuid } from '../helpers/setup';
import { recordMetric } from '../../src/modules/observability/metrics.service';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

// ---- Metrics ----

describe('GET /api/metrics', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/metrics');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.stack).toBeUndefined();
  });

  it('returns 200 for admin (metrics:read)', async () => {
    const res = await authGet('/api/metrics', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 for ops_manager (no metrics:read)', async () => {
    const res = await authGet('/api/metrics', 'ops');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 403 for auditor', async () => {
    const res = await authGet('/api/metrics', 'auditor');
    expect(res.status).toBe(403);
  });

  it('returns 403 for cs_agent', async () => {
    const res = await authGet('/api/metrics', 'agent');
    expect(res.status).toBe(403);
  });

  it('includes p95 latency and error-rate metric snapshots when present', async () => {
    await recordMetric('api_latency_p95_ms', 245.12);
    await recordMetric('api_error_rate_percent', 1.75);

    const res = await authGet('/api/metrics', 'admin');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const metrics = (res.body.data ?? []) as Array<{ metricName: string; value: unknown }>;
    const byName = new Map(metrics.map((m) => [m.metricName, m.value]));

    expect(byName.has('api_latency_p95_ms')).toBe(true);
    expect(byName.has('api_error_rate_percent')).toBe(true);
    expect(typeof byName.get('api_latency_p95_ms')).toBe('number');
    expect(typeof byName.get('api_error_rate_percent')).toBe('number');
  });
});

describe('GET /api/metrics/:name/history', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/metrics/cpu_utilization_percent/history');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/metrics/cpu_utilization_percent/history', 'admin');
    expect(res.status).toBe(200);
  });

  it('returns history for api_latency_p95_ms with numeric values', async () => {
    await recordMetric('api_latency_p95_ms', 333.44);

    const res = await authGet('/api/metrics/api_latency_p95_ms/history', 'admin');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const [first] = (res.body.data ?? []) as Array<{ value: unknown }>;
    if (first) {
      expect(typeof first.value).toBe('number');
    }
  });
});

// ---- Alerts ----

describe('GET /api/alerts', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/alerts');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin (alerts:read)', async () => {
    const res = await authGet('/api/alerts', 'admin');
    expect(res.status).toBe(200);
  });

  it('returns 200 for ops_manager (alerts:read)', async () => {
    const res = await authGet('/api/alerts', 'ops');
    expect(res.status).toBe(200);
  });

  it('returns 403 for auditor', async () => {
    const res = await authGet('/api/alerts', 'auditor');
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/alerts/:id/acknowledge', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).patch(`/api/alerts/${validUuid}/acknowledge`);
    expect(res.status).toBe(401);
  });

  it('requires idempotency key for admin', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .patch(`/api/alerts/${validUuid}/acknowledge`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 403 for ops_manager (no alerts:manage)', async () => {
    const res = await authPatch(`/api/alerts/${validUuid}/acknowledge`, 'ops');
    expect(res.status).toBe(403);
  });
});

// ---- Thresholds ----

describe('GET /api/thresholds', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/thresholds');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin with threshold list', async () => {
    const res = await authGet('/api/thresholds', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 200 for ops_manager (alerts:read)', async () => {
    const res = await authGet('/api/thresholds', 'ops');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/thresholds', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/thresholds')
      .send({ metricName: 'cpu_utilization_percent', operator: '>', value: 90 });
    expect(res.status).toBe(401);
  });

  it('requires idempotency key for admin', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/thresholds')
      .set('Authorization', `Bearer ${token}`)
      .send({ metricName: 'test_metric', operator: 'gt', value: 90 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 403 for ops_manager (no alerts:manage)', async () => {
    const res = await authPost('/api/thresholds', 'ops', { metricName: 'test', operator: 'gt', value: 50 });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/thresholds/:id', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).delete(`/api/thresholds/${validUuid}`);
    expect(res.status).toBe(401);
  });
});

// ---- Logs ----

describe('GET /api/logs', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/logs');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 for admin (logs:read)', async () => {
    const res = await authGet('/api/logs', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 for ops_manager (no logs:read)', async () => {
    const res = await authGet('/api/logs', 'ops');
    expect(res.status).toBe(403);
  });

  it('returns 403 for auditor', async () => {
    const res = await authGet('/api/logs', 'auditor');
    expect(res.status).toBe(403);
  });
});

// ---- Backups ----

describe('GET /api/backups', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/backups');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin (backup:read)', async () => {
    const res = await authGet('/api/backups', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 for ops_manager', async () => {
    const res = await authGet('/api/backups', 'ops');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/backups', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/backups');
    expect(res.status).toBe(401);
  });

  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/backups')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('triggers backup for admin with idempotency key', async () => {
    const res = await authPost('/api/backups', 'admin');
    expect([200, 201, 202]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/backups/:id/verify', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post(`/api/backups/${validUuid}/verify`);
    expect(res.status).toBe(401);
  });
});

// ---- Error response structure ----

describe('Error response structure — observability', () => {
  const endpoints: [string, string][] = [
    ['GET', '/api/metrics'],
    ['GET', '/api/metrics/cpu_utilization_percent/history'],
    ['GET', '/api/alerts'],
    ['PATCH', `/api/alerts/${validUuid}/acknowledge`],
    ['GET', '/api/thresholds'],
    ['POST', '/api/thresholds'],
    ['DELETE', `/api/thresholds/${validUuid}`],
    ['GET', '/api/logs'],
    ['GET', '/api/backups'],
    ['POST', '/api/backups'],
    ['POST', `/api/backups/${validUuid}/verify`],
  ];

  endpoints.forEach(([method, path]) => {
    it(`${method} ${path} — no stack, success=false`, async () => {
      const req = (() => {
        switch (method) {
          case 'GET':    return request(app).get(path);
          case 'POST':   return request(app).post(path);
          case 'PATCH':  return request(app).patch(path);
          case 'PUT':    return request(app).put(path);
          case 'DELETE': return request(app).delete(path);
          default:       return request(app).get(path);
        }
      })();
      const res = await req;
      expect(res.body.success).toBe(false);
      expect(res.body.stack).toBeUndefined();
      expect([400, 401, 403, 404, 422]).toContain(res.status);
    });
  });
});
