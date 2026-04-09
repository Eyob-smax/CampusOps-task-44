import request from 'supertest';

async function buildApp(envOverrides?: Record<string, string>) {
  jest.resetModules();

  process.env.NODE_ENV = 'test';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-security-tests';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    process.env.TEST_DATABASE_URL ||
    'mysql://campusops:test@db:3306/campusops_test';
  process.env.REDIS_URL = process.env.REDIS_URL || process.env.TEST_REDIS_URL || 'redis://redis:6379';

  if (envOverrides) {
    Object.entries(envOverrides).forEach(([k, v]) => {
      process.env[k] = v;
    });
  }

  const { createApp } = await import('../../src/app');
  return createApp();
}

describe('Security middleware behavior', () => {
  describe('CORS allowlist', () => {
    it('returns CORS headers for allowed origin', async () => {
      const app = await buildApp({ CORS_ALLOWED_ORIGINS: 'https://allowed.local' });

      const res = await request(app)
        .options('/api/auth/login')
        .set('Origin', 'https://allowed.local')
        .set('Access-Control-Request-Method', 'POST');

      expect([200, 204]).toContain(res.status);
      expect(res.headers['access-control-allow-origin']).toBe('https://allowed.local');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not return CORS allow-origin header for disallowed origin', async () => {
      const app = await buildApp({ CORS_ALLOWED_ORIGINS: 'https://allowed.local' });

      const res = await request(app)
        .options('/api/auth/login')
        .set('Origin', 'https://evil.local')
        .set('Access-Control-Request-Method', 'POST');

      expect([200, 204]).toContain(res.status);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('TLS_REQUIRED enforcement', () => {
    it('allows /health over non-TLS path', async () => {
      const app = await buildApp({ ENFORCE_TLS: 'true' });

      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });

    it('returns 426 for non-health routes without HTTPS', async () => {
      const app = await buildApp({ ENFORCE_TLS: 'true' });

      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(426);
      expect(res.body.code).toBe('TLS_REQUIRED');
    });

    it('allows forwarded HTTPS requests to continue through auth chain', async () => {
      const app = await buildApp({ ENFORCE_TLS: 'true' });

      const res = await request(app)
        .get('/api/auth/me')
        .set('X-Forwarded-Proto', 'https');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });
});
