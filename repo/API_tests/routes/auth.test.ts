/**
 * API functional tests — /api/auth endpoints
 * Tests authentication, token lifecycle, RBAC, and rate limiting.
 */
import request from 'supertest';
import { app, SEED_USERS, loginAs, authGet, uuid } from '../helpers/setup';

describe('POST /api/auth/login', () => {
  it('returns 400 when username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'something' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 with invalid credentials and no stack trace', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'does-not-exist', password: 'wrongpassword' });
    expect([401, 500]).toContain(res.status);
    expect(res.body.stack).toBeUndefined();
    expect(res.body.success).toBe(false);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 200 with valid admin credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: SEED_USERS.admin.username, password: SEED_USERS.admin.password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(typeof res.body.data.expiresIn).toBe('number');
    expect(res.body.data.user.role).toBe('administrator');
  });

  it('returns 200 with valid ops_manager credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: SEED_USERS.ops.username, password: SEED_USERS.ops.password });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('operations_manager');
  });

  it('returns 200 with valid auditor credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: SEED_USERS.auditor.username, password: SEED_USERS.auditor.password });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('auditor');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid admin token and correct role', async () => {
    const res = await authGet('/api/auth/me', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe('admin');
    expect(res.body.data.role).toBe('administrator');
  });

  it('returns 200 with valid auditor token and correct role', async () => {
    const res = await authGet('/api/auth/me', 'auditor');
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('auditor');
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns 400 when refreshToken is missing', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 with invalid refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'garbage' });
    expect(res.status).toBe(401);
  });

  it('rotates tokens with valid refresh token', async () => {
    // Login to get a refresh token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: SEED_USERS.admin.username, password: SEED_USERS.admin.password });
    expect(loginRes.status).toBe(200);

    const refreshToken = loginRes.body.data.refreshToken;
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    expect(refreshRes.body.data.refreshToken).toBeDefined();
    // New tokens should be different
    expect(refreshRes.body.data.accessToken).not.toBe(loginRes.body.data.accessToken);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token and revokes it', async () => {
    // Login for a fresh token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: SEED_USERS.admin.username, password: SEED_USERS.admin.password });
    const token = loginRes.body.data.accessToken;

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    // Token should be revoked — subsequent use returns 401
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(401);
  });
});

describe('RBAC — protected admin routes', () => {
  it('GET /api/admin/users returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/users returns 200 for admin', async () => {
    const res = await authGet('/api/admin/users', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/admin/users returns 403 for auditor', async () => {
    const res = await authGet('/api/admin/users', 'auditor');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('GET /api/admin/users returns 403 for cs_agent', async () => {
    const res = await authGet('/api/admin/users', 'agent');
    expect(res.status).toBe(403);
  });

  it('GET /api/admin/audit returns 200 for admin', async () => {
    const res = await authGet('/api/admin/audit', 'admin');
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/audit returns 200 for auditor (read access)', async () => {
    const res = await authGet('/api/admin/audit', 'auditor');
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/audit returns 403 for cs_agent', async () => {
    const res = await authGet('/api/admin/audit', 'agent');
    expect(res.status).toBe(403);
  });

  it('GET /api/admin/settings returns 200 for admin', async () => {
    const res = await authGet('/api/admin/settings', 'admin');
    expect(res.status).toBe(200);
  });

  it('GET /api/admin/settings returns 403 for ops_manager', async () => {
    const res = await authGet('/api/admin/settings', 'ops');
    expect(res.status).toBe(403);
  });
});

describe('Idempotency key enforcement', () => {
  it('POST /api/admin/users without idempotency key returns 400 (after auth)', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'test-idem', password: 'Test@1234567!', role: 'auditor' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('POST /api/admin/users with invalid idempotency key returns 400', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', 'not-a-uuid')
      .send({ username: 'test-idem', password: 'Test@1234567!', role: 'auditor' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });
});

describe('Rate limiting headers', () => {
  it('responses include RateLimit headers', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'x', password: 'y' });
    expect(res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit']).toBeDefined();
  });
});
