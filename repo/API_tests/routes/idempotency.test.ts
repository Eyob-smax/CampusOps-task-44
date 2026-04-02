/**
 * API functional tests — Idempotency enforcement across all mutating routes
 * Validates that all POST/PUT/PATCH routes require X-Idempotency-Key header.
 */
import request from 'supertest';
import { app, loginAs, uuid } from '../helpers/setup';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

describe('Idempotency key enforcement — all mutating routes', () => {
  let adminToken: string;
  let opsToken: string;

  beforeAll(async () => {
    adminToken = await loginAs('admin');
    opsToken = await loginAs('ops');
  });

  // Routes that require idempotency keys (POST/PUT/PATCH)
  const mutatingRoutes: { method: string; path: string; token: () => string; body?: object }[] = [
    // Admin users
    { method: 'POST', path: '/api/admin/users', token: () => adminToken, body: { username: 'test', password: 'Test@12345!', role: 'auditor' } },
    // Warehouses
    { method: 'POST', path: '/api/warehouses', token: () => adminToken, body: { name: 'Test WH', address: '123 St' } },
    { method: 'PUT', path: `/api/warehouses/${validUuid}`, token: () => adminToken, body: { name: 'Updated', address: '456 St' } },
    // Carriers
    { method: 'POST', path: '/api/carriers', token: () => adminToken, body: { name: 'TestCarrier', code: 'TC' } },
    { method: 'PUT', path: `/api/carriers/${validUuid}`, token: () => adminToken, body: { name: 'Updated' } },
    // Delivery zones
    { method: 'POST', path: '/api/delivery-zones', token: () => adminToken, body: { name: 'Test Zone', regionCode: 'TZ' } },
    { method: 'PUT', path: `/api/delivery-zones/${validUuid}`, token: () => adminToken, body: { name: 'Updated' } },
    // Shipping templates
    { method: 'POST', path: '/api/shipping-templates', token: () => adminToken, body: { name: 'Test', zoneId: validUuid, tier: 'standard', baseFee: 5 } },
    { method: 'PUT', path: `/api/shipping-templates/${validUuid}`, token: () => adminToken, body: { baseFee: 10 } },
    // Membership tiers
    { method: 'POST', path: '/api/membership/tiers', token: () => adminToken, body: { name: 'Test', discountPercent: 5, pointThreshold: 100, benefits: '["test"]' } },
    { method: 'PUT', path: `/api/membership/tiers/${validUuid}`, token: () => adminToken, body: { discountPercent: 10 } },
    // Coupons
    { method: 'POST', path: '/api/coupons', token: () => adminToken, body: { code: 'TEST', discountType: 'flat', discountValue: 5 } },
    { method: 'PUT', path: `/api/coupons/${validUuid}`, token: () => adminToken, body: { discountValue: 10 } },
    // Fulfillment
    { method: 'POST', path: '/api/fulfillment', token: () => adminToken, body: { studentId: validUuid, items: [{ description: 'Book', quantity: 1, unitPrice: 25 }] } },
    // Shipments
    { method: 'POST', path: '/api/shipments', token: () => adminToken, body: { fulfillmentRequestId: validUuid, carrierId: validUuid } },
    { method: 'PATCH', path: `/api/shipments/${validUuid}/status`, token: () => adminToken, body: { status: 'in_transit' } },
    // Parcels
    { method: 'POST', path: '/api/parcels', token: () => adminToken, body: { shipmentId: validUuid, trackingNumber: 'TRK001', weightLb: 2.5 } },
    // After-sales
    { method: 'POST', path: '/api/after-sales', token: () => adminToken, body: { studentId: validUuid, type: 'delay', description: 'Package late' } },
    { method: 'PATCH', path: `/api/after-sales/${validUuid}/status`, token: () => adminToken, body: { status: 'closed' } },
    // Stored value
    { method: 'POST', path: '/api/stored-value/some-student/top-up', token: () => adminToken, body: { amount: 50 } },
    { method: 'POST', path: '/api/stored-value/some-student/spend', token: () => adminToken, body: { amount: 10, description: 'test' } },
    // Thresholds
    { method: 'POST', path: '/api/thresholds', token: () => adminToken, body: { metricName: 'test', operator: 'gt', value: 90 } },
    { method: 'PUT', path: `/api/thresholds/${validUuid}`, token: () => adminToken, body: { value: 95 } },
    // Backups
    { method: 'POST', path: '/api/backups', token: () => adminToken },
    { method: 'POST', path: `/api/backups/${validUuid}/verify`, token: () => adminToken },
    // Jobs retry
    { method: 'POST', path: '/api/jobs/some-id/retry', token: () => adminToken },
    // Students
    { method: 'POST', path: '/api/students', token: () => adminToken, body: { studentNumber: 'S999', fullName: 'Test', email: 'test@test.edu' } },
  ];

  mutatingRoutes.forEach(({ method, path, token, body }) => {
    it(`${method} ${path} returns 400 without X-Idempotency-Key`, async () => {
      let req: request.Test;
      switch (method) {
        case 'POST':  req = request(app).post(path); break;
        case 'PUT':   req = request(app).put(path); break;
        case 'PATCH': req = request(app).patch(path); break;
        default:      req = request(app).post(path);
      }
      req = req.set('Authorization', `Bearer ${token()}`);
      if (body) req = req.send(body);

      const res = await req;
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
      expect(res.body.success).toBe(false);
    });
  });
});

describe('Idempotency key format validation', () => {
  it('rejects non-UUIDv4 idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', 'not-a-valid-uuid')
      .send({ name: 'Test', address: '123 St' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });

  it('accepts valid UUIDv4 idempotency key', async () => {
    const token = await loginAs('admin');
    const name = `WH-Valid-${Date.now().toString(36)}`;
    const res = await request(app)
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', uuid())
      .send({ name, address: '123 Valid St' });
    // Should not be 400 for idempotency — either 200/201 (created) or another error
    expect(res.status).not.toBe(400);
  });
});
