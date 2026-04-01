/**
 * API functional tests — /api/parking and /api/parking-alerts
 * Tests auth, RBAC, API signing for ingest, and business flows.
 */
import request from 'supertest';
import { app, authGet, authPost, authPatch, loginAs, uuid } from '../helpers/setup';

// ---- Parking lot endpoints ----

describe('GET /api/parking/dashboard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/parking/dashboard');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.stack).toBeUndefined();
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/parking/dashboard', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 for supervisor', async () => {
    const res = await authGet('/api/parking/dashboard', 'supervisor');
    expect(res.status).toBe(200);
  });

  it('returns 403 for cs_agent (no parking:read)', async () => {
    const res = await authGet('/api/parking/dashboard', 'agent');
    expect(res.status).toBe(403);
  });

  it('returns 403 for auditor', async () => {
    const res = await authGet('/api/parking/dashboard', 'auditor');
    expect(res.status).toBe(403);
  });
});

describe('GET /api/parking/lots', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/parking/lots');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin with lot list', async () => {
    const res = await authGet('/api/parking/lots', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/parking/sessions', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/parking/sessions');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/parking/sessions', 'admin');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/parking/sessions/entry (API signing)', () => {
  it('returns 401 without API signing headers', async () => {
    const res = await request(app)
      .post('/api/parking/sessions/entry')
      .send({ lotId: uuid() });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_API_SIGNING');
  });

  it('returns 401 with invalid API key', async () => {
    const res = await request(app)
      .post('/api/parking/sessions/entry')
      .set('X-Api-Key', 'bad-key')
      .set('X-Timestamp', String(Date.now()))
      .set('X-Signature', 'badsig')
      .send({ lotId: uuid() });
    expect(res.status).toBe(401);
  });

  it('returns 401 with expired timestamp', async () => {
    const res = await request(app)
      .post('/api/parking/sessions/entry')
      .set('X-Api-Key', 'some-key')
      .set('X-Timestamp', String(Date.now() - 10 * 60 * 1000))
      .set('X-Signature', 'sig')
      .send({ lotId: uuid() });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TIMESTAMP_EXPIRED');
  });
});

describe('POST /api/parking/sessions/exit (API signing)', () => {
  it('returns 401 without API signing headers', async () => {
    const res = await request(app)
      .post('/api/parking/sessions/exit')
      .send({ sessionId: uuid() });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_API_SIGNING');
  });
});

// ---- Alert endpoints ----

describe('GET /api/parking-alerts', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/parking-alerts');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/parking-alerts', 'admin');
    expect(res.status).toBe(200);
  });

  it('returns 200 for supervisor', async () => {
    const res = await authGet('/api/parking-alerts', 'supervisor');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/parking-alerts/metrics', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/parking-alerts/metrics');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/parking-alerts/metrics', 'admin');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/parking-alerts', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/parking-alerts')
      .send({ lotId: uuid(), type: 'overtime', description: 'Over 2h' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for cs_agent (no parking:manage)', async () => {
    const res = await authPost('/api/parking-alerts', 'agent', {
      lotId: uuid(), type: 'overtime', description: 'Over 2h',
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/parking-alerts/:id/claim', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).patch('/api/parking-alerts/some-id/claim');
    expect(res.status).toBe(401);
  });

  it('returns 403 for ops_manager (no parking-alert:claim)', async () => {
    const res = await authPatch('/api/parking-alerts/some-id/claim', 'ops');
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/parking-alerts/:id/close', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch('/api/parking-alerts/some-id/close')
      .send({ closureNote: 'Vehicle moved.' });
    expect(res.status).toBe(401);
  });

  it('rejects short closure note', async () => {
    const res = await authPatch('/api/parking-alerts/some-id/close', 'admin', { closureNote: 'ok' });
    // 400 or 404 both valid
    expect([400, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

// ---- Response structure invariants ----

describe('Error response structure — parking', () => {
  const endpoints: [string, string][] = [
    ['GET', '/api/parking/dashboard'],
    ['GET', '/api/parking/lots'],
    ['GET', '/api/parking/sessions'],
    ['GET', '/api/parking-alerts'],
    ['GET', '/api/parking-alerts/metrics'],
  ];

  endpoints.forEach(([method, path]) => {
    it(`${method} ${path} — structured error without stack`, async () => {
      const res = await request(app).get(path);
      expect(res.body.stack).toBeUndefined();
      expect(typeof res.body.success).toBe('boolean');
      expect(res.body.success).toBe(false);
    });
  });
});
