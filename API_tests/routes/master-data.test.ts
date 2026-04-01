/**
 * API functional tests — master data endpoints (departments, semesters, courses, classes, students)
 * Tests authentication, RBAC, business flows, and response structure.
 */
import request from 'supertest';
import { app, loginAs, authGet, authPost, authPut, authDelete, uuid } from '../helpers/setup';

// ---- Departments ----

describe('GET /api/departments', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/departments');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 for admin with department list', async () => {
    const res = await authGet('/api/departments', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 200 for ops_manager (master-data:read)', async () => {
    const res = await authGet('/api/departments', 'ops');
    expect(res.status).toBe(200);
  });

  it('returns 200 for auditor (master-data:read)', async () => {
    const res = await authGet('/api/departments', 'auditor');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/departments', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/departments').send({ name: 'Test', code: 'TST' });
    expect(res.status).toBe(401);
  });

  it('returns 201 for admin creating a department', async () => {
    const code = `T${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const res = await authPost('/api/departments', 'admin', { name: `Test Dept ${code}`, code });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 for auditor (read-only)', async () => {
    const res = await authPost('/api/departments', 'auditor', { name: 'Blocked', code: 'BLK' });
    expect(res.status).toBe(403);
  });

  it('returns 403 for cs_agent (no master-data:write)', async () => {
    const res = await authPost('/api/departments', 'agent', { name: 'Blocked', code: 'BLK' });
    expect(res.status).toBe(403);
  });
});

// ---- Semesters ----

describe('GET /api/semesters', () => {
  it('returns 200 for admin', async () => {
    const res = await authGet('/api/semesters', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/semesters');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/semesters', () => {
  it('returns 403 for auditor (read-only)', async () => {
    const res = await authPost('/api/semesters', 'auditor', {
      name: 'Test', startDate: '2027-01-01', endDate: '2027-05-15',
    });
    expect(res.status).toBe(403);
  });
});

// ---- Courses ----

describe('GET /api/courses', () => {
  it('returns 200 for admin', async () => {
    const res = await authGet('/api/courses', 'admin');
    expect(res.status).toBe(200);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/courses');
    expect(res.status).toBe(401);
  });
});

// ---- Classes ----

describe('GET /api/classes', () => {
  it('returns 200 for admin', async () => {
    const res = await authGet('/api/classes', 'admin');
    expect(res.status).toBe(200);
  });
});

// ---- Students ----

describe('GET /api/students', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/students');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/students', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/students', () => {
  it('returns 400 without idempotency key (after auth)', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentNumber: 'S999', fullName: 'Test', email: 'test@test.edu' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('creates student with valid idempotency key', async () => {
    const sn = `S${Date.now().toString(36)}`;
    const res = await authPost('/api/students', 'admin', {
      studentNumber: sn, fullName: 'Test Student', email: `${sn}@test.edu`,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 for auditor', async () => {
    const res = await authPost('/api/students', 'auditor', {
      studentNumber: 'SBLK', fullName: 'Blocked', email: 'blk@test.edu',
    });
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

describe('Export endpoints', () => {
  exportEndpoints.forEach(endpoint => {
    it(`GET ${endpoint} returns 401 without token`, async () => {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.stack).toBeUndefined();
    });
  });

  it('GET /api/departments/export returns 200 for admin', async () => {
    const res = await authGet('/api/departments/export', 'admin');
    expect(res.status).toBe(200);
  });
});

// ---- Error response structure ----

describe('Error response structure — master data', () => {
  const endpoints = [
    ['GET', '/api/departments'],
    ['GET', '/api/semesters'],
    ['GET', '/api/courses'],
    ['GET', '/api/classes'],
    ['GET', '/api/students'],
  ] as const;

  endpoints.forEach(([method, path]) => {
    it(`${method} ${path} — no stack trace in 401`, async () => {
      const res = await (method === 'GET' ? request(app).get(path) : request(app).post(path));
      expect(res.body.stack).toBeUndefined();
      expect(res.body.success).toBe(false);
    });
  });
});
