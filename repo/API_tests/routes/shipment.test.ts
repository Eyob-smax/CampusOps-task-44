/**
 * API functional tests — shipments, parcels, after-sales
 * Tests auth, RBAC, idempotency, API signing, and business flows.
 */
import request from 'supertest';
import { app, authGet, authPost, authPatch, loginAs, uuid } from '../helpers/setup';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

// ---- Shipments ----

describe('GET /api/shipments', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/shipments');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.stack).toBeUndefined();
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/shipments', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 for ops_manager', async () => {
    const res = await authGet('/api/shipments', 'ops');
    expect(res.status).toBe(200);
  });

  it('returns 200 for auditor (shipment:read)', async () => {
    const res = await authGet('/api/shipments', 'auditor');
    expect(res.status).toBe(200);
  });

  it('returns 403 for supervisor', async () => {
    const res = await authGet('/api/shipments', 'supervisor');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/shipments', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .send({ fulfillmentRequestId: validUuid, carrierId: validUuid, warehouseId: validUuid });
    expect(res.status).toBe(401);
  });

  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({ fulfillmentRequestId: validUuid, carrierId: validUuid });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 403 for cs_agent (no shipment:write)', async () => {
    const res = await authPost('/api/shipments', 'agent', {
      fulfillmentRequestId: validUuid, carrierId: validUuid, warehouseId: validUuid,
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 for auditor', async () => {
    const res = await authPost('/api/shipments', 'auditor', {
      fulfillmentRequestId: validUuid, carrierId: validUuid, warehouseId: validUuid,
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/shipments/:id/status', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch(`/api/shipments/${validUuid}/status`)
      .send({ status: 'in_transit' });
    expect(res.status).toBe(401);
  });

  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .patch(`/api/shipments/${validUuid}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in_transit' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });
});

describe('POST /api/shipments/sync/:carrierId', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post(`/api/shipments/sync/${validUuid}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for cs_agent', async () => {
    const res = await authPost(`/api/shipments/sync/${validUuid}`, 'agent');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/shipments/sync-signed/:carrierId (API signing)', () => {
  it('returns 401 without API signing headers', async () => {
    const res = await request(app).post(`/api/shipments/sync-signed/${validUuid}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_API_SIGNING');
  });

  it('returns 401 with invalid API key', async () => {
    const res = await request(app)
      .post(`/api/shipments/sync-signed/${validUuid}`)
      .set('X-Api-Key', 'bad-key')
      .set('X-Timestamp', String(Date.now()))
      .set('X-Signature', 'badsig');
    expect(res.status).toBe(401);
  });
});

// ---- Parcels ----

describe('GET /api/parcels', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/parcels');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/parcels', 'admin');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/parcels', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/parcels')
      .send({ shipmentId: validUuid, trackingNumber: 'TRK001', weightLb: 2.5 });
    expect(res.status).toBe(401);
  });

  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/parcels')
      .set('Authorization', `Bearer ${token}`)
      .send({ shipmentId: validUuid, trackingNumber: 'TRK001', weightLb: 2.5 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });
});

// ---- After-Sales Tickets ----

describe('GET /api/after-sales', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/after-sales');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/after-sales', 'admin');
    expect(res.status).toBe(200);
  });

  it('returns 200 for auditor (after-sales:read)', async () => {
    const res = await authGet('/api/after-sales', 'auditor');
    expect(res.status).toBe(200);
  });

  it('returns 403 for supervisor (no after-sales:read)', async () => {
    const res = await authGet('/api/after-sales', 'supervisor');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/after-sales', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/after-sales')
      .send({ studentId: validUuid, type: 'delay', description: 'Package late' });
    expect(res.status).toBe(401);
  });

  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/after-sales')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: validUuid, type: 'delay', description: 'Package late' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 403 for ops_manager (no after-sales:create)', async () => {
    const res = await authPost('/api/after-sales', 'ops', {
      studentId: validUuid, type: 'delay', description: 'Package late',
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 with invalid ticket type', async () => {
    const res = await authPost('/api/after-sales', 'admin', {
      studentId: validUuid, type: 'unknown_type', description: 'test',
    });
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

describe('PATCH /api/after-sales/:id/status', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch(`/api/after-sales/${validUuid}/status`)
      .send({ status: 'closed' });
    expect(res.status).toBe(401);
  });
});

// ---- Evidence ----

describe('POST /api/after-sales/:id/evidence/image', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post(`/api/after-sales/${validUuid}/evidence/image`)
      .attach('file', Buffer.from('fake'), { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/after-sales/:id/evidence/text', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post(`/api/after-sales/${validUuid}/evidence/text`)
      .send({ note: 'Package was damaged' });
    expect(res.status).toBe(401);
  });
});

// ---- Compensations ----

describe('GET /api/after-sales/:id/compensations', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get(`/api/after-sales/${validUuid}/compensations`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/after-sales/:id/compensations/suggest', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post(`/api/after-sales/${validUuid}/compensations/suggest`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for ops_manager (no compensation:suggest)', async () => {
    const res = await authPost(`/api/after-sales/${validUuid}/compensations/suggest`, 'ops');
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/after-sales/:id/compensations/:cid/approve', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch(`/api/after-sales/${validUuid}/compensations/${validUuid}/approve`);
    expect(res.status).toBe(401);
  });
});

// ---- Error response structure ----

describe('Error response structure — shipment/after-sales', () => {
  const endpoints: [string, string][] = [
    ['GET', '/api/shipments'],
    ['POST', '/api/shipments'],
    ['GET', '/api/parcels'],
    ['POST', '/api/parcels'],
    ['GET', '/api/after-sales'],
    ['POST', '/api/after-sales'],
    ['GET', `/api/after-sales/${validUuid}`],
    ['PATCH', `/api/after-sales/${validUuid}/status`],
    ['GET', `/api/after-sales/${validUuid}/compensations`],
    ['POST', `/api/after-sales/${validUuid}/compensations/suggest`],
  ];

  endpoints.forEach(([method, path]) => {
    it(`${method} ${path} — no stack, success=false`, async () => {
      const req = method === 'GET'
        ? request(app).get(path)
        : method === 'PATCH'
          ? request(app).patch(path)
          : request(app).post(path);
      const res = await req;
      expect(res.body.success).toBe(false);
      expect(res.body.stack).toBeUndefined();
    });
  });
});
