/**
 * API functional tests — /health endpoints
 */
import request from 'supertest';
import { app, loginAs } from '../helpers/setup';

describe('Health endpoints', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('GET /health/info returns 401 without token', async () => {
    const res = await request(app).get('/health/info');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('GET /health/info returns service metadata for admin', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .get('/health/info')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('campusops-backend');
    expect(typeof res.body.environment).toBe('string');
  });

  it('GET /api/unknown returns 404 JSON', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('POST /api/unknown returns structured error', async () => {
    const res = await request(app)
      .post('/api/does-not-exist')
      .send({ foo: 'bar' });
    expect([404, 400]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('no stack trace in any error response', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.body.stack).toBeUndefined();
  });
});
