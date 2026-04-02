/**
 * API functional tests — /api/jobs, import/export, and idempotency enforcement
 */
import request from 'supertest';
import { app, authGet, authPost, loginAs, uuid } from '../helpers/setup';

// ---- Job monitor endpoints ----

describe('GET /api/jobs', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.stack).toBeUndefined();
  });

  it('returns 200 for admin (jobs:read)', async () => {
    const res = await authGet('/api/jobs', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 for ops_manager (jobs:read)', async () => {
    const res = await authGet('/api/jobs', 'ops');
    expect(res.status).toBe(200);
  });

  it('returns 403 for cs_agent (no jobs:read)', async () => {
    const res = await authGet('/api/jobs', 'agent');
    expect(res.status).toBe(403);
  });

  it('returns 403 for auditor', async () => {
    const res = await authGet('/api/jobs', 'auditor');
    expect(res.status).toBe(403);
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/jobs/nonexistent-id');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/jobs/:id/error-report', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/jobs/some-id/error-report');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/jobs/:id/retry', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/jobs/some-id/retry')
      .set('X-Idempotency-Key', uuid());
    expect(res.status).toBe(401);
  });

  it('returns 400 when idempotency key is missing (after auth)', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/jobs/some-id/retry')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 403 for ops_manager (no jobs:manage)', async () => {
    const res = await authPost('/api/jobs/some-id/retry', 'ops');
    expect(res.status).toBe(403);
  });
});

// ---- Student import endpoint ----

describe('POST /api/students/import', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/students/import');
    expect(res.status).toBe(401);
  });

  it('no stack traces in error response', async () => {
    const res = await request(app).post('/api/students/import');
    expect(res.body.stack).toBeUndefined();
  });

  it('returns 403 for auditor', async () => {
    const token = await loginAs('auditor');
    const res = await request(app)
      .post('/api/students/import')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ---- Export endpoints ----

const exportEndpoints = [
  '/api/departments/export',
  '/api/semesters/export',
  '/api/courses/export',
  '/api/classes/export',
  '/api/students/export',
] as const;

describe('Export endpoints — auth guard', () => {
  exportEndpoints.forEach(endpoint => {
    it(`GET ${endpoint} returns 401 without token`, async () => {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.stack).toBeUndefined();
    });
  });
});

describe('Export endpoints — RBAC (authenticated)', () => {
  exportEndpoints.forEach(endpoint => {
    it(`GET ${endpoint} returns 200 for admin`, async () => {
      const res = await authGet(endpoint, 'admin');
      expect(res.status).toBe(200);
    });
  });
});

// ---- Master data read endpoints — auth guard ----

const readEndpoints = [
  '/api/departments',
  '/api/semesters',
  '/api/courses',
  '/api/classes',
  '/api/students',
] as const;

describe('Master data list endpoints — auth guard', () => {
  readEndpoints.forEach(endpoint => {
    it(`GET ${endpoint} returns 401 without token`, async () => {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(401);
    });
  });
});

// ---- Response structure invariants ----

describe('Error response structure', () => {
  const endpoints: [string, string][] = [
    ['GET', '/api/jobs'],
    ['GET', '/api/students/export'],
    ['POST', '/api/students/import'],
  ];

  endpoints.forEach(([method, path]) => {
    it(`${method} ${path} — structured error without stack`, async () => {
      const req = method === 'GET'
        ? request(app).get(path)
        : request(app).post(path);
      const res = await req;
      expect(res.body.stack).toBeUndefined();
      expect(typeof res.body.success).toBe('boolean');
      expect(res.body.success).toBe(false);
    });
  });
});
